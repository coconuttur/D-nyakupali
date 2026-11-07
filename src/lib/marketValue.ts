import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { MarketValuePoint, Player } from '../types';

/**
 * Turkish month mapping for chronological date parsing
 */
const TURKISH_MONTHS: Record<string, number> = {
  ocak: 0,
  subat: 1,
  şubat: 1,
  mart: 2,
  nisan: 3,
  mayis: 4,
  mayıs: 4,
  haziran: 5,
  temmuz: 6,
  agustos: 7,
  ağustos: 7,
  eylul: 8,
  eylül: 8,
  ekim: 9,
  kasim: 10,
  kasım: 10,
  aralik: 11,
  aralık: 11
};

/**
 * Parses user-entered date string into timestamp (milliseconds) for strictly chronological sorting.
 * Supports:
 * - "17.01.2026", "01.01.2026", "17/01/2026", "17-01-2026" (DD.MM.YYYY)
 * - "2026-01-17" (YYYY-MM-DD)
 * - "17 Ocak 2026", "Ocak 2026", "Kasım 2024"
 * - "01.2026" (MM.YYYY)
 * - "2026" (YYYY)
 * - "Güncel", "Bugün"
 */
export function parseMarketValueDate(dateStr?: string | null): number {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  const clean = dateStr.trim().toLowerCase();

  if (clean === 'güncel' || clean === 'bugün') {
    return Date.now();
  }

  // 1. DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY (e.g. "17.01.2026", "01.01.2026")
  const dmyMatch = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  // 2. YYYY-MM-DD
  const ymdMatch = clean.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  // 3. Named Turkish months (e.g. "17 Ocak 2026", "Ocak 2026", "Kasım 2024")
  for (const [mName, mIndex] of Object.entries(TURKISH_MONTHS)) {
    if (clean.includes(mName)) {
      // Find 4-digit year
      const yearMatch = clean.match(/\b(20\d\d|19\d\d)\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

      // Find day if present before or after month name
      const dayMatch = clean.match(/\b(\d{1,2})\b/);
      const dayCandidate = dayMatch ? parseInt(dayMatch[1], 10) : 1;
      const day = dayCandidate > 0 && dayCandidate <= 31 && dayCandidate !== year ? dayCandidate : 1;

      const d = new Date(year, mIndex, day);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    }
  }

  // 4. MM.YYYY
  const myMatch = clean.match(/^(\d{1,2})[./-](\d{4})$/);
  if (myMatch) {
    const month = parseInt(myMatch[1], 10) - 1;
    const year = parseInt(myMatch[2], 10);
    const d = new Date(year, month, 1);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  // 5. YYYY only
  const yearOnly = clean.match(/\b(20\d\d|19\d\d)\b/);
  if (yearOnly) {
    return new Date(parseInt(yearOnly[1], 10), 0, 1).getTime();
  }

  const fallback = Date.parse(dateStr);
  return isNaN(fallback) ? 0 : fallback;
}

/**
 * Sorts market value history points in strictly ascending chronological order (past -> present).
 */
export function sortHistoryByDate(points: MarketValuePoint[]): MarketValuePoint[] {
  return [...points].sort((a, b) => {
    const tA = parseMarketValueDate(a.date);
    const tB = parseMarketValueDate(b.date);
    if (tA !== tB) return tA - tB;
    return (a.id || '').localeCompare(b.id || '');
  });
}

/**
 * Parses user / admin input into numeric owo value and standard formatted string.
 * Supports:
 * - "10 owo" -> 10 owo (num: 10)
 * - "10 bin owo" or "10k" -> 10.000 owo (num: 10000)
 * - "10 milyon owo" or "10m" -> 10.000.000 owo (num: 10000000)
 * - "1.5 milyon owo" -> 1.500.000 owo (num: 1500000)
 * - "10000" -> 10.000 owo (num: 10000)
 */
export function parseOwoValue(input?: string | number | null): { num: number; formatted: string } {
  if (input === undefined || input === null || input === '') {
    return { num: 0, formatted: '0 owo' };
  }

  if (typeof input === 'number') {
    const val = Math.round(input);
    return { num: val, formatted: formatOwoValue(val) };
  }

  const clean = input.toString().trim().toLowerCase();

  // Milyar check
  if (clean.includes('milyar') || clean.endsWith('b') || clean.includes('mrd')) {
    const rawDigits = clean.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const n = parseFloat(rawDigits) || 0;
    const num = Math.round(n * 1_000_000_000);
    return { num, formatted: formatOwoValue(num) };
  }

  // Milyon check
  if (clean.includes('milyon') || clean.includes('mio') || clean.endsWith('m') || clean.includes('m owo')) {
    const rawDigits = clean.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const n = parseFloat(rawDigits) || 0;
    const num = Math.round(n * 1_000_000);
    return { num, formatted: formatOwoValue(num) };
  }

  // Bin check
  if (clean.includes('bin') || clean.endsWith('k') || clean.includes('k owo') || clean.includes('tsd')) {
    const rawDigits = clean.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const n = parseFloat(rawDigits) || 0;
    const num = Math.round(n * 1_000);
    return { num, formatted: formatOwoValue(num) };
  }

  // Direct number check with optional spaces/dots
  // E.g. "10.000.000" or "10 000 000" or "5000" or "10 owo"
  const digitsOnly = clean.replace(/owo/g, '').replace(/\./g, '').replace(/\s+/g, '').replace(/,/g, '.').trim();
  const rawNum = parseFloat(digitsOnly) || 0;
  const num = Math.round(rawNum);
  return { num, formatted: formatOwoValue(num) };
}

/**
 * Formats a numeric owo value dynamically into clean, human-readable format.
 * Never forces millions:
 * - 10 -> "10 owo"
 * - 500 -> "500 owo"
 * - 10000 -> "10 Bin owo"
 * - 18000000 -> "18 Milyon owo"
 */
export function formatOwoValue(num: number): string {
  if (!num || isNaN(num) || num <= 0) return '0 owo';

  if (num >= 1_000_000_000) {
    const val = (num / 1_000_000_000).toFixed(num % 1_000_000_000 === 0 ? 0 : 2);
    return `${val.replace('.', ',')} Milyar owo`;
  }

  if (num >= 1_000_000) {
    const val = (num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 2);
    return `${val.replace('.', ',')} Milyon owo`;
  }

  if (num >= 1_000) {
    const val = (num / 1_000).toFixed(num % 1_000 === 0 ? 0 : 2);
    return `${val.replace('.', ',')} Bin owo`;
  }

  return `${num.toLocaleString('tr-TR')} owo`;
}

/**
 * Returns player's complete market value info based ONLY on actual admin inputs,
 * guaranteed to be strictly sorted chronologically by date.
 */
export function getPlayerMarketValue(player: Player): {
  currentNum: number;
  formatted: string;
  hasValue: boolean;
  peakNum: number;
  peakFormatted: string;
  peakDate: string;
  lastUpdateDate: string;
  history: MarketValuePoint[];
} {
  const explicitParsed = player.deger !== undefined && player.deger !== null && player.deger !== ''
    ? parseOwoValue(player.deger)
    : null;

  const rawHasValue = Boolean(explicitParsed && explicitParsed.num > 0);

  // Read actual saved history points
  let history: MarketValuePoint[] = Array.isArray(player.degerHistory)
    ? [...player.degerHistory]
    : [];

  // Filter out invalid items
  history = history.filter((pt) => pt && typeof pt === 'object' && typeof pt.value === 'number' && !isNaN(pt.value));

  // If player has a current value set, but history is empty, represent that single point
  if (history.length === 0 && rawHasValue) {
    history = [
      {
        id: `mv_${Date.now()}`,
        date: 'Güncel',
        value: explicitParsed!.num,
        formattedValue: explicitParsed!.formatted,
        club: player.pteam || '',
        clubLogo: (player as any).teamLogo || ''
      }
    ];
  }

  // Sort history strictly chronologically by date (earliest -> latest)
  history = sortHistoryByDate(history);

  // The chronologically latest point determines current value and last update date
  const latestPoint = history.length > 0 ? history[history.length - 1] : null;

  const currentNum = latestPoint ? latestPoint.value : (rawHasValue ? explicitParsed!.num : 0);
  const hasValue = currentNum > 0 || history.length > 0;

  const formatted = hasValue
    ? (latestPoint ? (latestPoint.formattedValue || formatOwoValue(latestPoint.value)) : formatOwoValue(currentNum))
    : '-';

  // Peak calculation from actual history
  let peakNum = currentNum;
  let peakDate = latestPoint ? latestPoint.date : '-';

  if (history.length > 0) {
    peakNum = Math.max(...history.map((pt) => pt.value), currentNum);
    // Find the latest point that reached this peak
    const peakPoint = history.slice().reverse().find((pt) => pt.value === peakNum);
    if (peakPoint) {
      peakDate = peakPoint.date;
    }
  }

  const lastUpdateDate = latestPoint ? latestPoint.date : '-';

  return {
    currentNum,
    formatted,
    hasValue,
    peakNum,
    peakFormatted: hasValue || peakNum > 0 ? formatOwoValue(peakNum) : '-',
    peakDate,
    lastUpdateDate,
    history
  };
}

export function getPlayerMarketValueNumeric(player: Player): number {
  return getPlayerMarketValue(player).currentNum;
}

export function getPlayerMarketValueString(player: Player): string {
  return getPlayerMarketValue(player).formatted;
}

/**
 * Saves a new market value point and updates player document in Firestore,
 * keeping the history strictly sorted chronologically.
 */
export async function savePlayerMarketValue(
  playerDocId: string,
  newValueInput: string | number,
  dateStr?: string,
  clubName?: string,
  clubLogoUrl?: string,
  currentHistory: MarketValuePoint[] = []
): Promise<{ num: number; formatted: string }> {
  const parsed = parseOwoValue(newValueInput);
  const now = new Date();
  const defaultDate = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
  const date = dateStr && dateStr.trim() !== '' ? dateStr.trim() : defaultDate;

  const newPoint: MarketValuePoint = {
    id: `mv_${Date.now()}`,
    date,
    value: parsed.num,
    formattedValue: parsed.formatted,
    club: clubName || '',
    clubLogo: clubLogoUrl || ''
  };

  const updatedHistory = sortHistoryByDate([...currentHistory, newPoint]);
  const latestPoint = updatedHistory[updatedHistory.length - 1];

  const ref = doc(db, 'players', playerDocId);
  await updateDoc(ref, {
    deger: latestPoint.value,
    degerFormatted: latestPoint.formattedValue || formatOwoValue(latestPoint.value),
    degerHistory: updatedHistory
  });

  return parsed;
}
