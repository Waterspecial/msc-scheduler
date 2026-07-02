"""
LLM (AI-assisted) shift scheduling engine.

Same JSON-on-stdin / JSON-on-stdout contract as greedy.py and cpsat.py, so the
three engines are directly comparable.

Pipeline:
  1. Describe the scheduling problem + hard rules to GPT-4o.
  2. Ask it to propose assignments as strict JSON.
  3. Pass its proposal through validator.py — the AI may break hard rules, so we
     KEEP only the legal assignments and RECORD every violation as a metric.
  4. Score the resulting schedule through the same fairness evaluator.

Requires: `pip install openai` and an OPENAI_API_KEY in the environment.
Reproducibility (NFR4): temperature=0 and a fixed seed — note an LLM is still not
guaranteed bit-identical across calls, unlike the deterministic engines.
"""

import sys
import json
import time
from datetime import datetime

import validator
import fairness

MODEL = 'gpt-4o'
SEED  = 42


def day_of_week(date_str):
    return datetime.strptime(date_str, '%Y-%m-%d').strftime('%a')


def build_messages(data):
    """Construct the chat prompt describing the problem and the rules."""
    workers = data['workers']
    # Annotate each shift with its weekday so the model can reason about availability.
    shifts = [{**s, 'day': day_of_week(s['date'])} for s in data['shifts']]
    min_rest = data.get('min_rest_minutes', 0)

    system = (
        "You are an expert workforce shift scheduler. You assign workers to shifts "
        "while never breaking the hard rules, and you make the schedule as fair as possible."
    )

    user = f"""Assign workers to shifts. Respond ONLY with JSON of the form:
{{"assignments": [{{"shift_id": <int>, "worker_id": <int>}}]}}

HARD RULES — never break these:
- HC1 Availability: a worker may only take a shift that falls fully inside one of
  their availability windows (match the shift's `day`).
- HC2 No double-booking: a worker cannot hold two overlapping shifts.
- HC3 Role: the worker's role must equal the shift's required_role.
- HC4 Max hours: a worker's total assigned hours must not exceed their max_hours.
- HC5 Min rest: at least {min_rest} minutes between a worker's consecutive shifts.

FAIRNESS — optimise toward these (in priority order):
1. Spread total hours evenly across workers.
2. Share weekend/night shifts, don't dump them on one person.
3. Give everyone who can work at least some hours; leave nobody out.

Fill each shift up to its `slots_needed` (assign that many DIFFERENT workers).

WORKERS:
{json.dumps(workers, indent=2)}

SHIFTS:
{json.dumps(shifts, indent=2)}
"""
    return [
        {'role': 'system', 'content': system},
        {'role': 'user',   'content': user},
    ]


def run(data):
    t0 = time.time()

    # Imported here so the module can be loaded (for testing helpers) without the
    # openai package or an API key present.
    from openai import OpenAI
    client = OpenAI()

    response = client.chat.completions.create(
        model=MODEL,
        temperature=0,
        seed=SEED,
        response_format={'type': 'json_object'},
        messages=build_messages(data),
    )
    proposed = json.loads(response.choices[0].message.content).get('assignments', [])

    workers  = data['workers']
    shifts   = data['shifts']
    min_rest = data.get('min_rest_minutes', 0)

    # Keep only legal assignments; record every rule the AI broke.
    checked     = validator.validate(workers, shifts, proposed, min_rest)
    assignments = checked['valid']

    # Completeness + unfilled (slot-based, same as the other engines).
    filled_per_shift = {}
    for a in assignments:
        filled_per_shift[a['shift_id']] = filled_per_shift.get(a['shift_id'], 0) + 1

    unfilled, total_slots, filled_slots = [], 0, 0
    for s in shifts:
        needed = s.get('slots_needed', 1)
        total_slots += needed
        got = filled_per_shift.get(s['id'], 0)
        filled_slots += got
        if got < needed:
            unfilled.append({'shift_id': s['id'], 'slots_needed': needed, 'slots_filled': got})

    completeness = round(filled_slots / total_slots * 100, 1) if total_slots else 0.0
    fair = fairness.evaluate(workers, shifts, assignments, data.get('fairness_weights'))
    computation_ms = round((time.time() - t0) * 1000, 2)

    return {
        'assignments': assignments,
        'unfilled':    unfilled,
        'metrics': {
            'constraint_satisfaction': checked['satisfaction'],
            'hard_violations':         len(checked['violations']),
            'violations':              checked['violations'],
            'gini':            fair['sc1_hours']['gini'],   # kept for backward compat
            'completeness':    completeness,
            'computation_ms':  computation_ms,
            'model':           MODEL,
            'proposed_count':  len(proposed),
            'fairness':        fair,
        }
    }


if __name__ == '__main__':
    try:
        payload = json.loads(sys.stdin.read())
        print(json.dumps(run(payload)))
    except Exception as e:
        sys.stderr.write(f'{type(e).__name__}: {e}')
        sys.exit(1)
