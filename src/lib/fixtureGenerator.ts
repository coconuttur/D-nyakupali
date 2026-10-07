import { Match } from '../types';
import { doc, setDoc, Firestore } from 'firebase/firestore';

export interface FixturePair {
  home: string;
  away: string;
}

// Canonical first leg league fixtures (Weeks 1 to 11)
export const FIRST_LEG_LEAGUE_FIXTURES: Record<number, FixturePair[]> = {
  1: [
    { home: 'Döner FC', away: 'Bobblica' },
    { home: 'Holy Munchen', away: 'DeathEagle' },
    { home: 'Hendrix United', away: 'Sp5der Jack' },
    { home: 'KFCspor', away: 'Leogard' },
    { home: 'Pofuspor', away: 'Realyon' },
    { home: 'Xeilmes', away: 'New Hollands' },
  ],
  2: [
    { home: 'Döner FC', away: 'Sp5der Jack' },
    { home: 'Hendrix United', away: 'New Hollands' },
    { home: 'KFCspor', away: 'Bobblica' },
    { home: 'Leogard', away: 'Holy Munchen' },
    { home: 'Pofuspor', away: 'DeathEagle' },
    { home: 'Xeilmes', away: 'Realyon' },
  ],
  3: [
    { home: 'Pofuspor', away: 'Leogard' },
    { home: 'Döner FC', away: 'Hendrix United' },
    { home: 'Holy Munchen', away: 'Bobblica' },
    { home: 'KFCspor', away: 'Sp5der Jack' },
    { home: 'Realyon', away: 'New Hollands' },
    { home: 'Xeilmes', away: 'DeathEagle' },
  ],
  4: [
    { home: 'DeathEagle', away: 'New Hollands' },
    { home: 'Döner FC', away: 'KFCspor' },
    { home: 'Pofuspor', away: 'Bobblica' },
    { home: 'Sp5der Jack', away: 'Holy Munchen' },
    { home: 'Realyon', away: 'Hendrix United' },
    { home: 'Leogard', away: 'Xeilmes' },
  ],
  5: [
    { home: 'Bobblica', away: 'Xeilmes' },
    { home: 'DeathEagle', away: 'Realyon' },
    { home: 'Döner FC', away: 'Holy Munchen' },
    { home: 'Hendrix United', away: 'KFCspor' },
    { home: 'Leogard', away: 'New Hollands' },
    { home: 'Sp5der Jack', away: 'Pofuspor' },
  ],
  6: [
    { home: 'Bobblica', away: 'New Hollands' },
    { home: 'DeathEagle', away: 'Hendrix United' },
    { home: 'Döner FC', away: 'Pofuspor' },
    { home: 'Holy Munchen', away: 'KFCspor' },
    { home: 'Leogard', away: 'Realyon' },
    { home: 'Sp5der Jack', away: 'Xeilmes' },
  ],
  7: [
    { home: 'Bobblica', away: 'Realyon' },
    { home: 'Döner FC', away: 'Xeilmes' },
    { home: 'Holy Munchen', away: 'Hendrix United' },
    { home: 'Leogard', away: 'DeathEagle' },
    { home: 'Pofuspor', away: 'KFCspor' },
    { home: 'Sp5der Jack', away: 'New Hollands' },
  ],
  8: [
    { home: 'Bobblica', away: 'DeathEagle' },
    { home: 'Döner FC', away: 'New Hollands' },
    { home: 'KFCspor', away: 'Xeilmes' },
    { home: 'Leogard', away: 'Hendrix United' },
    { home: 'Pofuspor', away: 'Holy Munchen' },
    { home: 'Sp5der Jack', away: 'Realyon' },
  ],
  9: [
    { home: 'Bobblica', away: 'Leogard' },
    { home: 'Döner FC', away: 'Realyon' },
    { home: 'Holy Munchen', away: 'Xeilmes' },
    { home: 'KFCspor', away: 'New Hollands' },
    { home: 'Pofuspor', away: 'Hendrix United' },
    { home: 'Sp5der Jack', away: 'DeathEagle' },
  ],
  10: [
    { home: 'Bobblica', away: 'Hendrix United' },
    { home: 'DeathEagle', away: 'Döner FC' },
    { home: 'Holy Munchen', away: 'New Hollands' },
    { home: 'KFCspor', away: 'Realyon' },
    { home: 'Pofuspor', away: 'Xeilmes' },
    { home: 'Sp5der Jack', away: 'Leogard' },
  ],
  11: [
    { home: 'DeathEagle', away: 'KFCspor' },
    { home: 'Döner FC', away: 'Leogard' },
    { home: 'Holy Munchen', away: 'Realyon' },
    { home: 'Pofuspor', away: 'New Hollands' },
    { home: 'Sp5der Jack', away: 'Bobblica' },
    { home: 'Xeilmes', away: 'Hendrix United' },
  ],
};

/**
 * Returns canonical rematch fixtures for weeks 12 to 22.
 * Week 12 = Rematches of Week 1 (Home/Away inverted)
 * Week 13 = Rematches of Week 2
 * ...
 * Week 22 = Rematches of Week 11
 */
export function getReturnLeagueFixtures(weekNum: number): FixturePair[] {
  if (weekNum < 12 || weekNum > 22) return [];
  const firstLegWeek = weekNum - 11;
  const pairs = FIRST_LEG_LEAGUE_FIXTURES[firstLegWeek] || [];
  // Rövanş: Swap home and away
  return pairs.map(p => ({
    home: p.away,
    away: p.home,
  }));
}

/**
 * Merges raw Firestore matches with generated return fixtures for weeks 12-22
 * so that any week 12-22 that hasn't been saved to Firestore yet is still
 * fully visible in the UI and included in ELO season simulations.
 */
export function getAllSeasonMatches(firestoreMatches: Match[]): Match[] {
  const result: Match[] = [...firestoreMatches];
  const existingKeys = new Set<string>();

  firestoreMatches.forEach(m => {
    const w = Number(m.hafta);
    if (!isNaN(w)) {
      existingKeys.add(`${w}_${(m.team1 || '').toLowerCase()}_${(m.team2 || '').toLowerCase()}`);
    }
  });

  const baseTimestamp = 1735689600000; // scheduled reference timestamp

  for (let w = 12; w <= 22; w++) {
    const returnPairs = getReturnLeagueFixtures(w);
    returnPairs.forEach((pair, idx) => {
      const key = `${w}_${pair.home.toLowerCase()}_${pair.away.toLowerCase()}`;
      if (!existingKeys.has(key)) {
        const datejav = baseTimestamp + (w * 86400000 * 7) + (idx * 3600000);
        const generatedMatch: Match = {
          id: `${pair.home}-vs-${pair.away}-H${w}`,
          team1: pair.home,
          team2: pair.away,
          score1: '0',
          score2: '0',
          played: false,
          hafta: String(w),
          date: '---',
          datejav,
          ligm: true,
          category: 'LİG MAÇI',
          timeline: [],
        };
        result.push(generatedMatch);
        existingKeys.add(key);
      }
    });
  }

  return result;
}

/**
 * Persists all missing return fixtures (weeks 12-22) to Firestore.
 * Called by admin from the UI.
 */
export async function saveReturnFixturesToFirestore(
  db: Firestore,
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  let savedCount = 0;
  const total = 11 * 6; // 66 matches
  const baseTimestamp = Date.now();

  for (let w = 12; w <= 22; w++) {
    const returnPairs = getReturnLeagueFixtures(w);
    for (let idx = 0; idx < returnPairs.length; idx++) {
      const pair = returnPairs[idx];
      const docId = `${pair.home}-vs-${pair.away}-H${w}`;
      const datejav = baseTimestamp + (w * 86400000) + (idx * 60000);

      const matchData: Match = {
        team1: pair.home,
        team2: pair.away,
        score1: '0',
        score2: '0',
        played: false,
        hafta: String(w),
        date: '---',
        datejav,
        ligm: true,
        category: 'LİG MAÇI',
        timeline: [],
      };

      await setDoc(doc(db, 'matches', docId), matchData);
      savedCount++;
      if (onProgress) {
        onProgress(savedCount, total);
      }
    }
  }

  return savedCount;
}
