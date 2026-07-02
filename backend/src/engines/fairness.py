"""
Shared fairness evaluator.

Every engine (greedy, CP-SAT, LLM) feeds its assignments through THIS module so
the comparison is controlled — the schedules differ, the scoring does not.

The fairness model has three measures, each normalised to 0..1 where 1 = fairest:

  SC1  Hour equity        — are total hours spread evenly?           (1 - Gini of hours)
  SC2  Unsociable equity  — are weekend/night shifts shared?         (1 - Gini of bad-shift counts)
  SC3  No-one-left-out    — does everyone who can work get hours?    (served / eligible pool)

These combine into a single weighted Fairness Score (default 50/30/20).
"""

from datetime import datetime

# Default weights — must sum to 1.0. Overridable via input["fairness_weights"].
DEFAULT_WEIGHTS = {'sc1': 0.5, 'sc2': 0.3, 'sc3': 0.2}

# A shift counts as "unsociable" if it touches weekend or night hours.
NIGHT_START_MIN = 22 * 60   # 22:00
NIGHT_END_MIN   = 6 * 60    # 06:00
WEEKEND_DAYS    = ('Sat', 'Sun')


# ---------------------------------------------------------------------------
# Small helpers (kept self-contained so the module has no engine dependencies)
# ---------------------------------------------------------------------------

def _parse_time(t):
    h, m = t.split(':')
    return int(h) * 60 + int(m)


def _day_of_week(date_str):
    return datetime.strptime(date_str, '%Y-%m-%d').strftime('%a')


def _duration_hours(shift):
    return (_parse_time(shift['end']) - _parse_time(shift['start'])) / 60.0


def _is_weekend(shift):
    return _day_of_week(shift['date']) in WEEKEND_DAYS


def _is_night(shift):
    start = _parse_time(shift['start'])
    end   = _parse_time(shift['end'])
    return start < NIGHT_END_MIN or end > NIGHT_START_MIN


def gini(values, include_zeros=False):
    """Gini coefficient of non-negative numbers. 0 = perfectly even, ~1 = lopsided.

    include_zeros=False (hours): ignore workers with zero — "how even among those
      who actually work?"; the zero-hour case is handled separately by SC3.
    include_zeros=True (bad shifts): keep the zeros — a worker with 0 night shifts
      is part of the sharing picture, so hoarding shows up as unfair.
    """
    vals = sorted(v for v in values if (v >= 0 if include_zeros else v > 0))
    n = len(vals)
    if n == 0:
        return 0.0
    total = sum(vals)
    if total == 0:
        return 0.0
    numerator = sum((2 * (i + 1) - n - 1) * v for i, v in enumerate(vals))
    return numerator / (n * total)


# ---------------------------------------------------------------------------
# Eligible pool — workers who could in principle work this problem.
# Used by SC3 so we don't penalise a schedule for "leaving out" someone who was
# never usable (wrong role, or no availability at all).
# ---------------------------------------------------------------------------

def _eligible_pool(workers, shifts):
    required_roles = {s['required_role'] for s in shifts}
    pool = []
    for w in workers:
        if w['role'] in required_roles and w.get('availability'):
            pool.append(w['id'])
    return pool


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def evaluate(workers, shifts, assignments, weights=None):
    """
    Score a set of assignments against the fairness model.

    Returns a dict with the combined fairness_score, each sub-measure, and a
    per-worker breakdown (hours / weekend / night) for display.
    """
    weights = weights or DEFAULT_WEIGHTS
    shifts_map = {s['id']: s for s in shifts}

    # Per-worker tallies (every worker included, even those with zero hours).
    hours    = {w['id']: 0.0 for w in workers}
    weekend  = {w['id']: 0   for w in workers}
    night    = {w['id']: 0   for w in workers}

    for a in assignments:
        shift = shifts_map.get(a['shift_id'])
        if shift is None:
            continue
        wid = a['worker_id']
        if wid not in hours:                      # assignment to unknown worker
            hours[wid], weekend[wid], night[wid] = 0.0, 0, 0
        hours[wid]   += _duration_hours(shift)
        if _is_weekend(shift):
            weekend[wid] += 1
        if _is_night(shift):
            night[wid] += 1

    # SC1 — hour equity
    sc1_gini  = gini(list(hours.values()))
    sc1_score = 1.0 - sc1_gini

    # SC2 — unsociable-shift equity (weekend + night counts combined).
    # Measured across workers who actually worked, so a worker who took shifts but
    # zero bad ones still counts — otherwise hoarding all nights looks "even".
    working = [wid for wid in hours if hours[wid] > 0]
    unsociable_counts = [weekend[wid] + night[wid] for wid in working]
    if sum(unsociable_counts) == 0:
        sc2_gini, sc2_score = 0.0, 1.0           # no bad shifts to share = fair
    else:
        sc2_gini  = gini(unsociable_counts, include_zeros=True)
        sc2_score = 1.0 - sc2_gini

    # SC3 — no-one-left-out (of the workers who could actually work this problem)
    pool = _eligible_pool(workers, shifts)
    if not pool:
        served, sc3_score, worst_off = 0, 1.0, 0.0
    else:
        served    = sum(1 for wid in pool if hours[wid] > 0)
        sc3_score = served / len(pool)
        worst_off = min(hours[wid] for wid in pool)

    fairness_score = (
        weights['sc1'] * sc1_score +
        weights['sc2'] * sc2_score +
        weights['sc3'] * sc3_score
    )

    per_worker = [
        {
            'worker_id':      w['id'],
            'role':           w['role'],
            'hours':          round(hours[w['id']], 2),
            'weekend_shifts': weekend[w['id']],
            'night_shifts':   night[w['id']],
        }
        for w in workers
    ]

    return {
        'fairness_score': round(fairness_score, 4),
        'sc1_hours':      {'gini': round(sc1_gini, 4), 'score': round(sc1_score, 4)},
        'sc2_unsociable': {'gini': round(sc2_gini, 4), 'score': round(sc2_score, 4)},
        'sc3_left_out':   {'served': served, 'pool': len(pool),
                           'score': round(sc3_score, 4), 'worst_off_hours': round(worst_off, 2)},
        'per_worker':     per_worker,
        'weights':        weights,
    }
