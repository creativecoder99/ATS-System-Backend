import type { Request, Response } from 'express';
import type { FilterQuery } from 'mongoose';
import { Job, type IJob } from '../models/Job.js';
import { Application } from '../models/Application.js';
import { SavedJob } from '../models/SavedJob.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/jobs — public, filterable, paginated listing.
 *
 * Runs the filtered fetch and the total count concurrently; they hit the same
 * index and are independent, so awaiting them in sequence would just double
 * the latency of every page load.
 */
export const listJobs = asyncHandler(async (req: Request, res: Response) => {
  const { q, location, type, workMode, skills, minSalary, maxExperience, page, limit, sort } =
    req.query as unknown as {
      q?: string;
      location?: string;
      type?: string;
      workMode?: string;
      skills?: string[];
      minSalary?: number;
      maxExperience?: number;
      page: number;
      limit: number;
      sort: 'newest' | 'oldest' | 'salary' | 'relevance';
    };

  const filter: FilterQuery<IJob> = { status: 'open' };

  if (q) filter.$text = { $search: q };
  // Anchored, case-insensitive prefix match so "bang" finds "Bangalore" and
  // the query can still use an index rather than scanning every document.
  if (location) filter.location = { $regex: `^${escapeRegex(location)}`, $options: 'i' };
  if (type) filter.type = type;
  if (workMode) filter.workMode = workMode;
  if (skills?.length) filter.skills = { $in: skills.map((s) => new RegExp(`^${escapeRegex(s)}$`, 'i')) };
  if (minSalary !== undefined) filter.salaryMax = { $gte: minSalary };
  if (maxExperience !== undefined) filter.experienceMin = { $lte: maxExperience };

  const sortMap = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    salary: { salaryMax: -1 },
    // Text relevance only exists when a $text search is actually running.
    relevance: q ? { score: { $meta: 'textScore' } } : { createdAt: -1 },
  } as const;

  const projection = q && sort === 'relevance' ? { score: { $meta: 'textScore' } } : {};

  const [jobs, total] = await Promise.all([
    Job.find(filter, projection)
      .sort(sortMap[sort] as Record<string, 1 | -1>)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('postedBy', 'name company')
      .lean(),
    Job.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: jobs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
});

/** GET /api/jobs/:id — adds per-viewer flags when the caller is signed in. */
export const getJob = asyncHandler(async (req: Request, res: Response) => {
  const job = await Job.findById(req.params.id).populate('postedBy', 'name company email').lean();
  if (!job) throw ApiError.notFound('Job not found');

  let hasApplied = false;
  let isSaved = false;

  if (req.user) {
    const [application, saved] = await Promise.all([
      Application.exists({ job: job._id, applicant: req.user.id }),
      SavedJob.exists({ job: job._id, user: req.user.id }),
    ]);
    hasApplied = Boolean(application);
    isSaved = Boolean(saved);
  }

  res.json({ success: true, data: { ...job, hasApplied, isSaved } });
});

/** POST /api/jobs — recruiters only. */
export const createJob = asyncHandler(async (req: Request, res: Response) => {
  const job = await Job.create({ ...req.body, postedBy: req.user!.id });
  res.status(201).json({ success: true, data: job });
});

/** PATCH /api/jobs/:id — owner or admin only. */
export const updateJob = asyncHandler(async (req: Request, res: Response) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound('Job not found');
  assertCanManage(job, req);

  Object.assign(job, req.body);
  await job.save();
  res.json({ success: true, data: job });
});

/** DELETE /api/jobs/:id — removes the job and every application attached to it. */
export const deleteJob = asyncHandler(async (req: Request, res: Response) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound('Job not found');
  assertCanManage(job, req);

  // Clean up dependents so the database is not left with applications
  // pointing at a job that no longer exists.
  await Promise.all([
    Application.deleteMany({ job: job._id }),
    SavedJob.deleteMany({ job: job._id }),
  ]);
  await job.deleteOne();

  res.json({ success: true, message: 'Job and related applications deleted' });
});

/** GET /api/jobs/mine — the signed-in recruiter's own postings. */
export const listMyJobs = asyncHandler(async (req: Request, res: Response) => {
  const jobs = await Job.find({ postedBy: req.user!.id }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: jobs });
});

function assertCanManage(job: IJob, req: Request): void {
  const isOwner = job.postedBy.toString() === req.user!.id;
  if (!isOwner && req.user!.role !== 'admin') {
    throw ApiError.forbidden('You can only manage jobs you posted');
  }
}

/** Escapes user input before it is interpolated into a RegExp. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
