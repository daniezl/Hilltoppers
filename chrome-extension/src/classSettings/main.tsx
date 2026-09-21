import React from 'react';
import ReactDOM from 'react-dom/client';
import ClassSettings from './ClassSettings';
import './classSettings.css';
import '../theme.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ClassSettings />
  </React.StrictMode>
);
