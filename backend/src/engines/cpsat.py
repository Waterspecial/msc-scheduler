"""
CP-SAT shift scheduling engine.

Reads JSON from stdin, writes JSON to stdout.
Uses Google OR-Tools CP-SAT solver to find the fairest valid schedule.

How it differs from greedy:
- Greedy picks one worker at a time and never goes back.
- CP-SAT builds a mathematical model of the entire problem,
  then searches for the assignment that satisfies all constraints
  AND minimises the gap between the most-hours and least-hours worker.
"""

import sys
import json
import time
from datetime import datetime
from ortools.sat.python import cp_model

# ---------------------------------------------------------------------------
# Time helpers  (same as greedy.py — keeps the comparison controlled)
# ---------------------------------------------------------------------------

def parse_time(t):
    """'HH:MM' -> minutes since midnight.
    e.g. '09:00' -> 540,  '21:00' -> 1260
    """
    h, m = t.split(':')
    return int(h) * 60 + int(m)

def day_of_week(date_str):
    """'YYYY-MM-DD' -> 'Mon' | 'Tue' | ... | 'Sun'."""
    return datetime.strptime(date_str, '%Y-%m-%d').strftime('%a')

def shift_duration_minutes(shift):
    """Returns how long a shift is in minutes."""
    return parse_time(shift['end']) - parse_time(shift['start'])

def shift_duration_hours(shift):
    return shift_duration_minutes(shift) / 60.0

# ---------------------------------------------------------------------------
# Eligibility check
# This is used BEFORE building the model to pre-filter impossible assignments.
# If a worker can never legally do a shift, there's no point creating a
# decision variable for that (worker, shift) pair at all.
# ---------------------------------------------------------------------------

def is_eligible(worker, shift, min_rest):
    """Returns True if assigning this worker to this shift is potentially legal."""

    # HC3 — role must match
    if worker['role'] != shift['required_role']:
        return False

    # HC1 — worker must have an availability window that fully contains the shift
    day    = day_of_week(shift['date'])
    s_from = parse_time(shift['start'])
    s_to   = parse_time(shift['end'])
    available = any(
        w['day'] == day and parse_time(w['from']) <= s_from and parse_time(w['to']) >= s_to
        for w in worker.get('availability', [])
    )
    if not available:
        return False

    return True

# ---------------------------------------------------------------------------
# Gini coefficient  (same formula as greedy.py)
# Measures fairness: 0 = perfectly equal hours, 1 = completely unequal
# ---------------------------------------------------------------------------

def gini(values):
    vals = sorted(v for v in values if v > 0)
    n = len(vals)
    if n == 0:
        return 0.0
    total = sum(vals)
    if total == 0:
        return 0.0
    numerator = sum((2 * (i + 1) - n - 1) * v for i, v in enumerate(vals))
    return numerator / (n * total)

# ---------------------------------------------------------------------------
# Main algorithm
# ---------------------------------------------------------------------------

def run(data, time_limit_seconds=30):
    t0 = time.time()

    workers    = data['workers']
    shifts     = sorted(data['shifts'], key=lambda s: (s['date'], s['start']))
    min_rest   = data.get('min_rest_minutes', 0)

    # ── STEP 1: Create the CP-SAT model ────────────────────────────────────
    # The model is a container that holds all our variables and constraints.
    # We'll fill it up in the steps below, then hand it to the solver.
    model  = cp_model.CpModel()
    solver = cp_model.CpSolver()

    # Set the time limit — the solver will stop after this many seconds
    # even if it hasn't found the optimal solution yet.
    solver.parameters.max_time_in_seconds = time_limit_seconds

    # Fix the random seed so results are reproducible (NFR4 in the spec).
    solver.parameters.random_seed = 42

    # ── STEP 2: Create decision variables ──────────────────────────────────
    # For every (worker, shift) pair that is potentially legal, create a
    # binary variable x[w_id][s_id].
    #
    #   x[w_id][s_id] = 1  means "worker w is assigned to shift s"
    #   x[w_id][s_id] = 0  means "worker w is NOT assigned to shift s"
    #
    # The solver will decide which variables to set to 1 or 0.

    x = {}  # x[worker_id][shift_id] -> BoolVar

    for w in workers:
        for s in shifts:
            if is_eligible(w, s, min_rest):
                x.setdefault(w['id'], {})[s['id']] = model.new_bool_var(
                    f"x_w{w['id']}_s{s['id']}"
                )

    # ── STEP 3: Add hard constraints ───────────────────────────────────────

    # HC2 — No double booking
    # If a worker has two shifts on the same day that overlap in time,
    # they cannot be assigned to both.
    # We express this as: x[w][s1] + x[w][s2] <= 1
    for w in workers:
        if w['id'] not in x:
            continue
        worker_vars = x[w['id']]
        shift_list  = [s for s in shifts if s['id'] in worker_vars]

        for i, s1 in enumerate(shift_list):
            for s2 in shift_list[i + 1:]:
                if s1['date'] != s2['date']:
                    continue  # different days, no overlap possible
                # Check if the two shifts actually overlap
                overlaps = not (
                    parse_time(s1['end'])   <= parse_time(s2['start']) or
                    parse_time(s2['end'])   <= parse_time(s1['start'])
                )
                if overlaps:
                    model.add(worker_vars[s1['id']] + worker_vars[s2['id']] <= 1)

    # HC4 — Max weekly hours
    # The total hours a worker is assigned across all shifts must not exceed
    # their max_hours. We multiply by 60 to work in integer minutes
    # (CP-SAT works with integers only).
    for w in workers:
        if w['id'] not in x:
            continue
        worker_vars   = x[w['id']]
        max_minutes   = int(w['max_hours'] * 60)

        # Sum up: duration_of_shift * x[w][s]  for all shifts this worker could do
        total_minutes = sum(
            shift_duration_minutes(s) * worker_vars[s['id']]
            for s in shifts if s['id'] in worker_vars
        )
        model.add(total_minutes <= max_minutes)

    # HC5 — Minimum rest between consecutive shifts (optional)
    # If min_rest > 0, enforce a gap between back-to-back shifts.
    if min_rest > 0:
        for w in workers:
            if w['id'] not in x:
                continue
            worker_vars = x[w['id']]
            shift_list  = [s for s in shifts if s['id'] in worker_vars]

            for i, s1 in enumerate(shift_list):
                for s2 in shift_list[i + 1:]:
                    if s1['date'] != s2['date']:
                        continue
                    gap_after  = parse_time(s2['start']) - parse_time(s1['end'])
                    gap_before = parse_time(s1['start']) - parse_time(s2['end'])
                    if 0 < gap_after < min_rest or 0 < gap_before < min_rest:
                        model.add(worker_vars[s1['id']] + worker_vars[s2['id']] <= 1)

    # Slots constraint
    # Each shift needs exactly slots_needed workers assigned to it.
    # sum of x[w][s] for all workers == slots_needed for shift s
    # We use <= here (not ==) so infeasible scenarios don't crash the solver —
    # instead they leave some slots unfilled which we detect afterwards.
    for s in shifts:
        slots_needed = s.get('slots_needed', 1)
        assigned_vars = [
            x[w['id']][s['id']]
            for w in workers
            if w['id'] in x and s['id'] in x.get(w['id'], {})
        ]
        if assigned_vars:
            model.add(sum(assigned_vars) <= slots_needed)

    # ── STEP 4: Objective — completeness first, then fairness ─────────────
    # The objective has two parts combined into one expression:
    #
    #   Part A — Maximise filled slots (weighted heavily)
    #     Every filled slot contributes +10000 to the score.
    #     We negate it because CP-SAT minimises.
    #
    #   Part B — Minimise hours spread (fairness)
    #     We minimise (max_hours - min_hours) across all workers.
    #     This can be at most ~2400 minutes, so Part A always dominates.
    #     This means: filling one more slot is ALWAYS better than
    #     any improvement in fairness.
    #
    # Combined: minimise(-10000 * filled_slots + hours_spread)

    # Part A: count total filled slots across all shifts
    all_assignment_vars = [
        x[w['id']][s['id']]
        for w in workers
        for s in shifts
        if w['id'] in x and s['id'] in x.get(w['id'], {})
    ]
    total_filled = sum(all_assignment_vars) if all_assignment_vars else 0

    # Part B: compute total minutes per worker
    worker_total_minutes = {}
    for w in workers:
        if w['id'] not in x:
            worker_total_minutes[w['id']] = 0
            continue
        worker_vars = x[w['id']]
        worker_total_minutes[w['id']] = sum(
            shift_duration_minutes(s) * worker_vars[s['id']]
            for s in shifts if s['id'] in worker_vars
        )

    all_durations = [shift_duration_minutes(s) * s.get('slots_needed', 1) for s in shifts]
    upper_bound   = sum(all_durations) if all_durations else 9999

    max_minutes_var = model.new_int_var(0, upper_bound, 'max_minutes')
    min_minutes_var = model.new_int_var(0, upper_bound, 'min_minutes')

    totals = list(worker_total_minutes.values())
    if totals:
        model.add_max_equality(max_minutes_var, totals)
        model.add_min_equality(min_minutes_var, totals)

    # Combined objective: fill slots first, then be fair
    FILL_WEIGHT = 10000
    model.minimize(-FILL_WEIGHT * total_filled + (max_minutes_var - min_minutes_var))

    # ── STEP 5: Solve ──────────────────────────────────────────────────────
    status = solver.solve(model)

    # ── STEP 6: Extract results ────────────────────────────────────────────
    assignments = []
    filled_slots_count = 0

    # Status codes we care about:
    # OPTIMAL  — solver found the mathematically best solution
    # FEASIBLE — solver found a valid solution but time ran out before proving optimality
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for w in workers:
            if w['id'] not in x:
                continue
            for s in shifts:
                if s['id'] not in x.get(w['id'], {}):
                    continue
                if solver.value(x[w['id']][s['id']]) == 1:
                    assignments.append({'shift_id': s['id'], 'worker_id': w['id']})

    # Work out which shifts are underfilled
    filled_per_shift = {}
    for a in assignments:
        filled_per_shift[a['shift_id']] = filled_per_shift.get(a['shift_id'], 0) + 1
        filled_slots_count += 1

    unfilled = []
    total_slots = 0
    for s in shifts:
        needed = s.get('slots_needed', 1)
        total_slots += needed
        filled = filled_per_shift.get(s['id'], 0)
        if filled < needed:
            unfilled.append({
                'shift_id':    s['id'],
                'slots_needed': needed,
                'slots_filled': filled
            })

    # Compute Gini on actual hours assigned
    hours_assigned = {w['id']: 0.0 for w in workers}
    for a in assignments:
        shift = next(s for s in shifts if s['id'] == a['shift_id'])
        hours_assigned[a['worker_id']] += shift_duration_hours(shift)

    computation_ms   = round((time.time() - t0) * 1000, 2)
    completeness     = round(filled_slots_count / total_slots * 100, 1) if total_slots else 0.0
    gini_coefficient = round(gini(list(hours_assigned.values())), 4)

    solver_status_name = {
        cp_model.OPTIMAL:   'OPTIMAL',
        cp_model.FEASIBLE:  'FEASIBLE',
        cp_model.INFEASIBLE:'INFEASIBLE',
        cp_model.UNKNOWN:   'UNKNOWN',
    }.get(status, 'UNKNOWN')

    return {
        'assignments': assignments,
        'unfilled':    unfilled,
        'metrics': {
            'constraint_satisfaction': 100.0 if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else 0.0,
            'gini':            gini_coefficient,
            'completeness':    completeness,
            'computation_ms':  computation_ms,
            'solver_status':   solver_status_name,
        }
    }

if __name__ == '__main__':
    payload = json.loads(sys.stdin.read())
    print(json.dumps(run(payload)))
