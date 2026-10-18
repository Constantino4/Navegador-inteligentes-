import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { BrowserEngine } from './server/browser-engine.js';
import { AgentController, AgentEvent } from './server/agent-controller.js';
import { PlacesService } from './server/places-service.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

function resolvePort(): number {
  if (process.env.PORT) {
    const p = parseInt(process.env.PORT, 10);
    if (!isNaN(p) && p > 0) return p;
  }
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    const p = parseInt(process.argv[portArgIdx + 1], 10);
    if (!isNaN(p) && p > 0) return p;
  }
  return 3000;
}
const PORT = resolvePort();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multi-tenant session management
interface UserSession {
  id: string;
  browser: BrowserEngine;
  agent: AgentController;
  sseClients: express.Response[];
  lastActive: number;
}

const sessions = new Map<string, UserSession>();

function getSession(req: express.Request, res?: express.Response): UserSession {
  // Extract session ID from headers, query params or cookies
  let sessionId = (req.headers['x-session-id'] as string) || (req.query.sessionId as string);

  if (!sessionId && req.headers.cookie) {
    const match = req.headers.cookie.match(/morph_session_id=([^;]+)/);
    if (match) sessionId = decodeURIComponent(match[1].trim());
  }

  if (!sessionId) {
    sessionId = 'default';
  }

  if (res && !res.headersSent && sessionId !== 'default') {
    res.setHeader('Set-Cookie', `morph_session_id=${encodeURIComponent(sessionId)}; Path=/; SameSite=Lax`);
  }

  let session = sessions.get(sessionId);
  if (!session) {
    const browser = new BrowserEngine();
    const agent = new AgentController(browser);
    const sseClients: express.Response[] = [];

    agent.subscribe((event: AgentEvent) => {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      for (let i = sseClients.length - 1; i >= 0; i--) {
        try {
          sseClients[i].write(data);
        } catch {
          sseClients.splice(i, 1);
        }
      }
    });

    session = {
      id: sessionId,
      browser,
      agent,
      sseClients,
      lastActive: Date.now(),
    };
    sessions.set(sessionId, session);
  } else {
    session.lastActive = Date.now();
  }

  return session;
}

// Prune inactive sessions older than 2 hours to avoid memory leaks
setInterval(() => {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000;
  for (const [id, session] of sessions.entries()) {
    if (id !== 'default' && now - session.lastActive > maxAge) {
      session.agent.stop();
      sessions.delete(id);
    }
  }
}, 15 * 60 * 1000);

// SSE endpoint for streaming agent activity
app.get('/api/agent/stream', (req, res) => {
  const session = getSession(req, res);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state immediately on connect
  res.write(`data: ${JSON.stringify({ type: 'sync', data: session.agent.getState() })}\n\n`);

  session.sseClients.push(res);

  req.on('close', () => {
    const idx = session.sseClients.indexOf(res);
    if (idx !== -1) {
      session.sseClients.splice(idx, 1);
    }
  });
});

// Start or switch task
app.post('/api/agent/run', async (req, res) => {
  const { objective } = req.body;
  if (!objective || typeof objective !== 'string') {
    return res.status(400).json({ error: 'Objective string is required.' });
  }

  const { agent } = getSession(req, res);

  // If a previous execution is in progress, cleanly stop it first
  agent.stop();

  // Launch new objective immediately
  setTimeout(() => {
    agent.runObjective(objective).catch(err => {
      console.error('[server] Error running agent objective:', err);
    });
  }, 50);

  return res.json({ success: true, message: 'Tarefa iniciada com sucesso.' });
});

// Get agent state snapshot
app.get('/api/agent/state', (req, res) => {
  const { agent } = getSession(req, res);
  return res.json(agent.getState());
});

// Stop / cancel agent task
app.post('/api/agent/stop', (req, res) => {
  const { agent } = getSession(req, res);
  agent.stop();
  return res.json({ success: true, message: 'Agent stopped.' });
});

// Handle sensitive action confirmation
app.post('/api/agent/confirm', (req, res) => {
  const { requestId, approved } = req.body;
  if (!requestId || typeof approved !== 'boolean') {
    return res.status(400).json({ error: 'requestId and approved boolean are required.' });
  }
  const { agent } = getSession(req, res);
  agent.handleConfirmationResponse(requestId, approved);
  return res.json({ success: true });
});

app.post('/api/browser/tab/create', (req, res) => {
  const { browser } = getSession(req, res);
  const { url } = req.body;
  const tabId = browser.createTab(url || 'about:blank');
  return res.json({ tabId, observation: browser.getObservation() });
});

app.post('/api/browser/tab/switch', (req, res) => {
  const { browser } = getSession(req, res);
  const { tabId } = req.body;
  if (!tabId) return res.status(400).json({ error: 'tabId is required' });
  const observation = browser.switchTab(tabId);
  return res.json(observation);
});

app.post('/api/browser/tab/close', (req, res) => {
  const { browser } = getSession(req, res);
  const { tabId } = req.body;
  if (!tabId) return res.status(400).json({ error: 'tabId is required' });
  const observation = browser.closeTab(tabId);
  return res.json(observation);
});

// Browser endpoints
app.get('/api/browser/state', (req, res) => {
  const { browser } = getSession(req, res);
  return res.json(browser.getObservation());
});

app.post('/api/browser/navigate', async (req, res) => {
  const { browser } = getSession(req, res);
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  const observation = await browser.openUrl(url);
  return res.json(observation);
});

app.post('/api/browser/click', async (req, res) => {
  const { browser } = getSession(req, res);
  const { elementId } = req.body;
  if (!elementId) return res.status(400).json({ error: 'elementId is required' });
  const result = await browser.clickElement(String(elementId));
  return res.json(result);
});

app.post('/api/browser/type', async (req, res) => {
  const { browser } = getSession(req, res);
  const { elementId, text, submit } = req.body;
  if (!elementId || text === undefined) {
    return res.status(400).json({ error: 'elementId and text are required' });
  }
  const result = await browser.typeText(String(elementId), String(text), Boolean(submit));
  return res.json(result);
});

app.post('/api/browser/scroll', (req, res) => {
  const { browser } = getSession(req, res);
  const { direction, amount } = req.body;
  const observation = browser.scroll(direction === 'up' ? 'up' : 'down', Number(amount) || 400);
  return res.json(observation);
});

app.post('/api/browser/back', async (req, res) => {
  const { browser } = getSession(req, res);
  const observation = await browser.goBack();
  return res.json(observation);
});

app.post('/api/browser/forward', async (req, res) => {
  const { browser } = getSession(req, res);
  const observation = await browser.goForward();
  return res.json(observation);
});

app.post('/api/browser/reload', async (req, res) => {
  const { browser } = getSession(req, res);
  const observation = await browser.reload();
  return res.json(observation);
});

app.post('/api/browser/form-submit', async (req, res) => {
  const { browser } = getSession(req, res);
  const { action, method, fields, tabId } = req.body;
  if (!action) return res.status(400).json({ error: 'Form action URL is required' });
  try {
    const observation = await browser.submitForm({ action, method, fields: fields || {}, targetTabId: tabId });
    return res.json(observation);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/browser/submit-verification-code', async (req, res) => {
  const { browser } = getSession(req, res);
  const { code, tabId } = req.body;
  if (!code) return res.status(400).json({ error: 'Verification code is required' });
  try {
    const observation = await browser.submitVerificationCode(String(code), tabId);
    return res.json(observation);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/browser/solve-captcha', async (req, res) => {
  const { browser } = getSession(req, res);
  const { tabId } = req.body;
  const observation = browser.setCaptchaSolved(tabId);
  return res.json(observation);
});

// Proxied HTML rendering for live interactive browser viewport
app.get('/api/browser/render', (req, res) => {
  const { browser } = getSession(req, res);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Allow framing by the same origin
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *;");
  return res.send(browser.getProxiedHtml());
});

app.get('/api/browser/text', (req, res) => {
  const { browser } = getSession(req, res);
  return res.json({ text: browser.getCleanedText() });
});

// Places & Geolocation endpoints
app.post('/api/places/search', async (req, res) => {
  const { query, maxResults } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }
  try {
    const result = await PlacesService.searchPlaces(String(query), Number(maxResults) || 10);
    return res.json(result);
  } catch (err: any) {
    console.error('Error in /api/places/search:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/places/details/:placeId', async (req, res) => {
  try {
    const details = await PlacesService.getPlaceDetails(req.params.placeId);
    if (!details) {
      return res.status(404).json({ error: 'Place not found' });
    }
    return res.json(details);
  } catch (err: any) {
    console.error('Error in /api/places/details:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Maps configuration endpoint (provides Google Maps key directly to client)
app.get('/api/maps/config', (_req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyBlyMjf1yOFUNic4_tJ_x9suVCeSS_Iuws';
  return res.json({ apiKey });
});

// Setup Vite or static serving
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Morph AI Browser] Server running on http://0.0.0.0:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] Port ${PORT} is in use. Exiting cleanly for supervisor restart...`);
      process.exit(1);
    } else {
      console.error('[server] Server error:', err);
    }
  });

  const handleShutdown = () => {
    console.log('[server] Shutting down gracefully...');
    server.close(() => {
      console.log('[server] Server closed.');
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 1000).unref();
  };

  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}

startServer().catch(err => {
  console.error('[server] Fatal startup error:', err);
});
