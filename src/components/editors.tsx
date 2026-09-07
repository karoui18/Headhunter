'use client';
import { useState } from 'react';
import type { CandidatePreferences, CandidateProfile, Contact, Job } from '../domain/model';
import { Field, commaList } from './ui';
import { importJobs } from '../application/import';
import { normalizeJob } from '../application/normalize';
import { decryptBackup, download, encryptBackup } from '../infrastructure/backup';
import type { JobRepository } from '../infrastructure/database';
type Task = (action: () => Promise<unknown>, message?: string) => Promise<void>;
export function ProfileEditor({
  profile,
  save,
}: {
  profile: CandidateProfile;
  save: (p: CandidateProfile) => Promise<void>;
}) {
  const [p, set] = useState(profile);
  const [resumeName, setName] = useState('');
  const [resumeRole, setRole] = useState('');
  const [resumeContent, setContent] = useState('');
  return (
    <form
      className="panel form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        void save({ ...p, updatedAt: new Date().toISOString() });
      }}
    >
      <div className="full">
        <h2>Your experience, in your words</h2>
        <p>
          Only enter verified facts. These inform eligibility; your desired next role belongs in
          Filters.
        </p>
      </div>
      <Field label="Professional headline">
        <input
          value={p.headline}
          onChange={(e) => set({ ...p, headline: e.target.value })}
          placeholder="Your verified professional summary"
        />
      </Field>
      <Field label="Years of experience">
        <input
          type="number"
          min="0"
          max="80"
          value={p.yearsExperience}
          onChange={(e) => set({ ...p, yearsExperience: Number(e.target.value) })}
        />
      </Field>
      {(
        [
          'targetRoles',
          'adjacentRoles',
          'skills',
          'domains',
          'certifications',
          'languages',
        ] as const
      ).map((key) => (
        <Field
          label={
            {
              targetRoles: 'Experienced role families',
              adjacentRoles: 'Adjacent roles',
              skills: 'Verified skills',
              domains: 'Domain experience',
              certifications: 'Certifications',
              languages: 'Languages',
            }[key] + ' (comma separated)'
          }
          key={key}
        >
          <input
            defaultValue={p[key].join(', ')}
            onBlur={(e) => set({ ...p, [key]: commaList(e.target.value) })}
          />
        </Field>
      ))}
      <div className="full">
        <h3>Resume versions</h3>
        <p>
          Stored in this browser. Paste resume text to enable local matching and package downloads.
        </p>
        {p.resumeVersions.map((r) => (
          <div className="row" key={r.id}>
            <span>
              {r.name} <small>{r.roleFamily}</small>
            </span>
            <button
              type="button"
              onClick={() =>
                set({ ...p, resumeVersions: p.resumeVersions.filter((v) => v.id !== r.id) })
              }
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <Field label="Resume name">
        <input
          value={resumeName}
          onChange={(e) => setName(e.target.value)}
          placeholder="Transformation CV"
        />
      </Field>
      <Field label="Resume role family">
        <input
          value={resumeRole}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Transformation"
        />
      </Field>
      <div className="full">
        <Field label="Resume text">
          <textarea rows={6} value={resumeContent} onChange={(e) => setContent(e.target.value)} />
        </Field>
        <button
          type="button"
          disabled={!resumeName.trim() || !resumeContent.trim()}
          onClick={() => {
            set({
              ...p,
              resumeVersions: [
                ...p.resumeVersions,
                {
                  id: crypto.randomUUID(),
                  name: resumeName,
                  roleFamily: resumeRole,
                  content: resumeContent,
                },
              ],
            });
            setName('');
            setContent('');
          }}
        >
          Add resume version
        </button>
      </div>
      <button className="primary" type="submit">
        Save profile
      </button>
    </form>
  );
}
export function FiltersEditor({
  preferences,
  save,
}: {
  preferences: CandidatePreferences;
  save: (p: CandidatePreferences) => Promise<void>;
}) {
  const [p, set] = useState(preferences);
  return (
    <form
      className="panel form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        void save(p);
      }}
    >
      <div className="full">
        <h2>Define your next chapter</h2>
        <p>Hard filters hide jobs from Discover. Every job is retained in history for review.</p>
      </div>
      {(
        [
          'roleQueries',
          'countries',
          'cities',
          'preferredDomains',
          'excludedCompanies',
          'excludedKeywords',
          'includeKeywords',
        ] as const
      ).map((key) => (
        <Field
          label={
            {
              roleQueries: 'Search role families',
              countries: 'Countries',
              cities: 'Cities',
              preferredDomains: 'Preferred domains',
              excludedCompanies: 'Excluded companies',
              excludedKeywords: 'Excluded keywords',
              includeKeywords: 'Required keywords',
            }[key] + ' (comma separated)'
          }
          key={key}
        >
          <input
            defaultValue={p[key].join(', ')}
            onBlur={(e) => set({ ...p, [key]: commaList(e.target.value) })}
          />
        </Field>
      ))}
      <Field label="Salary currency">
        <select value={p.currency} onChange={(e) => set({ ...p, currency: e.target.value })}>
          {['EUR', 'CHF', 'GBP', 'USD', 'AED'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </Field>
      {(
        [
          'minSalary',
          'targetSalary',
          'maxOfficeDays',
          'maxTravelPercent',
          'maxAgeDays',
          'followUpDays',
        ] as const
      ).map((key) => (
        <Field
          label={
            {
              minSalary: 'Minimum annual salary',
              targetSalary: 'Target annual salary',
              maxOfficeDays: 'Maximum office days / week',
              maxTravelPercent: 'Maximum travel %',
              maxAgeDays: 'Maximum posting age (days)',
              followUpDays: 'Follow-up after business days',
            }[key]
          }
          key={key}
        >
          <input
            type="number"
            min={key === 'maxAgeDays' || key === 'followUpDays' ? 1 : 0}
            max={
              key === 'maxOfficeDays'
                ? 7
                : key === 'maxTravelPercent'
                  ? 100
                  : key === 'followUpDays'
                    ? 60
                    : key === 'maxAgeDays'
                      ? 365
                      : undefined
            }
            value={p[key]}
            onChange={(e) => set({ ...p, [key]: Number(e.target.value) })}
          />
        </Field>
      ))}
      <div className="full">
        <h3>
          Allowed remote modes <small>(none selected = all)</small>
        </h3>
        <div className="check-grid">
          {(['REMOTE', 'REMOTE_FIRST', 'HYBRID', 'ONSITE', 'FLEXIBLE', 'UNKNOWN'] as const).map(
            (mode) => (
              <label key={mode}>
                <input
                  type="checkbox"
                  checked={p.remoteModes.includes(mode)}
                  onChange={(e) =>
                    set({
                      ...p,
                      remoteModes: e.target.checked
                        ? [...p.remoteModes, mode]
                        : p.remoteModes.filter((v) => v !== mode),
                    })
                  }
                />
                {mode.toLowerCase().replace('_', ' ')}
              </label>
            ),
          )}
        </div>
      </div>
      <div className="full check-grid">
        {(
          [
            'excludeOnsite',
            'excludeRelocation',
            'requireAbroad',
            'travelDesired',
            'permanentOnly',
            'minSeniority',
            'learningEnabled',
          ] as const
        ).map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={p[key]}
              onChange={(e) => set({ ...p, [key]: e.target.checked })}
            />
            {
              {
                excludeOnsite: 'Exclude on-site roles',
                excludeRelocation: 'Exclude required relocation',
                requireAbroad: 'Require confirmed work abroad',
                travelDesired: 'Prefer travel',
                permanentOnly: 'Permanent roles only',
                minSeniority: 'Exclude junior roles',
                learningEnabled: 'Learn from decisions',
              }[key]
            }
          </label>
        ))}
      </div>
      <p className="full">
        Salary filters compare advertised annual amounts in the selected currency. Unknown salaries
        remain visible.
      </p>
      <button className="primary">Save filters</button>
    </form>
  );
}
export function AddJob({ onAdd }: { onAdd: (jobs: Job[]) => Promise<void> }) {
  const [mode, setMode] = useState<'paste' | 'json' | 'csv'>('paste');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          const f = new FormData(e.currentTarget);
          const jobs =
            mode === 'paste'
              ? [
                  await normalizeJob({
                    title: f.get('title'),
                    company: f.get('company'),
                    location: f.get('location') || 'Unknown',
                    url: f.get('url'),
                    description: f.get('description'),
                  }),
                ]
              : await importJobs(String(f.get('content')), mode);
          await onAdd(jobs);
        } catch (e) {
          setError(String(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="tabs">
        {(['paste', 'json', 'csv'] as const).map((v) => (
          <button
            type="button"
            className={mode === v ? 'active' : ''}
            key={v}
            onClick={() => setMode(v)}
          >
            {v === 'paste' ? 'Paste description' : v.toUpperCase()}
          </button>
        ))}
      </div>
      {mode === 'paste' ? (
        <>
          {['title', 'company', 'location', 'url'].map((name) => (
            <Field
              key={name}
              label={name === 'url' ? 'URL' : name[0].toUpperCase() + name.slice(1)}
            >
              <input
                name={name}
                required={name !== 'location'}
                type={name === 'url' ? 'url' : 'text'}
              />
            </Field>
          ))}
          <Field label="Job description">
            <textarea name="description" rows={8} required />
          </Field>
        </>
      ) : (
        <>
          <p>Required fields: title, company, url, description. Optional: location.</p>
          <Field label="Import file">
            <input
              type="file"
              accept={mode === 'json' ? '.json' : '.csv'}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const target = document.querySelector<HTMLTextAreaElement>('[name="content"]');
                  if (target) target.value = await file.text();
                }
              }}
            />
          </Field>
          <Field label={mode.toUpperCase() + ' content'}>
            <textarea name="content" rows={10} required />
          </Field>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {busy ? 'Importing…' : 'Add to job library'}
      </button>
    </form>
  );
}
export function ContactEditor({
  jobs,
  contact,
  onSave,
}: {
  jobs: Job[];
  contact?: Contact;
  onSave: (c: Contact) => Promise<void>;
}) {
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void onSave({
          id: contact?.id || crypto.randomUUID(),
          name: String(f.get('name')),
          company: String(f.get('company')),
          title: String(f.get('title')),
          email: String(f.get('email')),
          linkedInUrl: String(f.get('linkedInUrl')),
          relationship: String(f.get('relationship')) as Contact['relationship'],
          relatedJobIds: f.get('jobId') ? [String(f.get('jobId'))] : [],
          status: contact?.status || 'IDENTIFIED',
          notes: String(f.get('notes')),
          updatedAt: new Date().toISOString(),
        });
      }}
    >
      {['name', 'company', 'title', 'email', 'linkedInUrl'].map((key) => (
        <Field
          label={
            {
              name: 'Name',
              company: 'Company',
              title: 'Title',
              email: 'Email',
              linkedInUrl: 'LinkedIn URL',
            }[key] || key
          }
          key={key}
        >
          <input
            name={key}
            defaultValue={(contact?.[key as keyof Contact] as string) || ''}
            required={['name', 'company'].includes(key)}
            type={key === 'email' ? 'email' : key === 'linkedInUrl' ? 'url' : 'text'}
          />
        </Field>
      ))}
      <Field label="Relationship">
        <select name="relationship" defaultValue={contact?.relationship}>
          {['RECRUITER', 'HIRING_MANAGER', 'TEAM_MEMBER', 'POTENTIAL_REFERRAL', 'OTHER'].map(
            (v) => (
              <option key={v}>{v}</option>
            ),
          )}
        </select>
      </Field>
      <Field label="Related job">
        <select name="jobId" defaultValue={contact?.relatedJobIds[0]}>
          <option value="">No linked job</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.company} — {j.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notes">
        <textarea name="notes" defaultValue={contact?.notes} />
      </Field>
      <button className="primary">Save contact</button>
    </form>
  );
}
export function BackupPanel({ repo, task }: { repo: JobRepository; task: Task }) {
  const [password, setPassword] = useState('');
  const [file, setFile] = useState<File>();
  const [replace, setReplace] = useState(false);
  return (
    <div className="panel stack">
      <h2>Keep a copy of your progress</h2>
      <p>
        Your Job Hunter data is stored on this device/browser. Export a backup regularly, especially
        before clearing browser data.
      </p>
      <button
        className="primary"
        onClick={() =>
          void task(
            async () =>
              download(
                await repo.exportBackup(),
                `job-hunter-${new Date().toISOString().slice(0, 10)}.json`,
              ),
            'Backup exported',
          )
        }
      >
        Export full JSON backup
      </button>
      <Field label="Encryption password (minimum 10 characters)">
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <button
        disabled={password.length < 10}
        onClick={() =>
          void task(
            async () =>
              download(
                await encryptBackup(await repo.exportBackup(), password),
                'backup.jobhunter',
              ),
            'Encrypted backup exported',
          )
        }
      >
        Export encrypted backup
      </button>
      <hr />
      <h3>Restore a backup</h3>
      <Field label="Backup file">
        <input
          type="file"
          accept=".json,.jobhunter"
          onChange={(e) => setFile(e.target.files?.[0])}
        />
      </Field>
      <label className="check">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        Replace this browser’s current data with the backup
      </label>
      <button
        disabled={!file || !replace}
        onClick={() =>
          void task(async () => {
            if (!file) return;
            const content = await file.text();
            await repo.importBackup(
              file.name.endsWith('.jobhunter') ? await decryptBackup(content, password) : content,
            );
          }, 'Backup restored')
        }
      >
        Validate and restore
      </button>
    </div>
  );
}
