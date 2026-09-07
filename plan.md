# Olfa Job Hunter

## Agentic, local-first, frontend-only job discovery and application command center

**Target deployment:** Vercel
**Runtime architecture:** Static frontend only
**Framework:** Next.js + TypeScript
**Persistence:** IndexedDB
**Primary usage:** Desktop + mobile PWA
**Candidate:** initially single-user / Olfa-specific
**Backend:** none
**Serverless functions:** none
**Database server:** none
**Scheduled server jobs:** none
**Application philosophy:** local-first, transparent scoring, resumable autonomous client-side agents

---

# 0. Product mission

Build a personal job-hunting application that continuously transforms available job postings into a ranked, actionable queue.

The main interaction is swipe-based:

* **Swipe right → SELECT**

  * green overlay
  * job moves to Selected
* **Swipe left → REJECT**

  * red overlay
  * job leaves active queue
  * rejection contributes to preference learning
* **Swipe down → SNOOZE**

  * blue overlay
  * job is returned to the pile for later review
  * does not train the preference engine negatively
* **Tap → DETAILS**

  * opens complete analysis

The application must remember:

* every job ever encountered
* every decision
* why jobs were rejected or accepted
* jobs waiting for review
* jobs selected
* applications prepared
* applications submitted
* recruiter/hiring-manager contacts
* follow-ups
* interviews
* offers
* learned preferences

The system should gradually become better at answering:

> “Would Olfa actually want this job?”

rather than merely:

> “Does this description contain terms appearing in her CV?”

---

# 1. Non-negotiable architectural constraints

## 1.1 Frontend-only means frontend-only

The production application MUST NOT contain:

* `/api/*` routes
* Next.js Server Actions
* runtime server components depending on dynamic data
* middleware
* serverless functions
* Vercel Functions
* Edge Functions
* cron jobs
* hosted PostgreSQL
* hosted vector database
* Redis
* external persistence required for normal operation
* private secrets bundled into the application

Use:

```ts
// next.config.ts
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
```

All runtime operations happen in the browser.

---

# 2. Important consequence: the 12-hour discovery cycle

A static frontend cannot guarantee:

```text
08:00 search
20:00 search
08:00 search
20:00 search
```

when every browser running the application is closed.

Therefore implement:

```text
DISCOVERY_POLICY = stale-while-revalidate
STALE_AFTER = 12 hours
```

On:

* application startup
* tab becoming visible
* network reconnect
* PWA resume
* manual refresh

run:

```ts
if (now - lastSuccessfulDiscoveryAt >= 12h) {
    DiscoveryOrchestrator.run();
}
```

Additionally:

* register service worker
* use background capabilities where supported
* treat those as optimization only
* NEVER rely on background execution for correctness

UI:

```text
Jobs refreshed 3h ago
Next refresh due in ~9h

[ Refresh now ]
```

When stale:

```text
Job feed is 14h old
Refreshing…
```

---

# 3. High-level architecture

```text
┌────────────────────────────────────────────────────────────┐
│                         UI LAYER                           │
│                                                            │
│ Discover │ Selected │ Apply │ Contacts │ Pipeline │ Stats │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│                    AGENT ORCHESTRATOR                      │
│                                                            │
│ Discovery → Normalize → Enrich → Score → Rank → Queue     │
│                  ↘ Salary                                  │
│                  ↘ Remote Policy                           │
│                  ↘ Preference                              │
└────────────────────────────┬───────────────────────────────┘
                             │
              ┌──────────────┼───────────────┐
              ▼              ▼               ▼
      Source adapters   Local ML/Rules   Preference engine
              │              │               │
              └──────────────┼───────────────┘
                             ▼
┌────────────────────────────────────────────────────────────┐
│                        INDEXEDDB                           │
│                                                            │
│ Jobs │ Decisions │ Matches │ Applications │ Contacts       │
│ Preferences │ Search runs │ Salary │ Settings │ History    │
└────────────────────────────────────────────────────────────┘
```

---

# 4. Technology stack

## Required

```text
Next.js
TypeScript
React
Tailwind CSS
Framer Motion
Dexie.js
Zod
TanStack Query
DOMPurify
date-fns
```

Testing:

```text
Vitest
React Testing Library
Playwright
```

Optional local intelligence:

```text
Web Worker
Transformers.js-compatible embedding model
WebLLM-compatible local model
```

Do not make the local LLM necessary for core functionality.

---

# 5. Application navigation

Desktop sidebar:

```text
Olfa Job Hunter

🔥 Discover       42
❤️ Selected       11
📨 Apply           6
👥 Contacts        8
📊 Pipeline       14
📈 Insights

──────────────

⚙ Filters
👤 Profile
🧠 Preferences
💾 Backup
⚙ Settings
```

Mobile bottom navigation:

```text
Discover | Selected | Apply | Pipeline | More
```

---

# 6. Primary domain model

Use explicit TypeScript domain objects.

## CandidateProfile

```ts
interface CandidateProfile {
  id: string;

  headline: string;
  yearsExperience: number;

  targetRoles: string[];
  adjacentRoles: string[];

  industries: string[];
  domains: string[];

  skills: CandidateSkill[];
  certifications: string[];

  languages: LanguageSkill[];

  preferredCountries: string[];
  preferredCities: string[];

  currentCompensation?: Compensation;

  resumeVersions: ResumeVersion[];

  updatedAt: string;
}
```

---

# 7. Candidate preference model

Do not mix factual profile compatibility with subjective preference.

```ts
interface CandidatePreferences {
  targetCompensation: Record<string, SalaryPreference>;

  preferredRoleFamilies: WeightedPreference[];
  preferredIndustries: WeightedPreference[];
  preferredDomains: WeightedPreference[];

  remotePreferences: RemotePreferences;

  travelPreference: {
    desired: boolean;
    preferredMinPercent?: number;
    preferredMaxPercent?: number;
  };

  internationalExposureWeight: number;

  leadershipWeight: number;
  transformationWeight: number;
  productOwnershipWeight: number;

  excludedCompanies: string[];
  preferredCompanies: string[];

  hardFilters: HardFilter[];
}
```

---

# 8. Remote-work policy model

Remote-work policy must be a first-class object rather than a simple `remote: boolean`.

```ts
interface RemoteWorkPolicy {
  mode:
    | "REMOTE"
    | "REMOTE_FIRST"
    | "HYBRID"
    | "ONSITE"
    | "FLEXIBLE"
    | "UNKNOWN";

  scope:
    | "WORLDWIDE"
    | "EU"
    | "EEA"
    | "COUNTRY"
    | "REGION"
    | "TIMEZONE"
    | "CITY"
    | "UNKNOWN";

  allowedCountries?: string[];

  officeDaysPerWeek?: number;

  officeFrequencyText?: string;

  mandatoryOfficeDays?: boolean;

  workFromAbroad:
    | "ALLOWED"
    | "LIMITED"
    | "NOT_ALLOWED"
    | "UNKNOWN";

  workFromAbroadDaysPerYear?: number;

  relocationRequired?: boolean;

  timezoneRequirement?: string;

  timezoneOverlapHours?: number;

  policyStability:
    | "CONTRACTUAL"
    | "EXPLICIT_COMPANY_POLICY"
    | "MANAGER_DISCRETION"
    | "TEMPORARY"
    | "UNCLEAR";

  confidence: number;

  evidence: string[];
}
```

---

# 9. Remote-work flags displayed on job cards

Examples:

```text
🏠 Fully remote
🌍 Worldwide
🇪🇺 EU remote
🇫🇷 France only
🏢 2 days/week office
🧳 Work abroad allowed
🧳 30 days/year abroad
⏰ CET ±2h required
📍 Paris presence required
⚠️ Remote policy unclear
⚠️ Manager discretion
⚠️ "Remote" but country restricted
⚠️ Temporary remote policy
```

---

# 10. Remote policy green/red flags

## Green

Examples:

```text
✓ Fully remote
✓ Remote-first
✓ Remote across EU
✓ Work-from-abroad explicitly allowed
✓ ≤1 office day/week
✓ Clear written remote policy
✓ Flexible location
```

## Neutral

```text
• 2 days/week hybrid
• Remote restricted to France
• Occasional office attendance
```

## Red

Depending on user preferences:

```text
✕ ≥3 mandatory office days/week
✕ On-site only
✕ Relocation mandatory
✕ Remote wording contradicted by description
✕ Policy depends entirely on manager
✕ Temporary remote arrangement
✕ Work-from-abroad forbidden
```

All thresholds must be configurable.

---

# 11. Travel is separate from remote work

Do NOT equate:

```text
remote = travel
```

Represent travel separately.

```ts
interface TravelRequirement {
  required: boolean;
  estimatedPercent?: number;

  frequency:
    | "NONE"
    | "OCCASIONAL"
    | "MONTHLY"
    | "WEEKLY"
    | "FREQUENT"
    | "UNKNOWN";

  geography?: string[];

  international: boolean;

  confidence: number;

  evidence: string[];
}
```

Possible card:

```text
🏠 Hybrid · 1d/week
✈️ International travel · ~20%
🌍 EMEA scope
```

---

# 12. Job model

```ts
interface Job {
  id: string;

  sourceIds: JobSourceIdentity[];

  fingerprint: string;

  url: string;

  title: string;
  normalizedTitle: string;

  company: Company;

  locations: JobLocation[];

  descriptionRaw: string;
  descriptionText: string;

  employmentType?: string;
  seniority?: string;

  publishedAt?: string;
  discoveredAt: string;
  lastSeenAt: string;

  remotePolicy: RemoteWorkPolicy;

  travelRequirement: TravelRequirement;

  compensation?: AdvertisedCompensation;

  requirements: JobRequirement[];

  responsibilities: string[];

  technologies: string[];

  languages: string[];

  industries: string[];

  domains: string[];

  internationalScope?: InternationalScope;

  status: JobLifecycleStatus;
}
```

---

# 13. Job lifecycle

```ts
type JobLifecycleStatus =
  | "NEW"
  | "QUEUED"
  | "SEEN"
  | "SNOOZED"
  | "SELECTED"
  | "REJECTED"
  | "APPLICATION_READY"
  | "APPLIED"
  | "INTERVIEW"
  | "COMPANY_REJECTED"
  | "WITHDRAWN"
  | "OFFER"
  | "ACCEPTED"
  | "ARCHIVED";
```

---

# 14. Append-only decision history

Never simply overwrite:

```ts
job.status = "REJECTED";
```

Record decisions.

```ts
interface DecisionEvent {
  id: string;
  jobId: string;

  action:
    | "SELECT"
    | "REJECT"
    | "SNOOZE"
    | "UNDO"
    | "RESTORE";

  reasons: DecisionReason[];

  createdAt: string;

  matchScoreAtDecision: number;

  preferenceScoreAtDecision: number;
}
```

This allows future reprocessing.

---

# 15. Rejection reasons

After left swipe:

```text
Rejected ✓

Why?

[ Salary ]
[ Location ]
[ Too operational ]
[ Too junior ]
[ Too senior ]
[ Wrong domain ]
[ No international scope ]
[ Remote policy ]
[ Too much office ]
[ No travel ]
[ Company ]
[ Responsibilities ]
[ Other ]

Skip
```

Reason collection should be optional and fast.

---

# 16. Snooze semantics

Swipe down must NOT mean rejection.

Default:

```ts
snoozeUntil = currentQueueCycleCompleted;
```

Alternative user options:

```text
See again:
○ Later in this session
○ Tomorrow
○ In 3 days
○ Next week
```

Snooze must generate **zero negative preference signal**.

---

# 17. Discovery agent

Logical agent:

```text
DiscoveryAgent
```

Responsibilities:

1. load enabled sources
2. construct queries
3. fetch pages
4. handle pagination
5. persist raw results
6. record source errors
7. trigger NormalizationAgent

Input:

```ts
SearchConfiguration
```

Output:

```ts
DiscoveryBatch
```

---

# 18. Search configuration

```ts
interface SearchConfiguration {
  roleQueries: string[];

  locations: SearchLocation[];

  remoteModes: RemoteMode[];

  countries: string[];

  industries: string[];

  contractTypes: string[];

  minSalary?: number;

  travelPreference?: TravelSearchPreference;

  excludeKeywords: string[];

  includeKeywords: string[];

  maxAgeDays: number;

  sourceConfiguration: SourceConfiguration[];
}
```

---

# 19. Initial search query families

Do not search one exact title only.

Maintain role families.

Example:

```text
Senior Business Analyst
Lead Business Analyst
Principal Business Analyst
Business Transformation Manager
Transformation Lead
Product Owner
Senior Product Owner
Program Manager
Programme Manager
Senior Project Manager
Functional Consultant
Capital Markets Business Analyst
Global Markets Business Analyst
AML Transformation
KYC Transformation
Regulatory Transformation
Operations Transformation
Front-to-Back Transformation
```

Each query belongs to:

```text
EXACT_TARGET
ADJACENT_TARGET
CAREER_STRETCH
EXPLORATORY
```

---

# 20. Job source architecture

Every source implements:

```ts
interface JobSourceAdapter {
  id: string;

  canRunInBrowser(): Promise<boolean>;

  search(
    config: SearchConfiguration,
    context: DiscoveryContext
  ): Promise<RawJob[]>;

  normalize(raw: RawJob): Promise<Partial<Job>>;

  getHealth(): SourceHealth;
}
```

---

# 21. Source priority

## Tier 1 — browser-friendly public sources

Initial candidates:

```text
Arbeitnow
Remote OK
```

Use these first because they can provide broad discovery without requiring a backend.

---

# 22. Tier 2 — target-company ATS feeds

For companies specifically targeted by the user:

```text
Ashby public boards
other ATS boards where browser access/CORS is verified
```

Maintain:

```ts
interface TargetCompanyBoard {
  company: string;
  ats: string;
  boardIdentifier: string;
  enabled: boolean;
}
```

This is particularly valuable for:

```text
UBS
HSBC
BNP Paribas
Société Générale
LSEG
Euronext
consultancies
fintechs
large transformation organizations
```

depending on their actual ATS availability.

---

# 23. CORS capability test

Never assume an API works from a static browser application.

Each adapter implements:

```ts
async function canRunInBrowser(): Promise<boolean>
```

Persist:

```text
Source status

Arbeitnow       ● operational
Remote OK       ● operational
Ashby/Company A ● operational
Source X        ○ unavailable
Lever           ○ browser restricted
```

---

# 24. Restricted sources

If an API cannot be queried from arbitrary browser origins:

```text
DO NOT
- add a hidden proxy
- add an API route
- add a Vercel Function
```

Instead:

```text
source status = UNSUPPORTED_FRONTEND_ONLY
```

This preserves the architectural contract.

---

# 25. Manual job ingestion

The app must support:

```text
+ Add job
```

Methods:

### Paste description

```text
Title
Company
URL
Description
```

### Paste JSON

For development/import.

### Import file

```text
.json
.csv
```

### Share/open integration later

PWA-friendly “Add to Job Hunter” workflow can be investigated separately.

---

# 26. Normalization agent

```text
NormalizationAgent
```

Responsibilities:

* strip unsafe HTML
* normalize whitespace
* extract title
* normalize company
* normalize locations
* detect currencies
* extract salary
* extract seniority
* extract responsibilities
* extract requirements
* identify domain
* identify role family
* detect languages
* identify remote policy
* detect travel
* detect international exposure

Output must conform to Zod schemas.

Never store arbitrary unvalidated source structures as canonical jobs.

---

# 27. Deduplication agent

A job may appear on several boards.

Preferred identity order:

```text
1. ATS external ID
2. canonical application URL
3. company + normalized title + location
4. semantic similarity
```

Generate:

```ts
fingerprint = sha256(
  normalizedCompany +
  normalizedTitle +
  normalizedPrimaryLocation
);
```

When duplicates exist:

```text
Job
 ├ source: Remote OK
 ├ source: company board
 └ source: aggregator
```

Keep:

* best description
* earliest publication date
* all application URLs
* salary information from most authoritative source

---

# 28. Remote Policy Agent

```text
RemotePolicyAgent
```

Look for phrases such as:

```text
fully remote
remote-first
work from anywhere
hybrid
flexible working
X days in office
office presence
work from home
remote within France
EU remote
must be based in
relocation
work from abroad
international remote
distributed team
```

Return:

```ts
{
  mode,
  scope,
  officeDaysPerWeek,
  workFromAbroad,
  policyStability,
  confidence,
  evidence
}
```

Never hallucinate missing policy.

If uncertain:

```text
mode: UNKNOWN
confidence: 0.25
```

Display:

```text
⚠ Remote policy unclear
```

rather than guessing.

---

# 29. International Exposure Agent

Detect:

```text
global team
international team
EMEA
APAC
multi-country rollout
global stakeholders
cross-border
regional transformation
distributed development teams
offshore teams
international clients
international travel
global operating model
```

Generate:

```ts
interface InternationalScope {
  score: number;
  regions: string[];
  globalStakeholders: boolean;
  distributedTeams: boolean;
  crossBorderProgram: boolean;
  evidence: string[];
}
```

---

# 30. Matching architecture

Use TWO independent scores.

## A. Eligibility score

Question:

> Can she credibly get this job?

```text
0–100
```

Suggested default:

| Dimension                  | Weight |
| -------------------------- | -----: |
| Role/function similarity   |     25 |
| Industry/domain experience |     20 |
| Responsibilities           |     20 |
| Seniority                  |     10 |
| Core skills                |     10 |
| Stakeholder/project scope  |      5 |
| Languages/location         |      5 |
| Certifications             |      5 |

---

# 31. Preference score

Question:

> Is this the kind of job she wants?

| Dimension                 | Weight |
| ------------------------- | -----: |
| Career progression        |     20 |
| International scope       |     20 |
| Compensation              |     20 |
| Remote policy             |     15 |
| Travel                    |     10 |
| Geography                 |      5 |
| Company/sector preference |      5 |
| Learned swipe preference  |      5 |

Configurable.

---

# 32. Overall score

Initial:

```ts
overall =
  eligibilityScore * 0.65 +
  preferenceScore * 0.35;
```

After enough behavioral history:

```ts
overall =
  eligibilityScore * 0.55 +
  preferenceScore * 0.30 +
  learnedPreferenceScore * 0.15;
```

Do NOT let learned behavior dominate too early.

---

# 33. Hard filters

Run before ranking.

Examples:

```text
wrong country
requires unsupported language
compensation below absolute threshold
100% onsite when explicitly excluded
junior role
internship
temporary role if permanent-only
excluded employer
```

Store filtered jobs anyway:

```text
FILTERED_OUT
```

with reason.

This enables auditing.

---

# 34. Green flags / red flags engine

Cards should expose compact explanations.

Example:

```text
GREEN FLAGS

✓ Capital markets
✓ 10+ year seniority match
✓ Transformation ownership
✓ International stakeholders
✓ EMEA program
✓ PMP relevant
✓ Travel expected
✓ Hybrid 1 day/week
```

```text
RED FLAGS

✕ German preferred
✕ No salary disclosed
✕ Some operational support
```

---

# 35. Requirement classification

Requirements must be categorized:

```ts
type RequirementImportance =
  | "MANDATORY"
  | "PREFERRED"
  | "OPTIONAL"
  | "UNKNOWN";
```

Match output:

```text
Mandatory requirements
8 / 9

Preferred
4 / 6

Potential gap
German B2
```

Do not mark every missing keyword as a gap.

---

# 36. Evidence-based explanations

Every important score should retain evidence.

Example:

```ts
interface ScoreEvidence {
  dimension: string;
  contribution: number;
  evidence: string[];
}
```

UI:

```text
International scope +9

“coordinate EMEA-wide transformation…”
“stakeholders across London, Paris and Zurich…”
```

---

# 37. Salary Agent

Priority:

```text
1. Explicit advertised salary
2. Salary inferred from structured source data
3. Salary benchmark
4. No estimate
```

Never replace advertised compensation with model estimate.

---

# 38. Salary estimate object

```ts
interface SalaryEstimate {
  source:
    | "ADVERTISED"
    | "STRUCTURED_SOURCE"
    | "MARKET_ESTIMATE";

  currency: string;

  min: number;
  midpoint: number;
  max: number;

  bonusMin?: number;
  bonusMax?: number;

  confidence: number;

  factors: SalaryFactor[];

  generatedAt: string;
}
```

---

# 39. Salary computation

Maintain static benchmark datasets:

```text
/public/data/salary/
    france.json
    switzerland.json
    luxembourg.json
    uk.json
    germany.json
    uae.json
```

Structure:

```ts
{
  market,
  roleFamily,
  industry,
  seniority,
  min,
  median,
  max,
  currency,
  sourceDate
}
```

Then adjust transparently:

```text
Base Senior BA Paris
€85k–105k

Capital Markets             +8%
10+ years                   +5%
Transformation scope        +5%
Leadership scope            +4%

Estimated:
€100k–120k
```

Avoid fake precision.

---

# 40. Salary confidence

Examples:

```text
HIGH
Published salary range

MEDIUM
Strong market benchmark + strong role classification

LOW
Sparse benchmark / unusual role
```

UI:

```text
Estimated €105k–120k
Confidence: Medium
```

---

# 41. Currency normalization

Display both:

```text
CHF 135k–150k
≈ EUR equivalent
```

FX provider interface:

```ts
interface FxProvider {
  getRate(from: string, to: string): Promise<number>;
}
```

Because this is frontend-only:

* use public browser-accessible source if available
* cache last rate
* display date
* never pretend cached exchange rate is live

---

# 42. Preference Learning Agent

```text
PreferenceLearningAgent
```

Inputs:

```text
SELECT
REJECT
explicit rejection reasons
manual preference changes
```

Ignore:

```text
SNOOZE
```

until a later definitive decision.

---

# 43. Initial preference learning algorithm

Do NOT begin with opaque neural training.

Use feature affinity.

Example features:

```text
capital_markets
aml
transformation
product
program_management
international
remote
hybrid
onsite
travel
consulting
bank
fintech
people_management
strategy
operations
regulatory
```

Each feature:

```ts
interface LearnedAffinity {
  feature: string;
  accepted: number;
  rejected: number;
  affinity: number; // -1 → +1
  confidence: number;
}
```

---

# 44. Preference update

Example:

```text
Accept global transformation role:
international       + signal
transformation      + signal
capital markets     + signal

Reject pure operations role:
operations          - signal
```

Require minimum observations before strongly influencing ranking.

Example:

```text
<10 decisions:
maximum influence ±2 points

10–30:
maximum ±5

30+:
maximum ±10
```

---

# 45. Learned preference transparency

Create:

```text
🧠 What Job Hunter learned
```

Example:

```text
You appear to prefer

↑ International transformation
↑ EMEA/global scope
↑ Strategic stakeholder roles
↑ Travel
↑ Product ownership

You frequently reject

↓ Pure BAU operations
↓ Local-only roles
↓ Roles below target compensation
↓ 4–5 day office requirements
```

Each learned item:

```text
[ Pin ]
[ Reset ]
[ Ignore ]
```

No black-box profiling.

---

# 46. Discovery queue ordering

Default:

```text
priority =
overall score
+ freshness boost
+ source confidence
+ novelty
```

Avoid putting 30 nearly identical jobs consecutively.

Add diversity constraint:

```text
max 3 consecutive jobs from same employer
max 5 consecutive jobs from same role family
```

---

# 47. Tinder card design

Example:

```text
┌────────────────────────────────────┐
│ UBS                           2d   │
│                                    │
│ Director Business Transformation   │
│ Zürich · Hybrid                     │
│                                    │
│ █████████████████░ 92% MATCH       │
│                                    │
│ CHF 135–155k est.                  │
│ Medium confidence                  │
│                                    │
│ 🏢 2d office    ✈️ 20% travel      │
│ 🌍 EMEA          🧳 abroad ✓        │
│                                    │
│ PROS              CONS             │
│ ✓ Markets         ✕ German +       │
│ ✓ Global          ✕ No salary      │
│ ✓ Leadership                       │
│ ✓ Transformation                   │
│                                    │
│ Eligibility 94  Preference 89      │
│                                    │
│          View analysis             │
└────────────────────────────────────┘
```

---

# 48. Swipe overlays

Right:

```text
GREEN GRADIENT

✓ SELECT
```

Left:

```text
RED GRADIENT

✕ PASS
```

Down:

```text
BLUE GRADIENT

↓ LATER
```

Animations should scale with drag distance.

Trigger only after threshold.

---

# 49. Accessibility

Every swipe MUST have an equivalent:

```text
[ Reject ] [ Later ] [ Select ]
```

Keyboard:

```text
← reject
↓ later
→ select
Space details
Z undo
```

Add proper ARIA labels.

Do not make gesture navigation mandatory.

---

# 50. Undo

After every swipe:

```text
Selected ✓                      Undo
```

Undo should restore:

* prior queue position where practical
* prior lifecycle state
* preference-learning signal

---

# 51. Detailed job screen

Tabs:

```text
Overview
Match
Description
Salary
Company
Remote & Travel
Application
Contacts
History
```

---

# 52. Selected tab

Views:

```text
All selected
Excellent match
Good match
Needs review
Application ready
```

Card/row:

```text
UBS
Director Business Transformation

Match          92
Eligibility    94
Preference     89

CHF 135–155k est.

Application readiness   80%

Recruiter       ✓
Hiring manager  ?
CV               ✓
Message          ✓

[ Prepare ]
```

---

# 53. Application Agent

Frontend-only constraint means:

**bulk preparation**, not blind bulk submission.

Logical agent:

```text
ApplicationAgent
```

Produces:

```text
job analysis
CV recommendation
CV variant
targeted summary
suggested keywords
cover message
salary expectation
application answers
contact strategy
application checklist
```

---

# 54. Application package

```ts
interface ApplicationPackage {
  jobId: string;

  resumeVersionId: string;

  tailoredSummary?: string;

  highlightedSkills: string[];

  coverLetter?: string;

  salaryExpectation?: SalaryExpectation;

  suggestedAnswers: ApplicationAnswer[];

  applicationUrl: string;

  readinessScore: number;

  blockers: string[];
}
```

---

# 55. Bulk Apply screen

Example:

```text
Prepare applications

☑ UBS                           95%
☑ HSBC                          92%
☑ Société Générale             90%
☑ LSEG                          87%
☑ Euronext                      84%

5 jobs selected

[ Prepare application packs ]
```

After preparation:

```text
5 / 5 ready

[ Start application session ]
```

---

# 56. Application session

Instead of trying to bypass ATS security:

```text
APPLICATION 1 / 5

UBS — Director Transformation

CV:
[ Download / Copy ]

Salary:
CHF 145,000 target

Recruiter message:
[ Copy ]

Application:
[ Open application ]

After submission:

[ Mark applied ]
[ Problem ]
[ Skip ]
```

Then automatically advance.

---

# 57. Why true ATS bulk submission is out of scope

A static site should NOT attempt:

* injecting forms into third-party ATS sites
* bypassing cross-origin browser protections
* storing ATS credentials
* automated account creation
* silently submitting declarations
* automated diversity answers
* work authorization declarations without review

If true autofill is required later, design a separate browser extension.

Do not compromise the frontend-only app to achieve it.

---

# 58. CV variants

Candidate profile may reference several CV versions:

```text
Senior Business Analyst
Transformation Lead
Product Owner
Program / Project Manager
Capital Markets
AML / Financial Crime
```

Each job receives:

```text
recommendedResumeVersion
```

with rationale.

---

# 59. ATS optimization

Application Agent checks:

```text
title alignment
keyword coverage
must-have terminology
certifications
domain terminology
responsibility language
seniority evidence
international scope
tools/methodologies
```

Do NOT invent experience.

Only reframe existing experience.

---

# 60. Contact Agent

```text
ContactStrategyAgent
```

For each selected job determine desired personas:

```text
1. likely recruiter
2. likely hiring manager
3. relevant team director
4. potential internal referral
```

Frontend-only means the app generates discovery queries rather than scraping social networks.

---

# 61. Contact search helpers

Generate searches such as:

```text
"UBS" "Talent Acquisition" "Transformation"
"UBS" "Global Markets" "Business Transformation" Director
"UBS" "Senior Business Analyst" Zürich
```

Provide:

```text
[ Search web ]
[ Search LinkedIn ]
```

User identifies relevant person.

Then:

```text
[ Add contact ]
```

---

# 62. Contact model

```ts
interface Contact {
  id: string;

  name: string;

  company: string;

  title?: string;

  linkedInUrl?: string;

  email?: string;

  relationship:
    | "RECRUITER"
    | "HIRING_MANAGER"
    | "TEAM_MEMBER"
    | "POTENTIAL_REFERRAL"
    | "OTHER";

  relatedJobIds: string[];

  status:
    | "IDENTIFIED"
    | "CONTACTED"
    | "REPLIED"
    | "FOLLOW_UP"
    | "REFERRAL_REQUESTED"
    | "REFERRAL_RECEIVED"
    | "CLOSED";

  notes?: string;
}
```

---

# 63. Contact message generator

Inputs:

```text
candidate profile
job
contact role
relationship
application status
```

Output example categories:

```text
Recruiter introduction
Hiring manager outreach
Internal referral request
Post-application follow-up
Interview thank-you
```

Never auto-send by default.

Provide:

```text
[ Copy ]
[ Email ]
[ Mark contacted ]
```

---

# 64. Pipeline

Kanban:

```text
SELECTED
    ↓
PREPARING
    ↓
READY
    ↓
APPLIED
    ↓
CONTACTED
    ↓
SCREENING
    ↓
INTERVIEW
    ↓
FINAL
    ↓
OFFER
```

Additional exits:

```text
REJECTED
WITHDRAWN
EXPIRED
```

---

# 65. Application tracking

```ts
interface Application {
  id: string;
  jobId: string;

  stage: ApplicationStage;

  appliedAt?: string;

  resumeVersionId?: string;

  salarySubmitted?: Compensation;

  contactIds: string[];

  interviewEvents: InterviewEvent[];

  notes: string[];

  updatedAt: string;
}
```

---

# 66. Follow-up calculation

Client computes:

```text
Applied 6 days ago
No contact
Suggested follow-up: today
```

Possible rules:

```text
Recruiter outreach:
1–2 days after application

Follow-up:
5–7 business days

Second follow-up:
7–10 additional business days
```

All configurable.

No backend notification guarantee.

When application opens:

```text
3 follow-ups due
```

PWA notifications can be optional/best-effort.

---

# 67. IndexedDB schema

Suggested stores:

```text
candidateProfiles
preferences
searchConfigurations

jobs
rawJobs
jobMatches
salaryEstimates

decisions
snoozes

discoveryRuns
sourceHealth

applications
applicationPackages

contacts
contactEvents

settings
auditEvents

embeddings
```

Use Dexie migrations from day one.

---

# 68. IndexedDB versioning

Example:

```ts
db.version(1).stores({
  jobs: "id, fingerprint, status, discoveredAt",
  decisions: "id, jobId, action, createdAt",
  applications: "id, jobId, stage",
});
```

Every schema change requires:

```text
migration
test
backup compatibility check
```

---

# 69. Local-first persistence

IndexedDB is the source of truth.

React state is NOT the source of truth.

Recommended:

```text
IndexedDB
    ↓
repository layer
    ↓
feature hooks
    ↓
UI
```

Zustand may hold temporary UI state only:

```text
current card
drawer open
temporary filters
animation state
```

---

# 70. Data backups

Because no cloud backend exists, backups are mandatory.

Settings:

```text
Backup data
Export JSON

Encrypted backup
Export .jobhunter

Import backup
```

Backup includes:

```text
profile
preferences
jobs
decisions
applications
contacts
settings
learning state
```

---

# 71. Encrypted backup

Optional:

```text
Web Crypto API
AES-GCM
password-derived encryption key
```

Never invent custom cryptography.

---

# 72. Cross-device limitation

Explicitly display:

```text
Your Job Hunter data is stored on this device/browser.
```

Provide:

```text
Export backup
Import backup
```

Do not silently imply cloud synchronization.

Cloud sync can be a future separate architecture decision.

---

# 73. Agent architecture

Agents are logical client modules.

```text
DiscoveryAgent
NormalizationAgent
DeduplicationAgent
RemotePolicyAgent
TravelAgent
InternationalScopeAgent
SalaryAgent
MatchAgent
PreferenceLearningAgent
QueueAgent
ApplicationAgent
ContactStrategyAgent
MaintenanceAgent
```

---

# 74. Agent contract

Every agent implements conceptually:

```ts
interface Agent<I, O> {
  name: string;

  canRun(context: AgentContext): Promise<boolean>;

  run(
    input: I,
    context: AgentContext
  ): Promise<AgentResult<O>>;
}
```

Result:

```ts
interface AgentResult<T> {
  status: "SUCCESS" | "PARTIAL" | "FAILED";

  data?: T;

  warnings: AgentWarning[];

  errors: AgentError[];

  startedAt: string;
  completedAt: string;
}
```

---

# 75. Idempotency

Every agent operation must be safe to rerun.

Example:

```text
Normalize Job 123
```

must not create:

```text
Job 123
Job 123 duplicate
Job 123 duplicate2
```

Agent task key:

```ts
`${agentName}:${entityId}:${inputVersion}`
```

Persist execution state when useful.

---

# 76. Resumable orchestration

Pipeline:

```text
DISCOVERY
   ↓
NORMALIZATION
   ↓
DEDUPLICATION
   ↓
REMOTE POLICY
   ↓
TRAVEL
   ↓
SALARY
   ↓
MATCH
   ↓
QUEUE
```

If Salary fails:

```text
DISCOVERY       ✓
NORMALIZATION   ✓
DEDUPLICATION   ✓
REMOTE          ✓
TRAVEL          ✓
SALARY          ⚠
MATCH           ✓
QUEUE           ✓
```

Do not discard the job.

---

# 77. Agent progress UI

Example:

```text
Refreshing opportunities…

Sources               3 / 4
Jobs discovered       186
New jobs               34
Duplicates removed     71
Analyzed                29 / 34
High matches            11
```

User can continue using old queue while refresh runs.

---

# 78. Web Workers

Heavy tasks should run away from main UI:

```text
embeddings
semantic matching
large-text parsing
optional local LLM
bulk scoring
```

Architecture:

```text
UI thread
    ↓
Agent orchestrator
    ↓
Web Worker pool
```

Swiping must remain fluid while enrichment runs.

---

# 79. Intelligence levels

Implement three levels.

## Level 0 — deterministic

Always available:

```text
keyword rules
regex parsing
title taxonomy
salary rules
remote rules
weighted matching
```

## Level 1 — local embeddings

Optional lazy download.

Used for:

```text
semantic role similarity
requirement similarity
responsibility matching
duplicate detection
```

## Level 2 — optional local generative model

Used for:

```text
pros/cons summaries
job synopsis
application messages
remote-policy interpretation
```

Core application must remain functional without Level 2.

---

# 80. Optional external AI provider

Architect an interface, but disable by default.

```ts
interface AIProvider {
  summarizeJob(...)
  extractRequirements(...)
  generateMessage(...)
}
```

Possible implementations:

```text
LocalProvider
UserProvidedRemoteProvider
```

Never ship:

```text
NEXT_PUBLIC_OPENAI_API_KEY
```

or equivalent permanent private key.

If a user deliberately supplies a personal API key:

* explicit warning
* do not persist by default
* preferably keep in memory/session only

---

# 81. Job synopsis

For every card generate approximately:

```text
Global transformation role supporting front-to-back
capital-markets change across EMEA. Strong stakeholder
management and project leadership component; relatively
limited pure technical delivery.
```

Maximum ~3 lines on card.

---

# 82. Pros/cons generation

Generate structured categories rather than free-form AI prose.

Example:

```ts
interface JobFlag {
  type: "GREEN" | "RED" | "NEUTRAL";

  category:
    | "ROLE"
    | "DOMAIN"
    | "SENIORITY"
    | "SALARY"
    | "REMOTE"
    | "TRAVEL"
    | "INTERNATIONAL"
    | "SKILL"
    | "LANGUAGE"
    | "CAREER";

  label: string;

  evidence?: string;
}
```

Then UI renders it.

---

# 83. Filter panel

Sections:

```text
ROLE
Target titles
Adjacent titles
Excluded titles

LOCATION
Countries
Cities
Distance

REMOTE
Remote only
Remote-first
Hybrid
Max office days/week
Work from abroad required
Remote geographic scope

TRAVEL
No preference
Preferred
Minimum %
Maximum %

COMPENSATION
Minimum
Preferred
Currency

INDUSTRY
Banking
Capital markets
Consulting
Fintech
etc.

CONTRACT
Permanent
Contract
Freelance

SENIORITY

LANGUAGES

COMPANY
Preferred
Excluded
```

---

# 84. Remote filter examples

User should be able to configure:

```text
☑ Fully remote
☑ Remote-first
☑ Hybrid

Maximum mandatory office days
[ 2 ]

☑ Work from abroad is a positive signal
☑ EU-wide remote preferred

Reject automatically:
☐ On-site
☐ ≥4 office days
☐ relocation required
```

---

# 85. Search freshness

Default:

```text
posted <= 30 days
```

Boost:

```text
<24h       +10
1–3 days   +7
4–7 days   +4
8–14 days  +2
```

Do not allow freshness to overcome a poor match.

---

# 86. Previously seen jobs

On discovery:

```text
fingerprint exists?
```

If yes:

```text
update lastSeenAt
merge useful source data
DO NOT requeue
```

unless:

```text
status == SNOOZED && snooze expired
```

or user explicitly restores job.

---

# 87. Job history

Detailed screen:

```text
Sep 7 08:42   discovered
Sep 7 08:42   scored 89
Sep 7 14:20   snoozed
Sep 8 10:12   returned to queue
Sep 8 10:14   selected
Sep 8 10:16   application prepared
Sep 8 18:05   applied
```

---

# 88. Analytics dashboard

All computed locally.

Example:

```text
LAST 30 DAYS

Jobs discovered          1,482
After hard filters         302
Shown                      177
Selected                    41
Rejected                   119
Snoozed                     17

Applications                26
Recruiter replies             8
Interviews                    4
Offers                        1
```

---

# 89. Funnel

```text
4,821 discovered
      ↓
1,406 target role
      ↓
621 target geography
      ↓
298 seniority fit
      ↓
144 match ≥70
      ↓
72 shown
      ↓
21 selected
      ↓
13 applied
      ↓
4 interviews
```

---

# 90. Preference analytics

Display patterns:

```text
Highest acceptance

Global transformation     74%
Capital markets           69%
Program leadership        64%

Lowest acceptance

BAU operations             8%
Local-only programs       11%
On-site ≥4 days           13%
```

Require sufficient sample size before displaying conclusions.

---

# 91. Search quality dashboard

```text
DISCOVERY HEALTH

Arbeitnow
Last run           10:04
Received              78
Relevant               7
Status                 ✓

Remote OK
Last run           10:04
Received             114
Relevant               3
Status                 ✓

Company boards
Checked                18
New jobs                6
Failures                2
```

---

# 92. Source failures

Failures should be visible but non-blocking.

Example:

```text
⚠ 1 source unavailable

Lever company boards cannot currently be queried
directly from this browser architecture.

[Details]
```

---

# 93. Security

Requirements:

* sanitize job HTML
* never execute source scripts
* validate imported JSON
* escape external content
* validate URLs
* use `noopener`
* use `noreferrer`
* no embedded secret tokens
* no automatic credential capture
* no silent third-party posting
* no arbitrary HTML rendering

Use DOMPurify before rendering any source-derived rich text.

---

# 94. Privacy

Default:

```text
Resume        local
Jobs          local
Decisions     local
Applications local
Contacts      local
Preferences   local
```

External requests occur only for:

```text
job feed fetching
optional FX
optional explicit AI provider
external links opened by user
```

Expose this in Settings.

---

# 95. Performance

Targets:

```text
first usable UI <2s on warm load
swipe animation ~60fps
queue render virtualization where necessary
IndexedDB writes non-blocking
job analysis parallelized
heavy models lazy-loaded
```

Do not download hundreds of MB of model files on first visit.

---

# 96. Offline behavior

When offline:

```text
✓ Browse existing jobs
✓ Swipe
✓ View selected
✓ Edit applications
✓ Manage contacts
✓ View analytics
✓ Generate deterministic scores
```

Unavailable:

```text
✕ new discovery
✕ fresh FX
✕ remote APIs
```

Queue decisions locally.

---

# 97. PWA

Include:

```text
manifest.webmanifest
service worker
icons
offline shell
installability
```

Add:

```text
Install Job Hunter
```

The app should feel native on mobile without requiring a separate mobile codebase.

---

# 98. Repository layout

```text
src/
├── app/
│   ├── page.tsx
│   ├── discover/
│   ├── selected/
│   ├── apply/
│   ├── contacts/
│   ├── pipeline/
│   ├── insights/
│   ├── profile/
│   └── settings/
│
├── agents/
│   ├── orchestrator/
│   ├── discovery/
│   ├── normalization/
│   ├── deduplication/
│   ├── remote-policy/
│   ├── travel/
│   ├── international/
│   ├── salary/
│   ├── matching/
│   ├── preference-learning/
│   ├── application/
│   └── contacts/
│
├── features/
│   ├── swipe/
│   ├── jobs/
│   ├── applications/
│   ├── contacts/
│   ├── filters/
│   └── analytics/
│
├── db/
│   ├── database.ts
│   ├── schema.ts
│   ├── migrations/
│   └── repositories/
│
├── domain/
│   ├── candidate.ts
│   ├── job.ts
│   ├── match.ts
│   ├── application.ts
│   └── contact.ts
│
├── providers/
│   ├── jobs/
│   │   ├── arbeitnow.ts
│   │   ├── remoteok.ts
│   │   ├── ashby.ts
│   │   └── manual.ts
│   ├── fx/
│   └── ai/
│
├── workers/
│   ├── scoring.worker.ts
│   └── embeddings.worker.ts
│
├── data/
│   ├── role-taxonomy/
│   ├── salary/
│   ├── countries/
│   └── keywords/
│
├── components/
├── hooks/
├── lib/
└── tests/

public/
├── manifest.webmanifest
├── sw.js
├── icons/
└── data/
```

---

# 99. Coding-agent operating model

Development should itself use specialized agents.

## Architect Agent

Owns:

```text
architecture boundaries
domain model
dependency direction
frontend-only compliance
```

Must block any implementation introducing server runtime.

---

## UI Agent

Owns:

```text
design system
responsive layouts
swipe mechanics
gradients
card design
accessibility
mobile behavior
```

---

## Data Agent

Owns:

```text
IndexedDB
Dexie
migrations
repositories
backup/import
deduplication
```

---

## Discovery Agent Developer

Owns:

```text
source adapter interface
Arbeitnow
Remote OK
ATS boards
source health
pagination
refresh strategy
```

---

## Matching Agent Developer

Owns:

```text
taxonomy
scoring
evidence
hard filters
semantic matching
preference learning
```

---

## Career Intelligence Agent

Owns:

```text
salary estimation
remote policy
travel
international exposure
career progression flags
```

---

## Application Agent Developer

Owns:

```text
Selected
application packages
CV selection
application session
tracking
```

---

## Contact Agent Developer

Owns:

```text
contact model
contact strategy
search query generation
outreach copy
follow-up status
```

---

## QA Agent

Owns:

```text
unit tests
integration tests
Playwright
offline tests
data migration tests
frontend-only audit
accessibility
```

---

# 100. Mandatory agent workflow

Each coding task follows:

```text
READ TASK
   ↓
READ RELEVANT DOMAIN TYPES
   ↓
CHECK ARCHITECTURE CONSTRAINTS
   ↓
IMPLEMENT
   ↓
UNIT TEST
   ↓
TYPECHECK
   ↓
LINT
   ↓
BUILD STATIC EXPORT
   ↓
RUN RELEVANT E2E
   ↓
UPDATE TASK STATUS
```

No coding agent may finish a task if:

```bash
next build
```

cannot produce the static export.

---

# 101. Agent task format

Every implementation ticket:

```markdown
## JOB-XXX — Title

### Goal

### Context

### Inputs

### Required behavior

### Forbidden behavior

### Files likely affected

### Acceptance criteria

### Tests

### Dependencies

### Completion evidence
```

---

# 102. Execution phases

## Phase 0 — Foundation

Tasks:

```text
JOB-001 Repository setup
JOB-002 Static-export configuration
JOB-003 TypeScript strict mode
JOB-004 Tailwind/design tokens
JOB-005 Test infrastructure
JOB-006 PWA manifest
JOB-007 CI build validation
```

Definition of done:

```text
✓ local dev works
✓ production static build works
✓ deployed on Vercel
✓ no backend resources
```

---

# 103. Phase 1 — Domain and persistence

```text
JOB-010 Job domain schema
JOB-011 Candidate schema
JOB-012 Preferences schema
JOB-013 Decision schema
JOB-014 Application schema
JOB-015 Contact schema
JOB-016 IndexedDB database
JOB-017 repositories
JOB-018 migrations
JOB-019 export/import
```

Definition of done:

Reloading browser loses no job state.

---

# 104. Phase 2 — Candidate profile

```text
JOB-020 Initial Olfa profile
JOB-021 Resume versions
JOB-022 Role taxonomy
JOB-023 Search preferences
JOB-024 Compensation targets
JOB-025 Location preferences
JOB-026 Remote preferences
JOB-027 Travel preferences
```

---

# 105. Phase 3 — Fixture-based Tinder MVP

Do this BEFORE live APIs.

```text
JOB-030 Fixture job dataset
JOB-031 Discover page
JOB-032 Job card
JOB-033 Right swipe
JOB-034 Left swipe
JOB-035 Down swipe
JOB-036 gradients
JOB-037 undo
JOB-038 detail screen
JOB-039 decision persistence
```

Definition of done:

```text
refresh browser
→ decisions remain
→ previously rejected job does not reappear
→ snoozed job returns correctly
```

---

# 106. Phase 4 — Matching engine

```text
JOB-040 Hard filters
JOB-041 Title matching
JOB-042 Domain matching
JOB-043 Responsibility matching
JOB-044 Seniority
JOB-045 certification match
JOB-046 eligibility score
JOB-047 preference score
JOB-048 evidence engine
JOB-049 green/red flags
```

---

# 107. Phase 5 — Remote/travel intelligence

```text
JOB-050 RemoteWorkPolicy schema
JOB-051 remote phrase taxonomy
JOB-052 remote policy parser
JOB-053 office-day extraction
JOB-054 geographic remote scope
JOB-055 work-from-abroad extraction
JOB-056 travel extraction
JOB-057 international scope
JOB-058 remote card badges
JOB-059 remote filters
```

---

# 108. Phase 6 — Live discovery

```text
JOB-060 Source adapter interface
JOB-061 source health
JOB-062 Arbeitnow adapter
JOB-063 Remote OK adapter
JOB-064 target-company board registry
JOB-065 Ashby adapter
JOB-066 manual import
JOB-067 normalization
JOB-068 fingerprinting
JOB-069 deduplication
JOB-070 stale discovery orchestration
```

Definition of done:

Opening stale app triggers:

```text
fetch
normalize
deduplicate
score
queue
```

without blocking UI.

---

# 109. Phase 7 — Salary intelligence

```text
JOB-080 salary schema
JOB-081 advertised salary parser
JOB-082 benchmark loader
JOB-083 estimation model
JOB-084 confidence calculation
JOB-085 currency abstraction
JOB-086 salary display
JOB-087 compensation filters
```

---

# 110. Phase 8 — Preference learning

```text
JOB-090 feature extraction
JOB-091 decision signal
JOB-092 affinity engine
JOB-093 anti-overfitting thresholds
JOB-094 learned preference score
JOB-095 insights UI
JOB-096 reset/pin controls
```

---

# 111. Phase 9 — Selected + Apply

```text
JOB-100 Selected page
JOB-101 sorting/filtering
JOB-102 application readiness
JOB-103 CV recommendation
JOB-104 application package
JOB-105 bulk preparation
JOB-106 application session
JOB-107 applied status
JOB-108 notes
JOB-109 pipeline
```

---

# 112. Phase 10 — Contacts

```text
JOB-110 Contact model
JOB-111 contact personas
JOB-112 search query generator
JOB-113 contact UI
JOB-114 outreach messages
JOB-115 status tracking
JOB-116 follow-up rules
```

---

# 113. Phase 11 — Agentic local intelligence

Only after deterministic product works.

```text
JOB-120 Web Worker architecture
JOB-121 local embeddings
JOB-122 semantic match
JOB-123 semantic dedupe
JOB-124 local summarization
JOB-125 graceful capability detection
```

---

# 114. Phase 12 — PWA / offline

```text
JOB-130 offline shell
JOB-131 cache policy
JOB-132 online/offline detection
JOB-133 service worker
JOB-134 install UI
JOB-135 resume refresh
JOB-136 background best-effort refresh
```

---

# 115. Phase 13 — Hardening

```text
JOB-140 XSS tests
JOB-141 invalid import tests
JOB-142 DB migration tests
JOB-143 corrupted data recovery
JOB-144 browser quota behavior
JOB-145 accessibility
JOB-146 mobile
JOB-147 Safari
JOB-148 Chromium
JOB-149 performance
```

---

# 116. Phase 14 — Analytics

```text
JOB-150 funnel
JOB-151 swipe statistics
JOB-152 application conversion
JOB-153 response rate
JOB-154 source quality
JOB-155 learned preferences
JOB-156 discovery explanation
```

---

# 117. Definition of MVP

MVP is complete when user can:

```text
1. Configure target job criteria
2. Refresh job sources
3. Receive normalized jobs
4. See match scores
5. See remote policy
6. See travel policy
7. See international scope
8. See salary or estimate
9. Swipe right
10. Swipe left
11. Swipe down
12. Reload without losing history
13. Review Selected
14. Prepare application packages
15. Mark application as applied
16. Track pipeline
17. Add contacts
18. Export full backup
```

---

# 118. Definition of V1

V1 additionally requires:

```text
local preference learning
local semantic matching
salary intelligence
remote policy confidence
work-from-abroad flags
international scope scoring
bulk application preparation
contact strategy
offline support
PWA installation
analytics
source health monitoring
```

---

# 119. Explicitly deferred

Do NOT implement during initial project:

```text
user accounts
cloud database
multi-user tenancy
subscription
payments
hosted AI backend
automatic LinkedIn scraping
automatic job-board scraping requiring proxy
automatic ATS form submission
email sending backend
cloud notifications
cloud synchronization
native mobile apps
```

---

# 120. Frontend-only architecture compliance test

CI must fail if repository introduces:

```text
src/app/api/
pages/api/
middleware.ts
"use server"
server-only
Vercel Function config
```

Add static architectural test scanning repository.

---

# 121. CI pipeline

For every pull request:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

`build` must validate static export.

---

# 122. Required test scenarios

## Swipe persistence

```text
Given job A
When right-swiped
And browser reloads
Then A remains Selected
And does not return to Discover
```

## Reject persistence

```text
Given job B
When rejected
And discovery reruns
Then B remains rejected
```

## Snooze

```text
Given job C
When snoozed
Then it does not train preference model
And returns according to snooze policy
```

## Duplicate

```text
Given same job from two feeds
Then only one card appears
```

## Remote policy

```text
"Remote in France, 2 days per month in Paris"

→ HYBRID/FLEXIBLE
→ scope COUNTRY: France
→ office frequency captured
```

## Remote ambiguity

```text
"Flexible workplace"

→ confidence low
→ no unsupported claim
```

---

# 123. Development seed data

Include 30–50 realistic fixture jobs covering:

```text
ideal match
poor match
salary advertised
salary absent
fully remote
hybrid
onsite
remote France-only
remote EU
international travel
no travel
ambiguous remote
duplicate postings
different currencies
different seniorities
```

This allows all development without live API dependency.

---

# 124. Visual design language

Desired feel:

```text
professional
premium
calm
data-dense but readable
not literally a dating app parody
```

Primary swipe colors:

```text
ACCEPT → green
REJECT → red
LATER → blue
```

Use gradients only during interactions and highlights.

Normal UI should remain neutral.

---

# 125. Job card information hierarchy

Always prioritize:

```text
1 Company
2 Title
3 Location
4 Overall match
5 Salary
6 Remote policy
7 Travel
8 International scope
9 Green flags
10 Red flags
```

Do not overload card with full job analysis.

---

# 126. “Why this job?” explanation

Example:

```text
Why 92%?

Excellent:
Capital markets
Transformation
International stakeholders
Project leadership

Strong:
Agile/Product
Regulatory delivery

Gap:
German preferred

Preference boost:
International travel +6
Remote policy +3
```

---

# 127. Search explanation

The user should be able to answer:

> Why did Job Hunter show this?

Example:

```text
Matched search:
"Business Transformation"

Location:
Switzerland ✓

Hard filters:
Passed ✓

Eligibility:
94%

Preference:
89%

Freshness:
Posted 2 days ago
```

---

# 128. Product success criteria

The application succeeds when:

```text
Discovery time ↓
Repeated jobs ↓
Irrelevant jobs ↓
Decision time/job ↓
Application preparation time ↓
Forgotten applications ↓
Forgotten follow-ups ↓

Relevant opportunities ↑
Applications submitted ↑
Recruiter engagement ↑
Interviews ↑
Quality of final opportunities ↑
```

Not when it simply accumulates the largest number of job listings.

---

# 129. Core engineering principle

Every automated conclusion must belong to one of:

```text
FACT
INFERENCE
PREFERENCE
ESTIMATE
```

Examples:

```text
FACT
Salary €110k–120k stated in posting

INFERENCE
Likely hybrid, 2 days/week

PREFERENCE
International scope is positive

ESTIMATE
Expected compensation €115k–130k
```

Never display them identically.

---

# 130. Recommended first implementation sequence

The coding agent should execute in this exact order:

```text
1 Static Next.js shell
2 Domain schemas
3 IndexedDB
4 Fixture dataset
5 Swipe UI
6 Persistent decisions
7 Remote-work policy
8 Travel/international flags
9 Deterministic matching
10 Salary model
11 Selected tab
12 Application preparation
13 Pipeline
14 Contacts
15 Live source adapters
16 Deduplication
17 Stale 12h refresh
18 Preference learning
19 Local semantic matching
20 PWA
21 Analytics
22 Hardening
23 Vercel production deployment
```

This order avoids spending time on difficult web ingestion before validating the core job-decision experience.

---

# 131. Master coding-agent instruction

Use this as the persistent project instruction:

```text
You are implementing Olfa Job Hunter, a local-first job-discovery,
matching and application-management PWA.

ARCHITECTURAL CONTRACT:

The application MUST remain frontend-only and statically exportable.

Do not create:
- backend services
- API routes
- Server Actions
- middleware
- Vercel Functions
- Edge Functions
- server databases
- server-side cron jobs
- hidden CORS proxies

Runtime persistence uses IndexedDB.

All automation is implemented as browser-side logical agents coordinated
by an idempotent, resumable orchestrator.

All features must degrade gracefully when offline or when an external
job source is unavailable.

Never introduce a server merely to make an integration easier.

Every important recommendation must expose its evidence.

Job compatibility and user preference are separate scores.

Remote-work policy, geographic remote restrictions, office attendance,
work-from-abroad rules, travel requirements and international scope are
separate first-class concepts.

Swipe behavior:
- RIGHT = SELECT / green
- LEFT = REJECT / red
- DOWN = SNOOZE / blue

SNOOZE must not train the preference model negatively.

All candidate decisions persist across refreshes.

Previously rejected jobs must not be silently reintroduced.

The application must remain fully usable with deterministic logic.
Local embeddings/local generative AI are enhancements, not mandatory
dependencies.

Do not fabricate candidate experience, salary information, remote policy
or job requirements.

Every change must pass:
- lint
- typecheck
- unit tests
- static production build
- relevant E2E tests

If a proposed feature conflicts with the frontend-only architectural
contract, implement the best frontend-only degradation instead and
document the limitation.
```

---

# 132. First development milestone

The FIRST milestone should deliberately use fixture data only.

Success demo:

```text
Open deployed Vercel app
        ↓
42 realistic jobs available
        ↓
Swipe through jobs
        ↓
Remote/travel flags visible
        ↓
Salary visible
        ↓
Green/red flags visible
        ↓
Select / Reject / Later
        ↓
Reload
        ↓
Everything remains correct
        ↓
Selected tab contains chosen jobs
        ↓
Prepare 3 application packages
```

Only after this works should live discovery be enabled.

---

# 133. Final architectural target

```text
                  PUBLIC JOB SOURCES
                         │
                         ▼
                   DiscoveryAgent
                         │
                         ▼
                  Normalize/Dedupe
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       Remote          Salary       Intl/Travel
        Agent           Agent          Agent
          └──────────────┼──────────────┘
                         ▼
                      MatchAgent
                         │
                         ▼
                   PreferenceAgent
                         │
                         ▼
                       QUEUE
                         │
                    SWIPE UI
              ┌──────────┼──────────┐
              ▼          ▼          ▼
           REJECT      LATER      SELECT
                                    │
                                    ▼
                             ApplicationAgent
                                    │
                       ┌────────────┼────────────┐
                       ▼            ▼            ▼
                      CV         Contacts     Messages
                       └────────────┼────────────┘
                                    ▼
                                 APPLY
                                    │
                                    ▼
                                PIPELINE

Everything persistent
        │
        ▼
    IndexedDB
        │
        ▼
Encrypted/manual backup

Deployment
        │
        ▼
Static Vercel
```

This architecture must remain valid from MVP through V1 without introducing a backend.
