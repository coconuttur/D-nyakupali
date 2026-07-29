import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { TROPHIES_LIST } from '../lib/trophies';
import { Player, Team, UserProfile } from '../types';

interface AlbumViewProps {
  onNavigate: (view: any) => void;
  onBack?: () => void;
  currentUser?: UserProfile | null;
}

interface PlayerAlbumItem {
  id: string;
  pname: string;
  pteam: string;
  foto: string;
  gen: number;
  mevki?: string;
  formaNo?: string;
}

interface TeamAlbumData {
  id: string;
  name: string;
  code: string;
  logo?: string;
  country?: string;
  players: PlayerAlbumItem[];
}

interface UserAlbumSlotData {
  slotCode: string;
  hasNormal: boolean;
  hasShiny: boolean;
  selectedVariant: 'normal' | 'shiny';
  countNormal: number;
  countShiny: number;
}

interface LeaderboardUser {
  uid: string;
  displayName: string;
  avatar?: string;
  totalUniqueCards: number;
  totalShinyCards: number;
  favTeam?: string;
}

// -------------------------------------------------------------
// PLAYER CARD COMPONENT (Matches user's template: Cream background, large Rating & Logo orange boxes)
// -------------------------------------------------------------
interface PlayerStickerCardProps {
  key?: React.Key;
  player: PlayerAlbumItem;
  teamLogo?: string;
  slotCode: string;
  isUnlocked: boolean;
  isShiny?: boolean;
  onClick?: () => void;
}

function PlayerStickerCard({ 
  player, 
  teamLogo, 
  slotCode, 
  isUnlocked,
  isShiny = false, 
  onClick 
}: PlayerStickerCardProps) {
  if (!isUnlocked) {
    return (
      <div 
        onClick={onClick}
        className="w-full aspect-[3/4] bg-[#FFFEE5] border-2 border-dashed border-[#7A1515]/60 rounded-xl p-2 flex flex-col items-center justify-between text-center relative group cursor-pointer hover:bg-[#FFFDD0] transition-colors shadow-sm select-none"
      >
        <span className="absolute top-1.5 left-1.5 text-[9px] font-black bg-[#7A1515] text-amber-300 px-1.5 py-0.5 rounded font-mono shadow-xs z-10">
          {slotCode}
        </span>

        <div className="my-auto flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-[#7A1515]/25 select-none">
            {slotCode.split('-')[1] || '00'}
          </span>
          <span className="text-[8px] font-black text-[#7A1515] uppercase tracking-wider mt-1">
            STİCKER ALANI
          </span>
        </div>

        <div className="w-full bg-[#7A1515] text-amber-300 py-1 px-1 rounded-lg text-[10px] font-black uppercase truncate border border-amber-400/40">
          {player.pname}
        </div>
      </div>
    );
  }

  // UNLOCKED PLAYER STICKER CARD
  return (
    <div 
      onClick={onClick}
      className={`w-full aspect-[3/4] relative rounded-xl overflow-hidden shadow-xl border-[3px] ${isShiny ? 'border-amber-400 bg-gradient-to-br from-amber-200 via-yellow-100 to-amber-300 ring-2 ring-amber-400/80' : 'border-[#661616] bg-[#FFFEE8]'} cursor-pointer group transform hover:scale-105 transition-all select-none flex flex-col justify-between p-1.5 sm:p-2`}
    >
      {/* Glossy Foil / Holographic Overlay for Shiny cards */}
      {isShiny && (
        <>
          <div className="absolute inset-0 bg-gradient-to-tr from-cyan-400/20 via-pink-400/20 to-yellow-200/30 mix-blend-color-dodge opacity-90 group-hover:opacity-100 transition-opacity z-10 pointer-events-none"></div>
          <div className="absolute -inset-full w-[200%] h-[200%] bg-gradient-to-r from-transparent via-white/50 to-transparent transform -rotate-45 group-hover:translate-x-full transition-transform duration-1000 z-10 pointer-events-none"></div>
        </>
      )}

      {/* Shiny Badge if Parıltılı */}
      {isShiny && (
        <div className="absolute top-1 right-1 z-20">
          <span className="text-[8px] font-black bg-amber-500 text-black px-1.5 py-0.5 rounded-full border border-amber-200 shadow-xs flex items-center gap-0.5">
            ✨ PARILTILI
          </span>
        </div>
      )}

      {/* Center: Player Photo */}
      <div className="flex-1 flex items-center justify-center relative my-1 overflow-hidden z-10">
        <img 
          src={player.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(player.pname)}&background=800000&color=fff`} 
          alt={player.pname} 
          className="max-h-full max-w-full object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)] group-hover:scale-110 transition-transform duration-300"
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(player.pname)}&background=800000&color=fff`;
          }}
        />
      </div>

      {/* Bottom Container: Two Large Orange Boxes & Player Name Pill */}
      <div className="relative z-10 pt-1">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 items-stretch h-10 sm:h-12">
          
          {/* Left Orange Box: Large Rating */}
          <div className="bg-[#D96836] border border-[#B34E1E] rounded-xl flex items-center justify-center p-1 shadow-inner">
            <span className="text-base sm:text-xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] font-mono tracking-tighter">
              {player.gen || 85}
            </span>
          </div>

          {/* Right Orange Box: Large Team Logo */}
          <div className="bg-[#D96836] border border-[#B34E1E] rounded-xl flex items-center justify-center p-1 shadow-inner overflow-hidden">
            {teamLogo ? (
              <img 
                src={teamLogo} 
                alt="Takım" 
                className="max-h-full max-w-full object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
                onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40?text=🛡️'; }}
              />
            ) : (
              <span className="text-base">🛡️</span>
            )}
          </div>
        </div>

        {/* Player Name Banner */}
        <div className="mt-1 flex justify-center">
          <div className="bg-[#661616] text-amber-300 border border-amber-400/80 rounded-full py-0.5 px-2.5 text-center shadow-md w-full max-w-[95%] truncate">
            <span className="font-black text-[9px] sm:text-[11px] uppercase tracking-wide block truncate">
              {player.pname}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}

// -------------------------------------------------------------
// SHINY HOLOGRAPHIC STICKER CARD (For Team Emblems & Trophies: Golden Boy & Trophy titles truncated cleanly)
// -------------------------------------------------------------
interface ShinySpecialStickerCardProps {
  key?: React.Key;
  title: string;
  image?: string;
  slotCode: string;
  type?: 'team' | 'trophy';
  isUnlocked: boolean;
  onClick?: () => void;
}

function ShinySpecialStickerCard({ 
  title, 
  image, 
  slotCode, 
  type = 'team', 
  isUnlocked, 
  onClick 
}: ShinySpecialStickerCardProps) {
  if (!isUnlocked) {
    return (
      <div 
        onClick={onClick}
        className="w-full aspect-[3/4] bg-[#a30000] border-2 border-dashed border-amber-300/80 rounded-2xl p-2.5 flex flex-col items-center justify-between text-center relative group cursor-pointer hover:bg-[#800000] transition-colors shadow-inner select-none"
      >
        <span className="absolute top-1.5 left-1.5 text-[9px] font-black bg-amber-400 text-[#800000] px-1.5 py-0.5 rounded font-mono shadow-xs z-10">
          {slotCode}
        </span>

        <div className="my-auto flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-amber-300/30 select-none">
            {type === 'team' ? 'LOGO' : 'KUPA'}
          </span>
          <span className="text-[8px] font-black text-amber-200 uppercase tracking-wider mt-1">
            PARILTILI STİCKER ALANI
          </span>
        </div>

        <div className="w-full bg-[#800000] text-amber-200 py-1 px-1 rounded-lg text-[10px] font-black uppercase truncate border border-amber-400/30">
          {title}
        </div>
      </div>
    );
  }

  // UNLOCKED SHINY HOLOGRAPHIC STICKER
  return (
    <div 
      onClick={onClick}
      className="w-full aspect-[3/4] relative rounded-2xl overflow-hidden shadow-2xl border-4 border-amber-300 cursor-pointer group transform hover:scale-105 transition-all bg-gradient-to-br from-amber-400 via-yellow-200 to-amber-600 p-2 flex flex-col justify-between select-none"
    >
      {/* Holographic Glitter & Sparkles Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-yellow-100/70 via-amber-400/40 to-amber-800/90 z-0"></div>
      
      {/* Metallic Rainbow Foil Reflection Overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-cyan-400/30 via-pink-400/30 to-yellow-200/40 mix-blend-color-dodge opacity-85 group-hover:opacity-100 transition-opacity z-10 pointer-events-none"></div>
      
      {/* Animated Light Beam Sweep */}
      <div className="absolute -inset-full w-[200%] h-[200%] bg-gradient-to-r from-transparent via-white/60 to-transparent transform -rotate-45 group-hover:translate-x-full transition-transform duration-1000 z-10 pointer-events-none"></div>

      {/* Top Foil Badge */}
      <div className="relative z-20 flex items-center justify-between">
        <span className="text-[9px] font-black bg-[#800000] text-amber-300 px-2 py-0.5 rounded-full border border-amber-400 shadow-xs uppercase tracking-widest flex items-center gap-1">
          <span>✨</span>
          <span>PARILTILI</span>
        </span>
        <span className="text-xs">⭐</span>
      </div>

      {/* Center: Direct Team Logo or Trophy Image */}
      <div className="relative z-20 flex-1 flex items-center justify-center p-2 my-1">
        <img 
          src={image || (type === 'team' ? 'https://via.placeholder.com/100?text=🛡️' : 'https://via.placeholder.com/100?text=🏆')} 
          alt={title}
          className="max-h-full max-w-full object-contain filter drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)] group-hover:scale-110 transition-transform duration-300"
          onError={(e) => {
            (e.target as HTMLImageElement).src = type === 'team' ? 'https://via.placeholder.com/100?text=🛡️' : 'https://via.placeholder.com/100?text=🏆';
          }}
        />
      </div>

      {/* Bottom Name Plate: Cleanly truncated & scaled so long titles like GOLDEN BOY ÖDÜLÜ fit inside */}
      <div className="relative z-20 bg-[#800000] text-amber-300 border border-amber-300/80 rounded-lg py-0.5 px-1 text-center shadow-lg w-full max-w-full overflow-hidden flex items-center justify-center min-h-[22px]">
        <span className="font-black text-[8px] sm:text-[10px] uppercase tracking-tighter block truncate max-w-full leading-tight">
          {title}
        </span>
      </div>
    </div>
  );
}

export function AlbumView({ onNavigate, onBack, currentUser }: AlbumViewProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [currentSpreadIndex, setCurrentSpreadIndex] = useState<number>(0);

  // Firestore Data & Test Mode Check
  const [teamsData, setTeamsData] = useState<TeamAlbumData[]>([]);
  const [isTestUser, setIsTestUser] = useState<boolean>(false);

  // User Album Map in Firestore: slotCode -> UserAlbumSlotData
  const [userAlbum, setUserAlbum] = useState<Record<string, UserAlbumSlotData>>({});
  const [lastPackOpenedAt, setLastPackOpenedAt] = useState<number>(0);
  const [userStats, setUserStats] = useState<{ totalUniqueCards: number; totalShinyCards: number }>({
    totalUniqueCards: 0,
    totalShinyCards: 0
  });

  // Modal States
  const [selectedCardModal, setSelectedCardModal] = useState<any>(null);
  const [showStatsModal, setShowStatsModal] = useState<boolean>(false);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [showLoginPromptModal, setShowLoginPromptModal] = useState<boolean>(false);

  // Leaderboard Data State
  const [leaderboardUsers, setLeaderboardUsers] = useState<LeaderboardUser[]>([]);

  // Pack Opening System State
  const [isOpeningPackModal, setIsOpeningPackModal] = useState<boolean>(false);
  const [drawnCards, setDrawnCards] = useState<any[]>([]);
  const [packStage, setPackStage] = useState<'box' | 'card' | 'finished'>('box');
  const [activePackCardIndex, setActivePackCardIndex] = useState<number>(-1);
  const [shinyStarStage, setShinyStarStage] = useState<'none' | 'star' | 'yellow'>('none');

  // 12-Hour Cooldown Timer State (43200000 ms)
  const COOLDOWN_MS = 12 * 60 * 60 * 1000;
  const [timeLeftMs, setTimeLeftMs] = useState<number>(0);

  // 1. Listen User Test/Admin Status & User Album Data from Firestore
  useEffect(() => {
    const isAdmin = Boolean(currentUser?.admin);
    if (!isAdmin && currentUser?.test === true) {
      setIsTestUser(true);
    } else {
      setIsTestUser(false);
    }

    if (currentUser?.uid) {
      // Listen User Document for lastPackOpenedAt & stats
      const unsubUserDoc = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
          const uData = docSnap.data();
          const userIsAdmin = Boolean(uData.admin || currentUser?.admin);
          if (!userIsAdmin && uData.test === true) {
            setIsTestUser(true);
          } else {
            setIsTestUser(false);
          }
          if (uData.lastPackOpenedAt) {
            setLastPackOpenedAt(Number(uData.lastPackOpenedAt));
          }
          setUserStats({
            totalUniqueCards: uData.totalUniqueCards || 0,
            totalShinyCards: uData.totalShinyCards || 0
          });
        }
      });

      // Listen User Album Subcollection
      const unsubAlbum = onSnapshot(collection(db, 'users', currentUser.uid, 'album'), (snap) => {
        const albumMap: Record<string, UserAlbumSlotData> = {};
        let uniqueCount = 0;
        let shinyCount = 0;

        snap.forEach((d) => {
          const data = d.data() as UserAlbumSlotData;
          albumMap[d.id] = data;

          if (data.hasNormal || data.hasShiny) {
            uniqueCount++;
          }
          if (data.hasShiny) {
            shinyCount++;
          }
        });

        setUserAlbum(albumMap);
        setUserStats({ totalUniqueCards: uniqueCount, totalShinyCards: shinyCount });

        // Sync stats to user's Firestore document so leaderboard stays up to date
        setDoc(doc(db, 'users', currentUser.uid), {
          totalUniqueCards: uniqueCount,
          totalShinyCards: shinyCount
        }, { merge: true }).catch((err) => console.error('Error syncing user stats to Firestore:', err));
      });

      return () => {
        unsubUserDoc();
        unsubAlbum();
      };
    } else {
      setUserAlbum({});
      setLastPackOpenedAt(0);
    }
  }, [currentUser]);

  // 2. Cooldown Countdown Interval
  useEffect(() => {
    const updateTimer = () => {
      if (isTestUser) {
        setTimeLeftMs(0);
        return;
      }
      if (!lastPackOpenedAt) {
        setTimeLeftMs(0);
        return;
      }
      const now = Date.now();
      const elapsed = now - lastPackOpenedAt;
      const remaining = COOLDOWN_MS - elapsed;
      setTimeLeftMs(remaining > 0 ? remaining : 0);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [lastPackOpenedAt, isTestUser]);

  // 3. Listen Teams & Players from Firestore
  useEffect(() => {
    let teamsList: { id: string; team: Team }[] = [];
    let playersList: { id: string; player: Player }[] = [];

    const unsubTeams = onSnapshot(collection(db, 'teams'), (tSnap) => {
      teamsList = [];
      tSnap.forEach((d) => teamsList.push({ id: d.id, team: d.data() as Team }));
      processAlbumData(teamsList, playersList);
    });

    const unsubPlayers = onSnapshot(collection(db, 'players'), (pSnap) => {
      playersList = [];
      pSnap.forEach((d) => playersList.push({ id: d.id, player: d.data() as Player }));
      processAlbumData(teamsList, playersList);
    });

    return () => {
      unsubTeams();
      unsubPlayers();
    };
  }, []);

  const processAlbumData = (
    teamsRaw: { id: string; team: Team }[],
    playersRaw: { id: string; player: Player }[]
  ) => {
    const sortedTeamsRaw = [...teamsRaw].sort((a, b) => {
      const nameA = a.team.name || a.id;
      const nameB = b.team.name || b.id;
      return nameA.localeCompare(nameB, 'tr', { sensitivity: 'base' });
    });

    const processed: TeamAlbumData[] = sortedTeamsRaw.map((tItem) => {
      const tName = tItem.team.name || tItem.id;
      const words = tName.replace(/^(FC|FK|SK|AC|AS)\s+/i, '').split(/\s+/);
      let code = 'TKM';
      if (words.length >= 2) {
        code = (words[0][0] + words[1].slice(0, 2)).toUpperCase();
      } else if (words[0]) {
        code = words[0].slice(0, 3).toUpperCase();
      }

      const teamPlayers: PlayerAlbumItem[] = playersRaw
        .filter((p) => (p.player.pteam || '').toLowerCase() === tName.toLowerCase())
        .map((p) => ({
          id: p.id,
          pname: p.player.pname,
          pteam: p.player.pteam,
          foto: p.player.foto || '',
          gen: p.player.gen || 80,
          mevki: (p.player as any).mevki || 'Futbolcu',
          formaNo: (p.player as any).formaNo || ''
        }))
        .sort((a, b) => a.pname.localeCompare(b.pname, 'tr', { sensitivity: 'base' }));

      return {
        id: tItem.id,
        name: tName,
        code,
        logo: tItem.team.logo,
        country: tItem.team.ülke,
        players: teamPlayers
      };
    });

    setTeamsData(processed);
  };

  // 4. Fetch Leaderboard Users from Firestore
  const fetchLeaderboard = async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list: LeaderboardUser[] = [];

      for (const d of snap.docs) {
        const u = d.data();

        // Exclude test users from statistics / leaderboard!
        if (u.test === true) continue;

        let uniqueCount = u.totalUniqueCards || 0;
        let shinyCount = u.totalShinyCards || 0;

        // Fallback: If totalUniqueCards is 0 or undefined, calculate directly from user's album subcollection
        if (!u.totalUniqueCards) {
          try {
            const albumSnap = await getDocs(collection(db, 'users', d.id, 'album'));
            let uCount = 0;
            let sCount = 0;
            albumSnap.forEach((ad) => {
              const data = ad.data();
              if (data.hasNormal || data.hasShiny) uCount++;
              if (data.hasShiny) sCount++;
            });
            uniqueCount = uCount;
            shinyCount = sCount;

            // Save back to user document so future reads are fast
            await setDoc(doc(db, 'users', d.id), {
              totalUniqueCards: uCount,
              totalShinyCards: sCount
            }, { merge: true });
          } catch (e) {
            console.error('Error fetching sub-album stats for user:', d.id, e);
          }
        }

        list.push({
          uid: d.id,
          displayName: u.displayName || 'Anonim Kullanıcı',
          avatar: u.avatar,
          totalUniqueCards: uniqueCount,
          totalShinyCards: shinyCount,
          favTeam: u.favTeam
        });
      }

      setLeaderboardUsers(list);
    } catch (err) {
      console.error('Leaderboard error:', err);
    }
  };

  // 5. PACK GENERATOR ENGINE
  // Draws 5 unique cards. Shiny cards are sorted AT THE END.
  const handleOpenPackClick = () => {
    if (!currentUser) {
      setShowLoginPromptModal(true);
      return;
    }

    if (!isTestUser && timeLeftMs > 0) {
      return; // Cooldown active
    }

    // Build Card Pool
    const pool: any[] = [];

    // Trophies (Always Shiny Special Cards)
    TROPHIES_LIST.forEach((t, idx) => {
      pool.push({
        slotCode: `TR-${String(idx + 1).padStart(2, '0')}`,
        title: t.name,
        image: t.icon,
        type: 'trophy',
        isAlwaysShiny: true
      });
    });

    // Team Logos & Players
    teamsData.forEach((team) => {
      // Team Logo (Always Shiny Special Card)
      pool.push({
        slotCode: `${team.code}-01`,
        title: team.name,
        image: team.logo,
        type: 'team',
        teamLogo: team.logo,
        isAlwaysShiny: true
      });

      // Team Players
      team.players.forEach((player, pIdx) => {
        pool.push({
          slotCode: `${team.code}-${String(pIdx + 2).padStart(2, '0')}`,
          title: player.pname,
          image: player.foto,
          type: 'player',
          playerData: player,
          teamLogo: team.logo,
          isAlwaysShiny: false
        });
      });
    });

    if (pool.length < 5) return;

    // Pick 5 unique random items (No duplicate slotCode within single pack)
    const selected: any[] = [];
    const usedCodes = new Set<string>();

    while (selected.length < 5 && usedCodes.size < pool.length) {
      const randIdx = Math.floor(Math.random() * pool.length);
      const item = pool[randIdx];
      if (!usedCodes.has(item.slotCode)) {
        usedCodes.add(item.slotCode);
        selected.push(item);
      }
    }

    // Determine shiny variant for each card
    // Rules: Badges & Trophies are ALWAYS shiny.
    // Player cards: 5% chance for 1st shiny player card, 2% chance for additional shiny player cards in the same pack.
    let drawnShinyPlayerCount = 0;
    const drawn = selected.map((item) => {
      let isShiny = false;
      if (item.isAlwaysShiny || item.type === 'team' || item.type === 'trophy') {
        isShiny = true;
      } else {
        const shinyProbability = drawnShinyPlayerCount === 0 ? 0.05 : 0.02;
        if (Math.random() < shinyProbability) {
          isShiny = true;
          drawnShinyPlayerCount++;
        }
      }
      return {
        ...item,
        isShiny
      };
    });

    // CRITICAL REQUIREMENT: Sort cards so non-shiny come first, and ALL PARILTILI (SHINY) CARDS ARE AT THE END!
    drawn.sort((a, b) => (a.isShiny === b.isShiny ? 0 : a.isShiny ? 1 : -1));

    setDrawnCards(drawn);
    setPackStage('box');
    setActivePackCardIndex(-1);
    setShinyStarStage('none');
    setIsOpeningPackModal(true);
  };

  // Step-by-Step Card Reveal Engine (Auto-Sticks Card to Album)
  const handleProceedToNextCard = async (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= drawnCards.length) return;

    const card = drawnCards[targetIndex];
    setPackStage('card');
    setActivePackCardIndex(targetIndex);

    // Save drawn card to Firestore automatically (No prompt needed!)
    if (currentUser?.uid) {
      await saveCardToFirestore(card);
    }

    // If card is shiny, trigger Star Growing -> Yellow Glow animation!
    if (card.isShiny) {
      setShinyStarStage('star');
      setTimeout(() => {
        setShinyStarStage('yellow');
        setTimeout(() => {
          setShinyStarStage('none');
        }, 700);
      }, 700);
    } else {
      setShinyStarStage('none');
    }
  };

  const saveCardToFirestore = async (card: any) => {
    if (!currentUser?.uid) return;
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const albumDocRef = doc(db, 'users', currentUser.uid, 'album', card.slotCode);

      const existing = userAlbum[card.slotCode];

      let newHasNormal = existing?.hasNormal || false;
      let newHasShiny = existing?.hasShiny || false;
      let newCountNormal = existing?.countNormal || 0;
      let newCountShiny = existing?.countShiny || 0;
      let selectedVar: 'normal' | 'shiny' = existing?.selectedVariant || (card.isShiny ? 'shiny' : 'normal');

      if (card.isShiny) {
        if (!newHasShiny) {
          newHasShiny = true;
          selectedVar = 'shiny'; // Auto select shiny if newly acquired
        }
        newCountShiny++;
      } else {
        if (!newHasNormal) {
          newHasNormal = true;
        }
        newCountNormal++;
      }

      await setDoc(albumDocRef, {
        slotCode: card.slotCode,
        hasNormal: newHasNormal,
        hasShiny: newHasShiny,
        selectedVariant: selectedVar,
        countNormal: newCountNormal,
        countShiny: newCountShiny,
        updatedAt: Date.now()
      }, { merge: true });

      // Update user lastPackOpenedAt timestamp & stats
      await setDoc(userDocRef, {
        lastPackOpenedAt: isTestUser ? 0 : Date.now()
      }, { merge: true });

    } catch (err) {
      console.error('Error saving drawn card:', err);
    }
  };

  // Toggle user's preferred card display variant (Normal vs Shiny)
  const handleToggleCardVariant = async (slotCode: string, newVariant: 'normal' | 'shiny') => {
    if (!currentUser?.uid) return;

    // Optimistically update userAlbum state immediately
    setUserAlbum((prev) => {
      const existing = prev[slotCode];
      if (!existing) return prev;
      return {
        ...prev,
        [slotCode]: {
          ...existing,
          selectedVariant: newVariant
        }
      };
    });

    // Optimistically update selectedCardModal state if open
    setSelectedCardModal((prev: any) => {
      if (!prev) return null;
      return {
        ...prev,
        isShiny: newVariant === 'shiny',
        userAlbumEntry: prev.userAlbumEntry ? {
          ...prev.userAlbumEntry,
          selectedVariant: newVariant
        } : prev.userAlbumEntry
      };
    });

    try {
      const ref = doc(db, 'users', currentUser.uid, 'album', slotCode);
      await setDoc(ref, { selectedVariant: newVariant }, { merge: true });
    } catch (err) {
      console.error('Error updating card variant:', err);
    }
  };

  // TEST / ADMIN USER ACTION: Clear Album Data completely
  const handleClearAlbum = async () => {
    if (!currentUser?.uid) return;
    const canClear = isTestUser || currentUser?.test || currentUser?.admin;
    if (!canClear) {
      alert('⚠️ Albüm boşaltma işlemi sadece test veya admin modunda çalışır.');
      return;
    }

    const confirmed = window.confirm('⚠️ TEST MODU: Albümdeki tüm kartlarınızı ve istatistiklerinizi sıfırlamak istiyor musunuz?');
    if (!confirmed) return;

    try {
      // Optimistically reset local React states immediately
      setUserAlbum({});
      setUserStats({ totalUniqueCards: 0, totalShinyCards: 0 });
      setLastPackOpenedAt(0);

      const snap = await getDocs(collection(db, 'users', currentUser.uid, 'album'));
      const docs = snap.docs;

      // Delete in chunks of max 400 documents to avoid Firestore batch limits
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + 400);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      const userDocRef = doc(db, 'users', currentUser.uid);
      await setDoc(userDocRef, {
        totalUniqueCards: 0,
        totalShinyCards: 0,
        lastPackOpenedAt: 0
      }, { merge: true });

      alert('✅ Albümünüz başarıyla sıfırlandı!');
    } catch (err: any) {
      console.error('Album clear error:', err);
      alert('Sıfırlama hatası: ' + (err?.message || err));
    }
  };

  const totalSpreads = 1 + teamsData.length;

  const handleNextSpread = () => {
    if (currentSpreadIndex < totalSpreads - 1) {
      setCurrentSpreadIndex((prev) => prev + 1);
    }
  };

  const handlePrevSpread = () => {
    if (currentSpreadIndex > 0) {
      setCurrentSpreadIndex((prev) => prev - 1);
    }
  };

  // Format Timer HH:MM:SS
  const formatTimer = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Check if a slot is unlocked for current user
  const checkIsUnlocked = (slotCode: string) => {
    if (isTestUser) return true;
    const entry = userAlbum[slotCode];
    return Boolean(entry && (entry.hasNormal || entry.hasShiny));
  };

  // Get active variant for an unlocked card
  const getCardVariant = (slotCode: string): 'normal' | 'shiny' => {
    const entry = userAlbum[slotCode];
    if (!entry) return 'normal';
    if (entry.selectedVariant === 'shiny' && entry.hasShiny) return 'shiny';
    if (!entry.hasNormal && entry.hasShiny) return 'shiny';
    return 'normal';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-24 select-text relative">
      
      {/* Navigation Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="bg-brand-card hover:bg-brand-maroon hover:text-white text-brand-maroon font-black text-xs md:text-sm px-4 py-2 rounded-2xl border-2 border-brand-maroon/30 shadow-sm transition-all cursor-pointer uppercase flex items-center gap-2"
            >
              <span>←</span>
              <span>Geri</span>
            </button>
          )}
          <span className="text-xs font-black uppercase text-brand-maroon tracking-wider bg-brand-gold/20 px-3 py-1.5 rounded-full border border-brand-gold/40 flex items-center gap-1.5">
            <span>📖</span>
            <span>2026 RESMİ KART & STİCKER ALBÜMÜ</span>
          </span>
        </div>

        {/* Top Header Controls: Statistics, Test Mode & Album Actions */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* STATISTICS LEADERBOARD BUTTON */}
          <button
            onClick={() => {
              fetchLeaderboard();
              setShowStatsModal(true);
            }}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-brand-maroon font-black text-xs px-3.5 py-1.5 rounded-2xl border-2 border-amber-300 shadow-md transition-transform hover:scale-105 cursor-pointer uppercase flex items-center gap-1.5"
          >
            <span>📊</span>
            <span>İSTATİSTİKLER</span>
          </button>

          {/* TEST MODE / ADMIN CLEAR ALBUM BUTTON */}
          {(isTestUser || currentUser?.test || currentUser?.admin) && (
            <button
              onClick={handleClearAlbum}
              className="bg-red-800 hover:bg-red-900 text-amber-200 font-black text-xs px-3 py-1.5 rounded-2xl border border-red-500 shadow-sm transition-all cursor-pointer uppercase flex items-center gap-1"
              title="Test ve Admin kullanıcıları için albüm kartlarını tamamen boşaltır"
            >
              <span>🗑️</span>
              <span>ALBÜMÜ BOŞALT</span>
            </button>
          )}

          {/* User Status / Test Mode Badge */}
          {isTestUser && (
            <span className="text-[11px] font-black uppercase bg-gradient-to-r from-emerald-600 to-green-700 text-white px-3 py-1 rounded-full border border-emerald-400 shadow-md flex items-center gap-1.5">
              <span>✨</span>
              <span>TEST MODU (SINIRSIZ KUTU)</span>
            </span>
          )}

          {isOpen && (
            <button
              onClick={() => setIsOpen(false)}
              className="bg-red-700 hover:bg-red-800 text-white font-black text-xs px-4 py-2 rounded-2xl border-2 border-red-900 shadow-sm transition-all cursor-pointer uppercase flex items-center gap-1.5"
            >
              <span>📘</span>
              <span>Kapağı Kapat</span>
            </button>
          )}
        </div>
      </div>

      {/* COVER VIEW (UNOPENED ALBUM) */}
      {!isOpen ? (
        <div className="relative max-w-2xl mx-auto my-6">
          <div className="bg-gradient-to-br from-[#800000] via-[#500000] to-[#1f0000] text-white rounded-3xl p-6 sm:p-10 border-4 border-amber-400 shadow-2xl relative overflow-hidden text-center space-y-6 transform hover:scale-[1.01] transition-transform duration-300">
            
            <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-amber-400/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -left-20 -top-20 w-80 h-80 bg-red-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="inline-flex items-center gap-2 bg-amber-400 text-[#800000] px-4 py-1.5 rounded-full font-black text-xs sm:text-sm uppercase tracking-widest shadow-md">
              <span>⭐ OFFICIAL PANINI STYLE COLLECTION 2026</span>
            </div>

            <div className="flex justify-center items-center gap-4 py-2">
              <div className="w-20 h-24 sm:w-28 sm:h-32 bg-white/10 rounded-2xl border-2 border-amber-400/50 p-3 flex items-center justify-center transform -rotate-6 shadow-lg">
                <img 
                  src="https://tmssl.akamaized.net//images/erfolge/header/101.png?lm=1774860361" 
                  alt="Dünya Kupası"
                  className="max-h-full object-contain filter drop-shadow-md"
                />
              </div>
              <div className="w-24 h-28 sm:w-32 sm:h-36 bg-gradient-to-b from-amber-300 to-amber-500 text-[#800000] rounded-2xl border-4 border-white p-3 flex flex-col items-center justify-center shadow-2xl z-10 transform scale-105">
                <span className="text-3xl sm:text-4xl">🏆</span>
                <span className="font-black text-xs sm:text-sm uppercase mt-1">FIFA 2026</span>
                <span className="text-[9px] font-extrabold tracking-widest">STİCKER ALBÜMÜ</span>
              </div>
              <div className="w-20 h-24 sm:w-28 sm:h-32 bg-white/10 rounded-2xl border-2 border-amber-400/50 p-3 flex items-center justify-center transform rotate-6 shadow-lg">
                <img 
                  src="https://imgs.search.brave.com/GGCCkycLhLk2WrdB2s5ycWcSUunAJlDIBJ8hmFpbxuI/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly93d3cu/cG5nbWFydC5jb20v/ZmlsZXMvMjIvVUVG/QS1DaGFtcGlvbnMt/TGVhZ3VlLVBORy1Q/aWMucG5n" 
                  alt="Champions League"
                  className="max-h-full object-contain filter drop-shadow-md"
                />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl sm:text-5xl font-black uppercase text-amber-300 tracking-tight drop-shadow-md">
                FUTBOL KART & ALBÜM MÜZESİ
              </h1>
              <p className="text-xs sm:text-sm font-bold text-amber-100 max-w-md mx-auto">
                Tüm kupaların, alfabe sırasına göre takımların ve tüm oyuncuların sticker yuvalarının yer aldığı özel koleksiyon albümü.
              </p>
            </div>

            {/* User Collection Stats Banner */}
            <div className="bg-black/40 border border-amber-400/40 rounded-2xl p-3 max-w-md mx-auto flex items-center justify-around">
              <div>
                <span className="text-[10px] font-bold text-amber-200 uppercase block">Koleksiyonunuz</span>
                <span className="text-lg font-black text-amber-400">{userStats.totalUniqueCards} Kart</span>
              </div>
              <div className="w-px h-8 bg-amber-400/30"></div>
              <div>
                <span className="text-[10px] font-bold text-amber-200 uppercase block">Parıltılı Kartlar</span>
                <span className="text-lg font-black text-yellow-300">✨ {userStats.totalShinyCards}</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  setIsOpen(true);
                  setCurrentSpreadIndex(0);
                }}
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-[#800000] font-black text-base sm:text-lg uppercase rounded-2xl border-4 border-white shadow-2xl transition-transform hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center gap-3 mx-auto"
              >
                <span>📖</span>
                <span>KAPAĞI AÇ VE ALBÜME GİR</span>
                <span>→</span>
              </button>
            </div>

            <div className="flex justify-center items-center gap-6 pt-2 border-t border-white/10 text-[11px] font-extrabold text-amber-200">
              <span>🏆 {TROPHIES_LIST.length} Kupa Yuvası</span>
              <span>•</span>
              <span>🛡️ {teamsData.length} Takım Yuvası</span>
              <span>•</span>
              <span>📄 {totalSpreads * 2} Sayfa Spred</span>
            </div>

          </div>
        </div>
      ) : (
        /* OPENED ALBUM SPREAD */
        <div className="space-y-4">
          
          {/* Top Spread Controls */}
          <div className="bg-brand-card p-3 sm:p-4 rounded-2xl border-2 border-brand-maroon/30 shadow-md flex flex-wrap items-center justify-between gap-3">
            
            <button
              onClick={handlePrevSpread}
              disabled={currentSpreadIndex === 0}
              className="px-4 py-2 rounded-xl font-black text-xs uppercase bg-brand-maroon text-amber-300 hover:bg-[#500000] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>←</span>
              <span>Önceki Sayfa ({currentSpreadIndex * 2 > 0 ? `${currentSpreadIndex * 2 - 1}-${currentSpreadIndex * 2}` : 'Kapak'})</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-brand-dark uppercase hidden sm:inline">Dizin / Sayfa:</span>
              <select
                value={currentSpreadIndex}
                onChange={(e) => setCurrentSpreadIndex(Number(e.target.value))}
                className="bg-white border-2 border-brand-maroon/30 rounded-xl px-3 py-1.5 font-black text-xs text-brand-maroon"
              >
                <option value={0}>Sayfa 1 - 2: 🏆 KUPALAR & ÖDÜLLER SPREAD</option>
                {teamsData.map((t, idx) => (
                  <option key={t.id} value={idx + 1}>
                    Sayfa {(idx + 1) * 2 + 1} - {(idx + 1) * 2 + 2}: 🛡️ {t.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleNextSpread}
              disabled={currentSpreadIndex === totalSpreads - 1}
              className="px-4 py-2 rounded-xl font-black text-xs uppercase bg-brand-maroon text-amber-300 hover:bg-[#500000] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>Sonraki Sayfa ({(currentSpreadIndex + 1) * 2 + 1}-{(currentSpreadIndex + 1) * 2 + 2})</span>
              <span>→</span>
            </button>
          </div>

          {/* REALISTIC 2-PAGE ALBUM CONTAINER */}
          <div className="bg-[#e60000] p-3 sm:p-6 rounded-3xl border-4 border-[#990000] shadow-2xl relative">
            
            {/* Book Spine Shadow */}
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-6 bg-gradient-to-r from-black/20 via-black/40 to-black/20 z-20 pointer-events-none hidden md:block"></div>

            {/* Double Page Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 relative z-10">

              {/* SPREAD 0: TROPHIES & AWARDS (PAGES 1 & 2) */}
              {currentSpreadIndex === 0 ? (
                <>
                  {/* LEFT PAGE (PAGE 1: TROPHIES - PART 1) */}
                  <div className="bg-[#c20000] p-4 sm:p-5 rounded-2xl border-2 border-[#800000] shadow-inner relative flex flex-col justify-between min-h-[550px]">
                    <div className="space-y-4">
                      <div className="bg-[#800000] text-amber-300 p-3 rounded-xl border border-amber-400/40 flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-black uppercase tracking-widest text-amber-200 block">KOLLEKSİYON SAYFASI #1</span>
                          <h2 className="text-base sm:text-lg font-black uppercase">🏆 RESMİ KUPALAR</h2>
                        </div>
                        <span className="text-2xl">🥇</span>
                      </div>

                      {/* Trophies Grid Part 1 */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {TROPHIES_LIST.slice(0, 6).map((trophy, index) => {
                          const slotCode = `TR-${String(index + 1).padStart(2, '0')}`;
                          const isUnlocked = checkIsUnlocked(slotCode);
                          return (
                            <ShinySpecialStickerCard
                              key={trophy.id}
                              title={trophy.name}
                              image={trophy.icon}
                              slotCode={slotCode}
                              type="trophy"
                              isUnlocked={isUnlocked}
                              onClick={() => setSelectedCardModal({ 
                                title: trophy.name, 
                                image: trophy.icon, 
                                type: 'trophy', 
                                slotCode,
                                isUnlocked,
                                userAlbumEntry: userAlbum[slotCode]
                              })}
                            />
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-amber-400/20 flex justify-between items-center text-[10px] font-black text-amber-200">
                      <span>PANINI STYLE 2026</span>
                      <span>SAYFA 1</span>
                    </div>
                  </div>

                  {/* RIGHT PAGE (PAGE 2: TROPHIES - PART 2) */}
                  <div className="bg-[#c20000] p-4 sm:p-5 rounded-2xl border-2 border-[#800000] shadow-inner relative flex flex-col justify-between min-h-[550px]">
                    <div className="space-y-4">
                      <div className="bg-[#800000] text-amber-300 p-3 rounded-xl border border-amber-400/40 flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-black uppercase tracking-widest text-amber-200 block">KOLLEKSİYON SAYFASI #2</span>
                          <h2 className="text-base sm:text-lg font-black uppercase">⭐ BİREYSEL ÖDÜLLER</h2>
                        </div>
                        <span className="text-2xl">⚽</span>
                      </div>

                      {/* Trophies Grid Part 2 */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {TROPHIES_LIST.slice(6).map((trophy, index) => {
                          const slotCode = `TR-${String(index + 7).padStart(2, '0')}`;
                          const isUnlocked = checkIsUnlocked(slotCode);
                          return (
                            <ShinySpecialStickerCard
                              key={trophy.id}
                              title={trophy.name}
                              image={trophy.icon}
                              slotCode={slotCode}
                              type="trophy"
                              isUnlocked={isUnlocked}
                              onClick={() => setSelectedCardModal({ 
                                title: trophy.name, 
                                image: trophy.icon, 
                                type: 'trophy', 
                                slotCode,
                                isUnlocked,
                                userAlbumEntry: userAlbum[slotCode]
                              })}
                            />
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-amber-400/20 flex justify-between items-center text-[10px] font-black text-amber-200">
                      <span>PANINI STYLE 2026</span>
                      <span>SAYFA 2</span>
                    </div>
                  </div>
                </>
              ) : (
                /* SPREADS 1+: TEAM & PLAYERS SPREAD */
                (() => {
                  const team = teamsData[currentSpreadIndex - 1];
                  if (!team) return null;

                  const pageNumLeft = currentSpreadIndex * 2 + 1;
                  const pageNumRight = currentSpreadIndex * 2 + 2;

                  const midIndex = Math.ceil(team.players.length / 2);
                  const leftPlayers = team.players.slice(0, midIndex);
                  const rightPlayers = team.players.slice(midIndex);

                  const teamLogoSlotCode = `${team.code}-01`;
                  const isTeamLogoUnlocked = checkIsUnlocked(teamLogoSlotCode);

                  return (
                    <>
                      {/* LEFT PAGE: TEAM EMBLEM & PLAYERS PART 1 */}
                      <div className="bg-[#c20000] p-4 sm:p-5 rounded-2xl border-2 border-[#800000] shadow-inner relative flex flex-col justify-between min-h-[550px]">
                        <div className="space-y-4">
                          
                          <div className="bg-[#800000] text-amber-300 p-3 rounded-xl border border-amber-400/40 flex items-center justify-between">
                            <div>
                              <span className="text-[9px] font-black uppercase tracking-widest text-amber-200 block">
                                {team.country ? `🛡️ ${team.country.toUpperCase()}` : '🛡️ TAKIM ALBÜMÜ'}
                              </span>
                              <h2 className="text-base sm:text-xl font-black uppercase truncate max-w-[200px] sm:max-w-xs">
                                {team.name}
                              </h2>
                            </div>
                            <span className="text-xs font-black bg-amber-400 text-[#800000] px-2 py-1 rounded font-mono">
                              {team.code}
                            </span>
                          </div>

                          {/* Team Badge Sticker Slot */}
                          <div className="bg-[#800000] border-2 border-amber-400 p-3 sm:p-4 rounded-xl flex items-center gap-4">
                            <div className="w-28 sm:w-36 shrink-0">
                              <ShinySpecialStickerCard
                                title={team.name}
                                image={team.logo}
                                slotCode={teamLogoSlotCode}
                                type="team"
                                isUnlocked={isTeamLogoUnlocked}
                                onClick={() => setSelectedCardModal({ 
                                  title: team.name, 
                                  image: team.logo, 
                                  type: 'team', 
                                  slotCode: teamLogoSlotCode,
                                  isUnlocked: isTeamLogoUnlocked,
                                  userAlbumEntry: userAlbum[teamLogoSlotCode]
                                })}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest block">
                                RESMİ KULÜP ARMASI
                              </span>
                              <h4 className="font-black text-base text-white uppercase truncate">{team.name} AMBLEMİ</h4>
                              <p className="text-[11px] font-bold text-amber-200 mt-1">
                                Parıltılı özel hologram baskılı büyük amblem sticker yeri.
                              </p>
                            </div>
                          </div>

                          {/* Players Grid Part 1 */}
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-black text-amber-300 uppercase block tracking-wider">
                              OYUNCU STİCKER KARTLARI (SOL SAYFA)
                            </span>
                            
                            {leftPlayers.length === 0 ? (
                              <div className="bg-[#a30000] p-4 rounded-xl border border-dashed border-amber-300/50 text-center">
                                <p className="text-xs font-bold text-amber-200">Bu takıma ait oyuncu yuvaları oluşturuluyor...</p>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                {leftPlayers.map((player, pIdx) => {
                                  const slotCode = `${team.code}-${String(pIdx + 2).padStart(2, '0')}`;
                                  const isUnlocked = checkIsUnlocked(slotCode);
                                  const variant = getCardVariant(slotCode);
                                  const isShiny = variant === 'shiny';

                                  return (
                                    <PlayerStickerCard
                                      key={player.id}
                                      player={player}
                                      teamLogo={team.logo}
                                      slotCode={slotCode}
                                      isUnlocked={isUnlocked}
                                      isShiny={isShiny}
                                      onClick={() => setSelectedCardModal({ 
                                        ...player, 
                                        teamLogo: team.logo, 
                                        slotCode,
                                        isUnlocked,
                                        isShiny,
                                        userAlbumEntry: userAlbum[slotCode]
                                      })}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-amber-400/20 flex justify-between items-center text-[10px] font-black text-amber-200">
                          <span>{team.name}</span>
                          <span>SAYFA {pageNumLeft}</span>
                        </div>
                      </div>

                      {/* RIGHT PAGE: PLAYERS PART 2 */}
                      <div className="bg-[#c20000] p-4 sm:p-5 rounded-2xl border-2 border-[#800000] shadow-inner relative flex flex-col justify-between min-h-[550px]">
                        <div className="space-y-4">
                          
                          <div className="bg-[#800000] text-amber-300 p-3 rounded-xl border border-amber-400/40 flex items-center justify-between">
                            <div>
                              <span className="text-[9px] font-black uppercase tracking-widest text-amber-200 block">
                                KADRO STİCKER ALANLARI
                              </span>
                              <h3 className="text-base font-black uppercase">
                                {team.name} (DEVAMI)
                              </h3>
                            </div>
                            <span className="text-xs font-black bg-amber-400 text-[#800000] px-2 py-1 rounded font-mono">
                              {team.code}
                            </span>
                          </div>

                          {/* Players Grid Part 2 */}
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-black text-amber-300 uppercase block tracking-wider">
                              OYUNCU STİCKER KARTLARI (SAĞ SAYFA)
                            </span>

                            {rightPlayers.length === 0 ? (
                              <div className="bg-[#a30000] p-6 rounded-xl border border-dashed border-amber-300/50 text-center my-4">
                                <span className="text-2xl block mb-1">⚽</span>
                                <p className="text-xs font-bold text-amber-200">Diğer oyuncu yuvaları sağ sayfada görüntülenecektir.</p>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                {rightPlayers.map((player, pIdx) => {
                                  const slotNum = leftPlayers.length + pIdx + 2;
                                  const slotCode = `${team.code}-${String(slotNum).padStart(2, '0')}`;
                                  const isUnlocked = checkIsUnlocked(slotCode);
                                  const variant = getCardVariant(slotCode);
                                  const isShiny = variant === 'shiny';

                                  return (
                                    <PlayerStickerCard
                                      key={player.id}
                                      player={player}
                                      teamLogo={team.logo}
                                      slotCode={slotCode}
                                      isUnlocked={isUnlocked}
                                      isShiny={isShiny}
                                      onClick={() => setSelectedCardModal({ 
                                        ...player, 
                                        teamLogo: team.logo, 
                                        slotCode,
                                        isUnlocked,
                                        isShiny,
                                        userAlbumEntry: userAlbum[slotCode]
                                      })}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>

                        </div>

                        <div className="pt-3 border-t border-amber-400/20 flex justify-between items-center text-[10px] font-black text-amber-200">
                          <span>PANINI STYLE 2026</span>
                          <span>SAYFA {pageNumRight}</span>
                        </div>
                      </div>
                    </>
                  );
                })()
              )}

            </div>
          </div>

          {/* Bottom Spread Navigation */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={handlePrevSpread}
              disabled={currentSpreadIndex === 0}
              className="px-5 py-2.5 rounded-2xl font-black text-xs uppercase bg-brand-maroon text-amber-300 hover:bg-[#500000] disabled:opacity-40 transition-colors cursor-pointer"
            >
              ← Önceki Sayfalar
            </button>

            <span className="text-xs font-black text-brand-dark uppercase bg-amber-100 px-3 py-1 rounded-full border border-amber-300">
              Spred {currentSpreadIndex + 1} / {totalSpreads}
            </span>

            <button
              onClick={handleNextSpread}
              disabled={currentSpreadIndex === totalSpreads - 1}
              className="px-5 py-2.5 rounded-2xl font-black text-xs uppercase bg-brand-maroon text-amber-300 hover:bg-[#500000] disabled:opacity-40 transition-colors cursor-pointer"
            >
              Sonraki Sayfalar →
            </button>
          </div>

        </div>
      )}

      {/* ======================================================= */}
      {/* FLOATING PACK TRIGGER BUTTON & INFO BUTTON (BOTTOM RIGHT) */}
      {/* ======================================================= */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 animate-bounce-subtle">
        
        {/* Info 'i' Button */}
        <button
          onClick={() => setShowInfoModal(true)}
          className="w-9 h-9 bg-amber-400 hover:bg-amber-300 text-brand-maroon rounded-full border-2 border-white shadow-lg flex items-center justify-center font-black text-sm transition-transform hover:scale-110 cursor-pointer"
          title="Kutu Oranları ve Detaylı Bilgiler"
        >
          i
        </button>

        {/* Floating Pack Trigger Button */}
        <button
          onClick={handleOpenPackClick}
          disabled={!isTestUser && timeLeftMs > 0}
          className={`px-5 py-3 rounded-2xl border-4 border-white shadow-2xl flex items-center gap-3 transition-all cursor-pointer transform hover:scale-105 active:scale-95 ${
            isTestUser || timeLeftMs === 0
              ? 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-brand-maroon animate-pulse ring-4 ring-amber-400/50'
              : 'bg-stone-700 text-stone-300 cursor-not-allowed opacity-90'
          }`}
        >
          <span className="text-2xl">📦</span>
          <div className="text-left">
            <span className="font-black text-xs uppercase tracking-tight block">
              {isTestUser || timeLeftMs === 0 ? 'KUTU AÇ (5 KART)' : 'KUTU KİLİTLİ'}
            </span>
            <span className="text-[10px] font-bold block opacity-90 font-mono">
              {isTestUser
                ? '✨ SINIRSIZ AÇILIŞ'
                : timeLeftMs > 0
                ? `⏱️ ${formatTimer(timeLeftMs)}`
                : '🎁 ÜCRETSİZ KUTUN HAZIR!'}
            </span>
          </div>
        </button>

      </div>

      {/* ======================================================= */}
      {/* PACK OPENING REVEAL OVERLAY MODAL */}
      {/* ======================================================= */}
      {isOpeningPackModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center p-3 animate-fade-in overflow-hidden">
          
          {/* Keyframe animation inline styles for Star Expansion & Yellow Flash */}
          <style>{`
            @keyframes starExpandScreen {
              0% { transform: scale(0.1) rotate(0deg); opacity: 0.3; }
              40% { transform: scale(6) rotate(120deg); opacity: 1; }
              80% { transform: scale(40) rotate(240deg); opacity: 0.95; }
              100% { transform: scale(70) rotate(360deg); opacity: 0; }
            }
            .animate-star-expand {
              animation: starExpandScreen 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `}</style>

          {/* 1. STAGE STAR GROWING ANIMATION OVERLAY */}
          {shinyStarStage === 'star' && (
            <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center overflow-hidden bg-black/70">
              <span className="text-8xl sm:text-9xl filter drop-shadow-[0_0_40px_rgba(251,191,36,1)] animate-star-expand">
                ⭐
              </span>
            </div>
          )}

          {/* 2. STAGE YELLOW GLOW ANIMATION OVERLAY */}
          {shinyStarStage === 'yellow' && (
            <div className="absolute inset-0 z-50 pointer-events-none flex flex-col items-center justify-center bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 animate-pulse p-4 text-center">
              <span className="text-7xl sm:text-9xl block animate-bounce filter drop-shadow-2xl">✨</span>
              <h2 className="text-3xl sm:text-5xl font-black uppercase text-brand-maroon tracking-wider bg-white/90 px-8 py-3 rounded-full border-4 border-amber-400 shadow-2xl mt-4">
                PARILTILI EFSANEVİ KART!
              </h2>
            </div>
          )}

          {/* MAIN MODAL CONTAINER */}
          <div className="bg-gradient-to-b from-[#7A1515] via-[#500000] to-[#2A0202] border-4 border-amber-400 rounded-3xl p-4 sm:p-6 max-w-3xl w-full text-center space-y-4 shadow-2xl relative text-white max-h-[95vh] flex flex-col justify-between overflow-y-auto">
            
            <button
              onClick={() => setIsOpeningPackModal(false)}
              className="absolute top-4 right-4 bg-red-800 text-white rounded-full w-9 h-9 flex items-center justify-center font-black text-sm hover:bg-red-900 transition-colors cursor-pointer border border-amber-300 z-30"
            >
              ✕
            </button>

            {/* HEADER */}
            <div className="space-y-1">
              <span className="text-[10px] sm:text-xs font-black uppercase text-amber-300 bg-black/50 px-3 py-1 rounded-full border border-amber-400/50 inline-block">
                OFFICIAL PANINI STYLE STICKER PACK
              </span>
              <h2 className="text-xl sm:text-2xl font-black uppercase text-amber-300 flex items-center justify-center gap-2">
                <span>📦</span>
                <span>KUTU AÇILIŞI (5 KART)</span>
              </h2>
            </div>

            {/* STAGE 1: HUGE PACK BOX IN CENTER */}
            {packStage === 'box' && (
              <div className="py-6 flex flex-col items-center justify-center space-y-6 animate-fade-in">
                <div 
                  onClick={() => handleProceedToNextCard(0)}
                  className="w-56 h-72 sm:w-64 sm:h-84 bg-gradient-to-br from-amber-400 via-amber-600 to-[#7A1515] border-8 border-amber-300 rounded-3xl p-6 flex flex-col items-center justify-between text-center cursor-pointer transform hover:scale-105 transition-all shadow-[0_0_50px_rgba(251,191,36,0.6)] animate-pulse relative overflow-hidden group select-none"
                >
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent transform -rotate-45 group-hover:translate-x-full transition-transform duration-1000"></div>

                  <span className="text-xs font-black uppercase bg-black/60 text-amber-300 px-3 py-1 rounded-full border border-amber-300/60">
                    2026 PANINI ALBÜM KUTUSU
                  </span>

                  <div className="my-auto space-y-2">
                    <span className="text-7xl sm:text-8xl block filter drop-shadow-2xl transform group-hover:rotate-12 transition-transform duration-300">
                      📦
                    </span>
                    <span className="text-xs sm:text-sm font-black text-white bg-red-900/90 px-3 py-1 rounded-full border border-amber-300 block">
                      5 ADET KART İÇERİR
                    </span>
                  </div>

                  <div className="w-full bg-amber-400 text-brand-maroon py-2 px-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg border border-amber-200">
                    👇 AÇMAK İÇİN KUTUYA TIKLA!
                  </div>
                </div>

                <p className="text-xs font-bold text-amber-200 animate-bounce">
                  Kutuya tıklayarak ilk kartınızı görüntüleyin!
                </p>
              </div>
            )}

            {/* STAGE 2: CARDS REVEAL (LEFT COLUMN PREVIOUS SMALL, CENTER ACTIVE BIG) */}
            {packStage === 'card' && activePackCardIndex >= 0 && (
              <div className="py-2 flex-1 flex flex-col sm:flex-row items-center justify-around gap-4 min-h-[360px]">
                
                {/* LEFT SIDE: PREVIOUS REVEALED CARDS SMALL QUEUE */}
                <div className="w-full sm:w-48 bg-black/40 border border-amber-400/30 rounded-2xl p-3 flex flex-row sm:flex-col items-center gap-2 overflow-x-auto sm:overflow-y-auto max-h-48 sm:max-h-80">
                  <span className="text-[10px] font-black uppercase text-amber-300 block w-full text-center border-b border-amber-400/20 pb-1">
                    ÇIKAN KARTLAR ({activePackCardIndex + 1}/5)
                  </span>

                  {drawnCards.map((c, idx) => {
                    if (idx > activePackCardIndex) return null; // Not reached yet
                    const isCurrent = idx === activePackCardIndex;

                    return (
                      <div
                        key={idx}
                        className={`flex-shrink-0 w-16 sm:w-full p-1.5 rounded-xl border flex sm:flex-row flex-col items-center gap-1.5 text-left transition-all ${
                          isCurrent
                            ? 'bg-amber-400 text-brand-maroon border-white shadow-lg font-black scale-105'
                            : 'bg-black/60 text-amber-200 border-amber-400/40 opacity-80'
                        }`}
                      >
                        <span className="text-[9px] font-black bg-black/60 text-amber-300 px-1 py-0.5 rounded">
                          #{idx + 1}
                        </span>
                        <div className="truncate text-[9px] font-bold flex-1">
                          {c.title}
                        </div>
                        {c.isShiny && (
                          <span className="text-[8px] bg-yellow-400 text-black font-black px-1 rounded">
                            ✨
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* CENTER: BIG ACTIVE CARD */}
                <div className="flex-1 flex flex-col items-center justify-center space-y-3">
                  
                  {/* BIG CARD ITEM */}
                  <div 
                    onClick={() => {
                      if (activePackCardIndex < 4) {
                        handleProceedToNextCard(activePackCardIndex + 1);
                      } else {
                        setPackStage('finished');
                      }
                    }}
                    className={`w-52 h-72 sm:w-64 sm:h-88 rounded-2xl border-4 p-3 flex flex-col justify-between items-center text-center cursor-pointer transform hover:scale-105 transition-all shadow-2xl relative select-none ${
                      drawnCards[activePackCardIndex].isShiny
                        ? 'bg-gradient-to-br from-amber-300 via-yellow-100 to-amber-500 border-amber-300 ring-4 ring-amber-300/80 shadow-[0_0_40px_rgba(251,191,36,0.8)]'
                        : 'bg-[#FFFEE8] border-[#661616] text-black shadow-xl'
                    }`}
                  >
                    {/* Top Variant Badge */}
                    <div className="w-full flex items-center justify-between">
                      <span className="text-[9px] font-black bg-brand-maroon text-amber-300 px-2 py-0.5 rounded-full border border-amber-300">
                        {drawnCards[activePackCardIndex].slotCode}
                      </span>
                      {drawnCards[activePackCardIndex].isShiny ? (
                        <span className="text-[9px] font-black bg-amber-500 text-black px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-md">
                          ✨ PARILTILI STİCKER
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold text-stone-600 bg-stone-200 px-2 py-0.5 rounded-full">
                          NORMAL STİCKER
                        </span>
                      )}
                    </div>

                    {/* Image */}
                    <div className="flex-1 flex items-center justify-center p-2 my-1 overflow-hidden">
                      <img 
                        src={drawnCards[activePackCardIndex].image || drawnCards[activePackCardIndex].playerData?.foto || 'https://via.placeholder.com/120'} 
                        alt={drawnCards[activePackCardIndex].title}
                        className="max-h-44 sm:max-h-52 max-w-full object-contain filter drop-shadow-xl"
                      />
                    </div>

                    {/* Title Banner */}
                    <div className="w-full bg-[#7A1515] text-amber-300 py-1.5 px-2 rounded-xl border border-amber-400 text-center">
                      <span className="font-black text-xs sm:text-sm uppercase tracking-tight block truncate">
                        {drawnCards[activePackCardIndex].title}
                      </span>
                    </div>

                    {/* Auto Attached Badge */}
                    <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-400 mt-1 block">
                      ✅ ALBÜME OTOMATİK YAPIŞTIRILDI
                    </span>
                  </div>

                  {/* NEXT CARD BUTTON */}
                  <button
                    onClick={() => {
                      if (activePackCardIndex < 4) {
                        handleProceedToNextCard(activePackCardIndex + 1);
                      } else {
                        setPackStage('finished');
                      }
                    }}
                    className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-brand-maroon font-black text-xs sm:text-sm uppercase rounded-xl border border-amber-200 shadow-lg transition-all cursor-pointer flex items-center gap-2 animate-pulse"
                  >
                    <span>
                      {activePackCardIndex < 4
                        ? `SONRAKİ KARTA GEÇ → (Kart ${activePackCardIndex + 2} / 5)`
                        : '✅ KUTUYU TAMAMLADIM'}
                    </span>
                  </button>

                </div>

              </div>
            )}

            {/* STAGE 3: FINISHED REVEAL SUMMARY */}
            {packStage === 'finished' && (
              <div className="py-4 space-y-4 animate-fade-in">
                <div className="bg-emerald-950/80 border-2 border-emerald-400 text-emerald-200 p-3 rounded-2xl text-xs font-black uppercase">
                  🎉 TEBRİKLER! 5 ADET STİCKER KARTINIZ ALBÜMÜNÜZE BAŞARIYLA YAPIŞTIRILDI!
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {drawnCards.map((card, idx) => (
                    <div 
                      key={idx}
                      className={`aspect-[3/4] rounded-xl border p-2 flex flex-col justify-between items-center text-center ${
                        card.isShiny
                          ? 'bg-gradient-to-br from-amber-300 to-amber-500 border-amber-300 text-black shadow-md'
                          : 'bg-[#FFFEE8] border-[#661616] text-black shadow-sm'
                      }`}
                    >
                      <span className="text-[8px] font-black bg-brand-maroon text-amber-300 px-1 rounded">
                        {card.slotCode}
                      </span>
                      <img 
                        src={card.image || card.playerData?.foto} 
                        alt={card.title} 
                        className="max-h-14 object-contain"
                      />
                      <span className="text-[8px] font-black truncate w-full bg-[#7A1515] text-amber-300 px-1 py-0.5 rounded">
                        {card.title}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setIsOpeningPackModal(false)}
                  className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm uppercase rounded-2xl border-2 border-emerald-300 shadow-xl transition-all cursor-pointer block mx-auto"
                >
                  ✅ TAMAM (ALBÜME GİT)
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* PACK PROBABILITY INFO MODAL ('i' Button) */}
      {/* ======================================================= */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-brand-card border-4 border-amber-400 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl relative text-left">
            <button
              onClick={() => setShowInfoModal(false)}
              className="absolute top-4 right-4 bg-red-700 text-white rounded-full w-8 h-8 flex items-center justify-center font-black text-sm hover:bg-red-800 transition-colors cursor-pointer"
            >
              ✕
            </button>

            <div className="text-center space-y-1">
              <span className="text-3xl">📦</span>
              <h3 className="font-black text-xl text-brand-dark uppercase">
                RESMİ STİCKER KUTUSU ORANLARI
              </h3>
              <p className="text-xs font-extrabold text-brand-maroon uppercase">
                2026 Futbol Koleksiyon Albümü
              </p>
            </div>

            <div className="space-y-3 text-xs text-stone-800 font-bold bg-amber-50/80 p-4 rounded-2xl border border-amber-200">
              <div className="flex items-center gap-2">
                <span className="text-base">🎁</span>
                <span>Her kutudan **5 Adet Sticker Kart** çıkar.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base">🚫</span>
                <span>Bir kutunun içinden **asla 2 tane aynı kart çıkmaz**.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base">✨</span>
                <span>**Parıltılı Sticker Şansı**: Kart başına **%1 ihtimaldir** (Nadir özel parıltılı kart).</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base">🏆</span>
                <span>**Kupa & Amblem Kartları**: Özel renkli ve parıltılı kalır.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base">📌</span>
                <span>**Otomatik Yapıştırma**: Çıkan kartlar albümünüze otomatik eklenir.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base">⏱️</span>
                <span>**Yenilenme Süresi**: Her **12 Saatte 1 adet** kutu verilir. Test modunda sınırsızdır.</span>
              </div>
            </div>

            <button
              onClick={() => setShowInfoModal(false)}
              className="w-full py-3 bg-brand-maroon hover:bg-[#500000] text-amber-300 font-black text-xs uppercase rounded-xl border border-amber-400 shadow-md transition-colors cursor-pointer"
            >
              ANLADIM, KAPAT
            </button>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* LEADERBOARD / STATISTICS MODAL */}
      {/* ======================================================= */}
      {showStatsModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-brand-card border-4 border-amber-400 rounded-3xl p-6 max-w-xl w-full space-y-5 shadow-2xl relative text-left">
            <button
              onClick={() => setShowStatsModal(false)}
              className="absolute top-4 right-4 bg-red-700 text-white rounded-full w-8 h-8 flex items-center justify-center font-black text-sm hover:bg-red-800 transition-colors cursor-pointer"
            >
              ✕
            </button>

            <div className="text-center space-y-1">
              <span className="text-3xl">📊</span>
              <h3 className="font-black text-2xl text-brand-dark uppercase">
                KOLEKSİYONER İSTATİSTİKLERİ
              </h3>
              <p className="text-xs font-extrabold text-brand-maroon uppercase">
                En Çok Kart & Parıltılı Sahibi Kullanıcılar (Çiftler Sayılmaz)
              </p>
            </div>

            {/* Leaderboard Lists */}
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              
              {/* Leaderboard Category 1: Most Shiny Cards */}
              <div className="bg-white p-4 rounded-2xl border-2 border-amber-300 space-y-3 shadow-xs">
                <h4 className="font-black text-xs uppercase text-amber-900 flex items-center gap-1.5 border-b pb-2 border-amber-200">
                  <span>✨</span>
                  <span>EN ÇOK PARILTILI KART SAHİPLERİ</span>
                </h4>

                <div className="space-y-2">
                  {[...leaderboardUsers]
                    .sort((a, b) => b.totalShinyCards - a.totalShinyCards)
                    .slice(0, 5)
                    .map((user, idx) => (
                      <div key={user.uid} className="flex items-center justify-between bg-amber-50/80 p-2 rounded-xl border border-amber-200 text-xs font-bold">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 bg-amber-400 text-brand-maroon rounded-full flex items-center justify-center text-[10px] font-black">
                            {idx + 1}
                          </span>
                          <span className="font-black text-stone-900">{user.displayName}</span>
                        </div>
                        <span className="font-black text-amber-800 bg-amber-200 px-2.5 py-0.5 rounded-full border border-amber-400">
                          ✨ {user.totalShinyCards} Parıltılı
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Leaderboard Category 2: Most Unique Cards */}
              <div className="bg-white p-4 rounded-2xl border-2 border-amber-300 space-y-3 shadow-xs">
                <h4 className="font-black text-xs uppercase text-brand-maroon flex items-center gap-1.5 border-b pb-2 border-amber-200">
                  <span>🏆</span>
                  <span>EN ÇOK FARKLII KART SAHİPLERİ (ÇİFTLER SAYILMAZ)</span>
                </h4>

                <div className="space-y-2">
                  {[...leaderboardUsers]
                    .sort((a, b) => b.totalUniqueCards - a.totalUniqueCards)
                    .slice(0, 5)
                    .map((user, idx) => (
                      <div key={user.uid} className="flex items-center justify-between bg-amber-50/80 p-2 rounded-xl border border-amber-200 text-xs font-bold">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 bg-brand-maroon text-amber-300 rounded-full flex items-center justify-center text-[10px] font-black">
                            {idx + 1}
                          </span>
                          <span className="font-black text-stone-900">{user.displayName}</span>
                        </div>
                        <span className="font-black text-brand-maroon bg-amber-200 px-2.5 py-0.5 rounded-full border border-amber-400">
                          ⚽ {user.totalUniqueCards} Kart
                        </span>
                      </div>
                    ))}
                </div>
              </div>

            </div>

            <button
              onClick={() => setShowStatsModal(false)}
              className="w-full py-3 bg-brand-maroon hover:bg-[#500000] text-amber-300 font-black text-xs uppercase rounded-xl border border-amber-400 shadow-md transition-colors cursor-pointer"
            >
              KAPAT
            </button>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* LOGIN PROMPT MODAL */}
      {/* ======================================================= */}
      {showLoginPromptModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-brand-card border-4 border-amber-400 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-center">
            <span className="text-4xl block">🔒</span>
            <h3 className="font-black text-xl text-brand-dark uppercase">
              GİRİŞ YAPILMALIDIR
            </h3>
            <p className="text-xs font-bold text-stone-700">
              Kutu açabilmek ve kartları koleksiyonunuza kaydedebilmek için lütfen giriş yapın.
            </p>

            <button
              onClick={() => setShowLoginPromptModal(false)}
              className="w-full py-3 bg-brand-maroon hover:bg-[#500000] text-amber-300 font-black text-xs uppercase rounded-xl border border-amber-400 shadow-md transition-colors cursor-pointer"
            >
              ANLADIM
            </button>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* CARD INSPECT & VARIANT SELECTION MODAL */}
      {/* ======================================================= */}
      {selectedCardModal && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setSelectedCardModal(null)}
        >
          <div 
            className="bg-brand-card border-4 border-amber-400 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl relative text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setSelectedCardModal(null)}
              className="absolute top-3 right-3 bg-red-700 text-white rounded-full w-8 h-8 flex items-center justify-center font-black text-sm hover:bg-red-800 transition-colors cursor-pointer"
            >
              ✕
            </button>

            <span className="text-xs font-black uppercase text-amber-800 bg-amber-200 px-3 py-1 rounded-full border border-amber-400 inline-block">
              STİCKER DETAYI #{selectedCardModal.slotCode}
            </span>

            <div className="w-56 mx-auto">
              {selectedCardModal.type === 'team' || selectedCardModal.type === 'trophy' ? (
                <ShinySpecialStickerCard 
                  title={selectedCardModal.title}
                  image={selectedCardModal.image}
                  slotCode={selectedCardModal.slotCode}
                  type={selectedCardModal.type}
                  isUnlocked={selectedCardModal.isUnlocked}
                />
              ) : (
                <PlayerStickerCard 
                  player={selectedCardModal}
                  teamLogo={selectedCardModal.teamLogo}
                  slotCode={selectedCardModal.slotCode}
                  isUnlocked={selectedCardModal.isUnlocked}
                  isShiny={selectedCardModal.isShiny}
                />
              )}
            </div>

            <div className="space-y-1">
              <h3 className="font-black text-lg text-brand-dark uppercase">
                {selectedCardModal.pname || selectedCardModal.title}
              </h3>
              {selectedCardModal.pteam && (
                <p className="text-xs font-extrabold text-brand-maroon uppercase">
                  {selectedCardModal.pteam}
                </p>
              )}
            </div>

            {/* Card Variant Selector (Normal vs Parıltılı) if user owns both or owns shiny */}
            {selectedCardModal.isUnlocked && selectedCardModal.userAlbumEntry && (
              <div className="pt-2 border-t border-amber-400/30 space-y-2">
                <span className="text-[10px] font-black uppercase text-brand-maroon block">
                  ALBÜMDE GÖRÜNECEK VERSİYONU SEÇİN:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleToggleCardVariant(selectedCardModal.slotCode, 'normal')}
                    disabled={!selectedCardModal.userAlbumEntry.hasNormal}
                    className={`py-2 px-2 rounded-xl font-black text-[10px] uppercase border transition-all cursor-pointer ${
                      selectedCardModal.userAlbumEntry.selectedVariant === 'normal' || (!selectedCardModal.userAlbumEntry.hasShiny)
                        ? 'bg-amber-400 text-brand-maroon border-brand-maroon shadow-md'
                        : 'bg-white text-stone-600 border-stone-300 hover:bg-amber-100'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    ⭐️ NORMAL
                  </button>

                  <button
                    onClick={() => handleToggleCardVariant(selectedCardModal.slotCode, 'shiny')}
                    disabled={!selectedCardModal.userAlbumEntry.hasShiny}
                    className={`py-2 px-2 rounded-xl font-black text-[10px] uppercase border transition-all cursor-pointer ${
                      selectedCardModal.userAlbumEntry.selectedVariant === 'shiny'
                        ? 'bg-amber-400 text-brand-maroon border-brand-maroon shadow-md'
                        : 'bg-white text-stone-600 border-stone-300 hover:bg-amber-100'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    ✨ PARILTILI
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
