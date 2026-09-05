import React, { useEffect, useRef, useState } from 'react';
import {
  ASK_QUESTION_MAX,
  askQuestion,
  clearLastAnswer,
  formatSourceDate,
  loadLastAnswer,
  splitCitations,
  type AskResult,
  type AskSource
} from '../services/askService';

const PLACEHOLDER = 'Ask about SJA — dress code, events, hours…';

function sourceLabel(source: AskSource): string {
  const date = formatSourceDate(source.date);
  if (source.kind === 'bulletin') {
    return date ? `Daily Bulletin · ${date}` : 'Daily Bulletin';
  }
  if (source.kind === 'newsletter') {
    return date ? `SJA News · ${date}` : 'SJA News';
  }
  // Document titles in corpus_sources.json carry notes in parentheses for the
  // model's benefit ("(2026–2027, as linked from mySJA)"); a chip has no room.
  return source.title.replace(/\s*\(.*$/, '').trim() || source.title;
}

const AskBox: React.FC = () => {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadLastAnswer().then((cached) => {
      if (!cancelled && cached) {
        setResult(cached);
        setQuestion(cached.question);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const canSend = question.trim().length > 0 && !loading;

  const submit = async () => {
    if (!canSend) {
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const next = await askQuestion(question);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setResult(next);
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const reset = () => {
    requestIdRef.current += 1;
    setQuestion('');
    setResult(null);
    setError(null);
    setLoading(false);
    void clearLastAnswer();
    inputRef.current?.focus();
  };

  const sourcesByNumber = new Map<number, AskSource>();
  for (const source of result?.sources ?? []) {
    sourcesByNumber.set(source.n, source);
  }

  return (
    <section className="ask" aria-label="Ask about SJA">
      <form
        className={`ask-bar${loading ? ' loading' : ''}`}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <input
          ref={inputRef}
          className="ask-input"
          type="text"
          value={question}
          maxLength={ASK_QUESTION_MAX}
          placeholder={PLACEHOLDER}
          aria-label="Ask a question about SJA"
          autoComplete="off"
          spellCheck={false}
          disabled={loading}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button
          type="submit"
          className="ask-send"
          aria-label={loading ? 'Thinking…' : 'Send'}
          disabled={!canSend}
        >
          {loading ? (
            <svg className="ask-spinner" viewBox="0 0 24 24" aria-hidden="true">
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeDasharray="14 42.5"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 19V5M5.5 11.5 12 5l6.5 6.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </form>

      {error ? (
        <p className="dining-error ask-error">
          <span>{error}</span>
        </p>
      ) : null}

      {result && !loading ? (
        <div className="ask-answer">
          <p className="ask-answer-text">
            {splitCitations(result.answer).map((segment, index) => {
              if (segment.type === 'text') {
                return <React.Fragment key={index}>{segment.text}</React.Fragment>;
              }
              const source = sourcesByNumber.get(segment.n);
              if (!source) {
                return null;
              }
              return (
                <a
                  key={index}
                  className="ask-cite"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={sourceLabel(source)}
                >
                  {segment.n}
                </a>
              );
            })}
          </p>
          {result.sources.length > 0 ? (
            <ul className="ask-sources" aria-label="Sources">
              {result.sources.map((source) => (
                <li key={source.n}>
                  <a
                    className="ask-source"
                    href={source.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <span className="ask-source-n">{source.n}</span>
                    <span className="ask-source-label">{sourceLabel(source)}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="ask-answer-footer">
            <span className="ask-answer-note">From school documents · can be wrong</span>
            <button type="button" className="ask-clear" onClick={reset}>
              Ask another
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default AskBox;
