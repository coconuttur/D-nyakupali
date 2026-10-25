import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, doc, getDoc, getDocs, updateDoc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { Team, Player, Match, UserProfile } from '../types';
import { TrophiesShowcase, TrophyAdminModal } from './TrophiesShowcase';

import { getMatchCompetitionType, CompetitionCategory } from '../lib/playerStats';
import { mergeTournamentMatches, normalizeTeamName } from '../lib/tournamentMatches';

interface TeamDetailProps {
  teamName: string;
  currentUser: UserProfile | null;
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onBack: () => void;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
}

export const COMPETITION_TABS: {
  id: CompetitionCategory | 'all';
  label: string;
  shortLabel: string;
  icon: string;
  badgeBg: string;
  badgeText: string;
  borderCol: string;
  accentCol: string;
}[] = [
  {
    id: 'all',
    label: 'Tüm Maçlar',
    shortLabel: 'Tümü',
    icon: '📋',
    badgeBg: 'bg-brand-dark text-brand-gold',
    badgeText: 'text-brand-gold',
    borderCol: 'border-brand-gold',
    accentCol: 'border-l-brand-maroon'
  },
  {
    id: 'league',
    label: 'Süper Lig',
    shortLabel: 'Süper Lig',
    icon: '⚽',
    badgeBg: 'bg-red-950 text-red-200',
    badgeText: 'text-red-300',
    borderCol: 'border-red-600/70',
    accentCol: 'border-l-red-600'
  },
  {
    id: 'ucl',
    label: 'Şampiyonlar Ligi (UCL / BCL)',
    shortLabel: 'UCL / BCL',
    icon: '⭐',
    badgeBg: 'bg-blue-950 text-amber-300',
    badgeText: 'text-amber-300',
    borderCol: 'border-blue-500/70',
    accentCol: 'border-l-blue-600'
  },
  {
    id: 'uel',
    label: 'Avrupa Ligi (UEL / BEL)',
    shortLabel: 'UEL / BEL',
    icon: '🥈',
    badgeBg: 'bg-amber-950 text-amber-200',
    badgeText: 'text-amber-300',
    borderCol: 'border-amber-600/70',
    accentCol: 'border-l-amber-600'
  },
  {
    id: 'uecl',
    label: 'Konferans Ligi (UECL / BECL)',
    shortLabel: 'UECL / BECL',
    icon: '🥉',
    badgeBg: 'bg-emerald-950 text-emerald-200',
    badgeText: 'text-emerald-300',
    borderCol: 'border-emerald-600/70',
    accentCol: 'border-l-emerald-600'
  },
  {
    id: 'wpc',
    label: 'Kupa & WPC (Turnuva)',
    shortLabel: 'Kupa & WPC',
    icon: '🏆',
    badgeBg: 'bg-purple-950 text-purple-200',
    badgeText: 'text-purple-300',
    borderCol: 'border-purple-600/70',
    accentCol: 'border-l-purple-600'
  }
];

export default function TeamDetail({ teamName, currentUser, currentLang, translations, onBack, onNavigate, teamLogos }: TeamDetailProps) {
  const [team, setTeam] = useState<Team | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [countryFlag, setCountryFlag] = useState<string>('');
  const [mascotPhoto, setMascotPhoto] = useState<string>('');
  const [teamForm, setTeamForm] = useState<string[]>([]);
  const [squad, setSquad] = useState<Player[]>([]);
  const [playedMatches, setPlayedMatches] = useState<Match[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [trophyModalOpen, setTrophyModalOpen] = useState(false);

  // Tournament/Competition filter tabs
  const [selectedCompetition, setSelectedCompetition] = useState<CompetitionCategory | 'all'>('all');
  const [matchStatusFilter, setMatchStatusFilter] = useState<'all' | 'played' | 'upcoming'>('all');
  const [tournamentUpdateCounter, setTournamentUpdateCounter] = useState(0);

  // Loan management modal states
  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [allPlayersList, setAllPlayersList] = useState<{ id: string; player: Player }[]>([]);
  const [selectedLoanPlayerId, setSelectedLoanPlayerId] = useState<string>('');
  const [customLoanPlayerName, setCustomLoanPlayerName] = useState<string>('');

  // Voting states
  const [votersModalOpen, setVotersModalOpen] = useState(false);
  const [likesUsers, setLikesUsers] = useState<any[]>([]);
  const [dislikesUsers, setDislikesUsers] = useState<any[]>([]);
  const [loadingVoters, setLoadingVoters] = useState(false);

  // Listen to local tournament changes so matches refresh instantly
  useEffect(() => {
    const handleTournamentUpdate = () => {
      setTournamentUpdateCounter((prev) => prev + 1);
    };
    window.addEventListener('tournament_matches_updated', handleTournamentUpdate);
    return () => {
      window.removeEventListener('tournament_matches_updated', handleTournamentUpdate);
    };
  }, []);

  useEffect(() => {
    let unsubSquad: (() => void) | null = null;
    let unsubMatches: (() => void) | null = null;

    // 1. Fetch team metadata in real time by subscribing to ALL teams
    const unsubscribe = onSnapshot(collection(db, "teams"), (snap) => {
      const foundDoc = snap.docs.find(d => {
        const dId = d.id.toLowerCase().trim();
        const dName = (d.data().name || '').toLowerCase().trim();
        const tName = teamName.toLowerCase().trim();
        const normTName = normalizeTeamName(tName).toLowerCase();
        return dId === tName || dName === tName || normalizeTeamName(dId).toLowerCase() === normTName || normalizeTeamName(dName).toLowerCase() === normTName;
      });

      if (foundDoc) {
        const resolvedDocId = foundDoc.id;
        const resolvedTeam = foundDoc.data() as Team;
        
        setDocId(resolvedDocId);
        setTeam(resolvedTeam);

        // Fetch country flag
        if (resolvedTeam.ülke) {
          const qC = query(collection(db, "ülkeler"), where("ülkead", "==", resolvedTeam.ülke));
          getDocs(qC).then(uSnap => {
            if (!uSnap.empty) setCountryFlag(uSnap.docs[0].data().ülkefoto || '');
          });
        }

        // Fetch mascot photo
        if (resolvedTeam.hayvan) {
          const qH = query(collection(db, "hayvanlar"), where("hayvanad", "==", resolvedTeam.hayvan));
          getDocs(qH).then(hSnap => {
            if (!hSnap.empty) setMascotPhoto(hSnap.docs[0].data().hayvanfoto || '');
          });
        }

        // 2. Fetch Squad in real time using the resolved team identifiers
        if (!unsubSquad) {
          unsubSquad = onSnapshot(collection(db, "players"), (pSnap) => {
            const list: Player[] = [];
            pSnap.forEach((d) => {
              const p = d.data() as Player;
              const pTeamLower = normalizeTeamName(p.pteam || '').toLowerCase().trim();
              const pKiralikLower = normalizeTeamName(p.kiralikTakim || '').toLowerCase().trim();
              const rDocLower = normalizeTeamName(resolvedDocId).toLowerCase().trim();
              const rNameLower = normalizeTeamName(resolvedTeam.name || '').toLowerCase().trim();
              
              // Match player if their team or kiralikTakim matches resolved name or doc ID
              const isMatch = pTeamLower === rDocLower || 
                              pTeamLower === rNameLower ||
                              (p.kiralik && (pKiralikLower === rDocLower || pKiralikLower === rNameLower));
              
              if (isMatch) {
                list.push(p);
              }
            });
            list.sort((a,b) => b.goals - a.goals);
            setSquad(list);
          });
        }

        // 3. Fetch Matches in real time using the resolved team identifiers & merge tournament matches
        if (!unsubMatches) {
          unsubMatches = onSnapshot(collection(db, "matches"), (mSnap) => {
            const rawList: Match[] = [];
            mSnap.forEach((d) => {
              rawList.push({ id: d.id, ...d.data() } as Match);
            });

            // Merge with local tournament matches (eliminates deleted matches and merges brackets)
            const merged = mergeTournamentMatches(rawList);

            const played: Match[] = [];
            const upcoming: Match[] = [];

            const rDocLower = normalizeTeamName(resolvedDocId).toLowerCase().trim();
            const rNameLower = normalizeTeamName(resolvedTeam.name || '').toLowerCase().trim();

            merged.forEach((m) => {
              const mt1 = normalizeTeamName(m.team1 || '').toLowerCase().trim();
              const mt2 = normalizeTeamName(m.team2 || '').toLowerCase().trim();
              
              const isT1 = mt1 === rDocLower || mt1 === rNameLower;
              const isT2 = mt2 === rDocLower || mt2 === rNameLower;

              if (isT1 || isT2) {
                if (m.played) played.push(m);
                else upcoming.push(m);
              }
            });

            // Sort lists
            played.sort((a,b) => (Number(b.datejav) || 0) - (Number(a.datejav) || 0)); // last played first
            upcoming.sort((a,b) => (Number(a.datejav) || 0) - (Number(b.datejav) || 0)); // soonest play first

            setPlayedMatches(played);
            setUpcomingMatches(upcoming);

            // Compute last 5 form indicators using resolved name
            const last5 = played.slice(0, 5);
            const reversed = [...last5].reverse();
            const sqs: string[] = reversed.map((match) => {
              const mt1 = normalizeTeamName(match.team1 || '').toLowerCase().trim();
              const isT1 = mt1 === rDocLower || mt1 === rNameLower;
              const own = Number(isT1 ? match.score1 : match.score2);
              const opp = Number(isT1 ? match.score2 : match.score1);
              if (own > opp) return 'W';
              if (own < opp) return 'L';
              return 'D';
            });

            while (sqs.length < 5) sqs.unshift('-');
            setTeamForm(sqs);
            setLoading(false);
          });
        }
      }
    });

    return () => {
      unsubscribe();
      if (unsubSquad) unsubSquad();
      if (unsubMatches) unsubMatches();
    };
  }, [teamName, tournamentUpdateCounter]);

  const handleCastVote = async (choice: 'like' | 'dislike') => {
    if (!currentUser) {
      alert('Oy vermek için giriş yapmalısınız!');
      return;
    }
    if (!docId || !team) return;

    const ref = doc(db, 'teams', docId);
    const likes = team.likes || [];
    const dislikes = team.dislikes || [];

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
    if (!team) return;
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

    const lUsers = await pullUsersInfo(team.likes || []);
    const dUsers = await pullUsersInfo(team.dislikes || []);

    setLikesUsers(lUsers);
    setDislikesUsers(dUsers);
    setLoadingVoters(false);
  };

  const t = translations[currentLang];

  const teamLikesCount = team?.likes?.length || 0;
  const teamDislikesCount = team?.dislikes?.length || 0;
  const totalVotes = teamLikesCount + teamDislikesCount;
  const likePct = totalVotes > 0 ? Math.round((teamLikesCount / totalVotes) * 100) : 0;
  const dislikePct = totalVotes > 0 ? 100 - likePct : 0;
  const chartGradient = totalVotes === 0 ? 'conic-gradient(#ccc 100%, #ccc 0)' : `conic-gradient(#2ecc71 ${likePct}%, #e74c3c 0)`;

  const squadCount = squad.length;
  const squadTotalGen = squad.reduce((sum, p) => sum + (Number(p.gen) || 0), 0);
  const squadAvgGen = squadCount > 0 ? (squadTotalGen / squadCount).toFixed(2) : '0';
  const squadTotalGoals = squad.reduce((sum, p) => sum + (Number(p.goals) || 0), 0);

  return (
    <div className="space-y-8">
      {/* Dynamic Sub nav bar */}
      <div className="flex justify-between items-center py-2 px-4 bg-brand-dark rounded-xl border border-brand-gold select-none z-10 shadow-sm">
        <button onClick={onBack} className="text-brand-gold font-black uppercase text-xs hover:underline cursor-pointer flex items-center gap-1.5">
          <span>←</span>
          <span>{t.back}</span>
        </button>
      </div>

      {loading ? (
        <h3 className="text-center text-gray-500 font-bold">{t.loading}</h3>
      ) : (
        <div className="space-y-10 animate-fade-in select-text">
          {/* Header Layout Card */}
          <div className="bg-brand-card p-6 rounded-3xl border-b-8 border-brand-maroon flex flex-col md:flex-row items-center gap-6 justify-around text-center md:text-left relative overflow-hidden shadow-md">
            <div>
              <img src={teamLogos[teamName]} className="w-28 h-28 rounded-full border-4 border-brand-dark object-cover mx-auto bg-white mb-4 shadow" alt="team" />
              <h1 className="text-3xl font-black text-brand-dark tracking-wider uppercase leading-none">{teamName}</h1>

              {/* T-GEN & T-GOL Badges */}
              <div className="flex gap-2 justify-center md:justify-start mt-3 flex-wrap">
                <span className="bg-brand-dark text-brand-gold text-[11px] font-black px-3 py-1 rounded-full border border-brand-gold shadow-sm">
                  ⚡ T-GEN Ort.: {squadAvgGen}
                </span>
                <span className="bg-brand-maroon text-white text-[11px] font-black px-3 py-1 rounded-full border border-brand-dark shadow-sm">
                  ⚽ T-GOL Toplam: {squadTotalGoals}
                </span>
              </div>

              {/* Form squares indicators */}
              <div className="flex gap-1.5 justify-center md:justify-start mt-4">
                {teamForm.map((result, idx) => {
                  let cls = 'bg-gray-400';
                  if (result === 'W') cls = 'bg-green-500';
                  else if (result === 'L') cls = 'bg-red-500';
                  return (
                    <div key={idx} className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white ${cls} border-b-2 border-black/15 shadow-sm uppercase`}>
                      {result}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Country and mascot meta boxes */}
            <div className="flex gap-4 items-center">
              <div className="bg-white/40 border border-brand-gold p-3 rounded-2xl w-36 text-center shadow-inner">
                <span className="text-[10px] font-black text-brand-maroon uppercase tracking-wider block mb-2">{t.country}</span>
                <img src={countryFlag || 'https://via.placeholder.com/80?text=?'} className="w-full h-16 object-cover rounded-lg border border-brand-dark" alt="flag" />
                <span className="font-extrabold text-xs text-brand-dark leading-tight block mt-2">{team?.ülke || '-'}</span>
              </div>

              <div className="bg-white/40 border border-brand-gold p-3 rounded-2xl w-36 text-center shadow-inner">
                <span className="text-[10px] font-black text-brand-maroon uppercase tracking-wider block mb-2">{t.animal}</span>
                <img src={mascotPhoto || 'https://via.placeholder.com/80?text=?'} className="w-full h-16 object-cover rounded-lg border border-brand-dark" alt="mascot" />
                <span className="font-extrabold text-xs text-brand-dark leading-tight block mt-2">{team?.hayvan || '-'}</span>
              </div>
            </div>
          </div>

          {/* Large Trophies Showcase between Profile/Header and Season/Popularity */}
          <TrophiesShowcase 
            kupalar={team?.kupalar} 
            isAdmin={!!currentUser?.admin} 
            onManageClick={() => setTrophyModalOpen(true)} 
            size="large"
            currentUser={currentUser}
            onNavigate={onNavigate}
          />

          {/* Social Popularity Voting Widget */}
          <div className="bg-white p-6 rounded-3xl flex justify-between items-center max-w-md mx-auto shadow-sm">
            <button onClick={() => handleCastVote('like')} className="w-12 h-12 rounded-full border border-gray-150 bg-gray-50 flex items-center justify-center text-sm shadow hover:scale-105 active:scale-95 cursor-pointer">👍</button>
            <div onClick={fetchVotersList} className="flex-1 text-center cursor-pointer hover:scale-102 select-none" title="Detaylar için Tıklayın">
              <h4 className="text-xs font-black text-brand-dark">Sevenler / Sevmeyenler</h4>
              <span className="text-[10px] font-bold text-gray-400 block mb-1">Bobblekolik Kulübü İçinde</span>
              <div className="flex items-center justify-center gap-3">
                <span className="text-xs font-extrabold text-green-500">% {likePct} 👍</span>
                <div className="w-14 h-14 rounded-full flex items-center justify-center relative shadow-sm" style={{ background: chartGradient }}>
                  <div className="absolute w-10 h-10 bg-white rounded-full" />
                </div>
                <span className="text-xs font-extrabold text-red-500">👎 % {dislikePct}</span>
              </div>
            </div>
            <button onClick={() => handleCastVote('dislike')} className="w-12 h-12 rounded-full border border-gray-150 bg-gray-50 flex items-center justify-center text-sm shadow hover:scale-105 active:scale-95 cursor-pointer">👎</button>
          </div>

          {/* Team Squad cards */}
          <div>
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <h2 className="text-lg font-black text-brand-dark uppercase tracking-wider relative flex items-center gap-2">
                <span className="w-6 h-1 bg-brand-maroon rounded-full shrink-0" />
                {t.squad}
              </h2>
              {currentUser?.admin && (
                <button
                  onClick={() => {
                    getDocs(collection(db, "players")).then(snap => {
                      const arr: { id: string; player: Player }[] = [];
                      snap.forEach(d => arr.push({ id: d.id, player: d.data() as Player }));
                      arr.sort((a,b) => a.player.pname.localeCompare(b.player.pname));
                      setAllPlayersList(arr);
                      if (arr.length > 0) setSelectedLoanPlayerId(arr[0].id);
                      setLoanModalOpen(true);
                    });
                  }}
                  className="bg-brand-gold text-brand-dark hover:bg-amber-400 font-extrabold text-xs uppercase px-3 py-1.5 rounded-xl border border-brand-maroon shadow-sm flex items-center gap-1.5 cursor-pointer transition-transform hover:scale-105"
                  title="Takıma kiralık oyuncu ekle veya yönet"
                >
                  <span>🔄</span>
                  <span>Kiralık Oyuncu Ekle/Yönet</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {squad.map((player) => {
                const isCaptain = player.baskan === true;
                const isLoaned = player.kiralik || (player.kiralikTakim && player.kiralikTakim.toLowerCase().trim() === teamName.toLowerCase().trim());
                return (
                  <div 
                    key={player.pname}
                    onClick={() => onNavigate({ type: 'player-profile', playerName: player.pname, playerId: (player as any).id || (player as any).docId })}
                    className="bg-brand-card p-4 rounded-2xl flex items-center shadow-sm cursor-pointer border border-transparent hover:border-brand-maroon hover:-translate-y-0.5 transition-all"
                  >
                    <img src={player.foto} className="w-14 h-14 rounded-xl object-cover shrink-0 border-2 border-brand-maroon bg-white" alt="avatar" />
                    <div className="ml-4 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <b className="font-extrabold text-sm md:text-base text-brand-dark uppercase tracking-wide block">{player.pname}</b>
                        {isLoaned && (
                          <span className="bg-amber-100 text-amber-800 border border-amber-300 font-extrabold text-[9px] px-2 py-0.5 rounded-md flex items-center gap-0.5">
                            🔄 KİRALIK
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] md:text-xs font-bold text-brand-maroon mt-1 block">
                        ⚽ {player.goals || 0} {t.goal}
                      </span>
                    </div>

                    <div className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider select-none shrink-0 ${isCaptain ? 'bg-brand-gold text-brand-dark border border-brand-dark' : 'bg-gray-200 text-gray-500'}`}>
                      {isCaptain ? t.captain : t.player}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>


          {/* Performance counts grid matrix (Süper Lig İstatistikleri) */}
          {(() => {
            const leaguePlayedMatches = playedMatches.filter(m => getMatchCompetitionType(m) === 'league' && m.ligm !== false);
            const rDocLower = normalizeTeamName(docId || '').toLowerCase().trim();
            const rNameLower = normalizeTeamName(team?.name || teamName).toLowerCase().trim();

            let leagueWins = 0;
            let leagueDraws = 0;
            let leagueLosses = 0;
            let leagueGf = 0;
            let leagueGa = 0;

            leaguePlayedMatches.forEach(m => {
              const mt1 = normalizeTeamName(m.team1 || '').toLowerCase().trim();
              const isT1 = mt1 === rDocLower || mt1 === rNameLower;
              const own = Number(isT1 ? m.score1 : m.score2) || 0;
              const opp = Number(isT1 ? m.score2 : m.score1) || 0;
              const isT1Bob = (m.team1 || '').toLowerCase().trim() === 'bobblica' || (m.team1 || '').toLowerCase().trim() === 'hiyar city';
              const isT2Bob = (m.team2 || '').toLowerCase().trim() === 'bobblica' || (m.team2 || '').toLowerCase().trim() === 'hiyar city';
              const isBobblicaLoss = (isT1Bob && opp > own) || (isT2Bob && own > opp);

              if (!isBobblicaLoss) {
                leagueGf += own;
                leagueGa += opp;
              }
              if (own > opp) leagueWins++;
              else if (own < opp) leagueLosses++;
              else leagueDraws++;
            });

            const statWins = leaguePlayedMatches.length > 0 ? leagueWins : (team?.wins || 0);
            const statDraws = leaguePlayedMatches.length > 0 ? leagueDraws : (team?.draws || 0);
            const statLosses = leaguePlayedMatches.length > 0 ? leagueLosses : (team?.losses || 0);
            const statGf = leaguePlayedMatches.length > 0 ? leagueGf : (team?.['atilan gol'] || 0);
            const statGa = leaguePlayedMatches.length > 0 ? leagueGa : (team?.['yenilen gol'] || 0);

            return (
              <div>
                <h2 className="text-lg font-black text-brand-dark mb-4 uppercase tracking-wider relative flex items-center gap-2">
                  <span className="w-6 h-1 bg-brand-maroon rounded-full shrink-0" />
                  {t.stats} (Süper Lig)
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 md:gap-4 select-text">
                  {[
                    { val: statWins, desc: t.w, cls: '' },
                    { val: statDraws, desc: t.d, cls: '' },
                    { val: statLosses, desc: t.l, cls: '' },
                    { val: statGf, desc: t.gf, cls: 'border-b-6 border-green-500' },
                    { val: statGa, desc: t.ga, cls: 'border-b-6 border-red-500' },
                    { val: squadAvgGen, desc: 'T-GEN ORT.', cls: 'border-b-6 border-brand-gold bg-brand-dark/5' },
                    { val: squadTotalGoals, desc: 'T-GOL TOPLAM', cls: 'border-b-6 border-brand-maroon bg-brand-maroon/5' }
                  ].map((perf, idx) => (
                    <div key={idx} className={`bg-brand-card rounded-2xl p-4 text-center hover:bg-white transition-colors shadow-sm select-text ${perf.cls}`}>
                      <span className="text-xl md:text-2xl font-black text-brand-maroon block leading-none">{perf.val}</span>
                      <span className="text-[9px] font-black text-gray-400 block tracking-wider uppercase mt-1.5">{perf.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Tournament & League Match Categorization Section */}
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b-2 border-brand-maroon/20 pb-3">
              <div>
                <h2 className="text-xl font-black text-brand-dark uppercase tracking-wider relative flex items-center gap-2">
                  <span className="w-6 h-1.5 bg-brand-maroon rounded-full shrink-0" />
                  <span>Maç Fikstürü & Sonuçları</span>
                </h2>
                <p className="text-xs font-bold text-gray-500 mt-0.5">
                  Lig, Şampiyonlar Ligi, Avrupa, Konferans ve Kupa maçlarını ayrı ayrı inceleyin.
                </p>
              </div>

              {/* Match status toggle (Hepsi / Oynanan / Gelecek) */}
              <div className="flex items-center gap-1 bg-brand-card p-1 rounded-xl border border-brand-gold/60 self-start md:self-auto">
                <button
                  type="button"
                  onClick={() => setMatchStatusFilter('all')}
                  className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    matchStatusFilter === 'all'
                      ? 'bg-brand-dark text-brand-gold shadow-sm'
                      : 'text-gray-600 hover:text-brand-dark'
                  }`}
                >
                  Tümü
                </button>
                <button
                  type="button"
                  onClick={() => setMatchStatusFilter('played')}
                  className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    matchStatusFilter === 'played'
                      ? 'bg-brand-dark text-brand-gold shadow-sm'
                      : 'text-gray-600 hover:text-brand-dark'
                  }`}
                >
                  Oynanan ({playedMatches.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMatchStatusFilter('upcoming')}
                  className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    matchStatusFilter === 'upcoming'
                      ? 'bg-brand-dark text-brand-gold shadow-sm'
                      : 'text-gray-600 hover:text-brand-dark'
                  }`}
                >
                  Gelecek ({upcomingMatches.length})
                </button>
              </div>
            </div>

            {/* Competition Tabs (Tümü, Süper Lig, UCL, UEL, UECL, Kupa) */}
            {(() => {
              const allM = [...playedMatches, ...upcomingMatches];
              const getComp = (m: Match) => getMatchCompetitionType(m);

              const compCounts: Record<CompetitionCategory | 'all', number> = {
                all: allM.length,
                league: allM.filter(m => getComp(m) === 'league').length,
                ucl: allM.filter(m => getComp(m) === 'ucl').length,
                uel: allM.filter(m => getComp(m) === 'uel').length,
                uecl: allM.filter(m => getComp(m) === 'uecl').length,
                wpc: allM.filter(m => getComp(m) === 'wpc').length,
              };

              return (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                  {COMPETITION_TABS.map((tab) => {
                    const count = compCounts[tab.id];
                    const isSelected = selectedCompetition === tab.id;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSelectedCompetition(tab.id)}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-black uppercase tracking-wider shrink-0 transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-brand-maroon text-white border-brand-dark shadow-md scale-102'
                            : 'bg-brand-card hover:bg-white text-brand-dark border-brand-gold/40 hover:border-brand-maroon/50 shadow-sm'
                        }`}
                      >
                        <span>{tab.icon}</span>
                        <span>{tab.shortLabel}</span>
                        <span
                          className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none ${
                            isSelected
                              ? 'bg-brand-gold text-brand-dark'
                              : 'bg-brand-dark/10 text-brand-dark'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* Selected Competition Mini Stats Summary */}
            {(() => {
              const rDocLower = normalizeTeamName(docId || '').toLowerCase().trim();
              const rNameLower = normalizeTeamName(team?.name || teamName).toLowerCase().trim();

              const getComp = (m: Match) => getMatchCompetitionType(m);
              const targetMatches = playedMatches.filter((m) => {
                if (selectedCompetition === 'all') return true;
                return getComp(m) === selectedCompetition;
              });

              if (targetMatches.length > 0) {
                let wins = 0;
                let draws = 0;
                let losses = 0;
                let gf = 0;
                let ga = 0;

                targetMatches.forEach((m) => {
                  const mt1 = normalizeTeamName(m.team1 || '').toLowerCase().trim();
                  const isT1 = mt1 === rDocLower || mt1 === rNameLower;
                  const own = Number(isT1 ? m.score1 : m.score2) || 0;
                  const opp = Number(isT1 ? m.score2 : m.score1) || 0;
                  gf += own;
                  ga += opp;
                  if (own > opp) wins++;
                  else if (own < opp) losses++;
                  else draws++;
                });

                const activeTabInfo = COMPETITION_TABS.find(t => t.id === selectedCompetition);

                return (
                  <div className="bg-white/90 border border-brand-gold/60 p-3.5 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{activeTabInfo?.icon}</span>
                      <div>
                        <span className="font-black text-brand-dark uppercase block">
                          {activeTabInfo?.label} Performansı
                        </span>
                        <span className="text-[10px] font-bold text-gray-500">
                          {targetMatches.length} Oynanan Maç
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 font-extrabold text-xs">
                      <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-lg border border-green-200">
                        {wins} Galibiyet
                      </span>
                      <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                        {draws} Beraberlik
                      </span>
                      <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded-lg border border-red-200">
                        {losses} Mağlubiyet
                      </span>
                      <span className="text-brand-dark bg-brand-card px-2 py-0.5 rounded-lg border border-brand-gold/40">
                        ⚽ {gf} - {ga} (Av: {gf - ga > 0 ? `+${gf - ga}` : gf - ga})
                      </span>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Filtered Matches Content */}
            {(() => {
              const getComp = (m: Match) => getMatchCompetitionType(m);

              const currentFilteredPlayed = playedMatches.filter((m) => {
                if (selectedCompetition === 'all') return true;
                return getComp(m) === selectedCompetition;
              });

              const currentFilteredUpcoming = upcomingMatches.filter((m) => {
                if (selectedCompetition === 'all') return true;
                return getComp(m) === selectedCompetition;
              });

              const showPlayed = matchStatusFilter === 'all' || matchStatusFilter === 'played';
              const showUpcoming = matchStatusFilter === 'all' || matchStatusFilter === 'upcoming';

              const activeTabObj = COMPETITION_TABS.find(t => t.id === selectedCompetition);

              // Helper for match card
              const renderMatchCard = (m: Match, isPlayed: boolean, idx: number) => {
                const comp = getComp(m);
                const tabMeta = COMPETITION_TABS.find(t => t.id === comp) || COMPETITION_TABS[1];

                const rDocLower = normalizeTeamName(docId || '').toLowerCase().trim();
                const rNameLower = normalizeTeamName(team?.name || teamName).toLowerCase().trim();
                const mt1 = normalizeTeamName(m.team1 || '').toLowerCase().trim();
                const isT1 = mt1 === rDocLower || mt1 === rNameLower;

                const ownTeamName = isT1 ? m.team1 : m.team2;
                const oppTeamName = isT1 ? m.team2 : m.team1;

                const ownScore = Number(isT1 ? m.score1 : m.score2) || 0;
                const oppScore = Number(isT1 ? m.score2 : m.score1) || 0;

                let resultStatus: 'win' | 'loss' | 'draw' = 'draw';
                if (ownScore > oppScore) resultStatus = 'win';
                else if (ownScore < oppScore) resultStatus = 'loss';

                const roundOrHafta = String(m.hafta || (m as any).round || (m as any).kgrup || '').trim();

                const matchKey = m.id || `${m.team1}-vs-${m.team2}-${m.datejav}`;

                return (
                  <div
                    key={`${matchKey}-${idx}`}
                    onClick={() => onNavigate({ type: 'match-detail', matchId: matchKey })}
                    className={`bg-brand-card p-4 rounded-2xl border-l-8 ${tabMeta.accentCol} shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all text-center select-text relative overflow-hidden`}
                  >
                    {/* Header bar: Competition Badge + Hafta / Round + Date */}
                    <div className="flex justify-between items-center gap-2 mb-3 pb-2 border-b border-black/5 text-[10px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-md font-black uppercase text-[10px] flex items-center gap-1 ${tabMeta.badgeBg} border ${tabMeta.borderCol}`}>
                          <span>{tabMeta.icon}</span>
                          <span>{tabMeta.shortLabel}</span>
                        </span>
                        {roundOrHafta && (
                          <span className="bg-white/80 text-brand-dark px-2 py-0.5 rounded-md font-extrabold border border-gray-200">
                            {roundOrHafta}
                          </span>
                        )}
                        {(m as any).season && (
                          <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md font-bold">
                            {(m as any).season}. Sezon
                          </span>
                        )}
                      </div>
                      <span className="font-extrabold text-gray-500 shrink-0">
                        📅 {m.date || t.wait}
                      </span>
                    </div>

                    {/* Body: Teams & Score / VS */}
                    <div className="flex justify-between items-center gap-2 sm:gap-4">
                      {/* Current Team */}
                      <div className="flex flex-col items-center flex-1 min-w-0">
                        <img
                          src={teamLogos[ownTeamName] || 'https://via.placeholder.com/40?text=?'}
                          className="w-11 h-11 rounded-full border-2 border-brand-maroon bg-white object-cover shadow-sm shrink-0"
                          alt="team"
                        />
                        <span className="text-xs font-black mt-1 text-brand-maroon block truncate w-full text-center">
                          {ownTeamName}
                        </span>
                      </div>

                      {/* Middle: Score or VS Badge */}
                      <div className="flex flex-col items-center shrink-0 px-2">
                        {isPlayed ? (
                          <>
                            <span className="py-1.5 px-4 bg-brand-dark text-brand-gold font-black text-base rounded-xl border border-brand-gold shadow-inner leading-none">
                              {ownScore} - {oppScore}
                            </span>
                            <div className="mt-1.5">
                              {resultStatus === 'win' && (
                                <span className="bg-green-100 text-green-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-green-300">
                                  ✓ Galibiyet
                                </span>
                              )}
                              {resultStatus === 'loss' && (
                                <span className="bg-red-100 text-red-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-red-300">
                                  ✕ Mağlubiyet
                                </span>
                              )}
                              {resultStatus === 'draw' && (
                                <span className="bg-gray-100 text-gray-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-gray-300">
                                  – Beraberlik
                                </span>
                              )}
                            </div>
                            {(m as any).penaltyWinner && (
                              <span className="text-[9px] font-bold text-amber-600 mt-0.5">
                                (Penaltılarla)
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="py-1 px-4 bg-brand-dark text-brand-gold font-black text-xs rounded-xl border border-brand-gold shadow-sm">
                              VS
                            </span>
                            <span className="text-[9px] font-extrabold text-blue-600 mt-1 uppercase tracking-wider">
                              ⏳ Planlandı
                            </span>
                          </>
                        )}
                      </div>

                      {/* Opponent Team */}
                      <div className="flex flex-col items-center flex-1 min-w-0">
                        <img
                          src={teamLogos[oppTeamName] || 'https://via.placeholder.com/40?text=?'}
                          className="w-11 h-11 rounded-full border border-gray-300 bg-white object-cover shadow-sm shrink-0"
                          alt="opponent"
                        />
                        <span className="text-xs font-extrabold mt-1 text-brand-dark block truncate w-full text-center">
                          {oppTeamName}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              };

              const hasNoMatchesAtAll = currentFilteredPlayed.length === 0 && currentFilteredUpcoming.length === 0;

              if (hasNoMatchesAtAll) {
                return (
                  <div className="bg-brand-card p-8 rounded-3xl border border-brand-gold/40 text-center space-y-3">
                    <span className="text-3xl block">{activeTabObj?.icon || '📋'}</span>
                    <h3 className="text-base font-black text-brand-dark">
                      {activeTabObj?.label} Kategorisinde Maç Bulunamadı
                    </h3>
                    <p className="text-xs text-gray-500 font-semibold max-w-md mx-auto">
                      Bu takımın {activeTabObj?.label} kategorisinde henüz tamamlanmış veya planlanmış maçı bulunmamaktadır.
                    </p>
                    {selectedCompetition !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setSelectedCompetition('all')}
                        className="bg-brand-maroon text-white text-xs font-black px-4 py-2 rounded-xl uppercase tracking-wider hover:bg-red-900 transition-colors cursor-pointer"
                      >
                        Tüm Maçları Göster
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div className="space-y-8">
                  {/* Played Fixtures Section */}
                  {showPlayed && (
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider flex items-center gap-2">
                          <span className="w-2.5 h-2.5 bg-green-500 rounded-full inline-block" />
                          <span>{t.last} ({currentFilteredPlayed.length})</span>
                        </h3>
                        {selectedCompetition !== 'all' && (
                          <span className="text-[11px] font-bold text-gray-500">
                            Filtre: {activeTabObj?.shortLabel}
                          </span>
                        )}
                      </div>

                      {currentFilteredPlayed.length === 0 ? (
                        <div className="text-gray-400 font-bold p-4 bg-brand-card rounded-2xl text-center text-xs">
                          Bu kategoride oynanmış maç bulunmamaktadır.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {currentFilteredPlayed.map((m, idx) => renderMatchCard(m, true, idx))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Upcoming Fixtures Section */}
                  {showUpcoming && (
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider flex items-center gap-2">
                          <span className="w-2.5 h-2.5 bg-blue-500 rounded-full inline-block" />
                          <span>{t.next} ({currentFilteredUpcoming.length})</span>
                        </h3>
                        {selectedCompetition !== 'all' && (
                          <span className="text-[11px] font-bold text-gray-500">
                            Filtre: {activeTabObj?.shortLabel}
                          </span>
                        )}
                      </div>

                      {currentFilteredUpcoming.length === 0 ? (
                        <div className="text-gray-400 font-bold p-4 bg-brand-card rounded-2xl text-center text-xs">
                          Bu kategoride planlanan gelecek maç bulunmamaktadır.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {currentFilteredUpcoming.map((m, idx) => renderMatchCard(m, false, idx))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {team?.insta && (
            <div className="text-center pt-6 leading-none">
              <a href={team.insta} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-3 text-white bg-gradient-to-r from-orange-400 via-pink-500 to-indigo-600 rounded-full py-4 px-10 font-black text-xs md:text-sm shadow-md tracking-wider uppercase">
                <img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Instagram_icon.png" width="22" height="22" alt="insta" />
                {teamName} Instagram Linki
              </a>
            </div>
          )}
        </div>
      )}

      {/* VOTERS POPUP MODAL */}
      {votersModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#f2ede1] text-[#3d3d3d] w-full max-w-md rounded-2xl p-6 border-b-6 border-brand-maroon overflow-y-auto max-h-[80vh] relative select-text">
            <button onClick={() => setVotersModalOpen(false)} className="absolute top-4 right-4 text-xl font-bold text-brand-maroon">✕</button>
            <h3 className="text-center font-black text-base border-b border-gray-300 pb-2 mb-4 uppercase">Oy Verenlerin Detayları</h3>

            {loadingVoters ? (
              <p className="text-center text-xs text-gray-500 font-bold p-6">Sorgular çözülüyor, lütfen bekleyin...</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
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
        kupalar={team?.kupalar}
        targetName={teamName}
        onSave={async (updated) => {
          if (!docId) return;
          await updateDoc(doc(db, 'teams', docId), { kupalar: updated });
        }}
      />

      {/* KİRALIK OYUNCU YÖNETİM MODALI */}
      {loanModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 select-text">
          <div className="bg-[#f2ede1] text-[#3d3d3d] w-full max-w-md rounded-2xl p-6 border-b-6 border-brand-maroon shadow-2xl relative select-text max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setLoanModalOpen(false)} 
              className="absolute top-4 right-4 text-xl font-bold text-brand-maroon hover:scale-110 transition-transform cursor-pointer"
            >
              ✕
            </button>

            <h3 className="text-center font-black text-base md:text-lg text-brand-maroon border-b border-gray-300 pb-2 mb-4 uppercase flex items-center justify-center gap-2">
              <span>🔄</span>
              <span>Kiralık Oyuncu Ekle/Yönet ({teamName})</span>
            </h3>

            {/* Existing Loaned Players list */}
            <div className="mb-6 bg-white/70 p-3.5 rounded-xl border border-amber-300">
              <h4 className="font-extrabold text-xs text-amber-900 uppercase mb-2 flex items-center gap-1">
                <span>📋</span> Bu Takımda Kiralık Oynayanlar:
              </h4>
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {squad.filter(p => p.kiralik || (p.kiralikTakim && p.kiralikTakim.toLowerCase().trim() === teamName.toLowerCase().trim())).length === 0 ? (
                  <p className="text-xs text-gray-500 font-semibold italic text-center py-1">Şu anda kiralık oyuncu bulunmuyor.</p>
                ) : (
                  squad.filter(p => p.kiralik || (p.kiralikTakim && p.kiralikTakim.toLowerCase().trim() === teamName.toLowerCase().trim())).map(p => (
                    <div key={p.pname} className="flex justify-between items-center bg-white p-2 rounded-lg border border-amber-200 text-xs font-bold shadow-sm">
                      <div className="flex items-center gap-2">
                        <img src={p.foto} className="w-7 h-7 rounded-md object-cover border border-amber-400" alt="foto" />
                        <span>{p.pname} (Asıl: {p.pteam})</span>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const q = query(collection(db, "players"), where("pname", "==", p.pname));
                            const pSnap = await getDocs(q);
                            if (!pSnap.empty) {
                              await updateDoc(doc(db, "players", pSnap.docs[0].id), {
                                kiralik: false,
                                kiralikTakim: ''
                              });
                              alert(`${p.pname} için kiralık durumu kaldırıldı.`);
                              setLoanModalOpen(false);
                            }
                          } catch (e) {
                            console.error(e);
                            alert('Kiralık kaldırma işlemi sırasında hata oluştu.');
                          }
                        }}
                        className="bg-red-600 hover:bg-red-700 text-white font-black text-[10px] uppercase px-2 py-1 rounded cursor-pointer"
                      >
                        Kaldır
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Add new Loan player selector */}
            <div className="space-y-4 bg-white/90 p-4 rounded-xl border border-gray-200 shadow-sm">
              <h4 className="font-extrabold text-xs text-brand-dark uppercase">➕ Yeni Kiralık Oyuncu Ekle</h4>
              
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">Mevcut Oyunculardan Seç</label>
                <select
                  value={selectedLoanPlayerId}
                  onChange={(e) => setSelectedLoanPlayerId(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg p-2 font-bold text-xs"
                >
                  <option value="">-- Listeden Seçin --</option>
                  {allPlayersList.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.player.pname} ({item.player.pteam || 'Takımsız'}) {item.player.kiralik ? '🔄 [Zaten Kiralık]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">Veya Yeni Oyuncu Adı Girin</label>
                <input
                  type="text"
                  placeholder="Örn: Kylian Mbappé"
                  value={customLoanPlayerName}
                  onChange={(e) => setCustomLoanPlayerName(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg p-2 font-bold text-xs"
                />
              </div>

              <button
                onClick={async () => {
                  let targetPlayerName = '';

                  if (customLoanPlayerName.trim()) {
                    targetPlayerName = customLoanPlayerName.trim();
                  } else if (selectedLoanPlayerId) {
                    const found = allPlayersList.find(x => x.id === selectedLoanPlayerId);
                    if (found) targetPlayerName = found.player.pname;
                  }

                  if (!targetPlayerName) {
                    alert('Lütfen bir oyuncu seçin veya adını yazın!');
                    return;
                  }

                  try {
                    // Check if player exists by ID or name
                    let targetDocId = selectedLoanPlayerId && !customLoanPlayerName.trim() ? selectedLoanPlayerId : '';

                    if (!targetDocId) {
                      const qP = query(collection(db, "players"), where("pname", "==", targetPlayerName));
                      const pSnap = await getDocs(qP);
                      if (!pSnap.empty) {
                        targetDocId = pSnap.docs[0].id;
                      }
                    }

                    if (targetDocId) {
                      await updateDoc(doc(db, "players", targetDocId), {
                        kiralik: true,
                        kiralikTakim: teamName
                      });
                    } else {
                      // Create new player doc
                      const newRef = doc(collection(db, "players"));
                      await setDoc(newRef, {
                        pname: targetPlayerName,
                        pteam: teamName,
                        foto: 'https://via.placeholder.com/150?text=Kiral%C4%B1k',
                        goals: 0,
                        asistsay: 0,
                        gen: 75,
                        kiralik: true,
                        kiralikTakim: teamName
                      });
                    }

                    alert(`${targetPlayerName} oyuncusu ${teamName} takımına kiralık olarak eklendi!`);
                    setCustomLoanPlayerName('');
                    setSelectedLoanPlayerId('');
                    setLoanModalOpen(false);
                  } catch (e) {
                    console.error(e);
                    alert('Kiralık oyuncu eklenirken hata oluştu: ' + (e instanceof Error ? e.message : String(e)));
                  }
                }}
                className="w-full py-2.5 bg-brand-maroon hover:bg-red-900 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-md cursor-pointer"
              >
                🔄 Kiralık Olarak Ekle
              </button>
            </div>

            <div className="mt-4 text-right">
              <button
                onClick={() => setLoanModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 bg-gray-200 hover:bg-gray-300 cursor-pointer uppercase"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
