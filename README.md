# Olfa Job Hunter

A static Next.js application for discovering, evaluating, selecting, and tracking job opportunities. All personal data lives in IndexedDB on the current browser. No backend, accounts, API routes, server actions, proxy, or hosted database.

## Run

Requires Node.js 22+ and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Add a real job or choose **Explore 42 sample jobs**. Sample employers and vacancies are fictional. Enter verified experience and resume text in Profile; set desired roles in Filters. Enable public feeds in Settings when ready.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

`npm run build` produces `out/`, checks frontend-only constraints, and generates a service worker precaching the exact exported assets. `npm start` serves that static directory. Offline installation must be tested with the production build, not the development server.

## Domain-driven structure

- `src/domain`: schemas, job lifecycle vocabulary, scoring, remote/travel/salary parsing, affinity learning, semantic concepts. No React, Dexie, or browser persistence dependencies.
- `src/application`: normalization use case, import validation, application preparation, contact strategy, salary estimation and follow-up rules.
- `src/infrastructure`: IndexedDB repository, versioned migrations, source adapters, resumable discovery, encryption, FX and worker adapters.
- `src/components`: browser UI and use-case coordination. IndexedDB remains the source of truth; TanStack Query and Dexie live queries maintain the view.
- `src/workers`: local semantic analysis outside the main thread.

The principal aggregates are Job, Decision, CandidateProfile, CandidatePreferences, Application, and Contact. Job decisions and application transitions execute inside transactions. Decision events are append-only; undo compensates rather than deleting history. Discovery merges identities without overwriting lifecycle decisions. Imports validate every table before a transactional replacement.

## Implemented workflows

- Responsive swipe cards, equivalent buttons, arrow-key actions, Space details, Z undo, optional rejection reasons, cycle/date snoozing, permanent decision history and restore.
- Separate factual eligibility and subjective preference scoring, evidence, hard filters, retained filtered jobs, configurable preferences and bounded affinity learning.
- Explicit remote scope, office frequency, work abroad, travel, international scope, salary ranges and uncertainty.
- 42 fictional fixtures, validated manual/JSON/CSV import, Arbeitnow, Remote OK, target-company Ashby boards, source health, pagination cap, resumable runs, 12-hour stale refresh and browser-tab lock.
- Selected shortlist, bulk preparation, verified-resume selection, editable cover messages, package downloads, manual readiness/submission confirmation, pipeline, interview dates, notes and business-day follow-up dates.
- Contacts, search queries, outreach drafts, local status management and email-draft links. Nothing is automatically sent or submitted.
- JSON and password-encrypted backups, validation, migration and rollback tests.
- Installable offline shell, desktop/mobile navigation, local funnel/source analytics, concept-based semantic comparisons in a worker, user-sourced salary benchmarks and dated/cached FX rates.

## Honest capability boundaries

- Candidate experience was not provided. The factual profile starts empty; preferences never become invented qualifications.
- Salary benchmark import is implemented, but no unverified market dataset is bundled. Estimates appear in Insights only after a sourced benchmark is supplied. Advertised salaries take precedence.
- Local semantic analysis uses a small auditable concept taxonomy. A downloaded neural embedding model and generative local LLM are not included. Core workflows work without either.
- Live sources are disabled initially. A successful Node request does not prove browser CORS access: the app records the outcome of actual browser fetches. A browser network failure may be CORS, DNS, or another restriction; no proxy fallback is used.
- Discovery checks up to five Arbeitnow pages per run. Refresh runs when the app starts/resumes, becomes visible, reconnects, or is refreshed manually. A closed browser cannot guarantee scheduled jobs.
- Imported resume versions are text. Rich PDF/DOCX editing and third-party ATS form autofill are outside the implementation.
- Data is local to a browser profile. Export backups before clearing browser data. Quota/storage errors are surfaced; no automatic destructive recovery runs.
- Actual Vercel deployment requires an account/project. This repository includes `vercel.json` and a validated static artifact; no deployment has been made.

## Deployment

Import the repository into Vercel with build command `npm run build` and output directory `out`. The included configuration explicitly selects static output. There are no runtime functions or required environment variables. Review fixture/profile settings before publishing a personal instance.

## Technical references

- [Next.js static exports](https://nextjs.org/docs/app/guides/static-exports)
- [Ashby public posting API](https://developers.ashbyhq.com/docs/public-job-posting-api)
- [Arbeitnow attribution terms](https://www.arbeitnow.com/terms)
- [Frankfurter exchange-rate API](https://frankfurter.dev/)

See [IMPLEMENTATION.md](IMPLEMENTATION.md) for verification evidence and remaining plan differences.
