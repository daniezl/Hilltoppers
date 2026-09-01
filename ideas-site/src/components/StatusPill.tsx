import React from 'react';
import type { IdeaStatus } from '../api';

const LABELS: Record<IdeaStatus, string> = {
  open: 'Open for votes',
  'in-progress': 'Being built',
  shipped: 'Done',
  declined: 'Not right now'
};

const StatusPill: React.FC<{ status: IdeaStatus }> = ({ status }) => (
  <span className={`status-pill ${status}`}>{LABELS[status]}</span>
);

export default StatusPill;
