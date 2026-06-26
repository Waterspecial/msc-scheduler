# Chapter 3 — Methodology Notes
# MSc Dissertation: Comparing Greedy and CP-SAT Shift Scheduling Algorithms

---

## 3.1 System Overview

This research implements a web-based shift scheduling system as a research instrument to compare two scheduling algorithms: a greedy heuristic and a CP-SAT constraint solver. The system follows a three-tier architecture comprising a React frontend, a Node.js/Express backend API, and Python-based scheduling engines. The frontend serves as the data entry and results display layer; the backend handles persistence and engine orchestration; the engines perform the actual scheduling computation.

The web application is not the research contribution — it is the controlled environment in which both algorithms receive identical inputs and produce comparable outputs. All evaluation is performed programmatically through the benchmark harness.

---

## 3.2 System Architecture

### 3.2.1 Multi-Tier Architecture

| Tier | Technology | Responsibility |
|---|---|---|
| Presentation | React 18 + Vite | Data entry, schedule display, metrics visualisation |
| Application | Node.js 22 + Express.js | REST API, authentication, engine orchestration |
| Data | PostgreSQL 16 | Persistent storage of workers, shifts, schedules |
| Engine | Python 3 | Scheduling algorithm execution |

### 3.2.2 Multi-Tenancy Design

The system implements schema-per-tenant multi-tenancy using PostgreSQL schemas. A single `public.agencies` table stores registered agencies. On registration, a private schema is provisioned for each agency (e.g., `agency_cleanpro.workers`), ensuring complete data isolation between tenants. All authenticated queries are scoped to the agency's schema, resolved from the JWT payload at the middleware layer.

### 3.2.3 Engine Invocation

The Express backend invokes Python scheduling engines as child processes using Node.js's `child_process.spawn`. Input data (workers and shifts) is serialised as JSON and written to the engine's stdin. The engine writes its result JSON to stdout, which the backend reads, parses, and persists. This design keeps the engines completely decoupled from the backend and independently testable via the command line.

```
Express API
    │
    ├── stdin  →  JSON payload (workers, shifts)
    │
    [python3 greedy.py | cpsat.py]
    │
    └── stdout ←  JSON result (assignments, unfilled, metrics)
```

---

## 3.3 Technologies and Platforms

### 3.3.1 Programming Languages

| Language | Version | Role |
|---|---|---|
| JavaScript (Node.js) | v22.14.0 | Backend API server |
| Python | 3.x | Scheduling engines, evaluation harness |
| SQL (PostgreSQL dialect) | — | Database schema and queries |
| JSX / React | 18.3.1 | Frontend user interface |

### 3.3.2 Backend Libraries and Frameworks

| Package | Version | Purpose |
|---|---|---|
| Express.js | 4.19.2 | HTTP server, routing, middleware |
| node-postgres (`pg`) | 8.11.5 | PostgreSQL client and connection pooling |
| bcryptjs | 2.4.3 | Password hashing (bcrypt, cost factor 10) |
| jsonwebtoken | 9.0.2 | JWT generation and verification (HS256) |
| dotenv | 16.4.5 | Environment variable management |

### 3.3.3 Frontend Libraries and Frameworks

| Package | Version | Purpose |
|---|---|---|
| React | 18.3.1 | Component-based UI framework |
| Vite | 5.2.11 | Development server and production bundler |
| React Router | 6.23.1 | Client-side routing and navigation |

### 3.3.4 Python Libraries

| Package | Purpose |
|---|---|
| `ortools` (Google OR-Tools) | CP-SAT constraint programming solver |
| `pandas` | Results aggregation and CSV generation |
| `scipy` | Wilcoxon signed-rank statistical test |
| `matplotlib` | Chart generation for evaluation |

---

## 3.4 Database Design

### 3.4.1 Database Management System

PostgreSQL 16 was selected for its mature support for schema-based namespacing, which underpins the multi-tenancy architecture. The database is hosted in a Docker container managed by OrbStack on macOS.

### 3.4.2 Schema Structure

The database uses two tiers of schema:

- **Public schema** — stores the `agencies` table shared across all tenants
- **Per-agency schemas** — each registered agency receives a private schema containing five tables

**Public schema:**
```
public.agencies (id, name, email, password_hash, schema_name, created_at)
```

**Per-agency schema (e.g., agency_cleanpro):**
```
workers      (id, name, email, phone, role, max_weekly_hours, is_active)
availability (id, worker_id, day_of_week, from_time, to_time)
shifts       (id, title, shift_date, start_time, end_time, required_role,
              slots_needed, break_minutes, status)
schedules    (id, created_at, algorithm_used)
assignments  (id, schedule_id, shift_id, worker_id, status)
```

### 3.4.3 Key Design Decisions

- `slots_needed` on shifts allows a single shift to require multiple workers (e.g., 3 cleaners for the 05:00–13:00 shift), making the scheduling problem more realistic and closer to real-world operational needs.
- The UNIQUE constraint on `assignments` is `(schedule_id, shift_id, worker_id)` — allowing multiple workers per shift slot but preventing duplicate assignments of the same worker to the same shift.
- Schedule completeness is measured as filled slots / total slots (not filled shifts / total shifts), reflecting the multi-worker nature of shifts.

---

## 3.5 Authentication and Security

- **JWT (JSON Web Tokens)** — stateless authentication. On login, the server signs a token containing `agencyId` and `schemaName` using HMAC-SHA256 (HS256). Tokens expire after 8 hours.
- **Password hashing** — bcrypt with a cost factor of 10 via `bcryptjs`.
- **Tenant isolation** — the JWT middleware extracts `schemaName` from the verified token and attaches it to `req.agency`. All database queries use this schema name to scope access. A tenant cannot access another tenant's data.
- **No real personal data** — all worker data used in experiments is synthetic, in compliance with GDPR data minimisation principles.

---

## 3.6 API Design

The backend exposes a RESTful JSON API. All routes except registration and login require a valid JWT in the `Authorization: Bearer <token>` header.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/agencies/register` | Register a new agency (name, email, password) |
| POST | `/auth/login` | Authenticate and receive JWT |
| GET | `/workers` | List all workers with availability |
| POST | `/workers` | Create a worker |
| PUT | `/workers/:id` | Update a worker |
| DELETE | `/workers/:id` | Delete a worker |
| POST | `/workers/:id/availability` | Add availability window |
| GET | `/shifts` | List all shifts |
| POST | `/shifts` | Create a shift |
| PUT | `/shifts/:id` | Update a shift |
| DELETE | `/shifts/:id` | Delete a shift |
| POST | `/schedule/generate` | Generate a schedule using a named algorithm |
| GET | `/schedule/:id` | Retrieve a schedule with assignments |
| GET | `/schedule/:id/metrics` | Retrieve evaluation metrics for a schedule |

---

## 3.7 Algorithm Design and Implementation

### 3.7.1 Hard Constraints

Both algorithms must satisfy the following hard constraints on every assignment:

| ID | Constraint | Description |
|---|---|---|
| HC1 | Availability | A worker may only be assigned a shift that falls entirely within one of their availability windows |
| HC2 | No double booking | A worker may not hold two shifts with overlapping time windows on the same date |
| HC3 | Role matching | A worker's role must match the shift's required role |
| HC4 | Max weekly hours | A worker's total assigned hours must not exceed their stated maximum |
| HC5 | Minimum rest (optional) | A configurable minimum gap must exist between a worker's consecutive shifts |

### 3.7.2 Soft Constraint

| ID | Constraint | Description |
|---|---|---|
| SC1 | Fair hour distribution | Hours should be distributed as evenly as possible across workers. Measured by the Gini coefficient. This is the CP-SAT optimisation objective. |

### 3.7.3 Greedy Algorithm

The greedy engine (`engines/greedy.py`) implements a single-pass, deterministic algorithm:

1. Sort all shifts by date, then by start time
2. For each shift:
   a. Identify all eligible workers (satisfying HC1–HC5)
   b. Sort eligible workers ascending by hours assigned so far
   c. Assign the least-loaded worker to a slot
   d. Repeat until `slots_needed` slots are filled or eligible workers are exhausted
3. Record any shift where fewer than `slots_needed` workers were assigned as unfilled
4. Never backtrack

**Time complexity:** O(S × W) where S = number of shifts, W = number of workers

**Properties:** Deterministic (fixed output for identical input), fast, no global optimality guarantee, may produce suboptimal fairness distribution.

### 3.7.4 CP-SAT Algorithm

The CP-SAT engine (`engines/cpsat.py`) uses Google OR-Tools' CP-SAT solver:

**Decision variables:**
```
x[w][s] ∈ {0, 1}   — 1 if worker w is assigned to shift s, 0 otherwise
```

**Constraints (model):**
- HC1–HC5 encoded as Boolean constraints over the decision variables
- Each shift must have at most `slots_needed` workers: `sum(x[w][s] for w) <= slots_needed`

**Objective:**
```
Minimise: max_hours_assigned - min_hours_assigned
```
This directly minimises the spread of hours across workers, driving the schedule toward fairness.

**Solver configuration:**
- Time limit: 30 seconds (configurable)
- Random seed: fixed for reproducibility
- Returns solver status: OPTIMAL, FEASIBLE, or INFEASIBLE

### 3.7.5 Engine JSON Contract

Both engines share an identical stdin/stdout contract, ensuring a controlled comparison:

**Input (stdin):**
```json
{
  "workers": [
    {
      "id": 1,
      "role": "cleaner",
      "max_hours": 20,
      "availability": [{ "day": "Mon", "from": "09:00", "to": "17:00" }]
    }
  ],
  "shifts": [
    {
      "id": 1,
      "date": "2026-06-23",
      "start": "09:00",
      "end": "13:00",
      "required_role": "cleaner",
      "slots_needed": 2,
      "break_minutes": 30
    }
  ],
  "min_rest_minutes": 0
}
```

**Output (stdout):**
```json
{
  "assignments": [{ "shift_id": 1, "worker_id": 1 }],
  "unfilled": [{ "shift_id": 2, "slots_needed": 3, "slots_filled": 1 }],
  "metrics": {
    "constraint_satisfaction": 100.0,
    "gini": 0.08,
    "completeness": 95.0,
    "computation_ms": 12.5
  }
}
```

---

## 3.8 Evaluation Metrics

| Metric | Definition | Formula | Unit |
|---|---|---|---|
| Constraint satisfaction rate | Proportion of hard constraints satisfied | Assignments satisfying all HC / Total assignments × 100 | % |
| Gini fairness coefficient | Evenness of hour distribution across workers | Gini formula on sorted hours vector | 0–1 (0 = perfect equality) |
| Schedule completeness | Proportion of required slots successfully filled | Filled slots / Total slots × 100 | % |
| Computation time | Wall-clock time from engine invocation to result | `time.time()` delta | ms |

---

## 3.9 Benchmark Scenarios

Eight synthetic scenarios are used to evaluate both algorithms across a range of problem sizes and constraint densities:

| Scenario | Workers | Shifts | Total Slots | Constraint Density |
|---|---|---|---|---|
| S1 | 10 | 20 | ~20 | Low |
| S2 | 10 | 20 | ~20 | High |
| S3 | 15 | 40 | ~50 | Low |
| S4 | 15 | 40 | ~50 | High |
| S5 | 20 | 60 | ~80 | Low |
| S6 | 20 | 60 | ~80 | High |
| S7 | 30 | 80 | ~120 | Mixed |
| S8 | 30 | 80 | ~120 | High |

**Constraint density is controlled by:**

| Parameter | Low density | High density |
|---|---|---|
| Availability windows | 5–7 days/week, 8–12h windows | 2–3 days/week, 3–5h windows |
| Max weekly hours | 35–40h | 10–16h |
| Number of roles | 2 roles, balanced | 3–4 roles, unbalanced |
| Slots per shift | 1–2 | 2–4 |

---

## 3.10 Statistical Evaluation

The Wilcoxon signed-rank test (non-parametric, paired) is used to compare Gini coefficients produced by both algorithms across all 8 scenarios. This test is appropriate because:

- The sample size is small (n = 8 scenarios)
- Normality of the distribution cannot be assumed
- The scenarios are paired (both algorithms run on identical inputs)

**Null hypothesis (H₀):** There is no significant difference in fairness (Gini coefficient) between the greedy and CP-SAT algorithms.

**Significance level:** α = 0.05

---

## 3.11 Development Infrastructure

| Tool | Purpose |
|---|---|
| Git + GitHub | Version control |
| Docker + OrbStack | Local PostgreSQL 16 container |
| Vite dev server proxy | Forwards `/api` requests to Express during development (avoids CORS) |
| nodemon | Auto-restart backend on file changes during development |

---

## 3.12 Project Structure

```
shift-scheduler/
├── backend/
│   ├── src/
│   │   ├── routes/          ← agencies, auth, workers, shifts, schedule
│   │   ├── controllers/     ← business logic separated from routing
│   │   ├── engines/
│   │   │   ├── greedy.py    ← greedy scheduling engine
│   │   │   ├── cpsat.py     ← CP-SAT scheduling engine
│   │   │   └── runner.js    ← spawns Python engine, exchanges JSON
│   │   ├── db/
│   │   │   ├── pool.js      ← PostgreSQL connection pool
│   │   │   └── provision.js ← creates per-agency schema on registration
│   │   ├── middleware/
│   │   │   └── auth.js      ← JWT verification + tenant resolution
│   │   └── app.js
│   └── package.json
├── frontend/
│   └── src/
│       ├── pages/           ← Login, Workers, Shifts, Schedule
│       ├── api.js           ← centralised API calls
│       └── App.jsx          ← routing + sidebar layout
├── benchmark/
│   └── scenario_01.json … scenario_08.json
├── evaluation/
│   ├── run_experiments.py   ← runs both engines on all scenarios
│   ├── results.csv          ← output
│   └── analyse.py           ← statistics + charts
└── dissertation/
    └── chapter3-methodology-notes.md
```
