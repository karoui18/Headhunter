'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import type { Job, Match } from '../domain/model';
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <header className="modal-header">
        <h2>{title}</h2>
        <button onClick={onClose} aria-label="Close dialog">
          ✕
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-symbol">✧</div>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function SalaryLabel({ job }: { job: Job }) {
  const s = job.compensation;
  return (
    <span>
      {s ? (
        <>
          {s.currency} {new Intl.NumberFormat('en', { notation: 'compact' }).format(s.min)}–
          {new Intl.NumberFormat('en', { notation: 'compact' }).format(s.max)}{' '}
          <small>
            / {s.period.toLowerCase()} ·{' '}
            {s.source === 'MARKET_ESTIMATE' ? 'Estimate' : 'Advertised'}
          </small>
        </>
      ) : (
        'Salary not disclosed'
      )}
    </span>
  );
}
export function Badges({ job }: { job: Job }) {
  const p = job.remotePolicy;
  return (
    <div className="badges">
      <span>
        ⌂ {p.mode === 'UNKNOWN' ? 'Remote unclear' : p.mode.toLowerCase().replace('_', ' ')}
      </span>
      {p.scope !== 'UNKNOWN' && (
        <span>◎ {p.allowedCountries.length ? p.allowedCountries.join(', ') : p.scope}</span>
      )}
      {p.officeFrequencyText && <span>▦ {p.officeFrequencyText}</span>}
      {job.travelRequirement.required && (
        <span>
          ↗ {job.travelRequirement.international ? 'International ' : ''}travel{' '}
          {job.travelRequirement.estimatedPercent !== undefined
            ? `${job.travelRequirement.estimatedPercent}%`
            : ''}
        </span>
      )}
      {['ALLOWED', 'LIMITED'].includes(p.workFromAbroad) && (
        <span>
          ✧ Work abroad{' '}
          {p.workFromAbroadDaysPerYear ? `${p.workFromAbroadDaysPerYear} days` : 'allowed'}
        </span>
      )}
    </div>
  );
}
export function Score({ match }: { match: Match }) {
  return (
    <div className="score">
      <strong>
        {match.overall}
        <small>%</small>
      </strong>
      <span>overall match</span>
    </div>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export const commaList = (value: string) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
