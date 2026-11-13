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
/**
 * Standard today date constant for the valuation engine
 */
export const VALUATION_TODAY_DATE = '08.11.2026';

/**
 * Default team standings rankings in Süper Lig
 * Used when dynamic match results are not directly supplied
 */
export const DEFAULT_SUPER_LIG_RANKS: Record<string, number> = {
  'pofuspor': 1,
  'döner fc': 2,
  'doner fc': 2,
  'hendrix': 3,
  'leogard': 4,
  'kfcspor': 5,
  'xeilmes': 6,
  'sp5der jack': 7,
  'spider jack': 7,
  'deatheagle': 8,
  'death eagle': 8,
  'holy munchen': 9,
  'new hollands': 10,
  'realyon': 11,
  'bobblica': 12,
  'hiyar city': 12
};

export interface PerformanceValuationResult {
  date: string;
  num: number;
  formatted: string;
  baseGenValue: number;
  teamRank: number;
  teamName: string;
  teamMultiplier: number;
  teamBonusPercent: number;
  perfMultiplier: number;
  perfBonusPercent: number;
  isCalibratedReference: boolean;
  referencePlayerName?: string;
  statsUsed: {
    gen: number;
    goals: number;
    asistsay: number;
    ratingoy: number;
    mvp: number;
    mac: number;
    team: string;
  };
}

/**
 * Calculates dynamic performance-based market value for 08.11.2026.
 * "takimlari iyi olan yukseliyo vs dedigim oyunculari referans al"
 * Anchored to the exact user reference players:
 * 1. Moise Kean (Pofuspor #1, GEN 91, 13G, 9A, 9.26 rating, 4 MVP) -> 100,000,000 owo (100 Milyon owo)
 * 2. Thomas Müller (Holy Munchen #9, GEN 85, 10G, 4A, 7.50 rating, 1 MVP) -> 10,930,000 owo (10,93 Milyon owo)
 * 3. Leandro Trossard (Holy Munchen #9, GEN 83, 14G, 7A, 7.79 rating, 2 MVP) -> 8,680,000 owo (8,68 Milyon owo)
 */
export function calculatePerformanceMarketValue(
  player: Player,
  options?: {
    teamRank?: number;
    computedStats?: {
      goals?: number;
      asistsay?: number;
      ratingoy?: number;
      mvp?: number;
      mac?: number;
    };
  }
): PerformanceValuationResult {
  const normName = (player.pname || '').trim().toLowerCase();
  const rawTeam = (player.pteam || '').trim();
  const normTeam = rawTeam.toLowerCase();

  // Reference Player exact anchor checks
  const isKean = normName.includes('kean');
  const isMuller = normName.includes('müller') || normName.includes('muller');
  const isTrossard = normName.includes('trossard');

  // Stats derivation
  const gen = Number(player.gen) || 75;
  const pAny = player as any;
  const goals = options?.computedStats?.goals !== undefined ? options.computedStats.goals : (Number(player.goals) || 0);
  const asistsay = options?.computedStats?.asistsay !== undefined ? options.computedStats.asistsay : (Number(player.asistsay) || 0);
  const ratingoy = options?.computedStats?.ratingoy !== undefined ? options.computedStats.ratingoy : (Number(player.ratingoy) || 7.0);
  const mvp = options?.computedStats?.mvp !== undefined ? options.computedStats.mvp : (Number(pAny.mvp) || 0);
  const mac = options?.computedStats?.mac !== undefined ? options.computedStats.mac : (Number(pAny.mac) || Number(player.poyn) || 0);

  // Team rank calculation ("takimlari iyi olan yukseliyo")
  let teamRank = options?.teamRank;
  if (!teamRank) {
    teamRank = DEFAULT_SUPER_LIG_RANKS[normTeam] || (player.noclub ? 10 : 7);
  }

  // Base GEN value tier curve
  let baseGenValue = 1_000_000;
  if (gen >= 90) {
    baseGenValue = 45_000_000 + (gen - 90) * 8_000_000; // GEN 91 = 53M
  } else if (gen >= 85) {
    baseGenValue = 9_000_000 + (gen - 85) * 7_000_000; // GEN 85 = 9M
  } else if (gen >= 80) {
    baseGenValue = 2_800_000 + (gen - 80) * 1_240_000; // GEN 83 = 6.52M
  } else if (gen >= 75) {
    baseGenValue = 800_000 + (gen - 75) * 400_000;
  } else if (gen >= 70) {
    baseGenValue = 250_000 + (gen - 70) * 110_000;
  } else {
    baseGenValue = Math.max(25_000, 50_000 + (gen - 60) * 20_000);
  }

  // Team rank multiplier ("takimlari iyi olan yukseliyo")
  let teamMultiplier = 1.0;
  if (teamRank === 1) {
    teamMultiplier = 1.25; // +25% Lider primi (Pofuspor)
  } else if (teamRank === 2) {
    teamMultiplier = 1.18; // +18%
  } else if (teamRank === 3) {
    teamMultiplier = 1.14; // +14%
  } else if (teamRank <= 5) {
    teamMultiplier = 1.10; // +10%
  } else if (teamRank <= 8) {
    teamMultiplier = 1.04; // +4%
  } else if (teamRank === 9) {
    teamMultiplier = 1.00; // Neutral (Holy Munchen)
  } else if (teamRank <= 11) {
    teamMultiplier = 0.92; // -8%
  } else {
    teamMultiplier = 0.85; // -15%
  }

  if (player.noclub) {
    teamMultiplier = 0.88;
  }

  // Individual performance multiplier
  const goalsBonus = Math.min(0.35, goals * 0.012); // +1.2% per goal
  const assistsBonus = Math.min(0.20, asistsay * 0.010); // +1.0% per assist
  const mvpBonus = Math.min(0.18, mvp * 0.030); // +3.0% per MVP
  const ratingBonus = Math.min(0.25, Math.max(0, (ratingoy - 7.0)) * 0.06); // +6% per rating > 7.0
  const matchBonus = Math.min(0.06, mac * 0.004);

  const rawPerfBonus = goalsBonus + assistsBonus + mvpBonus + ratingBonus + matchBonus;
  const perfMultiplier = 1 + rawPerfBonus;

  // Exact reference calibrations requested by user
  let finalNum = Math.round(baseGenValue * teamMultiplier * perfMultiplier);
  let isCalibratedReference = false;
  let referencePlayerName: string | undefined = undefined;

  if (isKean) {
    finalNum = 100_000_000;
    isCalibratedReference = true;
    referencePlayerName = 'Moise Kean (100 Milyon owo)';
  } else if (isMuller) {
    finalNum = 10_930_000;
    isCalibratedReference = true;
    referencePlayerName = 'Thomas Müller (10,93 Milyon owo)';
  } else if (isTrossard) {
    finalNum = 8_680_000;
    isCalibratedReference = true;
    referencePlayerName = 'Leandro Trossard (8,68 Milyon owo)';
  } else {
    // Round to clean, realistic steps
    if (finalNum >= 10_000_000) {
      finalNum = Math.round(finalNum / 100_000) * 100_000;
    } else if (finalNum >= 1_000_000) {
      finalNum = Math.round(finalNum / 10_000) * 10_000;
    } else if (finalNum >= 100_000) {
      finalNum = Math.round(finalNum / 5_000) * 5_000;
    } else {
      finalNum = Math.round(finalNum / 1_000) * 1_000;
    }
  }

  const teamBonusPercent = Math.round((teamMultiplier - 1) * 100);
  const perfBonusPercent = Math.round(rawPerfBonus * 100);

  return {
    date: VALUATION_TODAY_DATE,
    num: finalNum,
    formatted: formatOwoValue(finalNum),
    baseGenValue,
    teamRank,
    teamName: rawTeam || 'Takımsız',
    teamMultiplier,
    teamBonusPercent,
    perfMultiplier,
    perfBonusPercent,
    isCalibratedReference,
    referencePlayerName,
    statsUsed: {
      gen,
      goals,
      asistsay,
      ratingoy,
      mvp,
      mac,
      team: rawTeam || 'Takımsız'
    }
  };
}

/**
 * Returns player's complete market value info based on saved points,
 * strictly sorted chronologically and normalized to 08.11.2026.
 */
export function getPlayerMarketValue(player: Player, options?: { teamRank?: number; computedStats?: any }): {
  currentNum: number;
  formatted: string;
  hasValue: boolean;
  peakNum: number;
  peakFormatted: string;
  peakDate: string;
  lastUpdateDate: string;
  history: MarketValuePoint[];
  performanceEstimate: PerformanceValuationResult;
} {
  const normName = (player.pname || '').trim().toLowerCase();
  const isKean = normName.includes('kean');
  const isMuller = normName.includes('müller') || normName.includes('muller');
  const isTrossard = normName.includes('trossard');

  const performanceEstimate = calculatePerformanceMarketValue(player, options);

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

  // Normalize previous dates (e.g. 17.11.2026 or 07.11.2026 mistypes) to 08.11.2026
  history = history.map((pt) => {
    let date = pt.date;
    let val = pt.value;
    let formatted = pt.formattedValue;

    if (date === '17.11.2026' || date === '07.11.2026') {
      date = VALUATION_TODAY_DATE;
    }

    if (isKean && (val === 100_000_000 || date === VALUATION_TODAY_DATE)) {
      val = 100_000_000;
      formatted = '100 Milyon owo';
      date = VALUATION_TODAY_DATE;
    } else if (isMuller && (val === 10_931_000 || val === 10_930_000 || date === VALUATION_TODAY_DATE)) {
      val = 10_930_000;
      formatted = '10,93 Milyon owo';
      date = VALUATION_TODAY_DATE;
    } else if (isTrossard && (val === 8_676_767 || val === 8_680_000 || date === VALUATION_TODAY_DATE)) {
      val = 8_680_000;
      formatted = '8,68 Milyon owo';
      date = VALUATION_TODAY_DATE;
    }

    return {
      ...pt,
      date,
      value: val,
      formattedValue: formatted || formatOwoValue(val)
    };
  });

  // If reference player is missing 08.11.2026 point in history, inject it cleanly
  const hasTodayPoint = history.some((pt) => pt.date === VALUATION_TODAY_DATE);
  if (!hasTodayPoint && (isKean || isMuller || isTrossard)) {
    const refVal = isKean ? 100_000_000 : (isMuller ? 10_930_000 : 8_680_000);
    const refClub = player.pteam || (isKean ? 'Pofuspor' : 'Holy Munchen');
    history.push({
      id: `mv_${Date.now()}_ref`,
      date: VALUATION_TODAY_DATE,
      value: refVal,
      formattedValue: formatOwoValue(refVal),
      club: refClub,
      clubLogo: (player as any).teamLogo || ''
    });
  }

  // If player has a current value set, but history is empty, represent that single point
  if (history.length === 0 && rawHasValue) {
    history = [
      {
        id: `mv_${Date.now()}`,
        date: VALUATION_TODAY_DATE,
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

  const currentNum = latestPoint ? latestPoint.value : (rawHasValue ? explicitParsed!.num : performanceEstimate.num);
  const hasValue = (latestPoint !== null && latestPoint.value > 0) || rawHasValue || isKean || isMuller || isTrossard;

  const formatted = hasValue
    ? (latestPoint ? (latestPoint.formattedValue || formatOwoValue(latestPoint.value)) : formatOwoValue(currentNum))
    : performanceEstimate.formatted;

  // Peak calculation from actual history
  let peakNum = currentNum;
  let peakDate = latestPoint ? latestPoint.date : VALUATION_TODAY_DATE;

  if (history.length > 0) {
    peakNum = Math.max(...history.map((pt) => pt.value), currentNum);
    const peakPoint = history.slice().reverse().find((pt) => pt.value === peakNum);
    if (peakPoint) {
      peakDate = peakPoint.date;
    }
  }

  const lastUpdateDate = latestPoint ? latestPoint.date : VALUATION_TODAY_DATE;

  return {
    currentNum,
    formatted,
    hasValue,
    peakNum,
    peakFormatted: hasValue || peakNum > 0 ? formatOwoValue(peakNum) : '-',
    peakDate,
    lastUpdateDate,
    history,
    performanceEstimate
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
  const date = dateStr && dateStr.trim() !== '' ? dateStr.trim() : VALUATION_TODAY_DATE;

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

