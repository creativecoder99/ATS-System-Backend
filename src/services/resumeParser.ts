import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import type { IParsedProfile, IRedactedProfile } from '../models/Application.js';

// Comprehensive technical and professional skill catalog
const KNOWN_SKILLS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Golang', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'SQL',
  'React', 'React.js', 'React Native', 'Next.js', 'Vue', 'Vue.js', 'Angular', 'Svelte',
  'Node.js', 'Express', 'Express.js', 'NestJS', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'ASP.NET',
  'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Elasticsearch', 'DynamoDB', 'Cassandra', 'SQLite', 'Prisma', 'Mongoose',
  'AWS', 'Amazon Web Services', 'Azure', 'GCP', 'Google Cloud', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'GitHub Actions', 'Jenkins',
  'GraphQL', 'REST', 'RESTful APIs', 'gRPC', 'WebSockets', 'Microservices', 'Kafka', 'RabbitMQ',
  'Tailwind', 'Tailwind CSS', 'SASS', 'HTML5', 'CSS3', 'Bootstrap',
  'Git', 'Linux', 'Bash', 'Playwright', 'Jest', 'Vitest', 'Cypress', 'Pytest',
  'Machine Learning', 'Deep Learning', 'PyTorch', 'TensorFlow', 'LLMs', 'NLP', 'Data Science', 'Pandas', 'NumPy',
  'System Design', 'Agile', 'Scrum', 'Jira', 'Figma'
];

export async function extractTextFromFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === '.pdf') {
      const buffer = await fs.readFile(filePath);
      const parser = new PDFParse({ data: buffer });
      const textResult = await parser.getText();
      const text = typeof textResult === 'string' ? textResult : (textResult as any)?.text ?? '';
      if (text.trim().length > 20) {
        return text;
      }
    }
  } catch (err) {
    console.warn(`[resumeParser] pdf extraction fallback for ${filePath}:`, (err as Error).message);
  }

  // Fallback: Read as text if pdf-parse failed or if file is text/doc-like
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const printable = raw.replace(/[^\x20-\x7E\t\r\n]/g, ' ');
    if (printable.trim().length > 20) {
      return printable;
    }
  } catch {
    // Ignore read failure
  }

  return '';
}

export function parseResumeText(
  rawText: string,
  candidateFallback?: {
    name?: string;
    skills?: string[] | string;
    headline?: string;
    experienceYears?: number;
  }
): { parsedProfile: IParsedProfile; redactedProfile: IRedactedProfile } {
  const fallbackSkillsStr = Array.isArray(candidateFallback?.skills)
    ? candidateFallback.skills.join(' ')
    : (candidateFallback?.skills ?? '');

  const combinedText = `${rawText}\n${fallbackSkillsStr}\n${candidateFallback?.headline ?? ''}`;

  // 1. Skill extraction
  const detectedSkills = new Set<string>();

  for (const skill of KNOWN_SKILLS) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[^a-zA-Z0-9#+])${escaped}([^a-zA-Z0-9#+]|$)`, 'i');
    if (regex.test(combinedText)) {
      const cleanSkill = skill.replace(/\.js$/i, '').trim();
      detectedSkills.add(cleanSkill);
    }
  }

  // Also include explicitly provided user skills
  if (Array.isArray(candidateFallback?.skills)) {
    candidateFallback.skills.forEach((s) => {
      if (s && s.trim().length > 1) detectedSkills.add(s.trim());
    });
  } else if (candidateFallback?.skills) {
    candidateFallback.skills.split(/[\s,]+/).forEach((s) => {
      if (s.trim().length > 1) detectedSkills.add(s.trim());
    });
  }

  const skillsList = Array.from(detectedSkills).slice(0, 30);

  // 2. Experience years detection
  let detectedExpYears = candidateFallback?.experienceYears ?? 0;
  const expMatch = combinedText.match(/(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)/i);
  if (expMatch && expMatch[1]) {
    const parsed = parseInt(expMatch[1], 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 40) {
      detectedExpYears = Math.max(detectedExpYears, parsed);
    }
  }

  // Date range detection (e.g. 2019 - Present or 2018 - 2023)
  const currentYear = new Date().getFullYear();
  const yearRanges = combinedText.matchAll(/(20\d{2}|19\d{2})\s*[-–—to]+\s*(present|current|20\d{2})/gi);
  let computedYearsFromRanges = 0;
  for (const match of yearRanges) {
    const start = parseInt(match[1], 10);
    const endStr = match[2].toLowerCase();
    const end = endStr === 'present' || endStr === 'current' ? currentYear : parseInt(endStr, 10);
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      computedYearsFromRanges += end - start;
    }
  }
  if (computedYearsFromRanges > 0 && computedYearsFromRanges <= 40) {
    detectedExpYears = Math.max(detectedExpYears, computedYearsFromRanges);
  }

  // 3. Education extraction
  const degrees: string[] = [];
  const eduPatterns = [
    /B\.?Tech|Bachelor of Technology|B\.?E\.?|Bachelor of Engineering/i,
    /M\.?Tech|Master of Technology|M\.?E\.?/i,
    /B\.?S\.?|B\.?Sc\.?|Bachelor of Science/i,
    /M\.?S\.?|M\.?Sc\.?|Master of Science/i,
    /Ph\.?D|Doctor of Philosophy/i,
    /M\.?B\.?A|Master of Business Administration/i,
    /Computer Science|Information Technology|Data Science|Software Engineering/i,
  ];

  for (const pattern of eduPatterns) {
    const match = combinedText.match(pattern);
    if (match) {
      degrees.push(match[0].trim());
    }
  }

  // 4. Summary generation
  let summary = '';
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 25);
  if (lines.length > 0) {
    summary = lines.slice(0, 3).join(' ');
    if (summary.length > 350) summary = `${summary.slice(0, 347)}...`;
  } else if (candidateFallback?.headline) {
    summary = candidateFallback.headline;
  } else {
    summary = `Candidate with ${detectedExpYears} year(s) of experience in ${skillsList.slice(0, 4).join(', ') || 'software development'}.`;
  }

  // 5. Redaction for blind recruitment
  const anonymizedNum = Math.abs(
    (combinedText.length * 31 + (candidateFallback?.name?.length ?? 5) * 17) % 9000
  ) + 1000;
  const anonymizedId = `Candidate #${anonymizedNum}`;

  let redactedSummary = summary;
  if (candidateFallback?.name) {
    const nameParts = candidateFallback.name.split(/\s+/);
    nameParts.forEach((part) => {
      if (part.length > 1) {
        redactedSummary = redactedSummary.replace(new RegExp(`\\b${part}\\b`, 'gi'), '[Candidate]');
      }
    });
  }
  redactedSummary = redactedSummary
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[Contact Redacted]')
    .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[Phone Redacted]')
    .replace(/https?:\/\/\S+/g, '[Link Redacted]')
    .replace(/\b(he|she|him|her|his|hers)\b/gi, 'they');

  const parsedProfile: IParsedProfile = {
    skills: skillsList,
    experienceYears: detectedExpYears,
    education: degrees,
    summary,
    rawTextSnippet: rawText.slice(0, 500),
    parsedAt: new Date(),
  };

  const redactedProfile: IRedactedProfile = {
    anonymizedId,
    skills: skillsList,
    experienceYears: detectedExpYears,
    educationDegrees: degrees,
    summary: redactedSummary,
  };

  return { parsedProfile, redactedProfile };
}
