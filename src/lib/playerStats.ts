import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Player, Team, Match, MatchTimelineEvent } from '../types';
import { mergeTournamentMatches } from './tournamentMatches';

/**
 * Normalizes player name for reliable case-insensitive, whitespace-insensitive, and diacritic-insensitive comparison
 */
export function normalizePlayerName(name?: string | null): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ') // collapse multi-spaces, newlines, tabs
    .replace(/i̇/g, 'i') // decomposed dotted i
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

/**
 * Strips all Latin diacritics (accents like é, á, ó, ú, ñ, ć, č, etc.)
 */
export function stripAllDiacritics(str?: string | null): string {
  if (!str) return '';
  return normalizePlayerName(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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

export interface GoldenBootStats {
  leagueGoals: number;
  wpcGoals: number;
  uclGoals: number;
  uelGoals: number;
  ueclGoals: number;
  totalGoals: number;
  score: number;
  scoreFormatted: string;
}

export type CompetitionCategory = 'ucl' | 'uel' | 'uecl' | 'wpc' | 'league';

/**
 * Returns tournament category and Golden Boot coefficient
 * - UCL / BCL / Bobble Şampiyonlar Ligi: 2.0
 * - UEL / BEL / Bobble Avrupa Ligi: 1.75
 * - UECL / BECL / Bobble Konferans Ligi: 1.5
 * - Süper Lig / Lig Maçları: 1.0
 * - WPC / Ziraat Kupası / World Peace Cup: 0.5
 */
export function getMatchCompetitionType(m: Match): CompetitionCategory {
  const cat = (m.category || '').toString().trim().toUpperCase();
  const hafta = (m.hafta || '').toString().trim().toUpperCase();

  const cleanCat = cat
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'G')
    .replace(/Ş/g, 'S')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C');

  const cleanHafta = hafta
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'G')
    .replace(/Ş/g, 'S')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C');

  // 1. UCL / BCL / Şampiyonlar Ligi -> Katsayı 2.0
  if (
    cleanCat === 'BCL' || cleanCat === 'UCL' || cleanCat.includes('CHAMPIONS') || cleanCat.includes('SAMPIYON') ||
    cleanHafta.includes('BCL') || cleanHafta.includes('UCL') || cleanHafta.includes('SAMPIYON')
  ) {
    return 'ucl';
  }

  // 2. UEL / BEL / Bobble Avrupa Ligi -> Katsayı 1.75
  if (
    cleanCat === 'BEL' || cleanCat === 'UEL' || cleanCat.includes('EUROPA') || cleanCat.includes('AVRUPA') ||
    cleanHafta.includes('BEL') || cleanHafta.includes('UEL') || cleanHafta.includes('AVRUPA')
  ) {
    return 'uel';
  }

  // 3. UECL / BECL / Bobble Konferans Ligi -> Katsayı 1.5
  if (
    cleanCat === 'BECL' || cleanCat === 'UECL' || cleanCat.includes('CONFERENCE') || cleanCat.includes('KONFERANS') ||
    cleanHafta.includes('BECL') || cleanHafta.includes('UECL') || cleanHafta.includes('KONFERANS')
  ) {
    return 'uecl';
  }

  // 4. WPC / Ziraat Kupası / World Peace Cup -> Katsayı 0.5
  if (
    cleanCat === 'TURNUVA' || cleanCat === 'WPC' || cleanCat.includes('WORLD PEACE') || cleanCat.includes('ZIRAAT') ||
    cleanHafta.includes('WPC') || cleanHafta.includes('WORLD PEACE') || cleanHafta.includes('ZIRAAT') ||
    cleanHafta.includes('GRUP A') || cleanHafta.includes('GRUP B') ||
    (m as any).kgrup !== undefined
  ) {
    return 'wpc';
  }

  // Check round or bracket for cup
  if ((m as any).round || (m as any).bracketId || m.ligm === false) {
    if (cleanCat.includes('BCL') || cleanHafta.includes('BCL')) return 'ucl';
    if (cleanCat.includes('BEL') || cleanHafta.includes('BEL')) return 'uel';
    if (cleanCat.includes('BECL') || cleanHafta.includes('BECL')) return 'uecl';
    if (cleanCat.includes('WPC') || cleanHafta.includes('WPC')) return 'wpc';
  }

  // 5. Normal Lig Maçı -> Katsayı 1.0
  return 'league';
}

export interface ComputedPlayerStats {
  goals: number;
  ownGoals: number;
  asistsay: number;
  ga: number;
  ga_mac: number;
  mac: number;
  poyn: number;
  gol_mac: number;
  ratingoy: number;
  ratingoyFormatted: string;
  mvp: number;
  leagueMvp: number;
  tournamentMvp: number;
  sari_kart: number;
  kirmizi_kart: number;
  yesil_kart: number;
  totalCards: number;
  goldenBoot: GoldenBootStats;
}

/**
 * Builds an alias map mapping any normalized player doc ID, player ID, or player name to the set of all associated names/IDs.
 * This guarantees that when a player's name is updated or changed, all past matches referencing either
 * the player ID, doc ID, or old/new name remain unified under the exact same player stats!
 */
export function buildPlayerAliasMap(players: Player[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  players.forEach((p) => {
    const docId = (p as any).id || (p as any).docId;
    const group = new Set<string>();

    const addIdentifier = (raw?: string | null) => {
      if (!raw) return;
      const norm = normalizePlayerName(raw);
      if (norm) group.add(norm);
      const stripped = stripAllDiacritics(raw);
      if (stripped) group.add(stripped);
    };

    addIdentifier(docId);
    addIdentifier(p.pname);
    addIdentifier((p as any).playerId);
    addIdentifier((p as any).originalName);
    addIdentifier((p as any).oldName);

    // Any alias or previous names array
    const aliases = (p as any).aliases || (p as any).previousNames || (p as any).oldNames || [];
    if (Array.isArray(aliases)) {
      aliases.forEach(a => addIdentifier(a));
    }

    // Merge with any existing aliases in map
    group.forEach((id) => {
      if (map.has(id)) {
        map.get(id)!.forEach(x => group.add(x));
      }
    });

    // Assign unified group to every identifier in group
    group.forEach((id) => {
      map.set(id, group);
    });
  });

  return map;
}

/**
 * Returns all normalized identifiers for a player (doc ID, player ID, display name, and known aliases).
 */
export function getPlayerIdentifierSet(player: Player, aliasMap?: Map<string, Set<string>>): Set<string> {
  const set = new Set<string>();

  const add = (raw?: string | null) => {
    if (!raw) return;
    const n = normalizePlayerName(raw);
    if (n) set.add(n);
    const s = stripAllDiacritics(raw);
    if (s) set.add(s);
  };

  add(player.pname);
  const docId = (player as any).id || (player as any).docId;
  add(docId);
  add((player as any).playerId);
  add((player as any).originalName);
  add((player as any).oldName);

  const aliases = (player as any).aliases || (player as any).previousNames || (player as any).oldNames || [];
  if (Array.isArray(aliases)) {
    aliases.forEach(a => add(a));
  }

  if (aliasMap) {
    const currentItems = Array.from(set);
    currentItems.forEach((item) => {
      if (aliasMap.has(item)) {
        aliasMap.get(item)!.forEach(a => set.add(a));
      }
    });
  }

  return set;
}

/**
 * Checks if a candidate player string/id from a match matches the target player's identifiers.
 */
export function doesCandidateMatchPlayer(
  candidate: string | null | undefined,
  identifiers: Set<string>
): boolean {
  if (!candidate) return false;
  const raw = normalizePlayerName(candidate);
  if (!raw) return false;
  if (identifiers.has(raw)) return true;

  const stripped = stripAllDiacritics(candidate);
  if (stripped && identifiers.has(stripped)) return true;

  // Strip own goal / penalty annotations
  const cleaned = normalizePlayerName(
    candidate
      .replace(/\(k\.?k\.?\)/gi, '')
      .replace(/kendi kalesine/gi, '')
      .replace(/\(penalt[ıi]\)/gi, '')
      .trim()
  );
  if (cleaned && identifiers.has(cleaned)) return true;

  const cleanedStripped = stripAllDiacritics(cleaned);
  if (cleanedStripped && identifiers.has(cleanedStripped)) return true;

  // Strip any parenthetical suffix (e.g. "(T1)", "(New Hollands)", "(Kiralık)", etc.)
  const withoutParens = normalizePlayerName(
    candidate
      .replace(/\([^)]*\)/g, '')
      .replace(/kiralık/gi, '')
      .replace(/kiralik/gi, '')
      .replace(/🔄/g, '')
      .trim()
  );
  if (withoutParens && identifiers.has(withoutParens)) return true;
  const withoutParensStripped = stripAllDiacritics(withoutParens);
  if (withoutParensStripped && identifiers.has(withoutParensStripped)) return true;

  return false;
}

/**
 * Calculates comprehensive stats for a single player strictly derived from matches data.
 * Checks both player ID / doc ID and player name so renamed players maintain full statistics!
 */
export function calculatePlayerStatsFromMatches(
  player: Player, 
  matches: Match[], 
  aliasMap?: Map<string, Set<string>>
): ComputedPlayerStats {
  const identifiers = getPlayerIdentifierSet(player, aliasMap);
  if (identifiers.size === 0) {
    return {
      goals: 0,
      ownGoals: 0,
      asistsay: 0,
      ga: 0,
      ga_mac: 0,
      mac: 0,
      poyn: 0,
      gol_mac: 0,
      ratingoy: 0,
      ratingoyFormatted: '0.00',
      mvp: 0,
      leagueMvp: 0,
      tournamentMvp: 0,
      sari_kart: 0,
      kirmizi_kart: 0,
      yesil_kart: 0,
      totalCards: 0,
      goldenBoot: {
        leagueGoals: 0,
        wpcGoals: 0,
        uclGoals: 0,
        uelGoals: 0,
        ueclGoals: 0,
        totalGoals: 0,
        score: 0,
        scoreFormatted: '0'
      }
    };
  }

  const pDocId = (player as any).id || (player as any).docId;

  let goals = 0;
  let ownGoals = 0;
  let assists = 0;
  let yellowCards = 0;
  let redCards = 0;
  let greenCards = 0;
  let mvpCount = 0;
  let leagueMvpCount = 0;
  let tournamentMvpCount = 0;
  let totalRating = 0;
  let ratedMatchCount = 0;
  let matchesPlayed = 0;

  // Golden Boot (Altın Ayakkabı) goals breakdown by competition
  let leagueGoals = 0;
  let wpcGoals = 0;
  let uclGoals = 0;
  let uelGoals = 0;
  let ueclGoals = 0;

  matches.forEach((m) => {
    if (!m.played) return;

    let playedInThisMatch = false;

    // 1. Lineup check (check by key, or playerId field in lineup value)
    const lineup = (m as any).lineup || {};
    let playerLineup: any = null;

    if (typeof lineup === 'object' && lineup !== null) {
      for (const [key, val] of Object.entries(lineup)) {
        const pVal: any = val;
        const keyMatch = doesCandidateMatchPlayer(key, identifiers);
        const idMatch = pVal?.playerId && (pVal.playerId === pDocId || identifiers.has(normalizePlayerName(pVal.playerId)));
        const nameMatch = pVal?.pname && doesCandidateMatchPlayer(pVal.pname, identifiers);
        
        if (keyMatch || idMatch || nameMatch) {
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
        if (doesCandidateMatchPlayer(evt.scorer, identifiers)) {
          playedInThisMatch = true;
          if (!isKK) {
            goals += 1;
            // Categorize goal for Golden Boot (Altın Ayakkabı)
            const comp = getMatchCompetitionType(m);
            if (comp === 'ucl') uclGoals += 1;
            else if (comp === 'uel') uelGoals += 1;
            else if (comp === 'uecl') ueclGoals += 1;
            else if (comp === 'wpc') wpcGoals += 1;
            else leagueGoals += 1;
          } else {
            ownGoals += 1;
          }
        }

        if (doesCandidateMatchPlayer(evt.assist, identifiers)) {
          const rawAssist = normalizePlayerName(evt.assist);
          if (!NON_ASSIST_STRINGS.has(rawAssist) && !isKK) {
            assists += 1;
            playedInThisMatch = true;
          }
        }
      }

      // Cards
      if (evt.type === 'card' && doesCandidateMatchPlayer(evt.player, identifiers)) {
        playedInThisMatch = true;
        if (evt.cardColor === 'Sarı') yellowCards += 1;
        else if (evt.cardColor === 'Kırmızı') redCards += 1;
        else if (evt.cardColor === 'Yeşil') greenCards += 1;
      }

      // Substitutions
      if (evt.type === 'sub') {
        if (doesCandidateMatchPlayer(evt.subOut, identifiers) || doesCandidateMatchPlayer(evt.subIn, identifiers)) {
          playedInThisMatch = true;
        }
      }
    });

    // 3. MVP check (counts both league and all tournament matches!)
    const rawMvp = m.mvp ? String(m.mvp).trim() : '';
    if (rawMvp && rawMvp !== '-' && doesCandidateMatchPlayer(rawMvp, identifiers)) {
      mvpCount += 1;
      playedInThisMatch = true;
      const comp = getMatchCompetitionType(m);
      if (comp === 'league') {
        leagueMvpCount += 1;
      } else {
        tournamentMvpCount += 1;
      }

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
  const ga = goals + assists;
  const gaRatio = matchesPlayed > 0 ? Number((ga / matchesPlayed).toFixed(2)) : 0;

  // Calculate Golden Boot score: Lig * 1.0 + WPC * 0.5 + UCL * 2.0 + UEL * 1.75 + UECL * 1.5
  const rawScore = (leagueGoals * 1.0) + (wpcGoals * 0.5) + (uclGoals * 2.0) + (uelGoals * 1.75) + (ueclGoals * 1.5);
  const goldenBootScore = Number(rawScore.toFixed(2));
  const goldenBootScoreFormatted = Number.isInteger(goldenBootScore) ? `${goldenBootScore}` : `${goldenBootScore}`;
  const totalGoldenBootGoals = leagueGoals + wpcGoals + uclGoals + uelGoals + ueclGoals;

  return {
    goals,
    ownGoals,
    asistsay: assists,
    ga,
    ga_mac: gaRatio,
    mac: matchesPlayed,
    poyn: matchesPlayed,
    gol_mac: ratio,
    ratingoy: avgRating,
    ratingoyFormatted: avgRating > 0 ? avgRating.toFixed(2) : '0.00',
    mvp: mvpCount,
    leagueMvp: leagueMvpCount,
    tournamentMvp: tournamentMvpCount,
    sari_kart: yellowCards,
    kirmizi_kart: redCards,
    yesil_kart: greenCards,
    totalCards: yellowCards + redCards + greenCards,
    goldenBoot: {
      leagueGoals,
      wpcGoals,
      uclGoals,
      uelGoals,
      ueclGoals,
      totalGoals: totalGoldenBootGoals,
      score: goldenBootScore,
      scoreFormatted: goldenBootScoreFormatted
    }
  };
}

/**
 * Calculates match-derived statistics for an array of players with unified identity matching
 */
export function calculateAllPlayerStatsFromMatches(
  players: Player[],
  matches: Match[]
): Map<string, ComputedPlayerStats> {
  const aliasMap = buildPlayerAliasMap(players);
  const map = new Map<string, ComputedPlayerStats>();
  players.forEach((p) => {
    const stats = calculatePlayerStatsFromMatches(p, matches, aliasMap);
    map.set(p.pname, stats);
    const docId = (p as any).id || (p as any).docId;
    if (docId) {
      map.set(docId, stats);
    }
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
    // If player is not active, do not include in player rankings
    if (matchedP && matchedP.notactive === true) {
      continue;
    }

    const isNoClub = matchedP ? matchedP.noclub === true : false;
    const currentTeam = matchedP
      ? (isNoClub ? 'Takımsız' : ((matchedP.kiralik && matchedP.kiralikTakim) ? matchedP.kiralikTakim : matchedP.pteam))
      : '';
    const photo =
      matchedP?.foto ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(pName)}&background=800000&color=fff&size=56`;

    const playerMatches = matchedP ? calculatePlayerStatsFromMatches(matchedP, matches).mac : 0;
    const scoredTeams = Array.from(playerScoredTeamsMap.get(pName) || []);

    // Construct team description text:
    let scoredTeamsText = '';
    const mainScoredTeam = scoredTeams[0] || currentTeam;
    if (isNoClub && scoredTeams.length > 0) {
      scoredTeamsText = `${scoredTeams.join(', ')} Formasıyla (Şu an: Takımsız)`;
    } else if (isNoClub) {
      scoredTeamsText = 'Takımsız';
    } else if (scoredTeams.length > 0 && currentTeam && !scoredTeams.some(st => normalizePlayerName(st) === normalizePlayerName(currentTeam))) {
      // Player scored own goal for a team different from their current team!
      scoredTeamsText = `${scoredTeams.join(', ')} Formasıyla (Şu an: ${currentTeam})`;
    } else if (scoredTeams.length > 0) {
      scoredTeamsText = scoredTeams.join(', ');
    } else {
      scoredTeamsText = currentTeam || '-';
    }

    allPlayers.push({
      name: pName,
      team: isNoClub ? '' : mainScoredTeam,
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

    // Merge tournament matches (from local storage, brackets, and defaults)
    const mergedMatchesList = mergeTournamentMatches(matchesList);

    const playersList: Player[] = [];
    playersSnap.forEach((pdoc) => {
      playersList.push({ id: pdoc.id, docId: pdoc.id, ...pdoc.data() } as Player);
    });

    const aliasMap = buildPlayerAliasMap(playersList);

    let batch = writeBatch(db);
    let opCount = 0;
    let totalUpdated = 0;

    for (let i = 0; i < playersSnap.docs.length; i++) {
      const pdoc = playersSnap.docs[i];
      const pItem = playersList[i];
      if (!pItem.pname) continue;

      const stats = calculatePlayerStatsFromMatches(pItem, mergedMatchesList, aliasMap);

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
