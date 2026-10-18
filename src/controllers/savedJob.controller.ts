import type { Request, Response } from 'express';
import { SavedJob } from '../models/SavedJob.js';
import { Job } from '../models/Job.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { isDuplicateKeyError } from '../utils/mongoErrors.js';

/** POST /api/jobs/:id/save — idempotent bookmark. */
export const saveJob = asyncHandler(async (req: Request, res: Response) => {
  if (!(await Job.exists({ _id: req.params.id }))) throw ApiError.notFound('Job not found');

  try {
    await SavedJob.create({ job: req.params.id, user: req.user!.id });
  } catch (err) {
    // Already saved — treat as success rather than an error the UI must handle.
    if (!isDuplicateKeyError(err)) throw err;
  }

  res.status(201).json({ success: true, message: 'Job saved' });
});

/** DELETE /api/jobs/:id/save — remove a bookmark. */
export const unsaveJob = asyncHandler(async (req: Request, res: Response) => {
  const result = await SavedJob.deleteOne({ job: req.params.id, user: req.user!.id });
  if (result.deletedCount === 0) throw ApiError.notFound('That job was not in your saved list');
  res.json({ success: true, message: 'Job removed from saved list' });
});

/** GET /api/jobs/saved — the candidate's bookmarked jobs. */
export const listSavedJobs = asyncHandler(async (req: Request, res: Response) => {
  const saved = await SavedJob.find({ user: req.user!.id })
    .sort({ createdAt: -1 })
    .populate('job')
    .lean();

  // A bookmark can outlive the job it points at; drop those rather than
  // sending nulls the client would have to defend against.
  const jobs = saved.map((s) => s.job).filter(Boolean);
  res.json({ success: true, data: jobs });
});
