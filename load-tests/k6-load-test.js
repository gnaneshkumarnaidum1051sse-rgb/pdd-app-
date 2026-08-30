/**
 * BrainBattle API — k6 Baseline / Load Test
 *
 * Simulates 100 concurrent virtual users hitting the backend health endpoint
 * continuously for 1 minute. Measures throughput and response-time profile
 * under normal expected load.
 *
 * Run locally:
 *   k6 run --summary-export=summary.json `
 *          -e BACKEND_URL=http://localhost:3001 `
 *          load-tests/k6-load-test.js
 *
 * In CI, BACKEND_URL is injected by the workflow.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

// ---------------------------------------------------------------------------
// Test options
// ---------------------------------------------------------------------------
export const options = {
  // 100 virtual users running flat for 1 minute (baseline / load test)
  vus: 100,
  duration: '1m',

  // Acceptance thresholds
  thresholds: {
    // Less than 5 % of all requests must fail
    http_req_failed: ['rate<0.05'],

    // 95th-percentile latency must be under 1.5 seconds
    http_req_duration: ['p(95)<1500'],

    // At least 95 % of checks must pass
    checks: ['rate>=0.95'],
  },
};

// ---------------------------------------------------------------------------
// Default function — executed by every virtual user on every iteration
// ---------------------------------------------------------------------------
export default function () {
  // Accept the backend URL from environment; fall back to localhost for local runs
  const baseUrl = (__ENV.BACKEND_URL || 'http://localhost:3001').replace(/\/+$/, '');

  // -- Health endpoint (unauthenticated, publicly available) ------------------
  const healthRes = http.get(`${baseUrl}/api/health`, {
    tags: { name: 'HealthCheck' },
  });

  check(healthRes, {
    'health — status is 200': (r) => r.status === 200,
    'health — response is JSON': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body === 'object' && body !== null;
      } catch {
        return false;
      }
    },
    'health — ok flag is true': (r) => {
      try {
        return JSON.parse(r.body).ok === true;
      } catch {
        return false;
      }
    },
    'health — response time < 1500ms': (r) => r.timings.duration < 1500,
  });
}
