import { z } from 'zod';
import { ROLES } from '../models/User.js';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Please provide a valid email'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-zA-Z]/, 'Password must contain a letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  // Nobody self-registers as an admin; that role is assigned out of band.
  role: z.enum(['candidate', 'recruiter']).default('candidate'),
  company: z.string().trim().max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please provide a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  headline: z.string().trim().max(140).optional().nullable(),
  location: z.string().trim().max(80).optional().nullable(),
  skills: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  experienceYears: z.coerce.number().min(0).max(60).optional(),
  company: z.string().trim().max(100).optional().nullable(),

  // Contact & Social
  phone: z.string().trim().max(30).optional().nullable(),
  bio: z.string().trim().max(2000).optional().nullable(),
  linkedinUrl: z.string().trim().max(250).optional().nullable(),
  portfolioUrl: z.string().trim().max(250).optional().nullable(),
  githubUrl: z.string().trim().max(250).optional().nullable(),

  // Candidate Details
  education: z.string().trim().max(250).optional().nullable(),
  currentCompany: z.string().trim().max(120).optional().nullable(),
  currentRole: z.string().trim().max(120).optional().nullable(),

  // Recruiter Details
  designation: z.string().trim().max(120).optional().nullable(),
  companyWebsite: z.string().trim().max(250).optional().nullable(),
  industry: z.string().trim().max(80).optional().nullable(),
  companySize: z.string().trim().max(50).optional().nullable(),
  officeAddress: z.string().trim().max(250).optional().nullable(),
});

export const adminVerifySchema = z.object({
  status: z.enum(['verified', 'rejected', 'pending']),
  notes: z.string().trim().max(500).optional(),
});

export const roleSchema = z.enum(ROLES);

