import React, { useState } from 'react';
import { api } from '../api';

// Turn a 0..1 fairness score into a plain word + colour class.
function verdict(score) {
  if (score >= 0.8)  return { word: 'fair',   cls: 'success' };
  if (score >= 0.5)  return { word: 'uneven', cls: 'warning' };
  return { word: 'poor', cls: 'error' };
}

export default function Schedule() {
  const [algorithm, setAlgorithm] = useState('greedy');
  const [result, setResult]       = useState(null);
  const [details, setDetails]     = useState(null);
  const [nameMap, setNameMap]     = useState({});
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  async function handleGenerate() {
    setLoading(true);
    setError('');
    setResult(null);
    setDetails(null);
    try {
      const data = await api.generateSchedule(algorithm);
      setResult(data);
      const [full, workers] = await Promise.all([
        api.getSchedule(data.schedule_id),
        api.getWorkers(),   // names for the per-worker table (incl. left-out workers)
      ]);
      setDetails(full.assignments);
      setNameMap(Object.fromEntries(workers.map(w => [w.id, w.name])));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const m    = result?.metrics;
  const fair = m?.fairness;
  const hardOk = m?.constraint_satisfaction === 100;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Schedule</h1>
          <p>Generate a schedule and see how fair it is</p>
        </div>
        <div className="page-header-actions">
          <select
            value={algorithm}
            onChange={e => setAlgorithm(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--base-300)', fontSize: 13, fontWeight: 600 }}
          >
            <option value="greedy">Greedy</option>
            <option value="cpsat">CP-SAT</option>
            <option value="llm">LLM (GPT-4o)</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={handleGenerate} disabled={loading}>
            {loading ? 'Generating…' : 'Generate Schedule'}
          </button>
        </div>
      </div>

      <div className="page-body">
        {error && <div className="alert alert-error">{error}</div>}

        {result && fair && (
          <>
            {/* ── Plain-English summary ─────────────────────────────── */}
            <div className="stat-grid">
              <div className={`stat-card ${verdict(fair.fairness_score).cls}`}>
                <div className="label">Fairness Score</div>
                <div className="value">{fair.fairness_score.toFixed(2)}</div>
                <div className="sub">out of 1.00 — higher is fairer</div>
              </div>
              <div className="stat-card primary">
                <div className="label">Slots filled</div>
                <div className="value">{m.completeness}%</div>
                <div className="sub">shift slots covered</div>
              </div>
              <div className={`stat-card ${hardOk ? 'success' : 'error'}`}>
                <div className="label">Hard rules</div>
                <div className="value" style={{ fontSize: 22, paddingTop: 4 }}>
                  {hardOk ? '✅ All met' : '❌ Broken'}
                </div>
                <div className="sub">HC1–HC5 (availability, rest, etc.)</div>
              </div>
              <div className="stat-card">
                <div className="label">Engine</div>
                <div className="value" style={{ fontSize: 22, paddingTop: 4 }}>{result.algorithm.toUpperCase()}</div>
                <div className="sub">{m.computation_ms} ms · schedule #{result.schedule_id}</div>
              </div>
            </div>

            {/* ── Why that score: the 3 measured things ─────────────── */}
            <h3 style={{ margin: '24px 0 8px' }}>Why this score — the three things we measure</h3>
            <div className="assignments-wrap">
              <table>
                <thead>
                  <tr><th>Fairness measure</th><th>What it checks</th><th>Score</th><th>Verdict</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Even hours</strong> (SC1)</td>
                    <td>Are total hours spread evenly across workers?</td>
                    <td>{fair.sc1_hours.score.toFixed(2)}</td>
                    <td><span className={`alert alert-${verdict(fair.sc1_hours.score).cls}`} style={{ padding: '2px 8px' }}>{verdict(fair.sc1_hours.score).word}</span></td>
                  </tr>
                  <tr>
                    <td><strong>Shared bad shifts</strong> (SC2)</td>
                    <td>Are weekend/night shifts shared, not dumped on one person?</td>
                    <td>{fair.sc2_unsociable.score.toFixed(2)}</td>
                    <td><span className={`alert alert-${verdict(fair.sc2_unsociable.score).cls}`} style={{ padding: '2px 8px' }}>{verdict(fair.sc2_unsociable.score).word}</span></td>
                  </tr>
                  <tr>
                    <td><strong>Nobody left out</strong> (SC3)</td>
                    <td>Did everyone who can work get some hours? ({fair.sc3_left_out.served}/{fair.sc3_left_out.pool} got work)</td>
                    <td>{fair.sc3_left_out.score.toFixed(2)}</td>
                    <td><span className={`alert alert-${verdict(fair.sc3_left_out.score).cls}`} style={{ padding: '2px 8px' }}>{verdict(fair.sc3_left_out.score).word}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── Per-worker breakdown: makes fairness visible ──────── */}
            <h3 style={{ margin: '24px 0 8px' }}>Per-worker breakdown</h3>
            <div className="assignments-wrap">
              <table>
                <thead>
                  <tr><th>Worker</th><th>Role</th><th>Hours</th><th>Weekend shifts</th><th>Night shifts</th></tr>
                </thead>
                <tbody>
                  {[...fair.per_worker].sort((a, b) => b.hours - a.hours).map(w => (
                    <tr key={w.worker_id} style={w.hours === 0 ? { background: 'var(--warning-bg, #fff7ed)' } : undefined}>
                      <td>{nameMap[w.worker_id] || `Worker #${w.worker_id}`}</td>
                      <td>{w.role}</td>
                      <td>{w.hours}{w.hours === 0 && <span style={{ color: 'var(--faint)' }}> ⚠️ left out</span>}</td>
                      <td>{w.weekend_shifts}</td>
                      <td>{w.night_shifts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Unfilled + the actual assignments ─────────────────── */}
            {result.unfilled?.length > 0 && (
              <div className="alert alert-error" style={{ marginTop: 24 }}>
                Unfilled shift slots: {result.unfilled
                  .map(u => `#${u.shift_id} (${u.slots_filled}/${u.slots_needed} filled)`)
                  .join(', ')}
              </div>
            )}

            <h3 style={{ margin: '24px 0 8px' }}>Assignments</h3>
            <div className="assignments-wrap">
              <table>
                <thead>
                  <tr><th>Shift</th><th>Date</th><th>Time</th><th>Role</th><th>Worker</th></tr>
                </thead>
                <tbody>
                  {(!details || details.length === 0) && (
                    <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--faint)', padding: 32 }}>
                      No assignments generated
                    </td></tr>
                  )}
                  {details && details.map(a => (
                    <tr key={a.id}>
                      <td>{a.title || `Shift #${a.shift_id}`}</td>
                      <td>{a.shift_date}</td>
                      <td>{a.start_time}–{a.end_time}</td>
                      <td>{a.required_role}</td>
                      <td>{a.worker_name} <span style={{ color: 'var(--faint)' }}>({a.worker_role})</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!result && !loading && !error && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: 300, color: 'var(--faint)', gap: 8
          }}>
            <div style={{ fontSize: 40 }}>📅</div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--muted)' }}>No schedule generated yet</div>
            <div style={{ fontSize: 13 }}>Select an algorithm and click Generate Schedule</div>
          </div>
        )}
      </div>
    </>
  );
}
