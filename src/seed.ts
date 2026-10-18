/**
 * Populates the database with a realistic demo dataset.
 *
 *   npm run seed           # wipes and reseeds
 *
 * Every account uses the password "Password123" so the app is easy to demo.
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from './config/db.js';
import { User } from './models/User.js';
import { Job } from './models/Job.js';
import { Application } from './models/Application.js';
import { SavedJob } from './models/SavedJob.js';

const PASSWORD = 'Password123';

const RECRUITERS = [
  { name: 'Priya Nair', email: 'priya@techcorp.in', company: 'TechCorp India' },
  { name: 'Rahul Mehta', email: 'rahul@finstack.io', company: 'FinStack' },
  { name: 'Ananya Rao', email: 'ananya@cloudbridge.dev', company: 'CloudBridge' },
];

const CANDIDATES = [
  {
    name: 'Abhinav Tarigoppula',
    email: 'abhinav@example.com',
    headline: 'Final-year CSE (AI/ML) · Full-stack developer',
    location: 'Visakhapatnam',
    skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'MongoDB', 'Express', 'Python'],
    experienceYears: 1,
  },
  {
    name: 'Sneha Kulkarni',
    email: 'sneha@example.com',
    headline: 'Frontend engineer · React & TypeScript',
    location: 'Pune',
    skills: ['React', 'TypeScript', 'CSS', 'Next.js'],
    experienceYears: 3,
  },
  {
    name: 'Karthik Iyer',
    email: 'karthik@example.com',
    headline: 'Backend developer · Node & Postgres',
    location: 'Bangalore',
    skills: ['Node.js', 'Express', 'PostgreSQL', 'Docker'],
    experienceYears: 4,
  },
  {
    name: 'Divya Sharma',
    email: 'divya@example.com',
    headline: 'MERN stack developer',
    location: 'Hyderabad',
    skills: ['MongoDB', 'Express', 'React', 'Node.js'],
    experienceYears: 2,
  },
];

const JOB_TEMPLATES = [
  {
    title: 'Full Stack Developer (MERN)',
    description:
      'Build and ship features across our React frontend and Node/Express backend. You will design REST APIs, model data in MongoDB, and own features end to end — from schema design through deployment. We care about clean, tested code and clear communication more than years of experience.',
    location: 'Bangalore',
    workMode: 'hybrid' as const,
    type: 'full-time' as const,
    skills: ['React', 'Node.js', 'MongoDB', 'Express', 'TypeScript'],
    salaryMin: 800000,
    salaryMax: 1400000,
    experienceMin: 1,
    openings: 3,
  },
  {
    title: 'Frontend Engineer — React',
    description:
      'Own the component library and design system powering our customer dashboard. You will work closely with design to build accessible, responsive interfaces, and drive frontend performance work including bundle size and render optimisation.',
    location: 'Pune',
    workMode: 'remote' as const,
    type: 'full-time' as const,
    skills: ['React', 'TypeScript', 'CSS', 'Testing Library'],
    salaryMin: 900000,
    salaryMax: 1600000,
    experienceMin: 2,
    openings: 2,
  },
  {
    title: 'Backend Developer Intern',
    description:
      'Six-month internship working on our core API. You will write Express route handlers, add MongoDB indexes, and help improve our test coverage. Ideal for a final-year student who has already built something real and wants to learn how production systems are maintained.',
    location: 'Hyderabad',
    workMode: 'on-site' as const,
    type: 'internship' as const,
    skills: ['Node.js', 'Express', 'MongoDB', 'Git'],
    salaryMin: 300000,
    salaryMax: 480000,
    experienceMin: 0,
    openings: 5,
  },
  {
    title: 'Software Engineer — Platform',
    description:
      'Join the platform team building internal tooling and CI infrastructure. Strong fundamentals in data structures and systems design matter more than specific framework experience. You will work with Node, Docker, and AWS.',
    location: 'Bangalore',
    workMode: 'hybrid' as const,
    type: 'full-time' as const,
    skills: ['Node.js', 'Docker', 'AWS', 'CI/CD'],
    salaryMin: 1200000,
    salaryMax: 2200000,
    experienceMin: 3,
    openings: 1,
  },
  {
    title: 'Junior MERN Developer',
    description:
      'Entry-level role for a developer with a portfolio of real projects. You will start by fixing bugs and shipping small features, then grow into owning a service. Mentorship and code review from senior engineers is part of the role.',
    location: 'Visakhapatnam',
    workMode: 'on-site' as const,
    type: 'full-time' as const,
    skills: ['MongoDB', 'Express', 'React', 'Node.js', 'JavaScript'],
    salaryMin: 400000,
    salaryMax: 700000,
    experienceMin: 0,
    openings: 4,
  },
  {
    title: 'React Native Developer',
    description:
      'Build our cross-platform mobile app from the ground up. You will share business logic with the web client and own the release pipeline for both stores.',
    location: 'Remote',
    workMode: 'remote' as const,
    type: 'contract' as const,
    skills: ['React Native', 'TypeScript', 'REST APIs'],
    salaryMin: 1000000,
    salaryMax: 1800000,
    experienceMin: 2,
    openings: 1,
  },
  {
    title: 'Node.js Backend Engineer',
    description:
      'Design and scale the APIs behind our payments product. Expect to work on idempotency, rate limiting, retries, and observability. Experience with high-throughput systems is a plus but not required.',
    location: 'Mumbai',
    workMode: 'hybrid' as const,
    type: 'full-time' as const,
    skills: ['Node.js', 'Express', 'MongoDB', 'Redis'],
    salaryMin: 1400000,
    salaryMax: 2400000,
    experienceMin: 3,
    openings: 2,
  },
  {
    title: 'QA Automation Engineer',
    description:
      'Own our end-to-end test suite and CI quality gates. You will write Playwright specs, maintain test data fixtures, and work with developers to make flaky tests a non-issue.',
    location: 'Chennai',
    workMode: 'on-site' as const,
    type: 'full-time' as const,
    skills: ['Playwright', 'JavaScript', 'CI/CD'],
    salaryMin: 700000,
    salaryMax: 1300000,
    experienceMin: 2,
    openings: 1,
  },
  {
    title: 'Web Developer Intern (Part-time)',
    description:
      'Part-time internship suited to a student in their final year. Work 20 hours a week on our marketing site and internal admin panel using React and Express.',
    location: 'Visakhapatnam',
    workMode: 'remote' as const,
    type: 'part-time' as const,
    skills: ['React', 'Express', 'HTML', 'CSS'],
    salaryMin: 180000,
    salaryMax: 300000,
    experienceMin: 0,
    openings: 3,
  },
  {
    title: 'Senior Full Stack Engineer',
    description:
      'Lead feature development across the stack and mentor a team of three. You will make architectural calls on data modelling, API design, and deployment strategy.',
    location: 'Bangalore',
    workMode: 'hybrid' as const,
    type: 'full-time' as const,
    skills: ['React', 'Node.js', 'MongoDB', 'AWS', 'System Design'],
    salaryMin: 2400000,
    salaryMax: 4000000,
    experienceMin: 5,
    openings: 1,
  },
];

async function seed() {
  await connectDB();
  console.log('[seed] clearing existing data');

  await Promise.all([
    User.deleteMany({}),
    Job.deleteMany({}),
    Application.deleteMany({}),
    SavedJob.deleteMany({}),
  ]);

  // create() (not insertMany) so the pre-save hook hashes each password.
  const recruiters = await User.create(
    RECRUITERS.map((r) => ({ ...r, password: PASSWORD, role: 'recruiter' as const })),
  );
  const candidates = await User.create(
    CANDIDATES.map((c) => ({ ...c, password: PASSWORD, role: 'candidate' as const })),
  );
  const admin = await User.create({
    name: 'Admin',
    email: 'admin@hiredesk.dev',
    password: PASSWORD,
    role: 'admin',
  });

  console.log(`[seed] created ${recruiters.length + candidates.length + 1} users`);

  const jobs = await Job.create(
    JOB_TEMPLATES.map((template, i) => {
      const recruiter = recruiters[i % recruiters.length];
      return {
        ...template,
        company: recruiter.company,
        postedBy: recruiter._id,
        // Spread postings over the past few weeks so "newest first" is meaningful.
        createdAt: daysAgo(i * 2 + 1),
      };
    }),
  );
  console.log(`[seed] created ${jobs.length} jobs`);

  const statuses = ['applied', 'applied', 'shortlisted', 'interview', 'rejected', 'offered'] as const;
  let applicationCount = 0;

  for (const [ci, candidate] of candidates.entries()) {
    // Each candidate applies to a different overlapping slice of the jobs.
    for (const job of jobs.slice(ci, ci + 4)) {
      const jobIndex = jobs.indexOf(job);
      const status = statuses[(ci + jobIndex) % statuses.length];
      await Application.create({
        job: job._id,
        applicant: candidate._id,
        resumeUrl: 'sample-resume.pdf',
        coverLetter: `I am very interested in the ${job.title} role at ${job.company}. My background in ${candidate.skills.slice(0, 2).join(' and ')} lines up well with what you are looking for.`,
        status,
        history: buildHistory(status),
        createdAt: daysAgo(jobIndex),
      });
      applicationCount += 1;
    }
  }

  // Recompute the denormalised counters from the truth rather than guessing.
  const counts = await Application.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $group: { _id: '$job', count: { $sum: 1 } } },
  ]);
  await Promise.all(
    counts.map((c) => Job.updateOne({ _id: c._id }, { $set: { applicantCount: c.count } })),
  );
  console.log(`[seed] created ${applicationCount} applications`);

  await SavedJob.create([
    { user: candidates[0]._id, job: jobs[4]._id },
    { user: candidates[0]._id, job: jobs[9]._id },
    { user: candidates[1]._id, job: jobs[1]._id },
  ]);

  console.log(`
[seed] done. Log in with:

  Recruiter   ${recruiters[0].email}   / ${PASSWORD}
  Candidate   ${candidates[0].email}   / ${PASSWORD}
  Admin       ${admin.email}  / ${PASSWORD}
`);

  await disconnectDB();
}

/** Builds a plausible audit trail leading up to the given final status. */
function buildHistory(status: string) {
  const order = ['applied', 'shortlisted', 'interview', 'offered'];
  const path = status === 'rejected' ? ['applied', 'rejected'] : order.slice(0, order.indexOf(status) + 1);
  return path.map((s, i) => ({ status: s as never, at: daysAgo(path.length - i) }));
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

seed().catch(async (err) => {
  console.error('[seed] failed:', err);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
