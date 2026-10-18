import { Application } from '../models/Application.js';
import { Job } from '../models/Job.js';
import { ApiError } from '../utils/ApiError.js';

// High-frequency semantic token dictionaries across core software engineering domains
const VOCABULARY = [
  // Languages & Core
  'javascript', 'typescript', 'python', 'java', 'golang', 'rust', 'c++', 'c#', 'sql', 'nosql',
  // Frontend
  'react', 'nextjs', 'vue', 'angular', 'svelte', 'tailwind', 'css', 'html', 'frontend', 'ui', 'ux',
  // Backend & APIs
  'node', 'express', 'nestjs', 'django', 'fastapi', 'spring', 'rest', 'graphql', 'grpc', 'api', 'backend',
  // Databases & Caching
  'mongodb', 'postgres', 'mysql', 'redis', 'elasticsearch', 'dynamodb', 'database', 'schema', 'aggregation',
  // Cloud & DevOps
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'ci', 'cd', 'terraform', 'cloud', 'linux', 'devops', 'microservices',
  // Architecture & Engineering
  'architecture', 'system', 'scalability', 'performance', 'security', 'distributed', 'concurrency', 'testing',
  // Seniority & Leadership
  'lead', 'senior', 'staff', 'principal', 'junior', 'intern', 'mentor', 'management', 'collaborative',
  // Workflow & Tools
  'git', 'github', 'jira', 'agile', 'scrum', 'code review', 'optimization', 'refactoring',
  // AI & Data
  'ai', 'ml', 'llm', 'machine learning', 'deep learning', 'nlp', 'data science', 'vector', 'embedding',
  // Mobile
  'mobile', 'react native', 'flutter', 'ios', 'android', 'swift', 'kotlin'
];

const DIMENSION = 128;

/**
 * Generates a normalized dense vector embedding (length 128) based on semantic n-grams,
 * term frequency, and subword hash projection.
 */
export function generateEmbedding(text: string): number[] {
  const vec = new Float64Array(DIMENSION);
  const normalized = text.toLowerCase().replace(/[^a-z0-9#+ ]/g, ' ');
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 1);

  if (tokens.length === 0) return Array.from(vec);

  // 1. Vocabulary matching with semantic weights
  for (let i = 0; i < VOCABULARY.length; i++) {
    const vocabWord = VOCABULARY[i];
    const escaped = vocabWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[^a-zA-Z0-9#+])${escaped}([^a-zA-Z0-9#+]|$)`, 'i');
    if (regex.test(normalized)) {
      const idx = i % DIMENSION;
      vec[idx] += 2.0;
      // Spread activation to neighboring dimensions to capture semantic proximity
      vec[(idx + 1) % DIMENSION] += 0.5;
      vec[(idx + DIMENSION - 1) % DIMENSION] += 0.5;
    }
  }

  // 2. Hash projection for arbitrary terms and n-grams
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    let hash = 0;
    for (let c = 0; c < token.length; c++) {
      hash = (hash * 31 + token.charCodeAt(c)) >>> 0;
    }
    const bucket = hash % DIMENSION;
    vec[bucket] += 1.0;

    // Bigrams
    if (i < tokens.length - 1) {
      const bigram = `${token} ${tokens[i + 1]}`;
      let biHash = 0;
      for (let c = 0; c < bigram.length; c++) {
        biHash = (biHash * 37 + bigram.charCodeAt(c)) >>> 0;
      }
      vec[biHash % DIMENSION] += 1.5;
    }
  }

  // 3. L2 Normalization so dot product == cosine similarity
  let sumSq = 0;
  for (let i = 0; i < DIMENSION; i++) {
    sumSq += vec[i] * vec[i];
  }

  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < DIMENSION; i++) {
      vec[i] /= norm;
    }
  }

  return Array.from(vec);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  // Clamp to [0, 1] range for intuitive match percentage
  return Math.max(0, Math.min(1, dot));
}

export interface SearchApplicantResult {
  application: any;
  score: number; // 0 to 100
  matchedSkills: string[];
  matchSummary: string;
}

export async function searchJobApplicants(
  jobId: string,
  query: string,
  mode: 'keyword' | 'semantic' = 'semantic',
  ownerId: string,
  userRole?: string
): Promise<SearchApplicantResult[]> {
  const job = await Job.findById(jobId);
  if (!job) throw ApiError.notFound('Job not found');

  if (job.postedBy.toString() !== ownerId && userRole !== 'admin') {
    throw ApiError.forbidden('You can only search applicants for jobs you posted');
  }

  const applications = await Application.find({ job: job._id })
    .populate('applicant', 'name email headline location skills experienceYears')
    .select('+embedding')
    .lean();

  if (applications.length === 0) return [];

  const cleanQuery = query.trim().toLowerCase();
  const queryEmbedding = generateEmbedding(cleanQuery);
  const queryTokens = cleanQuery.split(/[\s,]+/).filter((t) => t.length > 1);

  const results: SearchApplicantResult[] = [];

  for (const app of applications) {
    const applicant = app.applicant as any;
    const combinedApplicantText = [
      applicant?.name ?? '',
      applicant?.headline ?? '',
      applicant?.skills ?? '',
      (app.parsedProfile?.skills ?? []).join(' '),
      app.parsedProfile?.summary ?? '',
      app.coverLetter ?? '',
    ].join(' ');

    const candidateSkills = (app.parsedProfile?.skills ?? []).length > 0
      ? app.parsedProfile!.skills
      : (applicant?.skills ?? '').split(/[\s,]+/).filter(Boolean);

    const matchedSkills = candidateSkills.filter((s: string) =>
      cleanQuery.includes(s.toLowerCase()) || queryTokens.some((qt) => s.toLowerCase().includes(qt))
    );

    let score = 0;

    if (mode === 'keyword') {
      // Keyword matching frequency and presence
      let matches = 0;
      for (const token of queryTokens) {
        if (combinedApplicantText.toLowerCase().includes(token)) {
          matches++;
        }
      }
      score = queryTokens.length > 0 ? Math.round((matches / queryTokens.length) * 100) : 0;
    } else {
      // Semantic mode: compute cosine similarity with vector embedding
      let appVec = app.embedding;
      if (!appVec || appVec.length === 0) {
        appVec = generateEmbedding(combinedApplicantText);
      }
      const similarity = cosineSimilarity(queryEmbedding, appVec);
      score = Math.round(similarity * 100);

      // Boost score if explicit skill match was found
      if (matchedSkills.length > 0) {
        score = Math.min(100, Math.round(score * 0.7 + (matchedSkills.length * 15) * 0.3));
      }
    }

    let matchSummary = '';
    if (score >= 80) {
      matchSummary = `High relevance match. Matched key competencies: ${matchedSkills.slice(0, 4).join(', ') || 'Direct domain profile'}.`;
    } else if (score >= 50) {
      matchSummary = `Moderate fit. Shares overlapping background in ${matchedSkills.slice(0, 3).join(', ') || 'related software domain'}.`;
    } else {
      matchSummary = `Partial match based on broad query criteria.`;
    }

    results.push({
      application: app,
      score,
      matchedSkills,
      matchSummary,
    });
  }

  // Sort descending by match score
  results.sort((a, b) => b.score - a.score);

  return results;
}
