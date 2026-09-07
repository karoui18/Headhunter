/** Small, auditable concept vectors. This is taxonomy-based semantic matching, not a downloaded neural model. */
const concepts = [
  ['business analyst', 'business analysis', 'functional analyst', 'functional consultant'],
  ['programme manager', 'program manager', 'program management', 'programme management'],
  ['transformation', 'change delivery', 'change management', 'business change'],
  ['capital markets', 'global markets', 'securities', 'front to back', 'front-to-back'],
  ['product owner', 'product ownership', 'product management'],
  ['leadership', 'team lead', 'people management', 'director'],
  ['aml', 'anti money laundering', 'financial crime', 'kyc'],
  ['agile', 'scrum', 'kanban'],
  ['international', 'global', 'cross border', 'emea', 'apac'],
  ['remote', 'distributed', 'work from anywhere'],
  ['operations', 'operational', 'bau'],
  ['data', 'sql', 'analytics'],
  ['regulatory', 'compliance', 'regulation'],
];
export function semanticVector(text: string): number[] {
  const t = text.toLowerCase();
  const vector = concepts.map((terms) => (terms.some((term) => t.includes(term)) ? 1 : 0));
  const norm = Math.hypot(...vector);
  return norm ? vector.map((v) => v / norm) : vector;
}
export function semanticSimilarity(a: number[], b: number[]) {
  return a.reduce((sum, v, i) => sum + v * (b[i] || 0), 0);
}
export interface SemanticResult {
  jobId: string;
  similarity: number;
  synopsis: string;
  possibleDuplicates: string[];
}
export function analyzeLocally(
  profile: string,
  jobs: { id: string; company: string; title: string; descriptionText: string }[],
): SemanticResult[] {
  const p = semanticVector(profile),
    vectors = jobs.map((j) => semanticVector(j.title + ' ' + j.descriptionText));
  return jobs.map((j, i) => ({
    jobId: j.id,
    similarity: Math.round(semanticSimilarity(p, vectors[i]) * 100),
    synopsis: j.descriptionText
      .split(/(?<=[.!?])\s+/)
      .slice(0, 2)
      .join(' ')
      .slice(0, 350),
    possibleDuplicates: jobs
      .filter(
        (other, k) =>
          other.id !== j.id &&
          other.company.toLowerCase() === j.company.toLowerCase() &&
          semanticSimilarity(vectors[i], vectors[k]) > 0.95,
      )
      .map((o) => o.id),
  }));
}
