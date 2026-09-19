import React, { useState } from 'react';
import {
  FEEDBACK_AUDIENCE,
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
    if (!canSend) return;
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

  return (
    <main className="feedback">
      <header className="feedback__header">
        <h1>Suggestions</h1>
      </header>

      {status === 'sent' ? (
        <section className="feedback__panel feedback__success" aria-live="polite">
          <div>
            <h2>Thanks.</h2>
            <p>{FEEDBACK_AUDIENCE === 'me' ? 'I read' : 'We read'} every suggestion.</p>
          </div>
          <button type="button" className="feedback__secondary" onClick={() => setStatus('idle')}>
            Send another
          </button>
        </section>
      ) : (
        <section className="feedback__panel">
          <form onSubmit={handleSubmit} className="feedback__form">
            <label className="feedback__field">
              <span className="feedback__label">Suggestion</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="What should we change or add?"
                rows={7}
                autoFocus
                aria-label="Your suggestion"
                disabled={status === 'sending'}
                aria-describedby={remaining < 300 ? 'feedback-remaining' : undefined}
              />
              {remaining < 300 ? (
                <span id="feedback-remaining" className={`feedback__count ${remaining < 0 ? 'over' : ''}`}>
                  {remaining} left
                </span>
              ) : null}
            </label>
            <label className="feedback__field">
              <span className="feedback__label">
                Contact <span className="feedback__optional">Optional</span>
              </span>
              <input type="text" value={contact} onChange={(event) => setContact(event.target.value)} autoComplete="off" disabled={status === 'sending'}/>
            </label>
            {error ? <p className="feedback__error" role="alert">{error}</p> : null}
            <div className="feedback__actions">
              <button type="submit" className="feedback__primary" disabled={!canSend}>
                {status === 'sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
};

export default Feedback;
