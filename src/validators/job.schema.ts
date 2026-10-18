import { z } from 'zod';
import { JOB_TYPES, WORK_MODES, JOB_STATUS } from '../models/Job.js';

export const createJobSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  company: z.string().trim().min(2).max(100),
  description: z.string().trim().min(30, 'Describe the role in at least 30 characters').max(8000),
  location: z.string().trim().min(2).max(80),
  workMode: z.enum(WORK_MODES).default('on-site'),
  type: z.enum(JOB_TYPES).default('full-time'),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  salaryMin: z.coerce.number().min(0).default(0),
  salaryMax: z.coerce.number().min(0).default(0),
  experienceMin: z.coerce.number().min(0).max(40).default(0),
  openings: z.coerce.number().int().min(1).max(999).default(1),
});

export const updateJobSchema = createJobSchema.partial().extend({
  status: z.enum(JOB_STATUS).optional(),
});

/**
 * Query params arrive as strings, so everything numeric is coerced here and
 * controllers can treat these as real numbers.
 */
export const listJobsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  location: z.string().trim().max(80).optional(),
  type: z.enum(JOB_TYPES).optional(),
  workMode: z.enum(WORK_MODES).optional(),
  status: z.enum(JOB_STATUS).optional(),
  skills: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined)),
  minSalary: z.coerce.number().min(0).optional(),
  maxExperience: z.coerce.number().min(0).max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Capped so a client cannot ask for the whole collection in one request.
  limit: z.coerce.number().int().min(1).max(50).default(10),
  sort: z.enum(['newest', 'oldest', 'salary', 'relevance']).default('newest'),
});

export const objectIdSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
});
