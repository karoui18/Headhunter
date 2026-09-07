import DOMPurify from 'dompurify';
import { z } from 'zod';
import { jobSchema, safeUrl, salarySchema, type Job } from '../domain/model';
import { parseRemote, parseSalary, parseTravel } from '../domain/intelligence';
export const inputSchema = z.object({
  title: z.string().trim().min(1).max(500),
  company: z.string().trim().min(1).max(500),
  location: z.string().default('Unknown'),
  description: z.string().min(1).max(250000),
  url: safeUrl,
  externalId: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
  fixture: z.boolean().optional(),
  compensation: salarySchema.optional(),
  remoteMode: z.enum(['REMOTE', 'REMOTE_FIRST', 'HYBRID', 'ONSITE']).optional(),
});
export type JobInput = z.infer<typeof inputSchema>;
const clean = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
export async function normalizeJob(input: unknown, source = 'manual'): Promise<Job> {
  const raw = inputSchema.parse(input);
  const url = new URL(raw.url);
  for (const k of [...url.searchParams.keys()])
    if (/^(utm_|ref$|source$)/.test(k)) url.searchParams.delete(k);
  url.hash = '';
  const html = DOMPurify.sanitize(raw.description, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  const descriptionText = html.replace(/\s+/g, ' ').trim();
  const identity = [raw.company, raw.title, raw.location].map(clean).join('|');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  const fingerprint = Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const t = (raw.title + ' ' + descriptionText).toLowerCase(),
    now = new Date().toISOString();
  const domains = [
    'capital markets',
    'financial services',
    'transformation',
    'aml',
    'kyc',
    'regulatory',
    'fintech',
    'consulting',
    'operations',
    'banking',
  ].filter((v) => t.includes(v));
  const skills = [
    'agile',
    'scrum',
    'sql',
    'python',
    'leadership',
    'product',
    'strategy',
    'stakeholder management',
    'project management',
    'operations',
    'pmp',
  ].filter((v) => t.includes(v));
  const intl = descriptionText
    .split(/[.!]/)
    .filter((s) => /global|international|EMEA|APAC|cross.border|multi.country/i.test(s));
  return jobSchema.parse({
    id: crypto.randomUUID(),
    fingerprint,
    sourceIds: [{ source, externalId: raw.externalId || fingerprint, url: url.toString() }],
    url: url.toString(),
    title: raw.title,
    normalizedTitle: clean(raw.title),
    company: raw.company,
    location: raw.location,
    descriptionText,
    discoveredAt: now,
    lastSeenAt: now,
    publishedAt: raw.publishedAt,
    remotePolicy: (() => {
      const policy = parseRemote(descriptionText);
      return raw.remoteMode && policy.mode === 'UNKNOWN'
        ? {
            ...policy,
            mode: raw.remoteMode,
            confidence: 0.9,
            evidence: [...policy.evidence, `Source explicitly lists ${raw.remoteMode}`],
          }
        : policy;
    })(),
    travelRequirement: parseTravel(descriptionText),
    compensation: parseSalary(descriptionText) || raw.compensation,
    requirements: descriptionText
      .split(/[.!]/)
      .filter((s) => /must|required|preferred|experience/i.test(s))
      .map((s) => ({
        text: s.trim(),
        importance: /must|required/i.test(s)
          ? 'MANDATORY'
          : /preferred/i.test(s)
            ? 'PREFERRED'
            : 'UNKNOWN',
      })),
    skills,
    domains,
    languages: ['English', 'French', 'German', 'Arabic', 'Spanish'].filter((l) =>
      t.includes(l.toLowerCase()),
    ),
    seniority: /director|head of/i.test(t)
      ? 'Director'
      : /senior|lead|principal/i.test(t)
        ? 'Senior'
        : /junior|intern/i.test(t)
          ? 'Junior'
          : 'Unknown',
    internationalScope: {
      score: intl.length ? 80 : 0,
      regions: ['EMEA', 'APAC', 'Europe', 'Americas'].filter((r) => t.includes(r.toLowerCase())),
      evidence: intl,
    },
    status: 'QUEUED',
    fixture: raw.fixture || false,
  });
}
