import { readdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
async function files(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
      ),
    )
  ).flat();
}
for (const forbidden of [
  'middleware.ts',
  'middleware.js',
  'src/middleware.ts',
  'pages/api',
  'app/api',
  'api',
]) {
  let exists = false;
  try {
    await access(forbidden);
    exists = true;
  } catch {}
  if (exists) throw new Error('Forbidden server entrypoint ' + forbidden);
}
const deployment = JSON.parse(await readFile('vercel.json', 'utf8'));
if (deployment.functions || deployment.crons || deployment.builds)
  throw new Error('Runtime Vercel configuration is forbidden');
const source = await files('src');
for (const file of source) {
  if (/(?:\/api\/|middleware\.|route\.(ts|js)$)/.test(file))
    throw new Error('Forbidden server entrypoint ' + file);
  if (/\.(tsx?|jsx?)$/.test(file)) {
    const text = await readFile(file, 'utf8');
    if (/['"]use server['"]|from\s*['"]server-only['"]/.test(text))
      throw new Error('Forbidden server dependency ' + file);
  }
}
for (const file of source.filter((f) => f.startsWith('src/domain/') && /\.ts$/.test(f))) {
  const text = await readFile(file, 'utf8');
  if (/from\s*['"](?:react|dexie|.*(?:infrastructure|components|application)\/)/.test(text))
    throw new Error('Domain dependency points outward: ' + file);
}
const config = await readFile('next.config.ts', 'utf8');
if (!/output:\s*['"]export['"]/.test(config)) throw new Error('Static export is required');
const exported = await files('out');
if (!exported.includes('out/index.html')) throw new Error('Static index missing');
const assets = exported
  .filter((f) => /\.(html|js|css|png|webmanifest)$/.test(f) && !f.endsWith('/sw.js'))
  .map((f) => (f === 'out/index.html' ? '/' : '/' + f.slice(4)));
const version = process.env.GITHUB_SHA || Date.now().toString();
const sw = `const CACHE='olfa-${version}';const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('olfa-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).catch(()=>event.request.mode==='navigate'?caches.match('/'):Response.error())));});`;
await writeFile('out/sw.js', sw);
console.log(
  'Frontend-only audit passed; offline shell generated with ' + assets.length + ' assets.',
);
