import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Team, Match } from '../types';
import { recalculateStandings } from '../lib/standings';
import { getMatchCompetitionType } from '../lib/playerStats';
import { normalizeTeamName } from '../lib/tournamentMatches';

interface PuanDurumuProps {
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onNavigate: (view: any) => void;
}

export default function PuanDurumu({ currentLang, translations, onNavigate }: PuanDurumuProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Automatically trigger recalculation of standings to ensure Firestore has correct values
    recalculateStandings().catch(console.error);
  }, []);

  useEffect(() => {
    let teamsList: { id: string; data: any }[] = [];
    let matchesList: Match[] = [];

    const computeAndSetStandings = () => {
      if (teamsList.length === 0) return;

      const teamDocIdMap = new Map<string, string>();
      const calculatedStats: Record<string, {
        name: string;
        logo: string;
        played: number;
        wins: number;
        draws: number;
        losses: number;
        atilan: number;
        yenilen: number;
        points: number;
      }> = {};

      teamsList.forEach(({ id, data }) => {
        const nameField = (data.name || '').trim();
        const docId = id.trim();

        if (nameField) {
          teamDocIdMap.set(nameField.toLowerCase(), docId);
          teamDocIdMap.set(normalizeTeamName(nameField).toLowerCase(), docId);
        }
        teamDocIdMap.set(docId.toLowerCase(), docId);
        teamDocIdMap.set(normalizeTeamName(docId).toLowerCase(), docId);

        calculatedStats[docId] = {
          name: nameField || docId,
          logo: data.logo || '',
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          atilan: 0,
          yenilen: 0,
          points: 0
        };
      });

      matchesList.forEach((m) => {
        if (!m.played) return;

        // Isolate tournament & cup matches
        const comp = getMatchCompetitionType(m);
        if (comp !== 'league' || m.ligm === false) return;

        const cat = String(m.category ?? '').trim().toUpperCase();
        const hafta = String(m.hafta ?? '').trim().toUpperCase();
        if (
          cat === 'BEL' || cat === 'BCL' || cat === 'BECL' || cat === 'TURNUVA' || cat === 'WPC' ||
          hafta.includes('FINAL') || hafta.includes('YARI') || hafta.includes('CEYREK') ||
          (m as any).round !== undefined || (m as any).bracketId !== undefined
        ) return;

        const score1 = Number(m.score1) || 0;
        const score2 = Number(m.score2) || 0;
        const t1Display = (m.team1 || '').trim();
        const t2Display = (m.team2 || '').trim();

        const t1 = teamDocIdMap.get(t1Display.toLowerCase()) || 
                   teamDocIdMap.get(normalizeTeamName(t1Display).toLowerCase()) || t1Display;
        const t2 = teamDocIdMap.get(t2Display.toLowerCase()) || 
                   teamDocIdMap.get(normalizeTeamName(t2Display).toLowerCase()) || t2Display;

        if (!calculatedStats[t1]) {
          calculatedStats[t1] = { name: t1Display, logo: '', played: 0, wins: 0, draws: 0, losses: 0, atilan: 0, yenilen: 0, points: 0 };
        }
        if (!calculatedStats[t2]) {
          calculatedStats[t2] = { name: t2Display, logo: '', played: 0, wins: 0, draws: 0, losses: 0, atilan: 0, yenilen: 0, points: 0 };
        }

        const isT1Bob = t1Display.toLowerCase().trim() === 'bobblica' || t1.toLowerCase().trim() === 'bobblica' || t1.toLowerCase().trim() === 'hiyar city';
        const isT2Bob = t2Display.toLowerCase().trim() === 'bobblica' || t2.toLowerCase().trim() === 'bobblica' || t2.toLowerCase().trim() === 'hiyar city';
        const isBobblicaLoss = (isT1Bob && score2 > score1) || (isT2Bob && score1 > score2);

        calculatedStats[t1].played += 1;
        calculatedStats[t2].played += 1;

        if (!isBobblicaLoss) {
          calculatedStats[t1].atilan += score1;
          calculatedStats[t1].yenilen += score2;
          calculatedStats[t2].atilan += score2;
          calculatedStats[t2].yenilen += score1;
        }

        if (score1 > score2) {
          calculatedStats[t1].wins += 1;
          calculatedStats[t1].points += 3;
          calculatedStats[t2].losses += 1;
        } else if (score1 < score2) {
          calculatedStats[t2].wins += 1;
          calculatedStats[t2].points += 3;
          calculatedStats[t1].losses += 1;
        } else {
          calculatedStats[t1].draws += 1;
          calculatedStats[t1].points += 1;
          calculatedStats[t2].draws += 1;
          calculatedStats[t2].points += 1;
        }
      });

      const list: Team[] = Object.values(calculatedStats).map((st) => ({
        name: st.name,
        logo: st.logo,
        played: st.played,
        wins: st.wins,
        draws: st.draws,
        losses: st.losses,
        "atilan gol": st.atilan,
        "yenilen gol": st.yenilen,
        points: st.points
      } as Team));

      // Sort by points desc, then goal difference (av) desc
      list.sort((a, b) => {
        const avA = (a["atilan gol"] || 0) - (a["yenilen gol"] || 0);
        const avB = (b["atilan gol"] || 0) - (b["yenilen gol"] || 0);
        if ((b.points || 0) !== (a.points || 0)) {
          return (b.points || 0) - (a.points || 0);
        }
        return avB - avA;
      });

      setTeams(list);
      setLoading(false);
    };

    const unsubTeams = onSnapshot(collection(db, 'teams'), (snap) => {
      teamsList = snap.docs.map(d => ({ id: d.id, data: d.data() }));
      computeAndSetStandings();
    });

    const unsubMatches = onSnapshot(collection(db, 'matches'), (snap) => {
      matchesList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
      computeAndSetStandings();
    });

    return () => {
      unsubTeams();
      unsubMatches();
    };
  }, []);

  const t = translations[currentLang];

  return (
    <div className="bg-brand-card rounded-3xl overflow-hidden border-b-8 border-brand-maroon shadow-md">
      {loading ? (
        <h3 className="text-center p-8 text-brand-maroon font-bold">{t.loading}</h3>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-brand-dark border-collapse">
            <thead>
              <tr className="bg-brand-maroon text-brand-gold border-b-2 border-brand-gold text-[11px] font-black uppercase tracking-wider">
                <th className="py-4 px-4 text-center w-16">#</th>
                <th className="py-4 px-4 text-left">{t.takim || (currentLang === 'tr' ? 'TAKIM' : currentLang === 'en' ? 'TEAM' : 'TIME')}</th>
                <th className="py-4 px-3 text-center">O</th>
                <th className="py-4 px-3 text-center">G</th>
                <th className="py-4 px-3 text-center">B</th>
                <th className="py-4 px-3 text-center">M</th>
                <th className="py-4 px-3 text-center">AV</th>
                <th className="py-4 px-4 text-center w-24">P</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team, i) => {
                const av = (team["atilan gol"] || 0) - (team["yenilen gol"] || 0);
                const avColor = av > 0 ? 'text-green-600' : av < 0 ? 'text-red-600' : 'text-gray-500';
                
                // Color sidebar classification
                let borderClass = 'border-l-[8px] border-l-transparent';
                if (i < 4) {
                  borderClass = 'border-l-[8px] border-l-ucl-blue';
                } else if (i < 8) {
                  borderClass = 'border-l-[8px] border-[#ff8800]'; // uel orange
                } else if (i >= teams.length - 4) {
                  borderClass = 'border-l-[8px] border-l-uecl-green';
                }

                return (
                  <tr 
                    key={team.name}
                    onClick={() => onNavigate({ type: 'team-detail', teamName: team.name })}
                    className={`border-b border-brand-cream hover:bg-brand-cream/40 cursor-pointer transition-colors ${borderClass}`}
                  >
                    <td className="py-3 px-3 text-center font-black text-brand-maroon text-lg">{i + 1}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img 
                          src={team.logo} 
                          className="w-9 h-9 rounded-full bg-white object-cover border-2 border-brand-gold shrink-0 shadow-sm" 
                          alt="logo" 
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/36?text=?';
                          }}
                        />
                        <span className="font-extrabold text-sm tracking-wide text-brand-dark">{team.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-sm text-brand-dark">{team.played}</td>
                    <td className="py-3 px-3 text-center font-bold text-sm text-brand-dark">{team.wins}</td>
                    <td className="py-3 px-3 text-center font-bold text-sm text-brand-dark">{team.draws}</td>
                    <td className="py-3 px-3 text-center font-bold text-sm text-brand-dark">{team.losses}</td>
                    <td className={`py-3 px-3 text-center font-extrabold text-sm ${avColor}`}>
                      {av > 0 ? '+' : ''}{av}
                    </td>
                    <td className="py-3 px-4 text-center font-black text-xl text-brand-maroon">{team.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
