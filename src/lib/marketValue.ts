import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { MarketValuePoint, Player } from '../types';

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
 * Returns player's complete market value info based ONLY on actual admin inputs.
 * NEVER generates fake or arbitrary values.
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

  const hasValue = Boolean(explicitParsed && explicitParsed.num > 0);
  const currentNum = hasValue ? explicitParsed!.num : 0;

  const formatted = hasValue
    ? (player.degerFormatted && player.degerFormatted.trim() !== '' ? player.degerFormatted : formatOwoValue(currentNum))
    : '-';

  // Read actual saved history points
  let history: MarketValuePoint[] = Array.isArray(player.degerHistory)
    ? [...player.degerHistory]
    : [];

  // Filter out invalid items
  history = history.filter((pt) => pt && typeof pt === 'object' && typeof pt.value === 'number' && !isNaN(pt.value));

  // If player has a current value set, but history is empty, represent that single point
  if (history.length === 0 && hasValue) {
    history = [
      {
        id: `mv_${Date.now()}`,
        date: 'Güncel',
        value: currentNum,
        formattedValue: formatted,
        club: player.pteam || '',
        clubLogo: (player as any).teamLogo || ''
      }
    ];
  }

  // Peak calculation from actual history
  let peakNum = currentNum;
  let peakDate = history.length > 0 ? history[history.length - 1].date : '-';

  if (history.length > 0) {
    peakNum = Math.max(...history.map((pt) => pt.value), currentNum);
    const peakPoint = history.slice().reverse().find((pt) => pt.value === peakNum);
    if (peakPoint) {
      peakDate = peakPoint.date;
    }
  }

  const lastUpdateDate = history.length > 0 ? history[history.length - 1].date : '-';

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
 * Saves a new market value point and updates player document in Firestore
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
  const date = dateStr && dateStr.trim() !== ''
    ? dateStr.trim()
    : new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

  const newPoint: MarketValuePoint = {
    id: `mv_${Date.now()}`,
    date,
    value: parsed.num,
    formattedValue: parsed.formatted,
    club: clubName || '',
    clubLogo: clubLogoUrl || ''
  };

  const updatedHistory = [...currentHistory, newPoint];

  const ref = doc(db, 'players', playerDocId);
  await updateDoc(ref, {
    deger: parsed.num,
    degerFormatted: parsed.formatted,
    degerHistory: updatedHistory
  });

  return parsed;
}
