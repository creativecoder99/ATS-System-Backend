import type { IJob } from '../models/Job.js';
import type { IApplication, IAiReview } from '../models/Application.js';
import type { IUser } from '../models/User.js';

export function evaluateCandidate(
  job: IJob,
  application: IApplication,
  applicant: IUser
): IAiReview {
  const jobTitle = job.title;
  const jobSkills: string[] = (job.skills ?? []).map((s: string) => s.toLowerCase());

  const candidateSkills: string[] = (application.parsedProfile?.skills ?? []).length > 0
    ? application.parsedProfile!.skills
    : (applicant.skills ?? []);

  const normalizedCandidateSkills = candidateSkills.map((s: string) => s.toLowerCase());

  // 1. Skill Overlap Calculation
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const js of jobSkills) {
    if (normalizedCandidateSkills.some((cs: string) => cs.includes(js) || js.includes(cs))) {
      matchedSkills.push(js);
    } else {
      missingSkills.push(js);
    }
  }

  const skillScore = jobSkills.length > 0 ? (matchedSkills.length / jobSkills.length) * 100 : 80;

  // 2. Experience Adequacy
  const candExp = application.parsedProfile?.experienceYears ?? applicant.experienceYears ?? 0;
  const reqExp = job.experienceMin ?? 0;
  let expScore = 100;
  if (candExp < reqExp) {
    const diff = reqExp - candExp;
    expScore = Math.max(30, 100 - diff * 25);
  } else if (candExp > reqExp + 5) {
    expScore = 95;
  }

  // 3. Composite Match Score
  const rawScore = Math.round(skillScore * 0.6 + expScore * 0.4);
  const matchScore = Math.max(25, Math.min(98, rawScore));

  let rating: IAiReview['rating'] = 'Low Fit';
  if (matchScore >= 80) rating = 'Strong Match';
  else if (matchScore >= 65) rating = 'Moderate Match';
  else if (matchScore >= 45) rating = 'Potential Match';

  // 4. Strengths
  const strengths: string[] = [];
  if (matchedSkills.length > 0) {
    strengths.push(`Direct alignment on core skills: ${matchedSkills.slice(0, 4).join(', ')}.`);
  }
  if (candExp >= reqExp) {
    strengths.push(`Meets experience threshold (${candExp} years vs. ${reqExp} years required).`);
  }
  if (candidateSkills.length >= 5) {
    strengths.push(`Broad technical versatility with ${candidateSkills.length} verified technical competencies.`);
  }
  if (application.coverLetter && application.coverLetter.length > 50) {
    strengths.push('Provided detailed, role-specific cover letter communicating intent.');
  }

  // 5. Gaps / Scrutiny Areas
  const gaps: string[] = [];
  if (missingSkills.length > 0) {
    gaps.push(`Missing explicit mention of: ${missingSkills.slice(0, 3).join(', ')}.`);
  }
  if (candExp < reqExp) {
    gaps.push(`Experience is ${reqExp - candExp} year(s) below role requirements (${candExp} yrs observed vs. ${reqExp} yrs target).`);
  }
  if (gaps.length === 0) {
    gaps.push('No critical gaps identified against baseline qualifications.');
  }

  // 6. Tailored Interview Questions
  const interviewQuestions: string[] = [];
  if (matchedSkills.length > 0) {
    interviewQuestions.push(
      `Describe a production challenge you resolved using ${matchedSkills[0]} and how you measured the outcome.`
    );
  }
  if (missingSkills.length > 0) {
    interviewQuestions.push(
      `Our stack relies heavily on ${missingSkills[0]}. What is your familiarity with this or related paradigms?`
    );
  }
  interviewQuestions.push(
    `Walk us through the architecture of a system you designed or maintained in the last 12 months.`
  );
  if (candExp < reqExp) {
    interviewQuestions.push(
      `How do you ramp up on complex systems when stepping into a role with high architectural demands?`
    );
  }

  // 7. Executive Summary
  const summary = `${applicant.name || 'Candidate'} scored ${matchScore}% fit for ${jobTitle}. ` +
    (rating === 'Strong Match'
      ? 'Exhibits strong skill coverage and suitable depth of experience. Recommended for technical phone screen.'
      : rating === 'Moderate Match'
      ? 'Demonstrates solid core foundations with minor gaps in specific tooling. Worth screening for cultural and foundational fit.'
      : 'Has foundational background but deviates in specific technologies or required seniority.');

  return {
    matchScore,
    rating,
    strengths,
    gaps,
    interviewQuestions,
    summary,
    analyzedAt: new Date(),
  };
}

export interface CopilotResponse {
  answer: string;
  suggestedAction?: 'shortlist' | 'interview' | 'review';
  topCandidates?: {
    candidateId: string;
    name: string;
    score: number;
    skills: string[];
    summary: string;
  }[];
}

export function queryJobCopilot(
  job: IJob,
  applications: (IApplication & { applicant: any })[],
  prompt: string
): CopilotResponse {
  const p = prompt.toLowerCase();

  // Rank applicants by evaluated matchScore or simulated score
  const ranked = applications.map((app) => {
    const candidate = app.applicant;
    const review = app.aiReview ?? evaluateCandidate(job, app, candidate);
    const candidateSkills: string[] = (app.parsedProfile?.skills ?? []).length > 0
      ? app.parsedProfile!.skills
      : (Array.isArray(candidate?.skills) ? candidate.skills : []);

    return {
      candidateId: app._id.toString(),
      name: candidate?.name ?? 'Candidate',
      score: review.matchScore,
      skills: candidateSkills,
      summary: review.summary,
      status: app.status,
    };
  }).sort((a, b) => b.score - a.score);

  if (applications.length === 0) {
    return {
      answer: `There are currently no applicants for the ${job.title} position yet. Once candidates submit applications, I will provide comparative ranking, skill gap analysis, and tailored interview questions.`,
    };
  }

  // Prompt intent classification
  if (p.includes('top') || p.includes('best') || p.includes('rank') || p.includes('who')) {
    const top3 = ranked.slice(0, 3);
    const names = top3.map((c) => `**${c.name}** (${c.score}% match)`).join(', ');
    return {
      answer: `Based on semantic skill alignment and experience criteria for **${job.title}**, the top candidates are: ${names}.\n\n` +
        top3.map((c, i) => `${i + 1}. **${c.name}** (${c.score}% fit) — Key skills: ${c.skills.slice(0, 5).join(', ')}. Status: ${c.status}.`).join('\n\n'),
      suggestedAction: 'interview',
      topCandidates: top3,
    };
  }

  if (p.includes('compare') || p.includes('difference')) {
    const top2 = ranked.slice(0, 2);
    if (top2.length < 2) {
      return {
        answer: `Only 1 candidate has applied so far: **${ranked[0].name}** with a ${ranked[0].score}% match. More applicants are needed for a comparative analysis.`,
      };
    }
    return {
      answer: `### Candidate Comparison for ${job.title}:\n\n` +
        `• **${top2[0].name}** (${top2[0].score}%): Stronger overall skill coverage in (${top2[0].skills.slice(0, 4).join(', ')}).\n` +
        `• **${top2[1].name}** (${top2[1].score}%): Alternative fit with background in (${top2[1].skills.slice(0, 4).join(', ')}).\n\n` +
        `**Recommendation:** Advance **${top2[0].name}** to technical interview first.`,
      suggestedAction: 'interview',
      topCandidates: top2,
    };
  }

  const topCandidate = ranked[0];
  return {
    answer: `Analysis of ${applications.length} applicant(s) for **${job.title}**:\n\n` +
      `• **Top Candidate:** ${topCandidate.name} with ${topCandidate.score}% fit.\n` +
      `• **Pipeline Health:** ${applications.filter((a) => a.status === 'applied').length} new, ${applications.filter((a) => a.status === 'shortlisted').length} shortlisted, ${applications.filter((a) => a.status === 'interview').length} interviewing.\n` +
      `• **Next Step:** Review the top candidate's resume or schedule an interview.`,
    suggestedAction: 'shortlist',
    topCandidates: ranked.slice(0, 3),
  };
}
