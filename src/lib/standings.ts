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

    teamsSnap.forEach((tdoc) => {
      const name = tdoc.id;
      teamData[name] = {
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
      const t1 = m.team1;
      const t2 = m.team2;

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
      const isLeague = m.category === "LİG MAÇI" || m.ligm === true || (!m.category && m.ligm !== false);
      const isWpc = m.category === "TURNUVA" || m.ligm === false;

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

    const batch = writeBatch(db);
    Object.keys(teamData).forEach((teamName) => {
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
  } catch (err) {
    console.error("Error recalculating standings:", err);
  }
}

export async function recalculatePlayerRatings() {
  try {
    const playersSnap = await getDocs(collection(db, 'players'));
    const matchesSnap = await getDocs(collection(db, 'matches'));

    const batch = writeBatch(db);

    playersSnap.forEach((pdoc) => {
      const pname = pdoc.data().pname;
      if (!pname) return;

      const pnameUpper = pname.trim().toUpperCase();
      let totalRating = 0;
      let ratedMatchCount = 0;
      let playedMatchCount = 0;

      matchesSnap.forEach((mdoc) => {
        const m = mdoc.data();
        if (!m.played) return;

        // Lineup can be stored in m.lineup
        const lineup = m.lineup || {};
        
        // Find player in lineup by checking case-insensitive or exact match
        let playerLineup = lineup[pname];
        if (!playerLineup) {
          // Fallback to case-insensitive check
          const foundKey = Object.keys(lineup).find(k => k.trim().toUpperCase() === pnameUpper);
          if (foundKey) {
            playerLineup = lineup[foundKey];
          }
        }

        if (playerLineup) {
          // If they played in this match
          if (playerLineup.played) {
            playedMatchCount += 1;
            const ratingVal = Number(playerLineup.rating);
            if (!isNaN(ratingVal) && ratingVal > 0) {
              totalRating += ratingVal;
              ratedMatchCount += 1;
            }
          }
        }
      });

      const updates: Record<string, any> = {};
      if (ratedMatchCount > 0) {
        const avgRating = totalRating / ratedMatchCount;
        updates.ratingoy = avgRating.toFixed(2);
      }
      
      if (playedMatchCount > 0) {
        updates.poyn = playedMatchCount;
      }

      if (Object.keys(updates).length > 0) {
        batch.update(pdoc.ref, updates);
      }
    });

    await batch.commit();
    console.log("Player ratings recalculated successfully.");
  } catch (err) {
    console.error("Error recalculating player ratings:", err);
  }
}
