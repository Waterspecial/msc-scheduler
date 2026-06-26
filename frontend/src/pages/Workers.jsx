import React, { useEffect, useState } from 'react';
import { api } from '../api';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const emptyWorker = { name: '', email: '', phone: '', role: '', max_weekly_hours: 40 };
const emptyAvail  = { day_of_week: 'Mon', from_time: '09:00', to_time: '17:00' };

export default function Workers() {
  const [workers, setWorkers]     = useState([]);
  const [form, setForm]           = useState(emptyWorker);
  const [availForm, setAvailForm] = useState({ workerId: null, ...emptyAvail });
  const [error, setError]         = useState('');
  const [showForm, setShowForm]   = useState(false);

  async function load() {
    try { setWorkers(await api.getWorkers()); }
    catch (e) { setError(e.message); }
  }

  useEffect(() => { load(); }, []);

  async function handleAddWorker(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createWorker(form);
      setForm(emptyWorker);
      setShowForm(false);
      load();
    } catch (e) { setError(e.message); }
  }

  async function handleToggleActive(w) {
    try { await api.updateWorker(w.id, { is_active: !w.is_active }); load(); }
    catch (e) { setError(e.message); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this worker?')) return;
    try { await api.deleteWorker(id); load(); }
    catch (e) { setError(e.message); }
  }

  async function handleAddAvail(e) {
    e.preventDefault();
    setError('');
    try {
      await api.addAvailability(availForm.workerId, {
        day_of_week: availForm.day_of_week,
        from_time:   availForm.from_time,
        to_time:     availForm.to_time,
      });
      setAvailForm({ workerId: null, ...emptyAvail });
      load();
    } catch (e) { setError(e.message); }
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Workers</h1>
          <p>{workers.length} worker{workers.length !== 1 ? 's' : ''} registered</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>
            + Add Worker
          </button>
        </div>
      </div>

      <div className="page-body">
        {error && <div className="alert alert-error">{error}</div>}

        {showForm && (
          <div className="form-card">
            <h4>New Worker</h4>
            <form onSubmit={handleAddWorker} className="form-row">
              <div className="form-group">
                <label>Name</label>
                <input placeholder="Alice Smith" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" placeholder="alice@example.com" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input placeholder="+44 7700 000000" value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Role</label>
                <input placeholder="e.g. cleaner" value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Max hrs / week</label>
                <input type="number" min="1" value={form.max_weekly_hours} style={{ width: 100 }}
                  onChange={e => setForm({ ...form, max_weekly_hours: e.target.value })} />
              </div>
              <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
              <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Contact</th><th>Role</th>
                <th>Max hrs</th><th>Status</th><th>Availability</th><th></th>
              </tr>
            </thead>
            <tbody>
              {workers.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--faint)', padding: 32 }}>
                  No workers yet — click "Add Worker" to get started
                </td></tr>
              )}
              {workers.map(w => (
                <tr key={w.id} style={{ opacity: w.is_active ? 1 : 0.55 }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{w.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--faint)' }}>ID #{w.id}</div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {w.email && <div>{w.email}</div>}
                    {w.phone && <div>{w.phone}</div>}
                    {!w.email && !w.phone && <span style={{ color: 'var(--faint)' }}>—</span>}
                  </td>
                  <td><span className="pill pill-primary">{w.role}</span></td>
                  <td style={{ fontFamily: 'monospace' }}>{w.max_weekly_hours}h</td>
                  <td>
                    <span className={`pill ${w.is_active ? 'pill-success' : 'pill-warning'}`}>
                      {w.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {(w.availability || []).map(a => (
                        <div key={a.id} style={{ fontSize: 11 }}>
                          <span className="pill pill-neutral" style={{ marginRight: 4 }}>{a.day_of_week}</span>
                          <span style={{ color: 'var(--muted)', fontFamily: 'monospace' }}>
                            {String(a.from_time).slice(0,5)}–{String(a.to_time).slice(0,5)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button className="btn btn-ghost btn-xs" style={{ marginTop: 4 }}
                      onClick={() => setAvailForm({ ...emptyAvail, workerId: w.id })}>
                      + Add slot
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-outline btn-xs" onClick={() => handleToggleActive(w)}>
                        {w.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="btn btn-error btn-xs" onClick={() => handleDelete(w.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {availForm.workerId && (
          <div className="form-card" style={{ marginTop: 20 }}>
            <h4>Add availability — Worker #{availForm.workerId}</h4>
            <form onSubmit={handleAddAvail} className="form-row">
              <div className="form-group">
                <label>Day</label>
                <select value={availForm.day_of_week}
                  onChange={e => setAvailForm({ ...availForm, day_of_week: e.target.value })}>
                  {DAYS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>From</label>
                <input type="time" value={availForm.from_time}
                  onChange={e => setAvailForm({ ...availForm, from_time: e.target.value })} />
              </div>
              <div className="form-group">
                <label>To</label>
                <input type="time" value={availForm.to_time}
                  onChange={e => setAvailForm({ ...availForm, to_time: e.target.value })} />
              </div>
              <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
              <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline"
                  onClick={() => setAvailForm({ workerId: null, ...emptyAvail })}>Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
