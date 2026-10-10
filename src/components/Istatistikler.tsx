import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Player, Team, Match, UserProfile } from '../types';
import { TROPHIES_LIST, TROPHY_MAP } from '../lib/trophies';
import { TrophyDetailModal } from './TrophyDetailModal';
import EloView from './EloView';
import { calculatePlayerStatsFromMatches, calculateOwnGoalSummary, syncPlayerStatsToFirestore } from '../lib/playerStats';

interface IstatistiklerProps {
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
  currentUser?: UserProfile | null;
}

export type StatType = 
  | 'goals' 
  | 'asistsay' 
  | 'kendi_kalesine'
  | 'gol_mac' 
  | 'mac' 
  | 'ratingoy' 
  | 'mvp' 
  | 'sari_kart' 
  | 'kirmizi_kart' 
  | 'yesil_kart' 
  | 'gen' 
  | 't_gen' 
  | 'kupa' 
  | 'elo';

export default function Istatistikler({ currentLang, translations, onNavigate, teamLogos, currentUser = null }: IstatistiklerProps) {
  const [activeStat, setActiveStat] = useState<StatType>('goals');
  const [kupaSubTab, setKupaSubTab] = useState<'teams' | 'players'>('teams');
  const [kkSubTab, setKkSubTab] = useState<'teams' | 'players'>('teams');
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrophyId, setSelectedTrophyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);

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
      const matchList: Match[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        matchList.push({ id: doc.id, ...data } as Match);
      });
      setMatches(matchList);
    });
    return () => unsubscribeMatches();
  }, []);

  const t = translations[currentLang];

  const labels: Record<string, string> = {
    goals: `${t.gol} ${t.kral}`,
    asistsay: `${t.asist} ${t.kral}`,
    kendi_kalesine: 'Kendi Kalesine Gol',
    gol_mac: 'Gol / Maç Oranı',
    mac: 'Oynanan Maç',
    ratingoy: `${t.rat} ${t.lider}`,
    mvp: 'MVP Ödülü',
    sari_kart: 'Sarı Kart',
    kirmizi_kart: 'Kırmızı Kart',
    yesil_kart: 'Yeşil Kart',
    gen: t.gen,
    t_gen: 'Takım GEN Ort.',
    kupa: 'Toplam Kupa',
    elo: 'ELO Reytingi',
  };

  const handleAdminSync = async () => {
    if (syncing) return;
    try {
      setSyncing(true);
      const res = await syncPlayerStatsToFirestore();
      setSyncSuccessMessage(`✅ ${res.updatedCount} oyuncunun maç istatistikleri başarıyla güncellendi!`);
      setTimeout(() => setSyncSuccessMessage(null), 4000);
    } catch (err) {
      console.error(err);
      alert('İstatistikler eşitlenirken bir hata oluştu.');
    } finally {
      setSyncing(false);
    }
  };

  const getTotalTrophies = (kupalar?: Record<string, number>) => {
    if (!kupalar) return 0;
    return Object.values(kupalar).reduce((acc, count) => acc + (Number(count) || 0), 0);
  };

  // Computes player statistics strictly from the matches collection in real-time
  const getSortedPlayers = () => {
    const list: any[] = players.map((p) => {
      const stats = calculatePlayerStatsFromMatches(p, matches);
      const totalKupa = getTotalTrophies(p.kupalar);
      return {
        ...p,
        // All performance metrics strictly derived from matches data
        goals: stats.goals,
        ownGoals: stats.ownGoals,
        asistsay: stats.asistsay,
        mac: stats.mac,
        poyn: stats.mac,
        gol_mac: stats.gol_mac,
        ratingoy: stats.ratingoy,
        ratingoyFormatted: stats.ratingoyFormatted,
        mvp: stats.mvp,
        sari_kart: stats.sari_kart,
        kirmizi_kart: stats.kirmizi_kart,
        yesil_kart: stats.yesil_kart,
        totalCards: stats.totalCards,
        gen: Number(p.gen) || 0,
        totalKupa
      };
    });

    return list.sort((a, b) => {
      if (activeStat === 'kupa') {
        return b.totalKupa - a.totalKupa;
      }
      const valA = (a as any)[activeStat] || 0;
      const valB = (b as any)[activeStat] || 0;
      if (valB !== valA) return valB - valA;

      // Tie-breaker 1: Goals
      if (b.goals !== a.goals) return b.goals - a.goals;
      // Tie-breaker 2: Matches
      return b.mac - a.mac;
    });
  };

  const getTeamStats = () => {
    const teamsMap: Record<string, { totalGen: number; totalGoals: number; count: number }> = {};
    
    // Calculate player goals strictly from matches
    const playerStatsMap = new Map<string, number>();
    players.forEach((p) => {
      const stats = calculatePlayerStatsFromMatches(p, matches);
      playerStatsMap.set(p.pname, stats.goals);
    });

    players.forEach((p) => {
      const teamName = (p.pteam || '').trim();
      if (!teamName) return;
      if (!teamsMap[teamName]) {
        teamsMap[teamName] = { totalGen: 0, totalGoals: 0, count: 0 };
      }
      teamsMap[teamName].totalGen += Number(p.gen) || 0;
      teamsMap[teamName].totalGoals += playerStatsMap.get(p.pname) || 0;
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

  // Compute own goals aggregate summary (club and player rankings)
  const ownGoalSummary = calculateOwnGoalSummary(matches, players, teams, teamLogos);

  const sortedList = (activeStat === 't_gen' || (activeStat === 'kupa' && kupaSubTab === 'teams') || activeStat === 'kendi_kalesine') ? [] : getSortedPlayers();
  const teamList = (activeStat === 't_gen' || (activeStat === 'kupa' && kupaSubTab === 'teams')) ? getTeamStats() : [];

  const tabConfigs: { id: StatType; label: string; icon: string }[] = [
    { id: 'goals', label: `${t.gol} ${t.kral}`, icon: '⚽' },
    { id: 'asistsay', label: `${t.asist} ${t.kral}`, icon: '👟' },
    { id: 'kendi_kalesine', label: '🥅 Kendi Kalesine', icon: '' },
    { id: 'gol_mac', label: 'Gol / Maç', icon: '🎯' },
    { id: 'mac', label: 'Maç Sayısı', icon: '🏃' },
    { id: 'ratingoy', label: `${t.rat} ${t.lider}`, icon: '⭐' },
    { id: 'mvp', label: 'MVP Lideri', icon: '🏆' },
    { id: 'sari_kart', label: 'Sarı Kart', icon: '🟨' },
    { id: 'kirmizi_kart', label: 'Kırmızı Kart', icon: '🟥' },
    { id: 'yesil_kart', label: 'Yeşil Kart', icon: '🟩' },
    { id: 'gen', label: `${t.gen} ${t.lider}`, icon: '⚡' },
    { id: 't_gen', label: '⚡ T-GEN', icon: '' },
    { id: 'kupa', label: '🏆 Kupa Sıralaması', icon: '' },
    { id: 'elo', label: '⭐ Takım ELO', icon: '' },
  ];

  return (
    <div className="space-y-6">
      {/* Admin Sync Banner & Button */}
      {currentUser?.admin && (
        <div className="bg-gradient-to-r from-brand-maroon to-[#4a0000] text-brand-gold p-3 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md border border-brand-gold/30">
          <div className="flex items-center gap-2 text-xs font-bold text-center sm:text-left">
            <span className="text-base">ℹ️</span>
            <span>Tüm istatistikler doğrudan oynanan maç verilerinden hesaplanmaktadır.</span>
          </div>
          <button
            onClick={handleAdminSync}
            disabled={syncing}
            className="bg-brand-gold text-brand-dark hover:bg-yellow-400 disabled:opacity-50 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow cursor-pointer transition-transform hover:scale-102 active:scale-95 shrink-0 flex items-center gap-1.5"
          >
            {syncing ? '⏳ Güncelleniyor...' : '🔄 Oyuncu Verilerini Eşitle'}
          </button>
        </div>
      )}

      {syncSuccessMessage && (
        <div className="bg-green-100 border border-green-400 text-green-800 text-xs font-black px-4 py-2.5 rounded-xl text-center shadow-sm animate-fade-in">
          {syncSuccessMessage}
        </div>
      )}

      {/* Sub tabs list */}
      <div className="flex gap-2 justify-center flex-wrap">
        {tabConfigs.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setActiveStat(id)}
            className={`py-2 px-3.5 rounded-xl font-black text-xs uppercase cursor-pointer border-2 transition-all flex items-center gap-1.5 ${
              activeStat === id 
                ? 'bg-brand-gold text-brand-dark border-brand-maroon shadow-md scale-102' 
                : 'bg-brand-card border-brand-maroon/30 text-brand-maroon/80 hover:border-brand-maroon hover:bg-white'
            }`}
          >
            {icon && <span>{icon}</span>}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* If Trophy Ranking tab is active, show sub-selector for Teams vs Players */}
      {activeStat === 'kupa' && (
        <div className="flex justify-center items-center gap-3 bg-white/80 p-2 rounded-2xl max-w-sm mx-auto border border-amber-300 shadow-sm animate-fade-in">
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

      {/* If Kendi Kalesine tab is active, show sub-selector for Kulüp vs Oyuncu */}
      {activeStat === 'kendi_kalesine' && (
        <div className="flex justify-center items-center gap-3 bg-white/80 p-2 rounded-2xl max-w-sm mx-auto border border-red-300 shadow-sm animate-fade-in">
          <button
            onClick={() => setKkSubTab('teams')}
            className={`flex-1 py-1.5 px-3 rounded-xl font-black text-xs uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              kkSubTab === 'teams'
                ? 'bg-red-700 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            🛡️ Kulüp Sıralaması
          </button>
          <button
            onClick={() => setKkSubTab('players')}
            className={`flex-1 py-1.5 px-3 rounded-xl font-black text-xs uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              kkSubTab === 'players'
                ? 'bg-red-700 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            👤 Oyuncu Sıralaması
          </button>
        </div>
      )}

      {loading ? (
        <h3 className="text-center text-gray-500 font-bold">{t.loading}</h3>
      ) : activeStat === 'elo' ? (
        <EloView
          teams={teams}
          matches={matches}
          teamLogos={teamLogos}
          currentLang={currentLang}
          onNavigate={onNavigate}
        />
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
      ) : activeStat === 'kendi_kalesine' ? (
        kkSubTab === 'teams' ? (
          ownGoalSummary.allTeams.length === 0 ? (
            <h3 className="text-center text-gray-500 font-bold">Kulüp kendi kalesine gol verisi bulunamadı.</h3>
          ) : (
            <div className="max-w-2xl mx-auto space-y-4 animate-fade-in select-text">
              <div className="bg-red-50/60 border border-red-200 text-red-900 px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center justify-between">
                <span>🛡️ Kendi Kalesine En Çok Gol Atan Kulüpler</span>
                <span className="font-black bg-red-600 text-white px-2 py-0.5 rounded-full text-[11px]">
                  Toplam: {ownGoalSummary.totalOwnGoals} Gol
                </span>
              </div>
              {ownGoalSummary.allTeams.map((tItem, idx) => (
                <div 
                  key={tItem.name}
                  onClick={() => onNavigate({ type: 'team-detail', teamName: tItem.name })}
                  className="bg-brand-card p-4 rounded-2xl flex items-center border-l-12 border-red-600 hover:border-l-16 hover:translate-x-1.5 transition-all shadow-sm cursor-pointer"
                >
                  <div className="w-12 text-center text-xl font-black text-brand-maroon shrink-0">
                    {idx + 1}.
                  </div>

                  <img 
                    src={tItem.logo} 
                    className="w-12 h-12 rounded-full border-2 border-brand-maroon bg-white object-cover shrink-0 cursor-pointer mr-3 shadow-inner hover:scale-105 transition-transform" 
                    alt="team" 
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://via.placeholder.com/32?text=?';
                    }}
                  />

                  <div className="flex-1 min-w-0">
                    <h4 className="font-extrabold text-sm md:text-base text-brand-dark uppercase truncate hover:text-brand-maroon">
                      {tItem.name}
                    </h4>
                    <span className="text-[10px] md:text-xs font-bold text-gray-500 truncate block uppercase">
                      {tItem.count > 0 ? `🥅 ${tItem.count} Kendi Kalesine Gol` : 'Temiz (0 Gol)'}
                      {tItem.playersCount > 0 && ` • ${tItem.playersCount} Farklı Oyuncu`}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="font-black text-2xl md:text-3xl text-red-600 leading-none">
                        {tItem.count}
                      </span>
                    </div>
                    <span className="text-[9px] md:text-[10px] font-black uppercase text-gray-400 tracking-wider block mt-0.5">
                      K.K. GOL
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          ownGoalSummary.allPlayers.length === 0 ? (
            <div className="text-center py-8">
              <span className="text-4xl block mb-2">🎉</span>
              <h3 className="text-gray-600 font-bold">Kendi kalesine gol atan oyuncu bulunmuyor.</h3>
              <p className="text-xs text-gray-400 mt-1">Maçlarda kendi kalesine gol kaydedildiğinde burada listelenecektir.</p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-4 animate-fade-in select-text">
              <div className="bg-red-50/60 border border-red-200 text-red-900 px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center justify-between">
                <span>👤 Kendi Kalesine En Çok Gol Atan Oyuncular</span>
                <span className="font-black bg-red-600 text-white px-2 py-0.5 rounded-full text-[11px]">
                  {ownGoalSummary.allPlayers.length} Oyuncu
                </span>
              </div>
              {ownGoalSummary.allPlayers.map((pItem, idx) => {
                const teamLogo = teamLogos[pItem.team] || 'https://via.placeholder.com/32?text=?';

                return (
                  <div 
                    key={pItem.name}
                    onClick={() => onNavigate({ type: 'player-profile', playerName: pItem.name })}
                    className="bg-brand-card p-4 rounded-2xl flex items-center border-l-12 border-red-600 hover:border-l-16 hover:translate-x-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <div className="w-12 text-center text-xl font-black text-brand-maroon shrink-0">
                      {idx + 1}.
                    </div>

                    {pItem.team && (
                      <img 
                        src={teamLogo} 
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate({ type: 'team-detail', teamName: pItem.team });
                        }}
                        className="w-8 h-8 rounded-full border-2 border-brand-maroon bg-white object-cover shrink-0 cursor-pointer mr-3 shadow-inner hover:scale-105 transition-transform" 
                        alt="team" 
                        title={pItem.team}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://via.placeholder.com/32?text=?';
                        }}
                      />
                    )}

                    <img 
                      src={pItem.photo} 
                      className="w-14 h-14 rounded-xl object-cover shrink-0 border-2 border-white shadow-md bg-white mr-4 hover:scale-105 transition-transform" 
                      alt={pItem.name} 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(pItem.name)}&background=800000&color=fff&size=56`;
                      }}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-extrabold text-sm md:text-base text-brand-dark uppercase truncate hover:text-brand-maroon">
                          {pItem.name}
                        </h4>
                        <span className="text-[9px] font-black text-red-700 bg-red-100 border border-red-300 px-1.5 py-0.2 rounded-full uppercase tracking-wider shrink-0">
                          K.K.
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span 
                          onClick={(e) => {
                            if (pItem.team) {
                              e.stopPropagation();
                              onNavigate({ type: 'team-detail', teamName: pItem.team });
                            }
                          }}
                          className={`text-[10px] md:text-xs font-bold text-gray-600 truncate uppercase ${
                            pItem.team ? 'hover:text-brand-maroon cursor-pointer' : ''
                          }`}
                          title={`Kendi kalesine gol attığı takım: ${pItem.team}`}
                        >
                          {pItem.scoredTeamsText || pItem.team || '-'}
                        </span>
                        {pItem.matchesCount > 0 && (
                          <span className="text-[9px] md:text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded truncate">
                            {pItem.matchesCount} Maçta
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="font-black text-2xl md:text-3xl text-red-600 leading-none">
                          {pItem.count}
                        </span>
                      </div>
                      <span className="text-[9px] md:text-[10px] font-black uppercase text-gray-400 tracking-wider block mt-0.5">
                        K.K. GOL
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
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
                      {tItem.avgGen}
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
            const logo = teamLogos[p.pteam] || 'https://via.placeholder.com/32?text=?';

            // Value to display in large typography
            let displayVal: string | number = 0;
            let subInfo = '';

            switch (activeStat) {
              case 'goals':
                displayVal = p.goals;
                subInfo = `${p.mac} Maç • ${p.asistsay} Asist • ${p.gol_mac.toFixed(2)} G/M`;
                break;
              case 'asistsay':
                displayVal = p.asistsay;
                subInfo = `${p.mac} Maç • ${p.goals} Gol`;
                break;
              case 'gol_mac':
                displayVal = p.gol_mac.toFixed(2);
                subInfo = `${p.goals} Gol / ${p.mac} Maç`;
                break;
              case 'mac':
                displayVal = p.mac;
                subInfo = `${p.goals} Gol • ${p.asistsay} Asist`;
                break;
              case 'ratingoy':
                displayVal = p.ratingoyFormatted;
                subInfo = `${p.mvp}x MVP • ${p.mac} Maç`;
                break;
              case 'mvp':
                displayVal = p.mvp;
                subInfo = `⭐ ${p.ratingoyFormatted} Ort. • ${p.mac} Maç`;
                break;
              case 'sari_kart':
                displayVal = p.sari_kart;
                subInfo = `${p.mac} Maçta`;
                break;
              case 'kirmizi_kart':
                displayVal = p.kirmizi_kart;
                subInfo = `${p.mac} Maçta`;
                break;
              case 'yesil_kart':
                displayVal = p.yesil_kart;
                subInfo = `${p.mac} Maçta`;
                break;
              case 'gen':
                displayVal = p.gen;
                subInfo = `${p.goals} Gol • ${p.mac} Maç`;
                break;
              default:
                displayVal = (p as any)[activeStat] || 0;
                break;
            }

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
                  className="w-8 h-8 rounded-full border-2 border-brand-maroon bg-white object-cover shrink-0 cursor-pointer mr-3 shadow-inner hover:scale-105 transition-transform" 
                  alt="team" 
                  title={p.pteam}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/32?text=?';
                  }}
                />

                <img 
                  src={p.foto} 
                  className="w-14 h-14 rounded-xl object-cover shrink-0 border-2 border-white shadow-md bg-white mr-4 hover:scale-105 transition-transform" 
                  alt={p.pname} 
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.pname)}&background=800000&color=fff&size=56`;
                  }}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="font-extrabold text-sm md:text-base text-brand-dark uppercase truncate">
                      {p.pname}
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 mt-0.5">
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate({ type: 'team-detail', teamName: p.pteam });
                      }}
                      className="text-[10px] md:text-xs font-bold text-gray-500 truncate uppercase hover:text-brand-maroon cursor-pointer"
                    >
                      {p.pteam}
                    </span>
                    {subInfo && (
                      <span className="text-[9px] md:text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded truncate">
                        {subInfo}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="font-black text-2xl md:text-3xl text-brand-maroon leading-none">
                      {activeStat === 'sari_kart' && <span className="text-base mr-1">🟨</span>}
                      {activeStat === 'kirmizi_kart' && <span className="text-base mr-1">🟥</span>}
                      {activeStat === 'yesil_kart' && <span className="text-base mr-1">🟩</span>}
                      {activeStat === 'mvp' && <span className="text-base mr-1">🏆</span>}
                      {displayVal}
                    </span>
                    {activeStat === 'ratingoy' && p.mvp > 0 && (
                      <span className="text-[10px] font-black text-brand-gold bg-brand-dark px-1.5 py-0.5 rounded shadow-sm shrink-0 select-none">
                        🏆 {p.mvp} MVP
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] md:text-[10px] font-black uppercase text-gray-400 tracking-wider block mt-0.5">
                    {labels[activeStat]}
                  </span>
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
