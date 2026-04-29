import { existsSync } from 'fs';
import { join } from 'path';
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { log } from '../../logger.js';
import { ViewerDatabase, ViewerDatabaseUnavailableError } from './db.js';
import { memoriesRoute } from './routes/memories.js';
import { monitorRoute } from './routes/monitor.js';
import { settingsRoute } from './routes/settings.js';
import { statsRoute } from './routes/stats.js';

const app = new Hono();
const hostname = process.env.TRUE_MEM_VIEWER_HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.TRUE_MEM_VIEWER_PORT ?? '3456', 10);
const staticRoot = join(process.cwd(), 'dist', 'viewer');
const unsafeMethods = new Set(['PATCH', 'POST', 'PUT', 'DELETE']);

app.use('*', async (c, next) => {
  if (unsafeMethods.has(c.req.method)) {
    const host = c.req.header('host') ?? '';
    const origin = c.req.header('origin');
    const referer = c.req.header('referer');
    const marker = c.req.header('x-true-mem-viewer');
    if (!isLoopbackHost(host) || marker !== '1' || !isSameOrigin(host, origin, referer)) {
      return c.json({ error: 'Viewer write request rejected by local-origin protection' }, 403);
    }
  }
  return next();
});

app.onError((err, c) => {
  if (err instanceof ViewerDatabaseUnavailableError) {
    return c.json({ error: err.message }, 503);
  }
  log(`Viewer: request failed: ${err instanceof Error ? err.message : String(err)}`);
  return c.json({ error: 'Viewer request failed' }, 500);
});

app.get('/api/health', (c) => c.json({
  ok: true,
  databasePath: ViewerDatabase.currentDatabasePath(),
  databaseExists: ViewerDatabase.exists(),
  generatedAt: new Date().toISOString(),
}));
app.route('/api/memories', memoriesRoute);
app.route('/api/stats', statsRoute);
app.route('/api/monitor', monitorRoute);
app.route('/api/settings', settingsRoute);

if (existsSync(staticRoot)) {
  app.use('/assets/*', serveStatic({ root: staticRoot }));
  app.get('/', serveStatic({ path: join(staticRoot, 'index.html') }));
  app.get('/*', serveStatic({ path: join(staticRoot, 'index.html') }));
}

log(`Viewer: starting on http://${hostname}:${port}`);

export default {
  hostname,
  port,
  fetch: app.fetch,
};

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().split(':')[0] ?? '';
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]' || normalized === '::1';
}

function isSameOrigin(host: string, origin: string | undefined, referer: string | undefined): boolean {
  const source = origin ?? referer;
  if (!source) return false;
  try {
    const url = new URL(source);
    return isLoopbackHost(url.host) && url.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
