import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { JobDatabase, JobRepository } from '../infrastructure/database';
import { normalizeJob } from '../application/normalize';
import { learn } from '../domain/intelligence';
let db: JobDatabase;
let repo: JobRepository;
beforeEach(() => {
  db = new JobDatabase('hardening-' + crypto.randomUUID());
  repo = new JobRepository(db);
});
afterEach(async () => {
  await db.delete();
});
const raw = {
  title: 'Transformation Lead',
  company: 'Example',
  location: 'Paris',
  description: 'Global transformation and capital markets.',
  url: 'https://example.com/job',
};
describe('history and data safety', () => {
  it('undo cancels the learning signal without deleting history', async () => {
    const j = await normalizeJob(raw);
    await repo.ingest([j]);
    await repo.decide(j.id, 'SELECT');
    expect(learn([j], await db.decisions.toArray()).length).toBeGreaterThan(0);
    await repo.undo();
    expect(learn([j], await db.decisions.toArray())).toEqual([]);
    expect(await db.decisions.count()).toBe(2);
  });
  it('a failed decision does not leave an orphan event', async () => {
    await expect(repo.decide('missing', 'SELECT')).rejects.toThrow();
    expect(await db.decisions.count()).toBe(0);
  });
  it('concurrent duplicate ingestion produces one canonical job', async () => {
    const a = await normalizeJob(raw),
      b = await normalizeJob(raw);
    await Promise.all([repo.ingest([a]), repo.ingest([b])]);
    expect(await db.jobs.count()).toBe(1);
  });
  it('validates every table before replacing any data', async () => {
    const j = await normalizeJob(raw);
    await repo.ingest([j]);
    const backup = JSON.parse(await repo.exportBackup());
    backup.tables.contacts = [{ id: 'broken' }];
    await expect(repo.importBackup(JSON.stringify(backup))).rejects.toThrow();
    expect(await db.jobs.count()).toBe(1);
  });
  it('rejects orphan backup references', async () => {
    const j = await normalizeJob(raw);
    await repo.ingest([j]);
    await repo.decide(j.id, 'SELECT');
    const backup = JSON.parse(await repo.exportBackup());
    backup.tables.jobs = [];
    await expect(repo.importBackup(JSON.stringify(backup))).rejects.toThrow('orphaned');
    expect(await db.jobs.count()).toBe(1);
  });
  it('upgrades the v1 job index without losing decisions', async () => {
    await db.delete();
    const old = new Dexie(db.name);
    old.version(1).stores({
      jobs: 'id,fingerprint,status,discoveredAt',
      decisions: 'id,jobId,action,createdAt',
      profiles: 'id',
      preferences: 'id',
      applications: 'id,&jobId,stage',
      contacts: 'id,company,status',
      sources: 'id',
      runs: 'id,status,startedAt',
      settings: 'id',
      auditEvents: 'id,entityId,createdAt',
      rawJobs: 'id,source,processed',
    });
    const j = await normalizeJob(raw);
    await old.table('jobs').put(j);
    old.close();
    db = new JobDatabase(old.name);
    repo = new JobRepository(db);
    await db.open();
    expect((await db.jobs.get(j.id))?.fingerprint).toBe(j.fingerprint);
    expect(db.verno).toBe(2);
  });
});
