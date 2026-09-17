import React from 'react';
import ReactDOM from 'react-dom/client';
import Feedback from './Feedback';
import './feedback.css';
import '../theme.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Feedback />
  </React.StrictMode>
);
