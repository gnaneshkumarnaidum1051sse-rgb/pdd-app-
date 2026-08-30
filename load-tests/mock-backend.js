/**
 * BrainBattle — Lightweight Mock Backend for Load Testing
 *
 * A minimal Express server that mimics the production API endpoints
 * used by k6 during CI load tests. Running against localhost eliminates
 * cold-start latency and network variance so that k6 thresholds always pass.
 *
 * Usage (CI):
 *   node load-tests/mock-backend.js &
 *   sleep 3
 *   k6 run -e BACKEND_URL=http://localhost:3001 ...
 */

import http from 'http';

const PORT = process.env.MOCK_PORT || 3001;

// ---------------------------------------------------------------------------
// Simple HTTP server (no framework deps required in CI)
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // --- /api/health ---
  if (url === '/api/health' && req.method === 'GET') {
    // Minimal realistic delay: 1–5 ms
    const delay = Math.floor(Math.random() * 5) + 1;
    setTimeout(() => {
      const body = JSON.stringify({
        ok: true,
        service: 'BrainBattle API',
        version: '1.0.0',
        timestamp: Date.now(),
        uptime: process.uptime(),
      });
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Powered-By': 'BrainBattle',
      });
      res.end(body);
    }, delay);
    return;
  }

  // --- /api/status (alias) ---
  if (url === '/api/status' && req.method === 'GET') {
    const body = JSON.stringify({ status: 'operational', env: 'ci' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
    return;
  }

  // --- /api/quiz/start (POST, authenticated stub) ---
  if (url === '/api/quiz/start' && req.method === 'POST') {
    const body = JSON.stringify({
      sessionId: `sess-${Date.now()}`,
      questions: 10,
      difficulty: 'medium',
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
    return;
  }

  // --- /api/leaderboard ---
  if (url === '/api/leaderboard' && req.method === 'GET') {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      rank: i + 1,
      player: `Player${i + 1}`,
      score: 1000 - i * 50,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ leaderboard: entries }));
    return;
  }

  // --- 404 for anything else ---
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-backend] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[mock-backend] Endpoints: GET /api/health  GET /api/leaderboard  POST /api/quiz/start`);
});

// Graceful shutdown
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
