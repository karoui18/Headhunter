import Dexie, { type Table } from 'dexie';
import { z } from 'zod';
import {
  jobSchema,
  profileSchema,
  preferencesSchema,
  decisionSchema,
  applicationSchema,
  contactSchema,
  sourceSchema,
  runSchema,
  settingSchema,
  auditSchema,
  rawSchema,
  defaultProfile,
  defaultPreferences,
  type Job,
  type Decision,
  type Application,
  type Contact,
  type CandidateProfile,
  type CandidatePreferences,
  type Source,
} from '../domain/model';
import { learn, scoreJob } from '../domain/intelligence';
export class JobDatabase extends Dexie {
  jobs!: Table<Job, string>;
  decisions!: Table<Decision, string>;
  profiles!: Table<CandidateProfile, string>;
  preferences!: Table<CandidatePreferences, string>;
  applications!: Table<Application, string>;
  contacts!: Table<Contact, string>;
  sources!: Table<Source, string>;
  runs!: Table<z.infer<typeof runSchema>, string>;
  settings!: Table<z.infer<typeof settingSchema>, string>;
  auditEvents!: Table<z.infer<typeof auditSchema>, string>;
  rawJobs!: Table<z.infer<typeof rawSchema>, string>;
  constructor(name = 'olfa-job-hunter') {
    super(name);
    this.version(1).stores({
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
    this.version(2)
      .stores({ jobs: 'id,fingerprint,status,discoveredAt,lastSeenAt' })
      .upgrade((tx) =>
        tx
          .table('jobs')
          .toCollection()
          .modify((j) => {
            j.fixture ??= false;
          }),
      );
  }
}
const schemas = {
  jobs: jobSchema,
  decisions: decisionSchema,
  profiles: profileSchema,
  preferences: preferencesSchema,
  applications: applicationSchema,
  contacts: contactSchema,
  sources: sourceSchema,
  runs: runSchema,
  settings: settingSchema,
  auditEvents: auditSchema,
  rawJobs: rawSchema,
};
export interface Snapshot {
  jobs: Job[];
  decisions: Decision[];
  profile: CandidateProfile;
  preferences: CandidatePreferences;
  applications: Application[];
  contacts: Contact[];
  sources: Source[];
  runs: z.infer<typeof runSchema>[];
}
export class JobRepository {
  constructor(public db: JobDatabase) {}
  async snapshot(): Promise<Snapshot> {
    const [jobs, decisions, profile, preferences, applications, contacts, sources, runs] =
      await Promise.all([
        this.db.jobs.toArray(),
        this.db.decisions.toArray(),
        this.db.profiles.get('olfa'),
        this.db.preferences.get('default'),
        this.db.applications.toArray(),
        this.db.contacts.toArray(),
        this.db.sources.toArray(),
        this.db.runs.toArray(),
      ]);
    return {
      jobs,
      decisions,
      profile: profile || defaultProfile,
      preferences: preferences || defaultPreferences,
      applications,
      contacts,
      sources,
      runs,
    };
  }
  async ingest(jobs: Job[]) {
    const valid = jobs.map((j) => jobSchema.parse(j));
    return this.db.transaction('rw', this.db.jobs, async () => {
      let added = 0;
      for (const job of valid) {
        const all = await this.db.jobs.toArray();
        const existing = all.find(
          (j) =>
            j.fingerprint === job.fingerprint ||
            j.url === job.url ||
            j.sourceIds.some((a) =>
              job.sourceIds.some((b) => a.source === b.source && a.externalId === b.externalId),
            ),
        );
        if (existing) {
          const sourceIds = [...existing.sourceIds, ...job.sourceIds].filter(
            (s, i, a) =>
              a.findIndex((v) => v.source === s.source && v.externalId === s.externalId) === i,
          );
          await this.db.jobs.put({
            ...existing,
            lastSeenAt: job.lastSeenAt,
            descriptionText:
              job.descriptionText.length > existing.descriptionText.length
                ? job.descriptionText
                : existing.descriptionText,
            compensation: existing.compensation || job.compensation,
            publishedAt: [existing.publishedAt, job.publishedAt]
              .filter((s): s is string => !!s)
              .sort()[0],
            sourceIds,
          });
        } else {
          await this.db.jobs.add(job);
          added++;
        }
      }
      return added;
    });
  }
  async decide(
    jobId: string,
    action: Decision['action'],
    reasons: string[] = [],
    snoozeUntil = 'CYCLE',
  ) {
    if (action === 'UNDO') throw new Error('Use undo');
    return this.db.transaction(
      'rw',
      [this.db.jobs, this.db.decisions, this.db.profiles, this.db.preferences],
      async () => {
        const job = await this.db.jobs.get(jobId);
        if (!job) throw new Error('Job not found');
        if (!['NEW', 'QUEUED', 'SEEN', 'SNOOZED'].includes(job.status) && action !== 'RESTORE')
          throw new Error('This job has already been decided');
        const p = (await this.db.profiles.get('olfa')) || defaultProfile,
          prefs = (await this.db.preferences.get('default')) || defaultPreferences;
        const m = scoreJob(job, p, prefs, []);
        const event: Decision = {
          id: crypto.randomUUID(),
          jobId,
          action,
          previousStatus: job.status,
          previousSnoozeUntil: job.snoozeUntil,
          reasons,
          createdAt: new Date().toISOString(),
          eligibility: m.eligibility,
          preference: m.preference,
        };
        await this.db.decisions.add(event);
        await this.db.jobs.update(jobId, {
          status:
            action === 'SELECT'
              ? 'SELECTED'
              : action === 'REJECT'
                ? 'REJECTED'
                : action === 'SNOOZE'
                  ? 'SNOOZED'
                  : 'QUEUED',
          snoozeUntil: action === 'SNOOZE' ? snoozeUntil : undefined,
        });
        return event;
      },
    );
  }
  async undo() {
    return this.db.transaction(
      'rw',
      [this.db.jobs, this.db.decisions, this.db.applications],
      async () => {
        const history = await this.db.decisions.orderBy('createdAt').toArray();
        const undone = new Set(history.filter((d) => d.action === 'UNDO').map((d) => d.undoOf));
        const last = history.reverse().find((d) => d.action !== 'UNDO' && !undone.has(d.id));
        if (!last) return;
        if (await this.db.applications.where('jobId').equals(last.jobId).count())
          throw new Error('This job has an application; update it in Pipeline');
        await this.db.jobs.update(last.jobId, {
          status: last.previousStatus,
          snoozeUntil: last.previousSnoozeUntil,
        });
        await this.db.decisions.add({
          ...last,
          id: crypto.randomUUID(),
          action: 'UNDO',
          undoOf: last.id,
          createdAt: new Date().toISOString(),
        });
      },
    );
  }
  async saveProfile(value: CandidateProfile) {
    await this.db.profiles.put(profileSchema.parse(value));
  }
  async savePreferences(value: CandidatePreferences) {
    await this.db.preferences.put(preferencesSchema.parse(value));
  }
  async saveContact(value: Contact) {
    const v = contactSchema.parse(value);
    await this.db.transaction('rw', [this.db.contacts, this.db.auditEvents], async () => {
      await this.db.contacts.put(v);
      await this.audit(v.id, 'Contact ' + v.status);
    });
  }
  async saveApplication(value: Application) {
    const a = applicationSchema.parse(value);
    await this.db.transaction(
      'rw',
      [this.db.applications, this.db.jobs, this.db.auditEvents],
      async () => {
        const job = await this.db.jobs.get(a.jobId);
        if (!job) throw new Error('Job not found');
        await this.db.applications.put(a);
        const status: Job['status'] =
          a.stage === 'READY'
            ? 'APPLICATION_READY'
            : ['INTERVIEW', 'FINAL', 'SCREENING'].includes(a.stage)
              ? 'INTERVIEW'
              : a.stage === 'OFFER'
                ? 'OFFER'
                : a.stage === 'ACCEPTED'
                  ? 'ACCEPTED'
                  : a.stage === 'COMPANY_REJECTED'
                    ? 'COMPANY_REJECTED'
                    : a.stage === 'WITHDRAWN'
                      ? 'WITHDRAWN'
                      : a.stage === 'EXPIRED'
                        ? 'ARCHIVED'
                        : a.stage === 'PREPARING'
                          ? 'SELECTED'
                          : 'APPLIED';
        await this.db.jobs.update(a.jobId, { status });
        await this.audit(a.jobId, 'Application ' + a.stage);
      },
    );
  }
  async audit(entityId: string, action: string) {
    await this.db.auditEvents.add({
      id: crypto.randomUUID(),
      entityId,
      action,
      createdAt: new Date().toISOString(),
    });
  }
  async exportBackup() {
    return this.db.transaction('r', this.db.tables, async () => {
      const tables: Record<string, unknown> = {};
      for (const table of this.db.tables) tables[table.name] = await table.toArray();
      return JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), tables }, null, 2);
    });
  }
  async importBackup(json: string) {
    if (json.length > 50_000_000) throw new Error('Backup exceeds 50 MB');
    const root = z
      .object({
        version: z.union([z.literal(1), z.literal(2)]),
        tables: z.record(z.array(z.unknown())),
      })
      .parse(JSON.parse(json));
    const validated: Record<string, unknown[]> = {};
    for (const [name, schema] of Object.entries(schemas)) {
      if (!root.tables[name]) throw new Error('Missing backup table: ' + name);
      validated[name] = root.tables[name].map((row) => schema.parse(row));
      const ids = validated[name].map((row) => (row as { id: string }).id);
      if (new Set(ids).size !== ids.length) throw new Error('Duplicate IDs in ' + name);
    }
    const jobIds = new Set((validated.jobs as Job[]).map((j) => j.id));
    for (const row of [
      ...(validated.decisions as Decision[]),
      ...(validated.applications as Application[]),
    ])
      if (!jobIds.has(row.jobId)) throw new Error('Backup contains an orphaned job reference');
    await this.db.transaction('rw', this.db.tables, async () => {
      for (const [name, rows] of Object.entries(validated)) {
        await this.db.table(name).clear();
        await this.db.table(name).bulkPut(rows);
      }
    });
  }
  affinities(snapshot: Snapshot) {
    return learn(
      snapshot.jobs,
      snapshot.decisions.filter(
        (d) =>
          !snapshot.preferences.learningResetAt ||
          d.createdAt > snapshot.preferences.learningResetAt,
      ),
    );
  }
}
export const db = new JobDatabase();
export const repository = new JobRepository(db);
