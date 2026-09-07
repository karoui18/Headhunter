import { z } from 'zod';
import { salarySchema, type CandidatePreferences, type Source } from '../domain/model';
import { inputSchema, normalizeJob, type JobInput } from '../application/normalize';
import type { JobRepository } from './database';
export const dueForDiscovery = (last: string | undefined, now = Date.now()) =>
  !last || now - Date.parse(last) >= 12 * 3600000;
export interface JobSourceAdapter {
  id: string;
  canRunInBrowser(): Promise<boolean>;
  search(config: CandidatePreferences, signal: AbortSignal): Promise<JobInput[]>;
  getHealth(): Source;
}
const record = z.record(z.unknown());
const sourceDate = (value: unknown): string | undefined => {
  const date = new Date(typeof value === 'number' ? value * 1000 : String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
};
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
export class PublicSourceAdapter implements JobSourceAdapter {
  id: string;
  private health: Source;
  constructor(
    source: Source,
    private fetcher: typeof fetch = (...args) => globalThis.fetch(...args),
  ) {
    this.id = source.id;
    this.health = { ...source };
  }
  private endpoint() {
    switch (this.health.kind) {
      case 'arbeitnow':
        return 'https://www.arbeitnow.com/api/job-board-api';
      case 'remoteok':
        return 'https://remoteok.com/api';
      case 'themuse':
        return 'https://www.themuse.com/api/public/jobs';
      case 'jobicy':
        return 'https://jobicy.com/api/v2/remote-jobs?count=50';
      default:
        return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(this.health.board)}?includeCompensation=true`;
    }
  }
  async canRunInBrowser() {
    try {
      const response = await this.fetcher(this.endpoint(), {
        signal: AbortSignal.timeout(15000),
        credentials: 'omit',
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      this.health.status = 'OPERATIONAL';
      return true;
    } catch (error) {
      this.health.status = error instanceof TypeError ? 'UNSUPPORTED_FRONTEND_ONLY' : 'ERROR';
      this.health.error = String(error);
      return false;
    }
  }
  getHealth() {
    return this.health;
  }
  private mapCandidate(r: Record<string, unknown>) {
    if (this.health.kind === 'themuse') {
      const company = record.safeParse(r.company);
      const location = Array.isArray(r.locations) ? record.safeParse(r.locations[0]) : undefined;
      const refs = record.safeParse(r.refs);
      const level = Array.isArray(r.levels) ? record.safeParse(r.levels[0]) : undefined;
      const locationName = location?.success ? str(location.data.name) : '';
      return {
        title: str(r.name),
        company: (company.success ? str(company.data.name) : '') || this.health.name,
        location: locationName || 'Unknown',
        description: str(r.contents),
        url: refs.success ? str(refs.data.landing_page) : '',
        externalId: str(r.id),
        publishedAt: sourceDate(r.publication_date),
        remoteMode: /remote/i.test(locationName) ? ('REMOTE' as const) : undefined,
        seniorityHint: level?.success ? str(level.data.name) : undefined,
      };
    }
    if (this.health.kind === 'jobicy') {
      const min = typeof r.salaryMin === 'number' ? r.salaryMin : undefined;
      const max = typeof r.salaryMax === 'number' ? r.salaryMax : undefined;
      const parsedSalary = salarySchema.safeParse({
        source: 'STRUCTURED_SOURCE',
        currency: str(r.salaryCurrency) || 'USD',
        min,
        max,
        midpoint: typeof min === 'number' && typeof max === 'number' ? (min + max) / 2 : 0,
        period: str(r.salaryPeriod).toUpperCase() === 'MONTHLY' ? 'MONTH' : 'YEAR',
        confidence: 0.8,
        evidence: ['Compensation fields supplied by ' + this.health.name],
        generatedAt: new Date().toISOString(),
      });
      return {
        title: str(r.jobTitle),
        company: str(r.companyName) || this.health.name,
        location: str(r.jobGeo) || 'Worldwide',
        description: str(r.jobDescription || r.jobExcerpt),
        url: str(r.url),
        externalId: str(r.id),
        publishedAt: sourceDate(r.pubDate),
        remoteMode: 'REMOTE' as const,
        compensation: min && max ? parsedSalary.data : undefined,
      };
    }
    const title = str(r.title || r.position);
    const description = str(r.description || r.descriptionPlain || r.descriptionHtml);
    const comp = record.safeParse(r.compensation);
    const components =
      comp.success && Array.isArray(comp.data.summaryComponents) ? comp.data.summaryComponents : [];
    const salary = components
      .map((v) => record.safeParse(v))
      .find((v) => v.success && v.data.compensationType === 'Salary');
    const structured = salary?.success ? salary.data : undefined;
    const min = structured?.minValue ?? r.salary_min,
      max = structured?.maxValue ?? r.salary_max;
    const currency = structured?.currencyCode ?? r.salary_currency;
    const parsedSalary = salarySchema.safeParse({
      source: 'STRUCTURED_SOURCE',
      currency,
      min,
      max,
      midpoint: typeof min === 'number' && typeof max === 'number' ? (min + max) / 2 : 0,
      period:
        structured?.interval === '1 HOUR' ? 'HOUR' : structured?.interval === '1 MONTH' ? 'MONTH' : 'YEAR',
      confidence: 0.9,
      evidence: ['Compensation fields supplied by ' + this.health.name],
      generatedAt: new Date().toISOString(),
    });
    const workplace = str(r.workplaceType).toUpperCase();
    return {
      title,
      company: str(r.company_name || r.company) || this.health.name,
      location: str(r.location) || 'Unknown',
      description,
      compensation: parsedSalary.success ? parsedSalary.data : undefined,
      remoteMode: ['REMOTE', 'HYBRID', 'ONSITE'].includes(workplace)
        ? (workplace as 'REMOTE' | 'HYBRID' | 'ONSITE')
        : r.remote === true || r.isRemote === true
          ? ('REMOTE' as const)
          : undefined,
      url: str(r.url || r.jobUrl || r.applyUrl),
      externalId: str(r.id || r.slug),
      publishedAt: sourceDate(r.publishedAt || r.created_at || r.date),
    };
  }
  async search(config: CandidatePreferences, signal: AbortSignal) {
    const jobs: JobInput[] = [];
    const paginated = this.health.kind === 'arbeitnow' || this.health.kind === 'themuse';
    try {
      for (let page = 1; page <= 5; page++) {
        const base = this.endpoint();
        const url =
          this.health.kind === 'arbeitnow'
            ? base + '?page=' + page
            : this.health.kind === 'themuse'
              ? base + '?page=' + (page - 1)
              : base;
        const response = await this.fetcher(url, { signal, credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: unknown = await response.json();
        const rootKey =
          this.health.kind === 'ashby'
            ? 'jobs'
            : this.health.kind === 'themuse'
              ? 'results'
              : this.health.kind === 'jobicy'
                ? 'jobs'
                : 'data';
        const root = Array.isArray(data) ? data : record.parse(data)[rootKey];
        if (!Array.isArray(root)) throw new Error('Unexpected source format');
        for (const item of root) {
          const v = record.safeParse(item);
          if (!v.success) continue;
          const r = v.data;
          const candidate = this.mapCandidate(r);
          if (!candidate || !candidate.title) continue;
          const valid = inputSchema.safeParse(candidate);
          if (valid.success) {
            const hay = (candidate.title + ' ' + candidate.description).toLowerCase();
            if (
              !config.roleQueries.length ||
              config.roleQueries.some((q) => hay.includes(q.toLowerCase()))
            )
              jobs.push(valid.data);
          }
        }
        if (!paginated || root.length === 0) break;
      }
      this.health = {
        ...this.health,
        status: 'OPERATIONAL',
        received: jobs.length,
        checkedAt: new Date().toISOString(),
        error: undefined,
      };
      return jobs;
    } catch (e) {
      this.health = {
        ...this.health,
        status: e instanceof TypeError ? 'UNSUPPORTED_FRONTEND_ONLY' : 'ERROR',
        error: String(e),
        checkedAt: new Date().toISOString(),
      };
      throw e;
    }
  }
}
export const defaultSources: Source[] = [
  {
    id: 'arbeitnow',
    name: 'Arbeitnow',
    kind: 'arbeitnow',
    board: '',
    enabled: true,
    status: 'UNCHECKED',
    received: 0,
  },
  {
    id: 'remoteok',
    name: 'Remote OK',
    kind: 'remoteok',
    board: '',
    enabled: true,
    status: 'UNCHECKED',
    received: 0,
  },
  {
    id: 'themuse',
    name: 'The Muse',
    kind: 'themuse',
    board: '',
    enabled: true,
    status: 'UNCHECKED',
    received: 0,
  },
  {
    id: 'jobicy',
    name: 'Jobicy',
    kind: 'jobicy',
    board: '',
    enabled: true,
    status: 'UNCHECKED',
    received: 0,
  },
];
export class DiscoveryOrchestrator {
  private running?: Promise<void>;
  private controller?: AbortController;
  constructor(private repo: JobRepository) {}
  cancel() {
    this.controller?.abort();
  }
  run(force = false, onProgress: (message: string) => void = () => {}) {
    if (this.running) return this.running;
    const task = () => this.execute(force, onProgress);
    this.running = Promise.resolve(
      typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request('job-hunter-discovery', task)
        : task(),
    )
      .then(() => {})
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
  private async execute(force: boolean, onProgress: (message: string) => void) {
    const db = this.repo.db;
    const last = await db.settings.get('lastSuccessfulDiscoveryAt');
    if (!force && !dueForDiscovery(typeof last?.value === 'string' ? last.value : undefined))
      return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      onProgress('Offline — existing jobs remain available');
      return;
    }
    const sources = (await db.sources.toArray()).filter((s) => s.enabled);
    if (!sources.length) {
      onProgress('Enable a source in Settings to discover live jobs');
      return;
    }
    this.controller = new AbortController();
    const snapshot = await this.repo.snapshot();
    let run = (await db.runs.where('status').equals('RUNNING').first()) || {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      status: 'RUNNING' as const,
      processedSources: [],
      discovered: 0,
      errors: [],
    };
    await db.runs.put(run);
    for (const source of sources) {
      if (run.processedSources.includes(source.id)) continue;
      if (this.controller.signal.aborted) break;
      const adapter = new PublicSourceAdapter(source);
      onProgress('Fetching ' + source.name + '…');
      try {
        const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(30000)]);
        const rows = await adapter.search(snapshot.preferences, signal);
        for (const [index, row] of rows.entries()) {
          const id = `${run.id}:${source.id}:${index}`;
          await db.rawJobs.put({ id, source: source.id, payload: row, processed: false });
          const job = await normalizeJob(row, source.id);
          run.discovered += await this.repo.ingest([job]);
          await db.rawJobs.update(id, { processed: true });
        }
        run.processedSources.push(source.id);
      } catch (e) {
        run.errors.push(source.name + ': ' + String(e));
      }
      await db.sources.put(adapter.getHealth());
      await db.runs.put(run);
    }
    if (this.controller.signal.aborted) {
      onProgress('Paused — next refresh resumes this run');
      return;
    }
    run = {
      ...run,
      status: run.errors.length ? (run.processedSources.length ? 'PARTIAL' : 'FAILED') : 'SUCCESS',
      completedAt: new Date().toISOString(),
    };
    await db.runs.put(run);
    if (run.status === 'SUCCESS')
      await db.settings.put({ id: 'lastSuccessfulDiscoveryAt', value: run.completedAt });
    onProgress(`${run.discovered} new jobs · ${run.status.toLowerCase()}`);
  }
}
