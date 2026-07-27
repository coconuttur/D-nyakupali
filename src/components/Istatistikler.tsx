import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Player, Team, UserProfile } from '../types';
import { TROPHIES_LIST, TROPHY_MAP } from '../lib/trophies';
import { TrophyDetailModal } from './TrophyDetailModal';

interface IstatistiklerProps {
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
  currentUser?: UserProfile | null;
}

type StatType = 'goals' | 'asistsay' | 'gol_mac' | 'gen' | 'ratingoy' | 't_gen' | 'kupa';

export default function Istatistikler({ currentLang, translations, onNavigate, teamLogos, currentUser = null }: IstatistiklerProps) {
  const [activeStat, setActiveStat] = useState<StatType>('goals');
  const [kupaSubTab, setKupaSubTab] = useState<'teams' | 'players'>('teams');
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [mvpCounts, setMvpCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selectedTrophyId, setSelectedTrophyId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeP = onSnapshot(collection(db, 'players'), (snap) => {
      const list: Player[] = [];
      snap.forEach((doc) => {
        list.push({ ...doc.data() } as Player);
      });
      setPlayers(list);
      setLoading(false);
    });

    const unsubscribeT = onSnapshot(collection(db, 'teams'), (snap) => {
      const list: Team[] = [];
      snap.forEach((doc) => {
        list.push({ ...doc.data() } as Team);
      });
      setTeams(list);
    });

    return () => {
      unsubscribeP();
      unsubscribeT();
    };
  }, []);

  useEffect(() => {
    const unsubscribeMatches = onSnapshot(collection(db, 'matches'), (snap) => {
      const counts: Record<string, number> = {};
      snap.forEach((doc) => {
        const data = doc.data();
        if (data.played && data.mvp) {
          const mvpName = data.mvp.trim().toUpperCase();
          counts[mvpName] = (counts[mvpName] || 0) + 1;
        }
      });
      setMvpCounts(counts);
    });
    return () => unsubscribeMatches();
  }, []);

  const t = translations[currentLang];

  const labels: Record<string, string> = {
    goals: t.gol,
    asistsay: t.asist,
    gol_mac: t.gomac,
    gen: t.gen,
    ratingoy: t.rat,
    t_gen: 'Takım GEN Ort.',
    kupa: 'Toplam Kupa',
  };

  const getTotalTrophies = (kupalar?: Record<string, number>) => {
    if (!kupalar) return 0;
    return Object.values(kupalar).reduce((acc, count) => acc + (Number(count) || 0), 0);
  };

  const getSortedPlayers = () => {
    return players
      .map((p) => {
        const matches = Number(p.poyn) || 1;
        const goals = Number(p.goals) || 0;
        const ratio = matches > 0 ? goals / matches : 0;
        const totalKupa = getTotalTrophies(p.kupalar);
        return {
          ...p,
          gol_mac: Number(ratio.toFixed(2)),
          goals,
          asistsay: Number(p.asistsay) || 0,
          gen: Number(p.gen) || 0,
          ratingoy: Number(p.ratingoy) || 0,
          totalKupa
        };
      })
      .sort((a, b) => {
        if (activeStat === 'kupa') {
          return b.totalKupa - a.totalKupa;
        }
        const valA = (a as any)[activeStat] || 0;
        const valB = (b as any)[activeStat] || 0;
        return valB - valA;
      });
  };

  const getTeamStats = () => {
    const teamsMap: Record<string, { totalGen: number; totalGoals: number; count: number }> = {};
    
    players.forEach((p) => {
      const teamName = (p.pteam || '').trim();
      if (!teamName) return;
      if (!teamsMap[teamName]) {
        teamsMap[teamName] = { totalGen: 0, totalGoals: 0, count: 0 };
      }
      teamsMap[teamName].totalGen += Number(p.gen) || 0;
      teamsMap[teamName].totalGoals += Number(p.goals) || 0;
      teamsMap[teamName].count += 1;
    });

    const teamList = Object.keys(teamsMap).map((teamName) => {
      const data = teamsMap[teamName];
      const avgGen = data.count > 0 ? Number((data.totalGen / data.count).toFixed(2)) : 0;
      const matchingTeam = teams.find(tDoc => tDoc.name === teamName);
      const kupalar = matchingTeam?.kupalar || {};
      const totalKupa = getTotalTrophies(kupalar);

      return {
        teamName,
        avgGen,
        totalGoals: data.totalGoals,
        playerCount: data.count,
        logo: matchingTeam?.logo || teamLogos[teamName] || 'https://via.placeholder.com/32?text=?',
        kupalar,
        totalKupa
      };
    });

    if (activeStat === 't_gen') {
      return teamList.sort((a, b) => b.avgGen - a.avgGen || b.playerCount - a.playerCount);
    } else if (activeStat === 'kupa') {
      return teamList.sort((a, b) => b.totalKupa - a.totalKupa || b.totalGoals - a.totalGoals);
    } else {
      return teamList.sort((a, b) => b.totalGoals - a.totalGoals || b.avgGen - a.avgGen);
    }
  };

  const sortedList = (activeStat === 't_gen' || (activeStat === 'kupa' && kupaSubTab === 'teams')) ? [] : getSortedPlayers();
  const teamList = (activeStat === 't_gen' || (activeStat === 'kupa' && kupaSubTab === 'teams')) ? getTeamStats() : [];

  return (
    <div className="space-y-6">
      {/* Sub tabs list */}
      <div className="flex gap-2 justify-center flex-wrap">
        {(['goals', 'asistsay', 'gol_mac', 'gen', 'ratingoy', 't_gen', 'kupa'] as StatType[]).map((tab) => (
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
            {tab === 't_gen' && '⚡ T-GEN'}
            {tab === 'kupa' && '🏆 KUPA SIRALAMASI'}
          </button>
        ))}
      </div>

      {/* If Trophy Ranking tab is active, show sub-selector for Teams vs Players */}
      {activeStat === 'kupa' && (
        <div className="flex justify-center items-center gap-3 bg-white/80 p-2 rounded-2xl max-w-sm mx-auto border border-amber-300 shadow-sm">
          <button
            onClick={() => setKupaSubTab('teams')}
            className={`flex-1 py-1.5 px-3 rounded-xl font-black text-xs uppercase transition-all ${
              kupaSubTab === 'teams'
                ? 'bg-brand-maroon text-brand-gold shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            🛡️ Takım Sıralaması
          </button>
          <button
            onClick={() => setKupaSubTab('players')}
            className={`flex-1 py-1.5 px-3 rounded-xl font-black text-xs uppercase transition-all ${
              kupaSubTab === 'players'
                ? 'bg-brand-maroon text-brand-gold shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            👤 Oyuncu Sıralaması
          </button>
        </div>
      )}

      {loading ? (
        <h3 className="text-center text-gray-500 font-bold">{t.loading}</h3>
      ) : activeStat === 'kupa' && kupaSubTab === 'teams' ? (
        teamList.length === 0 ? (
          <h3 className="text-center text-gray-500 font-bold">Takım kupa verisi bulunamadı.</h3>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4 animate-fade-in select-text">
            {teamList.map((tItem, idx) => (
              <div 
                key={tItem.teamName}
                className="bg-brand-card p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center border-l-12 border-brand-maroon shadow-sm gap-3"
              >
                <div className="flex items-center flex-1 min-w-0">
                  <div className="w-10 text-center text-xl font-black text-brand-maroon shrink-0">
                    {idx + 1}.
                  </div>

                  <img 
                    src={tItem.logo} 
                    onClick={() => onNavigate({ type: 'team-detail', teamName: tItem.teamName })}
                    className="w-12 h-12 rounded-full border-2 border-brand-maroon bg-white object-cover shrink-0 cursor-pointer mr-3 shadow-md hover:scale-105 transition-transform" 
                    alt="team" 
                  />

                  <div className="flex-1 min-w-0">
                    <h4 
                      onClick={() => onNavigate({ type: 'team-detail', teamName: tItem.teamName })}
                      className="font-extrabold text-sm md:text-base text-brand-dark uppercase truncate hover:text-brand-maroon cursor-pointer"
                    >
                      {tItem.teamName}
                    </h4>
                    
                    {/* Trophy Icons showcase row */}
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      {TROPHIES_LIST.map(tr => {
                        const count = tItem.kupalar[tr.id] || 0;
                        if (count <= 0) return null;
                        return (
                          <div
                            key={tr.id}
                            onClick={() => onNavigate({ type: 'trophy-detail', trophyId: tr.id })}
                            className="flex items-center gap-1 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-full border border-amber-300 cursor-pointer transition-transform hover:scale-105"
                            title={`${count}x ${tr.name} (Tıkla ve detayı gör)`}
                          >
                            <img src={tr.icon} className="w-4 h-4 object-contain" alt={tr.name} />
                            <span className="text-[10px] font-black text-amber-900">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 flex items-center justify-end sm:flex-col gap-1 border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-200">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="font-black text-2xl md:text-3xl text-brand-maroon leading-none">
                      🏆 {tItem.totalKupa}
                    </span>
                  </div>
                  <span className="text-[9px] md:text-[10px] font-black uppercase text-gray-400 tracking-wider block">
                    KUPA
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : activeStat === 'kupa' && kupaSubTab === 'players' ? (
        sortedList.length === 0 ? (
          <h3 className="text-center text-gray-500 font-bold">Oyuncu kupa verisi bulunamadı.</h3>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4 animate-fade-in select-text">
            {sortedList.slice(0, 50).map((p, idx) => {
              const logo = teamLogos[p.pteam] || 'https://via.placeholder.com/32?text=?';

              return (
                <div 
                  key={p.pname}
                  className="bg-brand-card p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center border-l-12 border-brand-maroon shadow-sm gap-3"
                >
                  <div className="flex items-center flex-1 min-w-0">
                    <div className="w-10 text-center text-xl font-black text-brand-maroon shrink-0">
                      {idx + 1}.
                    </div>

                    <img 
                      src={logo} 
                      onClick={() => onNavigate({ type: 'team-detail', teamName: p.pteam })}
                      className="w-8 h-8 rounded-full border-2 border-brand-maroon bg-white object-cover shrink-0 cursor-pointer mr-2 shadow-inner hover:scale-105 transition-transform" 
                      alt="team" 
                    />

                    <img 
                      src={p.foto} 
                      onClick={() => onNavigate({ type: 'player-profile', playerName: p.pname })}
                      className="w-12 h-12 rounded-xl object-cover shrink-0 border-2 border-white shadow-md bg-white mr-3 cursor-pointer hover:scale-105 transition-transform" 
                      alt="player" 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${p.pname}&background=800000&color=fff&size=56`;
                      }}
                    />

                    <div className="flex-1 min-w-0">
                      <h4 
                        onClick={() => onNavigate({ type: 'player-profile', playerName: p.pname })}
                        className="font-extrabold text-sm md:text-base text-brand-dark uppercase truncate hover:text-brand-maroon cursor-pointer"
                      >
                        {p.pname}
                      </h4>
                      <span className="text-[10px] md:text-xs font-bold text-gray-500 truncate block uppercase">{p.pteam}</span>

                      {/* Trophy Icons showcase row */}
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {TROPHIES_LIST.map(tr => {
                          const count = p.kupalar ? (p.kupalar[tr.id] || 0) : 0;
                          if (count <= 0) return null;
                          return (
                            <div
                              key={tr.id}
                              onClick={() => onNavigate({ type: 'trophy-detail', trophyId: tr.id })}
                              className="flex items-center gap-1 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-full border border-amber-300 cursor-pointer transition-transform hover:scale-105"
                              title={`${count}x ${tr.name} (Tıkla ve detayı gör)`}
                            >
                              <img src={tr.icon} className="w-4 h-4 object-contain" alt={tr.name} />
                              <span className="text-[10px] font-black text-amber-900">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 flex items-center justify-end sm:flex-col gap-1 border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-200">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="font-black text-2xl md:text-3xl text-brand-maroon leading-none">
                        🏆 {p.totalKupa}
                      </span>
                    </div>
                    <span className="text-[9px] md:text-[10px] font-black uppercase text-gray-400 tracking-wider block">
                      KUPA
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : activeStat === 't_gen' ? (
        teamList.length === 0 ? (
          <h3 className="text-center text-gray-500 font-bold">Takım verisi bulunamadı.</h3>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4 animate-fade-in select-text">
            {teamList.map((tItem, idx) => (
              <div 
                key={tItem.teamName}
                onClick={() => onNavigate({ type: 'team-detail', teamName: tItem.teamName })}
                className="bg-brand-card p-4 rounded-2xl flex items-center border-l-12 border-brand-maroon hover:border-l-16 hover:translate-x-1.5 transition-all shadow-sm cursor-pointer"
              >
                <div className="w-12 text-center text-xl font-black text-brand-maroon shrink-0">
                  {idx + 1}.
                </div>

                <img 
                  src={tItem.logo} 
                  className="w-10 h-10 rounded-full border-2 border-brand-maroon bg-white object-cover shrink-0 cursor-pointer mr-3 shadow-inner" 
                  alt="team" 
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/32?text=?';
                  }}
                />

                <div className="flex-1 min-w-0">
                  <h4 className="font-extrabold text-sm md:text-base text-brand-dark uppercase truncate">{tItem.teamName}</h4>
                  <span className="text-[10px] md:text-xs font-bold text-gray-500 truncate block uppercase">
                    👥 {tItem.playerCount} Oyuncu
                  </span>
                </div>

                <div className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="font-black text-2xl md:text-3xl text-brand-maroon leading-none">
                      {activeStat === 't_gen' ? tItem.avgGen : tItem.totalGoals}
                    </span>
                  </div>
                  <span className="text-[9px] md:text-[10px] font-black uppercase text-gray-400 tracking-wider block">
                    {labels[activeStat]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : sortedList.length === 0 ? (
        <h3 className="text-center text-gray-500 font-bold">Yüklenecek istatistik bulunamadı.</h3>
      ) : (
        <div className="max-w-2xl mx-auto space-y-4 animate-fade-in select-text">
          {sortedList.slice(0, 50).map((p, idx) => {
            const rawVal = (p as any)[activeStat];
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
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="font-black text-2xl md:text-3xl text-brand-maroon leading-none">{displayVal}</span>
                    {activeStat === 'ratingoy' && (
                      <span className="text-[10px] font-black text-brand-gold bg-brand-dark px-1.5 py-0.5 rounded shadow-sm shrink-0 select-none">
                        🏆 {mvpCounts[p.pname.trim().toUpperCase()] || 0} MVP
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] md:text-[10px] font-black uppercase text-gray-400 tracking-wider block">{labels[activeStat]}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Trophy Detail Modal */}
      <TrophyDetailModal
        isOpen={selectedTrophyId !== null}
        trophyId={selectedTrophyId}
        onClose={() => setSelectedTrophyId(null)}
        currentUser={currentUser}
        onNavigate={onNavigate}
      />
    </div>
  );
}
