import { z } from 'zod';
const text = z.string().max(250000);
export const safeUrl = z
  .string()
  .url()
  .refine((v) => {
    try {
      return ['https:', 'http:'].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, 'Use an HTTP or HTTPS URL');
export const statuses = [
  'NEW',
  'QUEUED',
  'SEEN',
  'SNOOZED',
  'SELECTED',
  'REJECTED',
  'APPLICATION_READY',
  'APPLIED',
  'INTERVIEW',
  'COMPANY_REJECTED',
  'WITHDRAWN',
  'OFFER',
  'ACCEPTED',
  'ARCHIVED',
] as const;
export const remoteSchema = z.object({
  mode: z.enum(['REMOTE', 'REMOTE_FIRST', 'HYBRID', 'ONSITE', 'FLEXIBLE', 'UNKNOWN']),
  scope: z.enum(['WORLDWIDE', 'EU', 'EEA', 'COUNTRY', 'REGION', 'TIMEZONE', 'CITY', 'UNKNOWN']),
  allowedCountries: z.array(z.string()).default([]),
  officeDaysPerWeek: z.number().min(0).max(7).optional(),
  officeFrequencyText: z.string().optional(),
  mandatoryOfficeDays: z.boolean().optional(),
  workFromAbroad: z.enum(['ALLOWED', 'LIMITED', 'NOT_ALLOWED', 'UNKNOWN']),
  workFromAbroadDaysPerYear: z.number().optional(),
  relocationRequired: z.boolean().optional(),
  timezoneRequirement: z.string().optional(),
  policyStability: z.enum([
    'CONTRACTUAL',
    'EXPLICIT_COMPANY_POLICY',
    'MANAGER_DISCRETION',
    'TEMPORARY',
    'UNCLEAR',
  ]),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
});
export type RemoteWorkPolicy = z.infer<typeof remoteSchema>;
export const travelSchema = z.object({
  required: z.boolean(),
  estimatedPercent: z.number().min(0).max(100).optional(),
  frequency: z.enum(['NONE', 'OCCASIONAL', 'MONTHLY', 'WEEKLY', 'FREQUENT', 'UNKNOWN']),
  international: z.boolean(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
});
export const salarySchema = z
  .object({
    source: z.enum(['ADVERTISED', 'STRUCTURED_SOURCE', 'MARKET_ESTIMATE']),
    currency: z.string().regex(/^[A-Z]{3}$/),
    min: z.number().nonnegative(),
    max: z.number().nonnegative(),
    midpoint: z.number().nonnegative(),
    period: z.enum(['YEAR', 'MONTH', 'DAY', 'HOUR']),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string()),
    generatedAt: z.string(),
  })
  .refine((v) => v.max >= v.min, 'Invalid salary range');
export type Salary = z.infer<typeof salarySchema>;
export const jobSchema = z.object({
  id: z.string().min(1),
  fingerprint: z.string().min(1),
  sourceIds: z.array(z.object({ source: z.string(), externalId: z.string(), url: safeUrl })),
  url: safeUrl,
  title: z.string().min(1).max(500),
  normalizedTitle: z.string(),
  company: z.string().min(1).max(500),
  location: z.string(),
  descriptionText: text,
  discoveredAt: z.string().datetime(),
  publishedAt: z.string().datetime().optional(),
  lastSeenAt: z.string().datetime(),
  remotePolicy: remoteSchema,
  travelRequirement: travelSchema,
  compensation: salarySchema.optional(),
  requirements: z.array(
    z.object({
      text: z.string(),
      importance: z.enum(['MANDATORY', 'PREFERRED', 'OPTIONAL', 'UNKNOWN']),
    }),
  ),
  skills: z.array(z.string()),
  domains: z.array(z.string()),
  languages: z.array(z.string()),
  seniority: z.string(),
  internationalScope: z.object({
    score: z.number(),
    regions: z.array(z.string()),
    evidence: z.array(z.string()),
  }),
  status: z.enum(statuses),
  snoozeUntil: z.string().optional(),
  fixture: z.boolean().default(false),
});
export type Job = z.infer<typeof jobSchema>;
export const resumeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  roleFamily: z.string(),
  content: text,
});
export const profileSchema = z.object({
  id: z.literal('olfa'),
  headline: z.string(),
  yearsExperience: z.number().min(0).max(80),
  targetRoles: z.array(z.string()),
  adjacentRoles: z.array(z.string()),
  skills: z.array(z.string()),
  domains: z.array(z.string()),
  certifications: z.array(z.string()),
  languages: z.array(z.string()),
  resumeVersions: z.array(resumeSchema),
  updatedAt: z.string(),
});
export type CandidateProfile = z.infer<typeof profileSchema>;
export const preferencesSchema = z.object({
  id: z.literal('default'),
  countries: z.array(z.string()),
  cities: z.array(z.string()),
  roleQueries: z.array(z.string()),
  excludedCompanies: z.array(z.string()),
  excludedKeywords: z.array(z.string()),
  includeKeywords: z.array(z.string()),
  preferredDomains: z.array(z.string()),
  remoteModes: z.array(remoteSchema.shape.mode),
  maxOfficeDays: z.number().min(0).max(7),
  excludeOnsite: z.boolean(),
  excludeRelocation: z.boolean(),
  requireAbroad: z.boolean(),
  travelDesired: z.boolean(),
  maxTravelPercent: z.number().min(0).max(100),
  minSalary: z.number().nonnegative(),
  targetSalary: z.number().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  maxAgeDays: z.number().min(1).max(365),
  permanentOnly: z.boolean(),
  minSeniority: z.boolean(),
  learningEnabled: z.boolean(),
  learningResetAt: z.string().optional(),
  ignoredFeatures: z.array(z.string()),
  pinnedFeatures: z.array(z.string()),
  followUpDays: z.number().min(1).max(60),
});
export type CandidatePreferences = z.infer<typeof preferencesSchema>;
export const decisionSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  action: z.enum(['SELECT', 'REJECT', 'SNOOZE', 'UNDO', 'RESTORE']),
  previousStatus: z.enum(statuses),
  previousSnoozeUntil: z.string().optional(),
  reasons: z.array(z.string()),
  createdAt: z.string().datetime(),
  eligibility: z.number(),
  preference: z.number(),
  undoOf: z.string().optional(),
});
export type Decision = z.infer<typeof decisionSchema>;
export const stages = [
  'PREPARING',
  'READY',
  'APPLIED',
  'CONTACTED',
  'SCREENING',
  'INTERVIEW',
  'FINAL',
  'OFFER',
  'ACCEPTED',
  'COMPANY_REJECTED',
  'WITHDRAWN',
  'EXPIRED',
] as const;
export const applicationSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  stage: z.enum(stages),
  appliedAt: z.string().optional(),
  resumeVersionId: z.string().optional(),
  summary: z.string(),
  coverLetter: text,
  highlightedSkills: z.array(z.string()),
  readinessScore: z.number(),
  blockers: z.array(z.string()),
  notes: text,
  interviewEvents: z.array(z.object({ id: z.string(), date: z.string(), notes: z.string() })),
  updatedAt: z.string(),
});
export type Application = z.infer<typeof applicationSchema>;
export const contactSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  company: z.string().min(1),
  title: z.string(),
  email: z.union([z.string().email(), z.literal('')]),
  linkedInUrl: z.union([safeUrl, z.literal('')]),
  relationship: z.enum([
    'RECRUITER',
    'HIRING_MANAGER',
    'TEAM_MEMBER',
    'POTENTIAL_REFERRAL',
    'OTHER',
  ]),
  relatedJobIds: z.array(z.string()),
  status: z.enum([
    'IDENTIFIED',
    'CONTACTED',
    'REPLIED',
    'FOLLOW_UP',
    'REFERRAL_REQUESTED',
    'REFERRAL_RECEIVED',
    'CLOSED',
  ]),
  notes: text,
  followUpAt: z.string().optional(),
  updatedAt: z.string(),
});
export type Contact = z.infer<typeof contactSchema>;
export const sourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['arbeitnow', 'remoteok', 'ashby', 'themuse', 'jobicy']),
  board: z.string(),
  enabled: z.boolean(),
  status: z.enum(['UNCHECKED', 'OPERATIONAL', 'UNSUPPORTED_FRONTEND_ONLY', 'ERROR', 'OFFLINE']),
  checkedAt: z.string().optional(),
  error: z.string().optional(),
  received: z.number().default(0),
});
export type Source = z.infer<typeof sourceSchema>;
export const runSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(['RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED']),
  processedSources: z.array(z.string()),
  discovered: z.number(),
  errors: z.array(z.string()),
});
export const settingSchema = z.object({ id: z.string(), value: z.unknown() });
export const auditSchema = z.object({
  id: z.string(),
  entityId: z.string(),
  action: z.string(),
  createdAt: z.string(),
});
export const rawSchema = z.object({
  id: z.string(),
  source: z.string(),
  payload: z.unknown(),
  processed: z.boolean(),
});
export const defaultProfile: CandidateProfile = {
  id: 'olfa',
  headline: '',
  yearsExperience: 0,
  targetRoles: [],
  adjacentRoles: [],
  skills: [],
  domains: [],
  certifications: [],
  languages: [],
  resumeVersions: [],
  updatedAt: new Date(0).toISOString(),
};
export const defaultPreferences: CandidatePreferences = {
  id: 'default',
  countries: [],
  cities: [],
  roleQueries: ['Business Analyst', 'Transformation', 'Product Owner', 'Program Manager'],
  excludedCompanies: [],
  excludedKeywords: [],
  includeKeywords: [],
  preferredDomains: ['capital markets', 'transformation', 'financial services'],
  remoteModes: [],
  maxOfficeDays: 5,
  excludeOnsite: false,
  excludeRelocation: false,
  requireAbroad: false,
  travelDesired: true,
  maxTravelPercent: 100,
  minSalary: 0,
  targetSalary: 100000,
  currency: 'EUR',
  maxAgeDays: 30,
  permanentOnly: false,
  minSeniority: false,
  learningEnabled: true,
  ignoredFeatures: [],
  pinnedFeatures: [],
  followUpDays: 6,
};
export interface Match {
  eligibility: number;
  preference: number;
  overall: number;
  learned: number;
  evidence: {
    dimension: string;
    contribution: number;
    evidence: string[];
    kind: 'FACT' | 'INFERENCE' | 'PREFERENCE' | 'ESTIMATE';
  }[];
  warnings: string[];
  filteredReasons: string[];
}
export interface Affinity {
  feature: string;
  accepted: number;
  rejected: number;
  affinity: number;
  confidence: number;
}
