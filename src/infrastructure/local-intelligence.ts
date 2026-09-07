import { analyzeLocally, type SemanticResult } from '../domain/semantic';
export interface AIProvider {
  summarize(text: string): Promise<string>;
  available(): Promise<boolean>;
}
export class DeterministicProvider implements AIProvider {
  async available() {
    return true;
  }
  async summarize(text: string) {
    return text
      .split(/(?<=[.!?])\s+/)
      .slice(0, 2)
      .join(' ')
      .slice(0, 350);
  }
}
export async function runLocalIntelligence(
  profile: string,
  jobs: Parameters<typeof analyzeLocally>[1],
): Promise<SemanticResult[]> {
  if (typeof Worker === 'undefined') return analyzeLocally(profile, jobs);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/intelligence.worker.ts', import.meta.url));
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('Local analysis timed out'));
    }, 30000);
    worker.onmessage = (e) => {
      clearTimeout(timeout);
      worker.terminate();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.results);
    };
    worker.onerror = () => {
      clearTimeout(timeout);
      worker.terminate();
      resolve(analyzeLocally(profile, jobs));
    };
    worker.postMessage([profile, jobs]);
  });
}
