import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, makeUser, seedJob } from './helpers.js';
import { Job } from '../src/models/Job.js';
import { Application } from '../src/models/Application.js';

const RESUME = Buffer.from('%PDF-1.4 fake resume for tests');

function applyTo(jobId: string, auth: string) {
  return request(app)
    .post(`/api/jobs/${jobId}/apply`)
    .set('Authorization', auth)
    .attach('resume', RESUME, { filename: 'resume.pdf', contentType: 'application/pdf' });
}

describe('POST /api/jobs/:id/apply', () => {
  it('lets a candidate apply with a resume', async () => {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const job = await seedJob(recruiter.id);

    const res = await applyTo(job._id.toString(), candidate.auth);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('applied');
    expect(res.body.data.history).toHaveLength(1);
  });

  it('increments the denormalised applicant counter', async () => {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const job = await seedJob(recruiter.id);

    await applyTo(job._id.toString(), candidate.auth);

    const updated = await Job.findById(job._id);
    expect(updated!.applicantCount).toBe(1);
  });

  it('blocks a duplicate application with 409', async () => {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const job = await seedJob(recruiter.id);

    await applyTo(job._id.toString(), candidate.auth);
    const second = await applyTo(job._id.toString(), candidate.auth);

    expect(second.status).toBe(409);
    // The failed attempt must not inflate the counter.
    const updated = await Job.findById(job._id);
    expect(updated!.applicantCount).toBe(1);
  });

  it('rejects an application to a closed job', async () => {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const job = await seedJob(recruiter.id, { status: 'closed' });

    const res = await applyTo(job._id.toString(), candidate.auth);

    expect(res.status).toBe(400);
  });

  it('forbids a recruiter from applying', async () => {
    const recruiter = await makeUser('recruiter');
    const job = await seedJob(recruiter.id);

    const res = await applyTo(job._id.toString(), recruiter.auth);

    expect(res.status).toBe(403);
  });

  it('rejects a non-document upload', async () => {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const job = await seedJob(recruiter.id);

    const res = await request(app)
      .post(`/api/jobs/${job._id}/apply`)
      .set('Authorization', candidate.auth)
      .attach('resume', Buffer.from('not a resume'), {
        filename: 'virus.exe',
        contentType: 'application/x-msdownload',
      });

    expect(res.status).toBe(400);
  });

  it('requires a resume', async () => {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const job = await seedJob(recruiter.id);

    const res = await request(app)
      .post(`/api/jobs/${job._id}/apply`)
      .set('Authorization', candidate.auth)
      .field('coverLetter', 'Please consider me');

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/applications/:id/status', () => {
  async function setup() {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const job = await seedJob(recruiter.id);
    const applied = await applyTo(job._id.toString(), candidate.auth);
    return { recruiter, candidate, job, applicationId: applied.body.data._id as string };
  }

  it('advances a candidate through the pipeline and records history', async () => {
    const { recruiter, applicationId } = await setup();

    const res = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', recruiter.auth)
      .send({ status: 'shortlisted', note: 'Strong MERN portfolio' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('shortlisted');
    expect(res.body.data.history).toHaveLength(2);
    expect(res.body.data.history[1].note).toBe('Strong MERN portfolio');
  });

  it('refuses an illegal jump from applied straight to offered', async () => {
    const { recruiter, applicationId } = await setup();

    const res = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', recruiter.auth)
      .send({ status: 'offered' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Cannot move an application/);
  });

  it('refuses to reopen a rejected application', async () => {
    const { recruiter, applicationId } = await setup();
    await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', recruiter.auth)
      .send({ status: 'rejected' });

    const res = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', recruiter.auth)
      .send({ status: 'shortlisted' });

    expect(res.status).toBe(400);
  });

  it("forbids a recruiter from touching another recruiter's pipeline", async () => {
    const { applicationId } = await setup();
    const outsider = await makeUser('recruiter');

    const res = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', outsider.auth)
      .send({ status: 'shortlisted' });

    expect(res.status).toBe(403);
  });

  it('forbids a candidate from promoting themselves', async () => {
    const { candidate, applicationId } = await setup();

    const res = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', candidate.auth)
      .send({ status: 'shortlisted' });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/applications/mine', () => {
  it('returns only the candidate\'s own applications', async () => {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const other = await makeUser('candidate');
    const jobA = await seedJob(recruiter.id, { title: 'Job A' });
    const jobB = await seedJob(recruiter.id, { title: 'Job B' });

    await applyTo(jobA._id.toString(), candidate.auth);
    await applyTo(jobB._id.toString(), other.auth);

    const res = await request(app)
      .get('/api/applications/mine')
      .set('Authorization', candidate.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].job.title).toBe('Job A');
  });
});

describe('GET /api/jobs/:id/applications', () => {
  it('lets the owning recruiter see applicants', async () => {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const job = await seedJob(recruiter.id);
    await applyTo(job._id.toString(), candidate.auth);

    const res = await request(app)
      .get(`/api/jobs/${job._id}/applications`)
      .set('Authorization', recruiter.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].applicant.email).toBe(candidate.email);
  });

  it('forbids a different recruiter from seeing them', async () => {
    const recruiter = await makeUser('recruiter');
    const outsider = await makeUser('recruiter');
    const job = await seedJob(recruiter.id);

    const res = await request(app)
      .get(`/api/jobs/${job._id}/applications`)
      .set('Authorization', outsider.auth);

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/applications/:id', () => {
  it('lets a candidate withdraw and decrements the counter', async () => {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const job = await seedJob(recruiter.id);
    const applied = await applyTo(job._id.toString(), candidate.auth);

    const res = await request(app)
      .delete(`/api/applications/${applied.body.data._id}`)
      .set('Authorization', candidate.auth);

    expect(res.status).toBe(200);
    expect(await Application.countDocuments()).toBe(0);
    const updated = await Job.findById(job._id);
    expect(updated!.applicantCount).toBe(0);
  });

  it("forbids withdrawing someone else's application", async () => {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const other = await makeUser('candidate');
    const job = await seedJob(recruiter.id);
    const applied = await applyTo(job._id.toString(), candidate.auth);

    const res = await request(app)
      .delete(`/api/applications/${applied.body.data._id}`)
      .set('Authorization', other.auth);

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/jobs/:id cascade', () => {
  it('removes applications belonging to the deleted job', async () => {
    const recruiter = await makeUser('recruiter');
    const candidate = await makeUser('candidate');
    const job = await seedJob(recruiter.id);
    await applyTo(job._id.toString(), candidate.auth);

    await request(app).delete(`/api/jobs/${job._id}`).set('Authorization', recruiter.auth);

    expect(await Application.countDocuments({ job: job._id })).toBe(0);
  });
});
