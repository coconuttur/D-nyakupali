import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, doc, getDoc, getDocs, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { Player, Match, UserProfile } from '../types';
import { TrophiesShowcase, TrophyAdminModal } from './TrophiesShowcase';
import { calculatePlayerStatsFromMatches, buildPlayerAliasMap, getPlayerIdentifierSet, doesCandidateMatchPlayer, normalizePlayerName, stripAllDiacritics } from '../lib/playerStats';
import { mergeTournamentMatches } from '../lib/tournamentMatches';

interface PlayerProfileProps {
  playerName: string;
  playerId?: string;
  currentUser: UserProfile | null;
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onBack: () => void;
  onNavigate: (view: any) => void;
}

export default function PlayerProfile({ playerName, playerId, currentUser, currentLang, translations, onBack, onNavigate }: PlayerProfileProps) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [docId, setDocId] = useState<string | null>(null);
  const [teamLogo, setTeamLogo] = useState<string>('');
  const [countryLogo, setCountryLogo] = useState<string>('');
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [trophyModalOpen, setTrophyModalOpen] = useState(false);

  // Voting states
  const [votersModalOpen, setVotersModalOpen] = useState(false);
  const [likesUsers, setLikesUsers] = useState<any[]>([]);
  const [dislikesUsers, setDislikesUsers] = useState<any[]>([]);
  const [loadingVoters, setLoadingVoters] = useState(false);

  useEffect(() => {
    let latestFirestoreMatches: Match[] = [];

    const updateMatches = (snapList: Match[]) => {
      setMatches(mergeTournamentMatches(snapList));
    };

    const unsubMatches = onSnapshot(collection(db, 'matches'), (snap) => {
      const list: Match[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Match);
      });
      latestFirestoreMatches = list;
      updateMatches(list);
    });

    const handleTournamentUpdate = () => {
      updateMatches(latestFirestoreMatches);
    };

    window.addEventListener('tournament_matches_updated', handleTournamentUpdate);
    window.addEventListener('storage', handleTournamentUpdate);

    const unsubTeams = onSnapshot(collection(db, 'teams'), (snap) => {
      const dict: Record<string, string> = {};
      snap.forEach((d) => {
        const data = d.data();
        const name = data.name || '';
        dict[name] = data.logo || '';
        dict[d.id] = data.logo || '';
      });
      setTeamLogos(dict);
    });

    return () => {
      unsubMatches();
      unsubTeams();
      window.removeEventListener('tournament_matches_updated', handleTournamentUpdate);
      window.removeEventListener('storage', handleTournamentUpdate);
    };
  }, []);

  useEffect(() => {
    const unsubPlayers = onSnapshot(collection(db, "players"), (snap) => {
      const list: Player[] = [];
      let found: Player | null = null;
      let fId: string | null = null;

      const normTarget = normalizePlayerName(playerName);
      const strippedTarget = stripAllDiacritics(playerName);
      const normPlayerId = playerId ? normalizePlayerName(playerId) : '';

      snap.forEach((d) => {
        const pObj = { id: d.id, docId: d.id, ...d.data() } as unknown as Player;
        list.push(pObj);

        const dNorm = normalizePlayerName(d.id);
        const dStrip = stripAllDiacritics(d.id);
        const pNorm = normalizePlayerName(pObj.pname);
        const pStrip = stripAllDiacritics(pObj.pname);

        // 1. Direct doc ID match
        const matchesDocId = (normPlayerId && (dNorm === normPlayerId || dStrip === normPlayerId)) ||
          d.id === playerName || dNorm === normTarget || dStrip === strippedTarget;

        // 2. Name or alias match
        const matchesName = (pNorm && (pNorm === normTarget || pStrip === strippedTarget)) ||
          (normPlayerId && (pNorm === normPlayerId || pStrip === normPlayerId));

        if (matchesDocId || matchesName) {
          found = pObj;
          fId = d.id;
        }
      });

      setAllPlayers(list);

      if (found) {
        setDocId(fId);
        setPlayer(found);

        // Fetch team logo
        if ((found as Player).pteam) {
          const qLogo = query(collection(db, "teams"), where("name", "==", (found as Player).pteam));
          getDocs(qLogo).then(tSnap => {
            if (!tSnap.empty) setTeamLogo(tSnap.docs[0].data().logo || '');
          });
        }

        // Fetch country flag
        if ((found as Player).pülke) {
          const qCountry = query(collection(db, "ülkeler"), where("ülkead", "==", (found as Player).pülke));
          getDocs(qCountry).then(uSnap => {
            if (!uSnap.empty) setCountryLogo(uSnap.docs[0].data().ülkefoto || '');
          });
        }
      }
      setLoading(false);
    });

    return () => unsubPlayers();
  }, [playerName, playerId]);

  const t = translations[currentLang];

  const handleCastVote = async (choice: 'like' | 'dislike') => {
    if (!currentUser) {
      alert('Oy vermek için giriş yapmalısınız!');
      return;
    }
    if (!docId || !player) return;

    const ref = doc(db, 'players', docId);
    const likes = player.likes || [];
    const dislikes = player.dislikes || [];

    const updates: any = {};
    if (choice === 'like') {
      if (likes.includes(currentUser.uid)) return;
      updates.likes = arrayUnion(currentUser.uid);
      if (dislikes.includes(currentUser.uid)) {
        updates.dislikes = arrayRemove(currentUser.uid);
      }
    } else {
      if (dislikes.includes(currentUser.uid)) return;
      updates.dislikes = arrayUnion(currentUser.uid);
      if (likes.includes(currentUser.uid)) {
        updates.likes = arrayRemove(currentUser.uid);
      }
    }

    try {
      await updateDoc(ref, updates);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchVotersList = async () => {
    if (!player) return;
    setLoadingVoters(true);
    setVotersModalOpen(true);

    const pullUsersInfo = async (uids: string[]) => {
      const list: any[] = [];
      for (const uid of uids) {
        try {
          const res = await getDoc(doc(db, 'users', uid));
          if (res.exists()) {
            list.push({ uid, ...res.data() });
          } else {
            list.push({ uid, displayName: 'Gizli Kullanıcı', avatar: '' });
          }
        } catch (e) {
          list.push({ uid, displayName: 'Bilinmeyen', avatar: '' });
        }
      }
      return list;
    };

    const lUsers = await pullUsersInfo(player.likes || []);
    const dUsers = await pullUsersInfo(player.dislikes || []);

    setLikesUsers(lUsers);
    setDislikesUsers(dUsers);
    setLoadingVoters(false);
  };

  // Calculations for Ring voting charts
  const likesCount = player?.likes?.length || 0;
  const dislikesCount = player?.dislikes?.length || 0;
  const totalVotes = likesCount + dislikesCount;
  const likePct = totalVotes > 0 ? Math.round((likesCount / totalVotes) * 100) : 0;
  const dislikePct = totalVotes > 0 ? 100 - likePct : 0;

  const chartGradient = total === 0 
    ? 'conic-gradient(#ccc 100%, #ccc 0)' 
    : `conic-gradient(#2ecc71 ${likePct}%, #e74c3c 0)`;

  var total = totalVotes;

  // Calculate player performance strictly from matches using unified alias map
  const aliasMap = buildPlayerAliasMap(allPlayers.length > 0 ? allPlayers : (player ? [player] : []));
  const matchStats = player ? calculatePlayerStatsFromMatches(player, matches, aliasMap) : null;
  const matchesCount = matchStats ? matchStats.mac : (player?.poyn || 0);
  const playerGoals = matchStats ? matchStats.goals : (player?.goals || 0);
  const playerAssists = matchStats ? matchStats.asistsay : (player?.asistsay || 0);
  const ratioVal = matchStats ? matchStats.gol_mac.toFixed(2) : (matchesCount > 0 ? (playerGoals / matchesCount).toFixed(2) : '0.00');
  const ratingVal = matchStats ? matchStats.ratingoyFormatted : (player?.ratingoy || '0.0');

  return (
    <div className="space-y-6">
      <div className="bg-brand-card p-4 rounded-b-2xl flex items-center justify-between border-b-4 border-brand-maroon shadow-md relative shrink-0">
        <button 
          onClick={onBack}
          className="bg-brand-gold text-brand-dark hover:scale-105 transition-transform font-black text-xs uppercase px-4 py-2 rounded-xl h-10 cursor-pointer border border-brand-maroon shadow-sm flex items-center gap-1.5"
        >
          <span>←</span>
          <span>{t.back}</span>
        </button>
        <h2 className="text-lg font-black text-brand-maroon select-none uppercase">Profil</h2>
        <div className="w-16"></div>
      </div>

      {loading ? (
        <h3 className="text-center text-gray-500 font-bold">{t.loading}</h3>
      ) : !player ? (
        <h3 className="text-center text-red-500 font-bold">Oyuncu bulunamadı.</h3>
      ) : (
        <div className="max-w-3xl mx-auto space-y-6 animate-fade-in select-text">
          <div className="bg-brand-card rounded-3xl p-6 md:p-10 shadow-xl border-l-12 border-brand-maroon relative flex flex-col md:flex-row items-center gap-8 select-text">
            {/* Player large image card */}
            <div className="relative shrink-0 select-text">
              <img 
                src={player.foto} 
                className="w-48 h-48 rounded-2xl object-cover border-4 border-white shadow-lg bg-white shrink-0" 
                alt="profile" 
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${player.pname}&background=800000&color=fff&size=150`;
                }}
              />
              <div className="absolute -bottom-4 -right-4 bg-brand-gold text-brand-dark min-w-[55px] h-14 rounded-xl flex flex-col items-center justify-center font-black border-4 border-brand-maroon shadow-md select-none shrink-0">
                <small className="text-[10px] leading-none">GEN</small>
                <span className="text-xl leading-none mt-0.5">{player.gen || '0'}</span>
              </div>
            </div>

            <div className="flex-1 text-center md:text-left space-y-4">
              <h1 className="text-3xl md:text-4xl font-black text-brand-maroon tracking-tight leading-none uppercase">{player.pname}</h1>
              
              <div className="flex flex-col gap-2 items-center md:items-start">
                {player.noclub ? (
                  <div className="flex items-center gap-2 bg-gray-100 py-1.5 px-4 rounded-full border border-gray-300 shadow-sm shrink-0">
                    <span className="text-xs">⚽</span>
                    <span className="text-xs font-black text-gray-700 uppercase tracking-wider">Takımsız</span>
                  </div>
                ) : (
                  <div 
                    onClick={() => onNavigate({ type: 'team-detail', teamName: player.pteam })}
                    className="flex items-center gap-3 bg-white py-1.5 px-4 rounded-full border border-gray-150 shadow-sm shrink-0 cursor-pointer hover:scale-103 transition-transform"
                  >
                    {teamLogo && <img src={teamLogo} className="w-8 h-8 rounded-full bg-white object-cover" alt="team" />}
                    <span className="text-xs font-black text-brand-dark uppercase tracking-wider">{player.pteam}</span>
                  </div>
                )}

                {(player.kiralik || player.kiralikTakim) && (
                  <div 
                    onClick={() => player.kiralikTakim && onNavigate({ type: 'team-detail', teamName: player.kiralikTakim })}
                    className="flex items-center gap-2 bg-amber-100 py-1.5 px-4 rounded-full border border-amber-300 shadow-sm shrink-0 cursor-pointer hover:scale-103 transition-transform"
                  >
                    <span className="text-xs">🔄</span>
                    <span className="text-xs font-black text-amber-900 uppercase tracking-wider">
                      Kiralık: {player.kiralikTakim || player.pteam}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 bg-white py-1.5 px-4 rounded-full border border-gray-150 shadow-sm shrink-0">
                  {countryLogo && <img src={countryLogo} className="w-8 h-5 object-cover rounded border" alt="flag" />}
                  <span className="text-xs font-black text-brand-dark uppercase tracking-wider">{player.pülke || '-'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Large Trophies Showcase between Profile and Süperlig Sezon */}
          <TrophiesShowcase 
            kupalar={player.kupalar} 
            isAdmin={!!currentUser?.admin} 
            onManageClick={() => setTrophyModalOpen(true)} 
            size="large"
            currentUser={currentUser}
            onNavigate={onNavigate}
          />

          <div className="text-center my-6">
            <span className="bg-brand-maroon text-white py-1.5 px-6 rounded-full font-black text-xs uppercase tracking-widest">{t.season}</span>
          </div>

          {/* Social voting chart card */}
          <div className="bg-brand-card rounded-2xl p-5 md:p-6 flex items-center justify-between gap-4 border border-gray-200 shadow-sm max-w-md mx-auto">
            <button onClick={() => handleCastVote('like')} className="w-12 h-12 rounded-full border border-gray-200 bg-white text-base shadow-sm shrink-0 hover:scale-105 active:scale-95 transition-transform">👍</button>
            
            <div onClick={fetchVotersList} className="flex-1 text-center cursor-pointer hover:scale-102 transition-transform select-none" title="Detayları görmek için tıkla">
              <h4 className="font-black text-brand-dark text-xs block uppercase">Popülarite</h4>
              <span className="text-[10px] text-gray-500 font-bold block mb-3">Bobblekolik Oyları</span>

              <div className="flex items-center justify-center gap-3">
                <span className="text-sm font-black text-green-500">%{likePct} 👍</span>
                <div className="w-16 h-16 rounded-full flex items-center justify-center relative select-none hover:scale-105 transition-transform" style={{ background: chartGradient }}>
                  <div className="absolute w-11 h-11 bg-brand-card rounded-full" />
                </div>
                <span className="text-sm font-black text-red-500">👎 %{dislikePct}</span>
              </div>
            </div>

            <button onClick={() => handleCastVote('dislike')} className="w-12 h-12 rounded-full border border-gray-200 bg-white text-base shadow-sm shrink-0 hover:scale-105 active:scale-95 transition-transform">👎</button>
          </div>

          {/* Stats matrix grid - strictly derived from matches */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 md:gap-4 select-text">
              {[
                { val: matchesCount, desc: t.mac },
                { val: playerGoals, desc: t.gol },
                { val: playerAssists, desc: t.asist },
                { val: ratioVal, desc: t.go },
                { val: ratingVal, desc: t.rat }
              ].map((stat, idx) => (
                <div key={idx} className="bg-brand-card rounded-2xl p-4 text-center border-b-4 border-gray-200 hover:border-b-brand-maroon focus:border-b-brand-maroon transition-colors shadow-sm">
                  <span className="text-xl md:text-2xl font-black text-brand-maroon block leading-none">{stat.val}</span>
                  <span className="text-[9px] font-black text-gray-400 block tracking-wider uppercase mt-1.5">{stat.desc}</span>
                </div>
              ))}
            </div>

            {/* Match Disciplinary & MVP Row */}
            {matchStats && (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2 md:gap-3 select-text">
                  <div className="bg-brand-card rounded-xl p-2.5 text-center border border-amber-300 shadow-sm flex flex-col items-center justify-center">
                    <span className="text-base md:text-lg font-black text-brand-dark block leading-none">🏆 {matchStats.mvp}</span>
                    <span className="text-[8px] md:text-[9px] font-black text-gray-500 block uppercase mt-1">MVP</span>
                  </div>
                  <div className="bg-brand-card rounded-xl p-2.5 text-center border border-yellow-300 shadow-sm flex flex-col items-center justify-center">
                    <span className="text-base md:text-lg font-black text-yellow-700 block leading-none">🟨 {matchStats.sari_kart}</span>
                    <span className="text-[8px] md:text-[9px] font-black text-gray-500 block uppercase mt-1">Sarı Kart</span>
                  </div>
                  <div className="bg-brand-card rounded-xl p-2.5 text-center border border-emerald-300 shadow-sm flex flex-col items-center justify-center">
                    <span className="text-base md:text-lg font-black text-emerald-700 block leading-none">🟩 {matchStats.yesil_kart}</span>
                    <span className="text-[8px] md:text-[9px] font-black text-gray-500 block uppercase mt-1">Yeşil Kart</span>
                  </div>
                  <div className="bg-brand-card rounded-xl p-2.5 text-center border border-red-300 shadow-sm flex flex-col items-center justify-center">
                    <span className="text-base md:text-lg font-black text-red-600 block leading-none">🟥 {matchStats.kirmizi_kart}</span>
                    <span className="text-[8px] md:text-[9px] font-black text-gray-500 block uppercase mt-1">Kırmızı Kart</span>
                  </div>
                </div>

                {matchStats.ownGoals > 0 && (
                  <div className="bg-red-50 text-red-800 text-xs font-black p-2 rounded-xl border border-red-300 text-center flex items-center justify-center gap-2 shadow-xs">
                    <span className="text-sm">🥅</span>
                    <span>Kendi Kalesine Gol: {matchStats.ownGoals}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Matches played by this player with rating on the right (Like in Team Profile) */}
          <div>
            <h2 className="text-lg font-black text-brand-dark mb-4 uppercase tracking-wider relative flex items-center gap-2">
              <span className="w-6 h-1 bg-brand-maroon rounded-full shrink-0" />
              <span>Oynadığı Maçlar & Reytingler</span>
            </h2>

            {(() => {
              const identifiers = player ? getPlayerIdentifierSet(player, aliasMap) : new Set<string>([normalizePlayerName(playerName), stripAllDiacritics(playerName)]);
              const pDocId = docId || (player as any)?.id || (player as any)?.docId;

              const playerPlayedMatches = matches.filter(m => {
                if (!m.played) return false;

                // 1. Lineup check
                const lineup = m.lineup || {};
                let hasLineup = false;
                for (const [key, val] of Object.entries(lineup)) {
                  const pVal: any = val;
                  const keyMatch = doesCandidateMatchPlayer(key, identifiers);
                  const idMatch = pVal?.playerId && (pVal.playerId === pDocId || identifiers.has(normalizePlayerName(pVal.playerId)));
                  const nameMatch = pVal?.pname && doesCandidateMatchPlayer(pVal.pname, identifiers);
                  if (keyMatch || idMatch || nameMatch) {
                    if (pVal?.played !== false || (pVal?.rating !== undefined && Number(pVal?.rating) > 0)) {
                      hasLineup = true;
                      break;
                    }
                  }
                }

                // 2. Timeline check
                const hasTimeline = (m.timeline || []).some((e: any) => 
                  doesCandidateMatchPlayer(e.scorer, identifiers) ||
                  doesCandidateMatchPlayer(e.assist, identifiers) ||
                  doesCandidateMatchPlayer(e.player, identifiers) ||
                  doesCandidateMatchPlayer(e.subIn, identifiers) ||
                  doesCandidateMatchPlayer(e.subOut, identifiers)
                );

                // 3. MVP check
                const isMvp = doesCandidateMatchPlayer(m.mvp, identifiers);

                return hasLineup || hasTimeline || isMvp;
              }).sort((a, b) => (Number(b.datejav) || 0) - (Number(a.datejav) || 0));

              if (playerPlayedMatches.length === 0) {
                return (
                  <span className="text-gray-400 font-bold block p-4 bg-brand-card rounded-2xl">
                    Bu oyuncunun henüz kayıtlı bir maçı bulunmamaktadır.
                  </span>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {playerPlayedMatches.map((m, idx) => {
                    const lineup = m.lineup || {};
                    let pLineup: any = null;
                    for (const [key, val] of Object.entries(lineup)) {
                      const pVal: any = val;
                      const keyMatch = doesCandidateMatchPlayer(key, identifiers);
                      const idMatch = pVal?.playerId && (pVal.playerId === pDocId || identifiers.has(normalizePlayerName(pVal.playerId)));
                      const nameMatch = pVal?.pname && doesCandidateMatchPlayer(pVal.pname, identifiers);
                      if (keyMatch || idMatch || nameMatch) {
                        pLineup = val;
                        break;
                      }
                    }

                    let matchRating: number | null = null;
                    if (pLineup && pLineup.rating !== undefined && !isNaN(Number(pLineup.rating)) && Number(pLineup.rating) > 0) {
                      matchRating = Number(pLineup.rating);
                    } else if (doesCandidateMatchPlayer(m.mvp, identifiers) && m.rating) {
                      matchRating = Number(m.rating) || null;
                    }

                    const isMvp = doesCandidateMatchPlayer(m.mvp, identifiers);
                    const pGoals = (m.timeline || []).filter(e => e.type === 'goal' && !e.isKK && doesCandidateMatchPlayer(e.scorer, identifiers)).length;
                    const pAssists = (m.timeline || []).filter(e => e.type === 'goal' && doesCandidateMatchPlayer(e.assist, identifiers)).length;
                    const pCards = (m.timeline || []).filter(e => e.type === 'card' && doesCandidateMatchPlayer(e.player, identifiers));
                    const pSubIn = (m.timeline || []).find(e => e.type === 'sub' && doesCandidateMatchPlayer(e.subIn, identifiers));
                    const pSubOut = (m.timeline || []).find(e => e.type === 'sub' && doesCandidateMatchPlayer(e.subOut, identifiers));
                    const pKK = (m.timeline || []).filter(e => e.type === 'goal' && e.isKK && doesCandidateMatchPlayer(e.scorer, identifiers)).length;

                    let ratingColor = 'bg-gray-200 border-gray-300 text-gray-700';
                    if (matchRating !== null) {
                      if (matchRating >= 7.5) {
                        ratingColor = 'bg-green-600 border-green-500 text-white';
                      } else if (matchRating >= 6.0) {
                        ratingColor = 'bg-amber-500 border-amber-400 text-black';
                      } else {
                        ratingColor = 'bg-red-600 border-red-500 text-white';
                      }
                    }

                    return (
                      <div 
                        key={m.id || idx}
                        onClick={() => onNavigate({ type: 'match-detail', matchId: `${m.team1}-vs-${m.team2}-${m.datejav}` })}
                        className="bg-brand-card p-4 md:p-5 rounded-2xl border-l-8 border-brand-maroon shadow-sm cursor-pointer hover:scale-101 hover:-translate-y-0.5 transition-all text-center select-text flex flex-col justify-between gap-3 relative"
                      >
                        {/* Header: Date & Info */}
                        <div className="flex items-center justify-between text-[10px] font-black text-brand-maroon uppercase tracking-wider">
                          <span>📅 {m.date || 'Tarih Belirtilmemiş'} {m.hafta ? `• ${m.hafta}. Hafta` : ''}</span>
                          {isMvp && (
                            <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded-full text-[9px] font-black">
                              🏆 MVP
                            </span>
                          )}
                        </div>

                        {/* Middle: Teams, Score and Rating on the right */}
                        <div className="flex justify-between items-center gap-2">
                          {/* Team 1 */}
                          <div className="flex flex-col items-center flex-1 min-w-0">
                            <img 
                              src={teamLogos[m.team1] || 'https://via.placeholder.com/50'} 
                              className="w-10 h-10 rounded-full border bg-white object-cover shadow-sm shrink-0" 
                              alt={m.team1} 
                            />
                            <span className="text-xs font-extrabold mt-1 text-brand-dark block truncate w-full text-center">{m.team1}</span>
                          </div>

                          {/* Score */}
                          <div className="flex flex-col items-center shrink-0">
                            <span className="py-1 px-3.5 bg-brand-dark text-brand-gold font-black text-base rounded-xl border border-brand-gold shadow-inner shrink-0">
                              {m.score1} - {m.score2}
                            </span>
                            {m.iyScore && (
                              <span className="text-[8px] font-bold text-gray-500 mt-0.5">İY: {m.iyScore}</span>
                            )}
                          </div>

                          {/* Team 2 */}
                          <div className="flex flex-col items-center flex-1 min-w-0">
                            <img 
                              src={teamLogos[m.team2] || 'https://via.placeholder.com/50'} 
                              className="w-10 h-10 rounded-full border bg-white object-cover shadow-sm shrink-0" 
                              alt={m.team2} 
                            />
                            <span className="text-xs font-extrabold mt-1 text-brand-dark block truncate w-full text-center">{m.team2}</span>
                          </div>

                          {/* Player Rating Box on the right */}
                          <div className="flex flex-col items-center justify-center shrink-0 pl-2 border-l border-brand-maroon/15 min-w-16">
                            <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">REYTİNG</span>
                            {matchRating !== null ? (
                              <div className={`px-2.5 py-1 rounded-xl font-black text-xs md:text-sm border shadow-xs flex items-center gap-1 ${ratingColor}`}>
                                <span>⭐</span>
                                <span>{matchRating.toFixed(1)}</span>
                              </div>
                            ) : (
                              <div className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded-lg text-[10px] font-black border border-gray-300">
                                Oynadı
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Player event badges in this match */}
                        {(pGoals > 0 || pAssists > 0 || pCards.length > 0 || pSubIn || pSubOut || pKK > 0) && (
                          <div className="flex items-center justify-center gap-1.5 flex-wrap pt-1 border-t border-brand-maroon/10">
                            {pGoals > 0 && (
                              <span className="text-[8px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300 px-1.5 py-0.2 rounded">
                                ⚽ {pGoals} Gol
                              </span>
                            )}
                            {pAssists > 0 && (
                              <span className="text-[8px] font-black bg-blue-100 text-blue-900 border border-blue-300 px-1.5 py-0.2 rounded">
                                👟 {pAssists} Asist
                              </span>
                            )}
                            {pCards.map((c, cIdx) => (
                              <span key={cIdx} className="text-[8px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded">
                                {c.cardColor === 'Sarı' ? '🟨' : c.cardColor === 'Yeşil' ? '🟩' : '🟥'} {c.minute}
                              </span>
                            ))}
                            {pSubIn && (
                              <span className="text-[8px] font-black bg-green-100 text-green-900 border border-green-300 px-1.5 py-0.2 rounded">
                                ▲ {pSubIn.minute}
                              </span>
                            )}
                            {pSubOut && (
                              <span className="text-[8px] font-black bg-red-100 text-red-900 border border-red-300 px-1.5 py-0.2 rounded">
                                ▼ {pSubOut.minute}
                              </span>
                            )}
                            {pKK > 0 && (
                              <span className="text-[8px] font-black bg-red-600 text-white px-1.5 py-0.2 rounded">
                                🥅 {pKK} K.K.
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Player Wiki bio section */}
          <div className="bg-brand-card rounded-3xl p-6 md:p-8 shadow-sm border border-gray-200 relative select-text">
            <h3 className="text-sm font-black text-brand-maroon tracking-wider uppercase mb-3 flex items-center gap-2">
              <span className="w-6 h-1 bg-brand-gold rounded-full shrink-0" />
              {t.bio}
            </h3>
            <p className="text-xs font-semibold text-gray-700 leading-relaxed whitespace-pre-wrap">{player.bilgi || 'Bu oyuncuya ait biyografi açıklaması henüz girilmemiş.'}</p>
          </div>

          {player.instaoy && (
            <a 
              href={player.instaoy} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="bg-gradient-to-r from-orange-400 via-pink-500 to-indigo-600 text-white rounded-2xl p-4 font-black text-xs md:text-sm shadow-md tracking-wider flex items-center justify-center gap-2 hover:scale-102 transition-transform uppercase"
            >
              <img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Instagram_icon.png" width="20" height="20" alt="insta" />
              {t.insta}
            </a>
          )}
        </div>
      )}

      {/* VOTERS DETAILED MODAL */}
      {votersModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 select-text">
          <div className="bg-[#f2ede1] text-[#3d3d3d] w-full max-w-md rounded-2xl p-6 border-b-6 border-brand-maroon overflow-y-auto max-h-[80vh] relative select-text">
            <button onClick={() => setVotersModalOpen(false)} className="absolute top-4 right-4 text-xl font-bold text-brand-maroon">✕</button>
            <h3 className="text-center font-black text-base border-b border-gray-300 pb-2 mb-4 uppercase">Oy Verenlerin Detayları</h3>

            {loadingVoters ? (
              <p className="text-center text-xs text-gray-500 font-bold p-6">Sorgular çözülüyor, lütfen bekleyin...</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 select-text">
                <div className="p-3 bg-white/40 rounded-xl border border-gray-200 flex flex-col min-h-[250px]">
                  <h4 className="text-xs font-black text-green-600 text-center tracking-wide uppercase border-b border-gray-200 pb-1.5 mb-3">👍 Sevenler</h4>
                  <div className="space-y-2 overflow-y-auto flex-1 h-44 pr-1">
                    {likesUsers.length === 0 ? (
                      <span className="text-[10px] text-gray-400 font-bold block text-center">Boş</span>
                    ) : (
                      likesUsers.map((lU) => (
                        <div key={lU.uid} className="flex items-center gap-2 bg-white/80 p-1 rounded-full border border-gray-200 shadow-sm shrink-0">
                          <img src={lU.avatar || `https://ui-avatars.com/api/?name=${lU.displayName}`} className="w-6 h-6 rounded-full object-cover border border-brand-maroon" alt="av" />
                          <span className="text-[9px] font-black text-gray-800 truncate">{lU.displayName}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="p-3 bg-white/40 rounded-xl border border-gray-200 flex flex-col min-h-[250px]">
                  <h4 className="text-xs font-black text-red-500 text-center tracking-wide uppercase border-b border-gray-200 pb-1.5 mb-3">👎 Sevmeyenler</h4>
                  <div className="space-y-2 overflow-y-auto flex-1 h-44 pr-1">
                    {dislikesUsers.length === 0 ? (
                      <span className="text-[10px] text-gray-400 font-bold block text-center">Boş</span>
                    ) : (
                      dislikesUsers.map((dU) => (
                        <div key={dU.uid} className="flex items-center gap-2 bg-white/80 p-1 rounded-full border border-gray-200 shadow-sm shrink-0">
                          <img src={dU.avatar || `https://ui-avatars.com/api/?name=${dU.displayName}`} className="w-6 h-6 rounded-full object-cover border border-brand-maroon" alt="av" />
                          <span className="text-[9px] font-black text-gray-800 truncate">{dU.displayName}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* TROPHY ADMIN MODAL */}
      <TrophyAdminModal
        isOpen={trophyModalOpen}
        onClose={() => setTrophyModalOpen(false)}
        kupalar={player?.kupalar}
        targetName={player?.pname || ''}
        onSave={async (updated) => {
          if (!docId) return;
          await updateDoc(doc(db, 'players', docId), { kupalar: updated });
        }}
      />
    </div>
  );
}
