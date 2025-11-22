import { DateTime } from 'luxon';
import { EST_ZONE } from '../types/schedule';
import { predictDayType } from './dayTypePredictor';
import { getCachedDayType, setCachedDayType } from '../storage/localCache';

const BULLETIN_URL = 'https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/daily-bulletin/';
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];
const DATE_REGEX = new RegExp(`(${MONTH_NAMES.join('|')})\\s+\\d{1,2},\\s+\\d{4}`, 'i');

export interface BulletinResult {
  label: string | null;
  bulletinDate: Date | null;
  rawLabel: string | null;
}

function normalizeLabel(text: string | null | undefined): string | null {
  if (!text) {
    return null;
  }
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (lower.includes('green')) {
    return 'Green Day';
  }
  if (lower.includes('white')) {
    return 'White Day';
  }
  if (lower.includes('no school')) {
    return 'No School';
  }
  return trimmed.length ? trimmed : null;
}

async function fetchBulletinHtml(): Promise<string> {
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Upgrade-Insecure-Requests': '1'
  };

  const response = await fetch(BULLETIN_URL, { headers, redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Bulletin request failed: ${response.status}`);
  }
  const html = await response.text();
  if (!html.trim()) {
    throw new Error('Bulletin HTML response empty');
  }
  return html;
}

function parseBulletin(html: string): BulletinResult {
  let bulletinDate: Date | null = null;
  const dateMatch = html.match(DATE_REGEX);
  if (dateMatch) {
    const parsed = DateTime.fromFormat(dateMatch[0], 'LLLL d, yyyy', { zone: EST_ZONE });
    if (parsed.isValid) {
      bulletinDate = parsed.toJSDate();
    }
  }

  let dayTypeRaw: string | null = null;
  // DOMParser is not available in Service Worker environment
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const searchSelectors = ['h1', 'h2', 'h3', 'h4', 'strong', 'p', 'span', 'li'];
      for (const selector of searchSelectors) {
        const nodes = Array.from(doc.querySelectorAll(selector));
        for (const node of nodes) {
          const text = node.textContent?.trim();
          if (!text) continue;
          const lower = text.toLowerCase();
          if (lower.includes('green day') || lower.includes('white day')) {
            dayTypeRaw = text;
            break;
          }
          if (lower.includes('no school')) {
            dayTypeRaw = text;
            break;
          }
        }
        if (dayTypeRaw) {
          break;
        }
      }
    } catch (error) {
      console.warn('[dayTypeResolver] DOM parse failed, falling back to regex scan', error);
    }
  } else {
    // Skip DOM parsing in Service Worker, will use regex fallback
    console.debug('[dayTypeResolver] DOMParser not available, using regex scan');
  }

  if (!dayTypeRaw) {
    const lower = html.toLowerCase();
    if (lower.includes('green day')) {
      dayTypeRaw = 'Green Day';
    } else if (lower.includes('white day')) {
      dayTypeRaw = 'White Day';
    } else if (lower.includes('no school')) {
      dayTypeRaw = 'No School';
    }
  }

  const label = normalizeLabel(dayTypeRaw);
  return {
    label,
    bulletinDate,
    rawLabel: dayTypeRaw
  };
}

export async function resolveBulletinDayType(targetDate: Date): Promise<string | null> {
  const target = DateTime.fromJSDate(targetDate, { zone: EST_ZONE }).startOf('day');
  const dateKey = target.toFormat('yyyy-LL-dd');
  
  // Try cache first
  const cached = await getCachedDayType(dateKey);
  if (cached) {
    return cached;
  }
  
  try {
    const html = await fetchBulletinHtml();
    const { label, bulletinDate } = parseBulletin(html);
    if (!label) {
      return null;
    }

    if (!bulletinDate) {
      // Cache the label
      await setCachedDayType(dateKey, label);
      return label;
    }

    const bulletin = DateTime.fromJSDate(bulletinDate, { zone: EST_ZONE }).startOf('day');

    if (bulletin.hasSame(target, 'day')) {
      // Cache the label
      await setCachedDayType(dateKey, label);
      return label;
    }

    try {
      const predicted = await predictDayType(label, bulletinDate, targetDate);
      // Cache the predicted result
      await setCachedDayType(dateKey, predicted);
      return predicted;
    } catch (error) {
      console.warn('[dayTypeResolver] Prediction fallback failed', error);
      // Cache the fallback label
      await setCachedDayType(dateKey, label);
      return label;
    }
  } catch (error) {
    console.warn('[dayTypeResolver] Unable to resolve day type from bulletin', error);
    return null;
  }
}
