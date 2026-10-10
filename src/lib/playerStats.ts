import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Player, Team, Match, MatchTimelineEvent } from '../types';

/**
 * Normalizes player name for reliable case-insensitive and diacritic-insensitive comparison
 */
export function normalizePlayerName(name?: string | null): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/i̇/g, 'i') // decomposed dotted i
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

const NON_ASSIST_STRINGS = new Set([
  'sut',
  'şut',
  'yok',
  '-',
  '',
  'none',
  'yok (penalti)',
  'penalti',
  'kendi kalesine',
  'yok (kendi kalesine)',
  'korner',
  'frikik'
]);

/**
 * Determines whether a timeline event represents an own goal (Kendi Kalesine - K.K.)
 */
export function isEventOwnGoal(evt: MatchTimelineEvent): boolean {
  if (evt.type !== 'goal') return false;
  if (evt.isKK === true) return true;
  const scorer = (evt.scorer || '').toLowerCase();
  const assist = (evt.assist || '').toLowerCase();
  if (scorer.includes('(k.k') || scorer.includes('(kk') || scorer.includes('kendi kalesine')) return true;
  if (assist.includes('kendi kalesine') || assist.includes('(k.k') || assist.includes('(kk')) return true;
  return false;
}

export interface ComputedPlayerStats {
  goals: number;
  ownGoals: number;
  asistsay: number;
  mac: number;
  poyn: number;
  gol_mac: number;
  ratingoy: number;
  ratingoyFormatted: string;
  mvp: number;
  sari_kart: number;
  kirmizi_kart: number;
  yesil_kart: number;
  totalCards: number;
}

/**
 * Calculates comprehensive stats for a single player strictly derived from matches data
 */
export function calculatePlayerStatsFromMatches(player: Player, matches: Match[]): ComputedPlayerStats {
  const normName = normalizePlayerName(player.pname);
  if (!normName) {
    return {
      goals: 0,
      ownGoals: 0,
      asistsay: 0,
      mac: 0,
      poyn: 0,
      gol_mac: 0,
      ratingoy: 0,
      ratingoyFormatted: '0.00',
      mvp: 0,
      sari_kart: 0,
      kirmizi_kart: 0,
      yesil_kart: 0,
      totalCards: 0
    };
  }

  let goals = 0;
  let ownGoals = 0;
  let assists = 0;
  let yellowCards = 0;
  let redCards = 0;
  let greenCards = 0;
  let mvpCount = 0;
  let totalRating = 0;
  let ratedMatchCount = 0;
  let matchesPlayed = 0;

  matches.forEach((m) => {
    if (!m.played) return;

    let playedInThisMatch = false;

    // 1. Lineup check
    const lineup = (m as any).lineup || {};
    let playerLineup: any = null;

    if (typeof lineup === 'object' && lineup !== null) {
      for (const [key, val] of Object.entries(lineup)) {
        if (normalizePlayerName(key) === normName) {
          playerLineup = val;
          break;
        }
      }
    }

    if (playerLineup) {
      if (playerLineup.played !== false) {
        playedInThisMatch = true;
      }
      const r = Number(playerLineup.rating);
      if (!isNaN(r) && r > 0) {
        totalRating += r;
        ratedMatchCount += 1;
      }
    }

    // 2. Timeline events check
    const timeline: MatchTimelineEvent[] = Array.isArray(m.timeline) ? m.timeline : [];
    timeline.forEach((evt) => {
      // Goals
      if (evt.type === 'goal') {
        const isKK = isEventOwnGoal(evt);
        if (evt.scorer) {
          const cleanScorer = evt.scorer
            .replace(/\(k\.?k\.?\)/gi, '')
            .replace(/kendi kalesine/gi, '')
            .trim();
          if (normalizePlayerName(cleanScorer) === normName) {
            playedInThisMatch = true;
            if (!isKK) {
              goals += 1;
            } else {
              ownGoals += 1;
            }
          }
        }

        if (evt.assist) {
          const cleanAssist = evt.assist
            .replace(/\(k\.?k\.?\)/gi, '')
            .replace(/kendi kalesine/gi, '')
            .trim();
          if (normalizePlayerName(cleanAssist) === normName) {
            const rawAssist = normalizePlayerName(evt.assist);
            if (!NON_ASSIST_STRINGS.has(rawAssist) && !isKK) {
              assists += 1;
              playedInThisMatch = true;
            }
          }
        }
      }

      // Cards
      if (evt.type === 'card' && evt.player && normalizePlayerName(evt.player) === normName) {
        playedInThisMatch = true;
        if (evt.cardColor === 'Sarı') yellowCards += 1;
        else if (evt.cardColor === 'Kırmızı') redCards += 1;
        else if (evt.cardColor === 'Yeşil') greenCards += 1;
      }

      // Substitutions
      if (evt.type === 'sub') {
        if (evt.subOut && normalizePlayerName(evt.subOut) === normName) {
          playedInThisMatch = true;
        }
        if (evt.subIn && normalizePlayerName(evt.subIn) === normName) {
          playedInThisMatch = true;
        }
      }
    });

    // 3. MVP check
    if (m.mvp && normalizePlayerName(m.mvp) === normName) {
      mvpCount += 1;
      playedInThisMatch = true;
      if (!playerLineup && m.rating) {
        const mvpR = Number(m.rating);
        if (!isNaN(mvpR) && mvpR > 0) {
          totalRating += mvpR;
          ratedMatchCount += 1;
        }
      }
    }

    if (playedInThisMatch) {
      matchesPlayed += 1;
    }
  });

  const avgRating = ratedMatchCount > 0 ? Number((totalRating / ratedMatchCount).toFixed(2)) : 0;
  const ratio = matchesPlayed > 0 ? Number((goals / matchesPlayed).toFixed(2)) : 0;

  return {
    goals,
    ownGoals,
    asistsay: assists,
    mac: matchesPlayed,
    poyn: matchesPlayed,
    gol_mac: ratio,
    ratingoy: avgRating,
    ratingoyFormatted: avgRating > 0 ? avgRating.toFixed(2) : '0.00',
    mvp: mvpCount,
    sari_kart: yellowCards,
    kirmizi_kart: redCards,
    yesil_kart: greenCards,
    totalCards: yellowCards + redCards + greenCards
  };
}

/**
 * Calculates match-derived statistics for an array of players
 */
export function calculateAllPlayerStatsFromMatches(
  players: Player[],
  matches: Match[]
): Map<string, ComputedPlayerStats> {
  const map = new Map<string, ComputedPlayerStats>();
  players.forEach((p) => {
    const stats = calculatePlayerStatsFromMatches(p, matches);
    map.set(p.pname, stats);
  });
  return map;
}

export interface OwnGoalPlayerEntry {
  name: string;
  team: string;
  currentTeam: string;
  scoredTeamsText: string;
  photo: string;
  count: number;
  matchesCount: number;
}

export interface OwnGoalTeamEntry {
  name: string;
  logo: string;
  count: number;
  playersCount: number;
}

export interface OwnGoalSummary {
  totalOwnGoals: number;
  topPlayer: {
    name: string;
    photo: string;
    count: number;
  } | null;
  topTeam: {
    name: string;
    logo: string;
    count: number;
  } | null;
  allPlayers: OwnGoalPlayerEntry[];
  allTeams: OwnGoalTeamEntry[];
  matchesCount: number;
}

/**
 * Calculates aggregate own goal (Kendi Kalesine Atılan) statistics across all matches:
 * - Checks which team the player was playing for in the match even if current team does not match.
 * - Correctly credits own goals to both player and the club they played for in that match.
 * - Total own goals in the league
 * - Player list sorted by own goals
 * - Team list sorted by own goals
 */
export function calculateOwnGoalSummary(
  matches: Match[],
  players: Player[],
  teams: Team[],
  teamLogos: Record<string, string>
): OwnGoalSummary {
  let totalOwnGoals = 0;
  const ownGoalsByPlayer = new Map<string, number>();
  const ownGoalsByTeam = new Map<string, number>();
  const matchIdsWithOwnGoal = new Set<string>();
  const playerScoredTeamsMap = new Map<string, Set<string>>();

  matches.forEach((m) => {
    if (!m.played) return;
    const timeline: MatchTimelineEvent[] = Array.isArray(m.timeline) ? m.timeline : [];

    timeline.forEach((evt) => {
      if (!isEventOwnGoal(evt)) return;

      totalOwnGoals++;
      if (m.id) {
        matchIdsWithOwnGoal.add(m.id);
      } else {
        matchIdsWithOwnGoal.add(`${m.team1}-${m.team2}-${m.hafta}`);
      }

      // 1. Scorer identification
      const rawScorer = (evt.scorer || '').trim();
      const cleanScorer = rawScorer
        .replace(/\(k\.?k\.?\)/gi, '')
        .replace(/kendi kalesine/gi, '')
        .trim();

      const matchedPlayer = players.find(
        (p) => normalizePlayerName(p.pname) === normalizePlayerName(cleanScorer)
      );

      const effectivePlayerName = matchedPlayer ? matchedPlayer.pname : cleanScorer;
      if (effectivePlayerName) {
        ownGoalsByPlayer.set(
          effectivePlayerName,
          (ownGoalsByPlayer.get(effectivePlayerName) || 0) + 1
        );
      }

      // 2. Team identification
      // In football, an own goal is scored into own team's net.
      // On the scoreboard, if evt.team === 'team1', team1 got the score point,
      // which means team2 committed the own goal into their own net!
      // If evt.team === 'team2', team2 got the score point,
      // which means team1 committed the own goal into their own net!
      let defendingTeamInMatch = '';
      if (evt.team === 'team1') {
        defendingTeamInMatch = m.team2;
      } else if (evt.team === 'team2') {
        defendingTeamInMatch = m.team1;
      }

      const pCurrentTeam = matchedPlayer
        ? ((matchedPlayer.kiralik && matchedPlayer.kiralikTakim) ? matchedPlayer.kiralikTakim : matchedPlayer.pteam)
        : '';

      const t1Norm = normalizePlayerName(m.team1);
      const t2Norm = normalizePlayerName(m.team2);
      const pCurrNorm = normalizePlayerName(pCurrentTeam);

      let teamScoredKK = '';

      // Check if player's current team matches one of the teams playing in this match
      if (pCurrNorm && (pCurrNorm === t1Norm || pCurrNorm === t2Norm)) {
        teamScoredKK = pCurrNorm === t1Norm ? m.team1 : m.team2;
      } else {
        // Player's current team does NOT match the teams in this match ("suanki takimiyla uyusmuyosa"):
        // The own goal must be credited to the team they were playing for during this match!
        teamScoredKK = defendingTeamInMatch || m.team1;
      }

      if (teamScoredKK) {
        ownGoalsByTeam.set(teamScoredKK, (ownGoalsByTeam.get(teamScoredKK) || 0) + 1);

        if (effectivePlayerName) {
          if (!playerScoredTeamsMap.has(effectivePlayerName)) {
            playerScoredTeamsMap.set(effectivePlayerName, new Set<string>());
          }
          playerScoredTeamsMap.get(effectivePlayerName)!.add(teamScoredKK);
        }
      }
    });
  });

  // Build sorted allPlayers array
  const allPlayers: OwnGoalPlayerEntry[] = [];
  for (const [pName, count] of ownGoalsByPlayer.entries()) {
    const matchedP = players.find(
      (p) => normalizePlayerName(p.pname) === normalizePlayerName(pName)
    );
    const currentTeam = matchedP
      ? (matchedP.kiralik && matchedP.kiralikTakim ? matchedP.kiralikTakim : matchedP.pteam)
      : '';
    const photo =
      matchedP?.foto ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(pName)}&background=800000&color=fff&size=56`;

    const playerMatches = matchedP ? calculatePlayerStatsFromMatches(matchedP, matches).mac : 0;
    const scoredTeams = Array.from(playerScoredTeamsMap.get(pName) || []);

    // Construct team description text:
    let scoredTeamsText = '';
    const mainScoredTeam = scoredTeams[0] || currentTeam;
    if (scoredTeams.length > 0 && currentTeam && !scoredTeams.some(st => normalizePlayerName(st) === normalizePlayerName(currentTeam))) {
      // Player scored own goal for a team different from their current team!
      scoredTeamsText = `${scoredTeams.join(', ')} Formasıyla (Şu an: ${currentTeam})`;
    } else if (scoredTeams.length > 0) {
      scoredTeamsText = scoredTeams.join(', ');
    } else {
      scoredTeamsText = currentTeam || '-';
    }

    allPlayers.push({
      name: pName,
      team: mainScoredTeam,
      currentTeam,
      scoredTeamsText,
      photo,
      count,
      matchesCount: playerMatches
    });
  }
  allPlayers.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // Build sorted allTeams array (include teams that have own goals, plus all other registered teams)
  const allTeams: OwnGoalTeamEntry[] = [];
  const processedTeamNames = new Set<string>();

  for (const [tName, count] of ownGoalsByTeam.entries()) {
    processedTeamNames.add(tName.toLowerCase().trim());
    const matchedT = teams.find(
      (t) => t.name.toLowerCase().trim() === tName.toLowerCase().trim()
    );
    const logo =
      matchedT?.logo ||
      teamLogos[tName] ||
      'https://via.placeholder.com/32?text=?';

    // Count distinct players in this team who scored KK
    const playersInTeamWithKK = allPlayers.filter((ap) => {
      const pTeams = playerScoredTeamsMap.get(ap.name);
      return pTeams ? pTeams.has(tName) : ap.team.toLowerCase().trim() === tName.toLowerCase().trim();
    }).length;

    allTeams.push({
      name: tName,
      logo,
      count,
      playersCount: playersInTeamWithKK
    });
  }

  // Also include teams with 0 own goals so full club standings are visible
  teams.forEach((t) => {
    if (!processedTeamNames.has(t.name.toLowerCase().trim())) {
      allTeams.push({
        name: t.name,
        logo: t.logo || teamLogos[t.name] || 'https://via.placeholder.com/32?text=?',
        count: 0,
        playersCount: 0
      });
    }
  });

  allTeams.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const topPlayer = allPlayers.length > 0 ? {
    name: allPlayers[0].name,
    photo: allPlayers[0].photo,
    count: allPlayers[0].count
  } : null;

  const topTeam = allTeams.length > 0 && allTeams[0].count > 0 ? {
    name: allTeams[0].name,
    logo: allTeams[0].logo,
    count: allTeams[0].count
  } : null;

  return {
    totalOwnGoals,
    topPlayer,
    topTeam,
    allPlayers,
    allTeams,
    matchesCount: matchIdsWithOwnGoal.size,
  };
}

/**
 * Synchronizes all player statistics from the matches collection into the players collection in Firestore.
 */
export async function syncPlayerStatsToFirestore(): Promise<{ updatedCount: number }> {
  try {
    const [playersSnap, matchesSnap] = await Promise.all([
      getDocs(collection(db, 'players')),
      getDocs(collection(db, 'matches'))
    ]);

    const matchesList: Match[] = [];
    matchesSnap.forEach((mdoc) => {
      matchesList.push({ id: mdoc.id, ...mdoc.data() } as Match);
    });

    let batch = writeBatch(db);
    let opCount = 0;
    let totalUpdated = 0;

    for (const pdoc of playersSnap.docs) {
      const pdata = pdoc.data() as Player;
      if (!pdata.pname) continue;

      const stats = calculatePlayerStatsFromMatches(pdata, matchesList);

      batch.update(pdoc.ref, {
        goals: stats.goals,
        asistsay: stats.asistsay,
        poyn: stats.poyn,
        ratingoy: stats.ratingoyFormatted,
        sariKart: stats.sari_kart,
        kirmiziKart: stats.kirmizi_kart,
        yesilKart: stats.yesil_kart,
        mvpSayisi: stats.mvp
      });

      opCount++;
      totalUpdated++;

      // Commit batches in sizes under 400
      if (opCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    console.log(`Successfully synced match stats for ${totalUpdated} players to Firestore.`);
    return { updatedCount: totalUpdated };
  } catch (err) {
    console.error('Failed to sync player stats to Firestore:', err);
    throw err;
  }
}
