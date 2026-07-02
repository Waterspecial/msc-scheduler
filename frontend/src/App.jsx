import React from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import Login    from './pages/Login';
import Workers  from './pages/Workers';
import Shifts   from './pages/Shifts';
import Schedule from './pages/Schedule';

const NAV = [
  { to: '/workers',  label: 'Workers'  },
  { to: '/shifts',   label: 'Shifts'   },
  { to: '/schedule', label: 'Schedule' },
];

function Sidebar() {
  const navigate  = useNavigate();
  const agencyName = localStorage.getItem('agencyName') || 'Agency';

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('agencyName');
    navigate('/login');
  }

  const initials = agencyName.slice(0, 2).toUpperCase();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">Shift<span>Scheduler</span></div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <span className="sidebar-dot" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-avatar">{initials}</div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{agencyName}</div>
          <div className="sidebar-user-role">Admin</div>
        </div>
        <button className="btn-signout" onClick={logout} title="Sign out">⎋</button>
      </div>
    </aside>
  );
}

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token || token === 'null' || token === 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('agencyName');
    return <Navigate to="/login" replace />;
  }
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login"    element={<Login />} />
      <Route path="/workers"  element={<PrivateRoute><Workers /></PrivateRoute>} />
      <Route path="/shifts"   element={<PrivateRoute><Shifts /></PrivateRoute>} />
      <Route path="/schedule" element={<PrivateRoute><Schedule /></PrivateRoute>} />
      <Route path="*"         element={<Navigate to="/login" />} />
    </Routes>
  );
}
