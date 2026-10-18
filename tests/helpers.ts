import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { Job } from '../src/models/Job.js';
import type { Role } from '../src/models/User.js';

export const app: Express = createApp();

export const PASSWORD = 'Password123';

let counter = 0;
const uniqueEmail = (prefix: string) => `${prefix}${++counter}-${Date.now()}@example.com`;

export interface TestUser {
  id: string;
  email: string;
  token: string;
  auth: string;
}

/** Registers a user through the real API and returns their access token. */
export async function makeUser(role: Role = 'candidate'): Promise<TestUser> {
  const email = uniqueEmail(role);
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: `Test ${role}`, email, password: PASSWORD, role });

  if (res.status !== 201) {
    throw new Error(`Failed to create ${role}: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const token = res.body.data.accessToken as string;
  return { id: res.body.data.user._id, email, token, auth: `Bearer ${token}` };
}

export function jobPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Full Stack Developer',
    company: 'TechCorp',
    description: 'We are looking for a MERN developer to build and ship features end to end.',
    location: 'Bangalore',
    workMode: 'hybrid',
    type: 'full-time',
    skills: ['React', 'Node.js', 'MongoDB'],
    salaryMin: 800000,
    salaryMax: 1400000,
    experienceMin: 1,
    openings: 2,
    ...overrides,
  };
}

/** Creates a job directly in the DB, bypassing the API, for arranging test state. */
export async function seedJob(postedBy: string, overrides: Record<string, unknown> = {}) {
  return Job.create({ ...jobPayload(overrides), postedBy });
}
