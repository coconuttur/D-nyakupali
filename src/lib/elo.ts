import { Match, Team } from '../types';
import { getAllSeasonMatches } from './fixtureGenerator';

export interface EloMatchLog {
  matchId: string;
  opponent: string;
  opponentLogo?: string;
  isHome: boolean;
  scoreDisplay: string;
  teamGoals: number;
  oppGoals: number;
  result: 'W' | 'D' | 'L';
  category: string;
  multiplier: number;
  goalDiff: number;
  baseScore: number;
  eloDelta: number;
  cumulativeElo: number;
  date?: string;
  hafta?: string | number;
}

export interface TeamEloStats {
  teamName: string;
  logo: string;
  elo: number;
  eloDelta: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  form: ('W' | 'D' | 'L')[];
  matchLogs: EloMatchLog[];
}

export interface MatchPrediction {
  matchId: string;
  hafta: number | string;
  date?: string;
  team1: string;
  team2: string;
  team1Logo?: string;
  team2Logo?: string;
  team1Elo: number;
  team2Elo: number;
  prob1: number; // 0 to 100
  probDraw: number; // 0 to 100
  prob2: number; // 0 to 100
  predictedScore1: number;
  predictedScore2: number;
  predictedWinner: 'team1' | 'draw' | 'team2';
  expectedPoints1: number;
  expectedPoints2: number;
  iyScore?: string;
}

export interface SimulatedStanding {
  rank: number;
  teamName: string;
  logo: string;
  currentPoints: number;
  currentPlayed: number;
  simulatedPoints: number;
  totalProjectedPoints: number;
  simulatedWins: number;
  simulatedDraws: number;
  simulatedLosses: number;
  simulatedGoalsFor: number;
  simulatedGoalsAgainst: number;
  totalProjectedGoalDiff: number;
  championshipProbability: number; // 0 to 100 %
  elo: number;
}

export const BASE_ELO = 1000;

/**
 * Returns importance multiplier based on category
 * UCL: 1.75, UEL: 1.5, UECL: 1.25, TURNUVA / World Peace Cup: 0.5, LİG / Normal: 1.0
 */
export function getMatchMultiplier(category?: string, isWorldCup?: boolean): { multiplier: number; label: string } {
  if (isWorldCup) {
    return { multiplier: 0.5, label: 'TURNUVA (0.5x)' };
  }
  const cat = (category || '').toUpperCase().trim();
  if (cat.includes('UCL') || cat.includes('CHAMPIONS')) {
    return { multiplier: 1.75, label: 'UCL (1.75x)' };
  }
  if (cat.includes('UECL') || cat.includes('CONFERENCE')) {
    return { multiplier: 1.25, label: 'UECL (1.25x)' };
  }
  if (cat.includes('UEL') || cat.includes('EUROPA')) {
    return { multiplier: 1.5, label: 'UEL (1.5x)' };
  }
  if (cat.includes('TURNUVA') || cat.includes('CUP') || cat.includes('WORLD PEACE')) {
    return { multiplier: 0.5, label: 'TURNUVA (0.5x)' };
  }
  return { multiplier: 1.0, label: 'LİG MAÇI (1.0x)' };
}

/**
 * Calculates match result ELO components for a team
 * Win: +3 + (diff * 0.3)
 * Draw: +1
 * Loss: -3 - (diff * 0.3)
 */
export function calculateMatchScore(teamGoals: number, oppGoals: number): {
  result: 'W' | 'D' | 'L';
  baseScore: number;
  goalDiff: number;
} {
  const goalDiff = Math.abs(teamGoals - oppGoals);
  if (teamGoals > oppGoals) {
    return {
      result: 'W',
      baseScore: 3 + goalDiff * 0.3,
      goalDiff,
    };
  } else if (teamGoals === oppGoals) {
    return {
      result: 'D',
      baseScore: 1.0,
      goalDiff: 0,
    };
  } else {
    return {
      result: 'L',
      baseScore: -3 - goalDiff * 0.3,
      goalDiff,
    };
  }
}

/**
 * Normalizes team names across doc IDs and display names
 */
export function buildTeamNameResolver(teams: Team[]): (rawName: string) => string {
  const map = new Map<string, string>();
  teams.forEach((t) => {
    const primary = (t.name || '').trim();
    if (primary) {
      map.set(primary.toLowerCase(), primary);
    }
  });
  return (rawName: string) => {
    const trimmed = (rawName || '').trim();
    if (!trimmed) return rawName;
    return map.get(trimmed.toLowerCase()) || trimmed;
  };
}

/**
 * Computes all team ELO stats from matches and teams
 */
export function calculateAllTeamsElo(
  teams: Team[],
  matches: Match[],
  teamLogos: Record<string, string> = {}
): Record<string, TeamEloStats> {
  const resolveTeam = buildTeamNameResolver(teams);

  // Initialize all known teams with baseline 1000 Elo
  const statsMap: Record<string, TeamEloStats> = {};
  teams.forEach((t) => {
    const name = t.name.trim();
    if (!name) return;
    statsMap[name] = {
      teamName: name,
      logo: t.logo || teamLogos[name] || '',
      elo: BASE_ELO,
      eloDelta: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      form: [],
      matchLogs: [],
    };
  });

  // Sort played matches chronologically if possible
  const playedMatches = matches
    .filter((m) => m.played)
    .sort((a, b) => (Number(a.datejav) || 0) - (Number(b.datejav) || 0));

  playedMatches.forEach((m) => {
    const t1Raw = (m.team1 || '').trim();
    const t2Raw = (m.team2 || '').trim();
    if (!t1Raw || !t2Raw) return;

    const t1 = resolveTeam(t1Raw);
    const t2 = resolveTeam(t2Raw);

    // Ensure entries exist
    if (!statsMap[t1]) {
      statsMap[t1] = {
        teamName: t1,
        logo: teamLogos[t1] || '',
        elo: BASE_ELO,
        eloDelta: 0,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        form: [],
        matchLogs: [],
      };
    }
    if (!statsMap[t2]) {
      statsMap[t2] = {
        teamName: t2,
        logo: teamLogos[t2] || '',
        elo: BASE_ELO,
        eloDelta: 0,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        form: [],
        matchLogs: [],
      };
    }

    const s1 = Number(m.score1) || 0;
    const s2 = Number(m.score2) || 0;

    const { multiplier, label: catLabel } = getMatchMultiplier(m.category, (m as any).isWorldCup);

    const res1 = calculateMatchScore(s1, s2);
    const res2 = calculateMatchScore(s2, s1);

    const delta1 = Number((res1.baseScore * multiplier).toFixed(2));
    const delta2 = Number((res2.baseScore * multiplier).toFixed(2));

    // Update Team 1
    const st1 = statsMap[t1];
    st1.played += 1;
    st1.goalsFor += s1;
    st1.goalsAgainst += s2;
    st1.goalDiff = st1.goalsFor - st1.goalsAgainst;
    st1.elo += delta1;
    st1.eloDelta += delta1;
    if (res1.result === 'W') st1.wins += 1;
    else if (res1.result === 'D') st1.draws += 1;
    else st1.losses += 1;
    st1.form.push(res1.result);

    st1.matchLogs.push({
      matchId: m.id || `${t1}-${t2}-${m.hafta}`,
      opponent: t2,
      opponentLogo: statsMap[t2]?.logo || teamLogos[t2],
      isHome: true,
      scoreDisplay: `${s1} - ${s2}`,
      teamGoals: s1,
      oppGoals: s2,
      result: res1.result,
      category: catLabel,
      multiplier,
      goalDiff: res1.goalDiff,
      baseScore: res1.baseScore,
      eloDelta: delta1,
      cumulativeElo: Number(st1.elo.toFixed(1)),
      date: m.date,
      hafta: m.hafta,
    });

    // Update Team 2
    const st2 = statsMap[t2];
    st2.played += 1;
    st2.goalsFor += s2;
    st2.goalsAgainst += s1;
    st2.goalDiff = st2.goalsFor - st2.goalsAgainst;
    st2.elo += delta2;
    st2.eloDelta += delta2;
    if (res2.result === 'W') st2.wins += 1;
    else if (res2.result === 'D') st2.draws += 1;
    else st2.losses += 1;
    st2.form.push(res2.result);

    st2.matchLogs.push({
      matchId: m.id || `${t2}-${t1}-${m.hafta}`,
      opponent: t1,
      opponentLogo: statsMap[t1]?.logo || teamLogos[t1],
      isHome: false,
      scoreDisplay: `${s2} - ${s1}`,
      teamGoals: s2,
      oppGoals: s1,
      result: res2.result,
      category: catLabel,
      multiplier,
      goalDiff: res2.goalDiff,
      baseScore: res2.baseScore,
      eloDelta: delta2,
      cumulativeElo: Number(st2.elo.toFixed(1)),
      date: m.date,
      hafta: m.hafta,
    });
  });

  // Format final numbers & trim form to last 5
  Object.values(statsMap).forEach((st) => {
    st.elo = Number(st.elo.toFixed(1));
    st.eloDelta = Number(st.eloDelta.toFixed(1));
    st.form = st.form.slice(-5);
  });

  return statsMap;
}

/**
 * Simulates a realistic Bobble League match score:
 * - Half 1 ends when a team reaches 3 goals (or very rarely time ends).
 * - Half 2 ends when a team reaches 3 goals (or very rarely time ends).
 * - Maximum goals for any single team is 6 (3 in H1 + 3 in H2).
 * - Total score in a match is at least 5 goals (most commonly 5-3, 6-2, 6-3, 5-4, 6-4, 5-5).
 * - Scores like 1-0 or 2-0 are virtually impossible in this game format.
 */
export function simulateBobbleScore(
  prob1: number,
  prob2: number,
  probDraw: number
): {
  score1: number;
  score2: number;
  simulatedWinner: 'team1' | 'draw' | 'team2';
  iyScore: string;
} {
  // Relative win probability for team 1 (bounded 0.15 to 0.85)
  const p1Ratio = Math.max(0.15, Math.min(0.85, prob1 / ((prob1 + prob2) || 1)));

  // Simulates a single half played to 3 goals (first to 3)
  const simSingleHalf = (t1Advantage: number): { g1: number; g2: number } => {
    // 2.5% chance of rare time-out before reaching 3 goals
    const isTimeout = Math.random() < 0.025;
    if (isTimeout) {
      const rareDraws = [[1, 1], [2, 2], [2, 1], [1, 2]];
      const pick = rareDraws[Math.floor(Math.random() * rareDraws.length)];
      return { g1: pick[0], g2: pick[1] };
    }

    const roll = Math.random();
    if (roll < t1Advantage) {
      // Team 1 scores 3 goals in this half
      const oppRoll = Math.random();
      let oppG = 1;
      if (t1Advantage > 0.65) {
        oppG = oppRoll < 0.45 ? 0 : oppRoll < 0.80 ? 1 : 2;
      } else if (t1Advantage < 0.35) {
        oppG = oppRoll < 0.15 ? 0 : oppRoll < 0.50 ? 1 : 2;
      } else {
        oppG = oppRoll < 0.28 ? 0 : oppRoll < 0.68 ? 1 : 2;
      }
      return { g1: 3, g2: oppG };
    } else {
      // Team 2 scores 3 goals in this half
      const t2Advantage = 1 - t1Advantage;
      const oppRoll = Math.random();
      let oppG = 1;
      if (t2Advantage > 0.65) {
        oppG = oppRoll < 0.45 ? 0 : oppRoll < 0.80 ? 1 : 2;
      } else if (t2Advantage < 0.35) {
        oppG = oppRoll < 0.15 ? 0 : oppRoll < 0.50 ? 1 : 2;
      } else {
        oppG = oppRoll < 0.28 ? 0 : oppRoll < 0.68 ? 1 : 2;
      }
      return { g1: oppG, g2: 3 };
    }
  };

  // 1st Half
  const h1 = simSingleHalf(p1Ratio);

  // 2nd Half: Second half dynamic with potential comeback or momentum
  let h2Ratio = p1Ratio;
  if (h1.g1 === 3 && h1.g2 <= 1) {
    // Team 1 dominated H1 (e.g. 3-0). Team 2 pushes hard in H2 (yielding classic 5-3 / 6-2)
    h2Ratio = p1Ratio * 0.82 + 0.12;
  } else if (h1.g2 === 3 && h1.g1 <= 1) {
    // Team 2 dominated H1. Team 1 pushes in H2
    h2Ratio = p1Ratio * 1.15;
  }
  const h2 = simSingleHalf(Math.max(0.15, Math.min(0.85, h2Ratio)));

  let score1 = h1.g1 + h2.g1;
  let score2 = h1.g2 + h2.g2;

  // Rule 1: No team can score more than 6 goals (capped at 6)
  score1 = Math.min(6, Math.max(0, score1));
  score2 = Math.min(6, Math.max(0, score2));

  // Rule 2: Total match goals is at least 5 (typically 5-3, 6-2, 6-3, 5-4, 5-5)
  if (score1 + score2 < 5) {
    if (score1 >= score2) {
      score1 = Math.max(3, score1);
      score2 = Math.max(2, 5 - score1);
    } else {
      score2 = Math.max(3, score2);
      score1 = Math.max(2, 5 - score2);
    }
  }

  const simulatedWinner: 'team1' | 'draw' | 'team2' =
    score1 > score2 ? 'team1' : score1 < score2 ? 'team2' : 'draw';

  return {
    score1,
    score2,
    simulatedWinner,
    iyScore: `${h1.g1} - ${h1.g2}`,
  };
}

/**
 * Predicts head-to-head probabilities and score between two teams given their Elo ratings
 * luckFactor: 0.0 (pure Elo) to 0.5 (more upsets/randomness)
 */
export function predictHeadToHead(
  team1Elo: number,
  team2Elo: number,
  luckFactor: number = 0.25,
  isHomeAway: boolean = true
): {
  prob1: number;
  probDraw: number;
  prob2: number;
  predictedScore1: number;
  predictedScore2: number;
  simulatedWinner: 'team1' | 'draw' | 'team2';
  iyScore: string;
} {
  // Home advantage (+2.0 Elo points in our scale where 1 win is ~3.5 pts)
  const homeAdv = isHomeAway ? 2.0 : 0;
  const rawDiff = team1Elo + homeAdv - team2Elo;

  // Logistic scale: in this custom Elo system, 12-14 Elo difference is a clear favorite
  const scale = 14.0;
  const z = rawDiff / scale;

  // Base logistic probability for team 1
  let baseP1 = 1 / (1 + Math.exp(-z));

  // Blend with 50/50 based on luckFactor (luckFactor shrinks the gap slightly)
  baseP1 = baseP1 * (1 - luckFactor * 0.6) + 0.5 * (luckFactor * 0.6);

  // Draw probability in football typically 20% - 26%, decreasing when disparity is huge
  const baseDraw = 0.24 * Math.exp(-Math.abs(z) * 0.35);
  const pDraw = Math.max(0.12, Math.min(0.28, baseDraw));

  // Distribute remaining probability
  const p1 = (1 - pDraw) * baseP1;
  const p2 = (1 - pDraw) * (1 - baseP1);

  // Convert to clean integer percentages that sum to 100
  let pct1 = Math.round(p1 * 100);
  let pctDraw = Math.round(pDraw * 100);
  let pct2 = 100 - pct1 - pctDraw;
  if (pct2 < 1) {
    pct2 = 1;
    pct1 = 100 - pctDraw - pct2;
  }

  // Simulate realistic Bobble game outcome
  const sim = simulateBobbleScore(pct1, pct2, pctDraw);

  return {
    prob1: pct1,
    probDraw: pctDraw,
    prob2: pct2,
    predictedScore1: sim.score1,
    predictedScore2: sim.score2,
    simulatedWinner: sim.simulatedWinner,
    iyScore: sim.iyScore,
  };
}

/**
 * Predicts all remaining unplayed league matches and produces simulated final standings
 */
export function simulateLeagueSeason(
  teams: Team[],
  matches: Match[],
  eloStats: Record<string, TeamEloStats>,
  luckFactor: number = 0.25
): {
  matchPredictions: MatchPrediction[];
  simulatedStandings: SimulatedStanding[];
  projectedChampion: SimulatedStanding | null;
  unplayedCount: number;
} {
  const resolveTeam = buildTeamNameResolver(teams);

  // Incorporate full 22 weeks of league matches (including return fixtures for weeks 12-22)
  const fullSeasonMatches = getAllSeasonMatches(matches);

  // Filter unplayed league matches
  const unplayedMatches = fullSeasonMatches.filter((m) => {
    if (m.played) return false;
    const cat = (m.category || '').toUpperCase().trim();
    if (cat.includes('TURNUVA') || cat.includes('UCL') || cat.includes('UEL') || cat.includes('UECL')) {
      return false;
    }
    // Must have team names
    return Boolean(m.team1 && m.team2);
  });

  // Sort by week / date
  unplayedMatches.sort((a, b) => {
    const wA = Number(a.hafta) || 0;
    const wB = Number(b.hafta) || 0;
    if (wA !== wB) return wA - wB;
    return (Number(a.datejav) || 0) - (Number(b.datejav) || 0);
  });

  // Prepare tracking for simulated points
  const teamSimulationMap: Record<
    string,
    {
      simPoints: number;
      simWins: number;
      simDraws: number;
      simLosses: number;
      simGf: number;
      simGa: number;
    }
  > = {};

  teams.forEach((t) => {
    const name = t.name.trim();
    teamSimulationMap[name] = {
      simPoints: 0,
      simWins: 0,
      simDraws: 0,
      simLosses: 0,
      simGf: 0,
      simGa: 0,
    };
  });

  const matchPredictions: MatchPrediction[] = [];

  unplayedMatches.forEach((m) => {
    const t1 = resolveTeam(m.team1);
    const t2 = resolveTeam(m.team2);

    const elo1 = eloStats[t1]?.elo ?? BASE_ELO;
    const elo2 = eloStats[t2]?.elo ?? BASE_ELO;

    const sim = predictHeadToHead(elo1, elo2, luckFactor, true);

    const expPts1 = Number((3 * (sim.prob1 / 100) + 1 * (sim.probDraw / 100)).toFixed(2));
    const expPts2 = Number((3 * (sim.prob2 / 100) + 1 * (sim.probDraw / 100)).toFixed(2));

    matchPredictions.push({
      matchId: m.id || `${t1}-${t2}-${m.hafta}`,
      hafta: m.hafta || '?',
      date: m.date,
      team1: t1,
      team2: t2,
      team1Logo: eloStats[t1]?.logo || '',
      team2Logo: eloStats[t2]?.logo || '',
      team1Elo: elo1,
      team2Elo: elo2,
      prob1: sim.prob1,
      probDraw: sim.probDraw,
      prob2: sim.prob2,
      predictedScore1: sim.predictedScore1,
      predictedScore2: sim.predictedScore2,
      predictedWinner: sim.simulatedWinner,
      expectedPoints1: expPts1,
      expectedPoints2: expPts2,
      iyScore: sim.iyScore,
    });

    // Accumulate simulation stats
    if (!teamSimulationMap[t1]) {
      teamSimulationMap[t1] = { simPoints: 0, simWins: 0, simDraws: 0, simLosses: 0, simGf: 0, simGa: 0 };
    }
    if (!teamSimulationMap[t2]) {
      teamSimulationMap[t2] = { simPoints: 0, simWins: 0, simDraws: 0, simLosses: 0, simGf: 0, simGa: 0 };
    }

    const t1Obj = teamSimulationMap[t1];
    const t2Obj = teamSimulationMap[t2];

    t1Obj.simGf += sim.predictedScore1;
    t1Obj.simGa += sim.predictedScore2;
    t2Obj.simGf += sim.predictedScore2;
    t2Obj.simGa += sim.predictedScore1;

    if (sim.simulatedWinner === 'team1') {
      t1Obj.simPoints += 3;
      t1Obj.simWins += 1;
      t2Obj.simLosses += 1;
    } else if (sim.simulatedWinner === 'draw') {
      t1Obj.simPoints += 1;
      t2Obj.simPoints += 1;
      t1Obj.simDraws += 1;
      t2Obj.simDraws += 1;
    } else {
      t2Obj.simPoints += 3;
      t2Obj.simWins += 1;
      t1Obj.simLosses += 1;
    }
  });

  // Fast Monte Carlo calculation (300 iterations) to get realistic championship probabilities
  const champWinsCount: Record<string, number> = {};
  teams.forEach((t) => {
    champWinsCount[t.name.trim()] = 0;
  });

  const MC_RUNS = 300;
  for (let run = 0; run < MC_RUNS; run++) {
    const runPts: Record<string, { pts: number; diff: number }> = {};
    teams.forEach((t) => {
      const curPts = Number(t.points) || 0;
      const curDiff = (Number(t['atilan gol']) || 0) - (Number(t['yenilen gol']) || 0);
      runPts[t.name.trim()] = { pts: curPts, diff: curDiff };
    });

    unplayedMatches.forEach((m) => {
      const t1 = resolveTeam(m.team1);
      const t2 = resolveTeam(m.team2);
      const elo1 = eloStats[t1]?.elo ?? BASE_ELO;
      const elo2 = eloStats[t2]?.elo ?? BASE_ELO;
      const res = predictHeadToHead(elo1, elo2, luckFactor, true);

      if (!runPts[t1]) runPts[t1] = { pts: 0, diff: 0 };
      if (!runPts[t2]) runPts[t2] = { pts: 0, diff: 0 };

      runPts[t1].diff += res.predictedScore1 - res.predictedScore2;
      runPts[t2].diff += res.predictedScore2 - res.predictedScore1;

      if (res.simulatedWinner === 'team1') {
        runPts[t1].pts += 3;
      } else if (res.simulatedWinner === 'draw') {
        runPts[t1].pts += 1;
        runPts[t2].pts += 1;
      } else {
        runPts[t2].pts += 3;
      }
    });

    // Find run winner
    let bestTeam = '';
    let bestPts = -999;
    let bestDiff = -999;
    Object.keys(runPts).forEach((tn) => {
      const p = runPts[tn];
      if (p.pts > bestPts || (p.pts === bestPts && p.diff > bestDiff)) {
        bestPts = p.pts;
        bestDiff = p.diff;
        bestTeam = tn;
      }
    });

    if (bestTeam && champWinsCount[bestTeam] !== undefined) {
      champWinsCount[bestTeam] += 1;
    }
  }

  // Compile final standings
  const simulatedStandings: SimulatedStanding[] = teams.map((t) => {
    const name = t.name.trim();
    const curPts = Number(t.points) || 0;
    const curPlayed = Number(t.played) || 0;
    const curGf = Number(t['atilan gol']) || 0;
    const curGa = Number(t['yenilen gol']) || 0;
    const curDiff = curGf - curGa;

    const sim = teamSimulationMap[name] || {
      simPoints: 0,
      simWins: 0,
      simDraws: 0,
      simLosses: 0,
      simGf: 0,
      simGa: 0,
    };

    const totalPts = curPts + sim.simPoints;
    const totalDiff = curDiff + (sim.simGf - sim.simGa);
    const champProb = Math.round(((champWinsCount[name] || 0) / MC_RUNS) * 100);

    return {
      rank: 0,
      teamName: name,
      logo: t.logo || eloStats[name]?.logo || '',
      currentPoints: curPts,
      currentPlayed: curPlayed,
      simulatedPoints: sim.simPoints,
      totalProjectedPoints: totalPts,
      simulatedWins: sim.simWins,
      simulatedDraws: sim.simDraws,
      simulatedLosses: sim.simLosses,
      simulatedGoalsFor: sim.simGf,
      simulatedGoalsAgainst: sim.simGa,
      totalProjectedGoalDiff: totalDiff,
      championshipProbability: champProb,
      elo: eloStats[name]?.elo ?? BASE_ELO,
    };
  });

  // Sort by total projected points, then total projected goal difference, then ELO
  simulatedStandings.sort((a, b) => {
    if (b.totalProjectedPoints !== a.totalProjectedPoints) {
      return b.totalProjectedPoints - a.totalProjectedPoints;
    }
    if (b.totalProjectedGoalDiff !== a.totalProjectedGoalDiff) {
      return b.totalProjectedGoalDiff - a.totalProjectedGoalDiff;
    }
    return b.elo - a.elo;
  });

  simulatedStandings.forEach((s, idx) => {
    s.rank = idx + 1;
  });

  return {
    matchPredictions,
    simulatedStandings,
    projectedChampion: simulatedStandings[0] || null,
    unplayedCount: unplayedMatches.length,
  };
}
