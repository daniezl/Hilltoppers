import React from 'react';

interface Props {
  votes: number;
  hasVoted: boolean;
  large?: boolean;
  label: string;
  onVote: () => void;
}

const VoteButton: React.FC<Props> = ({ votes, hasVoted, large, label, onVote }) => (
  <button
    type="button"
    className={`vote-button ${hasVoted ? 'voted' : ''} ${large ? 'large' : ''}`}
    aria-pressed={hasVoted}
    aria-label={`${hasVoted ? 'Remove vote from' : 'Vote for'} ${label}`}
    onClick={(event) => {
      event.preventDefault();
      event.stopPropagation();
      onVote();
    }}
  >
    <svg className="vote-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 5l7 8H5l7-8Z"
        fill={hasVoted ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
    <span className="vote-count">{votes}</span>
  </button>
);

export default VoteButton;
