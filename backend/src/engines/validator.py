"""
Independent hard-constraint validator.

The greedy and CP-SAT engines guarantee valid schedules by construction. The LLM
does NOT — it may propose assignments that break the rules. This module checks a
proposed set of assignments against every hard constraint (HC1-HC5), keeps the
ones that are legal, and records every violation so we can measure how well the
AI obeyed the rules.

Contract: same worker/shift shapes as the other engines.
"""

from datetime import datetime


def _parse_time(t):
    h, m = t.split(':')
    return int(h) * 60 + int(m)


def _day_of_week(date_str):
    return datetime.strptime(date_str, '%Y-%m-%d').strftime('%a')


def _duration_hours(shift):
    return (_parse_time(shift['end']) - _parse_time(shift['start'])) / 60.0


def _available(worker, shift):
    """HC1 — an availability window fully contains the shift."""
    day = _day_of_week(shift['date'])
    s_start, s_end = _parse_time(shift['start']), _parse_time(shift['end'])
    return any(
        w['day'] == day and _parse_time(w['from']) <= s_start and _parse_time(w['to']) >= s_end
        for w in worker.get('availability', [])
    )


def _overlaps(shift, other):
    if shift['date'] != other['date']:
        return False
    s_start, s_end = _parse_time(shift['start']), _parse_time(shift['end'])
    return not (s_end <= _parse_time(other['start']) or s_start >= _parse_time(other['end']))


def _rest_violation(shift, other, min_rest_minutes):
    if min_rest_minutes <= 0 or shift['date'] != other['date']:
        return False
    s_start, s_end = _parse_time(shift['start']), _parse_time(shift['end'])
    gap_before = s_start - _parse_time(other['end'])
    gap_after  = _parse_time(other['start']) - s_end
    return (0 < gap_before < min_rest_minutes) or (0 < gap_after < min_rest_minutes)


def validate(workers, shifts, proposed, min_rest_minutes=0):
    """
    Check proposed assignments against HC1-HC5.

    Returns { valid, violations, satisfaction } where:
      valid       — the assignments that are legal (kept for the schedule)
      violations  — list of { shift_id, worker_id, rule, detail } for rejected ones
      satisfaction— % of proposed assignments that were legal
    """
    workers_map = {w['id']: w for w in workers}
    shifts_map  = {s['id']: s for s in shifts}

    # Deterministic processing order: by shift date/start, then worker id.
    def _order(a):
        s = shifts_map.get(a['shift_id'])
        return (s['date'], s['start'], a['worker_id']) if s else ('', '', a['worker_id'])
    ordered = sorted(proposed, key=_order)

    valid       = []
    violations  = []
    worker_hours  = {}                       # worker_id -> hours accepted so far
    worker_shifts = {}                       # worker_id -> [accepted shift objects]
    seen          = set()                    # (shift_id, worker_id) already accepted

    def reject(a, rule, detail):
        violations.append({'shift_id': a.get('shift_id'), 'worker_id': a.get('worker_id'),
                           'rule': rule, 'detail': detail})

    for a in ordered:
        wid, sid = a.get('worker_id'), a.get('shift_id')
        worker, shift = workers_map.get(wid), shifts_map.get(sid)

        if worker is None or shift is None:
            reject(a, 'INVALID_ID', f'worker {wid} or shift {sid} does not exist')
            continue
        if (sid, wid) in seen:
            reject(a, 'DUPLICATE', 'same worker assigned to this shift twice')
            continue
        if worker['role'] != shift['required_role']:
            reject(a, 'HC3', f"role {worker['role']} != required {shift['required_role']}")
            continue
        if not _available(worker, shift):
            reject(a, 'HC1', 'shift falls outside the worker\'s availability')
            continue

        others = worker_shifts.get(wid, [])
        if any(_overlaps(shift, o) for o in others):
            reject(a, 'HC2', 'overlaps another shift the worker already holds')
            continue
        if any(_rest_violation(shift, o, min_rest_minutes) for o in others):
            reject(a, 'HC5', f'less than {min_rest_minutes} min rest from an adjacent shift')
            continue
        if worker_hours.get(wid, 0.0) + _duration_hours(shift) > worker['max_hours']:
            reject(a, 'HC4', f"would exceed max weekly hours ({worker['max_hours']})")
            continue

        # Legal — accept it.
        valid.append({'shift_id': sid, 'worker_id': wid})
        seen.add((sid, wid))
        worker_hours[wid]  = worker_hours.get(wid, 0.0) + _duration_hours(shift)
        worker_shifts.setdefault(wid, []).append(shift)

    total = len(proposed)
    satisfaction = round(len(valid) / total * 100, 1) if total else 100.0

    return {'valid': valid, 'violations': violations, 'satisfaction': satisfaction}
