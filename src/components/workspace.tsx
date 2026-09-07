'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { liveQuery } from 'dexie';
import { animate, AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import { resolveSwipe, exitTarget } from '@/features/swipe/gesture';
import {
  Compass,
  Heart,
  Send,
  Users,
  Columns3,
  ChartNoAxesCombined,
  SlidersHorizontal,
  UserRound,
  HardDriveDownload,
  Settings,
  Plus,
  RefreshCw,
  ArrowUpRight,
  Undo2,
  X,
  ArrowDown,
  Check,
  Menu,
  BriefcaseBusiness,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { db, repository, type Snapshot } from '../infrastructure/database';
import { DiscoveryOrchestrator, defaultSources } from '../infrastructure/discovery';
import { fixtureJobs } from '../infrastructure/fixtures';
import { rankQueue, scoreJob } from '../domain/intelligence';
import { contactQueries, followUpDate, outreach, prepareApplication } from '../application/career';
import {
  stages,
  type Application,
  type Contact,
  type Job,
  type Match,
  type Source,
} from '../domain/model';
import { download } from '../infrastructure/backup';
import { AddJob, BackupPanel, ContactEditor, FiltersEditor, ProfileEditor } from './editors';
import { IntelligencePanel } from './intelligence-panel';
import { Badges, Empty, Field, Modal, SalaryLabel, Score } from './ui';
const navigation = [
  { id: 'discover', label: 'Discover', icon: Compass },
  { id: 'selected', label: 'Selected', icon: Heart },
  { id: 'apply', label: 'Apply', icon: Send },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'pipeline', label: 'Pipeline', icon: Columns3 },
  { id: 'insights', label: 'Insights', icon: ChartNoAxesCombined },
  { id: 'filters', label: 'Filters', icon: SlidersHorizontal },
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { id: 'backup', label: 'Backup', icon: HardDriveDownload },
  { id: 'settings', label: 'Settings', icon: Settings },
];
const orchestrator = new DiscoveryOrchestrator(repository);
export default function Workspace() {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <WorkspaceContent />
    </QueryClientProvider>
  );
}
function WorkspaceContent() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState('discover');
  const [menu, setMenu] = useState(false);
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [contactModal, setContactModal] = useState<Contact | 'new'>();
  const [rejecting, setRejecting] = useState<string>();
  const [search, setSearch] = useState('');
  const [library, setLibrary] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const [install, setInstall] = useState<Event & { prompt: () => Promise<void> }>();
  const { data, error: loadError } = useQuery({
    queryKey: ['workspace'],
    queryFn: () => repository.snapshot(),
  });
  const refresh = useCallback(async (force = false) => {
    setRefreshing(true);
    try {
      await orchestrator.run(force, setProgress);
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    const sub = liveQuery(() => repository.snapshot()).subscribe((value) =>
      queryClient.setQueryData(['workspace'], value),
    );
    void db
      .transaction('rw', db.sources, async () => {
        if (!(await db.sources.count())) await db.sources.bulkPut(defaultSources);
      })
      .catch((e) => setError(String(e)));
    return () => sub.unsubscribe();
  }, [queryClient]);
  useEffect(() => {
    const hash = () => {
      const next = location.hash.slice(1);
      if (navigation.some((n) => n.id === next)) setPage(next);
    };
    hash();
    window.addEventListener('hashchange', hash);
    const connectivity = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void refresh();
    };
    const visible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const prompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', visible);
    window.addEventListener('beforeinstallprompt', prompt);
    setOnline(navigator.onLine);
    void refresh();
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production')
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => {
      window.removeEventListener('hashchange', hash);
      window.removeEventListener('online', connectivity);
      window.removeEventListener('offline', connectivity);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pageshow', visible);
      window.removeEventListener('beforeinstallprompt', prompt);
    };
  }, [refresh]);
  const task = useCallback(
    async (action: () => Promise<unknown>, message = 'Saved') => {
      setBusy(true);
      setError('');
      try {
        await action();
        await queryClient.invalidateQueries({ queryKey: ['workspace'] });
        setNotice(message);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [queryClient],
  );
  const affinities = useMemo(() => (data ? repository.affinities(data) : []), [data]);
  const queue = useMemo(
    () => (data ? rankQueue(data.jobs, data.profile, data.preferences, affinities, now) : []),
    [data, affinities, now],
  );
  const current = queue[0];
  const decide = useCallback(
    (action: 'SELECT' | 'REJECT' | 'SNOOZE', reasons: string[] = [], until = 'CYCLE') => {
      if (!current || busy) return;
      void task(
        () => repository.decide(current.id, action, reasons, until),
        action === 'SELECT'
          ? 'Selected ✓'
          : action === 'REJECT'
            ? 'Rejected ✓'
            : 'Snoozed — no preference penalty',
      );
    },
    [current, busy, task],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        page !== 'discover' ||
        detail ||
        adding ||
        rejecting ||
        busy ||
        (e.target instanceof HTMLElement &&
          ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName))
      )
        return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        decide('SELECT');
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setRejecting(current?.id);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        decide('SNOOZE');
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setDetail(current?.id);
      }
      if (e.key.toLowerCase() === 'z') void task(() => repository.undo(), 'Decision undone');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [page, detail, adding, rejecting, busy, decide, current, task]);
  const go = (id: string) => {
    setPage(id);
    location.hash = id;
    setMenu(false);
    setSearch('');
  };
  if (loadError)
    return (
      <main className="fatal">
        <h1>Unable to open your local workspace</h1>
        <p>{String(loadError)}</p>
        <p>Check that your browser allows IndexedDB. Your existing data has not been cleared.</p>
        <button onClick={() => location.reload()}>Retry</button>
      </main>
    );
  if (!data)
    return (
      <main className="fatal">
        <h1>Olfa Job Hunter</h1>
        <p>Opening your local workspace…</p>
      </main>
    );
  const selected = data.jobs.filter(
    (j) => j.status === 'SELECTED' || j.status === 'APPLICATION_READY',
  );
  const counts: Record<string, number> = {
    discover: queue.length,
    selected: selected.length,
    apply: data.applications.filter((a) => ['PREPARING', 'READY'].includes(a.stage)).length,
    contacts: data.contacts.length,
    pipeline: data.applications.length,
  };
  const match = (j: Job) => scoreJob(j, data.profile, data.preferences, affinities);
  const detailJob = data.jobs.find((j) => j.id === detail);
  const filtered = data.jobs.filter((j) => match(j).filteredReasons.length).length;
  const lastRun = [...data.runs]
    .filter((r) => r.status === 'SUCCESS')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const prepare = (jobs: Job[]) =>
    task(async () => {
      for (const job of jobs)
        if (!data.applications.some((a) => a.jobId === job.id))
          await repository.saveApplication(prepareApplication(job, data.profile));
    }, 'Application packages prepared');
  const content: Record<string, ReactNode> = {
    discover: (
      <>
        <div className="page-heading">
          <div>
            <div className="eyebrow">YOUR NEXT CHAPTER</div>
            <h1>
              Good opportunities.
              <br />
              <span>Better decisions.</span>
            </h1>
            <p>A thoughtful shortlist for your next career move.</p>
          </div>
          <button onClick={() => go('filters')}>
            <SlidersHorizontal size={16} /> Tune your filters
          </button>
        </div>
        <div className="metrics">
          <Metric label="In your queue" value={queue.length} note="Ranked for you" />
          <Metric label="Selected roles" value={selected.length} note="Worth a closer look" />
          <Metric
            label="Applications"
            value={data.applications.length}
            note="Moving things forward"
          />
        </div>
        {data.jobs.some((j) => j.fixture) && (
          <div className="sample-banner">
            Sample workspace · Fictional jobs for exploring the app.{' '}
            <button onClick={() => setAdding(true)}>
              Add a real job <ArrowUpRight size={14} />
            </button>
          </div>
        )}
        <div className="discover-grid">
          <section>
            <div className="section-heading">
              <h2>
                Discover your next move <span>{queue.length}</span>
              </h2>
              <button onClick={() => setLibrary(!library)}>
                {library ? 'Back to cards' : 'View library'}
              </button>
            </div>
            {library ? (
              <>
                <Field label="Search all jobs">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Title, company, location"
                  />
                </Field>
                {data.jobs
                  .filter((j) =>
                    (j.title + ' ' + j.company + ' ' + j.location)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((j) => (
                    <JobRow key={j.id} job={j} match={match(j)} onOpen={() => setDetail(j.id)}>
                      <span className="badge">
                        {j.status} {match(j).filteredReasons.length ? '· filtered' : ''}
                      </span>
                      {['REJECTED', 'ARCHIVED', 'SNOOZED'].includes(j.status) && (
                        <button
                          onClick={() =>
                            void task(() => repository.decide(j.id, 'RESTORE'), 'Restored to queue')
                          }
                        >
                          Restore
                        </button>
                      )}
                    </JobRow>
                  ))}
              </>
            ) : current ? (
              <>
                <AnimatePresence mode="wait">
                  <SwipeCard
                    key={current.id}
                    job={current}
                    match={match(current)}
                    onOpen={() => setDetail(current.id)}
                    onSwipe={(action) =>
                      action === 'REJECT' ? setRejecting(current.id) : decide(action)
                    }
                  />
                </AnimatePresence>
                <div className="decision-controls">
                  <button
                    className="reject"
                    aria-label="Reject job"
                    disabled={busy}
                    onClick={() => setRejecting(current.id)}
                  >
                    <X />
                    <span>Reject</span>
                  </button>
                  <button
                    className="later"
                    aria-label="Snooze job"
                    disabled={busy}
                    onClick={() => decide('SNOOZE')}
                  >
                    <ArrowDown />
                    <span>Later</span>
                  </button>
                  <button
                    className="select"
                    aria-label="Select job"
                    disabled={busy}
                    onClick={() => decide('SELECT')}
                  >
                    <Check />
                    <span>Select</span>
                  </button>
                </div>
                <div className="keyboard-hint">
                  ← Reject <span>↓ Later</span> → Select <span>Space Details</span>
                  <button onClick={() => void task(() => repository.undo(), 'Decision undone')}>
                    <Undo2 size={13} /> Undo
                  </button>
                </div>
                <details className="snooze-options">
                  <summary>Choose when to see this job again</summary>
                  {[1, 3, 7].map((days) => (
                    <button
                      key={days}
                      onClick={() =>
                        decide('SNOOZE', [], new Date(Date.now() + days * 86400000).toISOString())
                      }
                    >
                      {days === 1 ? 'Tomorrow' : `In ${days} days`}
                    </button>
                  ))}
                </details>
              </>
            ) : (
              <Empty
                title={data.jobs.length ? 'You’re all caught up' : 'Your next chapter starts here'}
              >
                {data.jobs.length ? (
                  <>
                    Refresh your sources, add a job, or review {filtered} filtered jobs in the
                    library.
                  </>
                ) : (
                  <>
                    Add a real job to begin, or{' '}
                    <button
                      className="text-link"
                      onClick={() =>
                        void task(
                          async () => repository.ingest(await fixtureJobs()),
                          '42 sample jobs loaded',
                        )
                      }
                    >
                      Explore 42 sample jobs
                    </button>
                    .
                  </>
                )}
              </Empty>
            )}
          </section>
          <aside className="context-column">
            <div className="panel note-panel">
              <span className="mini-icon">✧</span>
              <h3>A little more intentional.</h3>
              <p>
                Eligibility measures your experience. Preference reflects what you want next. Every
                score shows its reasoning.
              </p>
              <button className="text-link" onClick={() => go('profile')}>
                {data.profile.headline ? 'Review your profile' : 'Complete your profile'}{' '}
                <ArrowUpRight size={14} />
              </button>
            </div>
            <div className="panel">
              <div className="eyebrow">YOUR SEARCH, AT A GLANCE</div>
              <h3>Room to grow.</h3>
              <div className="summary-line">
                <span>Role families</span>
                <strong>{data.preferences.roleQueries.length}</strong>
              </div>
              <div className="summary-line">
                <span>Locations</span>
                <strong>{data.preferences.countries.join(', ') || 'Open'}</strong>
              </div>
              <div className="summary-line">
                <span>Travel</span>
                <strong>{data.preferences.travelDesired ? 'Preferred' : 'No preference'}</strong>
              </div>
              <div className="summary-line">
                <span>Filtered jobs</span>
                <strong>{filtered}</strong>
              </div>
              <button className="text-link" onClick={() => go('filters')}>
                Edit preferences <ArrowUpRight size={14} />
              </button>
            </div>
            <div className="privacy-note">
              <HardDriveDownload size={17} />
              <p>
                Just you and your next move.
                <br />
                Your data stays in this browser.
              </p>
            </div>
          </aside>
        </div>
      </>
    ),
    selected: (
      <>
        <PageTitle title="The shortlist" subtitle="Opportunities you want to take further." />
        <div className="toolbar">
          <button
            className="primary"
            disabled={!selected.length || busy}
            onClick={() => void prepare(selected)}
          >
            Prepare all selected
          </button>
          <input
            aria-label="Filter selected jobs"
            placeholder="Filter by company or title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!selected.length ? (
          <Empty title="Make room for the right roles">
            Select a job in Discover to build your shortlist.
          </Empty>
        ) : (
          selected
            .filter((j) => (j.company + ' ' + j.title).toLowerCase().includes(search.toLowerCase()))
            .sort((a, b) => match(b).overall - match(a).overall)
            .map((j) => (
              <JobRow key={j.id} job={j} match={match(j)} onOpen={() => setDetail(j.id)}>
                <button
                  onClick={() => void prepare([j])}
                  disabled={data.applications.some((a) => a.jobId === j.id) || busy}
                >
                  {data.applications.some((a) => a.jobId === j.id) ? 'Prepared' : 'Prepare package'}
                </button>
              </JobRow>
            ))
        )}
      </>
    ),
    apply: (
      <>
        <PageTitle
          title="Make your next move"
          subtitle="Prepare locally. Review carefully. Submit on the employer’s site."
        />
        {data.applications.filter((a) => ['PREPARING', 'READY'].includes(a.stage)).length === 0 ? (
          <Empty title="Your application desk is clear">
            Prepare a role from Selected to get started.
          </Empty>
        ) : (
          data.applications
            .filter((a) => ['PREPARING', 'READY'].includes(a.stage))
            .map((a) => <ApplicationCard key={a.id} application={a} data={data} task={task} />)
        )}
      </>
    ),
    pipeline: (
      <>
        <PageTitle
          title="Keep things moving"
          subtitle="Every application, conversation, and next step in one place."
        />
        <div className="pipeline">
          {stages.map((stage) => (
            <section className="pipeline-column" key={stage}>
              <h3>
                {stage.replace('_', ' ')}{' '}
                <span>{data.applications.filter((a) => a.stage === stage).length}</span>
              </h3>
              {data.applications
                .filter((a) => a.stage === stage)
                .map((a) => (
                  <div className="pipeline-card" key={a.id}>
                    <button className="text-link" onClick={() => setDetail(a.jobId)}>
                      {data.jobs.find((j) => j.id === a.jobId)?.company}
                    </button>
                    <h4>{data.jobs.find((j) => j.id === a.jobId)?.title}</h4>
                    {a.appliedAt && (
                      <small>Applied {formatDistanceToNow(new Date(a.appliedAt))} ago</small>
                    )}
                    {a.appliedAt && ['APPLIED', 'CONTACTED'].includes(a.stage) && (
                      <p className="follow-up">
                        Follow-up:{' '}
                        {new Date(
                          followUpDate(a.appliedAt, data.preferences.followUpDays),
                        ).toLocaleDateString()}
                      </p>
                    )}
                    <Field label="Application stage">
                      <select
                        value={a.stage}
                        onChange={(e) =>
                          void task(() =>
                            repository.saveApplication({
                              ...a,
                              stage: e.target.value as Application['stage'],
                              appliedAt:
                                e.target.value === 'APPLIED'
                                  ? a.appliedAt || new Date().toISOString()
                                  : a.appliedAt,
                              updatedAt: new Date().toISOString(),
                            }),
                          )
                        }
                      >
                        {stages.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Application notes">
                      <textarea
                        defaultValue={a.notes}
                        onBlur={(e) => {
                          if (e.target.value !== a.notes)
                            void task(() =>
                              repository.saveApplication({
                                ...a,
                                notes: e.target.value,
                                updatedAt: new Date().toISOString(),
                              }),
                            );
                        }}
                      />
                    </Field>
                    <Field label="Add interview date">
                      <input
                        type="datetime-local"
                        onChange={(e) => {
                          if (e.target.value)
                            void task(
                              () =>
                                repository.saveApplication({
                                  ...a,
                                  interviewEvents: [
                                    ...a.interviewEvents,
                                    {
                                      id: crypto.randomUUID(),
                                      date: e.target.value,
                                      notes: 'Interview',
                                    },
                                  ],
                                  updatedAt: new Date().toISOString(),
                                }),
                              'Interview added',
                            );
                        }}
                      />
                    </Field>
                    {a.interviewEvents.map((i) => (
                      <p key={i.id}>
                        {new Date(i.date).toLocaleString()} · {i.notes}
                      </p>
                    ))}
                  </div>
                ))}
            </section>
          ))}
        </div>
      </>
    ),
    contacts: (
      <>
        <PageTitle
          title="People make the difference"
          subtitle="Build real connections around your next opportunity."
        />
        <button className="primary" onClick={() => setContactModal('new')}>
          <Plus size={16} /> Add contact
        </button>
        <div className="contacts-grid">
          {data.contacts.map((c) => (
            <div className="panel stack" key={c.id}>
              <div className="company-avatar">
                {c.name
                  .split(' ')
                  .map((v) => v[0])
                  .join('')
                  .slice(0, 2)}
              </div>
              <h2>{c.name}</h2>
              <p>
                {c.title} · {c.company}
              </p>
              <span className="badge">{c.relationship.replaceAll('_', ' ')}</span>
              <Field label="Contact status">
                <select
                  value={c.status}
                  onChange={(e) =>
                    void task(() =>
                      repository.saveContact({
                        ...c,
                        status: e.target.value as Contact['status'],
                        updatedAt: new Date().toISOString(),
                        followUpAt:
                          e.target.value === 'CONTACTED'
                            ? followUpDate(new Date().toISOString(), data.preferences.followUpDays)
                            : c.followUpAt,
                      }),
                    )
                  }
                >
                  {[
                    'IDENTIFIED',
                    'CONTACTED',
                    'REPLIED',
                    'FOLLOW_UP',
                    'REFERRAL_REQUESTED',
                    'REFERRAL_RECEIVED',
                    'CLOSED',
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              {c.followUpAt && (
                <small>Follow-up {new Date(c.followUpAt).toLocaleDateString()}</small>
              )}
              <textarea
                aria-label="Outreach draft"
                rows={7}
                readOnly
                value={outreach(
                  c,
                  data.jobs.find((j) => c.relatedJobIds.includes(j.id)),
                  data.profile,
                )}
              />
              <div className="toolbar">
                <button
                  onClick={() =>
                    void task(
                      () =>
                        navigator.clipboard.writeText(
                          outreach(
                            c,
                            data.jobs.find((j) => c.relatedJobIds.includes(j.id)),
                            data.profile,
                          ),
                        ),
                      'Message copied',
                    )
                  }
                >
                  Copy draft
                </button>
                <button onClick={() => setContactModal(c)}>Edit</button>
                {c.email && (
                  <a
                    className="button"
                    href={`mailto:${encodeURIComponent(c.email)}?body=${encodeURIComponent(
                      outreach(
                        c,
                        data.jobs.find((j) => c.relatedJobIds.includes(j.id)),
                        data.profile,
                      ),
                    )}`}
                  >
                    Open email draft
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
        {!data.contacts.length && (
          <Empty title="Start a conversation">
            Add a recruiter, hiring manager, or potential referral. Search helpers are available in
            each job’s analysis.
          </Empty>
        )}
      </>
    ),
    insights: (
      <>
        <Insights data={data} />
        <IntelligencePanel data={data} />
      </>
    ),
    profile: (
      <>
        <PageTitle
          title="A profile that’s truly yours"
          subtitle="The factual foundation for credible recommendations."
        />
        <ProfileEditor
          profile={data.profile}
          save={(p) => task(() => repository.saveProfile(p), 'Profile saved')}
        />
      </>
    ),
    filters: (
      <>
        <PageTitle
          title="Find your kind of opportunity"
          subtitle="Make the search reflect what matters to you."
        />
        <FiltersEditor
          preferences={data.preferences}
          save={(p) => task(() => repository.savePreferences(p), 'Filters saved')}
        />
      </>
    ),
    preferences: (
      <>
        <PageTitle
          title="What your decisions tell us"
          subtitle="Transparent, reversible preference learning. Snoozes never count against a job."
        />
        <div className="toolbar">
          <button
            onClick={() =>
              void task(
                () =>
                  repository.savePreferences({
                    ...data.preferences,
                    learningResetAt: new Date().toISOString(),
                  }),
                'Learning reset',
              )
            }
          >
            Reset learning
          </button>
          <button
            onClick={() =>
              void task(() =>
                repository.savePreferences({
                  ...data.preferences,
                  learningEnabled: !data.preferences.learningEnabled,
                }),
              )
            }
          >
            {data.preferences.learningEnabled ? 'Pause learning' : 'Enable learning'}
          </button>
        </div>
        {!affinities.length ? (
          <Empty title="Learning starts with a decision">
            Select or reject a few jobs. Patterns gain influence only with enough observations.
          </Empty>
        ) : (
          affinities.map((a) => (
            <div className="panel affinity" key={a.feature}>
              <div>
                <h3>{a.feature}</h3>
                <p>
                  {a.accepted} selected · {a.rejected} rejected · {Math.round(a.confidence * 100)}%
                  confidence
                </p>
              </div>
              <strong>
                {a.affinity >= 0 ? '+' : ''}
                {a.affinity.toFixed(2)}
              </strong>
              {(['pinnedFeatures', 'ignoredFeatures'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() =>
                    void task(() =>
                      repository.savePreferences({
                        ...data.preferences,
                        [key]: data.preferences[key].includes(a.feature)
                          ? data.preferences[key].filter((f) => f !== a.feature)
                          : [...data.preferences[key], a.feature],
                      }),
                    )
                  }
                >
                  {data.preferences[key].includes(a.feature)
                    ? 'Un' + (key === 'pinnedFeatures' ? 'pin' : 'ignore')
                    : key === 'pinnedFeatures'
                      ? 'Pin'
                      : 'Ignore'}
                </button>
              ))}
            </div>
          ))
        )}
      </>
    ),
    backup: (
      <>
        <PageTitle
          title="Your progress, protected"
          subtitle="Portable backups for a local-first workspace."
        />
        <BackupPanel repo={repository} task={task} />
      </>
    ),
    settings: (
      <>
        <PageTitle
          title="A workspace on your terms"
          subtitle="Sources, device capabilities, and privacy."
        />
        <div className="panel stack">
          <h2>Discovery sources</h2>
          <p>
            Feeds run directly in this browser. Enable sources to start live discovery. CORS
            restrictions are shown explicitly; no proxy is used.
          </p>
          {data.sources.map((s) => (
            <div className="source-row" key={s.id}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={(e) =>
                    void task(() => db.sources.put({ ...s, enabled: e.target.checked }))
                  }
                />
                <strong>{s.name}</strong>
              </label>
              <span className={'badge ' + (s.status === 'OPERATIONAL' ? 'green' : '')}>
                {s.status.replaceAll('_', ' ')}
              </span>
              <small>
                {s.received} received
                {s.checkedAt ? ' · ' + new Date(s.checkedAt).toLocaleString() : ''}
              </small>
              {s.error && <p className="error">{s.error}</p>}
            </div>
          ))}
          <form
            className="toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const board = String(f.get('board'));
              void task(
                () =>
                  db.sources.put({
                    id: 'ashby:' + board,
                    name: String(f.get('company')),
                    kind: 'ashby',
                    board,
                    enabled: true,
                    status: 'UNCHECKED',
                    received: 0,
                  } satisfies Source),
                'Company board added',
              );
              e.currentTarget.reset();
            }}
          >
            <input name="company" aria-label="Company name" placeholder="Company name" required />
            <input
              name="board"
              aria-label="Ashby board identifier"
              placeholder="Ashby board identifier"
              pattern="[a-zA-Z0-9_-]+"
              required
            />
            <button>Add Ashby board</button>
          </form>
          <div className="toolbar">
            <button disabled={refreshing || !online} onClick={() => void refresh(true)}>
              Refresh enabled sources
            </button>
            {refreshing && <button onClick={() => orchestrator.cancel()}>Pause discovery</button>}
          </div>
          <p>
            Jobs link back to their original sources:{' '}
            <a href="https://www.arbeitnow.com" target="_blank" rel="noopener noreferrer">
              Arbeitnow
            </a>{' '}
            and{' '}
            <a href="https://remoteok.com" target="_blank" rel="noopener noreferrer">
              Remote OK
            </a>
            .
          </p>
        </div>
        <div className="panel stack">
          <h2>This device</h2>
          <p>{online ? 'Online' : 'Offline'} · IndexedDB storage · No cloud synchronization</p>
          <p>
            Refresh is due after 12 hours and resumes when this app opens or becomes visible. Closed
            browsers cannot guarantee scheduled discovery.
          </p>
          {install ? (
            <button onClick={() => void install.prompt()}>Install Job Hunter</button>
          ) : (
            <p>Install from your browser menu, or on iOS use Share → Add to Home Screen.</p>
          )}
          <button
            onClick={() =>
              void task(async () => {
                const granted = await navigator.storage?.persist();
                setNotice(
                  granted
                    ? 'Persistent storage enabled'
                    : 'Browser did not grant persistent storage',
                );
              }, 'Storage request completed')
            }
          >
            Request persistent browser storage
          </button>
          <p>
            External requests: enabled public job feeds and links you open. Resume data, contacts,
            and decisions stay local. No analytics trackers or bundled API keys.
          </p>
        </div>
        <div className="panel stack">
          <h2>Sample data</h2>
          <button
            onClick={() =>
              void task(async () => repository.ingest(await fixtureJobs()), 'Sample jobs loaded')
            }
          >
            Load 42 fictional sample jobs
          </button>
          <p>Sample jobs never represent current vacancies.</p>
        </div>
      </>
    ),
  };
  return (
    <div className="workspace">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className={'sidebar ' + (menu ? 'open' : '')}>
        <a className="brand" href="#discover" onClick={() => go('discover')}>
          <span className="brand-mark">
            <BriefcaseBusiness size={21} />
          </span>
          <span>
            olfa<span className="brand-sub">JOB HUNTER</span>
          </span>
        </a>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((n, i) => (
            <button
              key={n.id}
              className={(page === n.id ? 'active ' : '') + (i === 6 ? 'nav-divider' : '')}
              onClick={() => go(n.id)}
              aria-current={page === n.id ? 'page' : undefined}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {counts[n.id] !== undefined && <small>{counts[n.id]}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">O</div>
          <div>
            <strong>Olfa’s workspace</strong>
            <span>
              <i /> Local & private
            </span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <span>/</span>
            <strong>{navigation.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="top-actions">
            <span className="sync-label">
              <i className={online ? 'online-dot' : 'offline-dot'} />
              {!online
                ? 'Offline'
                : lastRun
                  ? `Updated ${formatDistanceToNow(new Date(lastRun.completedAt || lastRun.startedAt))} ago`
                  : 'Local workspace'}
            </span>
            <button
              aria-label="Refresh jobs"
              disabled={refreshing || !online}
              onClick={() => void refresh(true)}
            >
              <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            </button>
            <button className="primary" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add job
            </button>
            <div className="avatar small">O</div>
          </div>
        </header>
        <main id="main">
          <div aria-live="polite">
            {progress && <div className="progress-banner">{progress}</div>}
            {notice && (
              <div className="toast">
                <span>{notice}</span>
                <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
                  ✕
                </button>
              </div>
            )}
          </div>
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                ✕
              </button>
            </div>
          )}
          {content[page]}
        </main>
        <footer className="main-footer">
          A more intentional job search. <span>Built around you.</span>
        </footer>
      </div>
      <nav className="mobile-bottom" aria-label="Mobile navigation">
        {['discover', 'selected', 'apply', 'pipeline'].map((id) => {
          const n = navigation.find((n) => n.id === id)!;
          return (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => go(id)}>
              <n.icon size={19} />
              {n.label}
            </button>
          );
        })}
        <button onClick={() => setMenu(!menu)}>
          <Menu size={19} />
          More
        </button>
      </nav>
      {adding && (
        <Modal title="Add an opportunity" onClose={() => setAdding(false)}>
          <AddJob
            onAdd={async (jobs) => {
              await repository.ingest(jobs);
              setAdding(false);
              setNotice(`${jobs.length} jobs imported`);
            }}
          />
        </Modal>
      )}
      {rejecting && (
        <Modal title="What didn’t feel right?" onClose={() => setRejecting(undefined)}>
          <RejectionReasons
            onSubmit={(reasons) => {
              const id = rejecting;
              setRejecting(undefined);
              void task(() => repository.decide(id, 'REJECT', reasons), 'Rejected ✓');
            }}
          />
        </Modal>
      )}
      {detailJob && (
        <Modal title="Job analysis" onClose={() => setDetail(undefined)}>
          <JobDetails job={detailJob} match={match(detailJob)} data={data} />
        </Modal>
      )}
      {contactModal && (
        <Modal
          title={contactModal === 'new' ? 'Add contact' : 'Edit contact'}
          onClose={() => setContactModal(undefined)}
        >
          <ContactEditor
            jobs={data.jobs}
            contact={contactModal === 'new' ? undefined : contactModal}
            onSave={(c) =>
              task(async () => {
                await repository.saveContact(c);
                setContactModal(undefined);
              }, 'Contact saved')
            }
          />
        </Modal>
      )}
    </div>
  );
}
function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">YOUR PERSONAL COMMAND CENTER</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value.toString().padStart(2, '0')}</strong>
      <small>{note}</small>
    </div>
  );
}
function SwipeCard({
  job,
  match,
  onOpen,
  onSwipe,
}: {
  job: Job;
  match: Match;
  onOpen: () => void;
  onSwipe: (action: 'SELECT' | 'REJECT' | 'SNOOZE') => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const x = useMotionValue(0),
    y = useMotionValue(0),
    rotate = useTransform(x, [-200, 200], [-7, 7]);
  const green = useTransform(x, [30, 140], [0, 0.85]),
    red = useTransform(x, [-140, -30], [0.85, 0]),
    blue = useTransform(y, [30, 140], [0, 0.85]);
  return (
    <motion.article
      ref={cardRef}
      className="job-card"
      data-testid="job-card"
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.7}
      style={{ x, y, rotate }}
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      onDragEnd={async (_, info) => {
        const cardWidth = cardRef.current?.offsetWidth ?? 340;
        const action = resolveSwipe(
          { x: info.offset.x, y: info.offset.y, vx: info.velocity.x, vy: info.velocity.y },
          cardWidth,
        );
        if (!action) return;
        const target = exitTarget(action, window.innerWidth, window.innerHeight);
        await Promise.all([
          animate(x, target.x, { duration: 0.3, ease: 'easeOut' }),
          animate(y, target.y, { duration: 0.3, ease: 'easeOut' }),
        ]);
        onSwipe(action);
      }}
    >
      <motion.div className="swipe-overlay green-overlay" style={{ opacity: green }}>
        ✓ SELECT
      </motion.div>
      <motion.div className="swipe-overlay red-overlay" style={{ opacity: red }}>
        ✕ REJECT
      </motion.div>
      <motion.div className="swipe-overlay blue-overlay" style={{ opacity: blue }}>
        ↓ LATER
      </motion.div>
      <div className="job-card-top">
        <div className="company-lockup">
          <div className="company-avatar">
            {job.company
              .split(' ')
              .map((w) => w[0])
              .slice(0, 2)
              .join('')}
          </div>
          <div>
            <strong>{job.company}</strong>
            <span>{job.fixture ? 'SAMPLE OPPORTUNITY' : job.sourceIds[0]?.source}</span>
          </div>
        </div>
        <span className="job-age">
          {job.publishedAt
            ? formatDistanceToNow(new Date(job.publishedAt)) + ' ago'
            : 'Recently discovered'}
        </span>
      </div>
      <button className="card-title" onClick={onOpen}>
        <h2>{job.title}</h2>
      </button>
      <p className="job-location">
        ⌖ {job.location} <span>· {job.seniority}</span>
      </p>
      <div className="match-strip">
        <Score match={match} />
        <div className="match-breakdown">
          <span>
            Eligibility <strong>{match.eligibility}%</strong>
          </span>
          <span>
            Preference <strong>{match.preference}%</strong>
          </span>
        </div>
      </div>
      <div className="salary-line">
        <SalaryLabel job={job} />
      </div>
      <Badges job={job} />
      <div className="card-divider" />
      <div className="flags">
        <div>
          <div className="eyebrow">WHY IT COULD FIT</div>
          {match.evidence
            .filter((e) => e.contribution > 0)
            .slice(0, 3)
            .map((e) => (
              <p className="positive" key={e.dimension}>
                ✓ {e.dimension}
              </p>
            ))}
          {!match.evidence.some((e) => e.contribution > 0) && (
            <p>Complete your profile for matching</p>
          )}
        </div>
        <div>
          <div className="eyebrow">WORTH A CLOSER LOOK</div>
          {match.warnings.slice(0, 2).map((w) => (
            <p key={w} className="caution">
              · {w}
            </p>
          ))}
          <p className="caution">· Verify requirements with employer</p>
        </div>
      </div>
      <button className="analysis-link" onClick={onOpen}>
        Explore the full analysis <ArrowUpRight size={16} />
      </button>
    </motion.article>
  );
}
function JobRow({
  job,
  match,
  onOpen,
  children,
}: {
  job: Job;
  match: Match;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <div className="job-row panel">
      <div className="company-avatar">{job.company.slice(0, 2).toUpperCase()}</div>
      <div className="job-row-info">
        <small>{job.company}</small>
        <button className="text-link" onClick={onOpen}>
          <h3>{job.title}</h3>
        </button>
        <p>
          {job.location} · <SalaryLabel job={job} />
        </p>
      </div>
      <Score match={match} />
      <div className="row-actions">{children}</div>
    </div>
  );
}
function RejectionReasons({ onSubmit }: { onSubmit: (reasons: string[]) => void }) {
  const [reasons, set] = useState<string[]>([]);
  return (
    <div className="stack">
      <p>Optional feedback helps shape your next shortlist.</p>
      <div className="reason-grid">
        {[
          'Salary',
          'Location',
          'Too operational',
          'Too junior',
          'Too senior',
          'Wrong domain',
          'No international scope',
          'Remote policy',
          'Too much office',
          'No travel',
          'Company',
          'Responsibilities',
          'Other',
        ].map((r) => (
          <button
            key={r}
            aria-pressed={reasons.includes(r)}
            className={reasons.includes(r) ? 'active' : ''}
            onClick={() =>
              set(reasons.includes(r) ? reasons.filter((v) => v !== r) : [...reasons, r])
            }
          >
            {r}
          </button>
        ))}
      </div>
      <button className="primary" onClick={() => onSubmit(reasons)}>
        Reject job
      </button>
      <button onClick={() => onSubmit([])}>Skip reasons</button>
    </div>
  );
}
function JobDetails({ job, match, data }: { job: Job; match: Match; data: Snapshot }) {
  const [tab, setTab] = useState('Overview');
  return (
    <div className="stack">
      <div>
        <span className="eyebrow">
          {job.company}
          {job.fixture ? ' · FICTIONAL SAMPLE' : ''}
        </span>
        <h2>{job.title}</h2>
        <p>{job.location}</p>
      </div>
      <div className="tabs">
        {[
          'Overview',
          'Match',
          'Description',
          'Salary',
          'Remote & Travel',
          'Application',
          'Contacts',
          'History',
        ].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Overview' && (
        <>
          <Score match={match} />
          <Badges job={job} />
          <p>{job.descriptionText.slice(0, 350)}</p>
          <h3>Why was this shown?</h3>
          <p>
            Search terms:{' '}
            {data.preferences.roleQueries
              .filter((q) =>
                (job.title + ' ' + job.descriptionText).toLowerCase().includes(q.toLowerCase()),
              )
              .join(', ') || 'Manual import or sample dataset'}
          </p>
          <p>Hard filters: {match.filteredReasons.join(', ') || 'Passed'}</p>
        </>
      )}
      {tab === 'Match' && (
        <>
          <p>
            Eligibility {match.eligibility}% · Preference {match.preference}% · Learned adjustment{' '}
            {match.learned.toFixed(1)}
          </p>
          {match.evidence.map((e) => (
            <div className="evidence" key={e.dimension}>
              <span className="badge">{e.kind}</span>
              <h3>
                {e.dimension} +{e.contribution}
              </h3>
              <p>{e.evidence.join(' · ') || 'No matching evidence entered'}</p>
            </div>
          ))}
          <h3>Requirements from the posting</h3>
          {job.requirements.map((r, i) => (
            <p key={i}>
              <span className="badge">{r.importance}</span> {r.text}
            </p>
          ))}
        </>
      )}
      {tab === 'Description' && <p className="description-text">{job.descriptionText}</p>}
      {tab === 'Salary' && (
        <>
          <h3>
            <SalaryLabel job={job} />
          </h3>
          {job.compensation ? (
            <>
              <p>Confidence {Math.round(job.compensation.confidence * 100)}%</p>
              {job.compensation.evidence.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </>
          ) : (
            <p>
              No advertised salary or verified benchmark is available. No estimate has been
              invented.
            </p>
          )}
          <p>
            Amounts remain in the source currency. Confirm gross/net and compensation period with
            the employer.
          </p>
        </>
      )}
      {tab === 'Remote & Travel' && (
        <>
          <Badges job={job} />
          <h3>Remote policy · inference</h3>
          <p>
            Confidence {Math.round(job.remotePolicy.confidence * 100)}% ·{' '}
            {job.remotePolicy.policyStability.replaceAll('_', ' ')}
          </p>
          {job.remotePolicy.evidence.map((e, i) => (
            <blockquote key={i}>{e}</blockquote>
          ))}
          <h3>Travel · separate from remote work</h3>
          {job.travelRequirement.evidence.map((e, i) => (
            <blockquote key={i}>{e}</blockquote>
          ))}
          <h3>International scope</h3>
          {job.internationalScope.evidence.map((e, i) => (
            <blockquote key={i}>{e}</blockquote>
          ))}
        </>
      )}
      {tab === 'Application' && (
        <>
          <p>Status: {job.status}</p>
          <p>Prepare this role from Selected, then review your package in Apply.</p>
          <a className="button primary" href={job.url} target="_blank" rel="noopener noreferrer">
            Open {job.fixture ? 'sample URL' : 'application page'} <ArrowUpRight size={16} />
          </a>
        </>
      )}
      {tab === 'Contacts' && (
        <>
          <p>
            Search helpers identify potential contacts. No people or relationships are inferred as
            verified.
          </p>
          {contactQueries(job).map((q) => (
            <div key={q.persona} className="evidence">
              <h3>{q.persona}</h3>
              <p>{q.query}</p>
              <a href={q.url} target="_blank" rel="noopener noreferrer">
                Search web ↗
              </a>{' '}
              ·{' '}
              <a
                href={
                  'https://www.linkedin.com/search/results/people/?keywords=' +
                  encodeURIComponent(q.query)
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                Search LinkedIn ↗
              </a>
            </div>
          ))}
        </>
      )}
      {tab === 'History' && (
        <>
          <p>{new Date(job.discoveredAt).toLocaleString()} · Discovered</p>
          {data.decisions
            .filter((d) => d.jobId === job.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((d) => (
              <div className="evidence" key={d.id}>
                <strong>{d.action}</strong>
                <p>
                  {new Date(d.createdAt).toLocaleString()} · {d.reasons.join(', ')}
                </p>
              </div>
            ))}
          {data.applications
            .filter((a) => a.jobId === job.id)
            .map((a) => (
              <p key={a.id}>
                {new Date(a.updatedAt).toLocaleString()} · Application {a.stage}
              </p>
            ))}
        </>
      )}
      <div className="source-links">
        Sources:{' '}
        {job.sourceIds.map((s) => (
          <a key={s.source + s.externalId} href={s.url} target="_blank" rel="noopener noreferrer">
            {s.source} ↗{' '}
          </a>
        ))}
      </div>
    </div>
  );
}
function ApplicationCard({
  application: a,
  data,
  task,
}: {
  application: Application;
  data: Snapshot;
  task: (action: () => Promise<unknown>, message?: string) => Promise<void>;
}) {
  const job = data.jobs.find((j) => j.id === a.jobId);
  const [letter, setLetter] = useState(a.coverLetter);
  const resume = data.profile.resumeVersions.find((r) => r.id === a.resumeVersionId);
  if (!job) return null;
  return (
    <section className="panel application-card stack">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{job.company}</span>
          <h2>{job.title}</h2>
        </div>
        <span className="badge">{a.readinessScore}% prepared</span>
      </div>
      <p>{a.summary}</p>
      <Field label="Resume version">
        <select
          value={a.resumeVersionId || ''}
          onChange={(e) =>
            void task(() =>
              repository.saveApplication({
                ...a,
                resumeVersionId: e.target.value,
                updatedAt: new Date().toISOString(),
              }),
            )
          }
        >
          <option value="">Select a resume</option>
          {data.profile.resumeVersions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} — {r.roleFamily}
            </option>
          ))}
        </select>
      </Field>
      <p>
        Suggested keywords from your profile:{' '}
        {a.highlightedSkills.join(', ') || 'Add verified skills to your profile'}
      </p>
      <Field label="Cover message">
        <textarea
          rows={8}
          value={letter}
          onChange={(e) => setLetter(e.target.value)}
          onBlur={() => {
            if (letter !== a.coverLetter)
              void task(() =>
                repository.saveApplication({
                  ...a,
                  coverLetter: letter,
                  updatedAt: new Date().toISOString(),
                }),
              );
          }}
        />
      </Field>
      <div className="toolbar">
        <button
          onClick={() => void task(() => navigator.clipboard.writeText(letter), 'Message copied')}
        >
          Copy message
        </button>
        <button
          disabled={!resume}
          onClick={() => resume && download(resume.content, resume.name + '.txt', 'text/plain')}
        >
          Download resume text
        </button>
        <button
          onClick={() =>
            download(
              JSON.stringify(
                {
                  ...a,
                  coverLetter: letter,
                  jobTitle: job.title,
                  company: job.company,
                  applicationUrl: job.url,
                },
                null,
                2,
              ),
              'application-package.json',
            )
          }
        >
          Download package
        </button>
        <a className="button" href={job.url} target="_blank" rel="noopener noreferrer">
          Open application ↗
        </a>
      </div>
      {a.stage !== 'READY' ? (
        <>
          <p>
            Review your resume, claims, salary expectations, and employer questions before
            submitting.
          </p>
          <button
            className="primary"
            disabled={!resume || !data.profile.headline}
            onClick={() =>
              void task(
                () =>
                  repository.saveApplication({
                    ...a,
                    coverLetter: letter,
                    stage: 'READY',
                    readinessScore: 100,
                    blockers: [],
                    updatedAt: new Date().toISOString(),
                  }),
                'Package ready',
              )
            }
          >
            I reviewed this package — mark ready
          </button>
        </>
      ) : (
        <button
          className="primary"
          onClick={() =>
            void task(
              () =>
                repository.saveApplication({
                  ...a,
                  stage: 'APPLIED',
                  appliedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }),
              'Application marked as submitted',
            )
          }
        >
          I submitted this application — mark applied
        </button>
      )}
      <details>
        <summary>Blockers and checks</summary>
        {a.blockers.map((b) => (
          <p key={b}>{b}</p>
        ))}
      </details>
    </section>
  );
}
function Insights({ data }: { data: Snapshot }) {
  const decisions = data.decisions.filter((d) => d.action === 'SELECT' || d.action === 'REJECT'),
    applied = data.applications.filter((a) => !!a.appliedAt),
    replies = data.contacts.filter((c) => ['REPLIED', 'REFERRAL_RECEIVED'].includes(c.status));
  return (
    <>
      <PageTitle
        title="See the bigger picture"
        subtitle="A clear view of your search, computed entirely on this device."
      />
      <div className="metrics">
        <Metric label="Jobs discovered" value={data.jobs.length} note="Includes labeled samples" />
        <Metric label="Applications sent" value={applied.length} note="Manually confirmed" />
        <Metric label="Contact replies" value={replies.length} note="Recorded by you" />
      </div>
      <div className="panel stack">
        <h2>Your application funnel</h2>
        {[
          ['Discovered', data.jobs.length],
          ['Selected decisions', decisions.filter((d) => d.action === 'SELECT').length],
          ['Prepared', data.applications.length],
          ['Applied', applied.length],
          [
            'Interview',
            data.applications.filter((a) => ['INTERVIEW', 'FINAL'].includes(a.stage)).length,
          ],
          [
            'Offers',
            data.applications.filter((a) => ['OFFER', 'ACCEPTED'].includes(a.stage)).length,
          ],
        ].map(([label, value]) => (
          <div className="funnel-row" key={label}>
            <span>{label}</span>
            <div>
              <i
                style={{
                  width: `${Math.max(1, (Number(value) / Math.max(1, data.jobs.length)) * 100)}%`,
                }}
              />
            </div>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="panel stack">
        <h2>Source quality</h2>
        {data.sources.map((s) => (
          <div className="summary-line" key={s.id}>
            <strong>{s.name}</strong>
            <span>
              {data.jobs.filter((j) => j.sourceIds.some((v) => v.source === s.id)).length} stored ·{' '}
              {s.status}
            </span>
          </div>
        ))}
        <h3>Discovery history</h3>
        {[...data.runs]
          .reverse()
          .slice(0, 10)
          .map((r) => (
            <p key={r.id}>
              {new Date(r.startedAt).toLocaleString()} · {r.status} · {r.discovered} new jobs{' '}
              {r.errors.length ? `· ${r.errors.length} source errors` : ''}
            </p>
          ))}
      </div>
    </>
  );
}
