import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDoc, setDoc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, TradeCardItem, TradeOffer } from '../types';

export function getISOWeekKey(d: Date = new Date()): string {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export function getTradePairKey(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

interface TradeViewProps {
  currentUser: UserProfile;
  userAlbum: Record<string, any>;
  onClose: () => void;
  onTradeFinished?: () => void;
}

export function TradeView({ currentUser, userAlbum, onClose, onTradeFinished }: TradeViewProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'offers'>('create');
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<UserProfile | null>(null);
  const [partnerAlbum, setPartnerAlbum] = useState<Record<string, any>>({});
  const [loadingPartner, setLoadingPartner] = useState<boolean>(false);
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');

  // Selected trade cards
  const [offeredCards, setOfferedCards] = useState<TradeCardItem[]>([]);
  const [requestedCards, setRequestedCards] = useState<TradeCardItem[]>([]);

  // Weekly limits check
  const [weeklyCompletedTrades, setWeeklyCompletedTrades] = useState<number>(0);
  const [checkingLimit, setCheckingLimit] = useState<boolean>(false);

  // Incoming and Outgoing Offers
  const [incomingOffers, setIncomingOffers] = useState<TradeOffer[]>([]);
  const [outgoingOffers, setOutgoingOffers] = useState<TradeOffer[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Current ISO Week
  const currentWeekKey = getISOWeekKey();

  // 1. Fetch Registered Users
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list: UserProfile[] = [];
      snap.forEach((d) => {
        if (d.id !== currentUser.uid) {
          list.push({ uid: d.id, ...d.data() } as UserProfile);
        }
      });
      setAllUsers(list);
    });
    return () => unsub();
  }, [currentUser.uid]);

  // 2. Listen to Trades Collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'trades'), (snap) => {
      const inc: TradeOffer[] = [];
      const out: TradeOffer[] = [];

      snap.forEach((d) => {
        const data = { id: d.id, ...d.data() } as TradeOffer;
        if (data.receiverUid === currentUser.uid) {
          inc.push(data);
        }
        if (data.senderUid === currentUser.uid) {
          out.push(data);
        }
      });

      // Sort newest first
      inc.sort((a, b) => b.createdAt - a.createdAt);
      out.sort((a, b) => b.createdAt - a.createdAt);

      setIncomingOffers(inc);
      setOutgoingOffers(out);
    });
    return () => unsub();
  }, [currentUser.uid]);

  // 3. When Partner is Selected, Load their Album & Check Weekly Completed Trades
  useEffect(() => {
    if (!selectedPartner) {
      setPartnerAlbum({});
      setWeeklyCompletedTrades(0);
      return;
    }

    setLoadingPartner(true);
    setCheckingLimit(true);

    // Fetch partner album
    getDocs(collection(db, 'users', selectedPartner.uid, 'album'))
      .then((snap) => {
        const map: Record<string, any> = {};
        snap.forEach((d) => {
          map[d.id] = d.data();
        });
        setPartnerAlbum(map);
      })
      .catch((err) => console.error('Error fetching partner album:', err))
      .finally(() => setLoadingPartner(false));

    // Check completed trades between currentUser and selectedPartner in this ISO week
    const pairKey = getTradePairKey(currentUser.uid, selectedPartner.uid);
    getDocs(collection(db, 'trades'))
      .then((snap) => {
        let count = 0;
        snap.forEach((d) => {
          const t = d.data() as TradeOffer;
          if (t.pairKey === pairKey && t.weekKey === currentWeekKey && t.status === 'accepted') {
            count++;
          }
        });
        setWeeklyCompletedTrades(count);
      })
      .catch(console.error)
      .finally(() => setCheckingLimit(false));
  }, [selectedPartner, currentUser.uid, currentWeekKey]);

  // Helper to get available user cards formatted
  const getMyTradeableCards = (): TradeCardItem[] => {
    const list: TradeCardItem[] = [];
    Object.keys(userAlbum).forEach((slotCode) => {
      const entry = userAlbum[slotCode];
      if (!entry) return;

      if (entry.hasSecret && (entry.countSecret || 0) > 0) {
        list.push({
          slotCode,
          variant: 'secret',
          title: entry.title || slotCode,
          image: entry.image || '',
          count: entry.countSecret || 1
        });
      }
      if (entry.hasShiny && (entry.countShiny || 0) > 0) {
        list.push({
          slotCode,
          variant: 'shiny',
          title: entry.title || slotCode,
          image: entry.image || '',
          count: entry.countShiny || 1
        });
      }
      if (entry.hasNormal && (entry.countNormal || 0) > 0) {
        list.push({
          slotCode,
          variant: 'normal',
          title: entry.title || slotCode,
          image: entry.image || '',
          count: entry.countNormal || 1
        });
      }
    });
    return list;
  };

  // Helper to get partner available cards formatted
  const getPartnerTradeableCards = (): TradeCardItem[] => {
    const list: TradeCardItem[] = [];
    Object.keys(partnerAlbum).forEach((slotCode) => {
      const entry = partnerAlbum[slotCode];
      if (!entry) return;

      if (entry.hasSecret && (entry.countSecret || 0) > 0) {
        list.push({
          slotCode,
          variant: 'secret',
          title: entry.title || slotCode,
          image: entry.image || '',
          count: entry.countSecret || 1
        });
      }
      if (entry.hasShiny && (entry.countShiny || 0) > 0) {
        list.push({
          slotCode,
          variant: 'shiny',
          title: entry.title || slotCode,
          image: entry.image || '',
          count: entry.countShiny || 1
        });
      }
      if (entry.hasNormal && (entry.countNormal || 0) > 0) {
        list.push({
          slotCode,
          variant: 'normal',
          title: entry.title || slotCode,
          image: entry.image || '',
          count: entry.countNormal || 1
        });
      }
    });
    return list;
  };

  // Toggle selection for offered cards
  const toggleOfferedCard = (card: TradeCardItem) => {
    const exists = offeredCards.find((c) => c.slotCode === card.slotCode && c.variant === card.variant);
    if (exists) {
      setOfferedCards(offeredCards.filter((c) => !(c.slotCode === card.slotCode && c.variant === card.variant)));
    } else {
      setOfferedCards([...offeredCards, card]);
    }
  };

  // Toggle selection for requested cards
  const toggleRequestedCard = (card: TradeCardItem) => {
    const exists = requestedCards.find((c) => c.slotCode === card.slotCode && c.variant === card.variant);
    if (exists) {
      setRequestedCards(requestedCards.filter((c) => !(c.slotCode === card.slotCode && c.variant === card.variant)));
    } else {
      setRequestedCards([...requestedCards, card]);
    }
  };

  // Submit Trade Proposal
  const handleSendTradeOffer = async () => {
    if (!selectedPartner) {
      setFeedbackMsg({ text: 'Lütfen bir takas ortağı seçin.', type: 'error' });
      return;
    }
    if (weeklyCompletedTrades >= 2) {
      setFeedbackMsg({
        text: 'Bu kullanıcı ile bu haftaki 2 takas hakkınızı doldurdunuz. Gelecek hafta tekrar deneyebilirsiniz.',
        type: 'error'
      });
      return;
    }
    if (offeredCards.length === 0 || requestedCards.length === 0) {
      setFeedbackMsg({
        text: 'Lütfen en az 1 verilecek ve en az 1 alınacak kart seçin.',
        type: 'error'
      });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg(null);

    try {
      const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const pairKey = getTradePairKey(currentUser.uid, selectedPartner.uid);

      await setDoc(doc(db, 'trades', tradeId), {
        id: tradeId,
        senderUid: currentUser.uid,
        senderName: currentUser.displayName || 'Kullanıcı',
        senderAvatar: currentUser.avatar || '',
        receiverUid: selectedPartner.uid,
        receiverName: selectedPartner.displayName || 'Kullanıcı',
        receiverAvatar: selectedPartner.avatar || '',
        offeredCards,
        requestedCards,
        status: 'pending',
        createdAt: Date.now(),
        weekKey: currentWeekKey,
        pairKey
      });

      setOfferedCards([]);
      setRequestedCards([]);
      setFeedbackMsg({
        text: '🎉 Takas teklifiniz başarıyla gönderildi! Karşı taraf onayladığında kartlar takaslanacaktır.',
        type: 'success'
      });
      setActiveTab('offers');
    } catch (err: any) {
      console.error('Error sending trade offer:', err);
      setFeedbackMsg({ text: 'Teklif gönderilirken bir hata oluştu: ' + err.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Accept incoming trade offer
  const handleAcceptOffer = async (offer: TradeOffer) => {
    // 1. Check weekly limit
    const pairKey = getTradePairKey(offer.senderUid, offer.receiverUid);
    const snap = await getDocs(collection(db, 'trades'));
    let acceptedCount = 0;
    snap.forEach((d) => {
      const t = d.data() as TradeOffer;
      if (t.pairKey === pairKey && t.weekKey === offer.weekKey && t.status === 'accepted') {
        acceptedCount++;
      }
    });

    if (acceptedCount >= 2) {
      alert('⚠️ Bu hafta bu iki kullanıcı arasında zaten 2 takas tamamlanmış! Haftalık takas limiti doldu.');
      return;
    }

    try {
      // 2. Transfer offered cards: sender -> receiver
      for (const card of offer.offeredCards) {
        // Decrement from sender
        const senderDocRef = doc(db, 'users', offer.senderUid, 'album', card.slotCode);
        const sDoc = await getDoc(senderDocRef);
        if (sDoc.exists()) {
          const sData = sDoc.data();
          const varKey = card.variant === 'secret' ? 'countSecret' : card.variant === 'shiny' ? 'countShiny' : 'countNormal';
          const hasKey = card.variant === 'secret' ? 'hasSecret' : card.variant === 'shiny' ? 'hasShiny' : 'hasNormal';
          const newCount = Math.max(0, (sData[varKey] || 1) - 1);
          await setDoc(senderDocRef, {
            [varKey]: newCount,
            [hasKey]: newCount > 0
          }, { merge: true });
        }

        // Increment for receiver (currentUser)
        const receiverDocRef = doc(db, 'users', offer.receiverUid, 'album', card.slotCode);
        const rDoc = await getDoc(receiverDocRef);
        const rData = rDoc.exists() ? rDoc.data() : {};
        const rVarKey = card.variant === 'secret' ? 'countSecret' : card.variant === 'shiny' ? 'countShiny' : 'countNormal';
        const rHasKey = card.variant === 'secret' ? 'hasSecret' : card.variant === 'shiny' ? 'hasShiny' : 'hasNormal';
        await setDoc(receiverDocRef, {
          slotCode: card.slotCode,
          [rVarKey]: (rData[rVarKey] || 0) + 1,
          [rHasKey]: true,
          selectedVariant: card.variant
        }, { merge: true });
      }

      // 3. Transfer requested cards: receiver -> sender
      for (const card of offer.requestedCards) {
        // Decrement from receiver (currentUser)
        const receiverDocRef = doc(db, 'users', offer.receiverUid, 'album', card.slotCode);
        const rDoc = await getDoc(receiverDocRef);
        if (rDoc.exists()) {
          const rData = rDoc.data();
          const varKey = card.variant === 'secret' ? 'countSecret' : card.variant === 'shiny' ? 'countShiny' : 'countNormal';
          const hasKey = card.variant === 'secret' ? 'hasSecret' : card.variant === 'shiny' ? 'hasShiny' : 'hasNormal';
          const newCount = Math.max(0, (rData[varKey] || 1) - 1);
          await setDoc(receiverDocRef, {
            [varKey]: newCount,
            [hasKey]: newCount > 0
          }, { merge: true });
        }

        // Increment for sender
        const senderDocRef = doc(db, 'users', offer.senderUid, 'album', card.slotCode);
        const sDoc = await getDoc(senderDocRef);
        const sData = sDoc.exists() ? sDoc.data() : {};
        const sVarKey = card.variant === 'secret' ? 'countSecret' : card.variant === 'shiny' ? 'countShiny' : 'countNormal';
        const sHasKey = card.variant === 'secret' ? 'hasSecret' : card.variant === 'shiny' ? 'hasShiny' : 'hasNormal';
        await setDoc(senderDocRef, {
          slotCode: card.slotCode,
          [sVarKey]: (sData[sVarKey] || 0) + 1,
          [sHasKey]: true,
          selectedVariant: card.variant
        }, { merge: true });
      }

      // 4. Mark offer as accepted
      await updateDoc(doc(db, 'trades', offer.id), {
        status: 'accepted',
        completedAt: Date.now()
      });

      alert('🎉 Takas başarıyla kabul edildi ve kartlar envanterinize eklendi!');
      if (onTradeFinished) onTradeFinished();
    } catch (err: any) {
      console.error('Error accepting trade:', err);
      alert('Takas sırasında hata oluştu: ' + err.message);
    }
  };

  // Reject offer
  const handleRejectOffer = async (offerId: string) => {
    try {
      await updateDoc(doc(db, 'trades', offerId), { status: 'rejected' });
    } catch (err) {
      console.error(err);
    }
  };

  // Counter offer / New offer based on this
  const handleCounterOffer = (offer: TradeOffer) => {
    const partner = allUsers.find((u) => u.uid === offer.senderUid);
    if (partner) {
      setSelectedPartner(partner);
      setActiveTab('create');
      setOfferedCards([]);
      setRequestedCards([]);
    }
  };

  const pendingIncomingCount = incomingOffers.filter((o) => o.status === 'pending').length;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5 animate-fade-in overflow-y-auto">
      <div className="bg-[#1a0000] border-4 border-amber-400 rounded-3xl max-w-5xl w-full p-4 sm:p-6 text-white shadow-2xl relative space-y-5 my-auto max-h-[95vh] flex flex-col justify-between overflow-y-auto">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 bg-red-700 hover:bg-red-800 text-white rounded-full w-9 h-9 flex items-center justify-center font-black text-sm border-2 border-amber-300 transition-colors cursor-pointer shadow-md z-20"
        >
          ✕
        </button>

        {/* Header */}
        <div className="text-center space-y-2 border-b border-amber-400/30 pb-3">
          <div className="inline-flex items-center gap-2 bg-amber-400 text-brand-maroon px-4 py-1 rounded-full font-black text-xs uppercase tracking-widest shadow-md">
            <span>🔄 OYUNCULAR ARASI TAKAS MERKEZİ</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black uppercase text-amber-300 tracking-tight">
            KART TAKAS (TRADE) SİSTEMİ
          </h2>

          {/* CRITICAL WEEKLY LIMIT WARNING REQUIREMENT */}
          <div className="bg-amber-400/10 border-2 border-amber-400/80 rounded-2xl p-2.5 max-w-xl mx-auto flex items-center justify-center gap-2 text-amber-300 text-xs font-black uppercase shadow-inner">
            <span>⚠️</span>
            <span>AYNI HAFTADA AYNI KULLANICI İLE EN FAZLA 2 KEZ TAKAS YAPILABİLİR!</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'create'
                ? 'bg-amber-400 text-brand-maroon border-2 border-white shadow-lg scale-105'
                : 'bg-black/60 text-amber-200 border border-amber-400/40 hover:bg-black/80'
            }`}
          >
            <span>🔄</span>
            <span>YENİ TAKAS OLUŞTUR</span>
          </button>

          <button
            onClick={() => setActiveTab('offers')}
            className={`px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 relative ${
              activeTab === 'offers'
                ? 'bg-amber-400 text-brand-maroon border-2 border-white shadow-lg scale-105'
                : 'bg-black/60 text-amber-200 border border-amber-400/40 hover:bg-black/80'
            }`}
          >
            <span>📬</span>
            <span>TAKAS TEKLİFLERİ</span>
            {pendingIncomingCount > 0 && (
              <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full border border-white animate-bounce">
                {pendingIncomingCount}
              </span>
            )}
          </button>
        </div>

        {/* Feedback message banner */}
        {feedbackMsg && (
          <div className={`p-3 rounded-2xl text-xs font-black text-center border-2 ${
            feedbackMsg.type === 'success' 
              ? 'bg-emerald-900/80 border-emerald-400 text-emerald-200' 
              : 'bg-red-900/80 border-red-400 text-red-200'
          }`}>
            {feedbackMsg.text}
          </div>
        )}

        {/* TAB 1: CREATE TRADE */}
        {activeTab === 'create' && (
          <div className="space-y-4">
            
            {/* User Selector Dropdown */}
            <div className="bg-black/60 border-2 border-amber-400/40 rounded-2xl p-4 space-y-3">
              <label className="text-xs font-black uppercase text-amber-300 block">
                1. Takas Yapmak İstediğiniz Kullanıcıyı Seçin:
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  placeholder="Kullanıcı adı ara..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="bg-stone-900 border border-amber-400/50 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-500 w-full sm:w-64"
                />

                <select
                  value={selectedPartner?.uid || ''}
                  onChange={(e) => {
                    const u = allUsers.find((x) => x.uid === e.target.value);
                    setSelectedPartner(u || null);
                    setOfferedCards([]);
                    setRequestedCards([]);
                  }}
                  className="bg-stone-900 border-2 border-amber-400 rounded-xl px-3 py-2 text-xs text-amber-300 font-bold flex-1"
                >
                  <option value="">-- Kullanıcı Listesinden Seç --</option>
                  {allUsers
                    .filter((u) => !userSearchQuery || u.displayName.toLowerCase().includes(userSearchQuery.toLowerCase()))
                    .map((u) => (
                      <option key={u.uid} value={u.uid}>
                        👤 {u.displayName} {u.favTeam ? `(${u.favTeam})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              {selectedPartner && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-400/20 text-xs">
                  <div className="flex items-center gap-2">
                    <img 
                      src={selectedPartner.avatar || 'https://via.placeholder.com/32'} 
                      alt={selectedPartner.displayName} 
                      className="w-7 h-7 rounded-full border border-amber-400"
                    />
                    <span className="font-black text-amber-200">
                      Seçilen Ortak: <span className="text-white">{selectedPartner.displayName}</span>
                    </span>
                  </div>

                  {checkingLimit ? (
                    <span className="text-stone-400">Limit kontrol ediliyor...</span>
                  ) : (
                    <span className={`font-mono font-black px-2.5 py-1 rounded-xl border ${
                      weeklyCompletedTrades >= 2 
                        ? 'bg-red-900/80 text-red-300 border-red-500' 
                        : 'bg-emerald-900/80 text-emerald-300 border-emerald-500'
                    }`}>
                      Bu Hafta Tamamlanan Takas: {weeklyCompletedTrades} / 2 {weeklyCompletedTrades >= 2 && '🚫 LİMİT DOLDU'}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* If Partner Selected: Dual Inventory View */}
            {selectedPartner ? (
              <div className="space-y-4">
                
                {/* Active Selection Trays */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-black/70 border border-amber-400/40 rounded-2xl p-3">
                  {/* Left: What You Offer */}
                  <div className="space-y-1.5 border-b md:border-b-0 md:border-r border-amber-400/20 pb-2 md:pb-0 md:pr-3">
                    <span className="text-[10px] font-black uppercase text-amber-300 block">
                      📤 Vereceğiniz Kartlar ({offeredCards.length} Kart Seçildi):
                    </span>
                    {offeredCards.length === 0 ? (
                      <span className="text-[11px] text-stone-400 italic block">Aşağıdan vermek istediğiniz kartları tıklayın.</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {offeredCards.map((c, i) => (
                          <span
                            key={i}
                            onClick={() => toggleOfferedCard(c)}
                            className="bg-brand-maroon border border-amber-300 text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 cursor-pointer hover:bg-red-900"
                          >
                            <span>{c.variant === 'secret' ? '🕶️' : c.variant === 'shiny' ? '✨' : '📄'}</span>
                            <span>{c.slotCode}</span>
                            <span className="text-red-400 font-black">✕</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right: What You Request */}
                  <div className="space-y-1.5 md:pl-2">
                    <span className="text-[10px] font-black uppercase text-emerald-300 block">
                      📥 Alacağınız Kartlar ({requestedCards.length} Kart Seçildi):
                    </span>
                    {requestedCards.length === 0 ? (
                      <span className="text-[11px] text-stone-400 italic block">Karşı tarafın kartlarından istediklerinizi tıklayın.</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {requestedCards.map((c, i) => (
                          <span
                            key={i}
                            onClick={() => toggleRequestedCard(c)}
                            className="bg-emerald-950 border border-emerald-400 text-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 cursor-pointer hover:bg-red-900"
                          >
                            <span>{c.variant === 'secret' ? '🕶️' : c.variant === 'shiny' ? '✨' : '📄'}</span>
                            <span>{c.slotCode}</span>
                            <span className="text-red-400 font-black">✕</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Dual Inventory Columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Left Column: Your Inventory */}
                  <div className="bg-black/50 border border-amber-400/30 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between border-b border-amber-400/20 pb-2">
                      <span className="text-xs font-black uppercase text-amber-300">
                        🎒 Senin Kart Envanterin
                      </span>
                      <span className="text-[10px] text-amber-200/80 font-mono">
                        {getMyTradeableCards().length} Kart Mevcut
                      </span>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-1">
                      {getMyTradeableCards().length === 0 ? (
                        <div className="col-span-4 text-center py-8 text-stone-400 text-xs italic">
                          Envanterinizde henüz kart bulunmuyor.
                        </div>
                      ) : (
                        getMyTradeableCards().map((card, idx) => {
                          const isSelected = Boolean(
                            offeredCards.find((c) => c.slotCode === card.slotCode && c.variant === card.variant)
                          );

                          return (
                            <div
                              key={idx}
                              onClick={() => toggleOfferedCard(card)}
                              className={`aspect-[3/4] p-1.5 rounded-xl border flex flex-col justify-between items-center text-center cursor-pointer transition-all duration-150 select-none relative ${
                                isSelected
                                  ? 'bg-amber-400 text-brand-maroon border-white ring-2 ring-amber-400 scale-105'
                                  : card.variant === 'secret'
                                  ? 'bg-black border-white text-white'
                                  : card.variant === 'shiny'
                                  ? 'bg-gradient-to-br from-amber-300 to-yellow-100 text-black border-amber-400'
                                  : 'bg-[#FFFEE8] text-black border-stone-400'
                              }`}
                            >
                              <div className="w-full flex items-center justify-between text-[8px] font-black">
                                <span>{card.slotCode}</span>
                                <span>{card.variant === 'secret' ? '🕶️' : card.variant === 'shiny' ? '✨' : ''}</span>
                              </div>

                              <div className="my-auto text-lg">
                                {card.variant === 'secret' ? '🕶️' : card.variant === 'shiny' ? '⭐' : '⚽'}
                              </div>

                              <div className="w-full flex items-center justify-between text-[7px] font-black uppercase truncate">
                                <span className="truncate">{card.slotCode}</span>
                                {(card.count || 1) > 1 && (
                                  <span className="bg-black text-amber-300 px-1 rounded">x{card.count}</span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Right Column: Partner's Inventory */}
                  <div className="bg-black/50 border border-emerald-400/30 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between border-b border-emerald-400/20 pb-2">
                      <span className="text-xs font-black uppercase text-emerald-300">
                        🎒 {selectedPartner.displayName} Kart Envanteri
                      </span>
                      <span className="text-[10px] text-emerald-200/80 font-mono">
                        {loadingPartner ? 'Yükleniyor...' : `${getPartnerTradeableCards().length} Kart`}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-1">
                      {loadingPartner ? (
                        <div className="col-span-4 text-center py-8 text-stone-400 text-xs italic">
                          Kartlar yükleniyor...
                        </div>
                      ) : getPartnerTradeableCards().length === 0 ? (
                        <div className="col-span-4 text-center py-8 text-stone-400 text-xs italic">
                          Bu kullanıcının envanterinde henüz kart yok.
                        </div>
                      ) : (
                        getPartnerTradeableCards().map((card, idx) => {
                          const isSelected = Boolean(
                            requestedCards.find((c) => c.slotCode === card.slotCode && c.variant === card.variant)
                          );

                          return (
                            <div
                              key={idx}
                              onClick={() => toggleRequestedCard(card)}
                              className={`aspect-[3/4] p-1.5 rounded-xl border flex flex-col justify-between items-center text-center cursor-pointer transition-all duration-150 select-none relative ${
                                isSelected
                                  ? 'bg-emerald-400 text-brand-maroon border-white ring-2 ring-emerald-400 scale-105'
                                  : card.variant === 'secret'
                                  ? 'bg-black border-white text-white'
                                  : card.variant === 'shiny'
                                  ? 'bg-gradient-to-br from-amber-300 to-yellow-100 text-black border-amber-400'
                                  : 'bg-[#FFFEE8] text-black border-stone-400'
                              }`}
                            >
                              <div className="w-full flex items-center justify-between text-[8px] font-black">
                                <span>{card.slotCode}</span>
                                <span>{card.variant === 'secret' ? '🕶️' : card.variant === 'shiny' ? '✨' : ''}</span>
                              </div>

                              <div className="my-auto text-lg">
                                {card.variant === 'secret' ? '🕶️' : card.variant === 'shiny' ? '⭐' : '⚽'}
                              </div>

                              <div className="w-full flex items-center justify-between text-[7px] font-black uppercase truncate">
                                <span className="truncate">{card.slotCode}</span>
                                {(card.count || 1) > 1 && (
                                  <span className="bg-black text-amber-300 px-1 rounded">x{card.count}</span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                </div>

                {/* Send Offer Button */}
                <div className="text-center pt-2">
                  <button
                    onClick={handleSendTradeOffer}
                    disabled={
                      isSubmitting ||
                      weeklyCompletedTrades >= 2 ||
                      offeredCards.length === 0 ||
                      requestedCards.length === 0
                    }
                    className={`px-8 py-3.5 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider transition-all cursor-pointer shadow-xl ${
                      weeklyCompletedTrades >= 2
                        ? 'bg-red-800 text-stone-300 cursor-not-allowed opacity-80'
                        : offeredCards.length > 0 && requestedCards.length > 0
                        ? 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 hover:scale-105 text-brand-maroon border-2 border-white'
                        : 'bg-stone-700 text-stone-400 cursor-not-allowed opacity-80'
                    }`}
                  >
                    {isSubmitting
                      ? 'Gönderiliyor...'
                      : weeklyCompletedTrades >= 2
                      ? '🚫 Haftalık Takas Limiti Doldu (2/2)'
                      : `🚀 TAKAS TEKLİFİNİ GÖNDER (${offeredCards.length} Ver ➔ ${requestedCards.length} Al)`}
                  </button>
                  <p className="text-[10px] text-stone-400 mt-2">
                    ℹ️ Teklif göndermek takas hakkınızı düşürmez. Hak sadece teklif <b>Kabul Edildiğinde</b> harcanır.
                  </p>
                </div>

              </div>
            ) : (
              <div className="text-center py-12 text-stone-400 text-xs italic bg-black/40 rounded-2xl border border-stone-800">
                👆 Takas yapmaya başlamak için yukarıdaki listeden bir kullanıcı seçin.
              </div>
            )}

          </div>
        )}

        {/* TAB 2: OFFERS LIST */}
        {activeTab === 'offers' && (
          <div className="space-y-6">
            
            {/* Incoming Offers */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-amber-400/30 pb-2">
                <h3 className="text-sm font-black uppercase text-amber-300 flex items-center gap-2">
                  <span>📥</span>
                  <span>SİZE GELEN TAKAS TEKLİFLERİ ({incomingOffers.length})</span>
                </h3>
              </div>

              {incomingOffers.length === 0 ? (
                <div className="text-center py-6 text-stone-400 text-xs italic bg-black/40 rounded-2xl border border-stone-800">
                  Henüz size gelen bir takas teklifi yok.
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {incomingOffers.map((offer) => (
                    <div
                      key={offer.id}
                      className="bg-black/70 border-2 border-amber-400/40 rounded-2xl p-4 space-y-3 shadow-md"
                    >
                      {/* Offer Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                        <div className="flex items-center gap-2">
                          <img
                            src={offer.senderAvatar || 'https://via.placeholder.com/32'}
                            alt={offer.senderName}
                            className="w-7 h-7 rounded-full border border-amber-400"
                          />
                          <div>
                            <span className="text-xs font-black text-white">{offer.senderName}</span>
                            <span className="text-[10px] text-stone-400 block font-mono">
                              {new Date(offer.createdAt).toLocaleDateString('tr-TR')} {new Date(offer.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>

                        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl border ${
                          offer.status === 'accepted'
                            ? 'bg-emerald-900 text-emerald-300 border-emerald-500'
                            : offer.status === 'rejected'
                            ? 'bg-red-900 text-red-300 border-red-500'
                            : 'bg-amber-400 text-brand-maroon border-amber-300 animate-pulse'
                        }`}>
                          {offer.status === 'accepted'
                            ? '✅ KABUL EDİLDİ'
                            : offer.status === 'rejected'
                            ? '❌ REDDEDİLDİ'
                            : '⏳ BEKLEMEDE'}
                        </span>
                      </div>

                      {/* Cards Exchange Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {/* What sender gives you */}
                        <div className="bg-stone-900/80 p-2.5 rounded-xl border border-emerald-500/40 space-y-1">
                          <span className="text-[10px] font-black text-emerald-300 uppercase block">
                            🎁 Karşı Tarafın Size Verdiği ({offer.offeredCards.length} Kart):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {offer.offeredCards.map((c, i) => (
                              <span key={i} className="bg-emerald-950 text-emerald-200 border border-emerald-600 px-2 py-0.5 rounded text-[10px] font-bold">
                                {c.variant === 'secret' ? '🕶️ ' : c.variant === 'shiny' ? '✨ ' : ''}{c.slotCode}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* What sender wants from you */}
                        <div className="bg-stone-900/80 p-2.5 rounded-xl border border-amber-500/40 space-y-1">
                          <span className="text-[10px] font-black text-amber-300 uppercase block">
                            📦 Sizden İstenen ({offer.requestedCards.length} Kart):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {offer.requestedCards.map((c, i) => (
                              <span key={i} className="bg-brand-maroon text-amber-200 border border-amber-500 px-2 py-0.5 rounded text-[10px] font-bold">
                                {c.variant === 'secret' ? '🕶️ ' : c.variant === 'shiny' ? '✨ ' : ''}{c.slotCode}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons if Pending */}
                      {offer.status === 'pending' && (
                        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-white/10">
                          <button
                            onClick={() => handleRejectOffer(offer.id)}
                            className="px-3.5 py-1.5 bg-red-800 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase cursor-pointer transition-colors"
                          >
                            ❌ Reddet
                          </button>

                          <button
                            onClick={() => handleCounterOffer(offer)}
                            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-brand-maroon rounded-xl font-black text-xs uppercase cursor-pointer transition-colors"
                          >
                            🔄 Yeni Teklif Yap
                          </button>

                          <button
                            onClick={() => handleAcceptOffer(offer)}
                            className="px-5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase cursor-pointer transition-all shadow-md hover:scale-105"
                          >
                            ✅ Kabul Et (Takası Tamamla)
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Outgoing Offers */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-amber-400/30 pb-2">
                <h3 className="text-sm font-black uppercase text-amber-300 flex items-center gap-2">
                  <span>📤</span>
                  <span>GÖNDERDİĞİNİZ TAKAS TEKLİFLERİ ({outgoingOffers.length})</span>
                </h3>
              </div>

              {outgoingOffers.length === 0 ? (
                <div className="text-center py-6 text-stone-400 text-xs italic bg-black/40 rounded-2xl border border-stone-800">
                  Henüz gönderdiğiniz bir takas teklifi yok.
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {outgoingOffers.map((offer) => (
                    <div
                      key={offer.id}
                      className="bg-black/70 border border-white/20 rounded-2xl p-4 space-y-3 shadow-md"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                        <div className="flex items-center gap-2">
                          <img
                            src={offer.receiverAvatar || 'https://via.placeholder.com/32'}
                            alt={offer.receiverName}
                            className="w-7 h-7 rounded-full border border-amber-400"
                          />
                          <div>
                            <span className="text-xs font-black text-white">Alıcı: {offer.receiverName}</span>
                            <span className="text-[10px] text-stone-400 block font-mono">
                              {new Date(offer.createdAt).toLocaleDateString('tr-TR')} {new Date(offer.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>

                        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl border ${
                          offer.status === 'accepted'
                            ? 'bg-emerald-900 text-emerald-300 border-emerald-500'
                            : offer.status === 'rejected'
                            ? 'bg-red-900 text-red-300 border-red-500'
                            : 'bg-amber-400 text-brand-maroon border-amber-300'
                        }`}>
                          {offer.status === 'accepted'
                            ? '✅ KABUL EDİLDİ'
                            : offer.status === 'rejected'
                            ? '❌ REDDEDİLDİ'
                            : '⏳ KARŞI TARAF BEKLENİYOR'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="bg-stone-900/80 p-2.5 rounded-xl border border-amber-500/30 space-y-1">
                          <span className="text-[10px] font-black text-amber-300 uppercase block">
                            Teklif Ettiğiniz ({offer.offeredCards.length} Kart):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {offer.offeredCards.map((c, i) => (
                              <span key={i} className="bg-brand-maroon text-amber-200 border border-amber-500 px-2 py-0.5 rounded text-[10px] font-bold">
                                {c.variant === 'secret' ? '🕶️ ' : c.variant === 'shiny' ? '✨ ' : ''}{c.slotCode}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="bg-stone-900/80 p-2.5 rounded-xl border border-emerald-500/30 space-y-1">
                          <span className="text-[10px] font-black text-emerald-300 uppercase block">
                            İstediğiniz ({offer.requestedCards.length} Kart):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {offer.requestedCards.map((c, i) => (
                              <span key={i} className="bg-emerald-950 text-emerald-200 border border-emerald-600 px-2 py-0.5 rounded text-[10px] font-bold">
                                {c.variant === 'secret' ? '🕶️ ' : c.variant === 'shiny' ? '✨ ' : ''}{c.slotCode}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
