import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import {
  Application,
  STATUS_TRANSITIONS,
  type ApplicationStatus,
} from '../models/Application.js';
import { Job, type IJob } from '../models/Job.js';
import { User, type IUser } from '../models/User.js';
import { UPLOAD_DIR } from '../middleware/upload.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { isDuplicateKeyError } from '../utils/mongoErrors.js';
import { extractTextFromFile, parseResumeText } from '../services/resumeParser.js';
import { generateEmbedding, searchJobApplicants } from '../services/semanticSearch.js';
import { evaluateCandidate, queryJobCopilot } from '../services/aiAssistant.js';
import { sendNotification } from './notification.controller.js';

/**
 * Async background worker to extract text, structure profile JSON, redact PII,
 * compute semantic vector embedding, and run initial AI evaluation.
 */
async function processResumeAsync(
  applicationId: string,
  resumeFilename: string,
  applicantId: string,
  jobId: string
): Promise<void> {
  try {
    const filePath = path.join(UPLOAD_DIR, path.basename(resumeFilename));
    const rawText = await extractTextFromFile(filePath);
    const applicant = await User.findById(applicantId).select('name skills headline experienceYears');
    const job = await Job.findById(jobId);

    const { parsedProfile, redactedProfile } = parseResumeText(rawText, {
      name: applicant?.name,
      skills: applicant?.skills,
      headline: applicant?.headline,
      experienceYears: applicant?.experienceYears,
    });

    const combinedText = `${rawText} ${parsedProfile.skills.join(' ')} ${parsedProfile.summary} ${applicant?.headline ?? ''}`;
    const embedding = generateEmbedding(combinedText);

    let aiReview;
    if (job && applicant) {
      aiReview = evaluateCandidate(job, { parsedProfile } as any, applicant as any);
    }

    await Application.updateOne(
      { _id: applicationId },
      {
        $set: {
          parsedProfile,
          redactedProfile,
          embedding,
          ...(aiReview ? { aiReview } : {}),
        },
      }
    );
  } catch (err) {
    console.error(`[asyncResumeProcessing] failed for app ${applicationId}:`, err);
  }
}

/**
 * POST /api/jobs/:id/apply — candidate applies, optionally uploading a resume.
 */
export const applyToJob = asyncHandler(async (req: Request, res: Response) => {
  const jobId = req.params.id;
  const userId = req.user!.id;

  const job = await Job.findById(jobId);
  if (!job) throw ApiError.notFound('Job not found');
  if (job.status !== 'open') throw ApiError.badRequest('This job is no longer accepting applications');

  const resumeUrl = await resolveResumeUrl(req, userId);

  let application;
  try {
    application = await Application.create({
      job: job._id,
      applicant: userId,
      resumeUrl,
      coverLetter: req.body.coverLetter,
      history: [{ status: 'applied', at: new Date() }],
    });
  } catch (err) {
    await discardUpload(req);
    if (isDuplicateKeyError(err)) {
      throw ApiError.conflict('You have already applied to this job');
    }
    throw err;
  }

  // Atomically increment applicant counter
  await Job.updateOne({ _id: job._id }, { $inc: { applicantCount: 1 } });

  // Fire async background resume extraction & semantic indexing
  setImmediate(() => {
    processResumeAsync(application._id.toString(), resumeUrl, userId, job._id.toString());
    sendNotification(
      job.postedBy.toString(),
      'application_received',
      'New Application Received',
      `A new candidate submitted an application for ${job.title}`,
      `/jobs/${job._id}/applicants`
    );
  });

  res.status(201).json({ success: true, data: application });
});

/** GET /api/applications/mine — the candidate's own applications. */
export const listMyApplications = asyncHandler(async (req: Request, res: Response) => {
  const { status, page, limit } = req.query as unknown as {
    status?: ApplicationStatus;
    page: number;
    limit: number;
  };

  const filter = { applicant: req.user!.id, ...(status ? { status } : {}) };

  const [applications, total] = await Promise.all([
    Application.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('job', 'title company location type workMode status salaryMin salaryMax')
      .lean(),
    Application.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: applications,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/** GET /api/jobs/:id/applications — recruiter views the pipeline for one job. */
export const listJobApplications = asyncHandler(async (req: Request, res: Response) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound('Job not found');
  assertOwnsJob(job.postedBy.toString(), req);

  const { status, page, limit } = req.query as unknown as {
    status?: ApplicationStatus;
    page: number;
    limit: number;
  };

  const filter = { job: job._id, ...(status ? { status } : {}) };

  const [applications, total] = await Promise.all([
    Application.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('applicant', 'name email headline location skills experienceYears')
      .lean(),
    Application.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: applications,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/** PATCH /api/applications/:id/status — recruiter advances or rejects a candidate. */
export const updateApplicationStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status, note } = req.body as { status: ApplicationStatus; note?: string };

  const application = await Application.findById(req.params.id).populate('job', 'postedBy title');
  if (!application) throw ApiError.notFound('Application not found');

  const job = application.job as unknown as { postedBy: { toString(): string }; title: string };
  assertOwnsJob(job.postedBy.toString(), req);

  const allowed = STATUS_TRANSITIONS[application.status];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(
      allowed.length === 0
        ? `This application is already ${application.status} and cannot be changed`
        : `Cannot move an application from ${application.status} to ${status}. Allowed: ${allowed.join(', ')}`,
    );
  }

  application.status = status;
  application.history.push({ status, at: new Date(), note });
  await application.save();

  // Notify candidate of status update
  sendNotification(
    application.applicant.toString(),
    'status_update',
    'Application Status Updated',
    `Your application for "${job.title}" has been updated to: ${status}`,
    '/my-applications'
  );

  res.json({ success: true, data: application });
});

/** DELETE /api/applications/:id — candidate withdraws their own application. */
export const withdrawApplication = asyncHandler(async (req: Request, res: Response) => {
  const application = await Application.findById(req.params.id);
  if (!application) throw ApiError.notFound('Application not found');

  if (application.applicant.toString() !== req.user!.id) {
    throw ApiError.forbidden('You can only withdraw your own applications');
  }
  if (application.status === 'offered') {
    throw ApiError.badRequest('You cannot withdraw an application that has an offer');
  }

  await application.deleteOne();
  // Keep the denormalised counter honest, and floored at zero.
  await Job.updateOne(
    { _id: application.job, applicantCount: { $gt: 0 } },
    { $inc: { applicantCount: -1 } },
  );

  res.json({ success: true, message: 'Application withdrawn' });
});

/** GET /api/applications/:id/resume — streams the resume to download. */
export const downloadResume = asyncHandler(async (req: Request, res: Response) => {
  const application = await Application.findById(req.params.id).populate('job', 'postedBy');
  if (!application) throw ApiError.notFound('Application not found');

  const job = application.job as unknown as { postedBy: { toString(): string } };
  const isApplicant = application.applicant.toString() === req.user!.id;
  const isRecruiter = job.postedBy.toString() === req.user!.id;
  if (!isApplicant && !isRecruiter && req.user!.role !== 'admin') {
    throw ApiError.forbidden('You do not have access to this resume');
  }

  const filePath = path.join(UPLOAD_DIR, path.basename(application.resumeUrl));
  try {
    await fs.access(filePath);
  } catch {
    throw ApiError.notFound('Resume file is no longer available');
  }

  res.download(filePath);
});

/** GET /api/applications/:id/resume/view — displays resume inline in browser preview. */
export const viewResume = asyncHandler(async (req: Request, res: Response) => {
  const application = await Application.findById(req.params.id).populate('job', 'postedBy');
  if (!application) throw ApiError.notFound('Application not found');

  const job = application.job as unknown as { postedBy: { toString(): string } };
  const isApplicant = application.applicant.toString() === req.user!.id;
  const isRecruiter = job.postedBy.toString() === req.user!.id;
  if (!isApplicant && !isRecruiter && req.user!.role !== 'admin') {
    throw ApiError.forbidden('You do not have access to this resume');
  }

  const filePath = path.join(UPLOAD_DIR, path.basename(application.resumeUrl));
  try {
    await fs.access(filePath);
  } catch {
    throw ApiError.notFound('Resume file is no longer available');
  }

  const ext = path.extname(filePath).toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === '.pdf') contentType = 'application/pdf';
  else if (ext === '.txt') contentType = 'text/plain';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(application.resumeUrl)}"`);
  const stream = createReadStream(filePath);
  stream.pipe(res);
});

/** POST /api/applications/:id/ai-eval — evaluate candidate against job requirements. */
export const evaluateApplicantController = asyncHandler(async (req: Request, res: Response) => {
  const application = await Application.findById(req.params.id)
    .populate('job')
    .populate('applicant');
  if (!application) throw ApiError.notFound('Application not found');

  const job = application.job as unknown as IJob;
  assertOwnsJob(job.postedBy.toString(), req);

  const applicant = application.applicant as unknown as IUser;
  const aiReview = evaluateCandidate(job, application, applicant);

  application.aiReview = aiReview;
  await application.save();

  res.json({ success: true, data: aiReview });
});

/** GET /api/jobs/:id/applicants/search — semantic or keyword search across applicants. */
export const searchApplicantsController = asyncHandler(async (req: Request, res: Response) => {
  const jobId = req.params.id;
  const query = (req.query.query as string) ?? '';
  const mode = (req.query.mode as 'keyword' | 'semantic') ?? 'semantic';

  const results = await searchJobApplicants(jobId, query, mode, req.user!.id, req.user!.role);
  res.json({ success: true, data: results });
});

/** POST /api/jobs/:id/ai-assistant — interactive AI copilot for recruiter. */
export const askJobCopilotController = asyncHandler(async (req: Request, res: Response) => {
  const jobId = req.params.id;
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') throw ApiError.badRequest('Prompt is required');

  const job = await Job.findById(jobId);
  if (!job) throw ApiError.notFound('Job not found');
  assertOwnsJob(job.postedBy.toString(), req);

  const applications = await Application.find({ job: job._id })
    .populate('applicant', 'name email headline skills experienceYears')
    .lean();

  const response = queryJobCopilot(job, applications as any, prompt);
  res.json({ success: true, data: response });
});

async function resolveResumeUrl(req: Request, userId: string): Promise<string> {
  if (req.file) return req.file.filename;

  if (req.body.useProfileResume) {
    const user = await User.findById(userId).select('resumeUrl');
    if (!user?.resumeUrl) {
      throw ApiError.badRequest('No resume saved on your profile — upload one with this application');
    }
    return user.resumeUrl;
  }

  throw ApiError.badRequest('A resume is required to apply');
}

/** Removes an orphaned upload when the application it belonged to was not created. */
async function discardUpload(req: Request): Promise<void> {
  if (!req.file) return;
  await fs.unlink(req.file.path).catch(() => {
    /* the file may already be gone; nothing to recover here */
  });
}

function assertOwnsJob(ownerId: string, req: Request): void {
  if (ownerId !== req.user!.id && req.user!.role !== 'admin') {
    throw ApiError.forbidden('You can only manage applications for jobs you posted');
  }
}
