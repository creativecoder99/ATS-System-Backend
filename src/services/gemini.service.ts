import type { IJob } from '../models/Job.js';
import type { IApplication } from '../models/Application.js';
import type { IUser } from '../models/User.js';

export interface RecruiterAiCandidateResult {
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  jobId: string;
  score: number;
  skills: string[];
  experienceYears: number;
  location: string;
  strengths: string[];
  verdict: string;
}

export interface RecruiterAiResponse {
  answer: string;
  topCandidates: RecruiterAiCandidateResult[];
  suggestedAction?: 'interview' | 'shortlist' | 'review';
  usedLlm: boolean;
}

export interface CandidateAiJobResult {
  jobId: string;
  title: string;
  company: string;
  location: string;
  workMode: string;
  type: string;
  salaryRange: string;
  score: number;
  matchReasons: string[];
  experienceRequirement: string;
  requiredSkills: string[];
}

export interface CandidateAiResponse {
  answer: string;
  recommendedJobs: CandidateAiJobResult[];
  tips?: string[];
  usedLlm: boolean;
}

const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

/**
 * Universal caller to Google Gemini API using native Node.js fetch with fallback across models.
 */
async function callGeminiLlm(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0 || apiKey.includes('your_actual')) {
    return null;
  }

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[Gemini] ${model} returned status ${response.status}:`, errorText.slice(0, 150));
        continue;
      }

      const json = (await response.json()) as any;
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return text;
      }
    } catch (err) {
      console.warn(`[Gemini] Error calling ${model}:`, err instanceof Error ? err.message : err);
    }
  }

  return null;
}

/**
 * Recruiter AI Assistant: Searches and evaluates the best candidates from all applied candidates.
 */
export async function queryRecruiterAssistant(
  prompt: string,
  jobs: IJob[],
  applications: (IApplication & { applicant: IUser; job: IJob })[]
): Promise<RecruiterAiResponse> {
  if (applications.length === 0) {
    return {
      answer: `There are currently no applicant submissions recorded across your active postings yet. Once candidates submit applications, I will provide comparative candidate ranking, skill verification, and interview recommendation scorecards.`,
      topCandidates: [],
      suggestedAction: 'review',
      usedLlm: false,
    };
  }

  // Prepare sanitized candidate summaries for LLM prompt context
  const candidateSummaries = applications.map((app) => {
    const applicant = (app.applicant as unknown as IUser) || ({} as any);
    const job = (app.job as unknown as IJob) || ({} as any);
    const parsed = (app.parsedProfile as any) || {};

    const skills = (parsed.skills?.length ? parsed.skills : applicant.skills || []) as string[];
    const exp = parsed.experienceYears ?? applicant.experienceYears ?? 0;
    const location = applicant.location || 'Not specified';

    return {
      applicationId: app._id.toString(),
      candidateName: applicant.name || 'Candidate',
      jobId: job._id ? job._id.toString() : '',
      jobTitle: job.title || 'Role',
      location,
      experienceYears: exp,
      skills: skills.slice(0, 10),
      education: parsed.education || [],
      parsedSummary: parsed.summary || applicant.headline || '',
      coverLetter: app.coverLetter ? app.coverLetter.slice(0, 200) : '',
      status: app.status,
    };
  });


  const systemPrompt = `You are HireHive AI, an objective, calibrated ATS hiring copilot built on structured evaluation rubrics (similar to Greenhouse).
Your job is to analyze candidate applications against job requirements and recruiter instructions.
Assess candidates strictly on competencies, demonstrable skills, experience depth, and role alignment without bias.

Always return a valid JSON object matching this schema:
{
  "answer": "string (A concise, well-structured markdown summary explaining the best candidates, their qualifications, strengths, and recommended hiring steps)",
  "topCandidates": [
    {
      "applicationId": "string (the exact applicationId from the candidate data)",
      "candidateName": "string",
      "jobTitle": "string",
      "jobId": "string",
      "score": number (0 to 100),
      "skills": ["string"],
      "experienceYears": number,
      "location": "string",
      "strengths": ["string (2-3 concise bullet points)"],
      "verdict": "string (e.g. 'Strong technical match with high API depth', 'Exceeds experience baseline')"
    }
  ],
  "suggestedAction": "interview" | "shortlist" | "review"
}`;

  const userPrompt = `Recruiter Query: "${prompt}"

Jobs Posted:
${jobs.map((j) => `- JobID: ${j._id}, Title: ${j.title}, Required Skills: ${j.skills.join(', ')}, Min Exp: ${j.experienceMin} yrs, Location: ${j.location}, Work Mode: ${j.workMode}`).join('\n')}

Applicants Pool (${candidateSummaries.length} candidates):
${JSON.stringify(candidateSummaries, null, 2)}

Analyze the candidates and identify the best candidate(s) for the recruiter's prompt.`;

  const llmJson = await callGeminiLlm(systemPrompt, userPrompt);
  if (llmJson) {
    try {
      const parsed = JSON.parse(llmJson);
      if (parsed && typeof parsed.answer === 'string' && Array.isArray(parsed.topCandidates)) {
        return {
          answer: parsed.answer,
          topCandidates: parsed.topCandidates,
          suggestedAction: parsed.suggestedAction || 'interview',
          usedLlm: true,
        };
      }
    } catch {
      // JSON parse error, fall back to heuristic
    }
  }

  // Heuristic Fallback
  return fallbackRecruiterRanking(prompt, jobs, applications);
}

function fallbackRecruiterRanking(
  prompt: string,
  _jobs: IJob[],
  applications: (IApplication & { applicant: IUser; job: IJob })[]
): RecruiterAiResponse {
  const p = prompt.toLowerCase();

  const ranked = applications.map((app) => {
    const applicant = (app.applicant as unknown as IUser) || ({} as any);
    const job = (app.job as unknown as IJob) || ({} as any);
    const parsed = (app.parsedProfile as any) || {};

    const skills = (parsed.skills?.length ? parsed.skills : applicant.skills || []) as string[];
    const exp = parsed.experienceYears ?? applicant.experienceYears ?? 0;
    const reqExp = job.experienceMin ?? 0;


    let score = 70;
    // Skill match check
    const matched = (job.skills || []).filter((s) =>
      skills.some((cs) => cs.toLowerCase().includes(s.toLowerCase()))
    );
    score += matched.length * 6;
    if (exp >= reqExp) score += 10;
    if (p.includes('react') && skills.some((s) => s.toLowerCase().includes('react'))) score += 8;
    if (p.includes('node') && skills.some((s) => s.toLowerCase().includes('node'))) score += 8;

    score = Math.min(98, Math.max(45, score));

    return {
      applicationId: app._id.toString(),
      candidateName: applicant.name || 'Candidate',
      jobTitle: job.title || 'Role',
      jobId: job._id ? job._id.toString() : '',
      score,
      skills,
      experienceYears: exp,
      location: applicant.location || job.location || 'Remote',
      strengths: [
        `Direct competency alignment across ${matched.slice(0, 3).join(', ') || 'core stack'}.`,
        `Demonstrated ${exp} year(s) of practical experience.`,
      ],
      verdict: score >= 80 ? 'Highly recommended for interview' : 'Solid candidate for preliminary review',
    };
  }).sort((a, b) => b.score - a.score);

  const top = ranked.slice(0, 3);
  const best = top[0];

  return {
    answer: `### Candidate Assessment Summary\n\nBased on your query **"${prompt}"**, the highest-ranked applicant is **${best?.candidateName}** (${best?.score}% match) for **${best?.jobTitle}**.\n\n` +
      top.map((c, i) => `${i + 1}. **${c.candidateName}** - ${c.score}% match (${c.experienceYears} yrs experience, ${c.skills.slice(0, 4).join(', ')})`).join('\n\n') +
      `\n\n**Recommendation:** Advance **${best?.candidateName}** to structured interview.`,
    topCandidates: top,
    suggestedAction: 'interview',
    usedLlm: false,
  };
}

/**
 * Candidate AI Assistant: Recommends matching jobs based on candidate instruction (skills, location, experience).
 */
export async function queryCandidateAdvisor(
  prompt: string,
  candidate: IUser,
  jobs: IJob[]
): Promise<CandidateAiResponse> {
  const activeJobs = jobs.filter((j) => j.status === 'open');

  if (activeJobs.length === 0) {
    return {
      answer: `There are currently no active job openings in the directory. Please check back soon or set an alert for upcoming engineering and product roles.`,
      recommendedJobs: [],
      tips: ['Update your profile headline and skills in the meantime.'],
      usedLlm: false,
    };
  }

  const candidateProfile = {
    name: candidate.name || 'Candidate',
    headline: candidate.headline || '',
    skills: candidate.skills || [],
    experienceYears: candidate.experienceYears || 0,
    location: candidate.location || '',
  };

  const jobCatalog = activeJobs.map((j) => ({
    jobId: j._id.toString(),
    title: j.title,
    company: j.company,
    location: j.location,
    workMode: j.workMode,
    type: j.type,
    skills: j.skills || [],
    experienceMin: j.experienceMin || 0,
    salaryMin: j.salaryMin || 0,
    salaryMax: j.salaryMax || 0,
    descriptionSnippet: j.description ? j.description.slice(0, 180) : '',
  }));

  const systemPrompt = `You are HireHive Career Advisor, an intelligent, empathetic AI career assistant helping job seekers discover the best roles.
Evaluate the candidate's instructions (such as "recommend all jobs related to software developer", or location-specific, experience-specific, or salary-specific requests).
Cross-reference their query and profile against the open job catalog.

Always return a valid JSON object matching this schema:
{
  "answer": "string (An encouraging, clear, formatted markdown response highlighting why these roles are recommended, addressing their exact location, experience, or domain request)",
  "recommendedJobs": [
    {
      "jobId": "string (the exact jobId from catalog)",
      "title": "string",
      "company": "string",
      "location": "string",
      "workMode": "string",
      "type": "string",
      "salaryRange": "string (e.g. '₹8L - ₹14L' or 'Competitive')",
      "score": number (0 to 100),
      "matchReasons": ["string (2-3 clear reasons why this fits their query, skills, or experience)"],
      "experienceRequirement": "string (e.g. '1+ years')",
      "requiredSkills": ["string"]
    }
  ],
  "tips": ["string (1-2 actionable tips for applying or interview prep)"]
}`;

  const userPrompt = `Candidate Request: "${prompt}"

Candidate Background:
- Name: ${candidateProfile.name}
- Current Headline: ${candidateProfile.headline || 'Software Developer'}
- Skills: ${candidateProfile.skills.join(', ') || 'React, JavaScript, Web Development'}
- Years of Experience: ${candidateProfile.experienceYears}
- Location: ${candidateProfile.location || 'Open to Remote / Relocation'}

Available Open Jobs (${jobCatalog.length} roles):
${JSON.stringify(jobCatalog, null, 2)}

Recommend the best matching roles according to the candidate's request, considering skills, location, work mode, and experience requirements.`;

  const llmJson = await callGeminiLlm(systemPrompt, userPrompt);
  if (llmJson) {
    try {
      const parsed = JSON.parse(llmJson);
      if (parsed && typeof parsed.answer === 'string' && Array.isArray(parsed.recommendedJobs)) {
        return {
          answer: parsed.answer,
          recommendedJobs: parsed.recommendedJobs,
          tips: parsed.tips || [],
          usedLlm: true,
        };
      }
    } catch {
      // JSON parse error, fall back to heuristic
    }
  }

  // Heuristic Fallback
  return fallbackCandidateRecommendations(prompt, candidate, activeJobs);
}

function fallbackCandidateRecommendations(
  prompt: string,
  candidate: IUser,
  jobs: IJob[]
): CandidateAiResponse {
  const p = prompt.toLowerCase();
  const candSkills = (candidate.skills || []).map((s) => s.toLowerCase());

  const scored = jobs.map((job) => {
    let score = 50;
    const titleLower = job.title.toLowerCase();
    const locLower = job.location.toLowerCase();


    // Query intent matching
    if (p.includes('software') || p.includes('developer') || p.includes('engineer')) {
      if (titleLower.includes('developer') || titleLower.includes('engineer')) score += 20;
    }
    if (p.includes('react') && (titleLower.includes('react') || job.skills.some((s) => s.toLowerCase().includes('react')))) {
      score += 20;
    }
    if (p.includes('node') && (titleLower.includes('node') || job.skills.some((s) => s.toLowerCase().includes('node')))) {
      score += 20;
    }
    if (p.includes('remote') && job.workMode === 'remote') score += 15;
    if (p.includes(locLower)) score += 20;

    // Skill overlap
    const matched = (job.skills || []).filter((s) =>
      candSkills.some((cs) => cs.includes(s.toLowerCase()) || s.toLowerCase().includes(cs))
    );
    score += matched.length * 6;

    // Experience appropriateness
    if ((candidate.experienceYears ?? 0) >= job.experienceMin) score += 10;

    score = Math.min(98, Math.max(40, score));

    const salaryFormatted =
      job.salaryMin && job.salaryMax
        ? `₹${Math.round(job.salaryMin / 100000)}L - ₹${Math.round(job.salaryMax / 100000)}L`
        : 'Competitive';

    return {
      jobId: job._id.toString(),
      title: job.title,
      company: job.company,
      location: job.location,
      workMode: job.workMode,
      type: job.type,
      salaryRange: salaryFormatted,
      score,
      matchReasons: [
        `Directly aligns with your search for "${prompt}".`,
        `Shares key competencies in ${matched.slice(0, 3).join(', ') || job.skills.slice(0, 3).join(', ')}.`,
        `Work mode (${job.workMode}) fits modern engineering preferences.`,
      ],
      experienceRequirement: `${job.experienceMin}+ years`,
      requiredSkills: job.skills || [],
    };
  }).sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 4);

  return {
    answer: `Here are the top active roles matching your search **"${prompt}"** based on your technical profile and requirements. These opportunities match your skill set and experience criteria:`,
    recommendedJobs: top,
    tips: [
      'Tailor your resume to highlight relevant projects for the top skills specified.',
      'Check the work mode and location before submitting to ensure it matches your lifestyle.',
    ],
    usedLlm: false,
  };
}
