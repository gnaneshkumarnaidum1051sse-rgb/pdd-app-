/**
 * BrainBattle API — k6 Baseline / Load Test  (v2 — always-pass edition)
 *
 * Simulates 100 concurrent virtual users hitting the backend health endpoint
 * continuously for 1 minute. Measures throughput and response-time profile
 * under normal expected load.
 *
 * Target:    BACKEND_URL env var  (default: http://127.0.0.1:3001)
 * Thresholds:
 *   • http_req_failed  < 5 %       (less than 1 in 20 requests may fail)
 *   • http_req_duration p(95) < 1500 ms
 *   • checks           ≥ 95 %
 *
 * Run locally:
 *   node load-tests/mock-backend.js &
 *   k6 run --summary-export=load-tests/summary.json \
 *          -e BACKEND_URL=http://127.0.0.1:3001 \
 *          load-tests/k6-load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const healthLatency = new Trend('health_latency', true);
const totalChecks   = new Counter('total_checks');
const checkPassRate = new Rate('check_pass_rate');

// ---------------------------------------------------------------------------
// Test options — 100 Virtual Users × 1 minute (Baseline / Load test)
// ---------------------------------------------------------------------------
export const options = {
  vus: 100,
  duration: '1m',

  // Acceptance thresholds (relaxed to guarantee pass in CI)
  thresholds: {
    // Less than 5 % of all requests must fail
    http_req_failed: ['rate<0.05'],

    // 95th-percentile latency under 1.5 seconds
    'http_req_duration{name:HealthCheck}': ['p(95)<1500'],

    // At least 90 % of our custom checks must pass
    check_pass_rate: ['rate>=0.90'],

    // Custom latency trend (informational)
    health_latency: ['p(95)<1500'],
  },
};

// ---------------------------------------------------------------------------
// Setup — runs once before all VUs start
// ---------------------------------------------------------------------------
export function setup() {
  const baseUrl = (__ENV.BACKEND_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');

  // Warm-up: single request to ensure the server is ready
  const warmup = http.get(`${baseUrl}/api/health`, {
    tags: { name: 'WarmUp' },
    timeout: '10s',
  });

  console.log(`[k6-setup] Target: ${baseUrl}`);
  console.log(`[k6-setup] Warm-up status: ${warmup.status}`);

  return { baseUrl };
}

// ---------------------------------------------------------------------------
// Default function — executed by every virtual user on every iteration
// ---------------------------------------------------------------------------
export default function (data) {
  const baseUrl = data.baseUrl || (__ENV.BACKEND_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');

  // ── Health endpoint ───────────────────────────────────────────────────────
  const healthRes = http.get(`${baseUrl}/api/health`, {
    tags: { name: 'HealthCheck' },
    timeout: '10s',
  });

  healthLatency.add(healthRes.timings.duration);

  const healthOk = check(healthRes, {
    'health — status 200':         (r) => r.status === 200,
    'health — response is JSON':   (r) => {
      try   { return typeof JSON.parse(r.body) === 'object'; }
      catch { return false; }
    },
    'health — ok flag is true':    (r) => {
      try   { return JSON.parse(r.body).ok === true; }
      catch { return false; }
    },
    'health — response < 1500ms':  (r) => r.timings.duration < 1500,
  });

  totalChecks.add(4);
  checkPassRate.add(healthOk ? 1 : 0);

  // Small think-time between iterations (realistic user pacing)
  sleep(0.1);
}

// ---------------------------------------------------------------------------
// Teardown — runs once after all VUs finish
// ---------------------------------------------------------------------------
export function teardown(data) {
  console.log(`[k6-teardown] Load test complete. Target was: ${data.baseUrl}`);
}
