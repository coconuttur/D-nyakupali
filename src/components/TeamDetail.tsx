import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, doc, getDoc, getDocs, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { Team, Player, Match, UserProfile } from '../types';

interface TeamDetailProps {
  teamName: string;
  currentUser: UserProfile | null;
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onBack: () => void;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
}

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

  // Voting states
  const [votersModalOpen, setVotersModalOpen] = useState(false);
  const [likesUsers, setLikesUsers] = useState<any[]>([]);
  const [dislikesUsers, setDislikesUsers] = useState<any[]>([]);
  const [loadingVoters, setLoadingVoters] = useState(false);

  useEffect(() => {
    // 1. Fetch team metadata in real time
    const q = query(collection(db, "teams"), where("name", "==", teamName));
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const dObj = snap.docs[0];
        setDocId(dObj.id);
        const data = dObj.data() as Team;
        setTeam(data);

        // Fetch country flag
        if (data.ülke) {
          const qC = query(collection(db, "ülkeler"), where("ülkead", "==", data.ülke));
          getDocs(qC).then(uSnap => {
            if (!uSnap.empty) setCountryFlag(uSnap.docs[0].data().ülkefoto || '');
          });
        }

        // Fetch mascot photo
        if (data.hayvan) {
          const qH = query(collection(db, "hayvanlar"), where("hayvanad", "==", data.hayvan));
          getDocs(qH).then(hSnap => {
            if (!hSnap.empty) setMascotPhoto(hSnap.docs[0].data().hayvanfoto || '');
          });
        }
      }
    });

    // 2. Fetch Squad
    const qS = query(collection(db, "players"), where("pteam", "==", teamName));
    const unsubSquad = onSnapshot(qS, (snap) => {
      const list: Player[] = [];
      snap.forEach((d) => {
        list.push(d.data() as Player);
      });
      list.sort((a,b) => b.goals - a.goals);
      setSquad(list);
    });

    // 3. Fetch Matches
    const unsubMatches = onSnapshot(collection(db, "matches"), (snap) => {
      const played: Match[] = [];
      const upcoming: Match[] = [];

      snap.forEach((d) => {
        const m = d.data() as Match;
        if (m.team1 === teamName || m.team2 === teamName) {
          if (m.played) played.push(m);
          else upcoming.push(m);
        }
      });

      // Sort lists
      played.sort((a,b) => b.datejav - a.datejav); // last played first
      upcoming.sort((a,b) => a.datejav - b.datejav); // soonest play first

      setPlayedMatches(played);
      setUpcomingMatches(upcoming);

      // Compute last 5 form indicators
      const last5 = played.slice(0, 5);
      const reversed = [...last5].reverse();
      const sqs: string[] = reversed.map((match) => {
        const isT1 = match.team1 === teamName;
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

    return () => {
      unsubscribe();
      unsubSquad();
      unsubMatches();
    };
  }, [teamName]);

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

  return (
    <div className="space-y-8">
      {/* Dynamic Sub nav bar */}
      <div className="flex justify-between items-center py-2 px-4 bg-brand-dark rounded-xl border border-brand-gold select-none z-10 shadow-sm">
        <button onClick={onBack} className="text-brand-gold font-black uppercase text-xs hover:underline cursor-pointer">
          {t.home}
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
            <h2 className="text-lg font-black text-brand-dark mb-4 uppercase tracking-wider relative flex items-center gap-2">
              <span className="w-6 h-1 bg-brand-maroon rounded-full shrink-0" />
              {t.squad}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {squad.map((player) => {
                const isCaptain = player.baskan === true;
                return (
                  <div 
                    key={player.pname}
                    onClick={() => onNavigate({ type: 'player-profile', playerName: player.pname })}
                    className="bg-brand-card p-4 rounded-2xl flex items-center shadow-sm cursor-pointer border border-transparent hover:border-brand-maroon hover:-translate-y-0.5 transition-all"
                  >
                    <img src={player.foto} className="w-14 h-14 rounded-xl object-cover shrink-0 border-2 border-brand-maroon bg-white" alt="avatar" />
                    <div className="ml-4 flex-1">
                      <b className="font-extrabold text-sm md:text-base text-brand-dark uppercase tracking-wide block">{player.pname}</b>
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

          {/* Performance counts grid matrix */}
          <div>
            <h2 className="text-lg font-black text-brand-dark mb-4 uppercase tracking-wider relative flex items-center gap-2">
              <span className="w-6 h-1 bg-brand-maroon rounded-full shrink-0" />
              {t.stats}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 md:gap-4 select-text">
              {[
                { val: team?.wins || 0, desc: t.w, cls: '' },
                { val: team?.draws || 0, desc: t.d, cls: '' },
                { val: team?.losses || 0, desc: t.l, cls: '' },
                { val: team?.['atilan gol'] || 0, desc: t.gf, cls: 'border-b-6 border-green-500' },
                { val: team?.['yenilen gol'] || 0, desc: t.ga, cls: 'border-b-6 border-red-500' }
              ].map((perf, idx) => (
                <div key={idx} className={`bg-brand-card rounded-2xl p-4 text-center hover:bg-white transition-colors shadow-sm select-text ${perf.cls}`}>
                  <span className="text-xl md:text-2xl font-black text-brand-maroon block leading-none">{perf.val}</span>
                  <span className="text-[9px] font-black text-gray-400 block tracking-wider uppercase mt-1.5">{perf.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Played fixtures */}
          <div>
            <h2 className="text-lg font-black text-brand-dark mb-4 uppercase tracking-wider relative flex items-center gap-2">
              <span className="w-6 h-1 bg-brand-maroon rounded-full shrink-0" />
              {t.last}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {playedMatches.length === 0 ? (
                <span className="text-gray-400 font-bold block p-4 bg-brand-card rounded-2xl">Geçmiş maç bulunmamaktadır.</span>
              ) : (
                playedMatches.map((m, idx) => {
                  const opp = m.team1 === teamName ? m.team2 : m.team1;
                  const isT1 = m.team1 === teamName;
                  const scoreDisplay = isT1 ? `${m.score1} - ${m.score2}` : `${m.score2} - ${m.score1}`;
                  return (
                    <div 
                      key={idx}
                      onClick={() => onNavigate({ type: 'match-detail', matchId: `${m.team1}-vs-${m.team2}-${m.datejav}` })}
                      className="bg-brand-card p-5 rounded-2xl border-l-8 border-brand-maroon shadow-sm cursor-pointer hover:scale-101 hover:-translate-y-0.5 transition-all text-center select-text"
                    >
                      <span className="text-[10px] font-black text-brand-maroon uppercase tracking-wider block mb-2">📅 {m.date || t.wait}</span>
                      <div className="flex justify-around items-center gap-3">
                        <div className="flex flex-col items-center">
                          <img src={teamLogos[teamName]} className="w-10 h-10 rounded-full border bg-white object-cover shadow-sm shrink-0" alt="team" />
                          <span className="text-xs font-extrabold mt-1 text-brand-dark block truncate w-20 text-center">{teamName}</span>
                        </div>
                        <span className="py-1 px-4 bg-brand-dark text-brand-gold font-black text-base rounded-xl border border-brand-gold shadow-inner shrink-0">{scoreDisplay}</span>
                        <div className="flex flex-col items-center">
                          <img src={teamLogos[opp]} className="w-10 h-10 rounded-full border bg-white object-cover shadow-sm shrink-0" alt="opponent" />
                          <span className="text-xs font-extrabold mt-1 text-brand-dark block truncate w-20 text-center">{opp}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Upcoming fixtures */}
          <div>
            <h2 className="text-lg font-black text-brand-dark mb-4 uppercase tracking-wider relative flex items-center gap-2">
              <span className="w-6 h-1 bg-brand-maroon rounded-full shrink-0" />
              {t.next}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {upcomingMatches.length === 0 ? (
                <span className="text-gray-400 font-bold block p-4 bg-brand-card rounded-2xl">Planlanan gelecek lig maçı bulunmamaktadır.</span>
              ) : (
                upcomingMatches.map((m, idx) => {
                  const opp = m.team1 === teamName ? m.team2 : m.team1;
                  return (
                    <div 
                      key={idx}
                      onClick={() => onNavigate({ type: 'match-detail', matchId: `${m.team1}-vs-${m.team2}-${m.datejav}` })}
                      className="bg-brand-card p-5 rounded-2xl border-l-8 border-brand-maroon shadow-sm cursor-pointer hover:scale-101 hover:-translate-y-0.5 transition-all text-center select-text"
                    >
                      <span className="text-[10px] font-black text-brand-maroon uppercase tracking-wider block mb-2">📅 {m.date || t.wait}</span>
                      <div className="flex justify-around items-center gap-3">
                        <div className="flex flex-col items-center">
                          <img src={teamLogos[teamName]} className="w-10 h-10 rounded-full border bg-white object-cover shadow-sm shrink-0" alt="team" />
                          <span className="text-xs font-extrabold mt-1 text-brand-dark block truncate w-20 text-center">{teamName}</span>
                        </div>
                        <span className="py-1 px-4 bg-brand-dark text-brand-gold font-black text-xs rounded-xl border border-brand-gold shrink-0">VS</span>
                        <div className="flex flex-col items-center">
                          <img src={teamLogos[opp]} className="w-10 h-10 rounded-full border bg-white object-cover shadow-sm shrink-0" alt="opponent" />
                          <span className="text-xs font-extrabold mt-1 text-brand-dark block truncate w-20 text-center">{opp}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
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
    </div>
  );
}
