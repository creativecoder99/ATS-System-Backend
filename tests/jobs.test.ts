import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, jobPayload, makeUser, seedJob } from './helpers.js';

describe('POST /api/jobs', () => {
  it('lets a recruiter post a job', async () => {
    const recruiter = await makeUser('recruiter');
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', recruiter.auth)
      .send(jobPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Full Stack Developer');
    expect(res.body.data.postedBy).toBe(recruiter.id);
  });

  it('forbids a candidate from posting a job', async () => {
    const candidate = await makeUser('candidate');
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', candidate.auth)
      .send(jobPayload());

    expect(res.status).toBe(403);
  });

  it('rejects a salary range where max is below min', async () => {
    const recruiter = await makeUser('recruiter');
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', recruiter.auth)
      .send(jobPayload({ salaryMin: 900000, salaryMax: 500000 }));

    expect(res.status).toBe(400);
  });
});

describe('GET /api/jobs', () => {
  it('paginates results and reports the correct totals', async () => {
    const recruiter = await makeUser('recruiter');
    for (let i = 0; i < 12; i++) {
      await seedJob(recruiter.id, { title: `Engineer ${i}` });
    }

    const res = await request(app).get('/api/jobs?page=2&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.pagination).toMatchObject({
      page: 2,
      limit: 5,
      total: 12,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('filters by job type', async () => {
    const recruiter = await makeUser('recruiter');
    await seedJob(recruiter.id, { type: 'internship', title: 'Intern role' });
    await seedJob(recruiter.id, { type: 'full-time', title: 'Full time role' });

    const res = await request(app).get('/api/jobs?type=internship');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Intern role');
  });

  it('filters by location using a case-insensitive prefix match', async () => {
    const recruiter = await makeUser('recruiter');
    await seedJob(recruiter.id, { location: 'Bangalore', title: 'Blr role' });
    await seedJob(recruiter.id, { location: 'Pune', title: 'Pune role' });

    const res = await request(app).get('/api/jobs?location=bang');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Blr role');
  });

  it('runs a full-text search across title and description', async () => {
    const recruiter = await makeUser('recruiter');
    await seedJob(recruiter.id, { title: 'Kubernetes Platform Engineer' });
    await seedJob(recruiter.id, { title: 'Graphic Designer' });

    const res = await request(app).get('/api/jobs?q=Kubernetes');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Kubernetes Platform Engineer');
  });

  it('excludes closed jobs from the public listing', async () => {
    const recruiter = await makeUser('recruiter');
    await seedJob(recruiter.id, { status: 'closed', title: 'Closed role' });
    await seedJob(recruiter.id, { title: 'Open role' });

    const res = await request(app).get('/api/jobs');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Open role');
  });

  it('caps limit so a client cannot request the whole collection', async () => {
    const res = await request(app).get('/api/jobs?limit=5000');
    expect(res.status).toBe(400);
  });

  it('filters by minimum salary', async () => {
    const recruiter = await makeUser('recruiter');
    await seedJob(recruiter.id, { title: 'Low', salaryMin: 200000, salaryMax: 400000 });
    await seedJob(recruiter.id, { title: 'High', salaryMin: 1000000, salaryMax: 2000000 });

    const res = await request(app).get('/api/jobs?minSalary=900000');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('High');
  });
});

describe('GET /api/jobs/:id', () => {
  it('returns a single job', async () => {
    const recruiter = await makeUser('recruiter');
    const job = await seedJob(recruiter.id);

    const res = await request(app).get(`/api/jobs/${job._id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Full Stack Developer');
    expect(res.body.data.hasApplied).toBe(false);
  });

  it('returns 400 for a malformed id rather than a 500', async () => {
    const res = await request(app).get('/api/jobs/not-an-object-id');
    expect(res.status).toBe(400);
  });

  it('returns 404 for an id that does not exist', async () => {
    const res = await request(app).get('/api/jobs/507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });
});

describe('PATCH & DELETE /api/jobs/:id', () => {
  it('lets the owner update their job', async () => {
    const recruiter = await makeUser('recruiter');
    const job = await seedJob(recruiter.id);

    const res = await request(app)
      .patch(`/api/jobs/${job._id}`)
      .set('Authorization', recruiter.auth)
      .send({ status: 'closed', openings: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('closed');
    expect(res.body.data.openings).toBe(5);
  });

  it("forbids a recruiter from editing another recruiter's job", async () => {
    const owner = await makeUser('recruiter');
    const other = await makeUser('recruiter');
    const job = await seedJob(owner.id);

    const res = await request(app)
      .patch(`/api/jobs/${job._id}`)
      .set('Authorization', other.auth)
      .send({ title: 'Hijacked' });

    expect(res.status).toBe(403);
  });

  it('lets an admin delete any job', async () => {
    const recruiter = await makeUser('recruiter');
    const admin = await makeUser('recruiter');
    const job = await seedJob(recruiter.id);

    // Promote to admin to exercise the override path.
    const { User } = await import('../src/models/User.js');
    await User.updateOne({ _id: admin.id }, { role: 'admin' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: admin.email, password: 'Password123' });

    const res = await request(app)
      .delete(`/api/jobs/${job._id}`)
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);

    expect(res.status).toBe(200);
  });
});

describe('GET /api/jobs/mine', () => {
  it('returns only the recruiter\'s own jobs, including closed ones', async () => {
    const recruiter = await makeUser('recruiter');
    const other = await makeUser('recruiter');
    await seedJob(recruiter.id, { title: 'Mine open' });
    await seedJob(recruiter.id, { title: 'Mine closed', status: 'closed' });
    await seedJob(other.id, { title: 'Theirs' });

    const res = await request(app).get('/api/jobs/mine').set('Authorization', recruiter.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((j: { title: string }) => j.title).sort()).toEqual([
      'Mine closed',
      'Mine open',
    ]);
  });
});
