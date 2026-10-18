# HireDesk — Backend (API & Server)

The REST API and server logic for the HireDesk applicant tracking system and job portal. Built with Express, TypeScript, Mongoose, Zod validation, JWT authentication with httpOnly refresh cookies, and RBAC.

---

## Tech Stack

- **Runtime:** Node.js (`>= 20.0.0`)
- **Framework:** Express 4 (ESM modules)
- **Language:** TypeScript 5 (strict mode)
- **Database:** MongoDB via Mongoose 8 (Full-Text Search & Aggregation pipelines)
- **Validation:** Zod 3
- **Security:** Helmet, CORS, Express Rate Limit, bcryptjs
- **Auth:** Dual-token strategy (short-lived in-memory Access Token + httpOnly Refresh Cookie)
- **File Uploads:** Multer with mime-type allowlisting and randomized filename generation
- **Testing:** Vitest 4 with `mongodb-memory-server` and Supertest

---

## Folder Structure

```
backend/
├── src/
│   ├── config/          # Environment variables parsing & MongoDB connection
│   ├── controllers/     # Route handler controllers (auth, jobs, applications, stats, savedJobs)
│   ├── middleware/      # Auth, error handling, rate limiting, and Multer upload middleware
│   ├── models/          # Mongoose models & schemas (User, Job, Application, SavedJob)
│   ├── routes/          # Express route definitions
│   ├── utils/           # Helper utilities (ApiError, asyncHandler, token generators)
│   ├── validators/      # Zod validation schemas
│   ├── app.ts           # Express application setup, security middleware & routes
│   ├── index.ts         # Server bootstrapper & graceful shutdown handling
│   └── seed.ts          # Database seeder script with demo users & jobs
├── tests/               # Automated unit & integration tests
├── uploads/             # Resume storage directory (.gitkeep tracked)
├── .dockerignore        # Files excluded from Docker builds
├── .env.example         # Template environment variables
├── .gitignore           # Git ignore file for backend
├── Dockerfile           # Multi-stage production container build
├── docker-compose.yml   # Multi-container orchestration (API + MongoDB)
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── tsconfig.build.json  # TypeScript production build configuration
└── vitest.config.ts     # Vitest test configuration
```

---

## Getting Started

### Prerequisites

- **Node.js:** `>= 20.0.0`
- **MongoDB:** A running MongoDB instance locally (port 27017) or a [MongoDB Atlas free cluster](https://cloud.mongodb.com).

### 1. Installation

Navigate into the `backend` directory and install dependencies:

```bash
cd backend
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in your configuration:

| Variable | Description | Example |
|---|---|---|
| `PORT` | HTTP port to listen on | `4000` |
| `NODE_ENV` | Environment mode (`development`, `production`, `test`) | `development` |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/hiredesk` or MongoDB Atlas URI |
| `JWT_ACCESS_SECRET` | Secret key used to sign access tokens | Random 64-char string |
| `JWT_REFRESH_SECRET` | Secret key used to sign refresh tokens | Different random 64-char string |
| `ACCESS_TOKEN_TTL` | Expiry duration for access token | `15m` |
| `REFRESH_TOKEN_TTL`| Expiry duration for refresh token | `7d` |
| `CLIENT_ORIGIN` | Allowed CORS origin(s) (comma-separated for multiple) | `http://localhost:5173` |
| `MAX_UPLOAD_MB` | Maximum file upload size in MB | `5` |

> **Tip:** You can generate secure secrets using Node:
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
> ```

### 3. Seed Demo Data (Optional)

To populate the database with demo candidate, recruiter, admin accounts, and sample job postings:

```bash
npm run seed
```

**Pre-seeded Demo Accounts:**
- **Candidate:** `candidate@example.com` / `Password123!`
- **Recruiter:** `recruiter@example.com` / `Password123!`
- **Admin:** `admin@example.com` / `Password123!`

### 4. Run Development Server

```bash
npm run dev
```

The server will start at: **`http://localhost:4000`**

### 5. Run Tests

```bash
npm run test
```

Tests run against an in-memory MongoDB instance (`mongodb-memory-server`), requiring no external database.

### 6. Build for Production

```bash
npm run build
```

Compiled JavaScript files are generated into the `dist/` directory.

To start the production server:

```bash
npm start
```

---

## Deployment Guide

### Deploying to Render (Web Service)

1. Create a **New Web Service** on Render.
2. Connect your Git repository.
3. Configure the service:
   - **Root Directory:** `backend`
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
4. Set Environment Variables in Render:
   - `NODE_ENV`: `production`
   - `PORT`: `4000` (or leave default assigned by Render)
   - `MONGO_URI`: Your MongoDB Atlas connection URI
   - `JWT_ACCESS_SECRET`: Long random secret string
   - `JWT_REFRESH_SECRET`: Long random secret string
   - `CLIENT_ORIGIN`: Your deployed frontend URL (e.g. `https://your-frontend.vercel.app`)
5. Click **Deploy**.

> **Important for Cross-Domain Cookies:**
> When `NODE_ENV=production`, the refresh cookie is automatically configured with `sameSite: 'none'` and `secure: true`. Make sure both frontend and backend are served over HTTPS in production.

### Deploying with Docker / Docker Compose

You can build and run the backend container standalone:

```bash
docker build -t hiredesk-backend .
docker run -p 4000:4000 --env-file .env hiredesk-backend
```

Or run API + MongoDB together with Docker Compose:

```bash
docker compose up -d
```
