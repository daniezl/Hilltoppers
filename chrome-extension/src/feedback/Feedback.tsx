import React, { useState } from 'react';
import {
  FEEDBACK_AUDIENCE,
  FEEDBACK_HEADING,
  FEEDBACK_MAX_LENGTH,
  FeedbackError,
  submitFeedback
} from '../services/feedbackService';

type Status = 'idle' | 'sending' | 'sent';

const Feedback: React.FC = () => {
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const remaining = FEEDBACK_MAX_LENGTH - message.length;
  const canSend = status !== 'sending' && message.trim().length > 0 && remaining >= 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSend) {
      return;
    }
    setStatus('sending');
    setError(null);
    try {
      await submitFeedback({ message, contact });
      setStatus('sent');
      setMessage('');
    } catch (err) {
      setStatus('idle');
      setError(err instanceof FeedbackError ? err.message : 'Could not send. Try again.');
    }
  };

  if (status === 'sent') {
    return (
      <main className="feedback">
        <h1>Got it. Thanks.</h1>
        <p className="feedback__lead">
          {FEEDBACK_AUDIENCE === 'me' ? 'I read' : 'We read'} every one of these.
        </p>
        <button type="button" className="feedback__secondary" onClick={() => setStatus('idle')}>
          Send another
        </button>
      </main>
    );
  }

  return (
    <main className="feedback">
      <h1>{FEEDBACK_HEADING}</h1>
      <p className="feedback__lead">
        Tell {FEEDBACK_AUDIENCE} what you&rsquo;d change &mdash; a small fix, or something you wish
        it did.
      </p>

      <form onSubmit={handleSubmit} className="feedback__form">
        <label className="feedback__field">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={'The schedule was wrong on\u2026\nIt would be nice if\u2026'}
            rows={7}
            autoFocus
            aria-label={FEEDBACK_HEADING}
            disabled={status === 'sending'}
            aria-describedby={remaining < 300 ? 'feedback-remaining' : undefined}
          />
          {remaining < 300 ? (
            <span
              id="feedback-remaining"
              className={`feedback__count ${remaining < 0 ? 'over' : ''}`}
            >
              {remaining} left
            </span>
          ) : null}
        </label>

        <label className="feedback__field">
          <span className="feedback__label">
            Name or email, if you&rsquo;d like a reply <span className="feedback__optional">(optional)</span>
          </span>
          <input
            type="text"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            autoComplete="off"
            disabled={status === 'sending'}
          />
        </label>

        {error ? (
          <p className="feedback__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="feedback__actions">
          <button type="submit" className="feedback__primary" disabled={!canSend}>
            {status === 'sending' ? 'Sending\u2026' : 'Send'}
          </button>
        </div>
      </form>
    </main>
  );
};

export default Feedback;
