import mongoose from 'mongoose';
import type { Request, Response } from 'express';
import { Application, APPLICATION_STATUS } from '../models/Application.js';
import { Job } from '../models/Job.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/stats/recruiter — dashboard numbers for the signed-in recruiter.
 *
 * Everything is computed in MongoDB rather than by pulling documents into Node
 * and counting them there: the pipelines below return a handful of rows no
 * matter how many applications exist.
 */
export const recruiterStats = asyncHandler(async (req: Request, res: Response) => {
  const recruiterId = new mongoose.Types.ObjectId(req.user!.id);

  const [jobTotals, pipeline, topJobs, trend] = await Promise.all([
    // One pass over the recruiter's jobs, bucketed by status.
    Job.aggregate<{ _id: string; count: number; applicants: number }>([
      { $match: { postedBy: recruiterId } },
      { $group: { _id: '$status', count: { $sum: 1 }, applicants: { $sum: '$applicantCount' } } },
    ]),

    // Applications across all of this recruiter's jobs, grouped by stage.
    Application.aggregate<{ _id: string; count: number }>([
      {
        $lookup: {
          from: 'jobs',
          localField: 'job',
          foreignField: '_id',
          as: 'job',
          // Filter inside the lookup so unrelated jobs never enter the pipeline.
          pipeline: [{ $match: { postedBy: recruiterId } }, { $project: { _id: 1 } }],
        },
      },
      { $match: { 'job.0': { $exists: true } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    Job.find({ postedBy: recruiterId })
      .sort({ applicantCount: -1 })
      .limit(5)
      .select('title company applicantCount status')
      .lean(),

    // Applications per day for the last 30 days, for the dashboard chart.
    Application.aggregate<{ _id: string; count: number }>([
      {
        $lookup: {
          from: 'jobs',
          localField: 'job',
          foreignField: '_id',
          as: 'job',
          pipeline: [{ $match: { postedBy: recruiterId } }, { $project: { _id: 1 } }],
        },
      },
      { $match: { 'job.0': { $exists: true }, createdAt: { $gte: daysAgo(30) } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const openJobs = jobTotals.find((t) => t._id === 'open')?.count ?? 0;
  const closedJobs = jobTotals.find((t) => t._id === 'closed')?.count ?? 0;
  const totalApplicants = jobTotals.reduce((sum, t) => sum + t.applicants, 0);

  res.json({
    success: true,
    data: {
      totals: {
        jobs: openJobs + closedJobs,
        openJobs,
        closedJobs,
        applicants: totalApplicants,
      },
      // Zero-fill so the UI always renders every stage, not just non-empty ones.
      pipeline: fillStatuses(pipeline),
      topJobs,
      // Likewise for the chart: the aggregation only emits days that had at
      // least one application, so a quiet month would render as two or three
      // enormous bars instead of a sparse 30-day series.
      trend: fillDays(trend, 30),
    },
  });
});

/** GET /api/stats/candidate — dashboard numbers for the signed-in candidate. */
export const candidateStats = asyncHandler(async (req: Request, res: Response) => {
  const applicantId = new mongoose.Types.ObjectId(req.user!.id);

  const [byStatus, recent] = await Promise.all([
    Application.aggregate<{ _id: string; count: number }>([
      { $match: { applicant: applicantId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Application.find({ applicant: applicantId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('job', 'title company location')
      .lean(),
  ]);

  const pipeline = fillStatuses(byStatus);
  const total = byStatus.reduce((sum, s) => sum + s.count, 0);
  const advanced = pipeline.shortlisted + pipeline.interview + pipeline.offered;

  res.json({
    success: true,
    data: {
      totals: {
        applications: total,
        // Share of applications that got past the initial screen.
        responseRate: total === 0 ? 0 : Math.round((advanced / total) * 100),
      },
      pipeline,
      recent,
    },
  });
});

function fillStatuses(rows: { _id: string; count: number }[]): Record<string, number> {
  const base = Object.fromEntries(APPLICATION_STATUS.map((s) => [s, 0]));
  for (const row of rows) base[row._id] = row.count;
  return base;
}

/**
 * Expands a sparse day-bucketed aggregation into a continuous series ending
 * today, so the chart has one slot per day whether or not anything happened.
 */
function fillDays(rows: { _id: string; count: number }[], days: number) {
  const counts = new Map(rows.map((r) => [r._id, r.count]));
  const series: { _id: string; count: number }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    // Matches the $dateToString format used in the pipeline above.
    const key = date.toISOString().slice(0, 10);
    series.push({ _id: key, count: counts.get(key) ?? 0 });
  }

  return series;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}
