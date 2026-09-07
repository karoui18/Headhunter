import { inputSchema, normalizeJob } from './normalize';
export function parseCsv(csv: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && csv[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map((v) => v.trim().replace(/^\uFEFF/, '')) || [];
  if (new Set(headers).size !== headers.length) throw new Error('Duplicate CSV headers');
  return rows.map((values) => {
    if (values.length !== headers.length) throw new Error('CSV column count mismatch');
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}
export async function importJobs(content: string, format: 'json' | 'csv') {
  if (content.length > 10_000_000) throw new Error('Import exceeds 10 MB');
  const parsed: unknown = format === 'csv' ? parseCsv(content) : JSON.parse(content);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  if (rows.length > 5000) throw new Error('Import at most 5,000 jobs');
  const valid = rows.map((row) => inputSchema.parse(row));
  return Promise.all(valid.map((row) => normalizeJob(row)));
}
