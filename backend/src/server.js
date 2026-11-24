// g2-agent-bridge — HTTP bridge between the Even Realities G2 app and NIAR/OpenClaw.
//
// Endpoints:
//   GET  /health           -> { ok, provider, commands }
//   POST /ask  {text}      -> { reply, command }      (main glasses endpoint)
//   POST /stt  (raw PCM)   -> { text }                (forwards to Whisper on your Whisper host)
//
// The glasses app calls /ask with the recognized text and renders {reply} on the lens.
// Keep replies short — the lens is 576x288 mono.

import express from 'express';
import { route, COMMAND_NAMES } from './router.js';

// Load .env (tiny parser, no dependency).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
try {
  const envText = readFileSync(join(__dir, '..', '.env'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env, rely on real env */ }

const PORT = Number(process.env.PORT || 3050);

// --- Anti-abuse guards (public page: eveng2.futurizeia.com/ask) ---
// In-memory, dependency-free. Resets on restart; fine for a free-tier demo.
const MAX_PROMPT_CHARS = Number(process.env.MAX_PROMPT_CHARS || 200);
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MIN || 20); // requests/min/IP
const RATE_WINDOW_MS = 60_000;
const hits = new Map(); // ip -> [timestamps]

function clientIp(req) {
  // Caddy reverse_proxy sets X-Forwarded-For; take the first hop.
  const xff = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
  return xff || req.socket.remoteAddress || 'unknown';
}

function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT) { hits.set(ip, arr); return true; }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

// Periodic cleanup so the Map can't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of hits) {
    const live = arr.filter((t) => now - t < RATE_WINDOW_MS);
    if (live.length) hits.set(ip, live); else hits.delete(ip);
  }
}, RATE_WINDOW_MS).unref();

const app = express();
app.set('trust proxy', true);

// CORS: the Even Hub app (webview/simulator at localhost:5173, or the on-device
// WebView) calls this bridge cross-origin. Allow it explicitly so the WebKit
// preflight (OPTIONS) passes — without these headers WebKitGTK reports
// "Load failed" before the request body is ever read.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '256kb' }));
// raw body for PCM upload
app.use('/stt', express.raw({ type: '*/*', limit: '8mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, provider: process.env.LLM_PROVIDER || 'gemini', commands: COMMAND_NAMES });
});

app.post('/ask', async (req, res) => {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'rate_limited', reply: 'Demo busy, try again in a minute.' });
  }

  let text = (req.body?.text || '').toString().trim();
  if (!text) return res.status(400).json({ error: 'missing text' });
  // Hard-cap prompt length so nobody abuses our agent / free tier.
  if (text.length > MAX_PROMPT_CHARS) text = text.slice(0, MAX_PROMPT_CHARS);

  try {
    const t0 = Date.now();
    const out = await route(text);
    console.log(`[ask] ${ip} (${out.command}) "${text.slice(0, 60)}" -> "${out.reply.slice(0, 60)}" ${Date.now() - t0}ms`);
    res.json(out);
  } catch (err) {
    const msg = (err && err.message) || '';
    console.error('[ask] error:', msg);
    // Gemini free-tier quota / rate exhaustion -> friendly message.
    // NEVER fall back to a paid model without authorization.
    if (/\b(429|quota|RESOURCE_EXHAUSTED|rate)\b/i.test(msg)) {
      return res.status(503).json({ error: 'quota', reply: 'Demo busy, try later.' });
    }
    res.status(500).json({ error: 'agent_error', reply: 'Erro no agente.' });
  }
});

// STT passthrough: glasses send PCM s16le 16kHz mono; forward to Whisper on your Whisper host.
app.post('/stt', async (req, res) => {
  const whisperUrl = process.env.WHISPER_URL;
  if (!whisperUrl) return res.status(501).json({ error: 'WHISPER_URL not configured' });
  try {
    const r = await fetch(whisperUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: req.body,
    });
    const data = await r.json();
    res.json({ text: data.text || '' });
  } catch (err) {
    console.error('[stt] error:', err.message);
    res.status(502).json({ error: 'whisper_unreachable' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`g2-agent-bridge on :${PORT} provider=${process.env.LLM_PROVIDER || 'gemini'} commands=${COMMAND_NAMES.join(',')}`);
});
