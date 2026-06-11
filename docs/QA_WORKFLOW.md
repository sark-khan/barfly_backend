# Barfly Backend — QA Load Testing Workflow

**Version:** 1.0  
**Last Updated:** 2026-06-11  
**Audience:** QA Engineer  
**Companion Doc:** [LOAD_TESTING.md](./LOAD_TESTING.md)

---

## Overview

This document is a step-by-step workflow for executing load tests on the Barfly backend. Follow each phase in order. Do not skip phases — each gate exists to prevent wasted test runs and false results.

---

## Phase 0 — Preparation Checklist

Complete every item before touching the test environment.

### 0.1 Communication

- [ ] Notify the backend team that a load test is scheduled (at least 24 h in advance)
- [ ] Confirm no deployments are planned during the test window
- [ ] Get access credentials for the **staging** environment from the backend team
- [ ] Confirm staging MongoDB Atlas tier is equivalent to production (same cluster size)
- [ ] Confirm Redis is running on staging (`redis-cli ping` → `PONG`)

### 0.2 Environment Setup

- [ ] k6 installed and version confirmed (`k6 version`)
- [ ] Load test scripts cloned/copied into `barfly_backend/load-tests/`
- [ ] `load-tests/config/env.js` updated with staging URL and test credentials
- [ ] Test database seeded:
  - [ ] `loadtest_customer@barfly.test` customer account created
  - [ ] `loadtest_owner@barfly.test` owner account created
  - [ ] `loadtest_admin@barfly.test` admin account created
  - [ ] At least one published entity with counters and menu items
  - [ ] `TEST_ENTITY_ID` noted and added to `env.js`
  - [ ] Wallee **sandbox** credentials configured on the test entity
- [ ] Results directory created: `load-tests/results/`
- [ ] Monitoring access confirmed (MongoDB Atlas dashboard, pm2 monit, Redis CLI)
- [ ] OS file descriptor limit raised: `ulimit -n 65536`

### 0.3 Baseline Snapshot

Before any load test, capture a clean baseline:

```bash
# Server memory
pm2 monit  # note heap usage at idle

# MongoDB connections at idle
mongo --eval "db.serverStatus().connections"

# Redis memory at idle
redis-cli info memory | grep used_memory_human
```

Record these numbers in your test report as the **idle baseline**.

---

## Phase 1 — Smoke Test

**Duration:** ~1 minute  
**Goal:** Confirm the application is healthy and reachable before committing to a full run.

```
┌──────────────────────────────────────────────────────┐
│  RULE: If the smoke test fails, STOP.                │
│  Fix the issue before running any other test.        │
└──────────────────────────────────────────────────────┘
```

### Run

```bash
cd barfly_backend/load-tests

k6 run \
  -e BASE_URL=http://<staging-host>:2000 \
  -e CUSTOMER_EMAIL=loadtest_customer@barfly.test \
  -e CUSTOMER_PASSWORD=TestPass123! \
  --out json=results/smoke-$(date +%Y%m%d-%H%M).json \
  smoke.js
```

### Pass Criteria

| Check | Expected |
|-------|----------|
| `health-check` returns 200 | ✅ |
| Customer login returns 200 with token | ✅ |
| Error rate | 0% |
| p95 response time | < 500 ms |

### On Failure

1. Check `pm2 logs barfly --err` for stack traces
2. Verify MongoDB and Redis are connected (`pm2 status`)
3. Try the endpoint manually with curl:
   ```bash
   curl -X GET http://<staging-host>:2000/api/health-check
   ```
4. Fix the issue, then re-run smoke test

---

## Phase 2 — Load Test (Baseline Performance)

**Duration:** ~13 minutes  
**Goal:** Measure normal traffic performance under expected concurrent users (50 VUs).

### Run

```bash
k6 run \
  -e BASE_URL=http://<staging-host>:2000 \
  -e CUSTOMER_EMAIL=loadtest_customer@barfly.test \
  -e CUSTOMER_PASSWORD=TestPass123! \
  -e TEST_ENTITY_ID=<entity-id> \
  --out json=results/load-$(date +%Y%m%d-%H%M).json \
  load.js
```

### During the Test — Monitor These

Open a second terminal and watch:

```bash
# Node.js process
pm2 monit

# MongoDB connections (run every 30 sec)
watch -n 30 'mongo --eval "db.serverStatus().connections"'

# Redis
watch -n 30 'redis-cli info stats | grep -E "total_commands|connected_clients|used_memory"'

# App errors
pm2 logs barfly --err --lines 0
```

### Pass Criteria

| Metric | Target | Result |
|--------|--------|--------|
| p95 response time (all endpoints) | < 1000 ms | |
| p99 response time | < 2000 ms | |
| Error rate | < 1% | |
| Throughput | ≥ 300 req/s | |
| MongoDB connections | < 80% of pool | |

### Record

- Screenshot pm2 monit at peak VU count
- Screenshot MongoDB Atlas metrics at peak
- Note any errors in pm2 logs

---

## Phase 3 — Stress Test (Breaking Point)

**Duration:** ~10 minutes  
**Goal:** Find the VU count at which the application starts failing or degrading significantly.

```
┌──────────────────────────────────────────────────────┐
│  NOTE: This test is EXPECTED to cause errors         │
│  at high VU counts. That is the point.               │
└──────────────────────────────────────────────────────┘
```

### Run

```bash
k6 run \
  -e BASE_URL=http://<staging-host>:2000 \
  -e CUSTOMER_EMAIL=loadtest_customer@barfly.test \
  -e CUSTOMER_PASSWORD=TestPass123! \
  --out json=results/stress-$(date +%Y%m%d-%H%M).json \
  stress.js
```

### What to Look For

| Stage | VUs | Expected Behavior |
|-------|-----|-------------------|
| 1 | 0 → 50 | Healthy, p95 < 500 ms |
| 2 | 50 → 100 | Slight increase in latency |
| 3 | 100 → 200 | Latency climbs, watch for first errors |
| 4 | 200 → 300 | **Breaking point** — note the VU count where errors > 5% |
| 5 | 300 → 0 | System should **recover** — if it doesn't, that's a bug |

### Record

- VU count where error rate first exceeded 1%
- VU count where error rate exceeded 5%
- p95 latency at each stage
- Whether the system recovered after ramp-down
- Types of errors observed (timeout, 500, 503, connection refused)

---

## Phase 4 — Spike Test (Surge Traffic)

**Duration:** ~6 minutes  
**Goal:** Simulate a sudden spike (e.g., marketing campaign, event promotion push).

### Run

```bash
k6 run \
  -e BASE_URL=http://<staging-host>:2000 \
  -e CUSTOMER_EMAIL=loadtest_customer@barfly.test \
  -e CUSTOMER_PASSWORD=TestPass123! \
  --out json=results/spike-$(date +%Y%m%d-%H%M).json \
  - <<'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

const API = `${__ENV.BASE_URL}/api`;

export const options = {
  stages: [
    { duration: '1m',  target: 10 },
    { duration: '30s', target: 500 },
    { duration: '2m',  target: 500 },
    { duration: '30s', target: 10 },
    { duration: '2m',  target: 10 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],
  },
};

export default function () {
  http.get(`${API}/health-check`);
  sleep(1);
}
EOF
```

### Pass Criteria

| Check | Expected |
|-------|----------|
| System handles spike without complete failure | Error rate < 10% during spike |
| System recovers within 2 min after spike drops | Error rate returns < 1% |

---

## Phase 5 — Soak Test (Endurance)

**Duration:** ~2 hours 10 minutes  
**Goal:** Detect memory leaks, connection pool exhaustion, and gradual degradation.

**Schedule this overnight or on a weekend.**

### Run

```bash
k6 run \
  -e BASE_URL=http://<staging-host>:2000 \
  -e CUSTOMER_EMAIL=loadtest_customer@barfly.test \
  -e CUSTOMER_PASSWORD=TestPass123! \
  -e TEST_ENTITY_ID=<entity-id> \
  --out json=results/soak-$(date +%Y%m%d-%H%M).json \
  soak.js
```

### Checkpoints During the Soak

Check every 30 minutes:

| Time | Check | Acceptable |
|------|-------|------------|
| T+30m | Node heap usage | ≤ 20% growth vs idle |
| T+1h | MongoDB connections | Same as T+0 |
| T+1h | Redis memory | ≤ 10% growth vs idle |
| T+1h30m | p95 response time | Not growing vs T+0 |
| T+2h | Error rate | Still < 1% |

### Pass Criteria

- p95 response time at T+2h ≤ p95 at T+0 (no gradual degradation)
- Node heap usage stable (no continuous growth = no memory leak)
- Zero unhandled process crashes in `pm2 logs`

---

## Phase 6 — Results & Reporting

### Per-Run Report

After each phase, fill in this template and save alongside the JSON result:

```
Test Type:          [smoke | load | stress | spike | soak]
Date/Time (start):  
Date/Time (end):    
Environment:        http://<staging-host>:2000
App Version:        (git commit hash from `git rev-parse HEAD`)
Node.js Version:    
MongoDB Atlas Tier: 

--- k6 Summary ---
Total requests:     
Requests/sec:       
p50:                
p95:                
p99:                
Error rate:         
Error types:        

--- Server at Peak ---
Node.js heap used:  
Node.js heap total: 
CPU %:              
MongoDB connections (active/available): 
Redis memory:       
Redis connected clients: 

--- Thresholds ---
[ ] p95 < target      PASS / FAIL
[ ] Error rate < 1%   PASS / FAIL
[ ] Throughput ≥ target PASS / FAIL
[ ] System recovered   PASS / FAIL (stress/spike only)

--- Issues Found ---
1. 
2. 

--- Verdict ---
PASS / FAIL / CONDITIONAL PASS (describe conditions)
```

### Final Delivery

At the end of all phases, deliver to the backend team:

1. All JSON result files from `load-tests/results/`
2. Filled-in report for each phase
3. Screenshots of monitoring dashboards at peak
4. Summary table:

| Phase | VUs | p95 | Error Rate | Verdict |
|-------|-----|-----|------------|---------|
| Smoke | 2 | | | |
| Load | 50 | | | |
| Stress | 300 (max) | | | |
| Spike | 500 (peak) | | | |
| Soak | 30 (2h) | | | |

---

## Phase 7 — Cleanup

After all tests are complete:

- [ ] Remove or anonymize load test accounts from the staging database
- [ ] Flush any load-test Redis keys (`redis-cli FLUSHDB` — **staging only**)
- [ ] Remove any test orders created during the run
- [ ] Notify the backend team that testing is complete
- [ ] Archive results to the shared folder / ticket

---

## Decision Matrix

Use this to quickly decide if the system is ready for production traffic:

| All phases PASS | → Ship with confidence |
|-----------------|------------------------|
| Load PASS, Stress FAIL at > 200 VUs | → Acceptable if peak prod traffic < 150 VUs — document the limit |
| Soak shows memory growth > 50% | → **Block ship** — memory leak must be fixed |
| Spike recovery fails | → **Block ship** — system cannot self-heal under surge |
| Error rate > 1% at baseline load | → **Block ship** — fix before retesting |

---

## Quick Reference

```bash
# Smoke
k6 run -e BASE_URL=http://<host>:2000 load-tests/smoke.js

# Load
k6 run -e BASE_URL=http://<host>:2000 -e TEST_ENTITY_ID=<id> load-tests/load.js

# Stress
k6 run -e BASE_URL=http://<host>:2000 load-tests/stress.js

# Soak
k6 run -e BASE_URL=http://<host>:2000 -e TEST_ENTITY_ID=<id> load-tests/soak.js

# Watch app
pm2 monit
pm2 logs barfly --err

# MongoDB connections
mongo --eval "db.serverStatus().connections"

# Redis
redis-cli info stats
```

---

*For technical questions about the API, contact the backend team.*  
*For questions about this workflow, contact the QA lead.*
