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
import { loadSchedulePreferences, type SchedulePreferences, DEFAULT_SCHEDULE_PREFERENCES } from '../storage/schedulePreferences';
import { logAppOpen } from '../firebase/analytics';

interface SchedulePayload {
  dateKey: string;
  blocks: Block[];
  dayType: string | null;
  details?: string | null;
}

interface DiningMenuPayload {
  period: 'Breakfast' | 'Lunch' | 'Dinner';
  dateLabel: string | null;
  sourceUrl: string;
  globalFareFirst: string | null;
  classicKitchenFirst: string | null;
  globalFareMore: string[];
  classicKitchenMore: string[];
  fetchedAt: string;
  rule: 'first-listed';
}

const DINING_MENU_URL = 'https://stjacademy.campus-dining.com/menus/';
const DAILY_BULLETIN_URL = 'https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/daily-bulletin/';
const DINING_PERIODS: Array<DiningMenuPayload['period']> = ['Breakfast', 'Lunch', 'Dinner'];
const GOOGLE_SEARCH_URL = 'https://www.google.com/search?q=';

function getDishSearchUrl(dishName: string): string {
  return `${GOOGLE_SEARCH_URL}${encodeURIComponent(dishName)}`;
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

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
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
}

const Popup: React.FC = () => {
  const [schedule, setSchedule] = useState<SchedulePayload>({ dateKey: '', blocks: [], dayType: null, details: null });
  const [error, setError] = useState<string | null>(null);
  const [scheduleExpanded, setScheduleExpanded] = useState<boolean>(false);
  const [blockPrefs, setBlockPrefs] = useState<BlockPreferenceRecord>(createEmptyPreferences());
  const [schedulePrefs, setSchedulePrefs] = useState<SchedulePreferences>(DEFAULT_SCHEDULE_PREFERENCES);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [menuExpanded, setMenuExpanded] = useState<boolean>(false);
  const [selectedDiningPeriod, setSelectedDiningPeriod] = useState<DiningMenuPayload['period']>('Lunch');
  const [menuLoading, setMenuLoading] = useState<boolean>(true);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuData, setMenuData] = useState<DiningMenuPayload | null>(null);
  const hasResolvedInitial = useRef(false);
  const refreshRequestedRef = useRef(false);
  const menuRequestIdRef = useRef(0);
  const latestMenuDataRef = useRef<DiningMenuPayload | null>(null);
  const hasManualDiningSelectionRef = useRef(false);

  const debugTestTime = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    const params = new URLSearchParams(window.location.search);
    const value = params.get('testTime');
    if (!value) {
      return null;
    }
    const parsed = DateTime.fromISO(value, { zone: EST_ZONE });
    if (!parsed.isValid) {
      console.warn('[popup] Ignoring invalid testTime param', value);
      return null;
    }
    return parsed.toJSDate();
  }, []);

  const scheduleDate = useMemo(
    () =>
      schedule.dateKey
        ? parseDateKey(schedule.dateKey)
        : DateTime.now().setZone(EST_ZONE).startOf('day').toJSDate(),
    [schedule.dateKey]
  );
  const lunchBlock = useMemo(
    () =>
      schedule.blocks.find(
        (block) => Array.isArray(block.subBlocks) && block.subBlocks.length > 0
      ) ?? null,
    [schedule.blocks]
  );
  const [showLunchDetails, setShowLunchDetails] = useState<boolean>(false);

  const isUsingDefaultBlockPrefs = useMemo(() =>
    (Object.keys(DEFAULT_BLOCK_NAMES) as BlockKey[]).every((key) => {
      const pref = blockPrefs[key];
      return pref.name.trim().length === 0 && pref.showOnGreen && pref.showOnWhite;
    }),
  [blockPrefs]);

  useEffect(() => {
    setShowLunchDetails(false);
  }, [schedule.dateKey]);

  const prevDateKeyRef = useRef(schedule.dateKey);
  useEffect(() => {
    if (prevDateKeyRef.current && prevDateKeyRef.current !== schedule.dateKey) {
      hasManualDiningSelectionRef.current = false;
    }
    prevDateKeyRef.current = schedule.dateKey;
  }, [schedule.dateKey]);

  useEffect(() => {
    void logAppOpen();

    const loadingTimeout = window.setTimeout(() => {
      if (!hasResolvedInitial.current) {
        hasResolvedInitial.current = true;
        setIsLoading(false);
      }
    }, 1500);

    const requestRefresh = (reason: string) => {
      if (refreshRequestedRef.current) {
        return;
      }
      refreshRequestedRef.current = true;
      safeSendMessage<{ ok: boolean; error?: string }>({
        type: 'requestScheduleRefresh',
        reason
      })
        .then((response) => {
          if (!response?.ok) {
            refreshRequestedRef.current = false;
          }
        })
        .catch((err) => {
          console.error('[popup] Failed to request schedule refresh', err);
          refreshRequestedRef.current = false;
        });
    };

    safeSendMessage<SchedulePayload>({ type: 'getScheduleCache' })
      .then((payload) => {
        const next = {
          dateKey: payload?.dateKey ?? '',
          blocks: payload?.blocks ?? [],
          dayType: payload?.dayType ?? null,
          details: payload?.details ?? null
        };
        setSchedule(next);
        const hasContent = Boolean(next.dateKey) || (Array.isArray(next.blocks) && next.blocks.length > 0) || Boolean(next.dayType);
        if (hasContent) {
          hasResolvedInitial.current = true;
          setIsLoading(false);
        }
        requestRefresh('popup-init');
      })
      .catch((err) => {
        console.error('[popup] Failed to get cached schedule', err);
        setError('Unable to retrieve schedule.');
        hasResolvedInitial.current = true;
        setIsLoading(false);
      });

    function handleScheduleMessage(message: unknown) {
      if (
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: string }).type === 'scheduleUpdated'
      ) {
        const payload = (message as { payload: SchedulePayload }).payload;
        const next = {
          dateKey: payload?.dateKey ?? '',
          blocks: payload?.blocks ?? [],
          dayType: payload?.dayType ?? null,
          details: payload?.details ?? null
        };
        setSchedule(next);
        refreshRequestedRef.current = false;
        hasResolvedInitial.current = true;
        setIsLoading(false);
      }
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
      chrome.runtime.onMessage.addListener(handleScheduleMessage);
      return () => {
        hasResolvedInitial.current = true;
        window.clearTimeout(loadingTimeout);
        chrome.runtime.onMessage.removeListener(handleScheduleMessage);
      };
    }

    return () => {
      hasResolvedInitial.current = true;
      window.clearTimeout(loadingTimeout);
    };
  }, []);

  useEffect(() => {
    latestMenuDataRef.current = menuData;
  }, [menuData]);

  useEffect(() => {
    if (!menuExpanded) {
      return () => {};
    }

    const requestDiningRefresh = (period: DiningMenuPayload['period'], requestId: number) => {
      if (requestId !== menuRequestIdRef.current) {
        return;
      }
      safeSendMessage<{ ok: boolean; error?: string; payload?: DiningMenuPayload | null }>({
        type: 'requestDiningMenuRefresh',
        period
      })
        .then((response) => {
          if (requestId !== menuRequestIdRef.current) {
            return;
          }
          if (response?.payload) {
            setMenuData(response.payload);
            setMenuError(null);
            setMenuLoading(false);
            return;
          }
          if (!response?.ok) {
            // If refresh fails but we already have data for this period, keep it.
            if (latestMenuDataRef.current?.period === period) {
              setMenuError(null);
              setMenuLoading(false);
              return;
            }
            setMenuError('Menu unavailable');
            setMenuLoading(false);
            return;
          }
          if (latestMenuDataRef.current?.period === period) {
            setMenuError(null);
            setMenuLoading(false);
            return;
          }
          setMenuError('Menu unavailable');
          setMenuLoading(false);
        })
        .catch((err) => {
          if (requestId !== menuRequestIdRef.current) {
            return;
          }
          console.error('[popup] Failed to request dining menu refresh', err);
          if (latestMenuDataRef.current?.period === period) {
            setMenuError(null);
            setMenuLoading(false);
            return;
          }
          setMenuError('Menu unavailable');
          setMenuLoading(false);
        });
    };

    const menuRequestId = menuRequestIdRef.current + 1;
    menuRequestIdRef.current = menuRequestId;

    safeSendMessage<DiningMenuPayload | null>({
      type: 'getDiningMenuCache',
      period: selectedDiningPeriod
    })
      .then((payload) => {
        if (menuRequestId !== menuRequestIdRef.current) {
          return;
        }
        if (payload) {
          setMenuData(payload);
          setMenuError(null);
          setMenuLoading(false);
        }
        requestDiningRefresh(selectedDiningPeriod, menuRequestId);
      })
      .catch((err) => {
        if (menuRequestId !== menuRequestIdRef.current) {
          return;
        }
        console.error('[popup] Failed to get cached dining menu', err);
        setMenuError('Menu unavailable');
        setMenuData(null);
        setMenuLoading(false);
      });

    function handleDiningMessage(message: unknown) {
      if (
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: string }).type === 'diningMenuUpdated'
      ) {
        const payload = (message as { payload: DiningMenuPayload }).payload;
        if (!payload || payload.period !== selectedDiningPeriod) {
          return;
        }
        setMenuData(payload);
        setMenuError(null);
        setMenuLoading(false);
      }
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
      chrome.runtime.onMessage.addListener(handleDiningMessage);
      return () => {
        chrome.runtime.onMessage.removeListener(handleDiningMessage);
      };
    }

    return () => {};
  }, [menuExpanded, selectedDiningPeriod]);

  const [now, setNow] = useState<Date>(() => (debugTestTime ?? DateTime.now().setZone(EST_ZONE).toJSDate()));

  useEffect(() => {
    if (debugTestTime) {
      setNow(debugTestTime);
      return () => undefined;
    }
    const interval = setInterval(() => {
      setNow(DateTime.now().setZone(EST_ZONE).toJSDate());
    }, 1000);
    return () => clearInterval(interval);
  }, [debugTestTime]);

  useEffect(() => {
    Promise.all([
      loadBlockPreferences(),
      loadSchedulePreferences()
    ])
      .then(([blockPrefs, schedulePrefs]) => {
        setBlockPrefs(blockPrefs);
        setSchedulePrefs(schedulePrefs);
      })
      .catch((err) => console.error('[popup] Failed to load preferences', err));

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      const listener = (
        changes: { [key: string]: chrome.storage.StorageChange },
        area: string
      ) => {
        if (area === 'sync') {
          if (changes.blockPreferences) {
            const next = changes.blockPreferences.newValue as BlockPreferenceRecord | undefined;
            if (next) {
              setBlockPrefs(next);
            } else {
              setBlockPrefs(createEmptyPreferences());
            }
          }
          if (changes.schedulePreferences) {
            const next = changes.schedulePreferences.newValue as SchedulePreferences | undefined;
            if (next) {
              setSchedulePrefs(next);
            } else {
              setSchedulePrefs(DEFAULT_SCHEDULE_PREFERENCES);
            }
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

  const isMenuForToday = useMemo(() => {
    if (!menuData?.dateLabel) {
      return false;
    }
    const todayLabel = DateTime.now().setZone(EST_ZONE).toFormat('cccc, LLLL d');
    return menuData.dateLabel === todayLabel;
  }, [menuData?.dateLabel]);

  const { currentBlock, nextBlock, remainingMs, nextStartsInMs } = useMemo(() => {
    let current: Block | undefined;
    let next: Block | undefined;
    let remaining = 0;
    let nextStartsIn = 0;

    for (let i = 0; i < schedule.blocks.length; i += 1) {
      const block = schedule.blocks[i];
      const times = getBlockTimes(block, baseDate);
      if (now >= times.start && now < times.end) {
        current = block;
        const nextIndex = i + 1;
        if (nextIndex < schedule.blocks.length) {
          next = schedule.blocks[nextIndex];
          const nextStart = parseBlockTime(schedule.blocks[nextIndex].start, baseDate);
          nextStartsIn = Math.max(0, nextStart.getTime() - now.getTime());
        }
        remaining = Math.max(0, times.end.getTime() - now.getTime());
        break;
      }
      if (now < times.start) {
        next = block;
        nextStartsIn = Math.max(0, times.start.getTime() - now.getTime());
        break;
      }
    }

    return { currentBlock: current, nextBlock: next, remainingMs: remaining, nextStartsInMs: nextStartsIn };
  }, [schedule.blocks, baseDate, now]);

  const formattedRemaining = useMemo(() => {
    if (!currentBlock) {
      return '00:00';
    }
    return formatCountdown(remainingMs);
  }, [currentBlock?.id, remainingMs]);

  const formattedNextStart = useMemo(() => {
    if (!nextBlock) {
      return '00:00';
    }
    return formatCountdown(nextStartsInMs);
  }, [nextBlock?.id, nextStartsInMs]);

  const currentDisplay = useMemo(() => {
    if (!currentBlock) {
      return null;
    }
    return resolveBlockDisplay(currentBlock.name, schedule.dayType, blockPrefs);
  }, [blockPrefs, currentBlock, schedule.dayType]);

  const nextDisplay = useMemo(() => {
    if (!nextBlock) {
      return null;
    }
    return resolveBlockDisplay(nextBlock.name, schedule.dayType, blockPrefs);
  }, [blockPrefs, nextBlock, schedule.dayType]);

  const progressBar = useMemo<{
    startLabel: string;
    endLabel: string;
    percent: number;
    isBreak: boolean;
  } | null>(() => {
    if (currentBlock) {
      const times = getBlockTimes(currentBlock, baseDate);
      const total = times.end.getTime() - times.start.getTime();
      const elapsed = now.getTime() - times.start.getTime();
      const percent = Math.min(Math.max(elapsed / total, 0), 1);
      return {
        startLabel: toDisplayTime(times.start, schedulePrefs.timeFormat),
        endLabel: toDisplayTime(times.end, schedulePrefs.timeFormat),
        percent,
        isBreak: false,
      };
    }

    if (nextBlock) {
      const nextTimes = getBlockTimes(nextBlock, baseDate);

      // Show progress during breaks as well (from previous block end -> next block start).
      const nextIndex = schedule.blocks.findIndex((block) => block.id === nextBlock.id);
      const prevBlock = nextIndex > 0 ? schedule.blocks[nextIndex - 1] : undefined;
      const breakStart = prevBlock ? parseBlockTime(prevBlock.end, baseDate) : null;

      if (breakStart) {
        const total = nextTimes.start.getTime() - breakStart.getTime();
        const elapsed = now.getTime() - breakStart.getTime();
        const percent = total > 0 ? Math.min(Math.max(elapsed / total, 0), 1) : 1;
        return {
          startLabel: toDisplayTime(breakStart, schedulePrefs.timeFormat),
          endLabel: toDisplayTime(nextTimes.start, schedulePrefs.timeFormat),
          percent,
          isBreak: true,
        };
      }

      // Fallback (no previous block): keep the break bar full so the UI is stable.
      return {
        startLabel: toDisplayTime(nextTimes.start, schedulePrefs.timeFormat),
        endLabel: toDisplayTime(nextTimes.end, schedulePrefs.timeFormat),
        percent: 1,
        isBreak: true,
      };
    }

    return null;
  }, [currentBlock, nextBlock, baseDate, now, schedulePrefs.timeFormat]);

  const dayTypeLabel = schedule.dayType;

  const autoDiningPeriod = useMemo<DiningMenuPayload['period']>(() => {
    if (!schedule.blocks.length) {
      return 'Lunch';
    }
    const firstBlock = schedule.blocks[0];
    const firstStart = parseBlockTime(firstBlock.start, baseDate);

    if (now < firstStart) {
      return 'Breakfast';
    }

    const namedLunchBlock =
      schedule.blocks.find((block) => block.name.toLowerCase().includes('lunch')) ?? lunchBlock;

    if (namedLunchBlock) {
      const lunchEnd = parseBlockTime(namedLunchBlock.end, baseDate);
      if (now >= lunchEnd) {
        return 'Dinner';
      }
    }

    return 'Lunch';
  }, [baseDate, lunchBlock, now, schedule.blocks]);

  useEffect(() => {
    if (hasManualDiningSelectionRef.current) {
      return;
    }
    if (selectedDiningPeriod !== autoDiningPeriod) {
      setMenuLoading(true);
      setMenuError(null);
      setMenuData(null);
      setSelectedDiningPeriod(autoDiningPeriod);
    }
  }, [autoDiningPeriod, selectedDiningPeriod]);
  
  // Check if it's a no school day (no blocks and dayType indicates no school)
  const isNoSchool = schedule.blocks.length === 0 && 
    (dayTypeLabel?.toLowerCase().includes('no school') ?? false);

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

  const isDayTypeBulletinLink = dayTypeClass === 'green' || dayTypeClass === 'white';

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
                    d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0a2.34 2.34 0 0 0 3.319 1.915a2.34 2.34 0 0 1 2.33 4.033a2.34 2.34 0 0 0 0 3.831a2.34 2.34 0 0 1-2.33 4.033a2.34 2.34 0 0 0-3.319 1.915a2.34 2.34 0 0 1-4.659 0a2.34 2.34 0 0 0-3.32-1.915a2.34 2.34 0 0 1-2.33-4.033a2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="3"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div className="header-right">
            {dayTypeLabel ? (
              isDayTypeBulletinLink ? (
                <a
                  className={`day-type-pill ${dayTypeClass} day-type-pill-link`}
                  href={DAILY_BULLETIN_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  title="Open Daily Bulletin"
                  aria-label="Open Daily Bulletin"
                >
                  {dayTypeLabel}
                </a>
              ) : (
                <span className={`day-type-pill ${dayTypeClass}`}>{dayTypeLabel}</span>
              )
            ) : null}
          </div>
        </div>
      </header>
      <section className="status">
        {currentBlock ? (
          <div className="status-current">
            <div className="current-details">
              <p className="current-name">{currentDisplay?.label ?? currentBlock.name}</p>
            </div>
            <span className="time-remaining">
              <span className="time-label">ends in</span>
              <span className="time-value">{formattedRemaining}</span>
            </span>
          </div>
        ) : nextBlock ? (
          <div className="status-current upcoming-status">
            <div className="current-details">
              <span className="next-label">Next up</span>
              <p className="current-name">{nextDisplay?.label ?? nextBlock.name}</p>
            </div>
            <span className="time-remaining">
              <span className="time-label">starts in</span>
              <span className="time-value">{formattedNextStart}</span>
            </span>
          </div>
        ) : (
          <div className="status-ended">
            {isNoSchool ? (
              <>
                <h2>{schedule.details ?? 'No school today'}</h2>
                <p>Have a good day!</p>
              </>
            ) : (
              <>
                <h2>School ended</h2>
                <p>Have a good day!</p>
              </>
            )}
          </div>
        )}
        {progressBar && (
          <div className={`progress-bar-container${progressBar.isBreak ? ' progress-break' : ''}`}>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${progressBar.percent * 100}%` }}
              />
            </div>
          </div>
        )}
      </section>
      {!isNoSchool && (
        <section className={`schedule-list ${scheduleExpanded ? '' : 'collapsed'}`}>
          <button
            type="button"
            className="schedule-toggle"
            aria-expanded={scheduleExpanded}
            onClick={() => setScheduleExpanded((prev) => !prev)}
          >
            <span className="toggle-title">
              <svg className="toggle-title-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M8 3v3M16 3v3M4 9h16M6 6h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Schedule</span>
            </span>
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
                const subBlocksForBlock = Array.isArray(block.subBlocks) ? block.subBlocks : [];
                const isLunchBlock = lunchBlock && block.id === lunchBlock.id;

                return (
                  <li key={block.id} className={className}>
                    <div className="block-row">
                      <span className="block-name">{display.label}</span>
                      <div className="block-right">
                        <span className="block-time">
                          {toDisplayTime(start, schedulePrefs.timeFormat)} – {toDisplayTime(end, schedulePrefs.timeFormat)}
                        </span>
                        {isLunchBlock ? (
                          <button
                            type="button"
                            className="lunch-inline-toggle"
                            onClick={() => setShowLunchDetails((prev) => !prev)}
                          >
                            <span className={`chevron ${showLunchDetails ? "open" : ""}`} aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {isLunchBlock && showLunchDetails ? (
                      <ul className="subblock-list">
                        {subBlocksForBlock.map((sub) => (
                          <li key={sub.id ?? sub.name}>
                            <span className="subblock-name">{sub.name}</span>
                            <span className="subblock-time">
                              {toDisplayTime(parseBlockTime(sub.start, baseDate), schedulePrefs.timeFormat)} – {toDisplayTime(parseBlockTime(sub.end, baseDate), schedulePrefs.timeFormat)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
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
      )}
      <section className={`dining-list ${menuExpanded ? '' : 'collapsed'}`}>
        <button
          type="button"
          className="schedule-toggle"
          aria-expanded={menuExpanded}
          onClick={() => setMenuExpanded((prev) => !prev)}
        >
          <span className="toggle-title">
            <svg className="toggle-title-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="m2.1 21.8 6.4-6.3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="m19 5-7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Menu</span>
          </span>
          <span className={`chevron ${menuExpanded ? 'open' : ''}`} aria-hidden="true" />
        </button>
        {menuExpanded && (
          <div className="dining-content">
            <div className="dining-period-tabs" role="tablist" aria-label="Menu period">
              {DINING_PERIODS.map((period) => (
                <button
                  key={period}
                  type="button"
                  role="tab"
                  aria-selected={selectedDiningPeriod === period}
                  className={`dining-period-tab ${selectedDiningPeriod === period ? 'active' : ''}`}
                  onClick={() => {
                    if (selectedDiningPeriod !== period) {
                      hasManualDiningSelectionRef.current = true;
                      setMenuLoading(true);
                      setMenuError(null);
                      setMenuData(null);
                      setSelectedDiningPeriod(period);
                    }
                  }}
                >
                  {period}
                </button>
              ))}
            </div>
            {menuLoading ? (
              <p className="dining-meta dining-meta-loading">
                <svg
                  className="dining-loading-spinner"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray="15.7 47.1"
                  />
                </svg>
                <span>Loading menu...</span>
              </p>
            ) : menuError ? (
              <p className="dining-error">
                <svg className="dining-error-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M8 8l8 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M16 8l-8 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <span>{menuError}</span>
              </p>
            ) : (
              <>
                {isMenuForToday ? (
                  <div className="dining-grid">
                    <article className="dining-column">
                      <p className="dining-item">
                        {menuData?.globalFareFirst ? (
                          <a
                            className="dining-item-link"
                            href={getDishSearchUrl(menuData.globalFareFirst)}
                            target="_blank"
                            rel="noreferrer noopener"
                            title="Look Up"
                          >
                            {menuData.globalFareFirst}
                          </a>
                        ) : (
                          'No item found'
                        )}
                      </p>
                      {(menuData?.globalFareMore?.length ?? 0) > 0 ? (
                        <ul className="dining-more-list">
                          {(menuData?.globalFareMore ?? []).map((item) => (
                            <li key={`global-${item}`}>
                              <a
                                className="dining-item-link"
                                href={getDishSearchUrl(item)}
                                target="_blank"
                                rel="noreferrer noopener"
                                title="Look Up"
                              >
                                {item}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                    <article className="dining-column">
                      <p className="dining-item">
                        {menuData?.classicKitchenFirst ? (
                          <a
                            className="dining-item-link"
                            href={getDishSearchUrl(menuData.classicKitchenFirst)}
                            target="_blank"
                            rel="noreferrer noopener"
                            title="Look Up"
                          >
                            {menuData.classicKitchenFirst}
                          </a>
                        ) : (
                          'No item found'
                        )}
                      </p>
                      {(menuData?.classicKitchenMore?.length ?? 0) > 0 ? (
                        <ul className="dining-more-list">
                          {(menuData?.classicKitchenMore ?? []).map((item) => (
                            <li key={`classic-${item}`}>
                              <a
                                className="dining-item-link"
                                href={getDishSearchUrl(item)}
                                target="_blank"
                                rel="noreferrer noopener"
                                title="Look Up"
                              >
                                {item}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  </div>
                ) : null}
              </>
            )}
            <p className="dining-meta">
              <a
                className="dining-link"
                href={DINING_MENU_URL}
                target="_blank"
                rel="noreferrer noopener"
              >
                <svg
                  className="dining-link-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M14 4h6v6m0-6-8 8M10 6H7a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Menu Website</span>
              </a>
            </p>
          </div>
        )}
      </section>
    </main>
  );
};

export default Popup;
