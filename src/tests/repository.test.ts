import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { JobDatabase, JobRepository } from '../infrastructure/database';
import { normalizeJob } from '../application/normalize';
let db: JobDatabase;
let repo: JobRepository;
beforeEach(() => {
  db = new JobDatabase('test-' + crypto.randomUUID());
  repo = new JobRepository(db);
});
afterEach(async () => {
  await db.delete();
});
const raw = {
  title: 'Product Owner',
  company: 'Example',
  location: 'Paris',
  description: 'Transformation',
  url: 'https://example.com/role',
};
describe('job aggregate transactions', () => {
  it('persists decisions and never resurrects rediscovered rejections', async () => {
    const j = await normalizeJob(raw);
    await repo.ingest([j]);
    await repo.decide(j.id, 'REJECT', ['Company']);
    await repo.ingest([{ ...j, descriptionText: 'Updated description' }]);
    expect((await db.jobs.get(j.id))?.status).toBe('REJECTED');
    expect(await db.decisions.count()).toBe(1);
  });
  it('undo appends an event and restores the prior state', async () => {
    const j = await normalizeJob(raw);
    await repo.ingest([j]);
    await repo.decide(j.id, 'SELECT');
    await repo.undo();
    expect((await db.jobs.get(j.id))?.status).toBe('QUEUED');
    expect((await db.decisions.toArray()).map((d) => d.action)).toContain('UNDO');
  });
  it('deduplicates and merges source identities', async () => {
    const j = await normalizeJob(raw, 'one');
    const k = await normalizeJob(raw, 'two');
    await repo.ingest([j, k]);
    expect(await db.jobs.count()).toBe(1);
    expect((await db.jobs.toArray())[0].sourceIds).toHaveLength(2);
  });
  it('validates backups before any mutation', async () => {
    const j = await normalizeJob(raw);
    await repo.ingest([j]);
    await expect(repo.importBackup('{"version":999}')).rejects.toThrow();
    expect(await db.jobs.count()).toBe(1);
  });
  it('round-trips all stores', async () => {
    const j = await normalizeJob(raw);
    await repo.ingest([j]);
    await repo.decide(j.id, 'SELECT');
    const backup = await repo.exportBackup();
    await db.jobs.clear();
    await repo.importBackup(backup);
    expect(await db.jobs.count()).toBe(1);
    expect(await db.decisions.count()).toBe(1);
  });
});
