import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { Block, EST_ZONE, parseBlockTime, toDisplayTime } from '../types/schedule';
import {
  BlockPreferenceRecord,
  createEmptyPreferences,
  loadBlockPreferences,
  resolveBlockDisplay,
  DEFAULT_BLOCK_NAMES,
  BlockKey
} from '../storage/blockPreferences';
import { logAppOpen } from '../firebase/analytics';

interface SchedulePayload {
  dateKey: string;
  blocks: Block[];
  dayType: string | null;
}

function safeSendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      reject(new Error('Chrome runtime unavailable'));
      return;
    }

    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(err);
        return;
      }
      resolve(response as T);
    });
  });
}

function parseDateKey(key: string): Date {
  return DateTime.fromFormat(key, 'yyyy-LL-dd', { zone: EST_ZONE }).startOf('day').toJSDate();
}

function getBlockTimes(block: Block, baseDate: Date) {
  const start = parseBlockTime(block.start, baseDate);
  const end = parseBlockTime(block.end, baseDate);
  return { start, end };
}

const Popup: React.FC = () => {
  const [schedule, setSchedule] = useState<SchedulePayload>({ dateKey: '', blocks: [], dayType: null });
  const [error, setError] = useState<string | null>(null);
  const [scheduleExpanded, setScheduleExpanded] = useState<boolean>(false);
  const [blockPrefs, setBlockPrefs] = useState<BlockPreferenceRecord>(createEmptyPreferences());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const hasResolvedInitial = useRef(false);

  const isUsingDefaultBlockPrefs = useMemo(() =>
    (Object.keys(DEFAULT_BLOCK_NAMES) as BlockKey[]).every((key) => {
      const pref = blockPrefs[key];
      return pref.name.trim().length === 0 && pref.showOnGreen && pref.showOnWhite;
    }),
  [blockPrefs]);

  useEffect(() => {
    void logAppOpen();

    const loadingTimeout = window.setTimeout(() => {
      if (!hasResolvedInitial.current) {
        hasResolvedInitial.current = true;
        setIsLoading(false);
      }
    }, 1500);

    safeSendMessage<SchedulePayload>({ type: 'getScheduleCache' })
      .then((payload) => {
        const next = {
          dateKey: payload?.dateKey ?? '',
          blocks: payload?.blocks ?? [],
          dayType: payload?.dayType ?? null
        };
        setSchedule(next);
        const hasContent = Boolean(next.dateKey) || (Array.isArray(next.blocks) && next.blocks.length > 0) || Boolean(next.dayType);
        if (hasContent) {
          hasResolvedInitial.current = true;
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('[popup] Failed to get cached schedule', err);
        setError('Unable to retrieve schedule.');
        hasResolvedInitial.current = true;
        setIsLoading(false);
      });

    function handleMessage(message: unknown) {
      if (
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: string }).type === 'scheduleUpdated'
      ) {
        const payload = (message as { payload: SchedulePayload }).payload;
        const next = {
          dateKey: payload?.dateKey ?? '',
          blocks: payload?.blocks ?? [],
          dayType: payload?.dayType ?? null
        };
        setSchedule(next);
        hasResolvedInitial.current = true;
        setIsLoading(false);
      }
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
      chrome.runtime.onMessage.addListener(handleMessage);
      return () => {
        hasResolvedInitial.current = true;
        window.clearTimeout(loadingTimeout);
        chrome.runtime.onMessage.removeListener(handleMessage);
      };
    }

    return () => {
      hasResolvedInitial.current = true;
      window.clearTimeout(loadingTimeout);
    };
  }, []);

  const [now, setNow] = useState<Date>(() => DateTime.now().setZone(EST_ZONE).toJSDate());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(DateTime.now().setZone(EST_ZONE).toJSDate());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadBlockPreferences()
      .then((prefs) => setBlockPrefs(prefs))
      .catch((err) => console.error('[popup] Failed to load block preferences', err));

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      const listener = (
        changes: { [key: string]: chrome.storage.StorageChange },
        area: string
      ) => {
        if (area === 'sync' && changes.blockPreferences) {
          const next = changes.blockPreferences.newValue as BlockPreferenceRecord | undefined;
          if (next) {
            setBlockPrefs(next);
          } else {
            setBlockPrefs(createEmptyPreferences());
          }
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => {
        chrome.storage.onChanged.removeListener(listener);
      };
    }
    return () => {};
  }, []);

  const baseDate = useMemo(() => {
    if (!schedule.dateKey) {
      return DateTime.now().setZone(EST_ZONE).startOf('day').toJSDate();
    }
    return parseDateKey(schedule.dateKey);
  }, [schedule.dateKey]);

  const formattedDate = useMemo(() => {
    return DateTime.fromJSDate(baseDate, { zone: EST_ZONE }).toFormat('ccc, MMM d');
  }, [baseDate]);

  const { currentBlock, nextBlock, remainingMs } = useMemo(() => {
    let current: Block | undefined;
    let next: Block | undefined;
    let remaining = 0;

    for (let i = 0; i < schedule.blocks.length; i += 1) {
      const block = schedule.blocks[i];
      const times = getBlockTimes(block, baseDate);
      if (now >= times.start && now < times.end) {
        current = block;
        const nextIndex = i + 1;
        if (nextIndex < schedule.blocks.length) {
          next = schedule.blocks[nextIndex];
        }
        remaining = Math.max(0, times.end.getTime() - now.getTime());
        break;
      }
      if (now < times.start) {
        next = block;
        break;
      }
    }

    return { currentBlock: current, nextBlock: next, remainingMs: remaining };
  }, [schedule.blocks, baseDate, now]);

  const formattedRemaining = useMemo(() => {
    if (!currentBlock) {
      return '00:00';
    }
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    if (hours === 0) {
      return `${mm}:${ss}`;
    }

    const hh = String(hours).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }, [currentBlock?.id, remainingMs]);

  const dayTypeLabel = schedule.dayType;

  const handleOpenClassSettings = () => {
    const targetUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('class-settings.html')
      : 'class-settings.html';

    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: targetUrl });
    } else {
      window.open(targetUrl, '_blank', 'noopener');
    }
  };

  const dayTypeClass = useMemo(() => {
    if (!dayTypeLabel) {
      return 'neutral';
    }
    const lower = dayTypeLabel.toLowerCase();
    if (lower.includes('green')) {
      return 'green';
    }
    if (lower.includes('white')) {
      return 'white';
    }
    if (lower.includes('no school')) {
      return 'no-school';
    }
    return 'neutral';
  }, [dayTypeLabel]);

  if (error) {
    return <main className="popup"><p className="error">{error}</p></main>;
  }

  if (isLoading) {
    return (
      <main className="popup">
        <div className="loading-state">Loading…</div>
      </main>
    );
  }

  return (
    <main className="popup">
      <header>
        <div className="header-row">
          <div className="header-left">
            <div className="header-title-row">
              <button
                type="button"
                className="settings-button"
                onClick={handleOpenClassSettings}
                aria-label="Open settings"
                title="Settings"
              >
                <svg
                  aria-hidden="true"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M5 7.5h14M5 12h14M5 16.5h14"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div className="header-right">
            {dayTypeLabel ? <span className={`day-type-pill ${dayTypeClass}`}>{dayTypeLabel}</span> : null}
          </div>
        </div>
      </header>
      <section className="status">
        {currentBlock ? (
          <div className="status-current">
            <div className="current-details">
              <p className="current-name">{currentBlock.name}</p>
            </div>
            <span className="time-remaining">
              <span className="time-label">ends in</span>
              <span className="time-value">{formattedRemaining}</span>
            </span>
          </div>
        ) : (
          <>
            <h2>No Active Block</h2>
            {nextBlock ? <p>Next: {nextBlock.name}</p> : <p>Enjoy your free time!</p>}
          </>
        )}
      </section>
      <section className={`schedule-list ${scheduleExpanded ? '' : 'collapsed'}`}>
        <button
          type="button"
          className="schedule-toggle"
          aria-expanded={scheduleExpanded}
          onClick={() => setScheduleExpanded((prev) => !prev)}
        >
          <span>Today&apos;s Schedule</span>
          <span className={`chevron ${scheduleExpanded ? 'open' : ''}`} aria-hidden="true" />
        </button>
        {scheduleExpanded && (
          <>
            <ul>
              {schedule.blocks.map((block) => {
                const { start, end } = getBlockTimes(block, baseDate);
                const isCurrent = currentBlock?.id === block.id;
                const isNext = !currentBlock && nextBlock?.id === block.id;
                const display = resolveBlockDisplay(block.name, schedule.dayType, blockPrefs);
                const itemClasses: string[] = [];
                if (isCurrent) itemClasses.push('current-block');
                else if (isNext) itemClasses.push('upcoming-block');
                if (display.isFree) itemClasses.push('free-block');
                if (display.emphasizeUnknown) itemClasses.push('unknown-block');
                if (display.useGrayText) itemClasses.push('muted-block');
                const className = itemClasses.join(' ') || undefined;
                return (
                  <li key={block.id} className={className}>
                    <span className="block-name">{display.label}</span>
                    <span className="block-time">
                      {toDisplayTime(start)} – {toDisplayTime(end)}
                    </span>
                  </li>
                );
              })}
            </ul>
            {isUsingDefaultBlockPrefs ? (
              <p className="schedule-hint">
                You can go to the <a href="#" onClick={(event) => {
                  event.preventDefault();
                  handleOpenClassSettings();
                }}>settings</a> (top left) to set courses in your schedule.
              </p>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
};

export default Popup;
