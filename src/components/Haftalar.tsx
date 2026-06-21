import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Match } from '../types';

interface HaftalarProps {
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
}

export default function Haftalar({ currentLang, translations, onNavigate, teamLogos }: HaftalarProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "matches"), (snap) => {
      const list: Match[] = [];
      snap.forEach(doc => {
        const m = doc.data() as Match;
        // Verify that this is a regular league match (week is numeric)
        const weekNum = Number(m.hafta);
        // Ensure m.isWorldCup is not true
        if (m.hafta && !isNaN(weekNum) && !(m as any).isWorldCup) {
          list.push(m);
        }
      });
      // Sort matches by datejav
      setMatches(list);
      
      // Determine default active week (first week that has unplayed matches, or the last week)
      if (list.length > 0) {
        const weeks = Array.from(new Set(list.map(m => Number(m.hafta)))).sort((a,b) => a - b);
        const firstUnplayedWeek = weeks.find(w => 
          list.some(m => Number(m.hafta) === w && !m.played)
        );
        setSelectedWeek(firstUnplayedWeek || weeks[weeks.length - 1] || 1);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const t = translations[currentLang];

  // Group matches by week
  const grouped: Record<number, Match[]> = {};
  matches.forEach(m => {
    const w = Number(m.hafta);
    if (!grouped[w]) grouped[w] = [];
    grouped[w].push(m);
  });

  const weekNumbers = Object.keys(grouped).map(Number).sort((a,b) => a - b);

  return (
    <div className="space-y-6">
      {loading ? (
        <h3 className="text-center text-gray-500 font-bold">{t.loading}</h3>
      ) : weekNumbers.length === 0 ? (
        <h3 className="text-center text-gray-500 font-bold">Henüz maç fikstürü eklenmemiş.</h3>
      ) : (
        <div className="space-y-8 animate-fade-in">
          {/* Week Horizontal Navigation */}
          <div className="flex gap-4 overflow-x-auto py-3 justify-start md:justify-center border-b border-brand-cream pb-4">
            {weekNumbers.map((wNum) => {
              const weekMatches = grouped[wNum] || [];
              const unplayedCount = weekMatches.filter(m => !m.played).length;
              const isActive = selectedWeek === wNum;
              return (
                <div key={wNum} className="flex flex-col items-center gap-1.5 min-w-[110px] pb-2">
                  <button
                    onClick={() => setSelectedWeek(wNum)}
                    className={`py-2.5 px-4 rounded-xl font-black text-xs uppercase cursor-pointer border-2 transition-all w-full text-center ${
                      isActive
                        ? 'bg-brand-maroon text-white border-[#5c0101] shadow-[0_3px_0_0_#5c0101] translate-y-0.5'
                        : 'bg-[#d7cdb7] text-brand-maroon border-brand-maroon shadow-[0_3px_0_0_#800000] hover:bg-[#cbbfa6]'
                    }`}
                  >
                    {wNum}. {t.wText || (currentLang === 'tr' ? 'Hafta' : 'Week')}
                  </button>
                  {unplayedCount > 0 && (
                    <span className="text-[9px] font-black text-brand-maroon/75 tracking-wider uppercase mt-1">
                      {unplayedCount} {t.unplayed || (currentLang === 'tr' ? 'OYNANMAMIŞ' : 'UNPLAYED')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Matches List for selected Week */}
          <div className="max-w-2xl mx-auto space-y-6">
            {(() => {
              const selectedMatches = (grouped[selectedWeek] || []).slice();
              // Sort by played status: unplayed first, played last
              selectedMatches.sort((a,b) => (a.played ? 1 : 0) - (b.played ? 0 : 1));

              if (selectedMatches.length === 0) {
                return <p className="text-center text-gray-400 font-bold">Bu haftaya ait maç bulunmuyor.</p>;
              }

              return selectedMatches.map((m, idx) => {
                const docId = `${m.team1}-vs-${m.team2}-${m.datejav}`;
                return (
                  <div 
                    key={idx}
                    onClick={() => onNavigate({ type: 'match-detail', matchId: docId })}
                    className="relative cursor-pointer transition-transform hover:scale-[1.01] animate-fade-in select-text"
                  >
                    <div className="absolute -top-3.5 left-4 bg-brand-gold text-brand-dark px-3 py-1 rounded-full text-[9px] font-black uppercase border border-brand-dark z-10 shadow-sm">
                      {m.ligm ? t.ligm : t.cupm}
                    </div>

                    <div className="bg-white rounded-3xl p-5 md:p-6 border-b-6 border-brand-maroon shadow-md relative overflow-hidden">
                      <div className="text-center text-[11px] font-bold text-gray-500 mb-3 block">
                        📅 {m.date || '---'}
                      </div>
                      
                      <div className="flex items-center justify-between gap-2">
                        {/* Team 1 */}
                        <div className="flex-1 flex items-center justify-end gap-3 text-right">
                          <span className="font-black text-sm md:text-lg text-brand-dark leading-tight">{m.team1}</span>
                          <img 
                            src={teamLogos[m.team1] || 'https://via.placeholder.com/40?text=?'} 
                            className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover border-2 border-gray-100 bg-white shadow-sm shrink-0" 
                            alt="logo" 
                          />
                        </div>

                        {/* Versus / Score display */}
                        <div className="px-4 py-2 bg-brand-dark text-brand-gold rounded-2xl font-black text-base md:text-2xl min-w-[70px] md:min-w-[90px] text-center border-2 border-brand-gold">
                          {m.played ? `${m.score1} - ${m.score2}` : 'VS'}
                        </div>

                        {/* Team 2 */}
                        <div className="flex-1 flex items-center justify-start gap-3 text-left">
                          <img 
                            src={teamLogos[m.team2] || 'https://via.placeholder.com/40?text=?'} 
                            className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover border-2 border-gray-100 bg-white shadow-sm shrink-0" 
                            alt="logo" 
                          />
                          <span className="font-black text-sm md:text-lg text-brand-dark leading-tight">{m.team2}</span>
                        </div>
                      </div>
                    </div>

                    {/* MVP Subscript bar */}
                    {m.played && m.mvp && (
                      <div className="bg-brand-dark text-brand-gold py-2 px-6 rounded-b-2xl text-[10px] md:text-xs font-bold flex justify-between items-center -mt-3.5 mx-4 border-t border-brand-gold/30 shadow-md">
                        <span>👑 {t.mvp}: <strong className="text-white uppercase">{m.mvp}</strong></span>
                        <span className="text-brand-gold">★ {m.rating || '0.0'}</span>
                      </div>
                    )}
                  </div>
                );
              })
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
