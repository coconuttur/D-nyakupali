import { DuelMatch, Player } from '../types';

export const INITIAL_DUEL_ELO = 100;
export const DUEL_ELO_K = 16; // Gives +-8 for equal ratings win: 16 * (1 - 0.5) = 8

export interface DuelEloMatchDelta {
  matchId: string;
  matchNumber?: number;
  player1Name: string;
  player2Name: string;
  p1Before: number;
  p2Before: number;
  p1Delta: number;
  p2Delta: number;
  p1After: number;
  p2After: number;
  expected1: number;
  expected2: number;
  score1: number;
  score2: number;
}

export interface DuelEloMatchHistoryItem {
  matchId: string;
  matchNumber?: number;
  opponentName: string;
  opponentTeam?: string;
  opponentPhoto?: string;
  myScore: number;
  oppScore: number;
  result: 'W' | 'D' | 'L';
  delta: number;
  beforeElo: number;
  afterElo: number;
  date?: string;
}

export interface DuelPlayerEloStanding {
  playerId: string;
  playerName: string;
  playerPhoto: string;
  playerTeam: string;
  elo: number;
  initialElo: number;
  totalChange: number;
  lastDelta: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number; // 0 - 100 percentage
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  peakElo: number;
  lowestElo: number;
  recentHistory: DuelEloMatchHistoryItem[];
}

/**
 * Calculates Expected Score according to Chess.com / FIDE Elo formula:
 * E_A = 1 / (1 + 10^((R_B - R_A) / 400))
 */
export function getExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculates symmetric integer delta for a duel match according to chess.com-like Elo rules.
 * - Equal ratings: Win -> +8 / -8, Draw -> 0 / 0 ("beraberde yok")
 * - Rating difference:
 *   - Underdog win yields higher gain (+9, +10, +12...), favorite loses equal amount.
 *   - Favorite win yields smaller gain (+7, +6, +5...), underdog loses equal amount.
 *   - Draw: Underdog gains elo (less than win), favorite loses equal amount.
 */
export function calculateMatchEloDelta(
  r1: number,
  r2: number,
  score1: number,
  score2: number,
  kFactor: number = DUEL_ELO_K
): { delta1: number; delta2: number; exp1: number; exp2: number } {
  const exp1 = getExpectedScore(r1, r2);
  const exp2 = 1 - exp1;

  let actual1 = 0.5;
  if (score1 > score2) actual1 = 1.0;
  else if (score2 > score1) actual1 = 0.0;

  // Raw delta for player 1
  const rawDelta1 = kFactor * (actual1 - exp1);
  let delta1 = Math.round(rawDelta1);

  // Guarantee minimum 1 point swing for a decisive victory
  if (actual1 === 1.0 && delta1 < 1) {
    delta1 = 1;
  } else if (actual1 === 0.0 && delta1 > -1) {
    delta1 = -1;
  }

  // Strictly zero-sum conservation
  const delta2 = -delta1;

  return { delta1, delta2, exp1, exp2 };
}

/**
 * Sorts duels chronologically for ELO calculation:
 * - Duels with matchNumber are ordered ascending by matchNumber (1, 2, 3...)
 * - Fallback to datejav / timestamp for unnumbered duels
 */
export function sortDuelsForElo(duels: DuelMatch[]): DuelMatch[] {
  return [...duels].sort((a, b) => {
    const numA = a.matchNumber !== undefined && a.matchNumber !== null && !isNaN(Number(a.matchNumber))
      ? Number(a.matchNumber)
      : null;
    const numB = b.matchNumber !== undefined && b.matchNumber !== null && !isNaN(Number(b.matchNumber))
      ? Number(b.matchNumber)
      : null;

    if (numA !== null && numB !== null) {
      if (numA !== numB) return numA - numB;
      return (Number(a.datejav) || 0) - (Number(b.datejav) || 0);
    }
    if (numA !== null && numB === null) return -1;
    if (numA === null && numB !== null) return 1;

    return (Number(a.datejav) || 0) - (Number(b.datejav) || 0);
  });
}

/**
 * Calculates complete Elo stats, match deltas, and player standings.
 */
export function calculateAllDuelElo(
  players: Player[],
  duels: DuelMatch[],
  playerMap?: Map<string, Player>
): {
  matchDeltas: Map<string, DuelEloMatchDelta>;
  standings: DuelPlayerEloStanding[];
  maxMatchNumber: number;
} {
  // 1. Initialize player Elo states with 100
  const eloMap = new Map<string, number>();
  const statsMap = new Map<string, {
    playerId: string;
    playerName: string;
    playerPhoto: string;
    playerTeam: string;
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    peakElo: number;
    lowestElo: number;
    lastDelta: number;
    history: DuelEloMatchHistoryItem[];
  }>();

  // Seed with all known players
  players.forEach((p) => {
    const key = p.pname.trim();
    eloMap.set(key, INITIAL_DUEL_ELO);
    statsMap.set(key, {
      playerId: p.docId || p.id || p.pname,
      playerName: p.pname,
      playerPhoto: p.foto || '',
      playerTeam: p.pteam || 'Serbest',
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      peakElo: INITIAL_DUEL_ELO,
      lowestElo: INITIAL_DUEL_ELO,
      lastDelta: 0,
      history: []
    });
  });

  // 2. Sort matches chronologically by matchNumber / datejav
  const orderedDuels = sortDuelsForElo(duels);
  const matchDeltas = new Map<string, DuelEloMatchDelta>();

  let maxMatchNumber = 0;

  // 3. Process matches sequentially
  orderedDuels.forEach((d) => {
    if (d.matchNumber !== undefined && d.matchNumber !== null && !isNaN(Number(d.matchNumber))) {
      maxMatchNumber = Math.max(maxMatchNumber, Number(d.matchNumber));
    }

    const p1Key = d.player1Name.trim();
    const p2Key = d.player2Name.trim();

    // Ensure player exists in statsMap
    if (!statsMap.has(p1Key)) {
      eloMap.set(p1Key, INITIAL_DUEL_ELO);
      const p1Obj = playerMap?.get(p1Key.toLowerCase());
      statsMap.set(p1Key, {
        playerId: d.player1Id || p1Obj?.docId || p1Obj?.id || p1Key,
        playerName: d.player1Name,
        playerPhoto: d.player1Photo || p1Obj?.foto || '',
        playerTeam: d.player1Team || p1Obj?.pteam || 'Serbest',
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        peakElo: INITIAL_DUEL_ELO,
        lowestElo: INITIAL_DUEL_ELO,
        lastDelta: 0,
        history: []
      });
    }

    if (!statsMap.has(p2Key)) {
      eloMap.set(p2Key, INITIAL_DUEL_ELO);
      const p2Obj = playerMap?.get(p2Key.toLowerCase());
      statsMap.set(p2Key, {
        playerId: d.player2Id || p2Obj?.docId || p2Obj?.id || p2Key,
        playerName: d.player2Name,
        playerPhoto: d.player2Photo || p2Obj?.foto || '',
        playerTeam: d.player2Team || p2Obj?.pteam || 'Serbest',
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        peakElo: INITIAL_DUEL_ELO,
        lowestElo: INITIAL_DUEL_ELO,
        lastDelta: 0,
        history: []
      });
    }

    const r1 = eloMap.get(p1Key) ?? INITIAL_DUEL_ELO;
    const r2 = eloMap.get(p2Key) ?? INITIAL_DUEL_ELO;
    const sc1 = Number(d.score1) || 0;
    const sc2 = Number(d.score2) || 0;

    const { delta1, delta2, exp1, exp2 } = calculateMatchEloDelta(r1, r2, sc1, sc2);

    const newR1 = r1 + delta1;
    const newR2 = r2 + delta2;

    eloMap.set(p1Key, newR1);
    eloMap.set(p2Key, newR2);

    const matchDeltaRecord: DuelEloMatchDelta = {
      matchId: d.id,
      matchNumber: d.matchNumber !== undefined && d.matchNumber !== null ? Number(d.matchNumber) : undefined,
      player1Name: d.player1Name,
      player2Name: d.player2Name,
      p1Before: r1,
      p2Before: r2,
      p1Delta: delta1,
      p2Delta: delta2,
      p1After: newR1,
      p2After: newR2,
      expected1: exp1,
      expected2: exp2,
      score1: sc1,
      score2: sc2
    };

    matchDeltas.set(d.id, matchDeltaRecord);

    // Update cumulative player stats
    const s1 = statsMap.get(p1Key)!;
    const s2 = statsMap.get(p2Key)!;

    s1.played += 1;
    s2.played += 1;
    s1.goalsFor += sc1;
    s1.goalsAgainst += sc2;
    s2.goalsFor += sc2;
    s2.goalsAgainst += sc1;
    s1.lastDelta = delta1;
    s2.lastDelta = delta2;

    s1.peakElo = Math.max(s1.peakElo, newR1);
    s1.lowestElo = Math.min(s1.lowestElo, newR1);
    s2.peakElo = Math.max(s2.peakElo, newR2);
    s2.lowestElo = Math.min(s2.lowestElo, newR2);

    let res1: 'W' | 'D' | 'L' = 'D';
    let res2: 'W' | 'D' | 'L' = 'D';

    if (sc1 > sc2) {
      s1.wins += 1;
      s2.losses += 1;
      res1 = 'W';
      res2 = 'L';
    } else if (sc2 > sc1) {
      s2.wins += 1;
      s1.losses += 1;
      res2 = 'W';
      res1 = 'L';
    } else {
      s1.draws += 1;
      s2.draws += 1;
    }

    s1.history.push({
      matchId: d.id,
      matchNumber: d.matchNumber,
      opponentName: d.player2Name,
      opponentTeam: d.player2Team,
      opponentPhoto: d.player2Photo,
      myScore: sc1,
      oppScore: sc2,
      result: res1,
      delta: delta1,
      beforeElo: r1,
      afterElo: newR1,
      date: d.date
    });

    s2.history.push({
      matchId: d.id,
      matchNumber: d.matchNumber,
      opponentName: d.player1Name,
      opponentTeam: d.player1Team,
      opponentPhoto: d.player1Photo,
      myScore: sc2,
      oppScore: sc1,
      result: res2,
      delta: delta2,
      beforeElo: r2,
      afterElo: newR2,
      date: d.date
    });
  });

  // 4. Construct sorted standings list
  const standings: DuelPlayerEloStanding[] = Array.from(statsMap.values()).map((st) => {
    const currentElo = eloMap.get(st.playerName.trim()) ?? INITIAL_DUEL_ELO;
    const totalChange = currentElo - INITIAL_DUEL_ELO;
    const winRate = st.played > 0 ? Math.round((st.wins / st.played) * 100) : 0;
    const goalDiff = st.goalsFor - st.goalsAgainst;

    return {
      playerId: st.playerId,
      playerName: st.playerName,
      playerPhoto: st.playerPhoto,
      playerTeam: st.playerTeam,
      elo: currentElo,
      initialElo: INITIAL_DUEL_ELO,
      totalChange,
      lastDelta: st.lastDelta,
      played: st.played,
      wins: st.wins,
      draws: st.draws,
      losses: st.losses,
      winRate,
      goalsFor: st.goalsFor,
      goalsAgainst: st.goalsAgainst,
      goalDifference: goalDiff,
      peakElo: st.peakElo,
      lowestElo: st.lowestElo,
      recentHistory: [...st.history].reverse() // latest match first
    };
  });

  // Sort by ELO descending, then by wins, then goal difference, then name
  standings.sort((a, b) => {
    if (b.elo !== a.elo) return b.elo - a.elo;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.playerName.localeCompare(b.playerName, 'tr');
  });

  return {
    matchDeltas,
    standings,
    maxMatchNumber
  };
}
