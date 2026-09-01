import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusPill from '../components/StatusPill';
import VoteButton from '../components/VoteButton';
import type { IdeasContext } from '../App';
import type { Idea } from '../api';

type SortKey = 'top' | 'new';

function isFinished(idea: Idea): boolean {
  return idea.status === 'shipped' || idea.status === 'declined';
}

function sortIdeas(ideas: Idea[], key: SortKey): Idea[] {
  if (key === 'new') {
    return [...ideas].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
  // "Most wanted" answers what to build next, so shipped and declined ideas
  // drop below the ones people can still influence however popular they were.
  return [...ideas].sort(
    (a, b) =>
      Number(isFinished(a)) - Number(isFinished(b)) ||
      b.votes - a.votes ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
}

const IdeasList: React.FC<IdeasContext> = ({ ideas, loading, error, onVote }) => {
  const [sort, setSort] = useState<SortKey>('top');
  const sorted = useMemo(() => (ideas ? sortIdeas(ideas, sort) : []), [ideas, sort]);

  return (
    <main className="container">
      <section className="intro">
        <h1>What should we build next?</h1>
        <p>
          Everything here is an idea for the Hilltoppers extension. Vote for the ones you want, or
          share your own — you don&apos;t need to know anything about code.
        </p>
        <Link className="pill-button" to="/new">
          Share an idea
        </Link>
      </section>

      {error ? <p className="notice error">{error}</p> : null}

      {loading && !ideas ? (
        <p className="notice">Loading ideas…</p>
      ) : sorted.length === 0 && !error ? (
        <p className="notice">No ideas yet. Be the first to share one.</p>
      ) : (
        <>
          <div className="sort-tabs" role="tablist" aria-label="Sort ideas">
            <button
              type="button"
              role="tab"
              aria-selected={sort === 'top'}
              className={`sort-tab ${sort === 'top' ? 'active' : ''}`}
              onClick={() => setSort('top')}
            >
              Most wanted
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sort === 'new'}
              className={`sort-tab ${sort === 'new' ? 'active' : ''}`}
              onClick={() => setSort('new')}
            >
              Newest
            </button>
          </div>

          <ul className="idea-cards">
            {sorted.map((idea) => (
              <li key={idea.number}>
                <Link className="idea-card" to={`/idea/${idea.number}`}>
                  <VoteButton
                    votes={idea.votes}
                    hasVoted={idea.hasVoted}
                    label={idea.title}
                    onVote={() => onVote(idea)}
                  />
                  <div className="idea-card-main">
                    <h2 className="idea-card-title">{idea.title}</h2>
                    <div className="idea-card-meta">
                      <StatusPill status={idea.status} />
                      {idea.author ? <span>Suggested by {idea.author}</span> : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
};

export default IdeasList;
