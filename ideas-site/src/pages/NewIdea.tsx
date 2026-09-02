import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, createIdea } from '../api';
import {
  mapAuthError,
  needsEmailVerification,
  resendVerificationEmail,
  type BoardUser
} from '../auth';
import SignInPanel from '../components/SignInPanel';

const TITLE_MIN = 5;
const TITLE_MAX = 80;
const BODY_MIN = 10;
const BODY_MAX = 1000;

interface Props {
  user: BoardUser | null;
  onSubmitted: () => void;
}

const NewIdea: React.FC<Props> = ({ user, onSubmitted }) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const titleOk = title.trim().length >= TITLE_MIN && title.trim().length <= TITLE_MAX;
  const bodyOk = body.trim().length >= BODY_MIN && body.trim().length <= BODY_MAX;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!titleOk || !bodyOk || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createIdea(title.trim(), body.trim());
      setDone(true);
      onSubmitted();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not submit your idea. Try again in a moment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <main className="container narrow">
        <div className="detail-card center">
          <h1 className="detail-title">Thanks — it&apos;s in.</h1>
          <p className="muted">It&apos;ll appear on the board once someone has read it.</p>
          <Link className="pill-button" to="/">
            Back to the board
          </Link>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="container narrow">
        <Link className="back-link" to="/">
          ← All ideas
        </Link>
        <SignInPanel heading="Sign in to share an idea" />
      </main>
    );
  }

  // The API refuses unverified addresses, so stop here rather than letting the
  // form take a long description and then throw it away on submit.
  if (needsEmailVerification(user)) {
    return (
      <main className="container narrow">
        <Link className="back-link" to="/">
          ← All ideas
        </Link>
        <div className="detail-card center">
          <h1 className="detail-title">Confirm your email first</h1>
          <p className="muted">
            Check {user.email} for a confirmation link, then reload this page.
          </p>
          <button
            type="button"
            className="pill-button"
            disabled={resending}
            onClick={() => {
              setResending(true);
              setError(null);
              resendVerificationEmail()
                .then(() => setError('Sent. Check your inbox.'))
                .catch((err) => setError(mapAuthError(err)))
                .finally(() => setResending(false));
            }}
          >
            {resending ? 'Sending…' : 'Send it again'}
          </button>
          {error ? <p className="notice">{error}</p> : null}
        </div>
      </main>
    );
  }

  return (
    <main className="container narrow">
      <Link className="back-link" to="/">
        ← All ideas
      </Link>

      <form className="detail-card" onSubmit={handleSubmit}>
        <h1 className="detail-title">Share an idea</h1>
        <p className="muted">
          Anything you wish the extension did. It doesn&apos;t have to be technical — describe it
          the way you&apos;d explain it to a friend.
        </p>

        <label className="field">
          <span className="field-label">
            What should it do?
            <span className="field-count">
              {title.trim().length}/{TITLE_MAX}
            </span>
          </span>
          <input
            type="text"
            value={title}
            maxLength={TITLE_MAX}
            placeholder="Show my homework due dates in the popup"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">
            Why would it help?
            <span className="field-count">
              {body.trim().length}/{BODY_MAX}
            </span>
          </span>
          <textarea
            rows={7}
            value={body}
            maxLength={BODY_MAX}
            placeholder="Right now I have to open the portal to check what's due. If it showed up next to my schedule I'd actually see it in the morning."
            onChange={(event) => setBody(event.target.value)}
          />
        </label>

        {error ? <p className="notice error">{error}</p> : null}

        <button type="submit" className="pill-button" disabled={!titleOk || !bodyOk || submitting}>
          {submitting ? 'Sending…' : 'Share it'}
        </button>
        <p className="muted small">
          Ideas are read before they go on the board, so yours won&apos;t appear straight away.
        </p>
      </form>
    </main>
  );
};

export default NewIdea;
