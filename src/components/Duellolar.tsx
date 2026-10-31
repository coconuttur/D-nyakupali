import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { collection, onSnapshot, setDoc, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Player, DuelMatch, DuelPlayerStanding, UserProfile } from '../types';
import {
  calculateAllDuelElo,
  DuelPlayerEloStanding,
  DuelEloMatchDelta,
  INITIAL_DUEL_ELO
} from '../lib/duelElo';

interface DuellolarProps {
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
  currentUser?: UserProfile | null;
}

const LOCAL_DUELS_KEY = 'bobblekolik_friendly_duels';

const getStoredDuels = (): DuelMatch[] => {
  try {
    const raw = localStorage.getItem(LOCAL_DUELS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const saveStoredDuels = (duels: DuelMatch[]) => {
  try {
    localStorage.setItem(LOCAL_DUELS_KEY, JSON.stringify(duels));
  } catch (e) {
    console.error('Failed to save duels to localStorage', e);
  }
};

export default function Duellolar({
  currentLang,
  translations,
  onNavigate,
  teamLogos,
  currentUser
}: DuellolarProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [duels, setDuels] = useState<DuelMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Tab: Standings (Lig Puan Durumu) vs ELO (1v1 ELO Sıralaması)
  const [activeTab, setActiveTab] = useState<'standings' | 'elo'>('standings');

  // Search / Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyPlayed, setOnlyPlayed] = useState(true);

  // Add duel form state
  const [matchNumber, setMatchNumber] = useState<string>('');
  const [userHasCustomMatchNumber, setUserHasCustomMatchNumber] = useState(false);
  const [player1Name, setPlayer1Name] = useState('');
  const [player2Name, setPlayer2Name] = useState('');
  const [score1, setScore1] = useState('0');
  const [score2, setScore2] = useState('0');
  const [duelDate, setDuelDate] = useState('');
  const [savingDuel, setSavingDuel] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Edit duel modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingDuel, setEditingDuel] = useState<DuelMatch | null>(null);
  const [editMatchNumber, setEditMatchNumber] = useState<string>('');
  const [editPlayer1Name, setEditPlayer1Name] = useState('');
  const [editPlayer2Name, setEditPlayer2Name] = useState('');
  const [editScore1, setEditScore1] = useState('0');
  const [editScore2, setEditScore2] = useState('0');
  const [editDuelDate, setEditDuelDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Check admin status securely
  useEffect(() => {
    if (currentUser?.admin === true) {
      setIsAdmin(true);
    } else if (currentUser?.uid) {
      getDoc(doc(db, 'users', currentUser.uid)).then((docSnap) => {
        if (docSnap.exists() && docSnap.data().admin === true) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      }).catch(() => setIsAdmin(false));
    } else if (auth.currentUser?.uid) {
      getDoc(doc(db, 'users', auth.currentUser.uid)).then((docSnap) => {
        if (docSnap.exists() && docSnap.data().admin === true) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      }).catch(() => setIsAdmin(false));
    } else {
      setIsAdmin(false);
    }
  }, [currentUser]);

  useEffect(() => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    setDuelDate(`${day}.${month}.${year}`);
  }, []);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // 1. Fetch all players
  useEffect(() => {
    const unsubPlayers = onSnapshot(collection(db, 'players'), (snap) => {
      const list: Player[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, docId: d.id, ...d.data() } as Player);
      });
      list.sort((a, b) => a.pname.localeCompare(b.pname, 'tr'));
      setPlayers(list);
    });

    return () => unsubPlayers();
  }, []);

  // 2. Fetch duels from Firestore and merge with localStorage
  useEffect(() => {
    const local = getStoredDuels();
    if (local.length > 0) {
      setDuels(local);
    }

    const unsubDuels = onSnapshot(collection(db, 'duels'), (snap) => {
      const list: DuelMatch[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as DuelMatch);
      });

      const localStored = getStoredDuels();
      const map = new Map<string, DuelMatch>();
      list.forEach((m) => map.set(m.id, m));
      localStored.forEach((m) => {
        if (!map.has(m.id)) {
          map.set(m.id, m);
        }
      });

      const merged = Array.from(map.values());
      merged.sort((a, b) => (Number(b.datejav) || 0) - (Number(a.datejav) || 0));
      setDuels(merged);
      saveStoredDuels(merged);
      setLoading(false);
    });

    return () => unsubDuels();
  }, []);

  // Pre-select default players once players load
  useEffect(() => {
    if (players.length > 0) {
      if (!player1Name) setPlayer1Name(players[0].pname);
      if (!player2Name) setPlayer2Name(players.length > 1 ? players[1].pname : players[0].pname);
    }
  }, [players]);

  // Map player name to player info
  const playerMap = useMemo(() => {
    const map = new Map<string, Player>();
    players.forEach((p) => {
      map.set(p.pname.toLowerCase().trim(), p);
      if (p.docId) map.set(p.docId.toLowerCase().trim(), p);
      if (p.id) map.set(p.id.toLowerCase().trim(), p);
    });
    return map;
  }, [players]);

  // Compute standings strictly from duels (completely isolated from normal league!)
  const standings = useMemo(() => {
    const statsMap = new Map<string, DuelPlayerStanding>();

    // Initialize stats for ALL players
    players.forEach((p) => {
      const key = p.pname.trim();
      statsMap.set(key, {
        playerId: p.docId || p.id || p.pname,
        playerName: p.pname,
        playerPhoto: p.foto || '',
        playerTeam: p.pteam || 'Serbest',
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0
      });
    });

    // Process all duels
    duels.forEach((d) => {
      const p1Key = d.player1Name.trim();
      const p2Key = d.player2Name.trim();

      if (!statsMap.has(p1Key)) {
        statsMap.set(p1Key, {
          playerId: d.player1Id || p1Key,
          playerName: d.player1Name,
          playerPhoto: d.player1Photo || '',
          playerTeam: d.player1Team || 'Serbest',
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0
        });
      }

      if (!statsMap.has(p2Key)) {
        statsMap.set(p2Key, {
          playerId: d.player2Id || p2Key,
          playerName: d.player2Name,
          playerPhoto: d.player2Photo || '',
          playerTeam: d.player2Team || 'Serbest',
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0
        });
      }

      const s1 = statsMap.get(p1Key)!;
      const s2 = statsMap.get(p2Key)!;

      const sc1 = Number(d.score1) || 0;
      const sc2 = Number(d.score2) || 0;

      s1.played += 1;
      s2.played += 1;

      s1.goalsFor += sc1;
      s1.goalsAgainst += sc2;
      s2.goalsFor += sc2;
      s2.goalsAgainst += sc1;

      if (sc1 > sc2) {
        s1.wins += 1;
        s1.points += 3;
        s2.losses += 1;
      } else if (sc2 > sc1) {
        s2.wins += 1;
        s2.points += 3;
        s1.losses += 1;
      } else {
        s1.draws += 1;
        s2.draws += 1;
        s1.points += 1;
        s2.points += 1;
      }

      s1.goalDifference = s1.goalsFor - s1.goalsAgainst;
      s2.goalDifference = s2.goalsFor - s2.goalsAgainst;
    });

    const list = Array.from(statsMap.values());

    list.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.playerName.localeCompare(b.playerName, 'tr');
    });

    return list;
  }, [players, duels]);

  // Calculate complete 1v1 ELO, match deltas, and player ELO standings
  const { matchDeltas, standings: eloStandings, maxMatchNumber } = useMemo(() => {
    return calculateAllDuelElo(players, duels, playerMap);
  }, [players, duels, playerMap]);

  // Auto-fill next matchNumber for convenience if user has not typed a custom number
  useEffect(() => {
    if (!userHasCustomMatchNumber) {
      setMatchNumber(String(maxMatchNumber + 1));
    }
  }, [maxMatchNumber, userHasCustomMatchNumber]);

  // Filter ELO standings based on search and played status
  const filteredEloStandings = useMemo(() => {
    let list = eloStandings;
    if (onlyPlayed) {
      list = list.filter((s) => s.played > 0);
    }
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase().trim();
    return list.filter(
      (s) =>
        s.playerName.toLowerCase().includes(term) ||
        s.playerTeam.toLowerCase().includes(term)
    );
  }, [eloStandings, searchTerm, onlyPlayed]);

  // Filter standings based on search and played status (defaults to only players with played > 0)
  const filteredStandings = useMemo(() => {
    let list = standings;
    if (onlyPlayed) {
      list = list.filter((s) => s.played > 0);
    }
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase().trim();
    return list.filter(
      (s) =>
        s.playerName.toLowerCase().includes(term) ||
        s.playerTeam.toLowerCase().includes(term)
    );
  }, [standings, searchTerm, onlyPlayed]);

  // Handle Save Duel Match (ADMIN ONLY)
  const handleSaveDuel = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAdmin) {
      alert('Yalnızca yöneticiler (admin) düello maçı ekleyebilir!');
      return;
    }

    if (!player1Name || !player2Name) {
      alert('Lütfen iki oyuncuyu da seçiniz!');
      return;
    }

    if (player1Name === player2Name) {
      alert('Aynı oyuncu kendisiyle maç yapamaz! Lütfen farklı iki oyuncu seçiniz.');
      return;
    }

    setSavingDuel(true);
    try {
      const now = Date.now();
      const docId = `duel_${now}_${Math.random().toString(36).substring(2, 7)}`;

      const p1Obj = playerMap.get(player1Name.toLowerCase().trim());
      const p2Obj = playerMap.get(player2Name.toLowerCase().trim());

      const sc1 = Math.max(0, parseInt(score1, 10) || 0);
      const sc2 = Math.max(0, parseInt(score2, 10) || 0);

      const parsedMatchNum = matchNumber.trim() ? parseInt(matchNumber.trim(), 10) : (maxMatchNumber + 1);
      const finalMatchNum = (parsedMatchNum !== undefined && !isNaN(parsedMatchNum) && parsedMatchNum > 0)
        ? parsedMatchNum
        : (maxMatchNumber + 1);

      const newDuel: DuelMatch = {
        id: docId,
        matchNumber: finalMatchNum,
        player1Id: p1Obj?.docId || p1Obj?.id || player1Name,
        player1Name: player1Name,
        player1Photo: p1Obj?.foto || '',
        player1Team: p1Obj?.pteam || '',
        player2Id: p2Obj?.docId || p2Obj?.id || player2Name,
        player2Name: player2Name,
        player2Photo: p2Obj?.foto || '',
        player2Team: p2Obj?.pteam || '',
        score1: sc1,
        score2: sc2,
        date: duelDate.trim() || new Date().toLocaleDateString('tr-TR'),
        datejav: now,
        createdAt: now
      };

      // 1. Optimistic state update
      const updatedDuels = [newDuel, ...duels];
      setDuels(updatedDuels);
      saveStoredDuels(updatedDuels);

      // 2. Sync to Firestore (collection: 'duels')
      try {
        await setDoc(doc(db, 'duels', docId), newDuel);
      } catch (fbErr: any) {
        console.warn('Firestore duels write notice (saved locally):', fbErr);
      }

      setToastMessage(`⚔️ Düello #${finalMatchNum} kaydedildi: ${player1Name} ${sc1} - ${sc2} ${player2Name}`);
      setScore1('0');
      setScore2('0');
      setUserHasCustomMatchNumber(false);
    } catch (err: any) {
      console.error('Error saving duel:', err);
      alert('Düello kaydedilirken hata: ' + (err?.message || 'Bilinmeyen hata'));
    } finally {
      setSavingDuel(false);
    }
  };

  // Open Edit Modal (ADMIN ONLY)
  const handleOpenEdit = (duel: DuelMatch) => {
    if (!isAdmin) {
      alert('Sadece yöneticiler maç düzenleyebilir!');
      return;
    }
    setEditingDuel(duel);
    setEditMatchNumber(duel.matchNumber !== undefined && duel.matchNumber !== null ? String(duel.matchNumber) : '');
    setEditPlayer1Name(duel.player1Name);
    setEditPlayer2Name(duel.player2Name);
    setEditScore1(String(duel.score1 ?? '0'));
    setEditScore2(String(duel.score2 ?? '0'));
    setEditDuelDate(duel.date || '');
    setEditModalOpen(true);
  };

  // Save Edited Duel (ADMIN ONLY)
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAdmin) {
      alert('Bu işlem için yönetici yetkisi gereklidir!');
      return;
    }

    if (!editingDuel) return;

    if (!editPlayer1Name || !editPlayer2Name) {
      alert('Lütfen iki oyuncuyu da seçiniz!');
      return;
    }

    if (editPlayer1Name === editPlayer2Name) {
      alert('Aynı oyuncu kendisiyle maç yapamaz!');
      return;
    }

    setSavingEdit(true);
    try {
      const p1Obj = playerMap.get(editPlayer1Name.toLowerCase().trim());
      const p2Obj = playerMap.get(editPlayer2Name.toLowerCase().trim());

      const sc1 = Math.max(0, parseInt(editScore1, 10) || 0);
      const sc2 = Math.max(0, parseInt(editScore2, 10) || 0);

      const parsedEditNum = editMatchNumber.trim() ? parseInt(editMatchNumber.trim(), 10) : undefined;
      const finalEditNum = (parsedEditNum !== undefined && !isNaN(parsedEditNum) && parsedEditNum > 0)
        ? parsedEditNum
        : undefined;

      const updatedDuel: DuelMatch = {
        ...editingDuel,
        matchNumber: finalEditNum,
        player1Id: p1Obj?.docId || p1Obj?.id || editPlayer1Name,
        player1Name: editPlayer1Name,
        player1Photo: p1Obj?.foto || editingDuel.player1Photo || '',
        player1Team: p1Obj?.pteam || editingDuel.player1Team || '',
        player2Id: p2Obj?.docId || p2Obj?.id || editPlayer2Name,
        player2Name: editPlayer2Name,
        player2Photo: p2Obj?.foto || editingDuel.player2Photo || '',
        player2Team: p2Obj?.pteam || editingDuel.player2Team || '',
        score1: sc1,
        score2: sc2,
        date: editDuelDate.trim() || editingDuel.date || new Date().toLocaleDateString('tr-TR')
      };

      const updatedList = duels.map((d) => (d.id === editingDuel.id ? updatedDuel : d));
      setDuels(updatedList);
      saveStoredDuels(updatedList);

      try {
        await setDoc(doc(db, 'duels', editingDuel.id), updatedDuel, { merge: true });
      } catch (fbErr: any) {
        console.warn('Firestore duels update notice (saved locally):', fbErr);
      }

      setEditModalOpen(false);
      setEditingDuel(null);
      setToastMessage(`✏️ Düello güncellendi: ${editPlayer1Name} ${sc1} - ${sc2} ${editPlayer2Name}`);
    } catch (err: any) {
      console.error('Error updating duel:', err);
      alert('Düello güncellenirken hata: ' + (err?.message || 'Bilinmeyen hata'));
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle Delete Duel (ADMIN ONLY)
  const handleDeleteDuel = async (duelId: string) => {
    if (!isAdmin) {
      alert('Yalnızca yöneticiler (admin) maç silebilir!');
      return;
    }

    if (!window.confirm('Bu düello maçını silmek istediğinizden emin misiniz? Puan tablosu otomatik güncellenecektir.')) {
      return;
    }

    try {
      const updated = duels.filter((d) => d.id !== duelId);
      setDuels(updated);
      saveStoredDuels(updated);

      try {
        await deleteDoc(doc(db, 'duels', duelId));
      } catch (fbErr: any) {
        console.warn('Firestore duel delete notice:', fbErr);
      }

      setToastMessage('🗑️ Düello maçı silindi ve tablo güncellendi.');
    } catch (err: any) {
      console.error('Error deleting duel:', err);
    }
  };

  // Smooth scroll handler for adding duels
  const handleScrollToAddDuel = () => {
    const el = document.getElementById('add-duel-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const recent = document.getElementById('recent-duels-section');
      if (recent) {
        recent.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }
    }
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[999999] bg-brand-dark text-brand-gold border-2 border-brand-gold px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-fade-in font-black text-xs md:text-sm">
          <span>⚔️</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-brand-maroon via-[#5c0101] to-[#2b0000] text-white rounded-3xl p-6 md:p-8 shadow-xl border-b-8 border-brand-gold relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-64 h-64 bg-brand-gold/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-brand-gold text-brand-dark px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider mb-2">
              <span>⚔️</span>
              <span>Dostluk & Bireysel Lig</span>
              {isAdmin && (
                <span className="bg-brand-maroon text-brand-gold px-2 py-0.2 rounded-full text-[9px] font-black">
                  🛡️ Admin Yetkisi Aktif
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-wide uppercase">
              OYUNCU DÜELLOLARI
            </h1>
            <p className="text-xs md:text-sm text-brand-cream/80 font-medium max-w-2xl mt-1">
              Tüm oyuncuların birbirleriyle yaptığı bireysel düello (friendly) lig tablosu.
              Burada oynanan maçlar normal lig puan durumunu, takım ve oyuncu istatistiklerini kesinlikle etkilemez.
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-3">
            {isAdmin ? (
              <button
                type="button"
                onClick={handleScrollToAddDuel}
                className="bg-brand-gold hover:bg-white text-brand-dark px-5 py-3 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all shadow-md hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                <span>➕</span>
                <span>Yeni Düello Ekle</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('recent-duels-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="bg-black/40 hover:bg-black/60 text-brand-gold border border-brand-gold/40 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                title="Son oynanan düelloları inceleyin"
              >
                <span>⚔️</span>
                <span>Düello Maçları</span>
              </button>
            )}
          </div>
        </div>

        {/* Rules Pill */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center gap-4 text-[11px] font-black text-brand-gold">
          {activeTab === 'standings' ? (
            <>
              <span className="flex items-center gap-1.5 bg-black/30 px-3 py-1 rounded-xl">
                <span>🏆</span> Galibiyet: 3 Puan
              </span>
              <span className="flex items-center gap-1.5 bg-black/30 px-3 py-1 rounded-xl">
                <span>⚖️</span> Beraberlik: 1 Puan
              </span>
              <span className="flex items-center gap-1.5 bg-black/30 px-3 py-1 rounded-xl">
                <span>❌</span> Mağlubiyet: 0 Puan
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 bg-black/30 px-3 py-1 rounded-xl">
                <span>⚡</span> Başlangıç: 100 ELO
              </span>
              <span className="flex items-center gap-1.5 bg-black/30 px-3 py-1 rounded-xl">
                <span>♟️</span> Dengeli Maç: ±8 ELO (Beraberlikte 0)
              </span>
              <span className="flex items-center gap-1.5 bg-black/30 px-3 py-1 rounded-xl">
                <span>📈</span> ELO Farkına Göre Dinamik Değişim
              </span>
            </>
          )}
          <span className="flex items-center gap-1.5 bg-black/30 px-3 py-1 rounded-xl text-brand-cream">
            <span>📊</span> Toplam Düello: {duels.length} Maç
          </span>
        </div>
      </div>

      {/* Tab Switcher: Düello Ligi vs 1v1 ELO Sıralaması */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setActiveTab('standings')}
          className={`py-3 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all duration-150 cursor-pointer border-2 flex items-center gap-2 ${
            activeTab === 'standings'
              ? 'bg-brand-maroon text-white border-[#5c0101] shadow-[0_4px_0_0_#5c0101] translate-y-0.5'
              : 'bg-[#d7cdb7] text-brand-maroon border-brand-maroon shadow-[0_4px_0_0_#800000] hover:bg-[#c9bea9] active:translate-y-0.5'
          }`}
        >
          <span>🏆</span>
          <span>DÜELLO LİGİ (PUAN DURUMU)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('elo')}
          className={`py-3 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all duration-150 cursor-pointer border-2 flex items-center gap-2 ${
            activeTab === 'elo'
              ? 'bg-brand-maroon text-white border-[#5c0101] shadow-[0_4px_0_0_#5c0101] translate-y-0.5'
              : 'bg-[#d7cdb7] text-brand-maroon border-brand-maroon shadow-[0_4px_0_0_#800000] hover:bg-[#c9bea9] active:translate-y-0.5'
          }`}
        >
          <span>⚡</span>
          <span>1v1 ELO SIRALAMASI</span>
          <span className="bg-brand-gold text-brand-dark px-1.5 py-0.2 rounded-full text-[9px] font-black">
            CHESS.COM
          </span>
        </button>
      </div>

      {/* Standings Table Card */}
      {activeTab === 'standings' && (
      <div className="bg-brand-card rounded-3xl overflow-hidden border-b-8 border-brand-maroon shadow-md animate-fade-in">
        {/* Table Controls (Search, Only Played Toggle & Counter) */}
        <div className="p-4 bg-brand-maroon/5 border-b border-brand-maroon/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-brand-maroon font-black text-xs md:text-sm uppercase tracking-wide">
            <span>📋</span>
            <span>
              DÜELLO PUAN DURUMU ({filteredStandings.length} {onlyPlayed ? 'Maç Yapan Oyuncu' : 'Oyuncu'})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Toggle: Sadece Oynayanları Göster */}
            <button
              type="button"
              onClick={() => setOnlyPlayed(!onlyPlayed)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 border cursor-pointer ${
                onlyPlayed
                  ? 'bg-brand-maroon text-brand-gold border-brand-maroon shadow-xs'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
              title="Sadece maç yapmış oyuncuları göster / gizle"
            >
              <span>{onlyPlayed ? '✓' : '○'}</span>
              <span>Sadece Oynayanlar ({standings.filter((s) => s.played > 0).length})</span>
            </button>

            <div className="relative w-full sm:w-60">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Oyuncu veya takım ara..."
                className="w-full bg-white border border-gray-300 rounded-xl px-3 py-1.5 pl-8 text-xs font-bold text-brand-dark focus:outline-none focus:border-brand-maroon"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-maroon text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center p-12 text-brand-maroon font-black text-sm">
            Yükleniyor...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-brand-dark border-collapse">
              <thead>
                <tr className="bg-brand-maroon text-brand-gold border-b-2 border-brand-gold text-[11px] font-black uppercase tracking-wider">
                  <th className="py-4 px-3 text-center w-14">#</th>
                  <th className="py-4 px-4 text-left">OYUNCU</th>
                  <th className="py-4 px-3 text-center">O</th>
                  <th className="py-4 px-3 text-center">G</th>
                  <th className="py-4 px-3 text-center">B</th>
                  <th className="py-4 px-3 text-center">M</th>
                  <th className="py-4 px-3 text-center">AG</th>
                  <th className="py-4 px-3 text-center">YG</th>
                  <th className="py-4 px-3 text-center">AV</th>
                  <th className="py-4 px-4 text-center w-20">P</th>
                </tr>
              </thead>
              <tbody>
                {filteredStandings.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-gray-500 font-bold text-xs">
                      {searchTerm ? (
                        'Aramanıza uygun oyuncu bulunamadı.'
                      ) : onlyPlayed ? (
                        <div className="flex flex-col items-center justify-center gap-2 p-4">
                          <span className="text-3xl">⚔️</span>
                          <span className="font-black text-sm text-brand-maroon">
                            Henüz maç yapmış oyuncu bulunmuyor.
                          </span>
                          <p className="text-gray-500 max-w-md text-xs">
                            {isAdmin
                              ? 'Aşağıdaki "Yeni Düello Maçı Ekle" formundan ilk dostluk maçını eklediğinizde puan durumu otomatik olarak oluşacaktır.'
                              : 'Yöneticiler düello maçı eklediğinde puan tablosu burada listelenecektir.'}
                          </p>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={handleScrollToAddDuel}
                              className="mt-2 bg-brand-gold text-brand-dark px-4 py-2 rounded-xl text-xs font-black shadow-xs hover:bg-white transition-all cursor-pointer"
                            >
                              ➕ İlk Düelloyu Ekle
                            </button>
                          )}
                        </div>
                      ) : (
                        'Henüz hiç oyuncu kaydı bulunmuyor.'
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredStandings.map((st, i) => {
                    const av = st.goalDifference;
                    const avColor = av > 0 ? 'text-green-600' : av < 0 ? 'text-red-600' : 'text-gray-500';

                    let rankBadge = (
                      <span className="font-black text-brand-maroon text-base">{i + 1}</span>
                    );
                    let borderClass = 'border-l-[6px] border-l-transparent';

                    if (i === 0 && st.played > 0) {
                      borderClass = 'border-l-[6px] border-l-brand-gold bg-amber-50/40';
                      rankBadge = (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-gold text-brand-dark font-black text-xs shadow-xs">
                          👑 1
                        </span>
                      );
                    } else if (i === 1 && st.played > 0) {
                      borderClass = 'border-l-[6px] border-l-gray-300';
                      rankBadge = (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 text-gray-800 font-black text-xs shadow-xs">
                          2
                        </span>
                      );
                    } else if (i === 2 && st.played > 0) {
                      borderClass = 'border-l-[6px] border-l-amber-600/40';
                      rankBadge = (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-900 font-black text-xs shadow-xs">
                          3
                        </span>
                      );
                    }

                    return (
                      <tr
                        key={st.playerName}
                        onClick={() =>
                          onNavigate({
                            type: 'player-profile',
                            playerName: st.playerName,
                            playerId: st.playerId
                          })
                        }
                        className={`border-b border-brand-cream hover:bg-brand-cream/50 cursor-pointer transition-colors ${borderClass}`}
                      >
                        <td className="py-3 px-3 text-center">{rankBadge}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={st.playerPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(st.playerName)}&background=800000&color=ffd700&size=64`}
                              className="w-10 h-10 rounded-full bg-white object-cover border-2 border-brand-gold shrink-0 shadow-sm"
                              alt={st.playerName}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(st.playerName)}&background=800000&color=ffd700&size=64`;
                              }}
                            />
                            <div className="min-w-0">
                              <span className="font-extrabold text-sm tracking-wide text-brand-dark truncate block">
                                {st.playerName}
                              </span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {teamLogos[st.playerTeam] && (
                                  <img
                                    src={teamLogos[st.playerTeam]}
                                    className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                                    alt=""
                                  />
                                )}
                                <span className="text-[10px] font-bold text-gray-500 truncate">
                                  {st.playerTeam}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-sm text-brand-dark">{st.played}</td>
                        <td className="py-3 px-3 text-center font-bold text-sm text-green-600">{st.wins}</td>
                        <td className="py-3 px-3 text-center font-bold text-sm text-gray-500">{st.draws}</td>
                        <td className="py-3 px-3 text-center font-bold text-sm text-red-600">{st.losses}</td>
                        <td className="py-3 px-3 text-center font-bold text-xs text-gray-600">{st.goalsFor}</td>
                        <td className="py-3 px-3 text-center font-bold text-xs text-gray-600">{st.goalsAgainst}</td>
                        <td className={`py-3 px-3 text-center font-extrabold text-sm ${avColor}`}>
                          {av > 0 ? '+' : ''}{av}
                        </td>
                        <td className="py-3 px-4 text-center font-black text-xl text-brand-maroon">
                          {st.points}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* 1v1 ELO Standings Table Card */}
      {activeTab === 'elo' && (
        <div className="bg-brand-card rounded-3xl overflow-hidden border-b-8 border-brand-maroon shadow-md animate-fade-in">
          {/* ELO Concept Explainer Banner */}
          <div className="bg-gradient-to-r from-brand-maroon/10 via-amber-100/50 to-brand-maroon/10 p-4 border-b border-brand-maroon/15 text-xs text-brand-dark flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">♟️</span>
              <div>
                <span className="font-black text-brand-maroon uppercase tracking-wide block text-xs md:text-sm">
                  CHESS.COM 1V1 ELO DERECELENDİRME SİSTEMİ
                </span>
                <p className="text-[11px] text-gray-700 font-medium mt-0.5 max-w-3xl">
                  Her oyuncu <strong>100 ELO</strong> ile başlar. Denk maçlarda galibiyet <strong>±8 ELO</strong> kazandırır/kaybettirir (beraberlikte 0 ELO). ELO farkı büyüdükçe sürpriz galibiyetlerde kazanç ve kayıp artar. Düşük ELO'lu oyuncu yüksek ELO'luya karşı berabere kaldığında ELO kazanır, yüksek ELO'lu aynı oranda kaybeder.
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-1.5 text-[10px] font-black bg-white px-3 py-1.5 rounded-xl border border-brand-maroon/20 text-brand-maroon shadow-2xs">
              <span>🔢</span>
              <span>Maç Sırasına Göre Kronolojik</span>
            </div>
          </div>

          {/* Table Controls (Search, Only Played Toggle & Counter) */}
          <div className="p-4 bg-brand-maroon/5 border-b border-brand-maroon/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-brand-maroon font-black text-xs md:text-sm uppercase tracking-wide">
              <span>⚡</span>
              <span>
                1V1 ELO SIRALAMASI ({filteredEloStandings.length} {onlyPlayed ? 'Maç Yapan Oyuncu' : 'Oyuncu'})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setOnlyPlayed(!onlyPlayed)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 border cursor-pointer ${
                  onlyPlayed
                    ? 'bg-brand-maroon text-brand-gold border-brand-maroon shadow-xs'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
                title="Sadece maç yapmış oyuncuları göster / gizle"
              >
                <span>{onlyPlayed ? '✓' : '○'}</span>
                <span>Sadece Oynayanlar ({eloStandings.filter((s) => s.played > 0).length})</span>
              </button>

              <div className="relative w-full sm:w-60">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Oyuncu veya takım ara..."
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-1.5 pl-8 text-xs font-bold text-brand-dark focus:outline-none focus:border-brand-maroon"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-maroon text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center p-12 text-brand-maroon font-black text-sm">
              Yükleniyor...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-brand-dark border-collapse">
                <thead>
                  <tr className="bg-brand-maroon text-brand-gold border-b-2 border-brand-gold text-[11px] font-black uppercase tracking-wider">
                    <th className="py-4 px-3 text-center w-14">#</th>
                    <th className="py-4 px-4 text-left">OYUNCU</th>
                    <th className="py-4 px-3 text-center w-28">GÜNCEL ELO</th>
                    <th className="py-4 px-3 text-center">NET DEĞİŞİM</th>
                    <th className="py-4 px-3 text-center">O</th>
                    <th className="py-4 px-3 text-center">G</th>
                    <th className="py-4 px-3 text-center">B</th>
                    <th className="py-4 px-3 text-center">M</th>
                    <th className="py-4 px-3 text-center">KAZANMA %</th>
                    <th className="py-4 px-3 text-center">ZİRVE</th>
                    <th className="py-4 px-4 text-center w-28">SON MAÇ ELO</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEloStandings.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-10 text-center text-gray-500 font-bold text-xs">
                        {searchTerm ? (
                          'Aramanıza uygun oyuncu bulunamadı.'
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-2 p-4">
                            <span className="text-3xl">⚡</span>
                            <span className="font-black text-sm text-brand-maroon">
                              Henüz ELO puanı hesaplanan maç bulunmuyor.
                            </span>
                            <p className="text-gray-500 max-w-md text-xs">
                              {isAdmin
                                ? 'Aşağıdaki formdan düello maçı eklediğinizde ELO sıralaması otomatik hesaplanacaktır.'
                                : 'Yöneticiler düello maçı eklediğinde ELO tablosu burada listelenecektir.'}
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredEloStandings.map((st, i) => {
                      let rankBadge = (
                        <span className="font-black text-brand-maroon text-base">{i + 1}</span>
                      );
                      let borderClass = 'border-l-[6px] border-l-transparent';

                      if (i === 0 && st.played > 0) {
                        borderClass = 'border-l-[6px] border-l-brand-gold bg-amber-50/40';
                        rankBadge = (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-gold text-brand-dark font-black text-xs shadow-xs">
                            👑 1
                          </span>
                        );
                      } else if (i === 1 && st.played > 0) {
                        borderClass = 'border-l-[6px] border-l-gray-300';
                        rankBadge = (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 text-gray-800 font-black text-xs shadow-xs">
                            🥈 2
                          </span>
                        );
                      } else if (i === 2 && st.played > 0) {
                        borderClass = 'border-l-[6px] border-l-amber-600/40';
                        rankBadge = (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-900 font-black text-xs shadow-xs">
                            🥉 3
                          </span>
                        );
                      }

                      const netColor =
                        st.totalChange > 0
                          ? 'text-green-700 bg-green-50 border-green-300'
                          : st.totalChange < 0
                          ? 'text-red-700 bg-red-50 border-red-300'
                          : 'text-gray-500 bg-gray-50 border-gray-300';

                      const lastDeltaColor =
                        st.lastDelta > 0
                          ? 'text-green-700 bg-green-100 border-green-300'
                          : st.lastDelta < 0
                          ? 'text-red-700 bg-red-100 border-red-300'
                          : 'text-gray-600 bg-gray-100 border-gray-300';

                      return (
                        <tr
                          key={st.playerName}
                          onClick={() =>
                            onNavigate({
                              type: 'player-profile',
                              playerName: st.playerName,
                              playerId: st.playerId
                            })
                          }
                          className={`border-b border-brand-cream hover:bg-brand-cream/50 cursor-pointer transition-colors ${borderClass}`}
                        >
                          <td className="py-3 px-3 text-center">{rankBadge}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={
                                  st.playerPhoto ||
                                  `https://ui-avatars.com/api/?name=${encodeURIComponent(st.playerName)}&background=800000&color=ffd700&size=64`
                                }
                                className="w-10 h-10 rounded-full bg-white object-cover border-2 border-brand-gold shrink-0 shadow-sm"
                                alt={st.playerName}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(st.playerName)}&background=800000&color=ffd700&size=64`;
                                }}
                              />
                              <div className="min-w-0">
                                <span className="font-extrabold text-sm tracking-wide text-brand-dark truncate block">
                                  {st.playerName}
                                </span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {teamLogos[st.playerTeam] && (
                                    <img
                                      src={teamLogos[st.playerTeam]}
                                      className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                                      alt=""
                                    />
                                  )}
                                  <span className="text-[10px] font-bold text-gray-500 truncate">
                                    {st.playerTeam}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="font-black text-2xl text-brand-maroon tracking-tight">
                              {st.elo}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-black border ${netColor}`}>
                              {st.totalChange > 0 ? `+${st.totalChange}` : st.totalChange}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-sm text-brand-dark">{st.played}</td>
                          <td className="py-3 px-3 text-center font-bold text-sm text-green-600">{st.wins}</td>
                          <td className="py-3 px-3 text-center font-bold text-sm text-gray-500">{st.draws}</td>
                          <td className="py-3 px-3 text-center font-bold text-sm text-red-600">{st.losses}</td>
                          <td className="py-3 px-3 text-center font-black text-xs text-brand-dark">
                            %{st.winRate}
                          </td>
                          <td className="py-3 px-3 text-center font-black text-xs text-amber-700">
                            ⭐ {st.peakElo}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {st.played > 0 ? (
                              <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-black border ${lastDeltaColor}`}>
                                {st.lastDelta > 0 ? `+${st.lastDelta}` : st.lastDelta}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ADD DUEL SECTION (En alttaki maç ekleme yeri - ONLY ADMINS) */}
      {isAdmin ? (
        <div id="add-duel-section" className="bg-[#f5efe3] rounded-3xl p-6 md:p-8 border-2 border-brand-maroon shadow-lg scroll-mt-24 animate-fade-in">
          <div className="border-b-2 border-brand-maroon/20 pb-4 mb-6 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">⚔️</span>
                <h2 className="text-lg md:text-xl font-black text-brand-maroon uppercase tracking-wide">
                  YENİ DÜELLO MAÇI EKLE
                </h2>
              </div>
              <p className="text-xs text-gray-600 font-bold mt-1">
                İki oyuncuyu ve maç skorunu girin; lig tablosu otomatik olarak güncellensin.
              </p>
            </div>
            <span className="bg-brand-maroon text-brand-gold text-[10px] font-black uppercase px-3 py-1 rounded-full shadow-xs flex items-center gap-1">
              <span>🛡️</span>
              <span>Yönetici Paneli</span>
            </span>
          </div>

          <form onSubmit={handleSaveDuel} className="space-y-6">
            <div className="bg-white rounded-2xl p-5 border border-brand-maroon/20 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
              {/* Player 1 Selection */}
              <div className="flex-1 w-full flex flex-col items-center text-center gap-2">
                {(() => {
                  const p1 = playerMap.get(player1Name.toLowerCase().trim());
                  return (
                    <>
                      <img
                        src={p1?.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(player1Name || 'P1')}&background=800000&color=ffd700&size=64`}
                        className="w-16 h-16 rounded-full object-cover border-2 border-brand-maroon bg-white shadow-md"
                        alt={player1Name}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(player1Name || 'P1')}&background=800000&color=ffd700&size=64`;
                        }}
                      />
                      <label className="text-[10px] font-black text-brand-maroon uppercase tracking-wider">
                        1. OYUNCU (EV SAHİBİ)
                      </label>
                      <select
                        value={player1Name}
                        onChange={(e) => setPlayer1Name(e.target.value)}
                        className="w-full bg-[#fbf9f4] border-2 border-brand-maroon/30 focus:border-brand-maroon rounded-xl p-2.5 text-xs font-black text-brand-dark text-center cursor-pointer shadow-inner"
                      >
                        {players.map((p) => (
                          <option key={p.pname} value={p.pname}>
                            {p.pname} ({p.pteam || 'Serbest'})
                          </option>
                        ))}
                      </select>
                      <div className="flex flex-col items-center gap-1 mt-2">
                        <span className="text-[9px] font-black text-gray-400 uppercase">1. Oyuncu Skoru</span>
                        <input
                          type="number"
                          min="0"
                          max="99"
                          value={score1}
                          onChange={(e) => setScore1(e.target.value)}
                          className="w-20 h-14 text-center text-3xl font-black bg-brand-card border-2 border-brand-maroon rounded-2xl text-brand-maroon shadow-inner"
                        />
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* VS divider */}
              <div className="flex flex-col items-center justify-center shrink-0 my-2 md:my-0">
                <span className="w-12 h-12 rounded-full bg-brand-maroon text-brand-gold flex items-center justify-center text-sm font-black shadow-md border-2 border-brand-gold">
                  VS
                </span>
                <span className="text-[10px] font-black text-gray-500 uppercase mt-2">DÜELLO</span>
              </div>

              {/* Player 2 Selection */}
              <div className="flex-1 w-full flex flex-col items-center text-center gap-2">
                {(() => {
                  const p2 = playerMap.get(player2Name.toLowerCase().trim());
                  return (
                    <>
                      <img
                        src={p2?.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(player2Name || 'P2')}&background=800000&color=ffd700&size=64`}
                        className="w-16 h-16 rounded-full object-cover border-2 border-brand-maroon bg-white shadow-md"
                        alt={player2Name}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(player2Name || 'P2')}&background=800000&color=ffd700&size=64`;
                        }}
                      />
                      <label className="text-[10px] font-black text-brand-maroon uppercase tracking-wider">
                        2. OYUNCU (DEPLASMAN)
                      </label>
                      <select
                        value={player2Name}
                        onChange={(e) => setPlayer2Name(e.target.value)}
                        className="w-full bg-[#fbf9f4] border-2 border-brand-maroon/30 focus:border-brand-maroon rounded-xl p-2.5 text-xs font-black text-brand-dark text-center cursor-pointer shadow-inner"
                      >
                        {players.map((p) => (
                          <option key={p.pname} value={p.pname}>
                            {p.pname} ({p.pteam || 'Serbest'})
                          </option>
                        ))}
                      </select>
                      <div className="flex flex-col items-center gap-1 mt-2">
                        <span className="text-[9px] font-black text-gray-400 uppercase">2. Oyuncu Skoru</span>
                        <input
                          type="number"
                          min="0"
                          max="99"
                          value={score2}
                          onChange={(e) => setScore2(e.target.value)}
                          className="w-20 h-14 text-center text-3xl font-black bg-brand-card border-2 border-brand-maroon rounded-2xl text-brand-maroon shadow-inner"
                        />
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Number, Date & Submit */}
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-full sm:w-36 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-brand-maroon uppercase">
                    🔢 Maç Sırası
                  </label>
                  <span className="text-[9px] text-gray-400 font-bold">
                    #{maxMatchNumber + 1}
                  </span>
                </div>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={matchNumber}
                  onChange={(e) => {
                    setUserHasCustomMatchNumber(true);
                    setMatchNumber(e.target.value);
                  }}
                  placeholder={String(maxMatchNumber + 1)}
                  className="w-full bg-white border-2 border-brand-maroon/30 focus:border-brand-maroon rounded-xl p-2.5 text-xs font-black text-brand-maroon text-center shadow-inner"
                  title="ELO hesaplaması bu maç numarasına göre sırayla yapılır (1, 2, 3...)"
                />
              </div>

              <div className="w-full sm:w-44 flex flex-col gap-1">
                <label className="text-[10px] font-black text-brand-maroon uppercase">Maç Tarihi</label>
                <input
                  type="text"
                  value={duelDate}
                  onChange={(e) => setDuelDate(e.target.value)}
                  placeholder="GG.AA.YYYY"
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-xs font-bold text-gray-800"
                />
              </div>

              <button
                type="submit"
                disabled={savingDuel}
                className="flex-1 w-full mt-auto py-3.5 px-6 bg-brand-maroon hover:bg-black text-brand-gold font-black text-xs md:text-sm uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span>💾</span>
                <span>{savingDuel ? 'Kaydediliyor...' : "Düello Sonucunu Kaydet ve ELO'yu Güncelle"}</span>
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div id="add-duel-section" className="bg-[#f5efe3] rounded-3xl p-6 md:p-8 border-2 border-dashed border-brand-maroon/30 shadow-xs text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-brand-maroon/10 text-brand-maroon flex items-center justify-center text-2xl mx-auto shadow-inner">
            🔒
          </div>
          <h3 className="font-black text-brand-maroon text-base md:text-lg uppercase">
            YÖNETİCİ (ADMİN) YETKİSİ GEREKLİDİR
          </h3>
          <p className="text-xs text-gray-600 font-bold max-w-md mx-auto">
            Düello maçı ekleme, skor düzenleme ve maç silme yetkisi yalnızca yöneticilere (admin) aittir.
          </p>
        </div>
      )}

      {/* RECENT DUELS LIST (Son Oynanan Düellolar) */}
      <div className="bg-white rounded-3xl p-6 border-b-6 border-brand-maroon shadow-md space-y-4">
        <div className="flex items-center justify-between border-b-2 border-gray-100 pb-3">
          <h3 className="font-black text-sm md:text-base text-brand-maroon uppercase tracking-wide flex items-center gap-2">
            <span>📅</span>
            <span>SON OYNANAN DÜELLOLAR ({duels.length})</span>
          </h3>
          <span className="text-[10px] font-bold text-gray-400 uppercase">
            {isAdmin ? '🛡️ Yönetici: Düzenleme & Silme Yetkisi Aktif' : 'Ters kronolojik sıra'}
          </span>
        </div>

        {duels.length === 0 ? (
          <div className="text-center py-8 text-gray-400 font-bold text-xs bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            Henüz hiç düello maçı kaydedilmedi. {isAdmin ? 'Yukarıdaki formdan ilk maçı ekleyin!' : ''}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {duels.map((d) => {
              const p1Win = d.score1 > d.score2;
              const p2Win = d.score2 > d.score1;

              const p1 = playerMap.get(d.player1Name.toLowerCase().trim());
              const p2 = playerMap.get(d.player2Name.toLowerCase().trim());
              const deltaInfo = matchDeltas.get(d.id);

              return (
                <div
                  key={d.id}
                  className="bg-[#fbf9f4] hover:bg-[#f6f2e8] rounded-2xl p-3.5 border border-brand-maroon/20 shadow-xs flex flex-col justify-between gap-2.5 transition-colors select-text"
                >
                  {/* Top: Match Info & Admin Actions */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="bg-brand-maroon text-brand-gold px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shadow-2xs">
                        {d.matchNumber ? `Maç #${d.matchNumber}` : 'Düello'}
                      </span>
                      <span className="text-[10px] font-bold text-gray-500">
                        {d.date || 'Tarihsiz'}
                      </span>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(d)}
                          title="Düelloyu Düzenle"
                          className="w-7 h-7 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 flex items-center justify-center text-xs shrink-0 cursor-pointer transition-colors shadow-xs"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDuel(d.id)}
                          title="Düelloyu Sil"
                          className="w-7 h-7 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 flex items-center justify-center text-xs shrink-0 cursor-pointer transition-colors shadow-xs"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Middle: Teams & Score */}
                  <div className="flex items-center justify-between gap-2">
                    {/* Player 1 */}
                    <div className={`flex-1 flex items-center justify-end gap-2 text-right min-w-0 ${p1Win ? 'font-black text-brand-maroon' : 'text-gray-700'}`}>
                      <div className="truncate">
                        <span className="text-xs truncate block">{d.player1Name}</span>
                        <span className="text-[9px] text-gray-400 block truncate">{d.player1Team || p1?.pteam || ''}</span>
                      </div>
                      <img
                        src={d.player1Photo || p1?.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(d.player1Name)}&background=800000&color=ffd700&size=40`}
                        className={`w-9 h-9 rounded-full object-cover bg-white shrink-0 border ${p1Win ? 'border-brand-gold ring-2 ring-brand-maroon' : 'border-gray-200'}`}
                        alt={d.player1Name}
                      />
                    </div>

                    {/* Score */}
                    <div className="flex flex-col items-center shrink-0 min-w-[70px]">
                      <div className="px-3.5 py-1 bg-brand-maroon text-brand-gold rounded-xl font-black text-xs md:text-sm text-center border border-brand-gold shadow-xs">
                        {d.score1} - {d.score2}
                      </div>
                    </div>

                    {/* Player 2 */}
                    <div className={`flex-1 flex items-center justify-start gap-2 text-left min-w-0 ${p2Win ? 'font-black text-brand-maroon' : 'text-gray-700'}`}>
                      <img
                        src={d.player2Photo || p2?.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(d.player2Name)}&background=800000&color=ffd700&size=40`}
                        className={`w-9 h-9 rounded-full object-cover bg-white shrink-0 border ${p2Win ? 'border-brand-gold ring-2 ring-brand-maroon' : 'border-gray-200'}`}
                        alt={d.player2Name}
                      />
                      <div className="truncate">
                        <span className="text-xs truncate block">{d.player2Name}</span>
                        <span className="text-[9px] text-gray-400 block truncate">{d.player2Team || p2?.pteam || ''}</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom: ELO Won / Lost Footer */}
                  <div className="mt-1 pt-2 border-t border-brand-maroon/15 flex items-center justify-between gap-1.5 text-[10px] md:text-[11px] font-bold">
                    {deltaInfo ? (
                      <>
                        <div className={`flex items-center gap-1 min-w-0 truncate ${deltaInfo.p1Delta > 0 ? 'text-green-700 font-black' : deltaInfo.p1Delta < 0 ? 'text-red-700 font-bold' : 'text-gray-500 font-bold'}`}>
                          <span className="truncate max-w-[85px] sm:max-w-[120px]">{d.player1Name}:</span>
                          <span className={`px-1.5 py-0.2 rounded font-black border ${deltaInfo.p1Delta > 0 ? 'bg-green-100 border-green-300' : deltaInfo.p1Delta < 0 ? 'bg-red-100 border-red-300' : 'bg-gray-100 border-gray-300'}`}>
                            {deltaInfo.p1Delta > 0 ? `+${deltaInfo.p1Delta}` : deltaInfo.p1Delta} ELO
                          </span>
                          <span className="text-[9px] text-gray-400 font-normal">({deltaInfo.p1After})</span>
                        </div>

                        <span className="shrink-0 text-[8px] font-black uppercase tracking-wider text-brand-maroon bg-brand-gold/30 px-1.5 py-0.5 rounded border border-brand-gold/50">
                          ⚡ ELO
                        </span>

                        <div className={`flex items-center gap-1 min-w-0 justify-end truncate ${deltaInfo.p2Delta > 0 ? 'text-green-700 font-black' : deltaInfo.p2Delta < 0 ? 'text-red-700 font-bold' : 'text-gray-500 font-bold'}`}>
                          <span className="text-[9px] text-gray-400 font-normal">({deltaInfo.p2After})</span>
                          <span className={`px-1.5 py-0.2 rounded font-black border ${deltaInfo.p2Delta > 0 ? 'bg-green-100 border-green-300' : deltaInfo.p2Delta < 0 ? 'bg-red-100 border-red-300' : 'bg-gray-100 border-gray-300'}`}>
                            {deltaInfo.p2Delta > 0 ? `+${deltaInfo.p2Delta}` : deltaInfo.p2Delta} ELO
                          </span>
                          <span className="truncate max-w-[85px] sm:max-w-[120px]">{d.player2Name}</span>
                        </div>
                      </>
                    ) : (
                      <div className="w-full text-center text-[10px] text-gray-400">
                        {d.matchNumber ? `Maç #${d.matchNumber} • ` : ''}ELO hesaplanıyor...
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* EDIT DUEL MODAL (ADMIN ONLY) */}
      {editModalOpen && editingDuel && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-[99999] flex items-center justify-center p-4">
          <div className="bg-[#f2ede1] text-[#3d3d3d] w-full max-w-lg rounded-3xl p-6 border-b-8 border-brand-maroon shadow-2xl relative select-text animate-fade-in max-h-[95vh] overflow-y-auto">
            <button 
              type="button"
              onClick={() => {
                setEditModalOpen(false);
                setEditingDuel(null);
              }} 
              className="absolute top-4 right-4 text-xl font-bold text-brand-maroon cursor-pointer hover:opacity-75"
            >
              ✕
            </button>
            
            <div className="text-center border-b-2 border-brand-maroon pb-3 mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-maroon block">
                🛡️ YÖNETİCİ PANELİ
              </span>
              <h3 className="text-base font-black text-brand-dark uppercase tracking-wide mt-0.5">
                ✏️ Düello Maçını Düzenle
              </h3>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Teams & Scores Row */}
              <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex items-center justify-between gap-3">
                {/* Player 1 */}
                <div className="flex-1 flex flex-col items-center text-center gap-1.5">
                  <img 
                    src={playerMap.get(editPlayer1Name.toLowerCase().trim())?.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(editPlayer1Name || 'P1')}&background=800000&color=ffd700&size=48`}
                    className="w-12 h-12 rounded-full object-cover border-2 border-brand-maroon bg-white shadow-sm"
                    alt={editPlayer1Name}
                  />
                  <select
                    value={editPlayer1Name}
                    onChange={(e) => setEditPlayer1Name(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg p-1.5 text-[11px] font-black text-brand-dark text-center truncate cursor-pointer"
                  >
                    {players.map((p) => (
                      <option key={p.pname} value={p.pname}>{p.pname} ({p.pteam || 'Serbest'})</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={editScore1}
                    onChange={(e) => setEditScore1(e.target.value)}
                    className="w-16 h-12 text-center text-2xl font-black bg-brand-card border-2 border-brand-maroon rounded-xl text-brand-maroon shadow-inner"
                  />
                </div>

                <div className="flex flex-col items-center">
                  <span className="text-sm font-black text-gray-400">VS</span>
                  <span className="text-[9px] font-bold text-gray-400 mt-1">Skor</span>
                </div>

                {/* Player 2 */}
                <div className="flex-1 flex flex-col items-center text-center gap-1.5">
                  <img 
                    src={playerMap.get(editPlayer2Name.toLowerCase().trim())?.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(editPlayer2Name || 'P2')}&background=800000&color=ffd700&size=48`}
                    className="w-12 h-12 rounded-full object-cover border-2 border-brand-maroon bg-white shadow-sm"
                    alt={editPlayer2Name}
                  />
                  <select
                    value={editPlayer2Name}
                    onChange={(e) => setEditPlayer2Name(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg p-1.5 text-[11px] font-black text-brand-dark text-center truncate cursor-pointer"
                  >
                    {players.map((p) => (
                      <option key={p.pname} value={p.pname}>{p.pname} ({p.pteam || 'Serbest'})</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={editScore2}
                    onChange={(e) => setEditScore2(e.target.value)}
                    className="w-16 h-12 text-center text-2xl font-black bg-brand-card border-2 border-brand-maroon rounded-xl text-brand-maroon shadow-inner"
                  />
                </div>
              </div>

              {/* Match Number & Date Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-brand-maroon uppercase">
                      🔢 Maç Sırası (No)
                    </label>
                    <span className="text-[9px] text-gray-400 font-bold">
                      ELO Sıralaması
                    </span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editMatchNumber}
                    onChange={(e) => setEditMatchNumber(e.target.value)}
                    placeholder="Örn: 1, 2, 3..."
                    className="w-full bg-white border border-gray-300 focus:border-brand-maroon rounded-xl p-2.5 text-xs font-black text-brand-maroon text-center shadow-xs"
                    title="ELO hesaplaması bu maç numarasına göre sırayla yapılır"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-brand-maroon uppercase">Maç Tarihi</label>
                  <input
                    type="text"
                    value={editDuelDate}
                    onChange={(e) => setEditDuelDate(e.target.value)}
                    placeholder="GG.AA.YYYY"
                    className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-xs font-bold text-gray-800"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="w-full py-3 bg-brand-maroon text-brand-gold hover:bg-black font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span>💾</span>
                  <span>{savingEdit ? 'Güncelleniyor...' : 'Düelloyu Güncelle ve Tabloyu Yenile'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditModalOpen(false);
                    setEditingDuel(null);
                  }}
                  className="w-full py-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Vazgeç
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
