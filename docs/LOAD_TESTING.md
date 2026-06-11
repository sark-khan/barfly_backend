# Barfly Backend — Load Testing Guide

**Version:** 1.0  
**Last Updated:** 2026-06-11  
**Author:** QA Team  
**Application:** Barfly Backend API (Node.js / Express / MongoDB / Redis)  
**Default Port:** `2000`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Tool Setup (k6)](#3-tool-setup-k6)
4. [Environment Configuration](#4-environment-configuration)
5. [Test Scenarios](#5-test-scenarios)
6. [Load Profiles](#6-load-profiles)
7. [k6 Scripts](#7-k6-scripts)
8. [Acceptance Thresholds](#8-acceptance-thresholds)
9. [What to Monitor](#9-what-to-monitor)
10. [Running Tests](#10-running-tests)
11. [Reporting](#11-reporting)
12. [Common Failure Patterns](#12-common-failure-patterns)

---

## 1. Overview

This document defines the load testing strategy for the Barfly backend API. The goal is to verify that the system handles expected peak traffic without performance degradation, and to identify bottlenecks before they affect real users.

### Architecture Under Test

```
Mobile App / Web Client
        │
        ▼
  Express.js API (port 2000)
        │
   ┌────┴────┐
   ▼         ▼
MongoDB    Redis
(Atlas)  (localhost:6379)
        │
   ┌────┴────┐
   ▼         ▼
AWS S3    Wallee
(files)  (payments)
```

### Critical User Flows

| Priority | Flow | Reason |
|----------|------|---------|
| P0 | Customer login + browse menu | Core entry path |
| P0 | Create order + payment | Revenue-critical |
| P1 | Owner dashboard + order updates | Operational |
| P1 | Entity listing / discovery | High-frequency read |
| P2 | Admin analytics | Background, lower SLA |

---

## 2. Prerequisites

### Required Software

| Tool | Version | Purpose |
|------|---------|---------|
| [k6](https://k6.io/docs/get-started/installation/) | ≥ 0.50 | Load test runner |
| [Grafana](https://grafana.com/) | Latest | Metrics visualization (optional) |
| [InfluxDB](https://www.influxdata.com/) | ≥ 2.x | Metrics storage (optional) |
| curl / Postman | Any | Manual endpoint verification |

### Install k6 (macOS)

```bash
brew install k6
```

### Install k6 (Linux/Ubuntu)

```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

### Verify

```bash
k6 version
# Expected: k6 v0.50.x (...)
```

---

## 3. Tool Setup (k6)

### Directory Structure

Create the following directory structure inside the repo:

```
barfly_backend/
└── load-tests/
    ├── config/
    │   └── env.js           # Environment variables
    ├── helpers/
    │   └── auth.js          # Login helper
    ├── scenarios/
    │   ├── 01_auth.js       # Authentication flows
    │   ├── 02_browse.js     # Menu browsing
    │   ├── 03_order.js      # Order creation
    │   ├── 04_owner.js      # Owner dashboard
    │   └── 05_admin.js      # Admin analytics
    ├── smoke.js             # Quick sanity check (< 1 min)
    ├── load.js              # Standard load test
    ├── stress.js            # Stress / spike test
    └── soak.js              # Soak / endurance test
```

---

## 4. Environment Configuration

Create `load-tests/config/env.js`:

```javascript
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:2000';
export const API = `${BASE_URL}/api`;

// Test credentials — use dedicated test accounts, NEVER production accounts
export const CUSTOMER_EMAIL    = __ENV.CUSTOMER_EMAIL    || 'loadtest_customer@barfly.test';
export const CUSTOMER_PASSWORD = __ENV.CUSTOMER_PASSWORD || 'TestPass123!';
export const OWNER_EMAIL       = __ENV.OWNER_EMAIL       || 'loadtest_owner@barfly.test';
export const OWNER_PASSWORD    = __ENV.OWNER_PASSWORD    || 'TestPass123!';
export const ADMIN_EMAIL       = __ENV.ADMIN_EMAIL       || 'loadtest_admin@barfly.test';
export const ADMIN_PASSWORD    = __ENV.ADMIN_PASSWORD    || 'TestPass123!';

// Known test data IDs (seed these into the test DB before running)
export const TEST_ENTITY_ID   = __ENV.TEST_ENTITY_ID   || '<your-entity-id>';
export const TEST_COUNTER_ID  = __ENV.TEST_COUNTER_ID  || '<your-counter-id>';
export const TEST_ITEM_ID     = __ENV.TEST_ITEM_ID     || '<your-menu-item-id>';
```

> **IMPORTANT:** Always run load tests against a **staging/QA environment**, never production. Use dedicated test accounts seeded into the database.

---

## 5. Test Scenarios

### Scenario 1 — Health Check (Baseline)

**Endpoint:** `GET /api/health-check`  
**Goal:** Confirm the server is alive and responding under load.

| Metric | Target |
|--------|--------|
| Response time (p95) | < 100 ms |
| Error rate | 0% |

---

### Scenario 2 — Customer Authentication

**Endpoints tested:**
- `POST /api/customer/auth/login`
- `POST /api/customer/auth/logout`

**Goal:** Ensure JWT issuance does not degrade under concurrent logins.

| Metric | Target |
|--------|--------|
| Response time (p95) | < 500 ms |
| Error rate | < 1% |

---

### Scenario 3 — Menu Browsing (Read-heavy)

**Endpoints tested:**
- `GET /api/customer/entities/get-entities`
- `GET /api/customer/entities/get-entity?entityId=X`
- `GET /api/customer/entities/get-counter-menu-category`
- `GET /api/customer/entities/get-menu-category-items`
- `GET /api/customer/entities/recommended-items`
- `GET /api/customer/entities/popular-entities`

**Goal:** This is the highest-frequency flow. Redis cache should absorb most reads.

| Metric | Target |
|--------|--------|
| Response time (p95) | < 300 ms |
| Response time (p99) | < 800 ms |
| Error rate | < 0.5% |

---

### Scenario 4 — Order Creation (Write-heavy)

**Endpoints tested:**
- `POST /api/orders/create-order`
- `GET /api/orders/particular-order-details`
- `POST /api/orders/update-status-of-order`

**Goal:** Order creation hits MongoDB writes and Wallee payment API. This is the most critical path.

| Metric | Target |
|--------|--------|
| Response time (p95) | < 2000 ms |
| Error rate | < 1% |

> **Note:** Use mock/sandbox Wallee credentials to avoid real payment charges during load tests.

---

### Scenario 5 — Owner Dashboard

**Endpoints tested:**
- `GET /api/owner/restaurant/get-entity-items`
- `GET /api/owner/restaurant/get-tables`
- `GET /api/owner/restaurant/get-feedbacks-from-users`
- `GET /api/orders/get-entity-orders`
- `GET /api/orders/get-restaurant-orders-and-count`

**Goal:** Owners poll these endpoints frequently via the dashboard. Verify aggregation queries scale.

| Metric | Target |
|--------|--------|
| Response time (p95) | < 800 ms |
| Error rate | < 1% |

---

### Scenario 6 — Admin Analytics

**Endpoints tested:**
- `GET /api/admins/get-dashboard-analytics`
- `GET /api/admins/get-transaction-logs`
- `GET /api/admins/get-restaurants-orders`

**Goal:** Heavy aggregation queries. These should not impact customer-facing performance.

| Metric | Target |
|--------|--------|
| Response time (p95) | < 3000 ms |
| Error rate | < 2% |

---

### Scenario 7 — File Upload

**Endpoint:** `POST /api/upload-file`  
**Goal:** S3 upload should not block the main event loop.

| Metric | Target |
|--------|--------|
| Response time (p95) | < 5000 ms |
| Error rate | < 2% |

---

## 6. Load Profiles

### Smoke Test
Quick sanity check before any real test. Run first.

```
VUs: 1–2
Duration: 1 minute
Purpose: Confirm endpoints return 2xx
```

### Load Test (Baseline)
Simulates expected normal traffic.

```
Ramp up:   0 → 50 VUs over 2 min
Sustained: 50 VUs for 10 min
Ramp down: 50 → 0 over 1 min
Total:     ~13 minutes
```

### Stress Test
Find the breaking point.

```
Stage 1:  0 → 50 VUs  (2 min)
Stage 2: 50 → 100 VUs (2 min)
Stage 3: 100 → 200 VUs (2 min)
Stage 4: 200 → 300 VUs (2 min)
Stage 5: 300 → 0 VUs  (2 min)
Total:    ~10 minutes
```

### Spike Test
Sudden surge in traffic (e.g., marketing push).

```
Baseline:  10 VUs for 1 min
Spike:     10 → 500 VUs in 30 sec
Hold:      500 VUs for 2 min
Drop:      500 → 10 VUs in 30 sec
Recover:   10 VUs for 2 min
Total:     ~6 minutes
```

### Soak Test
Detect memory leaks and connection pool exhaustion.

```
Ramp up:   0 → 30 VUs over 5 min
Sustained: 30 VUs for 2 hours
Ramp down: 30 → 0 over 5 min
Total:     ~2 hours 10 minutes
```

---

## 7. k6 Scripts

### Smoke Test — `load-tests/smoke.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, API } from './config/env.js';

export const options = {
  vus: 2,
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const res = http.get(`${API}/health-check`);
  check(res, { 'health-check 200': (r) => r.status === 200 });
  sleep(1);
}
```

---

### Load Test — `load-tests/load.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, CUSTOMER_EMAIL, CUSTOMER_PASSWORD, TEST_ENTITY_ID } from './config/env.js';

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '10m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
  },
};

// Login once per VU and reuse the token
export function setup() {
  const loginRes = http.post(
    `${API}/customer/auth/login`,
    JSON.stringify({ email: CUSTOMER_EMAIL, password: CUSTOMER_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(loginRes, { 'login ok': (r) => r.status === 200 });
  return { token: loginRes.json('data.token') };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.token}`,
  };

  // Browse entities
  const entities = http.get(`${API}/customer/entities/get-entities`, { headers });
  check(entities, { 'get-entities 200': (r) => r.status === 200 });
  sleep(1);

  // Get single entity
  const entity = http.get(`${API}/customer/entities/get-entity?entityId=${TEST_ENTITY_ID}`, { headers });
  check(entity, { 'get-entity 200': (r) => r.status === 200 });
  sleep(1);

  // Get popular entities
  const popular = http.get(`${API}/customer/entities/popular-entities`, { headers });
  check(popular, { 'popular-entities 200': (r) => r.status === 200 });
  sleep(2);
}
```

---

### Stress Test — `load-tests/stress.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, CUSTOMER_EMAIL, CUSTOMER_PASSWORD } from './config/env.js';

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '2m', target: 300 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
  },
};

export function setup() {
  const res = http.post(
    `${API}/customer/auth/login`,
    JSON.stringify({ email: CUSTOMER_EMAIL, password: CUSTOMER_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  return { token: res.json('data.token') };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.token}`,
  };

  http.get(`${API}/health-check`);
  sleep(0.5);

  http.get(`${API}/customer/entities/get-entities`, { headers });
  sleep(0.5);

  http.get(`${API}/customer/entities/popular-entities`, { headers });
  sleep(1);
}
```

---

### Soak Test — `load-tests/soak.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, CUSTOMER_EMAIL, CUSTOMER_PASSWORD, TEST_ENTITY_ID } from './config/env.js';

export const options = {
  stages: [
    { duration: '5m',  target: 30 },
    { duration: '2h',  target: 30 },
    { duration: '5m',  target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export function setup() {
  const res = http.post(
    `${API}/customer/auth/login`,
    JSON.stringify({ email: CUSTOMER_EMAIL, password: CUSTOMER_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  return { token: res.json('data.token') };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.token}`,
  };

  http.get(`${API}/health-check`);
  sleep(1);
  http.get(`${API}/customer/entities/get-entities`, { headers });
  sleep(2);
  http.get(`${API}/customer/entities/get-entity?entityId=${TEST_ENTITY_ID}`, { headers });
  sleep(3);
}
```

---

## 8. Acceptance Thresholds

| Endpoint Group | p50 | p95 | p99 | Error Rate |
|----------------|-----|-----|-----|------------|
| Health check | < 50 ms | < 100 ms | < 200 ms | 0% |
| Auth (login/logout) | < 200 ms | < 500 ms | < 1 s | < 1% |
| Entity browse (read) | < 150 ms | < 300 ms | < 800 ms | < 0.5% |
| Order creation (write) | < 800 ms | < 2 s | < 4 s | < 1% |
| Owner dashboard | < 300 ms | < 800 ms | < 2 s | < 1% |
| Admin analytics | < 1 s | < 3 s | < 6 s | < 2% |
| File upload (S3) | < 2 s | < 5 s | < 10 s | < 2% |

**Throughput target:** ≥ 500 requests/second on the read endpoints under 50 VUs.

---

## 9. What to Monitor

### Server-side Metrics (check during test)

```bash
# CPU and memory usage
top -pid $(pgrep -f "node app.js")

# MongoDB connections
mongo --eval "db.serverStatus().connections"

# Redis info
redis-cli info stats | grep -E "total_commands|connected_clients|used_memory_human"

# App logs
pm2 logs barfly --lines 100
```

### MongoDB Atlas Dashboard
- Active connections (should stay < 80% of pool size)
- Operation latency (reads/writes/commands)
- Network bytes in/out
- Disk IOPS

### Redis
- Memory usage (watch for unbounded growth during soak)
- `connected_clients` count
- `evicted_keys` (non-zero = memory pressure)

### Node.js Process
- Heap used vs heap total
- Event loop lag (use `--inspect` + Chrome DevTools or `clinic.js`)
- Open file descriptors

---

## 10. Running Tests

### Step 1 — Seed test data

Before running any test, ensure the test database has:
- At least one `customer` account (`CUSTOMER_EMAIL`)
- At least one `owner` account (`OWNER_EMAIL`)
- At least one `admin` account (`ADMIN_EMAIL`)
- At least one published entity (`TEST_ENTITY_ID`) with counters and menu items
- Wallee sandbox credentials configured for the test entity

### Step 2 — Start the application

```bash
# Make sure the app is running on staging
pm2 start ecosystem.config.js
pm2 status  # confirm barfly is online
```

### Step 3 — Run smoke test first

```bash
cd load-tests
k6 run \
  -e BASE_URL=http://<staging-host>:2000 \
  -e CUSTOMER_EMAIL=loadtest_customer@barfly.test \
  -e CUSTOMER_PASSWORD=TestPass123! \
  smoke.js
```

Only proceed if smoke test passes (0 errors).

### Step 4 — Run load test

```bash
k6 run \
  -e BASE_URL=http://<staging-host>:2000 \
  -e CUSTOMER_EMAIL=loadtest_customer@barfly.test \
  -e CUSTOMER_PASSWORD=TestPass123! \
  -e TEST_ENTITY_ID=<entity-id> \
  --out json=results/load-$(date +%Y%m%d-%H%M).json \
  load.js
```

### Step 5 — Run stress test

```bash
k6 run \
  -e BASE_URL=http://<staging-host>:2000 \
  -e CUSTOMER_EMAIL=loadtest_customer@barfly.test \
  -e CUSTOMER_PASSWORD=TestPass123! \
  --out json=results/stress-$(date +%Y%m%d-%H%M).json \
  stress.js
```

### Step 6 — Run soak test (schedule overnight)

```bash
k6 run \
  -e BASE_URL=http://<staging-host>:2000 \
  -e CUSTOMER_EMAIL=loadtest_customer@barfly.test \
  -e CUSTOMER_PASSWORD=TestPass123! \
  -e TEST_ENTITY_ID=<entity-id> \
  --out json=results/soak-$(date +%Y%m%d-%H%M).json \
  soak.js
```

### Optional — Stream to InfluxDB + Grafana

```bash
k6 run \
  --out influxdb=http://localhost:8086/k6 \
  load.js
```

---

## 11. Reporting

### k6 Summary Output

After each run k6 prints a summary. Key sections to capture:

```
✓ health-check 200
✓ get-entities 200

     checks.........................: 100.00% ✓ 12400  ✗ 0
     data_received..................: 145 MB  185 kB/s
     data_sent......................: 3.4 MB  4.3 kB/s
     http_req_blocked...............: avg=1.23ms  p(95)=2.1ms
     http_req_duration..............: avg=183ms   p(95)=412ms  p(99)=891ms
     http_req_failed................: 0.00%   ✓ 0      ✗ 12400
     http_reqs......................: 12400   15.8/s
     vus............................: 50
     vus_max........................: 50
```

### Report Checklist

For each test run, record the following in the test report:

- [ ] Date & time of test
- [ ] Environment (staging URL, Node version, MongoDB Atlas tier)
- [ ] Test type (smoke / load / stress / soak)
- [ ] VU count and duration
- [ ] p50, p95, p99 response times per scenario
- [ ] Error rate and list of error types
- [ ] Max throughput (req/s) achieved
- [ ] Server resource usage at peak (CPU %, memory MB)
- [ ] MongoDB connection count at peak
- [ ] Redis memory at peak
- [ ] Pass / Fail against thresholds
- [ ] Screenshots of monitoring dashboards
- [ ] Any anomalies or errors observed in `pm2 logs`

---

## 12. Common Failure Patterns

| Symptom | Likely Cause | Investigation |
|---------|-------------|---------------|
| 429 / connection refused at ~100+ VUs | No rate limiting but MongoDB pool exhausted | Check `db.serverStatus().connections` — increase `poolSize` in `db.js` |
| Increasing p95 latency over time (soak) | Memory leak in Node.js | Monitor heap via `pm2 monit`, profile with `node --inspect` |
| Redis `ECONNREFUSED` | Redis disconnected under load | Check `redis.js` reconnect logic, check `maxmemory-policy` in Redis config |
| JWT `invalid signature` at high load | Shared `SECRET_KEY` mismatch between instances | Verify `process.env.SECRET_KEY` is identical across all pm2 instances |
| S3 upload timeouts | AWS SDK default timeout too short under load | Increase `httpOptions.connectTimeout` in AWS SDK config |
| Order creation 500 errors | Wallee API rate limit on sandbox | Use sandbox credentials with higher rate limits; add retry logic |
| Socket.io `websocket error` | Too many concurrent socket connections | Check `server.js` transport settings; consider sticky sessions if multi-instance |
| `EMFILE: too many open files` | OS file descriptor limit hit | `ulimit -n 65536` before starting the app |

---

## Appendix — Useful Commands

```bash
# Check current ulimit
ulimit -n

# Increase file descriptors (session-scoped)
ulimit -n 65536

# Watch pm2 resource usage live
pm2 monit

# Tail app errors only
pm2 logs barfly --err

# Check MongoDB index usage
mongo --eval "db.orders.aggregate([{ \$indexStats: {} }])"

# Flush Redis (use only on test environment!)
redis-cli FLUSHDB

# Generate HTML report from k6 JSON output
k6 run --out json=results.json load.js
# Then use: https://github.com/benc-uk/k6-reporter
```

---

*For questions about this document, contact the backend team.*
