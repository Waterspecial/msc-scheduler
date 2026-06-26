import React, { useState } from 'react';
import { api } from '../api';

export default function Schedule() {
  const [algorithm, setAlgorithm] = useState('greedy');
  const [result, setResult]       = useState(null);
  const [metrics, setMetrics]     = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  async function handleGenerate() {
    setLoading(true);
    setError('');
    setResult(null);
    setMetrics(null);
    try {
      const data = await api.generateSchedule(algorithm);
      setResult(data);
      const m = await api.getMetrics(data.schedule_id);
      setMetrics(m);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Schedule</h1>
          <p>Generate and compare algorithm outputs</p>
        </div>
        <div className="page-header-actions">
          <select
            value={algorithm}
            onChange={e => setAlgorithm(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--base-300)', fontSize: 13, fontWeight: 600 }}
          >
            <option value="greedy">Greedy</option>
            <option value="cpsat">CP-SAT</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={handleGenerate} disabled={loading}>
            {loading ? 'Generating…' : 'Generate Schedule'}
          </button>
        </div>
      </div>

      <div className="page-body">
        {error && <div className="alert alert-error">{error}</div>}

        {metrics && (
          <>
            <div className="stat-grid">
              <div className="stat-card primary">
                <div className="label">Completeness</div>
                <div className="value">{metrics.completeness}%</div>
                <div className="sub">{metrics.filled_slots} of {metrics.total_slots} slots filled</div>
              </div>
              <div className="stat-card success">
                <div className="label">Gini fairness coefficient</div>
                <div className="value">{metrics.gini_fairness}</div>
                <div className="sub">0 = perfectly fair distribution</div>
              </div>
              <div className={`stat-card ${metrics.completeness === 100 ? 'success' : 'warning'}`}>
                <div className="label">Algorithm</div>
                <div className="value" style={{ fontSize: 22, paddingTop: 4 }}>{metrics.algorithm.toUpperCase()}</div>
                <div className="sub">Schedule #{metrics.schedule_id}</div>
              </div>
            </div>

            {result?.metrics && (
              <div className="metrics-engine-info">
                Engine · Computation: {result.metrics.computation_ms}ms &nbsp;|&nbsp;
                Constraint satisfaction: {result.metrics.constraint_satisfaction}% &nbsp;|&nbsp;
                Gini: {result.metrics.gini} &nbsp;|&nbsp;
                Completeness: {result.metrics.completeness}%
              </div>
            )}
          </>
        )}

        {result && (
          <>
            {result.unfilled?.length > 0 && (
              <div className="alert alert-error">
                Unfilled shift slots: {result.unfilled.join(', ')}
              </div>
            )}

            <div className="assignments-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Shift ID</th>
                    <th>Worker ID</th>
                  </tr>
                </thead>
                <tbody>
                  {result.assignments.length === 0 && (
                    <tr><td colSpan="2" style={{ textAlign: 'center', color: 'var(--faint)', padding: 32 }}>
                      No assignments generated
                    </td></tr>
                  )}
                  {result.assignments.map((a, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'monospace' }}>#{a.shift_id}</td>
                      <td style={{ fontFamily: 'monospace' }}>#{a.worker_id}</td>
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
