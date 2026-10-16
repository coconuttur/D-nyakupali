import { collection, getDocs, doc, setDoc, updateDoc, Firestore } from 'firebase/firestore';
import { recalculateStandings } from './standings';

export const BOBBLICA_SECOND_LEG_FIXTURES = [
  { week: 12, home: 'Bobblica', away: 'Döner FC' },
  { week: 13, home: 'Bobblica', away: 'KFCspor' },
  { week: 14, home: 'Bobblica', away: 'Holy Munchen' },
  { week: 15, home: 'Bobblica', away: 'Pofuspor' },
  { week: 16, home: 'Xeilmes', away: 'Bobblica' },
  { week: 17, home: 'New Hollands', away: 'Bobblica' },
  { week: 18, home: 'Realyon', away: 'Bobblica' },
  { week: 19, home: 'DeathEagle', away: 'Bobblica' },
  { week: 20, home: 'Leogard', away: 'Bobblica' },
  { week: 21, home: 'Hendrix United', away: 'Bobblica' },
  { week: 22, home: 'Bobblica', away: 'Sp5der Jack' }
];

export async function forfeitBobblicaAllMatches(
  db: Firestore,
  onProgress?: (current: number, total: number) => void
): Promise<{ updatedCount: number; message: string }> {
  // 1. Fetch Bobblica players so we know who to scrub from stats
  const pSnap = await getDocs(collection(db, 'players'));
  const bobblicaPlayerNames = new Set<string>();
  const bobblicaPlayerDocIds: string[] = [];

  pSnap.forEach((d) => {
    const p = d.data();
    const pt = (p.pteam || '').toLowerCase().trim();
    const kt = (p.kiralikTakim || '').toLowerCase().trim();
    if (pt === 'bobblica' || kt === 'bobblica') {
      bobblicaPlayerNames.add((p.pname || '').toLowerCase().trim());
      bobblicaPlayerDocIds.push(d.id);
    }
  });

  // Also include known Bobblica squad players
  ['paul pogba', 'rayan cherki', 'fredrik aursnes', 'peixinho', 'alperen şengün', 'alperen sengun', 'ja morant'].forEach(n => {
    bobblicaPlayerNames.add(n);
  });

  // 2. Fetch all matches
  const mSnap = await getDocs(collection(db, 'matches'));
  let count = 0;
  const total = 22;

  // Check 1st leg matches (Weeks 1 to 11)
  const firstLegBobMatches: { docId: string; data: any }[] = [];
  mSnap.forEach((d) => {
    const data = d.data();
    const t1 = (data.team1 || '').toLowerCase().trim();
    const t2 = (data.team2 || '').toLowerCase().trim();
    if (t1 === 'bobblica' || t2 === 'bobblica') {
      firstLegBobMatches.push({ docId: d.id, data });
    }
  });

  for (const item of firstLegBobMatches) {
    const isT1 = (item.data.team1 || '').toLowerCase().trim() === 'bobblica';
    const s1 = isT1 ? '0' : '6';
    const s2 = isT1 ? '6' : '0';

    // Scrub Bobblica stats from timeline of played matches
    const oldTimeline = item.data.timeline || [];
    const cleanedTimeline = oldTimeline.filter((evt: any) => {
      // If event belongs to Bobblica side, remove it
      if (isT1 && evt.team === 'team1') return false;
      if (!isT1 && evt.team === 'team2') return false;

      // If event scorer/assist/player belongs to Bobblica squad, remove it
      const scorer = (evt.scorer || '').toLowerCase().trim();
      const assist = (evt.assist || '').toLowerCase().trim();
      const player = (evt.player || '').toLowerCase().trim();
      if (bobblicaPlayerNames.has(scorer)) return false;
      if (bobblicaPlayerNames.has(assist)) return false;
      if (bobblicaPlayerNames.has(player)) return false;

      return true;
    });

    // Add forfeit incident badge if not present
    if (!cleanedTimeline.some((e: any) => e.text?.includes('Hükmen'))) {
      cleanedTimeline.push({
        id: 'evt_forfeit_' + item.docId,
        type: 'incident',
        minute: "90'",
        text: 'Hükmen Sonuç (6-0)'
      });
    }

    // Scrub Bobblica players from match lineup
    const oldLineup = { ...(item.data.lineup || {}) };
    Object.keys(oldLineup).forEach((pName) => {
      if (bobblicaPlayerNames.has(pName.toLowerCase().trim())) {
        delete oldLineup[pName];
      }
    });

    await updateDoc(doc(db, 'matches', item.docId), {
      score1: s1,
      score2: s2,
      played: true,
      ligm: true,
      category: 'LİG MAÇI',
      timeline: cleanedTimeline,
      lineup: oldLineup
    });

    count++;
    if (onProgress) onProgress(count, total);
  }

  // 3. Second leg fixtures (Weeks 12 to 22)
  const baseTimestamp = 1735689600000;
  for (const p of BOBBLICA_SECOND_LEG_FIXTURES) {
    const isT1 = p.home === 'Bobblica';
    const s1 = isT1 ? '0' : '6';
    const s2 = isT1 ? '6' : '0';
    const docId = `${p.home}-vs-${p.away}-H${p.week}`;
    const datejav = baseTimestamp + (p.week * 86400000 * 7);

    await setDoc(
      doc(db, 'matches', docId),
      {
        team1: p.home,
        team2: p.away,
        score1: s1,
        score2: s2,
        played: true,
        hafta: String(p.week),
        date: 'Hükmen (6-0)',
        datejav,
        ligm: true,
        category: 'LİG MAÇI',
        timeline: [
          {
            id: 'evt_forfeit_' + docId,
            type: 'incident',
            minute: "90'",
            text: 'Hükmen Sonuç (6-0)'
          }
        ],
        lineup: {}
      },
      { merge: true }
    );
    count++;
    if (onProgress) onProgress(count, total);
  }

  // 4. Scrub goals & assists from Bobblica players in players collection
  for (const pDocId of bobblicaPlayerDocIds) {
    try {
      await updateDoc(doc(db, 'players', pDocId), {
        goals: 0,
        asistsay: 0
      });
    } catch (e) {
      console.warn('Could not reset player stats for doc:', pDocId, e);
    }
  }

  // 5. Recalculate standings for all teams
  await recalculateStandings();

  return {
    updatedCount: count,
    message: "Bobblica'nın tüm 1. ve 2. devre maçları 6-0 hükmen girildi, oynanan maçlardaki istatistikleri silindi ve puan durumu güncellendi."
  };
}
