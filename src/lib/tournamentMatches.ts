import { Match } from '../types';

export const LOCAL_TOURNAMENT_MATCHES_KEY = 'bobblekolik_tournament_matches';
export const LOCAL_DELETED_TOURNAMENT_MATCHES_KEY = 'bobblekolik_deleted_tournament_matches';
export const LOCAL_BRACKETS_KEY = 'bobblekolik_bracket_data';

// Dummy Season 4 match IDs that should never resurrect automatically
export const PURGED_SEASON_4_MATCH_IDS = [
  'bcl_4_semi1',
  'bcl_4_semi2',
  'bcl_4_final',
  'becl_4_semi1',
  'becl_4_semi2',
  'becl_4_final'
];

// No hardcoded default matches that resurrect on their own
export const DEFAULT_TOURNAMENT_MATCHES: Match[] = [];

export const getDeletedTournamentMatchIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(LOCAL_DELETED_TOURNAMENT_MATCHES_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    // Ensure purged season 4 matches are always included in deleted set
    PURGED_SEASON_4_MATCH_IDS.forEach(id => {
      if (!list.includes(id)) list.push(id);
    });
    return new Set(list);
  } catch (e) {
    return new Set(PURGED_SEASON_4_MATCH_IDS);
  }
};

export const addDeletedTournamentMatchId = (matchId: string) => {
  try {
    const set = getDeletedTournamentMatchIds();
    set.add(matchId);
    localStorage.setItem(LOCAL_DELETED_TOURNAMENT_MATCHES_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.error('Failed to save deleted tournament match ID', e);
  }
};

export const clearDeletedTournamentMatchId = (matchId: string) => {
  try {
    const set = getDeletedTournamentMatchIds();
    set.delete(matchId);
    localStorage.setItem(LOCAL_DELETED_TOURNAMENT_MATCHES_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.error('Failed to clear deleted tournament match ID', e);
  }
};

export const getStoredTournamentMatches = (): Match[] => {
  try {
    const raw = localStorage.getItem(LOCAL_TOURNAMENT_MATCHES_KEY);
    const list: Match[] = raw ? JSON.parse(raw) : [];
    const deletedIds = getDeletedTournamentMatchIds();
    // Filter out deleted matches
    return list.filter(m => m && m.id && !deletedIds.has(m.id) && !PURGED_SEASON_4_MATCH_IDS.includes(m.id));
  } catch (e) {
    return [];
  }
};

export const normalizeTeamName = (raw?: string): string => {
  if (!raw) return '';
  const s = raw.trim();
  if (s.toLowerCase() === 'kfcelona') return 'KFCspor';
  return s;
};

export const saveStoredTournamentMatch = (match: Match) => {
  try {
    const current = getStoredTournamentMatches();
    const cleanMatch: Match = {
      ...match,
      team1: normalizeTeamName(match.team1),
      team2: normalizeTeamName(match.team2)
    };
    // If saving this match, ensure it is un-flagged from deleted
    if (cleanMatch.id) {
      clearDeletedTournamentMatchId(cleanMatch.id);
    }
    const idx = current.findIndex((m) => m.id === cleanMatch.id);
    if (idx >= 0) {
      current[idx] = cleanMatch;
    } else {
      current.push(cleanMatch);
    }
    localStorage.setItem(LOCAL_TOURNAMENT_MATCHES_KEY, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent('tournament_matches_updated', { detail: cleanMatch }));
  } catch (e) {
    console.error('Failed to save tournament match to localStorage', e);
  }
};

export const removeStoredTournamentMatch = (matchId: string) => {
  try {
    addDeletedTournamentMatchId(matchId);
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
    const cleanUpdates: Record<string, string> = {};
    Object.entries(updates).forEach(([k, v]) => {
      cleanUpdates[k] = normalizeTeamName(v);
    });
    const merged = { ...current, ...cleanUpdates };
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
  const deletedIds = getDeletedTournamentMatchIds();

  // 1. Load firestore matches first (ignoring any match that was deleted or purged)
  (firestoreMatches || []).forEach((m) => {
    const id = m.id || `${m.team1}-vs-${m.team2}-${m.datejav}`;
    if (deletedIds.has(id) || PURGED_SEASON_4_MATCH_IDS.includes(id)) {
      return;
    }

    const cleanM: Match = {
      ...m,
      id,
      team1: normalizeTeamName(m.team1),
      team2: normalizeTeamName(m.team2)
    };
    map.set(id, cleanM);

    const cup = normalizeCupKey(cleanM.category, cleanM.hafta);
    const season = (cleanM as any).season;
    const round = (cleanM as any).round;
    if (cup && season && round) {
      slotToMatch.set(`${cup}_${season}_${round}`, cleanM);
    }
  });

  // 2. Overlay locally stored tournament matches (recent local user edits)
  const localM = getStoredTournamentMatches();
  localM.forEach((lm) => {
    const id = lm.id || `${lm.team1}-vs-${lm.team2}-${lm.datejav}`;
    if (deletedIds.has(id) || PURGED_SEASON_4_MATCH_IDS.includes(id)) {
      return;
    }

    const cleanLM: Match = {
      ...lm,
      id,
      team1: normalizeTeamName(lm.team1),
      team2: normalizeTeamName(lm.team2)
    };

    const cup = normalizeCupKey(cleanLM.category, cleanLM.hafta);
    const season = (cleanLM as any).season;
    const round = (cleanLM as any).round;
    const slotKey = (cup && season && round) ? `${cup}_${season}_${round}` : '';

    const existing = map.get(id) || (slotKey ? slotToMatch.get(slotKey) : undefined);

    // Deep merge: preserve mvp, rating, timeline, and lineup from whichever source has them!
    const effectiveMvp = (cleanLM.mvp && String(cleanLM.mvp).trim() !== '' && String(cleanLM.mvp).trim() !== '-')
      ? String(cleanLM.mvp).trim()
      : (existing?.mvp && String(existing.mvp).trim() !== '' && String(existing.mvp).trim() !== '-')
      ? String(existing.mvp).trim()
      : undefined;

    const effectiveRating = (cleanLM.rating && String(cleanLM.rating).trim() !== '')
      ? String(cleanLM.rating).trim()
      : existing?.rating;

    const effectiveTimeline = (cleanLM.timeline && cleanLM.timeline.length > 0)
      ? cleanLM.timeline
      : (existing?.timeline && existing.timeline.length > 0)
      ? existing.timeline
      : [];

    const effectiveLineup = (cleanLM.lineup && Object.keys(cleanLM.lineup).length > 0)
      ? cleanLM.lineup
      : (existing?.lineup && Object.keys(existing.lineup).length > 0)
      ? existing.lineup
      : {};

    const mergedMatch: Match = {
      ...(existing || {}),
      ...cleanLM,
      id: cleanLM.id || existing?.id || id,
      team1: normalizeTeamName(cleanLM.team1 || existing?.team1),
      team2: normalizeTeamName(cleanLM.team2 || existing?.team2),
      mvp: effectiveMvp,
      rating: effectiveRating,
      timeline: effectiveTimeline,
      lineup: effectiveLineup,
      played: cleanLM.played !== undefined ? Boolean(cleanLM.played) : Boolean(existing?.played),
      score1: cleanLM.score1 !== undefined ? String(cleanLM.score1) : existing?.score1 !== undefined ? String(existing.score1) : '0',
      score2: cleanLM.score2 !== undefined ? String(cleanLM.score2) : existing?.score2 !== undefined ? String(existing.score2) : '0',
    };

    map.set(mergedMatch.id || id, mergedMatch);
    if (slotKey) {
      slotToMatch.set(slotKey, mergedMatch);
    }
  });

  // 3. Include default tournament matches if any remain and not deleted
  DEFAULT_TOURNAMENT_MATCHES.forEach((dm) => {
    if (deletedIds.has(dm.id) || PURGED_SEASON_4_MATCH_IDS.includes(dm.id)) {
      return;
    }
    const cup = normalizeCupKey(dm.category, dm.hafta);
    const season = (dm as any).season;
    const round = (dm as any).round;
    const slotKey = `${cup}_${season}_${round}`;

    const hasById = map.has(dm.id);
    const hasBySlot = slotToMatch.has(slotKey);

    if (!hasById && !hasBySlot) {
      const cleanDM: Match = {
        ...dm,
        team1: normalizeTeamName(dm.team1),
        team2: normalizeTeamName(dm.team2)
      };
      map.set(dm.id, cleanDM);
      if (slotKey) {
        slotToMatch.set(slotKey, cleanDM);
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
