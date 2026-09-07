import { describe, it, expect, vi } from 'vitest';
import { dueForDiscovery, PublicSourceAdapter } from '../infrastructure/discovery';
import { parseCsv } from '../application/import';
import { defaultPreferences } from '../domain/model';
describe('discovery boundaries', () => {
  it('refreshes at twelve hours, not sooner', () => {
    expect(dueForDiscovery(new Date(0).toISOString(), 12 * 3600000)).toBe(true);
    expect(dueForDiscovery(new Date(0).toISOString(), 11 * 3600000)).toBe(false);
    expect(dueForDiscovery(undefined, 0)).toBe(true);
  });
  it('reports browser restriction on fetch failure', async () => {
    const adapter = new PublicSourceAdapter(
      {
        id: 'a',
        kind: 'arbeitnow',
        board: '',
        name: 'Arbeitnow',
        enabled: true,
        status: 'UNCHECKED',
        received: 0,
      },
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    expect(await adapter.canRunInBrowser()).toBe(false);
    expect(adapter.getHealth().status).toBe('UNSUPPORTED_FRONTEND_ONLY');
  });
  it('ignores Remote OK metadata and validates jobs', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { legal: 'notice' },
        {
          id: 1,
          position: 'Product Owner',
          company: 'Test',
          location: 'Worldwide',
          description: 'Fully remote',
          url: 'https://example.com/job',
        },
      ],
    });
    const adapter = new PublicSourceAdapter(
      {
        id: 'r',
        kind: 'remoteok',
        board: '',
        name: 'Remote OK',
        enabled: true,
        status: 'UNCHECKED',
        received: 0,
      },
      fetcher,
    );
    expect(await adapter.search(defaultPreferences, new AbortController().signal)).toHaveLength(1);
  });
  it('parses quoted CSV descriptions and embedded newlines', () => {
    expect(
      parseCsv(
        'title,company,url,description\n"Product, Lead",Test,https://example.com,"Line one\nLine two"',
      )[0],
    ).toMatchObject({ title: 'Product, Lead', description: 'Line one\nLine two' });
  });
});
it('preserves structured source salary and remote facts', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 1,
          position: 'Product Owner',
          company: 'Test',
          location: 'France',
          description: 'Product delivery',
          url: 'https://example.com/job',
          salary_min: 90000,
          salary_max: 110000,
          salary_currency: 'EUR',
          remote: true,
        },
      ],
    });
  const adapter = new PublicSourceAdapter(
    {
      id: 'r',
      kind: 'remoteok',
      board: '',
      name: 'Remote OK',
      enabled: true,
      status: 'UNCHECKED',
      received: 0,
    },
    fetcher,
  );
  const rows = await adapter.search(defaultPreferences, new AbortController().signal);
  expect(rows[0]).toMatchObject({
    compensation: { min: 90000, max: 110000, currency: 'EUR', source: 'STRUCTURED_SOURCE' },
    remoteMode: 'REMOTE',
  });
});
it('maps The Muse nested company/location/refs shape', async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      page: 0,
      results: [
        {
          id: 987,
          name: 'Business Transformation Lead',
          contents: '<p>Own the EMEA rollout</p>',
          publication_date: '2026-08-25T23:02:37Z',
          locations: [{ name: 'Paris, France' }],
          levels: [{ name: 'Senior Level' }],
          company: { name: 'Lumiere Bank' },
          refs: { landing_page: 'https://www.themuse.com/jobs/lumiere/lead' },
        },
      ],
    }),
  });
  const adapter = new PublicSourceAdapter(
    { id: 'm', kind: 'themuse', board: '', name: 'The Muse', enabled: true, status: 'UNCHECKED', received: 0 },
    fetcher,
  );
  const rows = await adapter.search(defaultPreferences, new AbortController().signal);
  expect(rows[0]).toMatchObject({
    title: 'Business Transformation Lead',
    company: 'Lumiere Bank',
    location: 'Paris, France',
    url: 'https://www.themuse.com/jobs/lumiere/lead',
  });
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining('page=0'),
    expect.anything(),
  );
});
it('maps Jobicy flat shape with direct salary fields', async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      jobs: [
        {
          id: 555,
          url: 'https://jobicy.com/jobs/555-lead-analyst',
          jobTitle: 'Lead Business Analyst',
          companyName: 'Northwind',
          jobGeo: 'Worldwide',
          jobDescription: 'Global transformation program',
          pubDate: '2026-09-01T00:00:00Z',
          salaryMin: 95000,
          salaryMax: 120000,
          salaryCurrency: 'USD',
          salaryPeriod: 'yearly',
        },
      ],
    }),
  });
  const adapter = new PublicSourceAdapter(
    { id: 'j', kind: 'jobicy', board: '', name: 'Jobicy', enabled: true, status: 'UNCHECKED', received: 0 },
    fetcher,
  );
  const rows = await adapter.search(defaultPreferences, new AbortController().signal);
  expect(rows[0]).toMatchObject({
    title: 'Lead Business Analyst',
    company: 'Northwind',
    remoteMode: 'REMOTE',
    compensation: { min: 95000, max: 120000, currency: 'USD' },
  });
});
