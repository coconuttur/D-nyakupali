import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, getDocs, doc, getDoc, updateDoc, writeBatch, increment, arrayUnion, arrayRemove, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Match, Bet, UserProfile } from '../types';

interface IddiaProps {
  currentUser: UserProfile | null;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
}

type IddiaTabType = 'merkez' | 'sonuclar' | 'eniyiler' | 'oynadiklarim';
type SortSelector = 'hafta' | 'populer' | 'az';

export default function Iddia({ currentUser, onNavigate, teamLogos }: IddiaProps) {
  const [activeTab, setActiveCup] = useState<IddiaTabType>('merkez');
  const [sortMethod, setSortMethod] = useState<SortSelector>('hafta');

  // Match cache
  const [activeMatches, setActiveMatches] = useState<Match[]>([]);
  const [playedMatches, setPlayedMatches] = useState<Match[]>([]);
  const [betPools, setBetPools] = useState<Record<string, any>>({});
  const [usersLeaderboard, setUsersLeaderboard] = useState<UserProfile[]>([]);
  const [myBets, setMyBets] = useState<any[]>([]);

  // Bet modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState<any>(null);
  const [betAmountText, setBetAmountText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const BASE_POOL = 100;

  const getMatchId = (m: Match) => {
    return `${m.team1}-vs-${m.team2}-${m.datejav}`.replace(/\s+/g, '-');
  };

  // 1. Listen Matches
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "matches"), (snap) => {
      const active: Match[] = [];
      const played: Match[] = [];
      snap.forEach(d => {
        const m = { id: d.id, ...d.data() } as Match;
        if (m.played) played.push(m);
        else active.push(m);
      });
      // Sort played descending
      played.sort((a,b) => (Number(b.hafta)||0) - (Number(a.hafta)||0));
      setActiveMatches(active);
      setPlayedMatches(played);
    });
    return () => unsubscribe();
  }, []);

  // 2. Listen all Bets
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'bets'), (snap) => {
      const pools: Record<string, any> = {};
      snap.forEach(docSnap => {
        const b = docSnap.data() as Bet;
        const bId = docSnap.id;
        const mId = b.matchId;
        if (!pools[mId]) {
          pools[mId] = {
            '1': 0, 'X': 0, '2': 0,
            total: 0,
            bettors: { '1': [], 'X': [], '2': [] }
          };
        }
        pools[mId][b.choice] += b.amount;
        pools[mId].total += b.amount;

        const existing = pools[mId].bettors[b.choice].find((x: any) => x.uid === b.uid);
        if (existing) {
          existing.amount += b.amount;
        } else {
          pools[mId].bettors[b.choice].push({
            uid: b.uid,
            ad: b.ad,
            avatar: b.avatar,
            amount: b.amount
          });
        }
      });
      setBetPools(pools);
    });
    return () => unsubscribe();
  }, []);

  // 3. Automated outcome resolution logic inside React (ONLY for the currently logged-in user to prevent bulk leaks)
  useEffect(() => {
    if (!currentUser || playedMatches.length === 0 || Object.keys(betPools).length === 0) return;

    const resolveBets = async () => {
      // Find user pending bets
      try {
        const q = query(
          collection(db, "bets"),
          where("uid", "==", currentUser.uid),
          where("status", "==", "pending")
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) return;

        const batch = writeBatch(db);
        let totalRefund = 0;
        let revised = false;

        snapshot.forEach((docRef) => {
          const b = { id: docRef.id, ...docRef.data() } as Bet;
          const match = playedMatches.find(m => getMatchId(m) === b.matchId);
          if (match) {
            const score1 = parseInt(match.score1) || 0;
            const score2 = parseInt(match.score2) || 0;
            const actualResult = score1 > score2 ? '1' : score1 < score2 ? '2' : 'X';

            const pool = betPools[b.matchId];
            if (pool) {
              const p1 = pool['1'] + BASE_POOL;
              const pX = pool['X'] + BASE_POOL;
              const p2 = pool['2'] + BASE_POOL;
              const totalPool = p1 + pX + p2;
              const choicePool = b.choice === '1' ? p1 : b.choice === 'X' ? pX : p2;
              const finalOdd = totalPool / choicePool;

              const betRef = doc(db, "bets", b.id);
              if (b.choice === actualResult) {
                const payout = Math.round(b.amount * finalOdd);
                totalRefund += payout;
                batch.update(betRef, { status: 'won', winAmount: payout, finalOdd });
              } else {
                batch.update(betRef, { status: 'lost', winAmount: 0, finalOdd });
              }
              revised = true;
            }
          }
        });

        if (revised) {
          if (totalRefund > 0) {
            const userRef = doc(db, "users", currentUser.uid);
            batch.update(userRef, { balance: increment(totalRefund) });
          }
          await batch.commit();
          if (totalRefund > 0) {
            setTimeout(() => {
              alert(`Tebrikler! Sonuçlanan iddialarınızdan toplam ${totalRefund.toLocaleString()} ฿ kazandınız!`);
            }, 500);
          }
        }
      } catch (e) {
        console.error("Bet resolving error:", e);
      }
    };

    resolveBets();
  }, [currentUser, playedMatches, betPools]);

  // Loading Leaderboard
  useEffect(() => {
    if (activeTab === 'eniyiler') {
      const q = query(collection(db, 'users'), orderBy('balance', 'desc'), limit(50));
      const unsubscribe = onSnapshot(q, (snap) => {
        const list: UserProfile[] = [];
        snap.forEach(d => {
          list.push({ uid: d.id, ...d.data() } as UserProfile);
        });
        setUsersLeaderboard(list);
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  // Loading My Bets
  useEffect(() => {
    if (activeTab === 'oynadiklarim' && currentUser) {
      const q = query(collection(db, 'bets'), where('uid', '==', currentUser.uid));
      const unsubscribe = onSnapshot(q, (snap) => {
        const list: any[] = [];
        snap.forEach(d => {
          list.push({ id: d.id, ...d.data() });
        });
        setMyBets(list);
      });
      return () => unsubscribe();
    }
  }, [activeTab, currentUser]);

  // Get Sorted Active Matches list
  const getSortedMatches = () => {
    const list = [...activeMatches];
    list.sort((a, b) => {
      const idA = getMatchId(a);
      const idB = getMatchId(b);
      const poolA = betPools[idA] ? betPools[idA].total : 0;
      const poolB = betPools[idB] ? betPools[idB].total : 0;

      if (sortMethod === 'hafta') {
        return (Number(a.hafta) || 99) - (Number(b.hafta) || 99);
      } else if (sortMethod === 'populer') {
        return poolB - poolA;
      } else {
        return poolA - poolB;
      }
    });
    return list;
  };

  const currentActiveList = getSortedMatches();

  const handleOpenBetModal = (m: Match, choice: '1' | 'X' | '2') => {
    if (!currentUser) {
      alert('Bahis yapmak için giriş yapmalısınız!');
      return;
    }
    setModalContext({ match: m, choice, mId: getMatchId(m) });
    setBetAmountText('');
    setModalError('');
    setModalOpen(true);
  };

  const getOddsPreview = () => {
    if (!modalContext) return { remaining: 0, odd: 1.0, payout: 0 };
    const amt = parseInt(betAmountText) || 0;
    const balance = currentUser?.balance || 0;
    const remaining = balance - amt;

    const base = betPools[modalContext.mId] || { '1': 0, 'X': 0, '2': 0 };
    const p1 = base['1'] + BASE_POOL + (modalContext.choice === '1' ? amt : 0);
    const pX = base['X'] + BASE_POOL + (modalContext.choice === 'X' ? amt : 0);
    const p2 = base['2'] + BASE_POOL + (modalContext.choice === '2' ? amt : 0);

    const total = p1 + pX + p2;
    const choicePool = modalContext.choice === '1' ? p1 : modalContext.choice === 'X' ? pX : p2;
    const odd = total / choicePool;
    const payout = amt * odd;

    return { remaining, odd, payout };
  };

  const handleConfirmBet = async () => {
    if (!currentUser || !modalContext) return;
    const amt = parseInt(betAmountText) || 0;
    const bal = currentUser.balance || 0;

    if (isNaN(amt) || amt < 10) {
      setModalError('Minimum 10 ฿ bahis yapabilirsiniz.');
      return;
    }
    if (amt > bal) {
      setModalError(`Yetersiz bakiye! Mevcut: ${bal.toLocaleString()} ฿`);
      return;
    }

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const betRef = doc(collection(db, 'bets'));
      batch.set(betRef, {
        uid: currentUser.uid,
        ad: currentUser.displayName || 'Kullanıcı',
        avatar: currentUser.avatar || '',
        matchId: modalContext.mId,
        choice: modalContext.choice,
        amount: amt,
        timestamp: serverTimestamp(),
        status: 'pending'
      });

      const userRef = doc(db, 'users', currentUser.uid);
      batch.update(userRef, { balance: increment(-amt) });

      await batch.commit();
      setModalOpen(false);
    } catch (e) {
      console.error(e);
      setModalError('İddianız kaydedilemedi. Bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelBet = async (betId: string, amount: number) => {
    if (!currentUser) return;
    if (!confirm("Bu bahisi iptal etmek istediğinize emin misiniz? Paranız iade edilecektir.")) return;

    try {
      const batch = writeBatch(db);
      const betRef = doc(db, 'bets', betId);
      batch.delete(betRef);

      const userRef = doc(db, 'users', currentUser.uid);
      batch.update(userRef, { balance: increment(amount) });

      await batch.commit();
      alert('İddianız iptal edildi ve bakiye iade edildi!');
    } catch (e) {
      console.error(e);
      alert('Silinemedi.');
    }
  };

  const previews = getOddsPreview();

  return (
    <div className="space-y-6">
      {/* Sub tabs selectors */}
      <div className="flex justify-center gap-1.5 md:gap-2 flex-wrap">
        {[
          { id: 'merkez', label: 'İddia Merkezi' },
          { id: 'sonuclar', label: 'Sonuçlar' },
          { id: 'eniyiler', label: 'En İyiler' },
          { id: 'oynadiklarim', label: 'Oynadıklarım' }
        ].map((tab) => {
          if (tab.id === 'oynadiklarim' && !currentUser) return null;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveCup(tab.id as IddiaTabType)}
              className={`py-1.5 px-3 rounded-lg font-black text-xs uppercase cursor-pointer border-2 transition-all ${
                activeTab === tab.id 
                  ? 'bg-brand-maroon text-brand-gold border-brand-gold shadow-md' 
                  : 'bg-brand-card border-brand-maroon text-brand-maroon/70'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'merkez' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex justify-end pr-2">
            <select 
              value={sortMethod}
              onChange={(e) => setSortMethod(e.target.value as SortSelector)}
              className="py-2 px-3 text-xs font-black bg-white rounded-lg border-2 border-brand-maroon text-brand-dark outline-none cursor-pointer"
            >
              <option value="hafta">📅 Haftaya Göre Sırala</option>
              <option value="populer">🔥 En Popülere Göre (Yüksek Havuz)</option>
              <option value="az">🧊 En Az Oynanana Göre (Düşük Havuz)</option>
            </select>
          </div>

          <div className="space-y-6 max-w-3xl mx-auto">
            {currentActiveList.length === 0 ? (
              <p className="text-center text-gray-500 font-bold">Aktif oynanabilecek lig maçı bulunmuyor.</p>
            ) : (
              currentActiveList.map((m) => {
                const id = getMatchId(m);
                const pool = betPools[id] || { '1': 0, 'X': 0, '2': 0, total: 0, bettors: { '1': [], 'X': [], '2': [] } };

                const p1 = pool['1'] + BASE_POOL;
                const pX = pool['X'] + BASE_POOL;
                const p2 = pool['2'] + BASE_POOL;
                const totalPool = p1 + pX + p2;

                const odd1 = (totalPool / p1).toFixed(2);
                const oddX = (totalPool / pX).toFixed(2);
                const odd2 = (totalPool / p2).toFixed(2);

                let myWinElement = null;
                if (currentUser) {
                  let myChoiceTotal = 0;
                  let myPotentialTotal = 0;
                  ['1', 'X', '2'].forEach((choice) => {
                    const info = pool.bettors[choice].find((x: any) => x.uid === currentUser.uid);
                    if (info) {
                      const curOdd = totalPool / (pool[choice] + BASE_POOL);
                      myPotentialTotal += info.amount * curOdd;
                      myChoiceTotal += info.amount;
                    }
                  });
                  if (myChoiceTotal > 0) {
                    myWinElement = (
                      <div className="bg-brand-maroon text-brand-gold p-3 rounded-xl mt-4 font-black text-xs md:text-sm flex justify-between items-center shadow-inner">
                        <span>Senin Yatırımın: {myChoiceTotal.toLocaleString()} ฿</span>
                        <span className="text-white">Olası Kazanç: {myPotentialTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿</span>
                      </div>
                    );
                  }
                }

                return (
                  <div key={id} className="bg-white rounded-3xl p-5 md:p-6 border-b-6 border-brand-maroon shadow-md animate-fade-in select-text">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
                      <span className="text-[11px] font-black text-brand-maroon uppercase tracking-wide">
                        📅 {m.date || 'Tarih Belirsiz'} | Hafta: {m.hafta || '-'}
                      </span>
                      <span className="bg-[#fff3b0] text-[10px] font-black text-brand-dark px-2.5 py-0.5 rounded-full border border-yellow-400">
                        Havuz: {pool.total.toLocaleString()} ฿
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-brand-dark mb-6">
                      <div className="flex-1 flex items-center justify-end gap-3 text-right">
                        <span className="font-extrabold text-sm md:text-lg">{m.team1}</span>
                        <img src={teamLogos[m.team1]} className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover shrink-0 border border-gray-100 shadow-sm" alt="logo" />
                      </div>
                      <span className="px-4 text-xs font-black text-gray-400">VS</span>
                      <div className="flex-1 flex items-center justify-start gap-3 text-left">
                        <img src={teamLogos[m.team2]} className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover shrink-0 border border-gray-100 shadow-sm" alt="logo" />
                        <span className="font-extrabold text-sm md:text-lg">{m.team2}</span>
                      </div>
                    </div>

                    {/* Odd buttons and bet list */}
                    <div className="grid grid-cols-3 gap-3 md:gap-4">
                      {['1', 'X', '2'].map((choiceKey) => {
                        const oddsVal = choiceKey === '1' ? odd1 : choiceKey === 'X' ? oddX : odd2;
                        const bettorsList = pool.bettors[choiceKey] || [];
                        const sortedBettors = [...bettorsList].sort((a,b) => b.amount - a.amount);
                        return (
                          <div key={choiceKey} className="flex flex-col gap-2">
                            <button
                              onClick={() => handleOpenBetModal(m, choiceKey as any)}
                              className="bg-brand-card hover:bg-white hover:border-brand-maroon focus:border-brand-maroon border-2 border-gray-200 rounded-2xl p-3 flex flex-col items-center justify-center h-20 transition-all cursor-pointer shadow-sm group select-none"
                            >
                              <span className="text-xl font-black text-brand-dark group-hover:scale-105 transition-transform">{choiceKey}</span>
                              <span className="text-sm font-black text-brand-maroon bg-white/70 border border-gray-300 py-0.5 px-2.5 rounded-lg mt-1">{oddsVal}</span>
                            </button>

                            {/* Bettors listed below choices */}
                            <div className="h-28 overflow-y-auto space-y-1.5 p-1 border border-gray-100 rounded-xl bg-gray-50 flex flex-col select-text">
                              {sortedBettors.map((bInfo: any) => (
                                <div 
                                  key={bInfo.uid}
                                  onClick={() => onNavigate({ type: 'user-profile', userId: bInfo.uid })}
                                  className="flex items-center gap-1.5 bg-white p-1 rounded-full border border-gray-200 shadow-sm cursor-pointer shrink-0 hover:translate-x-0.5 transition-transform"
                                >
                                  <img 
                                    src={bInfo.avatar || `https://ui-avatars.com/api/?name=${bInfo.ad}`} 
                                    className="w-5 h-5 rounded-full object-cover border border-brand-maroon" 
                                    alt="av" 
                                  />
                                  <span className="text-[9px] font-black text-brand-dark truncate flex-1">{bInfo.ad}</span>
                                  <span className="text-[8px] font-black bg-brand-gold text-brand-maroon px-1.5 py-0.5 rounded-full shrink-0">
                                    {bInfo.amount}฿
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {myWinElement}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === 'sonuclar' && (
        <div className="space-y-6 max-w-3xl mx-auto animate-fade-in select-text">
          {playedMatches.length === 0 ? (
            <p className="text-center text-gray-400 font-bold p-6">Henüz sonuçlanan maç bulunmuyor.</p>
          ) : (
            playedMatches.map((m) => {
              const id = getMatchId(m);
              const pool = betPools[id] || { '1': 0, 'X': 0, '2': 0, total: 0, bettors: { '1': [], 'X': [], '2': [] } };

              return (
                <div key={id} className="bg-white rounded-3xl p-5 md:p-6 border-b-6 border-brand-maroon shadow-md select-text">
                  <div className="flex justify-between items-center border-b border-gray-100 pb-2 mb-4">
                    <span className="text-[11px] font-black text-brand-maroon">📅 {m.date || ''} | Hafta: {m.hafta || ''}</span>
                    <span className="text-[11px] font-bold text-gray-500">Havuz: {pool.total.toLocaleString()} ฿</span>
                  </div>

                  <div className="flex items-center justify-between text-brand-dark mb-4">
                    <div className="flex-1 flex items-center justify-end gap-3 text-right">
                      <span className="font-extrabold text-sm md:text-base">{m.team1}</span>
                      <img src={teamLogos[m.team1]} className="w-10 h-10 rounded-full border bg-white object-cover" alt="logo" />
                    </div>
                    <div className="bg-brand-dark text-brand-gold py-1.5 px-4 rounded-xl text-lg font-black text-center border-2 border-brand-gold min-w-[70px] mx-4">
                      {m.score1} - {m.score2}
                    </div>
                    <div className="flex-1 flex items-center justify-start gap-3 text-left">
                      <img src={teamLogos[m.team2]} className="w-10 h-10 rounded-full border bg-white object-cover" alt="logo" />
                      <span className="font-extrabold text-sm md:text-base">{m.team2}</span>
                    </div>
                  </div>

                  {/* Bettors display for completed outcomes */}
                  <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-dashed border-gray-150">
                    {['1', 'X', '2'].map((key) => {
                      const totalChoiceBets = pool[key] || 0;
                      return (
                        <div key={key} className="text-center text-[10px] font-bold text-gray-500">
                          Seçenek <strong className="text-brand-maroon">{key}</strong>: {totalChoiceBets.toLocaleString()} ฿
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'eniyiler' && (
        <div className="max-w-2xl mx-auto space-y-4 animate-fade-in select-text">
          {usersLeaderboard.map((u, index) => {
            const av = u.avatar || `https://ui-avatars.com/api/?name=${u.displayName}&background=800000&color=ffd700&size=40`;
            return (
              <div 
                key={u.uid}
                onClick={() => onNavigate({ type: 'user-profile', userId: u.uid })}
                className="bg-brand-card p-4 rounded-2xl flex items-center border-l-12 border-brand-maroon hover:translate-x-1 transition-all shadow-sm cursor-pointer"
              >
                <div className="w-12 text-center text-lg font-black text-brand-maroon">{index + 1}.</div>
                <img src={av} className="w-12 h-12 rounded-full border-2 border-brand-maroon object-cover bg-white mr-4" alt="avatar" />
                <div className="flex-1">
                  <h4 className="font-black text-brand-dark text-base">{u.displayName || 'Kullanıcı'}</h4>
                </div>
                <div className="text-right text-xl font-black text-brand-maroon">
                  {(u.balance || 0).toLocaleString()} <span className="text-sm text-brand-gold">฿</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'oynadiklarim' && (
        <div className="max-w-2xl mx-auto space-y-4 animate-fade-in select-text">
          {myBets.length === 0 ? (
            <p className="text-center text-gray-500 font-bold p-6">Henüz bir bahis kuponunuz bulunmuyor.</p>
          ) : (
            myBets.map((b) => {
              const match = activeMatches.find(m => getMatchId(m) === b.matchId) || playedMatches.find(m => getMatchId(m) === b.matchId);
              const mText = match ? `${match.team1} vs ${match.team2} (Hafta: ${match.hafta})` : 'Maç Bilgisi Yüklenemedi';
              const statusColors = b.status === 'pending' ? 'border-orange-500' : b.status === 'won' ? 'border-green-500' : 'border-red-500';
              const statusLabels = b.status === 'pending' ? '⏳ Bekliyor' : b.status === 'won' ? `✅ Kazandı (+${b.winAmount?.toLocaleString()} ฿)` : '❌ Kaybetti';
              const cancelAllowed = b.status === 'pending' && match && !match.played;

              return (
                <div key={b.id} className="bg-brand-card p-5 rounded-2xl shadow-sm border-l-12" style={{ borderLeftColor: b.status === 'pending' ? '#ff9800' : b.status === 'won' ? '#00a859' : '#cc0000' }}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs text-gray-500 font-bold">{mText}</span>
                      <h4 className="text-lg font-black text-brand-dark mt-1">Tahmin: {b.choice} {b.finalOdd ? `(Kapanış Oranı: ${b.finalOdd.toFixed(2)})` : ''}</h4>
                      <span className="text-xs font-black block mt-2" style={{ color: b.status === 'pending' ? '#ff8800' : (b.status === 'won' ? '#00a859' : '#cc0000') }}>
                        {statusText(b)}
                      </span>
                      {cancelCancelButton(b, match)}
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-black text-brand-maroon">{b.amount.toLocaleString()} <span className="text-xs text-brand-gold">฿</span></span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* BET POPUP MODAL */}
      {modalOpen && modalContext && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 border-b-6 border-brand-maroon relative animate-scale-up">
            <button onClick={() => setModalOpen(false)} className="absolute top-4 right-4 text-xl font-black text-brand-maroon cursor-pointer hover:scale-110">✕</button>
            <h3 className="text-xl font-black text-brand-maroon text-center mb-4">Bahis Yap</h3>
            
            <div className="bg-brand-card p-4 rounded-xl font-bold text-center text-xs text-gray-700 mb-4 select-text">
              <span className="block font-black text-sm text-brand-dark mb-1">{modalContext.match.team1} - {modalContext.match.team2}</span>
              Seçiminiz: <strong className="text-brand-maroon font-black text-base">{modalContext.choice}</strong>
            </div>

            {modalError && <p className="text-xs text-red-500 font-bold text-center mb-3">{modalError}</p>}

            <div className="flex items-center border-2 border-brand-maroon rounded-2xl bg-white overflow-hidden mb-4 shadow-sm">
              <input 
                type="number" 
                value={betAmountText}
                onChange={(e) => setBetAmountText(e.target.value)}
                placeholder="Yatırım Miktarı"
                className="flex-1 py-3 px-4 text-lg font-black outline-none w-full text-center"
                min="10"
              />
              <span className="bg-brand-maroon text-brand-gold font-black px-4 py-3 text-lg border-l border-brand-maroon">฿</span>
            </div>

            {/* Odds / payout calculations pre-viewer */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs space-y-2 mb-4 font-bold">
              <div className="flex justify-between">
                <span className="text-gray-500">Kalan Bakiye:</span>
                <span className={previews.remaining < 0 ? 'text-red-500' : 'text-gray-800'}>
                  {previews.remaining < 0 ? 0 : previews.remaining.toLocaleString()} ฿
                </span>
              </div>
              <div className="border-t border-dashed border-gray-200 pt-2 flex justify-between items-center text-sm">
                <span className="text-gray-500">Olası Kazanç:</span>
                <span className="text-green-600 font-black text-base">
                  {previews.payout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿
                </span>
              </div>
            </div>

            <button 
              onClick={handleConfirmBet}
              disabled={submitting}
              className="bg-brand-maroon text-brand-gold py-3.5 w-full rounded-2xl font-black text-sm hover:bg-[#600000] cursor-pointer disabled:opacity-50 transition-colors shadow-md border-b-4 border-black"
            >
              {submitting ? 'Yatırılıyor...' : 'Onayla ve Oyna'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  function statusText(b: any) {
    if (b.status === 'pending') return '⏳ Bekliyor';
    if (b.status === 'won') return `✅ Kazandı (+${b.winAmount?.toLocaleString()} ฿)`;
    return '❌ Kaybetti';
  }

  function cancelCancelButton(b: any, match: any) {
    if (b.status === 'pending' && match && !match.played) {
      return (
        <button 
          onClick={() => handleCancelBet(b.id, b.amount)}
          className="mt-3 bg-red-600 text-white font-extrabold text-[10px] uppercase py-1.5 px-4 rounded-xl shadow hover:bg-black cursor-pointer transition-colors"
        >
          Bahisi İptal Et
        </button>
      );
    }
    return null;
  }
}
