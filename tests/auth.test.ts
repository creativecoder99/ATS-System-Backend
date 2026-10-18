import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, PASSWORD, makeUser } from './helpers.js';
import { User } from '../src/models/User.js';

describe('POST /api/auth/register', () => {
  it('creates a candidate and returns an access token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Abhinav',
      email: 'new-user@example.com',
      password: PASSWORD,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('new-user@example.com');
    expect(res.body.data.user.role).toBe('candidate');
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('never returns the password hash', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Abhinav', email: 'hash@example.com', password: PASSWORD });

    expect(res.body.data.user.password).toBeUndefined();
  });

  it('stores the password hashed, not in plain text', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Abhinav', email: 'hashed@example.com', password: PASSWORD });

    const user = await User.findOne({ email: 'hashed@example.com' }).select('+password');
    expect(user!.password).not.toBe(PASSWORD);
    expect(user!.password).toMatch(/^\$2[aby]\$/);
  });

  it('sets an httpOnly refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Abhinav', email: 'cookie@example.com', password: PASSWORD });

    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('hd_refresh=') && c.includes('HttpOnly'))).toBe(true);
  });

  it('rejects a duplicate email with 409', async () => {
    const payload = { name: 'Abhinav', email: 'dupe@example.com', password: PASSWORD };
    await request(app).post('/api/auth/register').send(payload);
    const res = await request(app).post('/api/auth/register').send(payload);

    expect(res.status).toBe(409);
  });

  it('rejects a weak password with a field-level message', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Abhinav', email: 'weak@example.com', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('password');
  });

  it('refuses to let a user self-register as admin', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Sneaky', email: 'admin-try@example.com', password: PASSWORD, role: 'admin' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token for valid credentials', async () => {
    const user = await makeUser('candidate');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const user = await makeUser('candidate');

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'WrongPassword123' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Identical wording, so the endpoint cannot be used to enumerate accounts.
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the signed-in user', async () => {
    const user = await makeUser('recruiter');
    const res = await request(app).get('/api/auth/me').set('Authorization', user.auth);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(user.email);
  });

  it('rejects a request with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a tampered token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues a new access token from the refresh cookie', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ name: 'Abhinav', email: 'refresh@example.com', password: PASSWORD });

    const res = await agent.post('/api/auth/refresh');

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('rejects a refresh with no cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/auth/me', () => {
  it('updates the profile', async () => {
    const user = await makeUser('candidate');
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', user.auth)
      .send({ headline: 'MERN developer', skills: ['React', 'Node.js'], experienceYears: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.headline).toBe('MERN developer');
    expect(res.body.data.skills).toEqual(['React', 'Node.js']);
  });
});
