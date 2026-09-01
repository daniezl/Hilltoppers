import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, createIdea } from '../api';
import { signIn } from '../auth';

const TITLE_MIN = 5;
const TITLE_MAX = 80;
const BODY_MIN = 10;
const BODY_MAX = 1000;

interface Props {
  signedIn: boolean;
  onSubmitted: () => void;
}

const NewIdea: React.FC<Props> = ({ signedIn, onSubmitted }) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
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
          <p className="muted">
            Someone will read it before it goes on the board, so it won&apos;t show up right away.
            If it fits, you&apos;ll see it there soon.
          </p>
          <Link className="pill-button" to="/">
            Back to the board
          </Link>
        </div>
      </main>
    );
  }

  if (!signedIn) {
    return (
      <main className="container narrow">
        <div className="detail-card center">
          <h1 className="detail-title">Sign in to share an idea</h1>
          <p className="muted">
            We only use this to make sure each person votes once. Nothing gets posted under your
            name — just your first name and last initial.
          </p>
          <button
            type="button"
            className="pill-button"
            onClick={() => {
              signIn().catch((err) =>
                setError(err instanceof Error ? err.message : 'Could not sign in.')
              );
            }}
          >
            Sign in with Google
          </button>
          {error ? <p className="notice error">{error}</p> : null}
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
