import React, { useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { Block, EST_ZONE, parseBlockTime, toDisplayTime } from '../types/schedule';

interface SchedulePayload {
  dateKey: string;
  blocks: Block[];
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
  const [schedule, setSchedule] = useState<SchedulePayload>({ dateKey: '', blocks: [] });
  const [error, setError] = useState<string | null>(null);
  const [scheduleExpanded, setScheduleExpanded] = useState<boolean>(false);

  useEffect(() => {
    safeSendMessage<SchedulePayload>({ type: 'getScheduleCache' })
      .then((payload) => {
        setSchedule(payload);
      })
      .catch((err) => {
        console.error('[popup] Failed to get cached schedule', err);
        setError('Unable to retrieve schedule.');
      });

    function handleMessage(message: unknown) {
      if (
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: string }).type === 'scheduleUpdated'
      ) {
        const payload = (message as { payload: SchedulePayload }).payload;
        setSchedule(payload);
      }
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
      chrome.runtime.onMessage.addListener(handleMessage);
      return () => {
        chrome.runtime.onMessage.removeListener(handleMessage);
      };
    }

    return () => {};
  }, []);

  const [now, setNow] = useState<Date>(() => DateTime.now().setZone(EST_ZONE).toJSDate());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(DateTime.now().setZone(EST_ZONE).toJSDate());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const baseDate = useMemo(() => {
    if (!schedule.dateKey) {
      return DateTime.now().setZone(EST_ZONE).startOf('day').toJSDate();
    }
    return parseDateKey(schedule.dateKey);
  }, [schedule.dateKey]);

  const { currentBlock, nextBlock, minutesRemaining } = useMemo(() => {
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
        remaining = Math.max(0, Math.floor((times.end.getTime() - now.getTime()) / 60000));
        break;
      }
      if (now < times.start) {
        next = block;
        break;
      }
    }

    return { currentBlock: current, nextBlock: next, minutesRemaining: remaining };
  }, [schedule.blocks, baseDate, now]);

  if (error) {
    return <main className="popup"><p className="error">{error}</p></main>;
  }

  return (
    <main className="popup">
      <header>
        <h1>Hilltoppers</h1>
        <p>{DateTime.fromJSDate(baseDate, { zone: EST_ZONE }).toFormat('cccc, LLL d')}</p>
      </header>
      <section className="status">
        {currentBlock ? (
          <>
            <h2>Current Block</h2>
            <p className="current-name">{currentBlock.name}</p>
            <p className="time-remaining">{minutesRemaining} min remaining</p>
          </>
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
          <ul>
            {schedule.blocks.map((block) => {
              const { start, end } = getBlockTimes(block, baseDate);
              const isCurrent = currentBlock?.id === block.id;
              return (
                <li key={block.id} className={isCurrent ? 'current-block' : undefined}>
                  <span className="block-name">{block.name}</span>
                  <span className="block-time">
                    {toDisplayTime(start)} – {toDisplayTime(end)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
};

export default Popup;
