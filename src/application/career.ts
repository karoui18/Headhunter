import { addBusinessDays } from 'date-fns';
import type { Application, CandidateProfile, Contact, Job, Salary } from '../domain/model';
export function prepareApplication(job: Job, profile: CandidateProfile): Application {
  const ranked = profile.resumeVersions
    .map((r) => ({
      r,
      n: [
        r.roleFamily,
        ...profile.skills.filter((s) => r.content.toLowerCase().includes(s.toLowerCase())),
      ].filter(
        (s) =>
          job.descriptionText.toLowerCase().includes(s.toLowerCase()) ||
          job.title.toLowerCase().includes(s.toLowerCase()),
      ).length,
    }))
    .sort((a, b) => b.n - a.n);
  const resume = ranked[0]?.r,
    highlightedSkills = profile.skills.filter((s) =>
      job.descriptionText.toLowerCase().includes(s.toLowerCase()),
    );
  const blockers = [
    ...(!resume ? ['Add a resume in Profile'] : []),
    ...(!profile.headline ? ['Complete your factual profile'] : []),
    'Review the package before applying',
  ];
  return {
    id: crypto.randomUUID(),
    jobId: job.id,
    stage: 'PREPARING',
    resumeVersionId: resume?.id,
    summary: profile.headline || 'Add your verified professional summary in Profile.',
    coverLetter: `Hello,\n\nI am interested in the ${job.title} position at ${job.company}.${profile.headline ? ' ' + profile.headline + '.' : ''}${highlightedSkills.length ? ' My relevant skills include ' + highlightedSkills.join(', ') + '.' : ''}\n\nI would welcome the opportunity to discuss the role.\n\nBest regards,\nOlfa`,
    highlightedSkills,
    readinessScore: resume && profile.headline ? 80 : 20,
    blockers,
    notes: '',
    interviewEvents: [],
    updatedAt: new Date().toISOString(),
  };
}
export function contactQueries(job: Job) {
  return ['Talent Acquisition', 'Hiring Manager', 'Team Director', 'Internal Referral'].map(
    (persona) => ({
      persona,
      query: `"${job.company}" "${job.title}" "${persona}"`,
      url:
        'https://www.google.com/search?q=' +
        encodeURIComponent(`"${job.company}" "${job.title}" "${persona}"`),
    }),
  );
}
export function outreach(contact: Contact, job: Job | undefined, profile: CandidateProfile) {
  return `Hello ${contact.name},\n\n${contact.status === 'CONTACTED' ? 'I wanted to follow up on my earlier message. ' : ''}I am interested in ${job ? `the ${job.title} role at ${job.company}` : `opportunities at ${contact.company}`}.${profile.headline ? ' ' + profile.headline + '.' : ''} ${contact.relationship === 'POTENTIAL_REFERRAL' ? 'Would you be open to a brief conversation about the team and referral process?' : 'Would you be available to discuss the role and team priorities?'}\n\nBest regards,\nOlfa`;
}
export function followUpDate(appliedAt: string, days = 6) {
  return addBusinessDays(new Date(appliedAt), days).toISOString();
}
export interface SalaryBenchmark {
  market: string;
  roleFamily: string;
  min: number;
  max: number;
  currency: string;
  sourceUrl: string;
  sourceDate: string;
}
export function estimateSalary(job: Job, benchmarks: SalaryBenchmark[]): Salary | undefined {
  if (job.compensation) return job.compensation;
  const b = benchmarks.find(
    (b) =>
      job.location.toLowerCase().includes(b.market.toLowerCase()) &&
      job.title.toLowerCase().includes(b.roleFamily.toLowerCase()),
  );
  if (!b) return;
  return {
    source: 'MARKET_ESTIMATE',
    currency: b.currency,
    min: b.min,
    max: b.max,
    midpoint: (b.min + b.max) / 2,
    period: 'YEAR',
    confidence: 0.4,
    evidence: [b.sourceUrl, `Benchmark dated ${b.sourceDate}; no unverified adjustments`],
    generatedAt: new Date().toISOString(),
  };
}
