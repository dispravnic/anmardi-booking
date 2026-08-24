/**
 * mockYeastar.js
 * Zero-dependency mock of the Yeastar TG1600 CGI SMS endpoint.
 * Uses only Node built-ins — no npm install required.
 * Runs on port 8080 inside the mock-yeastar Docker container.
 *
 * Endpoint: GET /cgi/WebCGI
 * Query params: account, password, port (SIM 1-16), destination, content
 */

import { createServer } from 'node:http';
import { URL }          from 'node:url';

const PORT           = 8080;
const SUCCESS_MARKER = 'Response: SUCCESS, Message Sent via SIM';

const server = createServer((req, res) => {
  const base   = `http://localhost:${PORT}`;
  const parsed = new URL(req.url, base);

  // ── Health check ─────────────────────────────────────────────
  if (parsed.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'mock-yeastar-tg1600' }));
    return;
  }

  // ── CGI endpoint ─────────────────────────────────────────────
  if (!parsed.pathname.startsWith('/cgi/WebCGI')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const qs = parsed.searchParams;

  // Support both packed CGI format (?1500101=account=...) and standard QS
  let account     = qs.get('account')     ?? '';
  let port        = qs.get('port')        ?? '';
  let destination = qs.get('destination') ?? '';
  let content     = qs.get('content')     ?? '';

  const packed = qs.get('1500101');
  if (packed) {
    const m = String(packed).match(/^account=(.+)$/);
    if (m) account = m[1];
  }

  const portNum        = parseInt(port, 10);
  const decodedContent = decodeURIComponent(content);
  const simLabel       = `SIM_${portNum}`;

  // ── Formatted terminal banner ─────────────────────────────────
  const W = 56;
  const hr = '═'.repeat(W);
  const pad = (s, n) => String(s).padEnd(n);

  console.log(`\n╔${hr}╗`);
  console.log(`║  🛰  YEASTAR TG1600 — OUTBOUND SMS${' '.repeat(W - 35)}║`);
  console.log(`╠${hr}╣`);
  console.log(`║  Active SIM Port : ${pad(simLabel, W - 20)}║`);
  console.log(`║  Destination     : ${pad(destination, W - 20)}║`);
  console.log(`║  Account         : ${pad(account, W - 20)}║`);
  console.log(`╠${hr}╣`);
  console.log(`║  Message:${' '.repeat(W - 10)}║`);

  const words = decodedContent.replace(/\n/g, ' ↵ ').split(' ');
  let line = '';
  for (const word of words) {
    if ((line + word).length > W - 6) {
      console.log(`║    ${pad(line.trim(), W - 5)}║`);
      line = word + ' ';
    } else {
      line += word + ' ';
    }
  }
  if (line.trim()) console.log(`║    ${pad(line.trim(), W - 5)}║`);

  console.log(`╠${hr}╣`);

  // ── Validate ──────────────────────────────────────────────────
  if (!destination || isNaN(portNum) || portNum < 1 || portNum > 16) {
    const errMsg = 'Response: ERROR, Invalid Parameters';
    console.log(`║  STATUS : ❌  ${pad(errMsg, W - 15)}║`);
    console.log(`╚${hr}╝\n`);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(errMsg);
    return;
  }

  console.log(`║  STATUS : ✅  ${pad(SUCCESS_MARKER, W - 15)}║`);
  console.log(`╚${hr}╝\n`);

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(SUCCESS_MARKER);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n[Mock Yeastar TG1600] Listening on http://0.0.0.0:${PORT}`);
  console.log('Endpoint: GET /cgi/WebCGI');
  console.log('Health:   GET /health\n');
});
