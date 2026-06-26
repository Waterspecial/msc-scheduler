import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Login() {
  const [mode, setMode]         = useState('login');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg]           = useState({ text: '', type: '' });
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  function switchMode(next) {
    setMode(next);
    setMsg({ text: '', type: '' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ text: '', type: '' });
    setLoading(true);
    try {
      if (mode === 'register') {
        await api.register(name, email, password);
        switchMode('login');
        setMsg({ text: 'Agency registered — please sign in.', type: 'success' });
      } else {
        const data = await api.login(email, password);
        localStorage.setItem('token', data.token);
        localStorage.setItem('agencyName', data.agencyName);
        navigate('/workers');
      }
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">Shift<span>Scheduler</span></div>

        <h1>{mode === 'login' ? 'Welcome back' : 'Create an account'}</h1>
        <p>
          {mode === 'login'
            ? 'Sign in to your agency account'
            : 'Register a new agency to get started'}
        </p>

        {msg.text && (
          <div className={`alert alert-${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label>Agency name</label>
              <input
                placeholder="e.g. CleanPro Ltd"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
          )}
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Register'}
          </button>
        </form>

        <div className="login-toggle">
          {mode === 'login' ? (
            <>Don't have an account?{' '}
              <button onClick={() => switchMode('register')}>Create one</button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button onClick={() => switchMode('login')}>Sign in</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
