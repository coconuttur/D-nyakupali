import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Team } from '../types';

interface PuanDurumuProps {
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onNavigate: (view: any) => void;
}

export default function PuanDurumu({ currentLang, translations, onNavigate }: PuanDurumuProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'teams'), (snap) => {
      const list: Team[] = [];
      snap.forEach((doc) => {
        const d = doc.data();
        const atilan = Number(d["atilan gol"]) || 0;
        const yenilen = Number(d["yenilen gol"]) || 0;
        list.push({
          name: d.name,
          logo: d.logo || '',
          played: Number(d.played) || 0,
          wins: Number(d.wins) || 0,
          draws: Number(d.draws) || 0,
          losses: Number(d.losses) || 0,
          "atilan gol": atilan,
          "yenilen gol": yenilen,
          points: Number(d.points) || 0,
        } as Team);
      });

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
    });

    return () => unsubscribe();
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
