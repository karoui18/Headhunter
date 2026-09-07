import { describe, it, expect } from 'vitest';
import {
  parseRemote,
  parseTravel,
  parseSalary,
  scoreJob,
  learn,
  rankQueue,
} from '../domain/intelligence';
import { normalizeJob } from '../application/normalize';
import { defaultProfile, defaultPreferences } from '../domain/model';

const raw = {
  title: 'Senior Business Analyst',
  company: 'Example',
  location: 'Paris',
  description:
    'Capital markets transformation. Fully remote across EU. International travel 20%. EUR 90,000–110,000 per year.',
  url: 'https://example.com/jobs/1',
};
describe('evidence-based intelligence', () => {
  it('preserves country restrictions and monthly office frequency', () => {
    const policy = parseRemote('Remote in France, 2 days per month in Paris');
    expect(policy.mode).toBe('HYBRID');
    expect(policy.scope).toBe('COUNTRY');
    expect(policy.allowedCountries).toContain('France');
    expect(policy.officeFrequencyText).toMatch(/2 days per month/);
    expect(policy.officeDaysPerWeek).toBeUndefined();
  });
  it('does not invent remote policy from ambiguous phrasing', () => {
    const p = parseRemote('Flexible workplace');
    expect(p.mode).toBe('UNKNOWN');
    expect(p.confidence).toBeLessThan(0.5);
  });
  it('separates travel from remote and does not turn no travel into travel', () => {
    expect(parseTravel('Fully remote. No travel required.').required).toBe(false);
    expect(parseTravel('International travel 20%').estimatedPercent).toBe(20);
  });
  it('extracts annual advertised salaries without inventing absent salaries', () => {
    expect(parseSalary(raw.description)).toMatchObject({
      min: 90000,
      max: 110000,
      currency: 'EUR',
      source: 'ADVERTISED',
    });
    expect(parseSalary('Competitive salary')).toBeUndefined();
  });
  it('keeps hourly compensation distinct', () => {
    expect(parseSalary('$50–70 per hour')).toMatchObject({ min: 50, max: 70, period: 'HOUR' });
  });
  it('does not claim eligibility from preferences', async () => {
    const j = await normalizeJob(raw);
    const emptyProfile = { ...defaultProfile, headline: '', targetRoles: [], domains: [], skills: [], certifications: [], languages: [] };
    const m = scoreJob(j, emptyProfile, defaultPreferences, []);
    expect(m.eligibility).toBe(0);
    expect(m.warnings).toContain('Complete your factual profile to assess eligibility');
  });
  it('applies hard filters while preserving the job', async () => {
    const j = await normalizeJob({ ...raw, description: 'On-site only' });
    expect(
      scoreJob(j, defaultProfile, { ...defaultPreferences, excludeOnsite: true }, [])
        .filteredReasons,
    ).toContain('On-site excluded');
  });
  it('does not mistake "international" for "intern" when excluding junior roles', async () => {
    const j = await normalizeJob(raw);
    expect(
      scoreJob(j, defaultProfile, { ...defaultPreferences, minSeniority: true }, [])
        .filteredReasons,
    ).not.toContain('Junior role excluded');
    const grad = await normalizeJob({ ...raw, description: 'Graduate program, 0-1 years' });
    expect(
      scoreJob(grad, defaultProfile, { ...defaultPreferences, minSeniority: true }, [])
        .filteredReasons,
    ).toContain('Junior role excluded');
  });
  it('snooze contributes no preference signal', async () => {
    const j = await normalizeJob(raw);
    expect(
      learn(
        [j],
        [
          {
            id: 'd',
            jobId: j.id,
            action: 'SNOOZE',
            previousStatus: 'QUEUED',
            reasons: [],
            createdAt: new Date().toISOString(),
            eligibility: 0,
            preference: 0,
          },
        ],
      ),
    ).toEqual([]);
  });
  it('strips scripts and unsafe URLs during ingestion', async () => {
    const j = await normalizeJob({
      ...raw,
      description: '<script>alert(1)</script><p>Real role</p>',
    });
    expect(j.descriptionText).toBe('Real role');
    await expect(normalizeJob({ ...raw, url: 'javascript:alert(1)' })).rejects.toThrow();
  });
  it('canonicalizes URLs for identity', async () => {
    const a = await normalizeJob(raw);
    const b = await normalizeJob({ ...raw, url: raw.url + '?utm_source=test' });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.url).toBe(b.url);
  });
  it('returns cycle snoozes only after the active queue is empty', async () => {
    const a = await normalizeJob(raw);
    const b = { ...a, id: 'b', status: 'SNOOZED' as const, snoozeUntil: 'CYCLE' };
    expect(rankQueue([a, b], defaultProfile, defaultPreferences, []).map((j) => j.id)).toEqual([
      a.id,
    ]);
    expect(rankQueue([b], defaultProfile, defaultPreferences, []).map((j) => j.id)).toEqual(['b']);
  });
});
