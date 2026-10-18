import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, makeUser, seedJob } from './helpers.js';
import { Application } from '../src/models/Application.js';

describe('GET /api/stats/recruiter', () => {
  it('aggregates job totals and the application pipeline', async () => {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const openJob = await seedJob(recruiter.id, { title: 'Open' });
    await seedJob(recruiter.id, { title: 'Closed', status: 'closed' });

    await Application.create({
      job: openJob._id,
      applicant: candidate.id,
      resumeUrl: 'r.pdf',
      status: 'shortlisted',
    });

    const res = await request(app).get('/api/stats/recruiter').set('Authorization', recruiter.auth);

    expect(res.status).toBe(200);
    expect(res.body.data.totals).toMatchObject({ jobs: 2, openJobs: 1, closedJobs: 1 });
    expect(res.body.data.pipeline.shortlisted).toBe(1);
    // Empty stages are zero-filled so the UI can render every column.
    expect(res.body.data.pipeline.offered).toBe(0);
  });

  it('returns a continuous 30-day trend, zero-filling quiet days', async () => {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const job = await seedJob(recruiter.id);
    await Application.create({ job: job._id, applicant: candidate.id, resumeUrl: 'r.pdf' });

    const res = await request(app).get('/api/stats/recruiter').set('Authorization', recruiter.auth);
    const trend = res.body.data.trend as { _id: string; count: number }[];

    // One slot per day regardless of activity — otherwise a quiet month
    // renders as two or three enormous bars instead of a sparse series.
    expect(trend).toHaveLength(30);
    expect(trend.filter((d) => d.count === 0).length).toBe(29);
    expect(trend.at(-1)?.count).toBe(1);

    // Dates must be ascending and contiguous.
    const dates = trend.map((d) => d._id);
    expect([...dates].sort()).toEqual(dates);
  });

  it("excludes other recruiters' data", async () => {
    const recruiter = await makeUser('recruiter');
    const other = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const theirJob = await seedJob(other.id);

    await Application.create({
      job: theirJob._id,
      applicant: candidate.id,
      resumeUrl: 'r.pdf',
      status: 'interview',
    });

    const res = await request(app).get('/api/stats/recruiter').set('Authorization', recruiter.auth);

    expect(res.body.data.totals.jobs).toBe(0);
    expect(res.body.data.pipeline.interview).toBe(0);
  });

  it('forbids a candidate', async () => {
    const candidate = await makeUser('candidate');
    const res = await request(app).get('/api/stats/recruiter').set('Authorization', candidate.auth);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/stats/candidate', () => {
  it('computes a response rate from the pipeline', async () => {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const jobs = await Promise.all([
      seedJob(recruiter.id, { title: 'A' }),
      seedJob(recruiter.id, { title: 'B' }),
      seedJob(recruiter.id, { title: 'C' }),
      seedJob(recruiter.id, { title: 'D' }),
    ]);

    const statuses = ['applied', 'shortlisted', 'interview', 'rejected'] as const;
    await Promise.all(
      jobs.map((job, i) =>
        Application.create({
          job: job._id,
          applicant: candidate.id,
          resumeUrl: 'r.pdf',
          status: statuses[i],
        }),
      ),
    );

    const res = await request(app).get('/api/stats/candidate').set('Authorization', candidate.auth);

    expect(res.status).toBe(200);
    expect(res.body.data.totals.applications).toBe(4);
    // shortlisted + interview out of 4 total = 50%
    expect(res.body.data.totals.responseRate).toBe(50);
  });

  it('reports a zero response rate with no applications rather than dividing by zero', async () => {
    const candidate = await makeUser('candidate');
    const res = await request(app).get('/api/stats/candidate').set('Authorization', candidate.auth);

    expect(res.body.data.totals.applications).toBe(0);
    expect(res.body.data.totals.responseRate).toBe(0);
  });
});

describe('GET /api/health', () => {
  it('reports the database as connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('connected');
  });
});

describe('saved jobs', () => {
  it('saves, lists, and unsaves a job', async () => {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const job = await seedJob(recruiter.id);

    const saved = await request(app)
      .post(`/api/jobs/${job._id}/save`)
      .set('Authorization', candidate.auth);
    expect(saved.status).toBe(201);

    const list = await request(app).get('/api/jobs/saved').set('Authorization', candidate.auth);
    expect(list.body.data).toHaveLength(1);

    const removed = await request(app)
      .delete(`/api/jobs/${job._id}/save`)
      .set('Authorization', candidate.auth);
    expect(removed.status).toBe(200);
  });

  it('treats saving twice as a no-op instead of an error', async () => {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const job = await seedJob(recruiter.id);

    await request(app).post(`/api/jobs/${job._id}/save`).set('Authorization', candidate.auth);
    const again = await request(app)
      .post(`/api/jobs/${job._id}/save`)
      .set('Authorization', candidate.auth);

    expect(again.status).toBe(201);
    const list = await request(app).get('/api/jobs/saved').set('Authorization', candidate.auth);
    expect(list.body.data).toHaveLength(1);
  });
});
