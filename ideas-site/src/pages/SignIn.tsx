import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import SignInPanel from '../components/SignInPanel';

interface Props {
  signedIn: boolean;
}

const SignIn: React.FC<Props> = ({ signedIn }) => {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  if (signedIn) {
    return <Navigate to={from ?? '/'} replace />;
  }

  return (
    <main className="container narrow">
      <Link className="back-link" to="/">
        ← All ideas
      </Link>
      <SignInPanel heading="Sign in" />
    </main>
  );
};

export default SignIn;
