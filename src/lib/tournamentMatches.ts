import { Match } from '../types';

export const LOCAL_TOURNAMENT_MATCHES_KEY = 'bobblekolik_tournament_matches';
export const LOCAL_BRACKETS_KEY = 'bobblekolik_bracket_data';

// Default tournament matches for BCL (UCL), BEL (UEL), and BECL (UECL)
export const DEFAULT_TOURNAMENT_MATCHES: Match[] = [
  // BCL (UCL) 4. Sezon
  {
    id: 'bcl_4_semi1',
    team1: 'Holy Munchen',
    team2: 'Pofuspor',
    category: 'BCL',
    season: 4 as any,
    round: 'semi1',
    hafta: 'Yarı Final 1',
    score1: '1',
    score2: '2',
    played: true,
    date: '20.06.2025',
    datejav: 1750410000000,
    ligm: false,
    timeline: []
  },
  {
    id: 'bcl_4_semi2',
    team1: 'Döner FC',
    team2: 'Leogard',
    category: 'BCL',
    season: 4 as any,
    round: 'semi2',
    hafta: 'Yarı Final 2',
    score1: '3',
    score2: '1',
    played: true,
    date: '21.06.2025',
    datejav: 1750496400000,
    ligm: false,
    timeline: []
  },
  {
    id: 'bcl_4_final',
    team1: 'Pofuspor',
    team2: 'Döner FC',
    category: 'BCL',
    season: 4 as any,
    round: 'final',
    hafta: 'Büyük Final',
    score1: '2',
    score2: '1',
    played: true,
    date: '28.06.2025',
    datejav: 1751101200000,
    ligm: false,
    timeline: []
  },

  // BECL (UECL) 4. Sezon
  {
    id: 'becl_4_semi1',
    team1: 'Hendrix United',
    team2: 'KFCelona',
    category: 'BECL',
    season: 4 as any,
    round: 'semi1',
    hafta: 'Yarı Final 1',
    score1: '0',
    score2: '2',
    played: true,
    date: '15.06.2025',
    datejav: 1749978000000,
    ligm: false,
    timeline: []
  },
  {
    id: 'becl_4_semi2',
    team1: 'Xeilmes',
    team2: 'Sp5der Jack',
    category: 'BECL',
    season: 4 as any,
    round: 'semi2',
    hafta: 'Yarı Final 2',
    score1: '1',
    score2: '3',
    played: true,
    date: '16.06.2025',
    datejav: 1750064400000,
    ligm: false,
    timeline: []
  },
  {
    id: 'becl_4_final',
    team1: 'KFCelona',
    team2: 'Sp5der Jack',
    category: 'BECL',
    season: 4 as any,
    round: 'final',
    hafta: 'Büyük Final',
    score1: '1',
    score2: '2',
    played: true,
    date: '22.06.2025',
    datejav: 1750582800000,
    ligm: false,
    timeline: []
  },

  // BEL (UEL) 5. Sezon
  {
    id: 'bel_5_semi1',
    team1: 'Xeilmes',
    team2: 'Sp5der Jack',
    category: 'BEL',
    season: 5 as any,
    round: 'semi1',
    hafta: 'Yarı Final 1',
    score1: '0',
    score2: '0',
    played: false,
    date: '20.10.2026',
    datejav: 1792486800000,
    ligm: false,
    timeline: []
  },
  {
    id: 'bel_5_semi2',
    team1: 'Realyon',
    team2: 'DeathEagle',
    category: 'BEL',
    season: 5 as any,
    round: 'semi2',
    hafta: 'Yarı Final 2',
    score1: '0',
    score2: '0',
    played: false,
    date: '21.10.2026',
    datejav: 1792573200000,
    ligm: false,
    timeline: []
  },

  // BECL (UECL) 5. Sezon
  {
    id: 'becl_5_semi1',
    team1: 'Holy Munchen',
    team2: 'Bobblica',
    category: 'BECL',
    season: 5 as any,
    round: 'semi1',
    hafta: 'Yarı Final 1',
    score1: '0',
    score2: '0',
    played: false,
    date: '22.10.2026',
    datejav: 1792659600000,
    ligm: false,
    timeline: []
  },
  {
    id: 'becl_5_semi2',
    team1: 'New Hollands',
    team2: 'Döner FC',
    category: 'BECL',
    season: 5 as any,
    round: 'semi2',
    hafta: 'Yarı Final 2',
    score1: '0',
    score2: '0',
    played: false,
    date: '23.10.2026',
    datejav: 1792746000000,
    ligm: false,
    timeline: []
  },

  // BCL (UCL) 5. Sezon
  {
    id: 'bcl_5_semi1',
    team1: 'Holy Munchen',
    team2: 'Leogard',
    category: 'BCL',
    season: 5 as any,
    round: 'semi1',
    hafta: 'Yarı Final 1',
    score1: '0',
    score2: '0',
    played: false,
    date: '24.10.2026',
    datejav: 1792832400000,
    ligm: false,
    timeline: []
  },
  {
    id: 'bcl_5_semi2',
    team1: 'Pofuspor',
    team2: 'Döner FC',
    category: 'BCL',
    season: 5 as any,
    round: 'semi2',
    hafta: 'Yarı Final 2',
    score1: '0',
    score2: '0',
    played: false,
    date: '25.10.2026',
    datejav: 1792918800000,
    ligm: false,
    timeline: []
  }
];

export const getStoredTournamentMatches = (): Match[] => {
  try {
    const raw = localStorage.getItem(LOCAL_TOURNAMENT_MATCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

export const saveStoredTournamentMatch = (match: Match) => {
  try {
    const current = getStoredTournamentMatches();
    const idx = current.findIndex((m) => m.id === match.id);
    if (idx >= 0) {
      current[idx] = match;
    } else {
      current.push(match);
    }
    localStorage.setItem(LOCAL_TOURNAMENT_MATCHES_KEY, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent('tournament_matches_updated', { detail: match }));
  } catch (e) {
    console.error('Failed to save tournament match to localStorage', e);
  }
};

export const removeStoredTournamentMatch = (matchId: string) => {
  try {
    const current = getStoredTournamentMatches().filter((m) => m.id !== matchId);
    localStorage.setItem(LOCAL_TOURNAMENT_MATCHES_KEY, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent('tournament_matches_updated', { detail: { removedId: matchId } }));
  } catch (e) {
    console.error('Failed to remove tournament match from localStorage', e);
  }
};

export const getStoredBracketData = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(LOCAL_BRACKETS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
};

export const saveStoredBracketData = (updates: Record<string, string>) => {
  try {
    const current = getStoredBracketData();
    const merged = { ...current, ...updates };
    localStorage.setItem(LOCAL_BRACKETS_KEY, JSON.stringify(merged));
  } catch (e) {
    console.error('Failed to save bracket data to localStorage', e);
  }
};

export const normalizeCupKey = (cat?: string, hStr?: string): 'bcl' | 'bel' | 'becl' | 'wpc' | '' => {
  const c = String(cat || '').toUpperCase();
  const h = String(hStr || '').toUpperCase();
  if (c.includes('BCL') || c.includes('UCL') || c.includes('CHAMPIONS') || h.includes('BCL') || h.includes('UCL')) return 'bcl';
  if (c.includes('BEL') || c.includes('UEL') || c.includes('EUROPA') || h.includes('BEL') || h.includes('UEL')) return 'bel';
  if (c.includes('BECL') || c.includes('UECL') || c.includes('CONFERENCE') || h.includes('BECL') || h.includes('UECL')) return 'becl';
  if (c.includes('WPC') || c.includes('TURNUVA') || c.includes('WORLD PEACE') || h.includes('WPC') || h.includes('WORLD PEACE')) return 'wpc';
  return '';
};

/**
 * Merges raw matches from Firestore with locally stored tournament matches and DEFAULT_TOURNAMENT_MATCHES.
 * Ensures all bracket matches are visible and included in ELO calculations.
 */
export function mergeTournamentMatches(firestoreMatches: Match[]): Match[] {
  const map = new Map<string, Match>();
  const slotToMatch = new Map<string, Match>();

  // 1. Load firestore matches first
  (firestoreMatches || []).forEach((m) => {
    const id = m.id || `${m.team1}-vs-${m.team2}-${m.datejav}`;
    map.set(id, { ...m, id });

    const cup = normalizeCupKey(m.category, m.hafta);
    const season = (m as any).season;
    const round = (m as any).round;
    if (cup && season && round) {
      slotToMatch.set(`${cup}_${season}_${round}`, { ...m, id });
    }
  });

  // 2. Overlay locally stored tournament matches (recent local user edits)
  const localM = getStoredTournamentMatches();
  localM.forEach((lm) => {
    const id = lm.id || `${lm.team1}-vs-${lm.team2}-${lm.datejav}`;
    const existing = map.get(id);
    if (!existing || (!existing.played && lm.played) || (Number(lm.datejav) || 0) >= (Number(existing.datejav) || 0)) {
      map.set(id, { ...lm, id });
      const cup = normalizeCupKey(lm.category, lm.hafta);
      const season = (lm as any).season;
      const round = (lm as any).round;
      if (cup && season && round) {
        slotToMatch.set(`${cup}_${season}_${round}`, { ...lm, id });
      }
    }
  });

  // 3. Include default tournament matches if not present in firestore or local
  DEFAULT_TOURNAMENT_MATCHES.forEach((dm) => {
    const cup = normalizeCupKey(dm.category, dm.hafta);
    const season = (dm as any).season;
    const round = (dm as any).round;
    const slotKey = `${cup}_${season}_${round}`;

    const hasById = map.has(dm.id);
    const hasBySlot = slotToMatch.has(slotKey);

    if (!hasById && !hasBySlot) {
      map.set(dm.id, dm);
      if (slotKey) {
        slotToMatch.set(slotKey, dm);
      }
    }
  });

  return Array.from(map.values());
}

/**
 * Returns tournament information and ELO multiplier
 */
export function getTournamentInfo(cupKey: 'bcl' | 'bel' | 'becl' | 'wpc' | string): {
  multiplier: number;
  cupTitle: string;
  shortName: string;
  badgeBg: string;
  borderColor: string;
} {
  const k = cupKey.toLowerCase();
  if (k === 'bcl' || k.includes('bcl') || k.includes('ucl')) {
    return {
      multiplier: 1.75,
      cupTitle: 'BCL / UCL (Bobble Şampiyonlar Ligi)',
      shortName: 'BCL',
      badgeBg: 'bg-blue-600',
      borderColor: 'border-blue-400'
    };
  }
  if (k === 'bel' || k.includes('bel') || k.includes('uel')) {
    return {
      multiplier: 1.5,
      cupTitle: 'BEL / UEL (Bobble Avrupa Ligi)',
      shortName: 'BEL',
      badgeBg: 'bg-amber-600',
      borderColor: 'border-amber-400'
    };
  }
  if (k === 'becl' || k.includes('becl') || k.includes('uecl')) {
    return {
      multiplier: 1.25,
      cupTitle: 'BECL / UECL (Bobble Konferans Ligi)',
      shortName: 'BECL',
      badgeBg: 'bg-emerald-600',
      borderColor: 'border-emerald-400'
    };
  }
  if (k === 'wpc' || k.includes('wpc') || k.includes('turnuva')) {
    return {
      multiplier: 0.5,
      cupTitle: 'World Peace Cup (Turnuva)',
      shortName: 'WPC',
      badgeBg: 'bg-purple-600',
      borderColor: 'border-purple-400'
    };
  }
  return {
    multiplier: 1.0,
    cupTitle: 'Süper Lig Maçı',
    shortName: 'LİG',
    badgeBg: 'bg-gray-600',
    borderColor: 'border-gray-400'
  };
}
