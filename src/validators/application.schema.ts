import { z } from 'zod';
import { APPLICATION_STATUS } from '../models/Application.js';

export const applySchema = z.object({
  coverLetter: z.string().trim().max(3000).optional(),
  // Candidates who already have a resume on their profile can reuse it
  // instead of re-uploading a file with every application.
  useProfileResume: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export const updateStatusSchema = z.object({
  status: z.enum(APPLICATION_STATUS),
  note: z.string().trim().max(500).optional(),
});

export const listApplicationsSchema = z.object({
  status: z.enum(APPLICATION_STATUS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
