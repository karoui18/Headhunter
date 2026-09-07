import { describe, it, expect } from 'vitest';
import { prepareApplication, estimateSalary, followUpDate } from '../application/career';
import { defaultProfile } from '../domain/model';
import { normalizeJob } from '../application/normalize';
import { semanticSimilarity, semanticVector } from '../domain/semantic';
import { encryptBackup, decryptBackup } from '../infrastructure/backup';
const raw = {
  title: 'Business Analyst',
  company: 'Example',
  location: 'Paris, France',
  description: 'Transformation and agile delivery.',
  url: 'https://example.com/job',
};
describe('career package and local intelligence', () => {
  it('does not invent experience or claim readiness without a resume', async () => {
    const pack = prepareApplication(await normalizeJob(raw), defaultProfile);
    expect(pack.resumeVersionId).toBeUndefined();
    expect(pack.blockers).toContain('Add a resume in Profile');
    expect(pack.coverLetter).not.toContain('years');
  });
  it('preserves advertised salary over benchmarks', async () => {
    const j = await normalizeJob({ ...raw, description: 'EUR 80k–90k per year' });
    expect(
      estimateSalary(j, [
        {
          market: 'France',
          roleFamily: 'Business Analyst',
          min: 100000,
          max: 120000,
          currency: 'EUR',
          sourceUrl: 'https://example.com/report',
          sourceDate: '2026-01-01',
        },
      ])?.source,
    ).toBe('ADVERTISED');
  });
  it('does not fabricate estimates when no benchmark exists', async () => {
    expect(estimateSalary(await normalizeJob(raw), [])).toBeUndefined();
  });
  it('counts business days for follow-ups', () => {
    expect(followUpDate('2026-09-04T10:00:00.000Z', 1)).toBe('2026-09-07T10:00:00.000Z');
  });
  it('recognizes related role terminology locally', () => {
    expect(
      semanticSimilarity(
        semanticVector('programme manager transformation'),
        semanticVector('program management change delivery'),
      ),
    ).toBeGreaterThan(
      semanticSimilarity(
        semanticVector('programme manager transformation'),
        semanticVector('nurse clinical healthcare'),
      ),
    );
  });
  it('encrypts and authenticates backup content', async () => {
    const encrypted = await encryptBackup('{"private":"profile"}', 'correct-password');
    expect(encrypted).not.toContain('profile');
    expect(await decryptBackup(encrypted, 'correct-password')).toBe('{"private":"profile"}');
    await expect(decryptBackup(encrypted, 'wrong-password')).rejects.toThrow('Incorrect password');
  });
});
