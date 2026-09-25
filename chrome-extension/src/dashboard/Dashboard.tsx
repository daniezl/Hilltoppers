import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GithubLogo, DeviceMobile } from '@phosphor-icons/react';
import ToppingBar from '../toppings/ToppingBar';
import ClassSettings from '../classSettings/ClassSettings';
import Login from '../login/Login';
import Feedback from '../feedback/Feedback';
import { onAuthState, type AuthUser } from '../firebase/auth';
import '../classSettings/classSettings.css';
import '../feedback/feedback.css';
import './dashboard.css';

type Page = 'toppings.html' | 'class-settings.html' | 'feedback.html' | 'login.html' | 'source-code.html' | 'ios-app.html';
const titles: Record<Page, string> = {
  'toppings.html': 'Topping Bar', 'class-settings.html': 'Settings',
  'feedback.html': 'Suggestions', 'login.html': 'Account', 'source-code.html': 'Source code', 'ios-app.html': 'iOS App'
};
const readPage = (): Page => {
  const path = location.pathname.split('/').pop() as Page;
  return path in titles ? path : 'toppings.html';
};
function SettingsIcon() {
  return <svg
                    aria-hidden="true"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0a2.34 2.34 0 0 0 3.319 1.915a2.34 2.34 0 0 1 2.33 4.033a2.34 2.34 0 0 0 0 3.831a2.34 2.34 0 0 1-2.33 4.033a2.34 2.34 0 0 0-3.319 1.915a2.34 2.34 0 0 1-4.659 0a2.34 2.34 0 0 0-3.32-1.915a2.34 2.34 0 0 1-2.33-4.033a2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>;
}

export default function Dashboard() {
  const [page, setPage] = useState<Page>(readPage);
  const [visited, setVisited] = useState<Page[]>([readPage()]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [returnPage, setReturnPage] = useState(() => new URLSearchParams(location.search).get('returnTo') || '');
  const heading = useRef<HTMLDivElement>(null);
  const primaryNav = useRef<HTMLElement>(null);
  const [navIndicator, setNavIndicator] = useState<React.CSSProperties>({
    width: 0, height: 0, opacity: 0, transform: 'translate(0px, 0px)'
  });
  useEffect(() => onAuthState(next => { setUser(next); setReady(true); }), []);
  useEffect(() => {
    const change = () => {
      const next = readPage(); setPage(next);
      setVisited(items => items.includes(next) ? items : [...items, next]);
      setReturnPage(new URLSearchParams(location.search).get('returnTo') || '');
    };
    window.addEventListener('popstate', change);
    return () => window.removeEventListener('popstate', change);
  }, []);
  useEffect(() => {
    document.title = `${titles[page]} · Hilltoppers`;
    heading.current?.focus({ preventScroll: true });
  }, [page]);
  useLayoutEffect(() => {
    const nav = primaryNav.current;
    if (!nav) return undefined;
    const update = () => {
      const active = nav.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!active) {
        setNavIndicator(current => ({ ...current, opacity: 0 }));
        return;
      }
      const navBox = nav.getBoundingClientRect();
      const activeBox = active.getBoundingClientRect();
      setNavIndicator({
        width: activeBox.width,
        height: activeBox.height,
        opacity: 1,
        transform: `translate(${activeBox.left - navBox.left}px, ${activeBox.top - navBox.top}px)`
      });
    };
    update();
    window.addEventListener('resize', update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(nav);
    return () => { window.removeEventListener('resize', update); observer?.disconnect(); };
  }, [page]);
  function navigate(next: string) {
    if (!(next in titles)) return;
    const target = next as Page;
    if (target === page) return;
    const previous = target === 'login.html' ? page : '';
    history.pushState({}, '', target + (previous ? `?returnTo=${previous}` : ''));
    setReturnPage(previous); setPage(target);
    setVisited(items => items.includes(target) ? items : [...items, target]);
    window.scrollTo(0, 0);
  }
  const follow = (target: Page) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigate(target);
  };
  const name = user?.displayName || user?.email || 'Your account';
  return <div className="dashboard">
    <aside className="dashboard-sidebar" aria-label="Hilltoppers navigation">
      <div className="dashboard-brand"><img src="icons/icon128.png" alt="" className="dashboard-logo"/> Hilltoppers</div>
      <nav className="dashboard-primary" aria-label="Explore" ref={primaryNav}>
        <span className="dashboard-nav-indicator" style={navIndicator} aria-hidden="true"/>
        <a href="toppings.html" onClick={follow('toppings.html')} aria-current={page === 'toppings.html' ? 'page' : undefined}><svg className="dashboard-topping-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="4.5"/><path d="M12 6.75v10.5M6.75 12h10.5"/></svg>Topping Bar</a>
        <a href="class-settings.html" onClick={follow('class-settings.html')} aria-current={page === 'class-settings.html' ? 'page' : undefined}><SettingsIcon/>Settings</a>
        <a href="feedback.html" onClick={follow('feedback.html')} aria-current={page === 'feedback.html' ? 'page' : undefined}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3H3V6a2 2 0 0 1 2-2Z"/><path d="M8 9h8M8 13h5"/></svg>Suggestions</a>
        <hr className="dashboard-nav-divider"/>
        <a href="ios-app.html" onClick={follow('ios-app.html')} aria-current={page === 'ios-app.html' ? 'page' : undefined}><DeviceMobile weight="regular" aria-hidden="true"/>iOS App</a>
        <a href="source-code.html" onClick={follow('source-code.html')} aria-current={page === 'source-code.html' ? 'page' : undefined}><GithubLogo weight="regular" aria-hidden="true"/>Source code</a>
      </nav>
      <nav className="dashboard-bottom" aria-label="Account">
        <a className="dashboard-account" href="login.html" onClick={follow('login.html')} aria-current={page === 'login.html' ? 'page' : undefined}>
          <span className="dashboard-avatar" aria-hidden="true">{user ? name[0].toUpperCase() : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>}</span>
          <span className="dashboard-account-text"><strong>{!ready ? 'Loading account…' : user ? name : 'Sign in'}</strong><small>{user ? 'Manage account' : 'Sync across devices'}</small></span>
        </a>
      </nav>
    </aside>
    <div className="dashboard-content" ref={heading} tabIndex={-1}>
      {visited.includes('ios-app.html') && <div hidden={page !== 'ios-app.html'}><section className="source-code-page ios-app-page"><header><h1>iOS App</h1></header><div className="ios-app-card"><div className="ios-app-copy"><h2>Hilltoppers for iPhone</h2><p>Search for <strong>Hilltoppers</strong> in the App Store, or scan the QR code.</p><a className="ios-app-download" href="https://apps.apple.com/us/app/hilltoppers/id6749836752" target="_blank" rel="noopener noreferrer"><span className="ios-app-download-label">View on the App Store</span><span aria-hidden="true">↗</span></a></div><img className="ios-app-qr" src="images/ios-app-qr.svg" alt="QR code for Hilltoppers on the App Store" width="196" height="196"/></div><p className="source-code-intro">Please don’t use your phone during the school day.</p></section></div>}
      {visited.includes('source-code.html') && <div hidden={page !== 'source-code.html'}><section className="source-code-page"><header><h1>Source code</h1></header><h2 className="source-code-label">GitHub:</h2><a className="source-code-link" href="https://github.com/daniezl/Hilltoppers" target="_blank" rel="noopener noreferrer"><GithubLogo weight="regular" aria-hidden="true"/><span className="source-code-link-text"><span>daniezl / Hilltoppers</span><span className="source-code-url">https://github.com/daniezl/Hilltoppers</span></span><span className="source-code-arrow" aria-hidden="true">↗</span></a><p className="source-code-intro">Hilltoppers is open source. Everyone can contribute.</p></section></div>}
      {/* Keep visited pages mounted so navigation preserves forms and pending saves. */}
      {visited.includes('toppings.html') && <div hidden={page !== 'toppings.html'}><ToppingBar active={page === 'toppings.html'} onAccount={() => navigate('login.html')}/></div>}
      {visited.includes('class-settings.html') && <div hidden={page !== 'class-settings.html'}><ClassSettings onAccount={() => navigate('login.html')}/></div>}
      {visited.includes('feedback.html') && <div hidden={page !== 'feedback.html'}><Feedback/></div>}
      {visited.includes('login.html') && <div hidden={page !== 'login.html'}><Login returnPage={returnPage} onNavigate={navigate}/></div>}
    </div>
  </div>;
}
