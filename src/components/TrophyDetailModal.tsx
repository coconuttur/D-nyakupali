import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, doc, setDoc, deleteDoc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { TROPHY_MAP } from '../lib/trophies';
import { UserProfile, Player, Team } from '../types';

export interface TrophyWinner {
  id: string; // e.g. "ballondor_24_25" or doc id
  trophyId: string;
  season: string; // e.g. "24/25" or "2025"
  year: number; // for sorting
  winnerName: string;
  winnerType: 'player' | 'team';
  photo?: string;
  countryName?: string;
  countryFlag?: string;
}

interface TrophyDetailModalProps {
  isOpen: boolean;
  trophyId: string | null;
  onClose: () => void;
  currentUser: UserProfile | null;
  onNavigate?: (view: any) => void;
}

export function TrophyDetailModal({ isOpen, trophyId, onClose, currentUser, onNavigate }: TrophyDetailModalProps) {
  const [winners, setWinners] = useState<TrophyWinner[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'team' | 'player'>('all');

  // Admin form state
  const [inputSeason, setInputSeason] = useState<string>('24/25');
  const [winnerType, setWinnerType] = useState<'player' | 'team'>('player');
  const [selectedWinnerName, setSelectedWinnerName] = useState<string>('');
  const [customWinnerName, setCustomWinnerName] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Data lists for selection
  const [playersList, setPlayersList] = useState<{ id: string; player: Player }[]>([]);
  const [teamsList, setTeamsList] = useState<{ id: string; team: Team }[]>([]);

  const isIndividual = trophyId ? ['ballondor', 'golden_boy', 'fairplay', 'puskas'].includes(trophyId) : false;

  useEffect(() => {
    if (isIndividual) {
      setWinnerType('player');
    } else {
      setWinnerType('team');
    }
  }, [trophyId, isIndividual]);

  useEffect(() => {
    if (!isOpen || !trophyId) return;

    setLoading(true);
    const q = query(collection(db, 'trophy_winners'), where('trophyId', '==', trophyId));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: TrophyWinner[] = [];
      snap.forEach((d) => {
        const data = d.data() as TrophyWinner;
        list.push({ 
          id: d.id, 
          ...data,
          season: data.season || (data.year ? `${String(data.year - 1).slice(-2)}/${String(data.year).slice(-2)}` : '24/25'),
          year: data.year || 2025
        });
      });
      // Sort year/season descending
      list.sort((a, b) => b.year - a.year);
      setWinners(list);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen, trophyId]);

  useEffect(() => {
    if (!isOpen || !currentUser?.admin) return;

    getDocs(collection(db, 'players')).then((pSnap) => {
      const pArr: { id: string; player: Player }[] = [];
      pSnap.forEach((d) => pArr.push({ id: d.id, player: d.data() as Player }));
      pArr.sort((a, b) => a.player.pname.localeCompare(b.player.pname));
      setPlayersList(pArr);
    });

    getDocs(collection(db, 'teams')).then((tSnap) => {
      const tArr: { id: string; team: Team }[] = [];
      tSnap.forEach((d) => tArr.push({ id: d.id, team: d.data() as Team }));
      tArr.sort((a, b) => (a.team.name || a.id).localeCompare(b.team.name || b.id));
      setTeamsList(tArr);
    });
  }, [isOpen, currentUser]);

  if (!isOpen || !trophyId) return null;

  const trophyInfo = TROPHY_MAP[trophyId] || {
    id: trophyId,
    name: trophyId.toUpperCase(),
    icon: 'https://via.placeholder.com/80?text=🏆'
  };

  const parseSortYear = (seasonStr: string): number => {
    const parts = seasonStr.split('/');
    if (parts.length === 2) {
      const yr = parseInt(parts[1], 10);
      if (!isNaN(yr)) return 2000 + yr;
    }
    const parsed = parseInt(seasonStr, 10);
    return isNaN(parsed) ? 2025 : parsed;
  };

  const handleSaveWinner = async () => {
    const winnerName = (customWinnerName.trim() || selectedWinnerName).trim();
    const finalType = isIndividual ? 'player' : winnerType;

    if (!winnerName) {
      alert('Lütfen kazanan bir ' + (finalType === 'player' ? 'oyuncu' : 'takım') + ' seçin!');
      return;
    }

    const cleanSeason = inputSeason.trim() || '24/25';
    const sortYear = parseSortYear(cleanSeason);

    setSaving(true);
    try {
      let photo = '';
      let countryName = '';
      let countryFlag = '';

      if (finalType === 'player') {
        const foundP = playersList.find(x => x.player.pname.toLowerCase() === winnerName.toLowerCase());
        if (foundP) {
          photo = foundP.player.foto || '';
          countryName = foundP.player.pülke || '';
        } else {
          const qP = query(collection(db, 'players'), where('pname', '==', winnerName));
          const pSnap = await getDocs(qP);
          if (!pSnap.empty) {
            const pData = pSnap.docs[0].data() as Player;
            photo = pData.foto || '';
            countryName = pData.pülke || '';
          }
        }
      } else {
        const foundT = teamsList.find(x => (x.team.name || x.id).toLowerCase() === winnerName.toLowerCase());
        if (foundT) {
          photo = foundT.team.logo || '';
          countryName = foundT.team.ülke || '';
        } else {
          const qT = query(collection(db, 'teams'), where('name', '==', winnerName));
          const tSnap = await getDocs(qT);
          if (!tSnap.empty) {
            const tData = tSnap.docs[0].data() as Team;
            photo = tData.logo || '';
            countryName = tData.ülke || '';
          }
        }
      }

      if (countryName) {
        const qC = query(collection(db, 'ülkeler'), where('ülkead', '==', countryName));
        const cSnap = await getDocs(qC);
        if (!cSnap.empty) {
          countryFlag = cSnap.docs[0].data().ülkefoto || '';
        }
      }

      const safeSeasonDocKey = cleanSeason.replace(/[^a-zA-Z0-9]/g, '_');
      const safeWinnerKey = winnerName.replace(/[^a-zA-Z0-9]/g, '_');
      const winnerDocId = `${trophyId}_${safeSeasonDocKey}_${safeWinnerKey}`;

      const winnerData: TrophyWinner = {
        id: winnerDocId,
        trophyId,
        season: cleanSeason,
        year: sortYear,
        winnerName,
        winnerType: finalType,
        photo: photo || (finalType === 'player' 
          ? `https://ui-avatars.com/api/?name=${encodeURIComponent(winnerName)}&background=800000&color=fff`
          : 'https://via.placeholder.com/50?text=🏆'),
        countryName,
        countryFlag
      };

      await setDoc(doc(db, 'trophy_winners', winnerDocId), winnerData);

      // Increment trophy count for winner in players or teams collection
      if (finalType === 'player') {
        const qP = query(collection(db, 'players'), where('pname', '==', winnerName));
        const pSnap = await getDocs(qP);
        if (!pSnap.empty) {
          const pDoc = pSnap.docs[0];
          const pData = pDoc.data() as Player;
          const currentKupalar = pData.kupalar || {};
          const newCount = (currentKupalar[trophyId] || 0) + 1;
          await updateDoc(doc(db, 'players', pDoc.id), {
            kupalar: { ...currentKupalar, [trophyId]: newCount }
          });
        }
      } else {
        let tDocId = '';
        const foundT = teamsList.find(x => (x.team.name || x.id).toLowerCase() === winnerName.toLowerCase());
        if (foundT) {
          tDocId = foundT.id;
        } else {
          const qT = query(collection(db, 'teams'), where('name', '==', winnerName));
          const tSnap = await getDocs(qT);
          if (!tSnap.empty) tDocId = tSnap.docs[0].id;
        }

        if (tDocId) {
          const tRef = doc(db, 'teams', tDocId);
          const tSnap = await getDocs(query(collection(db, 'teams'), where('__name__', '==', tDocId)));
          if (!tSnap.empty) {
            const tData = tSnap.docs[0].data() as Team;
            const currentKupalar = tData.kupalar || {};
            const newCount = (currentKupalar[trophyId] || 0) + 1;
            await updateDoc(tRef, {
              kupalar: { ...currentKupalar, [trophyId]: newCount }
            });
          }
        }
      }

      alert(`${cleanSeason} sezonu ${trophyInfo.name} kazananı (${winnerName}) başarıyla eklendi!`);
      setSelectedWinnerName('');
      setCustomWinnerName('');
    } catch (err) {
      console.error(err);
      alert('Kazanan kaydedilirken hata oluştu: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWinner = async (w: TrophyWinner) => {
    if (!window.confirm(`${w.season} sezonu ${w.winnerName} kaydını silmek istediğinize emin misiniz?`)) return;

    try {
      await deleteDoc(doc(db, 'trophy_winners', w.id));

      if (w.winnerType === 'player') {
        const qP = query(collection(db, 'players'), where('pname', '==', w.winnerName));
        const pSnap = await getDocs(qP);
        if (!pSnap.empty) {
          const pDoc = pSnap.docs[0];
          const pData = pDoc.data() as Player;
          const currentKupalar = pData.kupalar || {};
          const newCount = Math.max(0, (currentKupalar[trophyId] || 0) - 1);
          await updateDoc(doc(db, 'players', pDoc.id), {
            kupalar: { ...currentKupalar, [trophyId]: newCount }
          });
        }
      } else {
        const qT = query(collection(db, 'teams'), where('name', '==', w.winnerName));
        const tSnap = await getDocs(qT);
        if (!tSnap.empty) {
          const tDoc = tSnap.docs[0];
          const tData = tDoc.data() as Team;
          const currentKupalar = tData.kupalar || {};
          const newCount = Math.max(0, (currentKupalar[trophyId] || 0) - 1);
          await updateDoc(doc(db, 'teams', tDoc.id), {
            kupalar: { ...currentKupalar, [trophyId]: newCount }
          });
        }
      }

      alert('Kayıt silindi.');
    } catch (e) {
      console.error(e);
      alert('Silme işleminde hata oluştu.');
    }
  };

  const filteredWinners = winners.filter(w => {
    if (filterType === 'team') return w.winnerType === 'team';
    if (filterType === 'player') return w.winnerType === 'player';
    return true;
  });

  const seasonsList = [
    '25/26', '24/25', '23/24', '22/23', '21/22', '20/21', '19/20', '18/19', '17/18', '16/17', '15/16', '14/15', '13/14', '12/13', '11/12', '10/11'
  ];

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-2 sm:p-4 select-text">
      <div className="bg-[#f0f4f8] text-[#1e293b] w-full max-w-2xl rounded-2xl overflow-hidden border-2 border-slate-300 shadow-2xl relative select-text max-h-[92vh] flex flex-col">
        
        {/* Transfermarkt Style Header Banner */}
        <div className="bg-gradient-to-r from-[#1b365d] via-[#24487b] to-[#1b365d] text-white p-4 flex items-center justify-between border-b-4 border-amber-400 shrink-0 relative">
          <div className="flex items-center gap-3.5 min-w-0">
            <img 
              src={trophyInfo.icon} 
              alt={trophyInfo.name} 
              className="h-14 w-14 object-contain filter drop-shadow-md shrink-0 bg-white/10 p-1 rounded-xl border border-white/20"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/80?text=🏆';
              }}
            />
            <div className="min-w-0">
              <span className="text-[10px] font-black tracking-widest text-amber-300 uppercase block">
                {isIndividual ? '⭐ BİREYSEL ÖDÜL GEÇMİŞİ' : '🏆 ŞAMPİYONLUK GEÇMİŞİ'}
              </span>
              <h2 className="text-base sm:text-xl font-black tracking-tight uppercase truncate">
                {trophyInfo.name}
              </h2>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center text-lg transition-colors cursor-pointer shrink-0 ml-2"
          >
            ✕
          </button>
        </div>

        {/* Filter Bar (If team trophy, allow filtering by Team or Player) */}
        {!isIndividual && (
          <div className="bg-slate-200 px-4 py-2 flex items-center justify-between border-b border-slate-300 text-xs font-bold shrink-0">
            <span className="text-slate-600 font-black uppercase text-[10px] tracking-wider">
              Filtrele:
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1 rounded-lg font-black text-[11px] uppercase transition-all ${filterType === 'all' ? 'bg-[#1b365d] text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
              >
                Tümü ({winners.length})
              </button>
              <button
                onClick={() => setFilterType('team')}
                className={`px-3 py-1 rounded-lg font-black text-[11px] uppercase transition-all ${filterType === 'team' ? 'bg-[#1b365d] text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
              >
                Takımlar ({winners.filter(w => w.winnerType === 'team').length})
              </button>
              <button
                onClick={() => setFilterType('player')}
                className={`px-3 py-1 rounded-lg font-black text-[11px] uppercase transition-all ${filterType === 'player' ? 'bg-[#1b365d] text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
              >
                Oyuncular ({winners.filter(w => w.winnerType === 'player').length})
              </button>
            </div>
          </div>
        )}

        {/* Transfermarkt Style Winners Table */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {loading ? (
            <p className="text-center text-xs font-bold text-slate-500 py-10">Kazanma geçmişi yükleniyor...</p>
          ) : filteredWinners.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300 shadow-sm">
              <span className="text-4xl block mb-2">🏆</span>
              <p className="text-xs font-bold text-slate-500">Henüz bu kupa için verilmiş bir şampiyonluk kaydı bulunmuyor.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#e2e8f0] text-[#1e293b] text-[11px] font-black uppercase tracking-wider border-b border-slate-300">
                    <th className="py-2.5 px-3 sm:px-4 w-20">Sezon</th>
                    <th className="py-2.5 px-3 sm:px-4">{isIndividual ? 'Ödülü Kazanan Oyuncu' : 'Şampiyon / Kazanan'}</th>
                    <th className="py-2.5 px-3 sm:px-4 text-right w-24 sm:w-32">Ülke</th>
                    {currentUser?.admin && <th className="py-2.5 px-2 w-10 text-center"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-xs">
                  {filteredWinners.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-50 transition-colors group">
                      {/* Season Column (e.g. 24/25) */}
                      <td className="py-2.5 px-3 sm:px-4 font-black text-[#0284c7] hover:underline cursor-pointer">
                        {w.season}
                      </td>

                      {/* Winner Column (Logo + Name) */}
                      <td className="py-2.5 px-3 sm:px-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img 
                            src={w.photo || 'https://via.placeholder.com/32?text=🏆'} 
                            alt={w.winnerName}
                            className={`w-7 h-7 sm:w-8 sm:h-8 ${w.winnerType === 'team' ? 'rounded-full' : 'rounded-lg'} object-cover border border-slate-300 bg-white shrink-0 shadow-xs`}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(w.winnerName)}&background=1b365d&color=fff`;
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <span 
                              onClick={() => {
                                if (onNavigate) {
                                  onClose();
                                  if (w.winnerType === 'player') {
                                    onNavigate({ type: 'player-profile', playerName: w.winnerName });
                                  } else {
                                    onNavigate({ type: 'team-detail', teamName: w.winnerName });
                                  }
                                }
                              }}
                              className="font-extrabold text-slate-800 uppercase truncate block hover:text-[#0284c7] cursor-pointer"
                            >
                              {w.winnerName}
                            </span>
                            {!isIndividual && (
                              <span className="text-[9px] font-bold text-slate-400 uppercase block">
                                {w.winnerType === 'player' ? '👤 Oyuncu' : '🛡️ Takım'}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Country Flag & Name Column */}
                      <td className="py-2.5 px-3 sm:px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-[10px] font-bold text-slate-600 uppercase truncate hidden sm:inline">
                            {w.countryName || '-'}
                          </span>
                          {w.countryFlag ? (
                            <img 
                              src={w.countryFlag} 
                              alt={w.countryName || 'Bayrak'} 
                              title={w.countryName || ''}
                              className="w-6 h-4 object-cover rounded border border-slate-300 shadow-xs shrink-0"
                            />
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400">-</span>
                          )}
                        </div>
                      </td>

                      {/* Admin Delete Action */}
                      {currentUser?.admin && (
                        <td className="py-2.5 px-2 text-center">
                          <button
                            onClick={() => handleDeleteWinner(w)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                            title="Kaydı Sil"
                          >
                            🗑️
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Admin Form Section */}
        {currentUser?.admin && (
          <div className="bg-white p-3.5 sm:p-4 border-t-2 border-slate-300 shadow-inner shrink-0 space-y-3">
            <div className="flex items-center justify-between border-b pb-1.5 border-slate-200">
              <h4 className="font-black text-xs text-[#1b365d] uppercase flex items-center gap-1.5">
                <span>⚡</span>
                <span>Yeni Şampiyon / Ödül Sahibi Ekle (Admin)</span>
              </h4>
              <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-full">
                Sene & Kazanan Kaydı
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {/* Season Selection */}
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Sezon / Sene</label>
                <div className="flex gap-1">
                  <select
                    value={inputSeason}
                    onChange={(e) => setInputSeason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 font-black text-xs text-slate-800"
                  >
                    {seasonsList.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Custom Season Text option */}
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Veya Özel Sezon</label>
                <input
                  type="text"
                  placeholder="Örn: 24/25 veya 2025"
                  value={inputSeason}
                  onChange={(e) => setInputSeason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 font-bold text-xs"
                />
              </div>

              {/* Winner Type Selection */}
              <div className="col-span-2 sm:col-span-1">
                <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Kazanan Kategori</label>
                <div className="flex gap-1">
                  {!isIndividual && (
                    <button
                      type="button"
                      onClick={() => { setWinnerType('team'); setSelectedWinnerName(''); }}
                      className={`flex-1 py-1.5 rounded-lg font-black text-[10px] uppercase border transition-colors ${winnerType === 'team' ? 'bg-[#1b365d] text-white border-[#1b365d]' : 'bg-slate-100 text-slate-600'}`}
                    >
                      🛡️ Takım
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setWinnerType('player'); setSelectedWinnerName(''); }}
                    className={`flex-1 py-1.5 rounded-lg font-black text-[10px] uppercase border transition-colors ${winnerType === 'player' ? 'bg-[#1b365d] text-white border-[#1b365d]' : 'bg-slate-100 text-slate-600'}`}
                  >
                    👤 Oyuncu
                  </button>
                </div>
              </div>
            </div>

            {/* Winner Selection Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">
                  Listeden {winnerType === 'player' ? 'Oyuncu' : 'Takım'} Seç
                </label>
                <select
                  value={selectedWinnerName}
                  onChange={(e) => { setSelectedWinnerName(e.target.value); setCustomWinnerName(''); }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 font-extrabold text-xs text-slate-800"
                >
                  <option value="">-- {winnerType === 'player' ? 'Oyuncu Seçin' : 'Takım Seçin'} --</option>
                  {winnerType === 'player' ? (
                    playersList.map((item) => (
                      <option key={item.id} value={item.player.pname}>
                        {item.player.pname} ({item.player.pteam || 'Takımsız'})
                      </option>
                    ))
                  ) : (
                    teamsList.map((item) => (
                      <option key={item.id} value={item.team.name || item.id}>
                        {item.team.name || item.id}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">
                  Veya Yeni İsim Yazın
                </label>
                <input
                  type="text"
                  placeholder={winnerType === 'player' ? 'Örn: Real Madrid' : 'Örn: Real Madrid'}
                  value={customWinnerName}
                  onChange={(e) => { setCustomWinnerName(e.target.value); setSelectedWinnerName(''); }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 font-bold text-xs"
                />
              </div>
            </div>

            <button
              onClick={handleSaveWinner}
              disabled={saving}
              className="w-full py-2 bg-[#1b365d] hover:bg-[#12243f] text-white font-black text-xs uppercase rounded-xl border border-[#1b365d] shadow-md cursor-pointer transition-transform hover:scale-[1.005] disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor...' : `🏆 ${inputSeason} SEZONU KAZANANINI KAYDET`}
            </button>
          </div>
        )}

        {/* Footer Close */}
        <div className="p-3 bg-slate-100 border-t border-slate-200 text-right shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-xl text-xs font-black text-slate-700 bg-slate-200 hover:bg-slate-300 cursor-pointer uppercase transition-colors"
          >
            Kapat
          </button>
        </div>

      </div>
    </div>
  );
}
