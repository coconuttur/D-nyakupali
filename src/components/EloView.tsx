import React, { useState, useMemo } from 'react';
import { Team, Match } from '../types';
import {
  calculateAllTeamsElo,
  simulateLeagueSeason,
  predictHeadToHead,
  TeamEloStats,
  BASE_ELO,
} from '../lib/elo';

interface EloViewProps {
  teams: Team[];
  matches: Match[];
  teamLogos: Record<string, string>;
  currentLang: 'tr' | 'en' | 'pt';
  onNavigate: (view: any) => void;
}

export default function EloView({
  teams,
  matches,
  teamLogos,
  currentLang,
  onNavigate,
}: EloViewProps) {
  // Simulation configuration states
  const [luckFactor, setLuckFactor] = useState<number>(0.25);
  const [simSeed, setSimSeed] = useState<number>(0);
  const [activeSubTab, setActiveSubTab] = useState<'standings' | 'predictions' | 'h2h'>('standings');
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<string>('all');
  const [teamSearch, setTeamSearch] = useState<string>('');
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  // H2H match tool state
  const [h2hTeam1, setH2hTeam1] = useState<string>('');
  const [h2hTeam2, setH2hTeam2] = useState<string>('');
  const [h2hSeed, setH2hSeed] = useState<number>(0);

  // 1. Calculate historical ELO for all teams
  const eloStatsMap = useMemo(() => {
    return calculateAllTeamsElo(teams, matches, teamLogos);
  }, [teams, matches, teamLogos]);

  // 2. Sort teams by current ELO descending
  const sortedEloTeams = useMemo(() => {
    const list = Object.values(eloStatsMap) as TeamEloStats[];
    return list.sort((a, b) => {
      if (b.elo !== a.elo) return b.elo - a.elo;
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
      return b.goalsFor - a.goalsFor;
    });
  }, [eloStatsMap]);

  // Set default H2H selections if not set
  React.useEffect(() => {
    if (sortedEloTeams.length >= 2) {
      if (!h2hTeam1) setH2hTeam1(sortedEloTeams[0].teamName);
      if (!h2hTeam2) setH2hTeam2(sortedEloTeams[1].teamName);
    }
  }, [sortedEloTeams, h2hTeam1, h2hTeam2]);

  // 3. Run remaining match simulation & projected standings
  const simulation = useMemo(() => {
    return simulateLeagueSeason(teams, matches, eloStatsMap, luckFactor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, matches, eloStatsMap, luckFactor, simSeed]);

  // List of available weeks in remaining matches
  const availableWeeks = useMemo(() => {
    const set = new Set<string>();
    simulation.matchPredictions.forEach((m) => {
      if (m.hafta !== undefined && m.hafta !== null) {
        set.add(String(m.hafta));
      }
    });
    return Array.from(set).sort((a, b) => (Number(a) || 0) - (Number(b) || 0));
  }, [simulation.matchPredictions]);

  // Filtered predictions
  const filteredPredictions = useMemo(() => {
    return simulation.matchPredictions.filter((m) => {
      if (selectedWeekFilter !== 'all' && String(m.hafta) !== selectedWeekFilter) {
        return false;
      }
      if (teamSearch) {
        const q = teamSearch.toLowerCase();
        return m.team1.toLowerCase().includes(q) || m.team2.toLowerCase().includes(q);
      }
      return true;
    });
  }, [simulation.matchPredictions, selectedWeekFilter, teamSearch]);

  // H2H calculation
  const h2hResult = useMemo(() => {
    if (!h2hTeam1 || !h2hTeam2 || h2hTeam1 === h2hTeam2) return null;
    const elo1 = eloStatsMap[h2hTeam1]?.elo ?? BASE_ELO;
    const elo2 = eloStatsMap[h2hTeam2]?.elo ?? BASE_ELO;
    return predictHeadToHead(elo1, elo2, luckFactor, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h2hTeam1, h2hTeam2, eloStatsMap, luckFactor, h2hSeed]);

  return (
    <div className="space-y-8 max-w-5xl mx-auto animate-fade-in select-text">
      {/* ======================================================== */}
      {/* 1. ELO CALCULATION EXPLANATION BANNER */}
      {/* ======================================================== */}
      <div className="bg-gradient-to-br from-brand-maroon via-[#5e0000] to-brand-dark text-white p-5 sm:p-6 rounded-3xl border-2 border-brand-gold shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl sm:text-4xl">⚡</span>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-brand-gold uppercase tracking-wide">
                Takım ELO Reyting Sistemi
              </h2>
              <p className="text-xs text-brand-cream/80 font-medium">
                Maç sonuçları, gol farkı ve turnuva önem katsayılarına göre hesaplanan dinamik güç puanları.
              </p>
            </div>
          </div>
          <div className="bg-black/30 border border-brand-gold/40 px-3.5 py-1.5 rounded-2xl flex items-center gap-2 self-start md:self-auto">
            <span className="text-[11px] font-bold text-brand-cream/70 uppercase">Başlangıç Puanı:</span>
            <span className="text-sm font-black text-brand-gold">{BASE_ELO} ELO</span>
          </div>
        </div>

        {/* Formula breakdown badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
          <div className="bg-white/10 backdrop-blur-sm p-3 rounded-2xl border border-white/10">
            <div className="font-extrabold text-emerald-400 flex items-center gap-1.5 mb-1">
              <span>🟢</span> Galibiyet (W)
            </div>
            <div className="text-[11px] text-white/90">
              <strong className="text-white">+3.0 Reyting</strong> + (Gol Farkı × 0.3)
            </div>
            <div className="text-[10px] text-white/60 italic mt-0.5">Örn: 2 farkla galibiyet → +3.6 Reyting</div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm p-3 rounded-2xl border border-white/10">
            <div className="font-extrabold text-amber-300 flex items-center gap-1.5 mb-1">
              <span>🟡</span> Beraberlik (D)
            </div>
            <div className="text-[11px] text-white/90">
              <strong className="text-white">+1.0 Reyting</strong> (Gol farkı: 0)
            </div>
            <div className="text-[10px] text-white/60 italic mt-0.5">Her iki takıma da eşit +1.0 puan</div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm p-3 rounded-2xl border border-white/10">
            <div className="font-extrabold text-rose-400 flex items-center gap-1.5 mb-1">
              <span>🔴</span> Mağlubiyet (L)
            </div>
            <div className="text-[11px] text-white/90">
              <strong className="text-white">-3.0 Reyting</strong> - (Gol Farkı × 0.3)
            </div>
            <div className="text-[10px] text-white/60 italic mt-0.5">Örn: 2 farkla mağlubiyet → -3.6 Reyting</div>
          </div>
        </div>

        {/* Multipliers row */}
        <div className="mt-3.5 pt-3 border-t border-white/10 flex items-center justify-between flex-wrap gap-2 text-[11px]">
          <span className="font-bold text-brand-gold text-[10px] uppercase tracking-wider">
            🏆 Turnuva Çarpanları:
          </span>
          <div className="flex flex-wrap gap-1.5">
            <span className="bg-blue-600/60 px-2 py-0.5 rounded-full border border-blue-400/40 text-blue-100 font-bold">
              UCL: 1.75x
            </span>
            <span className="bg-amber-600/60 px-2 py-0.5 rounded-full border border-amber-400/40 text-amber-100 font-bold">
              UEL: 1.50x
            </span>
            <span className="bg-emerald-600/60 px-2 py-0.5 rounded-full border border-emerald-400/40 text-emerald-100 font-bold">
              UECL: 1.25x
            </span>
            <span className="bg-white/15 px-2 py-0.5 rounded-full border border-white/20 text-white font-bold">
              LİG: 1.00x
            </span>
            <span className="bg-purple-600/60 px-2 py-0.5 rounded-full border border-purple-400/40 text-purple-100 font-bold">
              TURNUVA: 0.50x
            </span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. TAKIM ELO SIRALAMASI (LEADERBOARD) */}
      {/* ======================================================== */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-black text-brand-maroon uppercase tracking-wide flex items-center gap-2">
              <span>🏆</span> Güncel Takım ELO Sıralaması
            </h3>
            <span className="bg-brand-maroon text-brand-gold text-[10px] font-black px-2.5 py-0.5 rounded-full">
              {sortedEloTeams.length} Takım
            </span>
          </div>
          <span className="text-[11px] text-gray-500 font-medium italic">
            * Takım kartına tıklayarak maç maç ELO puan dökümünü inceleyebilirsiniz
          </span>
        </div>

        <div className="space-y-3">
          {sortedEloTeams.map((team, idx) => {
            const isExpanded = expandedTeam === team.teamName;
            const deltaPositive = team.eloDelta > 0;
            const deltaNeutral = team.eloDelta === 0;

            // Podium colors
            let rankBadge = (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm bg-gray-100 text-gray-600 border border-gray-200 shrink-0">
                {idx + 1}
              </div>
            );
            if (idx === 0) {
              rankBadge = (
                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 border-2 border-white shadow-md shrink-0">
                  🥇
                </div>
              );
            } else if (idx === 1) {
              rankBadge = (
                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900 border-2 border-white shadow-sm shrink-0">
                  🥈
                </div>
              );
            } else if (idx === 2) {
              rankBadge = (
                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm bg-gradient-to-br from-amber-600 to-amber-800 text-amber-100 border-2 border-white shadow-sm shrink-0">
                  🥉
                </div>
              );
            }

            return (
              <div
                key={team.teamName}
                className="bg-brand-card rounded-2xl border-2 border-brand-maroon/20 hover:border-brand-maroon/60 transition-all shadow-sm overflow-hidden"
              >
                {/* Main Team Row */}
                <div
                  onClick={() => setExpandedTeam(isExpanded ? null : team.teamName)}
                  className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-brand-cream/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {rankBadge}

                    <img
                      src={team.logo}
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate({ type: 'team-detail', teamName: team.teamName });
                      }}
                      className="w-11 h-11 rounded-full border-2 border-brand-maroon bg-white object-cover shrink-0 cursor-pointer shadow-inner hover:scale-105 transition-transform"
                      alt={team.teamName}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/44?text=?';
                      }}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate({ type: 'team-detail', teamName: team.teamName });
                          }}
                          className="font-black text-sm sm:text-base text-brand-dark uppercase truncate hover:text-brand-maroon cursor-pointer"
                        >
                          {team.teamName}
                        </h4>
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                            deltaPositive
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : deltaNeutral
                              ? 'bg-gray-100 text-gray-700 border-gray-300'
                              : 'bg-rose-100 text-rose-800 border-rose-300'
                          }`}
                        >
                          {deltaPositive ? `+${team.eloDelta}` : `${team.eloDelta}`}
                        </span>
                      </div>

                      {/* Team match record and form pills */}
                      <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-600 font-bold mt-1">
                        <span>O: {team.played}</span>
                        <span>•</span>
                        <span className="text-emerald-700">G: {team.wins}</span>
                        <span>•</span>
                        <span className="text-amber-700">B: {team.draws}</span>
                        <span>•</span>
                        <span className="text-rose-700">M: {team.losses}</span>
                        <span>•</span>
                        <span>
                          Av: {team.goalDiff > 0 ? `+${team.goalDiff}` : team.goalDiff} ({team.goalsFor}-{team.goalsAgainst})
                        </span>

                        {/* Form badges */}
                        {team.form.length > 0 && (
                          <div className="flex items-center gap-1 ml-1">
                            <span className="text-[9px] text-gray-400 font-black">FORM:</span>
                            {team.form.map((res, i) => (
                              <span
                                key={i}
                                className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white ${
                                  res === 'W' ? 'bg-emerald-600' : res === 'D' ? 'bg-amber-500' : 'bg-rose-600'
                                }`}
                              >
                                {res}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side: Elo Rating badge & Expand toggle */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-200">
                    <div className="text-left sm:text-right">
                      <div className="flex items-center sm:justify-end gap-1.5">
                        <span className="font-black text-2xl sm:text-3xl text-brand-maroon font-mono">
                          {team.elo.toFixed(1)}
                        </span>
                      </div>
                      <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider block">
                        ELO REYTİNGİ
                      </span>
                    </div>

                    <div className="bg-brand-maroon/10 hover:bg-brand-maroon/20 text-brand-maroon p-2 rounded-xl transition-colors">
                      <svg
                        className={`w-5 h-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Expanded Match History Breakdown */}
                {isExpanded && (
                  <div className="bg-brand-cream/40 p-4 border-t-2 border-brand-maroon/20 animate-fade-in space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                      <span className="font-black text-brand-maroon uppercase flex items-center gap-1.5">
                        <span>📋</span> {team.teamName} - ELO Maç Dökümü ({team.matchLogs.length} Maç)
                      </span>
                      <span className="text-[11px] text-gray-500 font-bold">
                        Net Değişim: {team.eloDelta >= 0 ? `+${team.eloDelta}` : team.eloDelta} ELO
                      </span>
                    </div>

                    {team.matchLogs.length === 0 ? (
                      <div className="p-4 text-center text-xs text-gray-500 font-medium bg-white/60 rounded-xl">
                        Henüz oynanmış maç kaydı bulunmuyor.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-brand-dark">
                          <thead>
                            <tr className="bg-brand-maroon text-brand-gold text-[10px] font-black uppercase">
                              <th className="p-2 text-left rounded-l-lg">Hafta / Tarih</th>
                              <th className="p-2 text-left">Rakip</th>
                              <th className="p-2 text-center">Skor</th>
                              <th className="p-2 text-center">Sonuç</th>
                              <th className="p-2 text-left">Turnuva / Katsayı</th>
                              <th className="p-2 text-right">Hesaplama Formülü</th>
                              <th className="p-2 text-right">ELO Değişimi</th>
                              <th className="p-2 text-right rounded-r-lg">Kümülatif ELO</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-maroon/10">
                            {team.matchLogs.map((log, lIdx) => (
                              <tr key={lIdx} className="hover:bg-white/80 transition-colors">
                                <td className="p-2 font-bold text-gray-500 whitespace-nowrap">
                                  {log.hafta ? `Hafta ${log.hafta}` : log.date || '-'}
                                </td>
                                <td className="p-2">
                                  <div className="flex items-center gap-2">
                                    {log.opponentLogo && (
                                      <img
                                        src={log.opponentLogo}
                                        className="w-5 h-5 rounded-full object-cover"
                                        alt=""
                                      />
                                    )}
                                    <span className="font-extrabold uppercase">{log.opponent}</span>
                                    <span className="text-[10px] text-gray-400">
                                      ({log.isHome ? 'Ev' : 'Dep'})
                                    </span>
                                  </div>
                                </td>
                                <td className="p-2 text-center font-mono font-black text-xs">
                                  {log.scoreDisplay}
                                </td>
                                <td className="p-2 text-center">
                                  <span
                                    className={`px-2 py-0.5 rounded-full font-black text-[10px] ${
                                      log.result === 'W'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : log.result === 'D'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {log.result === 'W' ? 'GALİBİYET' : log.result === 'D' ? 'BERABERLİK' : 'MAĞLUBİYET'}
                                  </span>
                                </td>
                                <td className="p-2 font-bold text-gray-700 whitespace-nowrap">
                                  {log.category}
                                </td>
                                <td className="p-2 text-right font-mono text-[11px] text-gray-600 whitespace-nowrap">
                                  [{log.baseScore >= 0 ? `+${log.baseScore.toFixed(1)}` : log.baseScore.toFixed(1)}] × {log.multiplier}x
                                </td>
                                <td className="p-2 text-right font-mono font-black">
                                  <span
                                    className={
                                      log.eloDelta > 0
                                        ? 'text-emerald-700'
                                        : log.eloDelta < 0
                                        ? 'text-rose-700'
                                        : 'text-gray-600'
                                    }
                                  >
                                    {log.eloDelta >= 0 ? `+${log.eloDelta.toFixed(2)}` : log.eloDelta.toFixed(2)}
                                  </span>
                                </td>
                                <td className="p-2 text-right font-mono font-black text-brand-maroon">
                                  {log.cumulativeElo.toFixed(1)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. ELO LİG TAHMİNİ & SEZON SİMÜLASYONU */}
      {/* ======================================================== */}
      <div className="bg-brand-card rounded-3xl p-5 sm:p-7 border-4 border-brand-maroon shadow-lg space-y-6">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b-2 border-brand-maroon/20">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-3xl">🔮</span>
              <h3 className="text-lg sm:text-xl font-black text-brand-maroon uppercase tracking-wide">
                ELO Lig Tahmini ve Sezon Projeksiyonu
              </h3>
            </div>
            <p className="text-xs text-gray-600 font-medium mt-1">
              Güncel lig tablosu puanlarına, kalan {simulation.unplayedCount} lig maçının ELO güç dengelerine ve gerçekçi şans faktörüne göre simüle edilmiştir.
            </p>
          </div>

          {/* Action buttons: Re-simulate roll & Luck factor slider */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSimSeed((prev) => prev + 1)}
              className="py-2.5 px-4 bg-brand-maroon hover:bg-brand-dark text-brand-gold font-black rounded-xl text-xs uppercase tracking-wider shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
              title="Kalan tüm maçları rastgele şans faktörüyle tekrar zar atarak simüle et"
            >
              <span>🎲</span>
              <span>Yeniden Simüle Et (Zar At)</span>
            </button>
          </div>
        </div>

        {/* Controls: Luck level selector and Sub-view switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-brand-cream/50 p-3 rounded-2xl border border-brand-maroon/20">
          {/* Sub-view switcher */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveSubTab('standings')}
              className={`py-1.5 px-3 rounded-xl font-black text-xs uppercase transition-all ${
                activeSubTab === 'standings'
                  ? 'bg-brand-maroon text-brand-gold shadow-md'
                  : 'bg-white/80 text-gray-600 hover:bg-white'
              }`}
            >
              🏆 Sezon Sonu Lig Tablosu
            </button>
            <button
              onClick={() => setActiveSubTab('predictions')}
              className={`py-1.5 px-3 rounded-xl font-black text-xs uppercase transition-all ${
                activeSubTab === 'predictions'
                  ? 'bg-brand-maroon text-brand-gold shadow-md'
                  : 'bg-white/80 text-gray-600 hover:bg-white'
              }`}
            >
              📅 Kalan Maç Tahminleri ({simulation.unplayedCount})
            </button>
            <button
              onClick={() => setActiveSubTab('h2h')}
              className={`py-1.5 px-3 rounded-xl font-black text-xs uppercase transition-all ${
                activeSubTab === 'h2h'
                  ? 'bg-brand-maroon text-brand-gold shadow-md'
                  : 'bg-white/80 text-gray-600 hover:bg-white'
              }`}
            >
              ⚔️ H2H Maç Simülatörü
            </button>
          </div>

          {/* Luck factor selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase text-gray-500 whitespace-nowrap">
              🎲 Şans Faktörü:
            </span>
            <select
              value={luckFactor}
              onChange={(e) => {
                setLuckFactor(Number(e.target.value));
                setSimSeed((prev) => prev + 1);
              }}
              className="bg-white border border-brand-maroon/30 text-brand-dark font-extrabold text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-maroon"
            >
              <option value={0.15}>Düşük (%15 - Favori Ağırlıklı)</option>
              <option value={0.25}>Dengeli (%25 - Gerçekçi Şans)</option>
              <option value={0.40}>Yüksek (%40 - Sürprizler & Kaos)</option>
            </select>
          </div>
        </div>

        {/* -------------------------------------------------------- */}
        {/* SUB-VIEW A: SIMULATED FINAL STANDINGS */}
        {/* -------------------------------------------------------- */}
        {activeSubTab === 'standings' && (
          <div className="space-y-4">
            {/* Projected Champion Banner */}
            {simulation.projectedChampion && (
              <div className="bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 p-4 sm:p-5 rounded-2xl border-2 border-amber-500 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl sm:text-4xl">👑</span>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wider text-amber-950">
                      Simülasyon Şampiyonluk Projeksiyonu
                    </div>
                    <div className="text-base sm:text-lg font-black text-brand-maroon uppercase flex items-center gap-2">
                      <span>{simulation.projectedChampion.teamName}</span>
                      <span className="text-xs bg-brand-maroon text-brand-gold px-2 py-0.5 rounded-full font-black">
                        {simulation.projectedChampion.totalProjectedPoints} Puan
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white/80 backdrop-blur-sm px-3.5 py-2 rounded-xl border border-amber-600/30 flex items-center gap-3 self-start sm:self-auto">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-gray-600 block uppercase">
                      Şampiyonluk İhtimali
                    </span>
                    <span className="text-base font-black text-brand-maroon font-mono">
                      %{simulation.projectedChampion.championshipProbability}
                    </span>
                  </div>
                  <div className="w-12 h-2.5 bg-gray-200 rounded-full overflow-hidden border border-gray-300">
                    <div
                      className="h-full bg-brand-maroon rounded-full"
                      style={{ width: `${Math.min(100, simulation.projectedChampion.championshipProbability)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Standings Table */}
            <div className="overflow-x-auto rounded-2xl border-2 border-brand-maroon/20">
              <table className="w-full text-brand-dark border-collapse text-xs">
                <thead>
                  <tr className="bg-brand-maroon text-brand-gold text-[10px] font-black uppercase tracking-wider">
                    <th className="py-3 px-3 text-center w-12">#</th>
                    <th className="py-3 px-3 text-left">Takım</th>
                    <th className="py-3 px-2 text-center">ELO</th>
                    <th className="py-3 px-2 text-center">Mevcut P</th>
                    <th className="py-3 px-2 text-center text-emerald-300">Simüle +P</th>
                    <th className="py-3 px-2 text-center">Sim. (G-B-M)</th>
                    <th className="py-3 px-2 text-center">Sim. Av</th>
                    <th className="py-3 px-3 text-center font-black text-amber-200 bg-brand-dark/40">Toplam P</th>
                    <th className="py-3 px-3 text-center w-36">Şampiyonluk İhtimali</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-maroon/10 bg-white">
                  {simulation.simulatedStandings.map((st, i) => {
                    // Classification borders
                    let borderClass = 'border-l-4 border-l-transparent';
                    if (i < 4) {
                      borderClass = 'border-l-4 border-l-blue-600'; // UCL
                    } else if (i < 8) {
                      borderClass = 'border-l-4 border-l-[#ff8800]'; // UEL
                    } else if (i >= simulation.simulatedStandings.length - 4) {
                      borderClass = 'border-l-4 border-l-emerald-600'; // UECL
                    }

                    return (
                      <tr
                        key={st.teamName}
                        onClick={() => onNavigate({ type: 'team-detail', teamName: st.teamName })}
                        className={`hover:bg-brand-cream/40 transition-colors cursor-pointer ${borderClass}`}
                      >
                        <td className="py-2.5 px-3 text-center font-black text-brand-maroon">
                          {i + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={st.logo}
                              className="w-7 h-7 rounded-full object-cover border border-brand-maroon/40"
                              alt=""
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/28?text=?';
                              }}
                            />
                            <span className="font-extrabold uppercase text-xs truncate max-w-[140px] sm:max-w-none">
                              {st.teamName}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono font-bold text-gray-600">
                          {st.elo.toFixed(1)}
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold text-gray-600">
                          {st.currentPoints}
                        </td>
                        <td className="py-2.5 px-2 text-center font-extrabold text-emerald-700 bg-emerald-50/50">
                          +{st.simulatedPoints}
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold text-gray-500 text-[11px]">
                          {st.simulatedWins}-{st.simulatedDraws}-{st.simulatedLosses}
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold text-gray-600">
                          {st.totalProjectedGoalDiff > 0 ? `+${st.totalProjectedGoalDiff}` : st.totalProjectedGoalDiff}
                        </td>
                        <td className="py-2.5 px-3 text-center font-black font-mono text-sm text-brand-maroon bg-brand-cream/60">
                          {st.totalProjectedPoints}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center gap-2 justify-center">
                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  st.championshipProbability >= 50
                                    ? 'bg-amber-500'
                                    : st.championshipProbability >= 20
                                    ? 'bg-emerald-500'
                                    : 'bg-blue-500'
                                }`}
                                style={{ width: `${Math.max(2, Math.min(100, st.championshipProbability))}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-black text-gray-700 font-mono w-7 text-right">
                              %{st.championshipProbability}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* League Classification Legend */}
            <div className="flex items-center justify-center flex-wrap gap-4 text-[10px] font-black uppercase text-gray-500 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                <span>1-4: Şampiyonlar Ligi (UCL)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff8800]" />
                <span>5-8: Avrupa Ligi (UEL)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <span>9-12: Konferans Ligi (UECL)</span>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------- */}
        {/* SUB-VIEW B: REMAINING MATCHES PREDICTIONS */}
        {/* -------------------------------------------------------- */}
        {activeSubTab === 'predictions' && (
          <div className="space-y-4">
            {/* Filter controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs font-black text-gray-600 uppercase">Hafta Filtresi:</label>
                <select
                  value={selectedWeekFilter}
                  onChange={(e) => setSelectedWeekFilter(e.target.value)}
                  className="bg-white border border-gray-300 text-xs font-extrabold rounded-xl px-3 py-1.5"
                >
                  <option value="all">Tüm Kalan Maçlar ({simulation.matchPredictions.length})</option>
                  {availableWeeks.map((w) => (
                    <option key={w} value={w}>
                      Hafta {w}
                    </option>
                  ))}
                </select>
              </div>

              <input
                type="text"
                placeholder="Takım ara (örn. Pofuspor)..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                className="bg-white border border-gray-300 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-maroon"
              />
            </div>

            {/* Match Cards List */}
            {filteredPredictions.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl text-xs text-gray-500 font-bold border border-gray-200">
                Filtreye uygun kalan maç bulunamadı.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredPredictions.map((pred) => {
                  const eloDiff = pred.team1Elo - pred.team2Elo;
                  const favorite =
                    eloDiff > 2
                      ? pred.team1
                      : eloDiff < -2
                      ? pred.team2
                      : null;

                  return (
                    <div
                      key={pred.matchId}
                      className="bg-white rounded-2xl border-2 border-brand-maroon/20 hover:border-brand-maroon/50 p-4 shadow-sm hover:shadow-md transition-all space-y-3"
                    >
                      {/* Week & Match Header */}
                      <div className="flex items-center justify-between text-[10px] font-black text-gray-400 uppercase">
                        <span className="bg-brand-maroon/10 text-brand-maroon px-2 py-0.5 rounded-full font-black">
                          {pred.hafta ? `Hafta ${pred.hafta}` : pred.date || 'LİG MAÇI'}
                        </span>
                        <span>
                          {favorite ? (
                            <span className="text-brand-maroon">
                              ⭐ Favori: {favorite} ({Math.abs(eloDiff).toFixed(1)} ELO Fark)
                            </span>
                          ) : (
                            <span className="text-gray-500">⚖️ Dengeli Karşılaşma</span>
                          )}
                        </span>
                      </div>

                      {/* Teams & ELO confrontation */}
                      <div className="grid grid-cols-3 items-center text-center gap-2">
                        {/* Team 1 */}
                        <div
                          onClick={() => onNavigate({ type: 'team-detail', teamName: pred.team1 })}
                          className="flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <img
                            src={pred.team1Logo}
                            className="w-11 h-11 rounded-full object-cover border-2 border-brand-maroon/40 bg-white mb-1 shadow-sm"
                            alt=""
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/44?text=?';
                            }}
                          />
                          <span className="font-black text-xs uppercase text-brand-dark truncate max-w-full">
                            {pred.team1}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-gray-500">
                            {pred.team1Elo.toFixed(1)} ELO
                          </span>
                        </div>

                        {/* VS & Simulated Result */}
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                            VS
                          </span>
                          <div className="bg-brand-maroon text-brand-gold px-3 py-1 rounded-xl font-black font-mono text-sm tracking-wider shadow-sm">
                            {pred.predictedScore1} - {pred.predictedScore2}
                          </div>
                          {pred.iyScore && (
                            <span className="text-[9px] font-bold text-gray-500 mt-0.5">
                              İY: {pred.iyScore}
                            </span>
                          )}
                          <span className="text-[9px] font-black uppercase text-emerald-700 mt-0.5">
                            {pred.predictedWinner === 'team1'
                              ? `${pred.team1} Kazanır`
                              : pred.predictedWinner === 'team2'
                              ? `${pred.team2} Kazanır`
                              : 'Beraberlik'}
                          </span>
                        </div>

                        {/* Team 2 */}
                        <div
                          onClick={() => onNavigate({ type: 'team-detail', teamName: pred.team2 })}
                          className="flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <img
                            src={pred.team2Logo}
                            className="w-11 h-11 rounded-full object-cover border-2 border-brand-maroon/40 bg-white mb-1 shadow-sm"
                            alt=""
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/44?text=?';
                            }}
                          />
                          <span className="font-black text-xs uppercase text-brand-dark truncate max-w-full">
                            {pred.team2}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-gray-500">
                            {pred.team2Elo.toFixed(1)} ELO
                          </span>
                        </div>
                      </div>

                      {/* Probability Distribution Bar */}
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between text-[10px] font-black text-gray-600">
                          <span className="text-emerald-700">%{pred.prob1} 1</span>
                          <span className="text-amber-700">%{pred.probDraw} X</span>
                          <span className="text-blue-700">%{pred.prob2} 2</span>
                        </div>
                        <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden flex">
                          <div
                            style={{ width: `${pred.prob1}%` }}
                            className="bg-emerald-500 h-full"
                            title={`${pred.team1} Galibiyeti: %${pred.prob1}`}
                          />
                          <div
                            style={{ width: `${pred.probDraw}%` }}
                            className="bg-amber-400 h-full"
                            title={`Beraberlik: %${pred.probDraw}`}
                          />
                          <div
                            style={{ width: `${pred.prob2}%` }}
                            className="bg-blue-500 h-full"
                            title={`${pred.team2} Galibiyeti: %${pred.prob2}`}
                          />
                        </div>
                      </div>

                      {/* Expected points (xP) */}
                      <div className="flex items-center justify-between text-[9px] font-extrabold text-gray-400 pt-1 border-t border-gray-100">
                        <span>xP: {pred.expectedPoints1}</span>
                        <span>xP: {pred.expectedPoints2}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------------- */}
        {/* SUB-VIEW C: INTERACTIVE HEAD-TO-HEAD MATCH SIMULATOR */}
        {/* -------------------------------------------------------- */}
        {activeSubTab === 'h2h' && (
          <div className="bg-white p-5 sm:p-6 rounded-2xl border-2 border-brand-maroon/20 shadow-sm space-y-6">
            <div>
              <h4 className="text-sm font-black text-brand-maroon uppercase tracking-wide flex items-center gap-2">
                <span>⚔️</span> Özel İkili Maç Tahmin Aracı (H2H)
              </h4>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                İstediğiniz iki takımı seçerek ELO puanlarına göre kazanma ihtimallerini ve simüle edilen maç sonucunu görün.
              </p>
            </div>

            {/* Team selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 block mb-1">
                  🏠 Ev Sahibi Takım:
                </label>
                <select
                  value={h2hTeam1}
                  onChange={(e) => setH2hTeam1(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl p-2.5 font-bold text-xs"
                >
                  {sortedEloTeams.map((t) => (
                    <option key={t.teamName} value={t.teamName}>
                      {t.teamName} ({t.elo.toFixed(1)} ELO)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 block mb-1">
                  ✈️ Deplasman Takımı:
                </label>
                <select
                  value={h2hTeam2}
                  onChange={(e) => setH2hTeam2(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl p-2.5 font-bold text-xs"
                >
                  {sortedEloTeams.map((t) => (
                    <option key={t.teamName} value={t.teamName}>
                      {t.teamName} ({t.elo.toFixed(1)} ELO)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* H2H Result Display */}
            {h2hResult && h2hTeam1 !== h2hTeam2 ? (
              <div className="bg-brand-cream/40 p-5 rounded-2xl border border-brand-maroon/20 space-y-4">
                <div className="grid grid-cols-3 items-center text-center gap-3">
                  {/* Team 1 */}
                  <div className="flex flex-col items-center">
                    <img
                      src={eloStatsMap[h2hTeam1]?.logo}
                      className="w-14 h-14 rounded-full object-cover border-2 border-brand-maroon bg-white shadow-md mb-1"
                      alt=""
                    />
                    <span className="font-black text-sm uppercase text-brand-dark">{h2hTeam1}</span>
                    <span className="text-xs font-mono font-black text-brand-maroon">
                      {eloStatsMap[h2hTeam1]?.elo.toFixed(1)} ELO
                    </span>
                  </div>

                  {/* Simulated score in center */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      SİMÜLE SKOR
                    </span>
                    <div className="bg-brand-maroon text-brand-gold px-5 py-2 rounded-2xl font-black font-mono text-2xl shadow-md">
                      {h2hResult.predictedScore1} - {h2hResult.predictedScore2}
                    </div>
                    {h2hResult.iyScore && (
                      <span className="text-[10px] font-bold text-gray-500 mt-1">
                        İlk Yarı: {h2hResult.iyScore}
                      </span>
                    )}
                    <span className="text-[11px] font-black uppercase text-emerald-700 mt-1">
                      {h2hResult.simulatedWinner === 'team1'
                        ? `${h2hTeam1} Galibiyeti`
                        : h2hResult.simulatedWinner === 'team2'
                        ? `${h2hTeam2} Galibiyeti`
                        : 'Beraberlik'}
                    </span>
                  </div>

                  {/* Team 2 */}
                  <div className="flex flex-col items-center">
                    <img
                      src={eloStatsMap[h2hTeam2]?.logo}
                      className="w-14 h-14 rounded-full object-cover border-2 border-brand-maroon bg-white shadow-md mb-1"
                      alt=""
                    />
                    <span className="font-black text-sm uppercase text-brand-dark">{h2hTeam2}</span>
                    <span className="text-xs font-mono font-black text-brand-maroon">
                      {eloStatsMap[h2hTeam2]?.elo.toFixed(1)} ELO
                    </span>
                  </div>
                </div>

                {/* Probability bar */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-xs font-black">
                    <span className="text-emerald-700">{h2hTeam1}: %{h2hResult.prob1}</span>
                    <span className="text-amber-700">Beraberlik: %{h2hResult.probDraw}</span>
                    <span className="text-blue-700">{h2hTeam2}: %{h2hResult.prob2}</span>
                  </div>
                  <div className="h-3 w-full bg-gray-200 rounded-full overflow-hidden flex shadow-inner">
                    <div style={{ width: `${h2hResult.prob1}%` }} className="bg-emerald-500 h-full" />
                    <div style={{ width: `${h2hResult.probDraw}%` }} className="bg-amber-400 h-full" />
                    <div style={{ width: `${h2hResult.prob2}%` }} className="bg-blue-500 h-full" />
                  </div>
                </div>

                {/* Re-roll match */}
                <div className="text-center pt-2">
                  <button
                    onClick={() => setH2hSeed((prev) => prev + 1)}
                    className="py-2 px-5 bg-brand-maroon hover:bg-brand-dark text-brand-gold font-black rounded-xl text-xs uppercase shadow-md transition-all active:scale-95 cursor-pointer inline-flex items-center gap-2"
                  >
                    <span>🎲</span> Maçı Tekrar Oynat (Zar At)
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-gray-500 font-bold bg-gray-50 rounded-xl">
                Lütfen karşılaştırma için iki farklı takım seçin.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
