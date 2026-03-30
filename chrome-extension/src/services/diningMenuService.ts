export type DiningPeriod = 'Breakfast' | 'Lunch' | 'Dinner';

export type DiningFetchErrorCode =
  | 'network'
  | 'parse'
  | 'no_station'
  | 'no_item';

export class DiningMenuError extends Error {
  code: DiningFetchErrorCode;

  constructor(code: DiningFetchErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'DiningMenuError';
  }
}

export interface DiningMenuResult {
  period: DiningPeriod;
  dateLabel: string | null;
  sourceUrl: string;
  globalFareFirst: string | null;
  classicKitchenFirst: string | null;
  globalFareMore: string[];
  classicKitchenMore: string[];
  fetchedAt: string;
  rule: 'first-listed';
}

const DISCOVERY_URL = 'https://stjacademy.campus-dining.com/menus/';
const DEFAULT_MENUS_URL = 'https://menus.campus-dining.com/eliorna/d0358';

const PERIODS: DiningPeriod[] = ['Breakfast', 'Lunch', 'Dinner'];

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function toTextLines(html: string): string[] {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const withBreaks = withoutScripts
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n');
  const withoutTags = withBreaks.replace(/<[^>]+>/g, ' ');
  const decoded = decodeHtmlEntities(withoutTags);
  return decoded
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function extractEnlargeUrl(html: string): string | null {
  const directMatch = html.match(
    /<a[^>]+href=["']([^"']+)["'][^>]*>\s*Enlarge\s*<\/a>/i
  );
  if (directMatch?.[1]) {
    return directMatch[1].trim();
  }

  const fallbackMatch = html.match(
    /https?:\/\/menus\.campus-dining\.com\/[^\s"'<>]+/i
  );
  return fallbackMatch?.[0]?.trim() ?? null;
}

function findDateLabel(lines: string[]): string | null {
  const dateStartIndex = lines.findIndex((line) => line.toLowerCase() === 'date');
  if (dateStartIndex < 0) {
    return null;
  }
  const datePattern =
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+[A-Za-z]+\s+\d{1,2}$/;
  for (let i = dateStartIndex + 1; i < Math.min(lines.length, dateStartIndex + 40); i += 1) {
    if (datePattern.test(lines[i])) {
      return lines[i];
    }
  }
  return null;
}

function isCaloriesLine(line: string): boolean {
  return /^\d[\d,]*(\.\d+)?\s*cal$/i.test(line.trim());
}

function isDishCandidate(line: string): boolean {
  const lower = line.toLowerCase();
  if (!line || line.length < 2 || line.length > 120) {
    return false;
  }
  if (
    lower === 'nutritional information' ||
    lower === 'filters' ||
    lower === 'download menu' ||
    lower === 'my meal' ||
    lower === 'all'
  ) {
    return false;
  }
  if (lower.startsWith('ingredients:')) {
    return false;
  }
  if (lower.includes('% daily values')) {
    return false;
  }
  if (lower.includes(' per portion')) {
    return false;
  }
  if (/^\d[\d,]*(\.\d+)?\s*(g|mg|mcg|oz|ml)$/i.test(line)) {
    return false;
  }
  if (/^\d+(\.\d+)?%$/.test(line)) {
    return false;
  }
  if (isCaloriesLine(line)) {
    return false;
  }
  if (/^\d+\/\d+\s+(cup|oz|tbsp|tsp)\b/i.test(line)) {
    return false;
  }
  if (/^\d+\s+(cup|oz|tbsp|tsp)\b/i.test(line)) {
    return false;
  }
  if (/^\d+(\.\d+)?$/.test(line)) {
    return false;
  }
  if (lower.startsWith('|') || lower.endsWith('|')) {
    return false;
  }
  if (
    lower === 'calories' ||
    lower === 'total fat' ||
    lower === 'saturates' ||
    lower === 'trans fat' ||
    lower === 'cholesterol' ||
    lower === 'sodium' ||
    lower === 'carbs' ||
    lower === 'fiber' ||
    lower === 'sugars' ||
    lower === 'protein' ||
    lower === 'calcium' ||
    lower === 'iron' ||
    lower === 'potassium' ||
    lower === 'vitamin d'
  ) {
    return false;
  }
  if (
    lower === 'classic kitchen' ||
    lower === 'global fare' ||
    lower === 'greens' ||
    lower === 'the local deli' ||
    lower === 'sauce & stone'
  ) {
    return false;
  }
  return true;
}

function isStationLabel(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    lower === 'classic kitchen' ||
    lower === 'global fare' ||
    lower === 'greens' ||
    lower === 'the local deli' ||
    lower === 'sauce & stone'
  );
}

function extractStationItems(
  lines: string[],
  stationName: 'Global Fare' | 'Classic Kitchen',
  startIndex = 0
): string[] {
  const stationLower = stationName.toLowerCase();
  for (let i = startIndex; i < lines.length - 2; i += 1) {
    if (
      lines[i].toLowerCase() === stationLower &&
      lines[i + 1].toLowerCase() === 'nutritional information'
    ) {
      const items: string[] = [];
      const seen = new Set<string>();
      for (let j = i + 2; j < lines.length; j += 1) {
        const line = lines[j];
        if (j > i + 2 && isStationLabel(line)) {
          break;
        }
        if (isDishCandidate(line) && isCaloriesLine(lines[j + 1] ?? '')) {
          const normalized = line.toLowerCase();
          if (!seen.has(normalized)) {
            seen.add(normalized);
            items.push(line);
          }
        }
      }
      return items;
    }
  }
  return [];
}

function extractMenuIdentifiers(html: string): Partial<Record<DiningPeriod, string>> {
  const result: Partial<Record<DiningPeriod, string>> = {};
  for (const period of PERIODS) {
    const escapedPeriod = period.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(
      `<div\\s+data-menu-identifier=["']([^"']+)["'][^>]*>\\s*${escapedPeriod}\\s*<\\/div>`,
      'i'
    );
    const match = html.match(matcher);
    if (match?.[1]) {
      result[period] = match[1];
    }
  }
  return result;
}

function parseMenuContext(html: string): { locationGuid: string; date: string } | null {
  const locationMatch = html.match(/k10\.settings\.menu\.location\.guid\s*=\s*'([^']+)'/i);
  const dateMatch = html.match(/k10\.settings\.menu\.date\s*=\s*'([^']+)'/i);
  if (!locationMatch?.[1] || !dateMatch?.[1]) {
    return null;
  }
  return {
    locationGuid: locationMatch[1].trim(),
    date: dateMatch[1].trim()
  };
}

async function safeFetchText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-cache' });
  } catch (error) {
    throw new DiningMenuError('network', `Failed to fetch ${url}: ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new DiningMenuError('network', `Failed to fetch ${url}: HTTP ${response.status}`);
  }

  return response.text();
}

export async function loadDiningMenuFirstItems(period: DiningPeriod = 'Lunch'): Promise<DiningMenuResult> {
  const discoveryHtml = await safeFetchText(DISCOVERY_URL);
  const discoveredUrl = extractEnlargeUrl(discoveryHtml);
  const sourceUrl = discoveredUrl || DEFAULT_MENUS_URL;
  const baseUrl = sourceUrl.split('?')[0];
  const defaultHtml = await safeFetchText(baseUrl);
  const menuIdentifiers = extractMenuIdentifiers(defaultHtml);
  const menuContext = parseMenuContext(defaultHtml);
  const selectedMenuGuid = menuIdentifiers[period];
  if (!selectedMenuGuid) {
    throw new DiningMenuError('no_item', `No menu identifier found for ${period}`);
  }
  if (!menuContext) {
    throw new DiningMenuError('parse', 'Failed to parse menu context');
  }

  const periodUrl = `${baseUrl}?cl=true&mguid=${encodeURIComponent(menuContext.locationGuid)}&mldate=${encodeURIComponent(menuContext.date)}&mlguid=${encodeURIComponent(selectedMenuGuid)}&internalrequest=true`;
  const menuHtml = await safeFetchText(periodUrl);
  const lines = toTextLines(menuHtml);

  if (!lines.length) {
    throw new DiningMenuError('parse', 'Menu page content is empty');
  }

  const globalFareItems = extractStationItems(lines, 'Global Fare');
  const classicKitchenItems = extractStationItems(lines, 'Classic Kitchen');
  const globalFareFirst = globalFareItems[0] ?? null;
  const classicKitchenFirst = classicKitchenItems[0] ?? null;

  if (!globalFareFirst && !classicKitchenFirst) {
    throw new DiningMenuError('no_station', 'No target stations found in menu content');
  }

  return {
    period,
    dateLabel: findDateLabel(lines),
    sourceUrl: periodUrl,
    globalFareFirst,
    classicKitchenFirst,
    globalFareMore: globalFareItems.slice(1),
    classicKitchenMore: classicKitchenItems.slice(1),
    fetchedAt: new Date().toISOString(),
    rule: 'first-listed'
  };
}
