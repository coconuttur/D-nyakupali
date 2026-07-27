import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, doc, setDoc, deleteDoc, getDocs, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { TROPHY_MAP } from '../lib/trophies';
import { UserProfile, Player, Team } from '../types';

export interface TrophyWinner {
  id: string; // doc id e.g. "ballondor_24_25_messi"
  trophyId: string;
  season: string; // e.g. "24/25" or "2025"
  year: number; // for sorting
  winnerName: string;
  winnerType: 'player' | 'team';
  photo?: string;
  countryName?: string;
  countryFlag?: string;
}

interface TrophyDetailViewProps {
  trophyId: string;
  currentUser: UserProfile | null;
  onBack: () => void;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
}

export function TrophyDetailView({ trophyId, currentUser, onBack, onNavigate, teamLogos }: TrophyDetailViewProps) {
  const [winners, setWinners] = useState<TrophyWinner[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'team' | 'player'>('all');

  // Admin form state
  const [inputSeason, setInputSeason] = useState<string>('24/25');
  const [winnerType, setWinnerType] = useState<'player' | 'team'>('team');
  const [selectedWinnerName, setSelectedWinnerName] = useState<string>('');
  const [customWinnerName, setCustomWinnerName] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Data lists for selection
  const [playersList, setPlayersList] = useState<{ id: string; player: Player }[]>([]);
  const [teamsList, setTeamsList] = useState<{ id: string; team: Team }[]>([]);

  const isIndividual = ['ballondor', 'golden_boy', 'fairplay', 'puskas'].includes(trophyId);

  useEffect(() => {
    if (isIndividual) {
      setWinnerType('player');
    } else {
      setWinnerType('team');
    }
  }, [trophyId, isIndividual]);

  useEffect(() => {
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
  }, [trophyId]);

  useEffect(() => {
    if (!currentUser?.admin) return;

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
  }, [currentUser]);

  const trophyInfo = TROPHY_MAP[trophyId] || {
    id: trophyId,
    name: trophyId.toUpperCase(),
    icon: 'https://via.placeholder.com/120?text=🏆'
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
        if (!photo && teamLogos[winnerName]) {
          photo = teamLogos[winnerName];
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
          : 'https://via.placeholder.com/80?text=🏆'),
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
          const tSnap = await getDoc(tRef);
          if (tSnap.exists()) {
            const tData = tSnap.data() as Team;
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

      alert('Kayıt başarıyla silindi.');
    } catch (e) {
      console.error(e);
      alert('Silme işleminde hata oluştu: ' + (e instanceof Error ? e.message : String(e)));
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
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-12 select-text">
      
      {/* Top Navigation Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="bg-brand-card hover:bg-brand-maroon hover:text-white text-brand-maroon font-black text-xs md:text-sm px-5 py-2.5 rounded-2xl border-2 border-brand-maroon/30 shadow-sm flex items-center gap-2 transition-all cursor-pointer uppercase"
        >
          <span>←</span>
          <span>Geri Dön</span>
        </button>

        <span className="text-xs font-black uppercase text-brand-maroon tracking-wider bg-brand-gold/20 px-3 py-1 rounded-full border border-brand-gold/40">
          🏆 Kupa Arşivi & Şampiyonlar Geçmişi
        </span>
      </div>

      {/* Main Hero Card for Trophy */}
      <div className="bg-gradient-to-br from-brand-maroon via-[#6b0000] to-brand-maroon text-white p-6 sm:p-8 rounded-3xl border-4 border-brand-gold shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center gap-6 sm:gap-8">
        
        {/* Large Trophy Emblem */}
        <div className="relative shrink-0 group">
          <div className="absolute inset-0 bg-brand-gold/20 blur-xl rounded-full transform group-hover:scale-125 transition-transform"></div>
          <img 
            src={trophyInfo.icon} 
            alt={trophyInfo.name} 
            className="h-28 sm:h-36 md:h-44 w-auto object-contain relative z-10 filter drop-shadow-2xl bg-white/10 p-2 sm:p-3 rounded-2xl border-2 border-brand-gold/40"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/120?text=🏆';
            }}
          />
        </div>

        {/* Title & Stats Meta */}
        <div className="flex-1 text-center md:text-left space-y-2.5">
          <div className="inline-flex items-center gap-2 bg-brand-gold text-brand-maroon px-3 py-1 rounded-full font-black text-[11px] uppercase tracking-widest shadow-sm">
            <span>{isIndividual ? '⭐ BİREYSEL OYUNCU ÖDÜLÜ' : '🏆 RESMİ KUPA MÜCADELESİ'}</span>
          </div>

          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black uppercase tracking-tight text-brand-gold drop-shadow-sm">
            {trophyInfo.name}
          </h1>

          <p className="text-xs sm:text-sm font-bold text-amber-100/90 max-w-2xl">
            Tüm sezonların kayıtlı şampiyonluk listesi, kazanan takımlar ve ödülü kazanan oyuncuların detaylı Transfermarkt stili geçmişi.
          </p>

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
            <div className="bg-black/30 border border-white/10 px-4 py-1.5 rounded-xl text-center">
              <span className="text-[10px] font-bold text-amber-300 uppercase block">Toplam Şampiyonluk Kaydı</span>
              <span className="text-lg font-black text-white">{winners.length} Sezon</span>
            </div>
            {!isIndividual && (
              <div className="bg-black/30 border border-white/10 px-4 py-1.5 rounded-xl text-center">
                <span className="text-[10px] font-bold text-amber-300 uppercase block">Kazanmış Takımlar</span>
                <span className="text-lg font-black text-white">
                  {new Set(winners.filter(w => w.winnerType === 'team').map(w => w.winnerName)).size} Takım
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter Bar (If team trophy, allow filtering by Team or Player) */}
      {!isIndividual && (
        <div className="bg-brand-card p-3 rounded-2xl border-2 border-brand-maroon/20 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <span className="text-brand-dark font-black uppercase text-xs tracking-wider flex items-center gap-2">
            <span>🎯</span>
            <span>Kategori Filtresi:</span>
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`px-4 py-2 rounded-xl font-black text-xs uppercase transition-all ${filterType === 'all' ? 'bg-brand-maroon text-brand-gold shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Tümü ({winners.length})
            </button>
            <button
              onClick={() => setFilterType('team')}
              className={`px-4 py-2 rounded-xl font-black text-xs uppercase transition-all ${filterType === 'team' ? 'bg-brand-maroon text-brand-gold shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              🛡️ Takımlar ({winners.filter(w => w.winnerType === 'team').length})
            </button>
            <button
              onClick={() => setFilterType('player')}
              className={`px-4 py-2 rounded-xl font-black text-xs uppercase transition-all ${filterType === 'player' ? 'bg-brand-maroon text-brand-gold shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              👤 Oyuncular ({winners.filter(w => w.winnerType === 'player').length})
            </button>
          </div>
        </div>
      )}

      {/* Transfermarkt Style Modern Winners Table */}
      <div className="bg-brand-card rounded-3xl border-2 border-brand-maroon/30 shadow-md overflow-hidden">
        <div className="bg-brand-maroon px-6 py-4 flex items-center justify-between border-b-2 border-brand-gold">
          <h3 className="font-black text-base sm:text-lg text-brand-gold uppercase tracking-wider flex items-center gap-2">
            <span>📜</span>
            <span>Sezon Sezon Kazananlar Geçmişi</span>
          </h3>
          <span className="text-xs font-bold text-amber-200">
            {filteredWinners.length} Kayıt
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-brand-dark font-bold">
            <div className="inline-block animate-spin text-3xl mb-2">⚽</div>
            <p className="text-sm">Kupa geçmişi yükleniyor...</p>
          </div>
        ) : filteredWinners.length === 0 ? (
          <div className="text-center py-16 px-4 bg-white/60">
            <span className="text-5xl block mb-3">🏆</span>
            <h4 className="font-black text-base text-brand-dark uppercase">Kayıt Bulunamadı</h4>
            <p className="text-xs font-bold text-gray-500 mt-1 max-w-sm mx-auto">
              Henüz bu kupa için verilmiş bir şampiyonluk kaydı girilmemiş. Admin paneli üzerinden sezon seçip yeni kazanan ekleyebilirsiniz.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#e8e2d2] text-brand-dark text-xs font-black uppercase tracking-wider border-b-2 border-brand-maroon/20">
                  <th className="py-3.5 px-4 sm:px-6 w-28">Sezon</th>
                  <th className="py-3.5 px-4 sm:px-6">{isIndividual ? 'Ödülü Kazanan Oyuncu' : 'Şampiyon / Kazanan'}</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right w-36 sm:w-48">Ülke / Bayrak</th>
                  {currentUser?.admin && <th className="py-3.5 px-4 w-12 text-center">İşlem</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-maroon/10 text-sm font-semibold">
                {filteredWinners.map((w) => (
                  <tr key={w.id} className="hover:bg-brand-gold/10 transition-colors">
                    
                    {/* Season Column (e.g. 24/25) */}
                    <td className="py-3.5 px-4 sm:px-6 font-black text-brand-maroon text-sm md:text-base">
                      {w.season}
                    </td>

                    {/* Winner Column (Logo/Photo + Name) */}
                    <td className="py-3.5 px-4 sm:px-6">
                      <div className="flex items-center gap-3">
                        <img 
                          src={w.photo || 'https://via.placeholder.com/48?text=🏆'} 
                          alt={w.winnerName}
                          className={`w-10 h-10 sm:w-12 sm:h-12 ${w.winnerType === 'team' ? 'rounded-full' : 'rounded-xl'} object-cover border-2 border-brand-maroon/30 bg-white shadow-sm shrink-0 cursor-pointer hover:scale-110 transition-transform`}
                          onClick={() => {
                            if (w.winnerType === 'player') {
                              onNavigate({ type: 'player-profile', playerName: w.winnerName });
                            } else {
                              onNavigate({ type: 'team-detail', teamName: w.winnerName });
                            }
                          }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(w.winnerName)}&background=800000&color=fff`;
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <span 
                            onClick={() => {
                              if (w.winnerType === 'player') {
                                onNavigate({ type: 'player-profile', playerName: w.winnerName });
                              } else {
                                onNavigate({ type: 'team-detail', teamName: w.winnerName });
                              }
                            }}
                            className="font-black text-sm sm:text-base text-brand-dark uppercase truncate block hover:text-brand-maroon hover:underline cursor-pointer"
                          >
                            {w.winnerName}
                          </span>
                          {!isIndividual && (
                            <span className="text-[10px] font-extrabold text-gray-500 uppercase block">
                              {w.winnerType === 'player' ? '👤 Oyuncu' : '🛡️ Takım'}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Country Flag & Name Column */}
                    <td className="py-3.5 px-4 sm:px-6 text-right">
                      <div className="flex items-center justify-end gap-2.5">
                        <span className="text-xs font-extrabold text-brand-dark uppercase truncate hidden sm:inline">
                          {w.countryName || '-'}
                        </span>
                        {w.countryFlag ? (
                          <img 
                            src={w.countryFlag} 
                            alt={w.countryName || 'Bayrak'} 
                            title={w.countryName || ''}
                            className="w-7 h-5 object-cover rounded border border-gray-300 shadow-xs shrink-0"
                          />
                        ) : (
                          <span className="text-xs font-extrabold text-gray-400">-</span>
                        )}
                      </div>
                    </td>

                    {/* Admin Delete Action */}
                    {currentUser?.admin && (
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleDeleteWinner(w)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
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

      {/* Admin Form Panel */}
      {currentUser?.admin && (
        <div className="bg-brand-card p-5 sm:p-6 rounded-3xl border-2 border-brand-maroon/30 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b-2 border-brand-maroon/20 pb-3">
            <h4 className="font-black text-sm sm:text-base text-brand-maroon uppercase flex items-center gap-2">
              <span>⚡</span>
              <span>Yeni Şampiyon / Ödül Sahibi Ekle (Admin Paneli)</span>
            </h4>
            <span className="text-xs font-black text-brand-maroon bg-brand-gold/30 px-3 py-1 rounded-full border border-brand-gold">
              Sezon & Kazanan Kaydı
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Season Selection */}
            <div>
              <label className="text-xs font-black text-brand-dark uppercase block mb-1">Sezon / Sene Seçin</label>
              <select
                value={inputSeason}
                onChange={(e) => setInputSeason(e.target.value)}
                className="w-full bg-white border-2 border-brand-maroon/30 rounded-xl p-2.5 font-black text-xs sm:text-sm text-brand-dark"
              >
                {seasonsList.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Custom Season Text option */}
            <div>
              <label className="text-xs font-black text-brand-dark uppercase block mb-1">Veya Özel Sezon Yazın</label>
              <input
                type="text"
                placeholder="Örn: 24/25 veya 2025"
                value={inputSeason}
                onChange={(e) => setInputSeason(e.target.value)}
                className="w-full bg-white border-2 border-brand-maroon/30 rounded-xl p-2.5 font-bold text-xs sm:text-sm"
              />
            </div>

            {/* Winner Type Selection */}
            <div>
              <label className="text-xs font-black text-brand-dark uppercase block mb-1">Kazanan Kategori</label>
              <div className="flex gap-1.5 h-10">
                {!isIndividual && (
                  <button
                    type="button"
                    onClick={() => { setWinnerType('team'); setSelectedWinnerName(''); }}
                    className={`flex-1 py-1 rounded-xl font-black text-xs uppercase border-2 transition-all ${winnerType === 'team' ? 'bg-brand-maroon text-brand-gold border-brand-maroon shadow-md' : 'bg-white text-gray-700 border-gray-300'}`}
                  >
                    🛡️ Takım
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setWinnerType('player'); setSelectedWinnerName(''); }}
                  className={`flex-1 py-1 rounded-xl font-black text-xs uppercase border-2 transition-all ${winnerType === 'player' ? 'bg-brand-maroon text-brand-gold border-brand-maroon shadow-md' : 'bg-white text-gray-700 border-gray-300'}`}
                >
                  👤 Oyuncu
                </button>
              </div>
            </div>
          </div>

          {/* Winner Selection Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-black text-brand-dark uppercase block mb-1">
                Listeden {winnerType === 'player' ? 'Oyuncu' : 'Takım'} Seçin
              </label>
              <select
                value={selectedWinnerName}
                onChange={(e) => { setSelectedWinnerName(e.target.value); setCustomWinnerName(''); }}
                className="w-full bg-white border-2 border-brand-maroon/30 rounded-xl p-2.5 font-black text-xs sm:text-sm text-brand-dark"
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
              <label className="text-xs font-black text-brand-dark uppercase block mb-1">
                Veya Yeni İsim Yazın
              </label>
              <input
                type="text"
                placeholder={winnerType === 'player' ? 'Örn: Lionel Messi' : 'Örn: Real Madrid'}
                value={customWinnerName}
                onChange={(e) => { setCustomWinnerName(e.target.value); setSelectedWinnerName(''); }}
                className="w-full bg-white border-2 border-brand-maroon/30 rounded-xl p-2.5 font-bold text-xs sm:text-sm"
              />
            </div>
          </div>

          <button
            onClick={handleSaveWinner}
            disabled={saving}
            className="w-full py-3 bg-brand-maroon hover:bg-[#5c0101] text-brand-gold font-black text-xs sm:text-sm uppercase rounded-2xl border-2 border-brand-gold shadow-md cursor-pointer transition-transform hover:scale-[1.005] disabled:opacity-50"
          >
            {saving ? 'Kaydediliyor...' : `🏆 ${inputSeason} SEZONU KAZANANINI KAYDET`}
          </button>
        </div>
      )}

    </div>
  );
}
