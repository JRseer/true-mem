import { existsSync } from 'fs';
import { join } from 'path';
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { log } from '../../logger.js';
import { ViewerDatabase, ViewerDatabaseUnavailableError, withViewerDb } from './db.js';
import { memoriesRoute } from './routes/memories.js';
import { monitorRoute } from './routes/monitor.js';
import { settingsRoute } from './routes/settings.js';
import { statsRoute } from './routes/stats.js';
import { embeddingsRoute } from './routes/embeddings.js';
import { getVersion } from '../../utils/version.js';
import { loadConfig } from '../../config/config.js';

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

app.get('/api/health', async (c) => {
  const config = loadConfig();
  let schemaVersion: number | null = null;
  try {
    schemaVersion = await withViewerDb((db) => {
      const row = db.get('SELECT MAX(version) AS v FROM schema_version');
      return row && typeof row.v === 'number' ? row.v as number : null;
    });
  } catch {
    // DB not available — return null
  }
  return c.json({
    ok: true,
    databasePath: ViewerDatabase.currentDatabasePath(),
    databaseExists: ViewerDatabase.exists(),
    pluginVersion: getVersion(),
    schemaVersion,
    storageLocation: config.storageLocation,
    generatedAt: new Date().toISOString(),
  });
});
app.route('/api/memories', memoriesRoute);
app.route('/api/stats', statsRoute);
app.route('/api/monitor', monitorRoute);
app.route('/api/embeddings', embeddingsRoute);
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
