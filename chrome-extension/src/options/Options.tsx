import React, { useEffect } from 'react';

const Options: React.FC = () => {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const target =
      typeof chrome !== 'undefined' && chrome.runtime?.getURL
        ? chrome.runtime.getURL('class-settings.html')
        : 'class-settings.html';
    window.location.replace(target);
  }, []);

  const fallbackHref =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('class-settings.html')
      : 'class-settings.html';

  return (
    <main className="options">
      <h1>Redirecting…</h1>
      <p>
        The settings page now lives in the class settings interface. If you are not redirected automatically,{' '}
        <a href={fallbackHref}>open the new page manually</a>.
      </p>
    </main>
  );
};

export default Options;
