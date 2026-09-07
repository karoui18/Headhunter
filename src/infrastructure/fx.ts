import { z } from 'zod';
import type { JobDatabase } from './database';
export interface FxQuote {
  from: string;
  to: string;
  rate: number;
  date: string;
  cached: boolean;
}
export interface FxProvider {
  getRate(from: string, to: string): Promise<FxQuote>;
}
const quoteSchema = z.object({
  base: z.string(),
  date: z.string(),
  rates: z.record(z.number().positive()),
});
export class PublicFxProvider implements FxProvider {
  constructor(
    private db: JobDatabase,
    private fetcher: typeof fetch = fetch,
  ) {}
  async getRate(from: string, to: string): Promise<FxQuote> {
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) throw new Error('Invalid currency');
    if (from === to)
      return { from, to, rate: 1, date: new Date().toISOString().slice(0, 10), cached: false };
    const id = `fx:${from}:${to}`;
    const stored = await this.db.settings.get(id);
    try {
      const response = await this.fetcher(
        `https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`,
        { signal: AbortSignal.timeout(10000), credentials: 'omit' },
      );
      if (!response.ok) throw new Error('FX unavailable');
      const data = quoteSchema.parse(await response.json());
      if (!data.rates[to]) throw new Error('Unsupported currency');
      const quote: FxQuote = { from, to, rate: data.rates[to], date: data.date, cached: false };
      await this.db.settings.put({ id, value: quote });
      return quote;
    } catch (error) {
      if (stored) {
        const cached = z
          .object({
            from: z.string(),
            to: z.string(),
            rate: z.number().positive(),
            date: z.string(),
          })
          .parse(stored.value);
        return { ...cached, cached: true };
      }
      throw error;
    }
  }
}
