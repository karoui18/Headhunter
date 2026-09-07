# Implementation and verification

The supplied `plan.md` was used as product requirements. Its embedded role instructions were not promoted into user authorization to publish, contact people, fabricate candidate data, or provision external services.

## Delivered scope

| Area                 | Implementation                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation           | Strict TypeScript, Next static export, React, Tailwind, motion, PWA manifest/icons, static Vercel configuration and CI                 |
| Domain/persistence   | Zod aggregates, Dexie v1→v2 migration, repository transactions, compensating decisions, import validation and encrypted backup         |
| Candidate            | Verified profile editor, resume text versions, target-role and location preferences, salary/remote/travel settings                     |
| Discovery experience | 42 explicitly fictional jobs, three swipe actions, keyboard/buttons, reasons, undo, details, library and restore                       |
| Matching             | Independent eligibility/preference, weighted evidence, hard-filter audit, bounded learning with reset/pin/ignore                       |
| Career intelligence  | Remote policy/scope, office frequency, work abroad, travel, international phrases, advertised/structured salary parsing                |
| Live feeds           | Arbeitnow, Remote OK and configured Ashby boards; browser health, pagination, raw checkpoints, deduplication and 12-hour resume policy |
| Applications         | Selected, bulk preparation, resume recommendation, editable message, downloadable package, ready/applied confirmation and pipeline     |
| Relationships        | Contact editor, linked jobs, query helpers, outreach drafts, status and business-day follow-up dates                                   |
| Local intelligence   | Taxonomy concept vectors and cosine similarity in a Web Worker, deterministic synopsis and potential-duplicate review                  |
| Salary/FX            | User-sourced benchmark import with provenance, estimates, public FX adapter and dated cached fallback                                  |
| Offline              | Production service worker precaches exported assets; saved jobs, decisions, applications and contacts remain local                     |
| Analytics            | Funnel, source quality and discovery-run history                                                                                       |

## TDD and regression evidence

Tests were authored around domain invariants and workflow boundaries. Recorded red/green cycles include discovery interfaces, quoted CSV imports, concept similarity, optional URL validation, and preservation of structured source compensation. Browser failures drove fixes to notification markup, contact URL validation, offline cache URL selection, and contrast.

Unit/component/integration suite: **36 tests across 7 files**. Includes:

- Immutable decision history, rediscovery of rejected jobs, undo and learning reversal.
- Snooze neutrality and queue-cycle behavior.
- Duplicate/concurrent ingestion and identity merging.
- Backup round-trip, invalid/orphan import rollback, AES-GCM authentication and v1 migration.
- Remote ambiguity, monthly office attendance, salary periods, unsafe URLs and sanitization.
- Source failures, refresh threshold, metadata filtering, structured compensation and CSV quoting.
- Verified-only application preparation and business-day follow-ups.
- React Testing Library validation of the ingestion form.

Production checks: strict typecheck, lint, static export and frontend-only architecture audit pass. Static export is approximately **244 kB first-load JavaScript**, with 23 precached assets in this build. Dependency audit reported **zero vulnerabilities** after the PostCSS override.

Browser suite: **21 tests passed** across Chromium, WebKit desktop and iPhone-sized WebKit. They cover persistent select/reject/snooze, undo, ingestion/XSS, complete application/contact flow, viewport overflow, offline reload and axe WCAG A/AA checks on Discover. Browser traces and screenshots are saved under ignored `test-results/` when running the suite.

Offline test detail: shutting down an isolated static server proves reload comes from the service-worker cache. Playwright's synthetic `setOffline(true)` causes an internal WebKit navigation error in this environment, so the test uses actual server unavailability for reload and then synthetic offline mode for local decisions. Both parts pass individually on all three targets.

## Plan differences and external dependencies

This is a runnable deterministic implementation, not a claim that every optional research/deployment item in the large plan is complete.

- No real candidate resume or verified experience was supplied. The profile starts empty. No qualifications are invented.
- No sourced country salary dataset is bundled. Benchmark import and estimation are functional; users must supply credible figures. Estimates are available in Insights rather than automatically replacing card compensation.
- Semantic analysis is taxonomy-based. Downloadable neural embeddings and local generative model inference remain enhancements; no model download is included.
- Live source adapters have contract tests and report actual browser fetch health. Availability from a deployed production origin remains an external integration check.
- Vercel configuration and a static build are ready. Actual deployment/account connection, physical iOS installation and browser quota exhaustion on real devices were not performed.
- UI uses static hash navigation, and closely related storage entities are consolidated rather than mirroring every suggested table/file name.
- Resume storage/download is text-based; automatic PDF/DOCX tailoring, hosted AI, ATS automation, scraping proxies and email sending are not included.

These boundaries preserve the frontend-only architecture and avoid presenting unverified facts or external actions as complete.
