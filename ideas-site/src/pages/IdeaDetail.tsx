import React from 'react';
import { Link, useParams } from 'react-router-dom';
import IdeaBody from '../components/IdeaBody';
import StatusPill from '../components/StatusPill';
import VoteButton from '../components/VoteButton';
import type { IdeasContext } from '../App';

const IdeaDetail: React.FC<IdeasContext> = ({ ideas, loading, error, onVote }) => {
  const { number } = useParams();
  const issueNumber = Number(number);
  const idea = ideas?.find((item) => item.number === issueNumber);

  if (loading && !ideas) {
    return (
      <main className="container">
        <p className="notice">Loading…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container">
        <p className="notice error">{error}</p>
      </main>
    );
  }

  if (!idea) {
    return (
      <main className="container">
        <p className="notice">
          That idea isn&apos;t on the board. <Link to="/">See all ideas</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="container">
      <Link className="back-link" to="/">
        ← All ideas
      </Link>

      <article className="detail-card">
        <div className="detail-head">
          <VoteButton
            votes={idea.votes}
            hasVoted={idea.hasVoted}
            large
            label={idea.title}
            onVote={() => onVote(idea)}
          />
          <div>
            <h1 className="detail-title">{idea.title}</h1>
            <div className="idea-card-meta">
              <StatusPill status={idea.status} />
              {idea.author ? <span>Suggested by {idea.author}</span> : null}
            </div>
          </div>
        </div>

        <IdeaBody body={idea.body} />

        <p className="detail-footer">
          <a href={idea.url} target="_blank" rel="noreferrer noopener">
            Follow the work on GitHub
          </a>
        </p>
      </article>
    </main>
  );
};

export default IdeaDetail;
