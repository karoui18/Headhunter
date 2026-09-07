'use client';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { db } from '../infrastructure/database';
import { runLocalIntelligence } from '../infrastructure/local-intelligence';
import type { Snapshot } from '../infrastructure/database';
import { type SemanticResult } from '../domain/semantic';
import { estimateSalary, type SalaryBenchmark } from '../application/career';
import { PublicFxProvider } from '../infrastructure/fx';
import { Field } from './ui';
const benchmarkSchema = z.array(
  z
    .object({
      market: z.string().min(1),
      roleFamily: z.string().min(1),
      min: z.number().nonnegative(),
      max: z.number().nonnegative(),
      currency: z.string().regex(/^[A-Z]{3}$/),
      sourceUrl: z.string().url(),
      sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .refine((v) => v.max >= v.min),
);
export function IntelligencePanel({ data }: { data: Snapshot }) {
  const [results, setResults] = useState<SemanticResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [benchmarks, setBenchmarks] = useState<SalaryBenchmark[]>([]);
  const [json, setJson] = useState('');
  const [fx, setFx] = useState('');
  const [from, setFrom] = useState('CHF');
  useEffect(() => {
    void db.settings.get('salaryBenchmarks').then((v) => {
      const parsed = benchmarkSchema.safeParse(v?.value);
      if (parsed.success) {
        setBenchmarks(parsed.data);
        setJson(JSON.stringify(parsed.data, null, 2));
      }
    });
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="panel stack">
        <h2>Local semantic analysis</h2>
        <p>
          Compare verified experience with job concepts in a Web Worker. The built-in taxonomy
          recognizes related terminology without downloading a model. Results supplement the
          deterministic score; possible duplicates require review.
        </p>
        <button
          disabled={busy || !data.jobs.length}
          onClick={() =>
            void run(async () => {
              const r = await runLocalIntelligence(
                [
                  data.profile.headline,
                  ...data.profile.skills,
                  ...data.profile.domains,
                  ...data.profile.targetRoles,
                ].join(' '),
                data.jobs,
              );
              setResults(r);
              await db.settings.put({ id: 'semanticResults', value: r });
            })
          }
        >
          Analyze on this device
        </button>
        {results
          .slice()
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 10)
          .map((r) => (
            <div className="evidence" key={r.jobId}>
              <h3>
                {data.jobs.find((j) => j.id === r.jobId)?.title} · {r.similarity}% concept
                similarity
              </h3>
              <p>{r.synopsis}</p>
              {r.possibleDuplicates.length > 0 && (
                <small>
                  {r.possibleDuplicates.length} possible duplicate(s), preserved for review
                </small>
              )}
            </div>
          ))}
      </div>
      <div className="panel stack">
        <h2>Sourced salary benchmarks</h2>
        <p>
          Import benchmarks you trust. Required fields: market, roleFamily, min, max, currency,
          sourceUrl, sourceDate. No market figures are supplied without provenance.
        </p>
        <Field label="Benchmark JSON">
          <textarea
            rows={6}
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder={
              '[{"market":"France","roleFamily":"Business Analyst","min":0,"max":0,"currency":"EUR","sourceUrl":"https://…","sourceDate":"YYYY-MM-DD"}]'
            }
          />
        </Field>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const parsed = benchmarkSchema.parse(JSON.parse(json));
              await db.settings.put({ id: 'salaryBenchmarks', value: parsed });
              setBenchmarks(parsed);
            })
          }
        >
          Validate and save benchmarks
        </button>
        {data.jobs
          .filter((j) => !j.compensation)
          .map((j) => ({ j, s: estimateSalary(j, benchmarks) }))
          .filter((v) => v.s)
          .slice(0, 10)
          .map(({ j, s }) => (
            <div className="evidence" key={j.id}>
              <h3>{j.title}</h3>
              <p>
                Estimate: {s!.currency} {s!.min.toLocaleString()}–{s!.max.toLocaleString()} · Low
                confidence
              </p>
              <p>{s!.evidence.join(' · ')}</p>
            </div>
          ))}
      </div>
      <div className="panel stack">
        <h2>Currency reference</h2>
        <p>
          Fetch a dated public reference rate. When unavailable, the last saved rate is shown as
          cached.
        </p>
        <Field label="Convert from">
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {['CHF', 'GBP', 'USD', 'EUR'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const q = await new PublicFxProvider(db).getRate(from, data.preferences.currency);
              setFx(
                `1 ${q.from} ≈ ${q.rate} ${q.to} · ${q.date}${q.cached ? ' · Cached rate' : ''}`,
              );
            })
          }
        >
          Get rate to {data.preferences.currency}
        </button>
        {fx && <p>{fx}</p>}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}
