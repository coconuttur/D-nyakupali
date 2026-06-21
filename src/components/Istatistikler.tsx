import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Player } from '../types';

interface IstatistiklerProps {
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
}

type StatType = 'goals' | 'asistsay' | 'gol_mac' | 'gen' | 'ratingoy';

export default function Istatistikler({ currentLang, translations, onNavigate, teamLogos }: IstatistiklerProps) {
  const [activeStat, setActiveStat] = useState<StatType>('goals');
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'players'), (snap) => {
      const list: Player[] = [];
      snap.forEach((doc) => {
        list.push({ ...doc.data() } as Player);
      });
      setPlayers(list);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const t = translations[currentLang];

  const labels = {
    goals: t.gol,
    asistsay: t.asist,
    gol_mac: t.gomac,
    gen: t.gen,
    ratingoy: t.rat,
  };

  const getSortedPlayers = () => {
    return players
      .map((p) => {
        const matches = Number(p.poyn) || 1;
        const goals = Number(p.goals) || 0;
        const ratio = matches > 0 ? goals / matches : 0;
        return {
          ...p,
          gol_mac: Number(ratio.toFixed(2)),
          goals,
          asistsay: Number(p.asistsay) || 0,
          gen: Number(p.gen) || 0,
          ratingoy: Number(p.ratingoy) || 0,
        };
      })
      .sort((a, b) => {
        const valA = a[activeStat] || 0;
        const valB = b[activeStat] || 0;
        return valB - valA;
      });
  };

  const sortedList = getSortedPlayers();

  return (
    <div className="space-y-6">
      {/* Sub tabs list */}
      <div className="flex gap-2 justify-center flex-wrap">
        {(['goals', 'asistsay', 'gol_mac', 'gen', 'ratingoy'] as StatType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveStat(tab)}
            className={`py-2 px-4 rounded-lg font-black text-xs uppercase cursor-pointer border-2 transition-all ${
              activeStat === tab 
                ? 'bg-brand-gold text-brand-dark border-brand-maroon shadow-md' 
                : 'bg-brand-card border-brand-maroon text-brand-maroon/70'
            }`}
          >
            {tab === 'goals' && t.gol + " " + t.kral}
            {tab === 'asistsay' && t.asist + " " + t.kral}
            {tab === 'gol_mac' && t.gomac + " " + t.kral}
            {tab === 'gen' && t.gen + " " + t.lider}
            {tab === 'ratingoy' && t.rat + " " + t.lider}
          </button>
        ))}
      </div>

      {loading ? (
        <h3 className="text-center text-gray-500 font-bold">{t.loading}</h3>
      ) : sortedList.length === 0 ? (
        <h3 className="text-center text-gray-500 font-bold">Yüklenecek istatistik bulunamadı.</h3>
      ) : (
        <div className="max-w-2xl mx-auto space-y-4 animate-fade-in select-text">
          {sortedList.slice(0, 50).map((p, idx) => {
            const rawVal = p[activeStat];
            const displayVal = activeStat === 'ratingoy' ? Number(rawVal).toFixed(2) : rawVal;
            const logo = teamLogos[p.pteam] || 'https://via.placeholder.com/32?text=?';

            return (
              <div 
                key={p.pname}
                onClick={() => onNavigate({ type: 'player-profile', playerName: p.pname })}
                className="bg-brand-card p-4 rounded-2xl flex items-center border-l-12 border-brand-maroon hover:border-l-16 hover:translate-x-1.5 transition-all shadow-sm cursor-pointer"
              >
                <div className="w-12 text-center text-xl font-black text-brand-maroon shrink-0">
                  {idx + 1}.
                </div>

                <img 
                  src={logo} 
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate({ type: 'team-detail', teamName: p.pteam });
                  }}
                  className="w-8 h-8 rounded-full border-2 border-brand-maroon bg-white object-cover shrink-0 cursor-pointer mr-3 shadow-inner" 
                  alt="team" 
                />

                <img 
                  src={p.foto} 
                  className="w-14 h-14 rounded-xl object-cover shrink-0 border-2 border-white shadow-md bg-white mr-4" 
                  alt="player" 
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${p.pname}&background=800000&color=fff&size=56`;
                  }}
                />

                <div className="flex-1 min-w-0">
                  <h4 className="font-extrabold text-sm md:text-base text-brand-dark uppercase truncate">{p.pname}</h4>
                  <span className="text-[10px] md:text-xs font-bold text-gray-500 truncate block uppercase">{p.pteam}</span>
                </div>

                <div className="text-right">
                  <span className="font-black text-2xl md:text-3xl text-brand-maroon leading-none block">{displayVal}</span>
                  <span className="text-[9px] md:text-[10px] font-black uppercase text-gray-400 tracking-wider block">{labels[activeStat]}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
