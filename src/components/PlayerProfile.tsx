import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, doc, getDoc, getDocs, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { Player, UserProfile } from '../types';

interface PlayerProfileProps {
  playerName: string;
  currentUser: UserProfile | null;
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onBack: () => void;
  onNavigate: (view: any) => void;
}

export default function PlayerProfile({ playerName, currentUser, currentLang, translations, onBack, onNavigate }: PlayerProfileProps) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [teamLogo, setTeamLogo] = useState<string>('');
  const [countryLogo, setCountryLogo] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Voting states
  const [votersModalOpen, setVotersModalOpen] = useState(false);
  const [likesUsers, setLikesUsers] = useState<any[]>([]);
  const [dislikesUsers, setDislikesUsers] = useState<any[]>([]);
  const [loadingVoters, setLoadingVoters] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "players"), where("pname", "==", playerName));
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const dObj = snap.docs[0];
        setDocId(dObj.id);
        const data = dObj.data() as Player;
        setPlayer(data);

        // Fetch team logo
        if (data.pteam) {
          const qLogo = query(collection(db, "teams"), where("name", "==", data.pteam));
          getDocs(qLogo).then(tSnap => {
            if (!tSnap.empty) setTeamLogo(tSnap.docs[0].data().logo || '');
          });
        }

        // Fetch country flag
        if (data.pülke) {
          const qCountry = query(collection(db, "ülkeler"), where("ülkead", "==", data.pülke));
          getDocs(qCountry).then(uSnap => {
            if (!uSnap.empty) setCountryLogo(uSnap.docs[0].data().ülkefoto || '');
          });
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [playerName]);

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

  const matchesCount = player?.poyn || 0;
  const playerGoals = player?.goals || 0;
  const ratioVal = matchesCount > 0 ? (playerGoals / matchesCount).toFixed(2) : '0.00';

  return (
    <div className="space-y-6">
      <div className="bg-brand-card p-4 rounded-b-2xl flex items-center justify-between border-b-4 border-brand-maroon shadow-md relative shrink-0">
        <button 
          onClick={onBack}
          className="bg-brand-gold text-brand-dark hover:scale-105 transition-transform font-black text-xs uppercase px-4 py-2 rounded-xl h-10 cursor-pointer border border-brand-maroon shadow-sm"
        >
          {t.back}
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
                <div 
                  onClick={() => onNavigate({ type: 'team-detail', teamName: player.pteam })}
                  className="flex items-center gap-3 bg-white py-1.5 px-4 rounded-full border border-gray-150 shadow-sm shrink-0 cursor-pointer hover:scale-103 transition-transform"
                >
                  {teamLogo && <img src={teamLogo} className="w-8 h-8 rounded-full bg-white object-cover" alt="team" />}
                  <span className="text-xs font-black text-brand-dark uppercase tracking-wider">{player.pteam}</span>
                </div>

                <div className="flex items-center gap-3 bg-white py-1.5 px-4 rounded-full border border-gray-150 shadow-sm shrink-0">
                  {countryLogo && <img src={countryLogo} className="w-8 h-5 object-cover rounded border" alt="flag" />}
                  <span className="text-xs font-black text-brand-dark uppercase tracking-wider">{player.pülke || '-'}</span>
                </div>
              </div>
            </div>
          </div>

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

          {/* Stats matrix grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 md:gap-4 select-text">
            {[
              { val: matchesCount, desc: t.mac },
              { val: playerGoals, desc: t.gol },
              { val: player.asistsay || 0, desc: t.asist },
              { val: ratioVal, desc: t.go },
              { val: player.ratingoy || '0.0', desc: t.rat }
            ].map((stat, idx) => (
              <div key={idx} className="bg-brand-card rounded-2xl p-4 text-center border-b-4 border-gray-200 hover:border-b-brand-maroon focus:border-b-brand-maroon transition-colors shadow-sm">
                <span className="text-xl md:text-2xl font-black text-brand-maroon block leading-none">{stat.val}</span>
                <span className="text-[9px] font-black text-gray-400 block tracking-wider uppercase mt-1.5">{stat.desc}</span>
              </div>
            ))}
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
    </div>
  );
}
