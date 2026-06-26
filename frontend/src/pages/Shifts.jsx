import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../api';

const STATUSES = ['draft', 'published', 'filled', 'cancelled'];

const emptyShift = {
  title: '', shift_date: '', start_time: '', end_time: '',
  required_role: '', slots_needed: 1, break_minutes: 0, status: 'draft'
};

function getWeekStart(d) {
  const date = new Date(d);
  const day  = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export default function Shifts() {
  const [shifts, setShifts]   = useState([]);
  const [form, setForm]       = useState(emptyShift);
  const [showForm, setShowForm] = useState(false);
  const [view, setView]       = useState('grid');
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [error, setError]     = useState('');

  async function load() {
    try { setShifts(await api.getShifts()); }
    catch (e) { setError(e.message); }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    try { await api.createShift(form); setForm(emptyShift); setShowForm(false); load(); }
    catch (e) { setError(e.message); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this shift?')) return;
    try { await api.deleteShift(id); load(); }
    catch (e) { setError(e.message); }
  }

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const today    = new Date();
  const weekEnd  = addDays(weekStart, 6);

  const shiftsByDay = useMemo(() => {
    const map = {};
    for (let i = 0; i < 7; i++) map[i] = [];
    shifts.forEach(sh => {
      const d = new Date(sh.shift_date + 'T00:00:00');
      const idx = days.findIndex(day => isSameDay(day, d));
      if (idx !== -1) map[idx].push(sh);
    });
    return map;
  }, [shifts, days]);

  const subtitle = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Shifts</h1>
          <p>{subtitle}</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-outline btn-sm" onClick={() => setShowForm(v => !v)}>
            + Create Shift
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="view-toggle">
            {['Grid', 'List'].map(v => (
              <button key={v} className={view === v.toLowerCase() ? 'active' : ''}
                onClick={() => setView(v.toLowerCase())}>{v}</button>
            ))}
          </div>
          {view === 'grid' && (
            <div className="week-nav">
              <button className="week-nav-btn" onClick={() => setWeekStart(d => addDays(d, -7))}>‹</button>
              <span className="week-label">{subtitle}</span>
              <button className="week-nav-btn" onClick={() => setWeekStart(d => addDays(d, 7))}>›</button>
              <button className="btn btn-outline btn-sm" onClick={() => setWeekStart(getWeekStart(new Date()))}>Today</button>
            </div>
          )}
        </div>
        <div className="legend">
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--faint)' }}>Status:</span>
          {[['draft','#94a3b8'],['published','var(--info)'],['filled','var(--primary)'],['cancelled','#cbd5e1']].map(([s, c]) => (
            <div key={s} className="legend-item" style={{ color: c }}>
              <span className="legend-dot" style={{ background: c }} />
              {s}
            </div>
          ))}
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ margin: '12px 28px 0' }}>{error}</div>}

      {showForm && (
        <div style={{ padding: '16px 28px 0' }}>
          <div className="form-card">
            <h4>New Shift</h4>
            <form onSubmit={handleAdd} className="form-row">
              <div className="form-group">
                <label>Title</label>
                <input placeholder="e.g. Morning shift" value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.shift_date}
                  onChange={e => setForm({ ...form, shift_date: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Start</label>
                <input type="time" value={form.start_time}
                  onChange={e => setForm({ ...form, start_time: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>End</label>
                <input type="time" value={form.end_time}
                  onChange={e => setForm({ ...form, end_time: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Role</label>
                <input placeholder="cleaner" value={form.required_role}
                  onChange={e => setForm({ ...form, required_role: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Slots</label>
                <input type="number" min="1" value={form.slots_needed} style={{ width: 70 }}
                  onChange={e => setForm({ ...form, slots_needed: parseInt(e.target.value) })} />
              </div>
              <div className="form-group">
                <label>Break (min)</label>
                <input type="number" min="0" value={form.break_minutes} style={{ width: 80 }}
                  onChange={e => setForm({ ...form, break_minutes: parseInt(e.target.value) })} />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
              <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grid view */}
      {view === 'grid' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="cal-header">
            {days.map((d, i) => (
              <div key={i} className={`cal-day-header${isSameDay(d, today) ? ' today' : ''}`}>
                <div className="cal-day-dow">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                <div className="cal-day-num">{d.getDate()}</div>
              </div>
            ))}
          </div>
          <div className="cal-body">
            {days.map((d, i) => (
              <div key={i} className={`cal-col${isSameDay(d, today) ? ' today' : ''}`}>
                {(shiftsByDay[i] || []).length === 0 ? (
                  <div className="cal-empty" onClick={() => { setForm({ ...emptyShift, shift_date: d.toISOString().slice(0,10) }); setShowForm(true); }}>
                    + Add
                  </div>
                ) : (
                  (shiftsByDay[i] || []).map(sh => (
                    <div key={sh.id} className={`shift-card ${sh.status}`}>
                      <div className="shift-card-title">{sh.title}</div>
                      <div className="shift-card-time">
                        {String(sh.start_time).slice(0,5)}–{String(sh.end_time).slice(0,5)}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto' }}>
                        <span className="shift-card-slots">0/{sh.slots_needed} filled</span>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8 }}>
                          {sh.required_role}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="page-body">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Title</th><th>Date</th><th>Time</th><th>Role</th><th>Slots</th><th>Break</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {shifts.length === 0 && (
                  <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--faint)', padding: 32 }}>No shifts yet</td></tr>
                )}
                {shifts.map(sh => (
                  <tr key={sh.id}>
                    <td><strong>{sh.title}</strong></td>
                    <td style={{ fontFamily: 'monospace' }}>{sh.shift_date}</td>
                    <td style={{ fontFamily: 'monospace' }}>{String(sh.start_time).slice(0,5)}–{String(sh.end_time).slice(0,5)}</td>
                    <td><span className="pill pill-primary">{sh.required_role}</span></td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{sh.slots_needed}</td>
                    <td style={{ textAlign: 'center' }}>{sh.break_minutes}m</td>
                    <td>
                      <span className={`pill ${
                        sh.status === 'published' ? 'pill-info' :
                        sh.status === 'filled'    ? 'pill-primary' :
                        sh.status === 'cancelled' ? 'pill-error' : 'pill-neutral'
                      }`}>{sh.status}</span>
                    </td>
                    <td>
                      <button className="btn btn-error btn-xs" onClick={() => handleDelete(sh.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
