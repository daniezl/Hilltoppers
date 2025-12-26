import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css';

export default function Layout() {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <div className="layout">
      <header className="layout-header">
        <div className="layout-header-content">
          <div className="layout-header-left">
            <h1>Schedule Admin</h1>
            <nav className="layout-nav">
              <Link
                to="/"
                className={location.pathname === '/' ? 'active' : ''}
              >
                Calendar
              </Link>
              <Link
                to="/dashboard"
                className={location.pathname === '/dashboard' ? 'active' : ''}
              >
                Dashboard
              </Link>
            </nav>
          </div>
          {user && (
            <div className="layout-header-right">
              <span className="layout-user-email">{user.email}</span>
              <span className={`layout-role-badge ${user.role}`}>
                {user.role}
              </span>
            </div>
          )}
        </div>
      </header>
      <main className="layout-main">
        <div className="layout-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

