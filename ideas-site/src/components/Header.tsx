import React from 'react';
import { Link } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { signOut } from '../auth';

interface Props {
  user: User | null;
  ready: boolean;
}

const Header: React.FC<Props> = ({ user, ready }) => (
  <header className="site-header">
    <Link className="site-brand" to="/">
      <svg className="site-brand-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M9 18h6M10 21h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>Hilltoppers Ideas</span>
    </Link>

    {ready ? (
      user ? (
        <div className="site-account">
          <span className="site-account-name">{user.displayName ?? user.email}</span>
          <button type="button" className="link-button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      ) : (
        <Link className="pill-button ghost" to="/sign-in">
          Sign in
        </Link>
      )
    ) : null}
  </header>
);

export default Header;
