import type {
  Affinity,
  CandidatePreferences,
  CandidateProfile,
  Decision,
  Job,
  Match,
  RemoteWorkPolicy,
  Salary,
} from './model';
const words = (s: string) => s.toLowerCase();
export function parseRemote(text: string): RemoteWorkPolicy {
  const t = words(text),
    evidence = text
      .split(/[.!\n]/)
      .filter((s) => /remote|office|abroad|hybrid|relocat/i.test(s))
      .map((s) => s.trim())
      .filter(Boolean);
  const office = t.match(
    /(\d)\s*(?:days?|d)\s*(?:(?:per|a|\/)\s*(week|month)\s*(?:in\s*)?(?:office|in\s+\w+)?|(?:in\s*(?:the\s*)?office)\s*(?:per|a|\/)\s*(week|month))/,
  );
  const monthly = /\d\s*days?\s*(?:per|a|\/)\s*month/.test(t);
  let mode: RemoteWorkPolicy['mode'] = 'UNKNOWN';
  if (/remote.first|distributed team/.test(t)) mode = 'REMOTE_FIRST';
  else if (
    /fully remote|100% remote|work from anywhere|remote (?:across|within|in|only)|eu remote/.test(t)
  )
    mode = 'REMOTE';
  if (/hybrid/.test(t) || office || monthly) mode = 'HYBRID';
  if (/on.site only|fully on.site|no remote/.test(t)) mode = 'ONSITE';
  const countries = [
    'France',
    'Germany',
    'Switzerland',
    'Luxembourg',
    'United Kingdom',
    'UAE',
    'United States',
  ].filter((c) =>
    new RegExp('(?:within|in|based in|only in|restricted to)\\s+' + c, 'i').test(text),
  );
  const scope: RemoteWorkPolicy['scope'] = countries.length
    ? 'COUNTRY'
    : /worldwide|anywhere/.test(t)
      ? 'WORLDWIDE'
      : /\beu\b|european union/.test(t)
        ? 'EU'
        : /\beea\b/.test(t)
          ? 'EEA'
          : 'UNKNOWN';
  const abroadDays = t.match(
    /(\d+)\s*days?\s*(?:per year |a year )?(?:working |work )?(?:from )?abroad/,
  );
  const forbidden =
    /work(?:ing)? from abroad (?:is )?(?:not allowed|forbidden)|no work from abroad/.test(t);
  return {
    mode,
    scope,
    allowedCountries: countries,
    officeDaysPerWeek: office && !monthly ? Number(office[1]) : undefined,
    officeFrequencyText: office?.[0],
    mandatoryOfficeDays: office ? /mandatory|required|must/.test(t) : undefined,
    workFromAbroad: forbidden
      ? 'NOT_ALLOWED'
      : abroadDays
        ? 'LIMITED'
        : /work(?:ing)? from abroad (?:is )?(?:allowed|permitted)/.test(t)
          ? 'ALLOWED'
          : 'UNKNOWN',
    workFromAbroadDaysPerYear: abroadDays ? Number(abroadDays[1]) : undefined,
    relocationRequired: /relocation (?:is )?(?:required|mandatory)/.test(t),
    timezoneRequirement: text.match(/(?:CET|UTC|GMT)\s*[±+-]?\s*\d*h?/i)?.[0],
    policyStability: /contractual/.test(t)
      ? 'CONTRACTUAL'
      : /manager.discretion/.test(t)
        ? 'MANAGER_DISCRETION'
        : /temporary remote/.test(t)
          ? 'TEMPORARY'
          : /written policy|company policy/.test(t)
            ? 'EXPLICIT_COMPANY_POLICY'
            : 'UNCLEAR',
    confidence: mode === 'UNKNOWN' ? 0.25 : 0.85,
    evidence,
  };
}
export function parseTravel(text: string): Job['travelRequirement'] {
  const neg = /no travel|travel (?:is )?not required/i.test(text),
    evidence = text.split(/[.!\n]/).filter((s) => /travel/i.test(s));
  const pct = text.match(/travel[^.\n%]{0,35}?(\d{1,3})\s*%/i);
  const positive =
    !neg &&
    /travel (?:required|expected|\d)|international travel|occasional travel|travel up to/i.test(
      text,
    );
  return {
    required: positive,
    estimatedPercent: positive && pct ? Math.min(100, Number(pct[1])) : undefined,
    frequency: neg
      ? 'NONE'
      : /occasional travel/i.test(text)
        ? 'OCCASIONAL'
        : positive
          ? 'FREQUENT'
          : 'UNKNOWN',
    international: positive && /international travel/i.test(text),
    confidence: neg || positive ? 0.9 : 0.25,
    evidence,
  };
}
export function parseSalary(text: string): Salary | undefined {
  const m = text.match(
    /(EUR|CHF|GBP|USD|AED|€|£|\$)\s*(\d[\d,.]*\s*k?)\s*(?:–|—|-|to)\s*(?:(?:EUR|CHF|GBP|USD|AED|€|£|\$)\s*)?(\d[\d,.]*\s*k?)/i,
  );
  if (!m) return undefined;
  const amount = (s: string) =>
    Number(s.replace(/[,\s]/g, '').replace(/k/i, '')) * (/k/i.test(s) ? 1000 : 1);
  let min = amount(m[2]);
  const max = amount(m[3]);
  if (/k/i.test(m[3]) && !/k/i.test(m[2]) && min < 1000) min *= 1000;
  if (!Number.isFinite(min) || max < min) return undefined;
  const period: Salary['period'] = /per hour|hourly|\/h\b/i.test(text)
    ? 'HOUR'
    : /per day|daily|\/day/i.test(text)
      ? 'DAY'
      : /per month|monthly/i.test(text)
        ? 'MONTH'
        : 'YEAR';
  return {
    source: 'ADVERTISED',
    currency:
      ({ '€': 'EUR', '£': 'GBP', $: 'USD' } as Record<string, string>)[m[1]] || m[1].toUpperCase(),
    min,
    max,
    midpoint: (min + max) / 2,
    period,
    confidence: period === 'YEAR' && !/annual|year/i.test(text) ? 0.7 : 0.95,
    evidence: [
      m[0],
      ...(period === 'YEAR' && !/annual|year/i.test(text)
        ? ['Annual period inferred; verify with employer']
        : []),
    ],
    generatedAt: new Date().toISOString(),
  };
}
export function features(job: Job): string[] {
  return [
    ...new Set([
      ...job.domains,
      ...job.skills.filter((s) => ['leadership', 'product', 'strategy', 'operations'].includes(s)),
      job.remotePolicy.mode.toLowerCase(),
      ...(job.internationalScope.score ? ['international'] : []),
      ...(job.travelRequirement.required ? ['travel'] : []),
    ]),
  ];
}
export function learn(jobs: Job[], decisions: Decision[]): Affinity[] {
  const undone = new Set(decisions.filter((d) => d.action === 'UNDO').map((d) => d.undoOf));
  const latest = new Map<string, Decision>();
  for (const d of [...decisions].sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
    if (!undone.has(d.id) && ['SELECT', 'REJECT', 'RESTORE'].includes(d.action))
      latest.set(d.jobId, d);
  const map = new Map<string, { accepted: number; rejected: number }>();
  for (const d of latest.values()) {
    if (d.action === 'RESTORE') continue;
    const j = jobs.find((j) => j.id === d.jobId);
    if (!j) continue;
    for (const f of features(j)) {
      const n = map.get(f) || { accepted: 0, rejected: 0 };
      if (d.action === 'SELECT') n.accepted++;
      else n.rejected++;
      map.set(f, n);
    }
  }
  return [...map].map(([feature, n]) => ({
    ...n,
    feature,
    affinity: (n.accepted - n.rejected) / (n.accepted + n.rejected + 4),
    confidence: Math.min(1, (n.accepted + n.rejected) / 30),
  }));
}
const overlap = (wanted: string[], text: string) =>
  wanted.filter((v) => text.includes(v.toLowerCase()));
export function scoreJob(
  j: Job,
  p: CandidateProfile,
  prefs: CandidatePreferences,
  affinities: Affinity[],
): Match {
  const t = words(j.title + ' ' + j.descriptionText),
    evidence: Match['evidence'] = [],
    warnings: string[] = [],
    filteredReasons: string[] = [];
  const add = (
    dimension: string,
    weight: number,
    terms: string[],
    kind: 'FACT' | 'PREFERENCE' = 'FACT',
  ) => {
    const matched = overlap(terms, t);
    const contribution = terms.length ? (weight * matched.length) / terms.length : 0;
    evidence.push({ dimension, contribution: Math.round(contribution), evidence: matched, kind });
    return contribution;
  };
  let eligibility =
    add('Role', 25, p.targetRoles) +
    add('Domain', 20, p.domains) +
    add('Responsibilities', 20, p.skills) +
    add('Core skills', 10, p.skills) +
    add(
      'Scope',
      5,
      p.skills.filter((s) => /lead|project|stakeholder/i.test(s)),
    ) +
    add('Languages', 5, p.languages) +
    add('Certifications', 5, p.certifications);
  const requiredYears = Number(t.match(/(\d+)\+?\s*years? (?:of )?experience/)?.[1] || 0);
  if (p.yearsExperience && requiredYears) {
    const c = p.yearsExperience >= requiredYears ? 10 : 0;
    eligibility += c;
    evidence.push({
      dimension: 'Seniority',
      contribution: c,
      evidence: [`${requiredYears} years requested; ${p.yearsExperience} entered in profile`],
      kind: 'FACT',
    });
  }
  if (!p.headline && !p.skills.length)
    warnings.push('Complete your factual profile to assess eligibility');
  let preference = 40;
  if (j.internationalScope.score) {
    preference += 15;
    evidence.push({
      dimension: 'International scope',
      contribution: 15,
      evidence: j.internationalScope.evidence,
      kind: 'PREFERENCE',
    });
  }
  if (['REMOTE', 'REMOTE_FIRST'].includes(j.remotePolicy.mode)) {
    preference += 15;
    evidence.push({
      dimension: 'Remote work',
      contribution: 15,
      evidence: j.remotePolicy.evidence,
      kind: 'PREFERENCE',
    });
  }
  if (prefs.travelDesired && j.travelRequirement.required) {
    preference += 10;
    evidence.push({
      dimension: 'Travel preference',
      contribution: 10,
      evidence: j.travelRequirement.evidence,
      kind: 'PREFERENCE',
    });
  }
  if (overlap(prefs.preferredDomains, t).length) preference += 10;
  if (
    j.compensation?.currency === prefs.currency &&
    j.compensation.period === 'YEAR' &&
    j.compensation.midpoint >= prefs.targetSalary
  )
    preference += 10;
  if (!j.compensation) warnings.push('Salary not disclosed');
  if (j.remotePolicy.mode === 'UNKNOWN') warnings.push('Remote policy unclear');
  if (prefs.excludeOnsite && j.remotePolicy.mode === 'ONSITE')
    filteredReasons.push('On-site excluded');
  if (prefs.remoteModes.length && !prefs.remoteModes.includes(j.remotePolicy.mode))
    filteredReasons.push('Remote mode outside filters');
  if ((j.remotePolicy.officeDaysPerWeek ?? 0) > prefs.maxOfficeDays)
    filteredReasons.push('Office attendance exceeds maximum');
  if (prefs.excludeRelocation && j.remotePolicy.relocationRequired)
    filteredReasons.push('Relocation required');
  if (prefs.requireAbroad && !['ALLOWED', 'LIMITED'].includes(j.remotePolicy.workFromAbroad))
    filteredReasons.push('Work abroad not confirmed');
  if (prefs.excludedCompanies.some((c) => c.toLowerCase() === j.company.toLowerCase()))
    filteredReasons.push('Excluded company');
  if (prefs.excludedKeywords.some((k) => t.includes(k.toLowerCase())))
    filteredReasons.push('Excluded keyword');
  if (
    prefs.includeKeywords.length &&
    !prefs.includeKeywords.every((k) => t.includes(k.toLowerCase()))
  )
    filteredReasons.push('Required keyword absent');
  if (
    prefs.countries.length &&
    !overlap(prefs.countries, words(j.location + ' ' + j.remotePolicy.allowedCountries.join(' ')))
      .length &&
    j.remotePolicy.scope !== 'WORLDWIDE'
  )
    filteredReasons.push('Country outside filters');
  if (prefs.cities.length && !overlap(prefs.cities, words(j.location)).length)
    filteredReasons.push('City outside filters');
  if (prefs.minSeniority && /junior|intern|graduate/.test(t))
    filteredReasons.push('Junior role excluded');
  if (prefs.permanentOnly && /temporary|freelance|fixed.term|contract role/.test(t))
    filteredReasons.push('Non-permanent contract');
  if ((j.travelRequirement.estimatedPercent ?? 0) > prefs.maxTravelPercent)
    filteredReasons.push('Travel exceeds maximum');
  if (
    j.compensation?.currency === prefs.currency &&
    j.compensation.period === 'YEAR' &&
    j.compensation.max < prefs.minSalary
  )
    filteredReasons.push('Advertised salary below minimum');
  if (j.publishedAt && Date.now() - Date.parse(j.publishedAt) > prefs.maxAgeDays * 86400000)
    filteredReasons.push('Posting exceeds maximum age');
  const relevant = affinities.filter(
    (a) => features(j).includes(a.feature) && !prefs.ignoredFeatures.includes(a.feature),
  );
  const observations = Math.max(0, ...relevant.map((a) => a.accepted + a.rejected));
  const cap = observations < 10 ? 2 : observations < 30 ? 5 : 10;
  const learned =
    prefs.learningEnabled && relevant.length
      ? Math.max(
          -cap,
          Math.min(
            cap,
            (relevant.reduce(
              (s, a) =>
                s + a.affinity * (prefs.pinnedFeatures.includes(a.feature) ? 1 : a.confidence),
              0,
            ) *
              cap) /
              relevant.length,
          ),
        )
      : 0;
  preference = Math.min(100, preference);
  eligibility = Math.round(eligibility);
  return {
    eligibility,
    preference,
    learned,
    overall: Math.round(
      Math.max(0, Math.min(100, eligibility * 0.65 + preference * 0.35 + learned)),
    ),
    evidence,
    warnings,
    filteredReasons,
  };
}
export function rankQueue(
  jobs: Job[],
  profile: CandidateProfile,
  prefs: CandidatePreferences,
  affinities: Affinity[],
  now = Date.now(),
): Job[] {
  const eligible = jobs.filter(
    (j) => !scoreJob(j, profile, prefs, affinities).filteredReasons.length,
  );
  const active = eligible.filter(
    (j) =>
      ['NEW', 'QUEUED', 'SEEN'].includes(j.status) ||
      (j.status === 'SNOOZED' &&
        j.snoozeUntil !== 'CYCLE' &&
        Date.parse(j.snoozeUntil || '') <= now),
  );
  const queue = (
    active.length
      ? active
      : eligible.filter((j) => j.status === 'SNOOZED' && j.snoozeUntil === 'CYCLE')
  ).sort(
    (a, b) =>
      scoreJob(b, profile, prefs, affinities).overall -
      scoreJob(a, profile, prefs, affinities).overall,
  );
  const result: Job[] = [];
  while (queue.length) {
    let index = queue.findIndex(
      (j) => result.length < 3 || !result.slice(-3).every((r) => r.company === j.company),
    );
    if (index < 0) index = 0;
    result.push(queue.splice(index, 1)[0]);
  }
  return result;
}
