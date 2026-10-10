import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

export async function recalculateStandings() {
  try {
    const teamsSnap = await getDocs(collection(db, 'teams'));
    const matchesSnap = await getDocs(collection(db, 'matches'));

    const teamData: Record<string, {
      played: number;
      wins: number;
      draws: number;
      losses: number;
      atilan: number;
      yenilen: number;
      points: number;
      kgw: number;
      kgb: number;
      kgl: number;
      kgatilan: number;
      kgyenilen: number;
      kgpuan: number;
    }> = {};

    // Build mapping from lowercase display name or doc ID to the actual doc ID
    const teamDocIdMap = new Map<string, string>();
    teamsSnap.forEach((tdoc) => {
      const docId = tdoc.id;
      const data = tdoc.data();
      const nameField = (data.name || '').trim();
      
      if (nameField) {
        teamDocIdMap.set(nameField.toLowerCase(), docId);
      }
      teamDocIdMap.set(docId.toLowerCase(), docId);

      // Initialize teamData using real doc IDs
      teamData[docId] = {
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        atilan: 0,
        yenilen: 0,
        points: 0,
        kgw: 0,
        kgb: 0,
        kgl: 0,
        kgatilan: 0,
        kgyenilen: 0,
        kgpuan: 0,
      };
    });

    matchesSnap.forEach((mdoc) => {
      const m = mdoc.data();
      if (!m.played) return;

      const score1 = Number(m.score1) || 0;
      const score2 = Number(m.score2) || 0;
      const t1Display = (m.team1 || '').trim();
      const t2Display = (m.team2 || '').trim();

      // Resolve display name to exact document ID in teams collection
      const t1 = teamDocIdMap.get(t1Display.toLowerCase()) || t1Display;
      const t2 = teamDocIdMap.get(t2Display.toLowerCase()) || t2Display;

      // Ensure team data exists in our dictionary
      if (!teamData[t1]) {
        teamData[t1] = { played: 0, wins: 0, draws: 0, losses: 0, atilan: 0, yenilen: 0, points: 0, kgw: 0, kgb: 0, kgl: 0, kgatilan: 0, kgyenilen: 0, kgpuan: 0 };
      }
      if (!teamData[t2]) {
        teamData[t2] = { played: 0, wins: 0, draws: 0, losses: 0, atilan: 0, yenilen: 0, points: 0, kgw: 0, kgb: 0, kgl: 0, kgatilan: 0, kgyenilen: 0, kgpuan: 0 };
      }

      // Is it a normal league match or World Peace Cup match?
      // m.category options: "LİG MAÇI", "TURNUVA", "UCL", "UEL", "UECL" etc.
      // If category is "TURNUVA", it is World Peace Cup (WPC).
      // Otherwise, if ligm is true, or category is "LİG MAÇI", or if there is no category, it counts as league match.
      const cat = (m.category || '').trim().toUpperCase();
      const cleanCat = cat
        .replace(/İ/g, 'I')
        .replace(/ı/g, 'i')
        .replace(/Ğ/g, 'G')
        .replace(/Ş/g, 'S')
        .replace(/Ü/g, 'U')
        .replace(/Ö/g, 'O')
        .replace(/Ç/g, 'C');

      const isWpc = cleanCat === 'TURNUVA';
      const isLeague = !isWpc && cleanCat !== 'UCL' && cleanCat !== 'UEL' && cleanCat !== 'UECL';

      if (isLeague) {
        teamData[t1].played += 1;
        teamData[t2].played += 1;
        teamData[t1].atilan += score1;
        teamData[t1].yenilen += score2;
        teamData[t2].atilan += score2;
        teamData[t2].yenilen += score1;

        if (score1 > score2) {
          teamData[t1].wins += 1;
          teamData[t1].points += 3;
          teamData[t2].losses += 1;
        } else if (score1 < score2) {
          teamData[t2].wins += 1;
          teamData[t2].points += 3;
          teamData[t1].losses += 1;
        } else {
          teamData[t1].draws += 1;
          teamData[t1].points += 1;
          teamData[t2].draws += 1;
          teamData[t2].points += 1;
        }
      } else if (isWpc) {
        teamData[t1].kgatilan += score1;
        teamData[t1].kgyenilen += score2;
        teamData[t2].kgatilan += score2;
        teamData[t2].kgyenilen += score1;

        if (score1 > score2) {
          teamData[t1].kgw += 1;
          teamData[t1].kgpuan += 3;
          teamData[t2].kgl += 1;
        } else if (score1 < score2) {
          teamData[t2].kgw += 1;
          teamData[t2].kgpuan += 3;
          teamData[t1].kgl += 1;
        } else {
          teamData[t1].kgb += 1;
          teamData[t1].kgpuan += 1;
          teamData[t2].kgb += 1;
          teamData[t2].kgpuan += 1;
        }
      }
    });

    const existingTeams = new Set<string>();
    teamsSnap.forEach((tdoc) => {
      existingTeams.add(tdoc.id);
    });

    const batch = writeBatch(db);
    Object.keys(teamData).forEach((teamName) => {
      if (!existingTeams.has(teamName)) {
        console.warn(`Team "${teamName}" does not exist in teams collection. Skipping standing update to prevent Firestore crash.`);
        return;
      }
      const ref = doc(db, 'teams', teamName);
      const stats = teamData[teamName];
      batch.update(ref, {
        played: stats.played,
        wins: stats.wins,
        draws: stats.draws,
        losses: stats.losses,
        "atilan gol": stats.atilan,
        "yenilen gol": stats.yenilen,
        points: stats.points,
        kgw: stats.kgw,
        kgb: stats.kgb,
        kgl: stats.kgl,
        kgatilan: stats.kgatilan,
        kgyenilen: stats.kgyenilen,
        kgpuan: stats.kgpuan
      });
    });

    await batch.commit();
    console.log("Standings recalculated successfully.");
    
    // Also synchronize player stats from matches
    await recalculatePlayerStats();
  } catch (err) {
    console.error("Error recalculating standings:", err);
  }
}

import { syncPlayerStatsToFirestore } from './playerStats';

export async function recalculatePlayerStats() {
  try {
    await syncPlayerStatsToFirestore();
    console.log("Player stats recalculated from matches successfully.");
  } catch (err) {
    console.error("Error recalculating player stats:", err);
  }
}

export const recalculatePlayerRatings = recalculatePlayerStats;
