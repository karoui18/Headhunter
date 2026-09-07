import { analyzeLocally } from '../domain/semantic';
self.onmessage = (event: MessageEvent<Parameters<typeof analyzeLocally>>) => {
  try {
    self.postMessage({ results: analyzeLocally(...event.data) });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
