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
  hasSecret?: boolean;
  selectedVariant: 'normal' | 'shiny' | 'secret';
  countNormal: number;
  countShiny: number;
  countSecret?: number;
}

interface LeaderboardUser {
  uid: string;
  displayName: string;
  avatar?: string;
  totalUniqueCards: number;
  totalShinyCards: number;
  totalSecretCards: number;
  isTest?: boolean;
  favTeam?: string;
}

// -------------------------------------------------------------
// PLAYER CARD COMPONENT (Supports Normal, Shiny & Secret Variants)
// -------------------------------------------------------------
interface PlayerStickerCardProps {
  key?: React.Key;
  player: PlayerAlbumItem;
  teamLogo?: string;
  slotCode: string;
  isUnlocked: boolean;
  isShiny?: boolean;
  isSecret?: boolean;
  onClick?: () => void;
}

function PlayerStickerCard({ 
  player, 
  teamLogo, 
  slotCode, 
  isUnlocked,
  isShiny = false, 
  isSecret = false,
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
      className={`w-full aspect-[3/4] relative rounded-xl overflow-hidden shadow-xl border-[3px] ${
        isSecret
          ? 'border-white bg-black text-white ring-4 ring-white/90 shadow-[0_0_25px_rgba(255,255,255,0.9)] animate-pulse'
          : isShiny
          ? 'border-amber-400 bg-gradient-to-br from-amber-200 via-yellow-100 to-amber-300 ring-2 ring-amber-400/80'
          : 'border-[#661616] bg-[#FFFEE8]'
      } cursor-pointer group transform hover:scale-105 transition-all select-none flex flex-col justify-between p-1.5 sm:p-2`}
    >
      {/* White Broken Glass / Fracture Overlay for Secret cards */}
      {isSecret && (
        <div className="absolute inset-0 pointer-events-none opacity-40 z-10">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M10 0 L50 50 L90 5 M98 45 L50 50 L85 95 M15 90 L50 50 L2 55" stroke="white" strokeWidth="0.8" fill="none" />
          </svg>
        </div>
      )}

      {/* Glossy Foil / Holographic Overlay for Shiny cards */}
      {isShiny && !isSecret && (
        <>
          <div className="absolute inset-0 bg-gradient-to-tr from-cyan-400/20 via-pink-400/20 to-yellow-200/30 mix-blend-color-dodge opacity-90 group-hover:opacity-100 transition-opacity z-10 pointer-events-none"></div>
          <div className="absolute -inset-full w-[200%] h-[200%] bg-gradient-to-r from-transparent via-white/50 to-transparent transform -rotate-45 group-hover:translate-x-full transition-transform duration-1000 z-10 pointer-events-none"></div>
        </>
      )}

      {/* Glossy White Ray Overlay for Secret cards */}
      {isSecret && (
        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-white/30 to-transparent mix-blend-overlay opacity-90 pointer-events-none"></div>
      )}

      {/* Badge (Secret vs Shiny) */}
      {isSecret ? (
        <div className="absolute top-1 right-1 z-20">
          <span className="text-[8px] font-black bg-white text-black px-1.5 py-0.5 rounded-full border border-gray-300 shadow-md flex items-center gap-0.5 animate-bounce">
            🕶️ SECRET
          </span>
        </div>
      ) : isShiny ? (
        <div className="absolute top-1 right-1 z-20">
          <span className="text-[8px] font-black bg-amber-500 text-black px-1.5 py-0.5 rounded-full border border-amber-200 shadow-xs flex items-center gap-0.5">
            ✨ PARILTILI
          </span>
        </div>
      ) : null}

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

      {/* Bottom Container: Two Large Orange/Black Boxes & Player Name Pill */}
      <div className="relative z-10 pt-1">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 items-stretch h-10 sm:h-12">
          
          {/* Left Box: Large Rating */}
          <div className={`${isSecret ? 'bg-stone-900 border-white/60' : 'bg-[#D96836] border-[#B34E1E]'} border rounded-xl flex items-center justify-center p-1 shadow-inner`}>
            <span className="text-base sm:text-xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] font-mono tracking-tighter">
              {player.gen || 85}
            </span>
          </div>

          {/* Right Box: Large Team Logo */}
          <div className={`${isSecret ? 'bg-stone-900 border-white/60' : 'bg-[#D96836] border-[#B34E1E]'} border rounded-xl flex items-center justify-center p-1 shadow-inner overflow-hidden`}>
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
          <div className={`${isSecret ? 'bg-black text-white border-white' : 'bg-[#661616] text-amber-300 border-amber-400/80'} border rounded-full py-0.5 px-2.5 text-center shadow-md w-full max-w-[95%] truncate`}>
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
  isSecret?: boolean;
  onClick?: () => void;
}

function ShinySpecialStickerCard({ 
  title, 
  image, 
  slotCode, 
  type = 'team', 
  isUnlocked, 
  isSecret = false,
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

  // UNLOCKED SHINY / SECRET STICKER
  return (
    <div 
      onClick={onClick}
      className={`w-full aspect-[3/4] relative rounded-2xl overflow-hidden shadow-2xl cursor-pointer group transform hover:scale-105 transition-all p-2 flex flex-col justify-between select-none ${
        isSecret
          ? 'bg-black border-4 border-white text-white shadow-[0_0_25px_rgba(255,255,255,0.9)] animate-pulse'
          : 'border-4 border-amber-300 bg-gradient-to-br from-amber-400 via-yellow-200 to-amber-600'
      }`}
    >
      {/* Broken glass cracks for secret card */}
      {isSecret && (
        <div className="absolute inset-0 pointer-events-none opacity-40 z-10">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M10 0 L50 50 L90 5 M98 45 L50 50 L85 95 M15 90 L50 50 L2 55" stroke="white" strokeWidth="0.8" fill="none" />
          </svg>
        </div>
      )}

      {/* Holographic Glitter & Sparkles Background */}
      {!isSecret && (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-yellow-100/70 via-amber-400/40 to-amber-800/90 z-0"></div>
          <div className="absolute inset-0 bg-gradient-to-tr from-cyan-400/30 via-pink-400/30 to-yellow-200/40 mix-blend-color-dodge opacity-85 group-hover:opacity-100 transition-opacity z-10 pointer-events-none"></div>
          <div className="absolute -inset-full w-[200%] h-[200%] bg-gradient-to-r from-transparent via-white/60 to-transparent transform -rotate-45 group-hover:translate-x-full transition-transform duration-1000 z-10 pointer-events-none"></div>
        </>
      )}

      {/* Top Foil Badge */}
      <div className="relative z-20 flex items-center justify-between">
        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border shadow-xs uppercase tracking-widest flex items-center gap-1 ${
          isSecret
            ? 'bg-white text-black border-white'
            : 'bg-[#800000] text-amber-300 border-amber-400'
        }`}>
          <span>{isSecret ? '🕶️' : '✨'}</span>
          <span>{isSecret ? 'SECRET' : 'PARILTILI'}</span>
        </span>
        <span className="text-xs">{isSecret ? '🕶️' : '⭐'}</span>
      </div>

      {/* Center: Direct Team Logo or Trophy Image */}
      <div className="relative z-20 flex-1 flex items-center justify-center p-2 my-1">
        <img 
          src={image || (type === 'team' ? 'https://via.placeholder.com/100?text=🛡️' : 'https://via.placeholder.com/100?text=🏆')} 
          alt={title}
          className={`max-h-full max-w-full object-contain filter drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)] group-hover:scale-110 transition-transform duration-300 ${
            isSecret ? 'brightness-125 contrast-125' : ''
          }`}
          onError={(e) => {
            (e.target as HTMLImageElement).src = type === 'team' ? 'https://via.placeholder.com/100?text=🛡️' : 'https://via.placeholder.com/100?text=🏆';
          }}
        />
      </div>

      {/* Bottom Name Plate: Cleanly truncated & scaled so long titles like GOLDEN BOY ÖDÜLÜ fit inside */}
      <div className={`relative z-20 border rounded-lg py-0.5 px-1 text-center shadow-lg w-full max-w-full overflow-hidden flex items-center justify-center min-h-[22px] ${
        isSecret
          ? 'bg-white text-black border-white'
          : 'bg-[#800000] text-amber-300 border-amber-300/80'
      }`}>
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
  const [hasClaimedStarterPack, setHasClaimedStarterPack] = useState<boolean>(false);
  const [secretPityCount, setSecretPityCount] = useState<number>(0);
  const [userStats, setUserStats] = useState<{ totalUniqueCards: number; totalShinyCards: number; totalSecretCards: number }>({
    totalUniqueCards: 0,
    totalShinyCards: 0,
    totalSecretCards: 0
  });

  // Modal States
  const [selectedCardModal, setSelectedCardModal] = useState<any>(null);
  const [showStatsModal, setShowStatsModal] = useState<boolean>(false);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [showLoginPromptModal, setShowLoginPromptModal] = useState<boolean>(false);

  // Leaderboard Data State
  const [leaderboardUsers, setLeaderboardUsers] = useState<LeaderboardUser[]>([]);

  // Discovered Secrets Registry State
  const [discoveredSecrets, setDiscoveredSecrets] = useState<Record<string, { discoveredBy: string; discoveredAt: number }>>({});

  // Pack Opening System State
  const [isOpeningPackModal, setIsOpeningPackModal] = useState<boolean>(false);
  const [drawnCards, setDrawnCards] = useState<any[]>([]);
  const [packStage, setPackStage] = useState<'box' | 'card' | 'finished'>('box');
  const [activePackCardIndex, setActivePackCardIndex] = useState<number>(-1);
  const [shinyStarStage, setShinyStarStage] = useState<'none' | 'star' | 'yellow'>('none');
  const [cardAnimStep, setCardAnimStep] = useState<number>(0);

  // Secret Card 5-Click Glass Shatter Overlay State
  const [secretCrackClicks, setSecretCrackClicks] = useState<number>(0);
  const [secretFlash, setSecretFlash] = useState<boolean>(false);

  // 6-Hour Cooldown Timer State (21600000 ms)
  const COOLDOWN_MS = 6 * 60 * 60 * 1000;
  const [timeLeftMs, setTimeLeftMs] = useState<number>(0);

  // Listen Discovered Secrets from Firestore
  useEffect(() => {
    const unsubSecrets = onSnapshot(doc(db, 'settings', 'discoveredSecrets'), (docSnap) => {
      if (docSnap.exists()) {
        setDiscoveredSecrets(docSnap.data() as any);
      }
    });
    return () => unsubSecrets();
  }, []);

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
          if (uData.secretPityCount !== undefined) {
            setSecretPityCount(Number(uData.secretPityCount));
          }
          setHasClaimedStarterPack(Boolean(uData.hasClaimedStarterPack));
          setUserStats({
            totalUniqueCards: uData.totalUniqueCards || 0,
            totalShinyCards: uData.totalShinyCards || 0,
            totalSecretCards: uData.totalSecretCards || 0
          });
        }
      });

      // Listen User Album Subcollection
      const unsubAlbum = onSnapshot(collection(db, 'users', currentUser.uid, 'album'), (snap) => {
        const albumMap: Record<string, UserAlbumSlotData> = {};
        let uniqueCount = 0;
        let shinyCount = 0;
        let secretCount = 0;

        snap.forEach((d) => {
          const data = d.data() as UserAlbumSlotData;
          albumMap[d.id] = data;

          if (data.hasNormal || data.hasShiny || data.hasSecret) {
            uniqueCount++;
          }
          if (data.hasShiny || data.hasSecret) {
            shinyCount++;
          }
          if (data.hasSecret) {
            secretCount++;
          }
        });

        setUserAlbum(albumMap);
        setUserStats({ totalUniqueCards: uniqueCount, totalShinyCards: shinyCount, totalSecretCards: secretCount });

        // Sync stats to user's Firestore document so leaderboard stays up to date
        setDoc(doc(db, 'users', currentUser.uid), {
          totalUniqueCards: uniqueCount,
          totalShinyCards: shinyCount,
          totalSecretCards: secretCount
        }, { merge: true }).catch((err) => console.error('Error syncing user stats to Firestore:', err));
      });

      return () => {
        unsubUserDoc();
        unsubAlbum();
      };
    } else {
      setUserAlbum({});
      setLastPackOpenedAt(0);
      setHasClaimedStarterPack(false);
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
        let secretCount = u.totalSecretCards || 0;

        // Fallback: If stats are empty, calculate directly from user's album subcollection
        if (uniqueCount === 0 && shinyCount === 0 && secretCount === 0) {
          try {
            const albumSnap = await getDocs(collection(db, 'users', d.id, 'album'));
            let uCount = 0;
            let sCount = 0;
            let secCount = 0;
            albumSnap.forEach((ad) => {
              const data = ad.data();
              if (data.hasNormal || data.hasShiny || data.hasSecret) uCount++;
              if (data.hasShiny || data.hasSecret) sCount++;
              if (data.hasSecret) secCount++;
            });
            uniqueCount = uCount;
            shinyCount = sCount;
            secretCount = secCount;

            // Save back to user document so future reads are fast
            await setDoc(doc(db, 'users', d.id), {
              totalUniqueCards: uCount,
              totalShinyCards: sCount,
              totalSecretCards: secCount
            }, { merge: true });
          } catch (e) {
            console.error('Error fetching sub-album stats for user:', d.id, e);
          }
        }

        list.push({
          uid: d.id,
          displayName: u.displayName ? `${u.displayName}${u.test ? ' (Test)' : ''}` : (u.test ? 'Test Kullanıcısı' : 'Anonim Kullanıcı'),
          avatar: u.avatar,
          totalUniqueCards: uniqueCount,
          totalShinyCards: shinyCount,
          totalSecretCards: secretCount,
          isTest: Boolean(u.test),
          favTeam: u.favTeam
        });
      }

      setLeaderboardUsers(list);
    } catch (err) {
      console.error('Leaderboard error:', err);
    }
  };

  // Trigger Leaderboard fetch on mount
  useEffect(() => {
    fetchLeaderboard();
  }, []);

  // Helper to generate N cards for pack openings with Secret Pity System (10 packs = 1 Guaranteed Secret)
  const generatePackCards = (packCount = 1, startPity = 0) => {
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

    if (pool.length < 5) return { drawn: [], nextPity: startPity };

    const drawn: any[] = [];
    let currentPity = startPity;

    for (let p = 0; p < packCount; p++) {
      currentPity += 1;
      const isPityGuaranteed = currentPity >= 10;

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

      let drawnShinyPlayerCount = 0;
      let packHasSecret = false;
      let forcedSecretIndex = -1;

      // If 10th pack pity reached, force 1 player card to be Secret
      if (isPityGuaranteed) {
        const nonShinyIdx = selected.findIndex(item => !item.isAlwaysShiny && item.type === 'player');
        forcedSecretIndex = nonShinyIdx !== -1 ? nonShinyIdx : 0;
      }

      const packDrawn = selected.map((item, idx) => {
        let isShiny = false;
        let isSecret = false;

        if (idx === forcedSecretIndex) {
          isSecret = true;
          isShiny = true;
          packHasSecret = true;
        } else if (item.isAlwaysShiny || item.type === 'team' || item.type === 'trophy') {
          isShiny = true;
        } else {
          // Secret card check: 0.6% chance
          if (Math.random() < 0.006) {
            isSecret = true;
            isShiny = true;
            packHasSecret = true;
          } else {
            // Shiny player card check: 5% for first, 2% for subsequent
            const shinyProbability = drawnShinyPlayerCount === 0 ? 0.05 : 0.02;
            if (Math.random() < shinyProbability) {
              isShiny = true;
              drawnShinyPlayerCount++;
            }
          }
        }

        return {
          ...item,
          isShiny,
          isSecret
        };
      });

      // Sort within pack: Normal first, Shiny/Secret at the end
      packDrawn.sort((a, b) => (a.isShiny === b.isShiny ? 0 : a.isShiny ? 1 : -1));
      drawn.push(...packDrawn);

      // Reset pity to 0 if a Secret card was drawn (naturally or pity guaranteed)
      if (packHasSecret) {
        currentPity = 0;
      }
    }

    return { drawn, nextPity: currentPity };
  };

  // Special Test User Generator: 5 Guaranteed Secret Cards
  const generateSecretTestPackCards = () => {
    const pool: any[] = [];
    teamsData.forEach((team) => {
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

    if (pool.length < 5) return [];

    const selected: any[] = [];
    const usedCodes = new Set<string>();

    while (selected.length < 5 && usedCodes.size < pool.length) {
      const randIdx = Math.floor(Math.random() * pool.length);
      const item = pool[randIdx];
      if (!usedCodes.has(item.slotCode)) {
        usedCodes.add(item.slotCode);
        selected.push({
          ...item,
          isShiny: true,
          isSecret: true
        });
      }
    }

    return selected;
  };

  // 5. PACK GENERATOR ENGINE (Standard 1 Pack = 5 Cards)
  const handleOpenPackClick = async () => {
    if (!currentUser) {
      setShowLoginPromptModal(true);
      return;
    }

    if (!isTestUser && timeLeftMs > 0) {
      return; // Cooldown active
    }

    const { drawn, nextPity } = generatePackCards(1, secretPityCount);
    if (drawn.length === 0) return;

    setDrawnCards(drawn);
    setSecretPityCount(nextPity);
    setPackStage('box');
    setActivePackCardIndex(-1);
    setShinyStarStage('none');
    setCardAnimStep(0);
    setSecretCrackClicks(0);
    setSecretFlash(false);
    setIsOpeningPackModal(true);

    if (currentUser?.uid) {
      setDoc(doc(db, 'users', currentUser.uid), {
        secretPityCount: nextPity
      }, { merge: true }).catch(err => console.error('Error saving pity count:', err));
    }
  };

  // 6. STARTER PACK ENGINE (One-Time 5 Packs = 25 Cards, Counts +5 for Secret Pity!)
  const handleOpenStarterPackClick = async () => {
    if (!currentUser) {
      setShowLoginPromptModal(true);
      return;
    }

    if (hasClaimedStarterPack && !isTestUser) {
      alert('⚠️ Başlangıç Paketini zaten 1 defa kullandınız!');
      return;
    }

    const { drawn, nextPity } = generatePackCards(5, secretPityCount);
    if (drawn.length === 0) return;

    setDrawnCards(drawn);
    setSecretPityCount(nextPity);
    setPackStage('box');
    setActivePackCardIndex(-1);
    setShinyStarStage('none');
    setCardAnimStep(0);
    setSecretCrackClicks(0);
    setSecretFlash(false);
    setIsOpeningPackModal(true);

    // Mark starter pack as claimed & save updated pity in Firestore
    try {
      if (currentUser?.uid) {
        await setDoc(doc(db, 'users', currentUser.uid), {
          hasClaimedStarterPack: true,
          secretPityCount: nextPity
        }, { merge: true });
        setHasClaimedStarterPack(true);
      }
    } catch (err) {
      console.error('Error claiming starter pack:', err);
    }
  };

  // 7. TEST USER SECRET PACK ENGINE (5 Secret Cards For Testing)
  const handleOpenSecretTestPackClick = () => {
    if (!currentUser) {
      setShowLoginPromptModal(true);
      return;
    }

    const drawn = generateSecretTestPackCards();
    if (drawn.length === 0) return;

    setDrawnCards(drawn);
    setPackStage('box');
    setActivePackCardIndex(-1);
    setShinyStarStage('none');
    setCardAnimStep(0);
    setSecretCrackClicks(0);
    setSecretFlash(false);
    setIsOpeningPackModal(true);
  };

  // Secret Full-Screen 5-Click Glass Shatter Handler
  const handleSecretScreenClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (secretFlash) return;

    if (secretCrackClicks < 4) {
      setSecretCrackClicks((prev) => prev + 1);
    } else if (secretCrackClicks === 4) {
      setSecretFlash(true);
      setTimeout(() => {
        setSecretCrackClicks(5);
        setSecretFlash(false);
      }, 400);
    }
  };

  // Step-by-Step Card Reveal Engine (Auto-Sticks Card to Album)
  const handleProceedToNextCard = async (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= drawnCards.length) return;

    const card = drawnCards[targetIndex];
    setPackStage('card');
    setActivePackCardIndex(targetIndex);

    // Reset secret crack click animation state
    setSecretCrackClicks(0);
    setSecretFlash(false);

    // Reset card animation step directly to step 1 (manual clicks only)
    setCardAnimStep(1);

    // Save drawn card to Firestore automatically
    if (currentUser?.uid) {
      await saveCardToFirestore(card);
    }

    // If card is shiny or secret, trigger Star Growing -> Yellow Glow animation!
    if (card.isSecret) {
      setShinyStarStage('star');
      setTimeout(() => {
        setShinyStarStage('yellow');
        setTimeout(() => {
          setShinyStarStage('none');
        }, 800);
      }, 700);
    } else if (card.isShiny) {
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
      let newHasSecret = existing?.hasSecret || false;
      let newCountNormal = existing?.countNormal || 0;
      let newCountShiny = existing?.countShiny || 0;
      let newCountSecret = existing?.countSecret || 0;

      let selectedVar: 'normal' | 'shiny' | 'secret' = existing?.selectedVariant || 
        (card.isSecret ? 'secret' : card.isShiny ? 'shiny' : 'normal');

      if (card.isSecret) {
        if (!newHasSecret) {
          newHasSecret = true;
          selectedVar = 'secret'; // Auto select secret if newly acquired
        }
        newCountSecret++;

        // Record global discovery
        setDoc(doc(db, 'settings', 'discoveredSecrets'), {
          [card.slotCode]: {
            discoveredBy: currentUser.displayName || 'Anonim Kullanıcı',
            discoveredAt: Date.now()
          }
        }, { merge: true }).catch((err) => console.error(err));
      } else if (card.isShiny) {
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
        hasSecret: newHasSecret,
        selectedVariant: selectedVar,
        countNormal: newCountNormal,
        countShiny: newCountShiny,
        countSecret: newCountSecret,
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

  // Toggle user's preferred card display variant (Normal vs Shiny vs Secret)
  const handleToggleCardVariant = async (slotCode: string, newVariant: 'normal' | 'shiny' | 'secret') => {
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
        isShiny: newVariant === 'shiny' || newVariant === 'secret',
        isSecret: newVariant === 'secret',
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
    return Boolean(entry && (entry.hasNormal || entry.hasShiny || entry.hasSecret));
  };

  // Get active variant for an unlocked card
  const getCardVariant = (slotCode: string): 'normal' | 'shiny' | 'secret' => {
    const entry = userAlbum[slotCode];
    if (!entry) return 'normal';
    if (entry.selectedVariant === 'secret' && entry.hasSecret) return 'secret';
    if (entry.selectedVariant === 'shiny' && entry.hasShiny) return 'shiny';
    if (!entry.hasNormal && !entry.hasShiny && entry.hasSecret) return 'secret';
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
        <div className="flex flex-wrap items-center gap-3">
          
          {/* GIANT EYE-CATCHING 1 DEFALIK BAŞLANGIÇ PAKETİ BUTTON */}
          {(!hasClaimedStarterPack || isTestUser) && (
            <button
              onClick={handleOpenStarterPackClick}
              className="relative group bg-gradient-to-r from-emerald-500 via-yellow-400 to-emerald-600 hover:from-emerald-400 hover:to-amber-300 text-black font-black text-xs sm:text-sm px-5 py-2.5 rounded-2xl border-4 border-amber-300 shadow-[0_0_35px_rgba(251,191,36,0.95)] transition-all transform hover:scale-110 active:scale-95 cursor-pointer uppercase flex items-center gap-2 animate-pulse overflow-hidden select-none"
              title="Tek seferlik 5 paket (25 kart) hediye başlangıç paketi!"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
              <span className="text-xl sm:text-2xl animate-bounce">🎁</span>
              <div className="flex flex-col items-start text-left leading-tight">
                <span className="text-[9px] font-extrabold text-emerald-950 uppercase tracking-wider bg-amber-200/90 px-1.5 py-0.2 rounded">
                  HEDİYE 25 KART!
                </span>
                <span className="text-xs sm:text-sm font-black text-brand-maroon tracking-tight">
                  BAŞLANGIÇ PAKETİ (5 KUTU)
                </span>
              </div>
              <span className="text-base sm:text-lg">✨</span>
            </button>
          )}

          {/* STATISTICS LEADERBOARD BUTTON */}
          <button
            onClick={() => {
              fetchLeaderboard();
              setShowStatsModal(true);
            }}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-brand-maroon font-black text-xs px-3.5 py-2 rounded-2xl border-2 border-amber-300 shadow-md transition-transform hover:scale-105 cursor-pointer uppercase flex items-center gap-1.5"
          >
            <span>📊</span>
            <span>İSTATİSTİKLER</span>
          </button>

          {/* User Status / Test Mode Badge */}
          {isTestUser && (
            <span className="text-[11px] font-black uppercase bg-gradient-to-r from-emerald-600 to-green-700 text-white px-3 py-1.5 rounded-full border border-emerald-400 shadow-md flex items-center gap-1.5">
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

            {/* GIANT PROMINENT STARTER PACK GIFT BANNER */}
            {(!hasClaimedStarterPack || isTestUser) && (
              <div className="bg-gradient-to-r from-emerald-900 via-green-800 to-emerald-950 border-4 border-amber-300 rounded-3xl p-4 sm:p-5 shadow-[0_0_40px_rgba(52,211,153,0.6)] text-center space-y-3 animate-pulse my-4">
                <div className="inline-block bg-amber-300 text-brand-maroon px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider shadow">
                  🎉 ÜCRETSİZ HEDİYE PAKETİ
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                  5 ADET BAŞLANGIÇ KUTUSU (25 KART HEDİYE)
                </h3>
                <p className="text-xs text-emerald-200 font-bold max-w-sm mx-auto">
                  Koleksiyonunuza hızlı başlamak için tek seferlik 25 adet kart hediyenizi tek tıkla hemen açın!
                </p>
                <button
                  onClick={handleOpenStarterPackClick}
                  className="px-6 py-3 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-[#800000] font-black text-sm sm:text-base uppercase rounded-2xl border-2 border-white shadow-2xl transition-transform hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center gap-2 mx-auto"
                >
                  <span>🎁</span>
                  <span>HEMEN 25 KART HEDİYENİ AÇ</span>
                  <span>✨</span>
                </button>
              </div>
            )}

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
                          const variant = getCardVariant(slotCode);
                          const isShiny = variant === 'shiny';
                          const isSecret = variant === 'secret';
                          return (
                            <ShinySpecialStickerCard
                              key={trophy.id}
                              title={trophy.name}
                              image={trophy.icon}
                              slotCode={slotCode}
                              type="trophy"
                              isUnlocked={isUnlocked}
                              isSecret={isSecret}
                              onClick={() => setSelectedCardModal({ 
                                title: trophy.name, 
                                image: trophy.icon, 
                                type: 'trophy', 
                                slotCode,
                                isUnlocked,
                                isShiny,
                                isSecret,
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
                          const variant = getCardVariant(slotCode);
                          const isShiny = variant === 'shiny';
                          const isSecret = variant === 'secret';
                          return (
                            <ShinySpecialStickerCard
                              key={trophy.id}
                              title={trophy.name}
                              image={trophy.icon}
                              slotCode={slotCode}
                              type="trophy"
                              isUnlocked={isUnlocked}
                              isSecret={isSecret}
                              onClick={() => setSelectedCardModal({ 
                                title: trophy.name, 
                                image: trophy.icon, 
                                type: 'trophy', 
                                slotCode,
                                isUnlocked,
                                isShiny,
                                isSecret,
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
                  const teamLogoVariant = getCardVariant(teamLogoSlotCode);
                  const isTeamLogoShiny = teamLogoVariant === 'shiny';
                  const isTeamLogoSecret = teamLogoVariant === 'secret';

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
                                isSecret={isTeamLogoSecret}
                                onClick={() => setSelectedCardModal({ 
                                  title: team.name, 
                                  image: team.logo, 
                                  type: 'team', 
                                  slotCode: teamLogoSlotCode,
                                  isUnlocked: isTeamLogoUnlocked,
                                  isShiny: isTeamLogoShiny,
                                  isSecret: isTeamLogoSecret,
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
                                  const isSecret = variant === 'secret';

                                  return (
                                    <PlayerStickerCard
                                      key={player.id}
                                      player={player}
                                      teamLogo={team.logo}
                                      slotCode={slotCode}
                                      isUnlocked={isUnlocked}
                                      isShiny={isShiny}
                                      isSecret={isSecret}
                                      onClick={() => setSelectedCardModal({ 
                                        ...player, 
                                        teamLogo: team.logo, 
                                        slotCode,
                                        isUnlocked,
                                        isShiny,
                                        isSecret,
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
                                  const isSecret = variant === 'secret';

                                  return (
                                    <PlayerStickerCard
                                      key={player.id}
                                      player={player}
                                      teamLogo={team.logo}
                                      slotCode={slotCode}
                                      isUnlocked={isUnlocked}
                                      isShiny={isShiny}
                                      isSecret={isSecret}
                                      onClick={() => setSelectedCardModal({ 
                                        ...player, 
                                        teamLogo: team.logo, 
                                        slotCode,
                                        isUnlocked,
                                        isShiny,
                                        isSecret,
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
      {/* FLOATING PACK TRIGGER BUTTON, SECRET PITY COUNTER & INFO BUTTON (BOTTOM RIGHT) */}
      {/* ============================================================================== */}
      {currentUser && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex flex-col items-end gap-2.5 max-w-[280px] sm:max-w-xs select-none">
          
          {/* Top Control Bar: Info Button + Test User Secret Pack Button */}
          <div className="flex items-center gap-2">
            {isTestUser && (
              <button
                onClick={handleOpenSecretTestPackClick}
                className="px-3 py-1.5 bg-gradient-to-r from-purple-800 via-stone-900 to-black hover:from-purple-700 hover:to-stone-800 text-amber-300 font-black text-[10px] uppercase rounded-xl border-2 border-amber-400 shadow-xl transition-transform hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1.5"
                title="Test moduna özel 5 adet Secret Kartlı Kutu Aç"
              >
                <span>🕶️</span>
                <span>TEST: 5 SECRET KUTU</span>
              </button>
            )}

            <button
              onClick={() => setShowInfoModal(true)}
              className="w-9 h-9 bg-amber-400 hover:bg-amber-300 text-brand-maroon rounded-full border-2 border-white shadow-lg flex items-center justify-center font-black text-sm transition-transform hover:scale-110 cursor-pointer flex-shrink-0"
              title="Kutu Oranları ve Detaylı Bilgiler"
            >
              i
            </button>
          </div>

          {/* Secret Pity Counter Widget */}
          <div className="w-full bg-stone-900/95 border-2 border-amber-400 text-white rounded-2xl p-2.5 shadow-2xl backdrop-blur-md flex items-center gap-2.5">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-stone-900 font-black text-xs border border-amber-300 shadow-md flex-shrink-0">
              <span>🕶️</span>
            </div>
            <div className="flex flex-col text-left flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9px] font-black uppercase text-amber-300 tracking-wider truncate">SECRET PITY SAYACI</span>
                <span className="text-[9px] font-black text-amber-400">({secretPityCount}/10)</span>
              </div>
              <div className="w-full bg-stone-800 h-2 rounded-full overflow-hidden mt-1 border border-stone-700">
                <div 
                  className={`h-full transition-all duration-500 ${
                    secretPityCount >= 9 
                      ? 'bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-200 animate-pulse' 
                      : 'bg-gradient-to-r from-amber-500 to-amber-300'
                  }`}
                  style={{ width: `${Math.min(100, (secretPityCount / 10) * 100)}%` }}
                ></div>
              </div>
              <span className="text-[8.5px] font-extrabold text-stone-300 mt-1 truncate block">
                {secretPityCount >= 9 ? '🔥 SONRAKİ KUTUDA %100 GARANTİ SECRET!' : `${10 - secretPityCount} Kutu Sonra Garanti Secret`}
              </span>
            </div>
          </div>

          {/* Floating Pack Trigger Button */}
          <button
            onClick={handleOpenPackClick}
            disabled={!isTestUser && timeLeftMs > 0}
            className={`w-full px-4 py-3 rounded-2xl border-4 border-white shadow-2xl flex items-center justify-between gap-2 transition-all cursor-pointer transform hover:scale-[1.02] active:scale-95 ${
              isTestUser || timeLeftMs === 0
                ? 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-brand-maroon animate-pulse ring-4 ring-amber-400/50'
                : 'bg-stone-700 text-stone-300 cursor-not-allowed opacity-90'
            }`}
          >
            <div className="flex items-center gap-2">
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
            </div>
            <span className="text-lg font-black">→</span>
          </button>

        </div>
      )}

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

          {/* 3. FULL SCREEN SECRET 5-CLICK GLASS SHATTER EXPERIENCE */}
          {packStage === 'card' && drawnCards[activePackCardIndex]?.isSecret && secretCrackClicks < 5 && (
            <div 
              onClick={handleSecretScreenClick}
              className={`fixed inset-0 z-[99999] text-white flex flex-col items-center justify-center cursor-pointer select-none overflow-hidden transition-colors duration-200 ${
                secretFlash ? 'bg-white' : 'bg-black'
              }`}
            >
              {/* WHITE SHATTER FLASH ON 5TH CLICK */}
              {secretFlash && (
                <div className="absolute inset-0 bg-white animate-ping z-[100000]" />
              )}

              {/* ACCUMULATING WHITE GLASS SHATTER SVG PATTERNS */}
              <svg 
                className={`absolute inset-0 w-full h-full pointer-events-none transition-transform duration-150 ${
                  secretCrackClicks >= 4 ? 'scale-105 animate-pulse' : ''
                }`} 
                viewBox="0 0 100 100" 
                preserveAspectRatio="none"
              >
                {/* CLICK 1: Major central cross fractures */}
                {secretCrackClicks >= 1 && (
                  <g stroke="white" strokeWidth="1.2" fill="none">
                    <path d="M50 50 L10 5 M50 50 L90 95 M50 50 L95 10 M50 50 L5 85" strokeWidth="1.8" />
                    <path d="M50 50 L50 0 M50 50 L50 100 M50 50 L0 50 M50 50 L100 50" strokeWidth="1.4" />
                  </g>
                )}

                {/* CLICK 2: Secondary branching web cracks */}
                {secretCrackClicks >= 2 && (
                  <g stroke="white" strokeWidth="1.1" fill="none" opacity="0.95">
                    <path d="M30 25 L10 50 L30 75 M70 25 L90 50 L70 75" strokeWidth="1.3" />
                    <path d="M25 30 L50 10 L75 30 M25 70 L50 90 L75 70" strokeWidth="1.3" />
                    <path d="M50 50 L30 15 M50 50 L85 25 M50 50 L75 85 M50 50 L15 75" strokeWidth="1.5" />
                  </g>
                )}

                {/* CLICK 3: Dense geometric shards and radial fractures */}
                {secretCrackClicks >= 3 && (
                  <g stroke="white" strokeWidth="1" fill="none" opacity="0.9">
                    <polygon points="45,45 55,42 58,55 42,58" stroke="white" strokeWidth="1.2" fill="rgba(255,255,255,0.2)" />
                    <path d="M45 45 L20 30 M55 42 L80 20 M58 55 L85 80 M42 58 L15 70" strokeWidth="1.4" />
                    <path d="M10 20 L25 5 L60 2 M90 20 L98 60 L80 95 M10 80 L30 98 L5 40" strokeWidth="1.3" />
                    <path d="M35 35 L65 35 L65 65 L35 65 Z" strokeDasharray="3,2" strokeWidth="1" />
                  </g>
                )}

                {/* CLICK 4: Extreme screen destruction grid */}
                {secretCrackClicks >= 4 && (
                  <g stroke="white" strokeWidth="2" fill="none">
                    <path d="M0 0 L100 100 M100 0 L0 100" strokeWidth="2.5" />
                    <path d="M50 50 L0 25 M50 50 L100 75 M50 50 L75 0 M50 50 L25 100" strokeWidth="2.2" />
                    <circle cx="50" cy="50" r="15" stroke="white" strokeWidth="1.8" strokeDasharray="3,3" fill="rgba(255,255,255,0.3)" />
                    <circle cx="50" cy="50" r="35" stroke="white" strokeWidth="1.4" strokeDasharray="5,5" />
                    <path d="M5 50 L50 5 M95 50 L50 95" strokeWidth="1.8" />
                  </g>
                )}
              </svg>

              {/* CENTER DISPLAY: SECRET ICON & CLICK INSTRUCTION */}
              <div className="relative z-20 flex flex-col items-center justify-center space-y-6 px-4 text-center">
                <div className={`transition-all duration-300 transform ${
                  secretCrackClicks === 0 ? 'scale-100' :
                  secretCrackClicks === 1 ? 'scale-110 rotate-3' :
                  secretCrackClicks === 2 ? 'scale-125 -rotate-3' :
                  secretCrackClicks === 3 ? 'scale-135 rotate-6 animate-pulse' :
                  'scale-150 animate-bounce'
                }`}>
                  <span className="text-7xl sm:text-9xl filter drop-shadow-[0_0_50px_rgba(255,255,255,1)]">
                    🕶️
                  </span>
                </div>

                <div className="space-y-2 max-w-md">
                  <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-widest text-white drop-shadow-[0_0_25px_rgba(255,255,255,1)] animate-pulse">
                    🕶️ GİZLİ SECRET KART!
                  </h2>
                  <p className="text-xs sm:text-sm font-black uppercase text-stone-300 tracking-wider">
                    {secretCrackClicks < 4 
                      ? 'EKRANA TIKLAYARAK CAMI KIR!' 
                      : '⚡ SON VURUŞ! TEKRAR TIKLA VEYA CAMI KIR!'}
                  </p>
                </div>

                {/* PROGRESS COUNTER BADGES */}
                <div className="flex flex-col items-center gap-2 pt-2">
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((step) => (
                      <div 
                        key={step} 
                        className={`w-8 sm:w-12 h-3 rounded-full border-2 border-white transition-all duration-300 ${
                          step <= secretCrackClicks
                            ? 'bg-white shadow-[0_0_15px_rgba(255,255,255,1)] scale-110'
                            : 'bg-stone-900/80 border-stone-600'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-mono font-black uppercase text-stone-300 tracking-widest bg-stone-900 px-3 py-1 rounded-full border border-stone-700 shadow-md">
                    CAM KIRILMA DURUMU: {secretCrackClicks} / 5
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* MAIN MODAL CONTAINER (Sleek dark container with transparent black shadow overlay) */}
          <div className="bg-black/80 border-2 border-white/20 rounded-3xl p-4 sm:p-6 max-w-4xl w-full text-center space-y-4 shadow-[0_0_120px_rgba(0,0,0,0.9)] relative text-white max-h-[95vh] flex flex-col justify-between overflow-y-auto">
            
            <button
              onClick={() => setIsOpeningPackModal(false)}
              className="absolute top-4 right-4 bg-red-800 text-white rounded-full w-9 h-9 flex items-center justify-center font-black text-sm hover:bg-red-900 transition-colors cursor-pointer border border-amber-300 z-30"
            >
              ✕
            </button>

            {/* HEADER */}
            <div className="space-y-1">
              <span className="text-[10px] sm:text-xs font-black uppercase text-amber-300 bg-black/60 px-3 py-1 rounded-full border border-amber-400/50 inline-block">
                OFFICIAL PANINI STYLE STICKER PACK
              </span>
              <h2 className="text-xl sm:text-2xl font-black uppercase text-amber-300 flex items-center justify-center gap-2">
                <span>📦</span>
                <span>KUTU AÇILIŞI ({drawnCards.length} KART)</span>
              </h2>
            </div>

            {/* STAGE 1: HUGE PACK BOX IN CENTER */}
            {packStage === 'box' && (
              <div className="py-6 flex flex-col items-center justify-center space-y-6 animate-fade-in">
                <div 
                  onClick={() => handleProceedToNextCard(0)}
                  className="w-56 h-72 sm:w-64 sm:h-84 bg-gradient-to-br from-amber-400 via-amber-600 to-[#7A1515] border-8 border-amber-300 rounded-3xl p-6 flex flex-col items-center justify-between text-center cursor-pointer transform hover:scale-105 transition-all shadow-[0_0_60px_rgba(251,191,36,0.6)] animate-pulse relative overflow-hidden group select-none"
                >
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent transform -rotate-45 group-hover:translate-x-full transition-transform duration-1000"></div>

                  <span className="text-xs font-black uppercase bg-black/60 text-amber-300 px-3 py-1 rounded-full border border-amber-300/60">
                    2026 ALBÜM KUTUSU
                  </span>

                  <div className="my-auto space-y-2">
                    <span className="text-7xl sm:text-8xl block filter drop-shadow-2xl transform group-hover:rotate-12 transition-transform duration-300">
                      📦
                    </span>
                    <span className="text-xs sm:text-sm font-black text-white bg-red-900/90 px-3 py-1 rounded-full border border-amber-300 block">
                      {drawnCards.length} ADET KART İÇERİR
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

            {/* STAGE 2: CARDS REVEAL (LEFT COLUMN PREVIOUS SMALL QUEUE, CENTER ACTIVE CARD WITH LOGO/RATING ANIMATIONS) */}
            {packStage === 'card' && activePackCardIndex >= 0 && (
              <div className="py-2 flex-1 flex flex-col sm:flex-row items-center justify-around gap-6 min-h-[400px]">
                
                {/* LEFT SIDE: PREVIOUS REVEALED CARDS SMALL QUEUE */}
                <div className="w-full sm:w-52 bg-black/60 border border-amber-400/30 rounded-2xl p-3 flex flex-row sm:flex-col items-center gap-2 overflow-x-auto sm:overflow-y-auto max-h-48 sm:max-h-96">
                  <span className="text-[10px] font-black uppercase text-amber-300 block w-full text-center border-b border-amber-400/20 pb-1">
                    EKLENEN KARTLAR ({activePackCardIndex}/{drawnCards.length})
                  </span>

                  {activePackCardIndex === 0 && (
                    <span className="text-[9px] text-amber-200/60 font-medium italic py-2 text-center w-full">
                      Henüz eklenen kart yok
                    </span>
                  )}

                  {drawnCards.map((c, idx) => {
                    if (idx >= activePackCardIndex) return null; // Only show cards that have finished reveal animation

                    return (
                      <div
                        key={idx}
                        className="flex-shrink-0 w-20 sm:w-full p-1.5 rounded-xl border flex sm:flex-row flex-col items-center gap-1.5 text-left transition-all bg-black/70 text-amber-200 border-amber-400/40 opacity-90 shadow-md"
                      >
                        <span className="text-[9px] font-black bg-black/60 text-amber-300 px-1 py-0.5 rounded">
                          #{idx + 1}
                        </span>
                        <div className="truncate text-[9px] font-bold flex-1">
                          {c.title}
                        </div>
                        {c.isSecret ? (
                          <span className="text-[8px] bg-black text-white font-black px-1 rounded border border-white">
                            🕶️ SECRET
                          </span>
                        ) : c.isShiny ? (
                          <span className="text-[8px] bg-yellow-400 text-black font-black px-1 rounded">
                            ✨
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {/* CENTER: ACTIVE CARD WITH FIFA MULTI-STEP REVEAL ANIMATIONS */}
                {(() => {
                  const card = drawnCards[activePackCardIndex];
                  const isPlayerCard = card.type === 'player';
                  const isTeamCard = card.type === 'team';
                  const isTrophyCard = card.type === 'trophy';
                  const isSecretCard = card.isSecret;

                  // Calculate rating: for players use gen, for teams compute team average gen, for trophy 99
                  const getCardRating = () => {
                    if (card.playerData?.gen || card.playerData?.rating) {
                      return card.playerData.gen || card.playerData.rating;
                    }
                    if (isTeamCard) {
                      const teamObj = teamsData.find(
                        (t) => t.name.toLowerCase() === card.title.toLowerCase() || t.logo === card.image || t.logo === card.teamLogo
                      );
                      if (teamObj && teamObj.players.length > 0) {
                        const sum = teamObj.players.reduce((acc, p) => acc + (p.gen || 80), 0);
                        return Math.round(sum / teamObj.players.length);
                      }
                      return 84;
                    }
                    if (isTrophyCard) return 99;
                    return 85;
                  };

                  const ratingVal = getCardRating();
                  const positionVal = card.playerData?.mevki || (isTrophyCard ? 'KUPA' : isTeamCard ? 'TAKIM' : 'FOR');
                  const teamNameVal = card.teamLogo ? card.title.split(' ')[0] : (isTrophyCard ? 'ŞAMPİYON' : 'KULÜP');

                  return (
                    <div className="flex-1 flex flex-col items-center justify-center space-y-4 relative min-h-[420px] w-full max-w-lg mx-auto">
                      
                      {/* SECRET REVEAL HEADER BANNER */}
                      {isSecretCard && (
                        <div className="animate-pulse mb-1">
                          <span className="text-xl sm:text-3xl font-black uppercase text-white bg-black px-6 py-2 rounded-full border-2 border-white shadow-[0_0_30px_rgba(255,255,255,0.9)] tracking-widest">
                            🕶️ GİZLİ SECRET KART!
                          </span>
                        </div>
                      )}

                      {/* FIFA REVEAL ANIMATION STAGE 1: GIANT TEAM LOGO (CLICK TO SEE RATING) */}
                      {cardAnimStep === 1 && (
                        <div 
                          onClick={() => setCardAnimStep(2)}
                          className="w-56 h-88 sm:w-64 sm:h-96 flex flex-col items-center justify-center p-4 bg-black/90 border-4 border-amber-300 rounded-2xl shadow-[0_0_60px_rgba(251,191,36,0.8)] cursor-pointer transition-all duration-300 transform hover:scale-105 select-none text-center animate-scale-up my-auto relative group overflow-hidden"
                          title="Reytingi görmek için tıklayın!"
                        >
                          <div className="absolute top-3 bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider animate-pulse">
                            ⚡ TAKIM AMBLEMİ
                          </div>

                          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-amber-400/20 border-4 border-amber-300 p-4 flex items-center justify-center shadow-[0_0_50px_rgba(251,191,36,0.9)] animate-bounce my-auto">
                            {card.teamLogo || card.image ? (
                              <img 
                                src={card.teamLogo || card.image} 
                                alt="Team Logo" 
                                className="max-h-full max-w-full object-contain filter drop-shadow-[0_0_20px_rgba(255,255,255,0.9)]"
                              />
                            ) : (
                              <span className="text-6xl">🛡️</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* FIFA REVEAL ANIMATION STAGE 2: GIANT RATING BADGE (CLICK TO SEE PLAYER) */}
                      {cardAnimStep === 2 && (
                        <div 
                          onClick={() => setCardAnimStep(3)}
                          className="w-56 h-88 sm:w-64 sm:h-96 flex flex-col items-center justify-center p-4 bg-black/95 border-4 border-amber-300 rounded-2xl shadow-[0_0_80px_rgba(251,191,36,0.9)] cursor-pointer transition-all duration-300 transform hover:scale-105 select-none text-center animate-scale-up my-auto relative group overflow-hidden"
                          title="Kartı görmek için tıklayın!"
                        >
                          <div className="absolute top-3 bg-emerald-400/20 text-emerald-300 border border-emerald-400/40 text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider animate-pulse">
                            ⚡ {isTeamCard ? 'TAKIM REYTİNGİ' : 'OYUNCU REYTİNGİ'}
                          </div>

                          {/* GIANT RATING BADGE */}
                          <div className="bg-gradient-to-b from-amber-300 via-amber-400 to-amber-600 text-brand-maroon px-7 py-3 rounded-2xl border-4 border-white shadow-[0_0_40px_rgba(251,191,36,1)] flex items-center gap-3 animate-bounce my-auto">
                            <span className="text-4xl sm:text-5xl font-black font-mono">
                              {ratingVal}
                            </span>
                            <div className="flex flex-col items-start leading-tight">
                              <span className="text-[9px] font-black uppercase text-amber-950">GENEL REYTİNG</span>
                              <span className="text-xs font-black uppercase bg-brand-maroon text-amber-300 px-1.5 py-0.5 rounded border border-amber-300">
                                {positionVal}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* FIFA REVEAL ANIMATION STAGE 0: INITIAL STAR BURST WITH RADIATING GROWING BACKDROP */}
                      {cardAnimStep === 0 && (
                        <div 
                          onClick={() => setCardAnimStep(1)}
                          className={`w-56 h-88 sm:w-64 sm:h-96 flex flex-col items-center justify-center p-4 border-4 rounded-2xl cursor-pointer select-none text-center my-auto relative overflow-hidden group ${
                            isSecretCard
                              ? 'bg-black border-white shadow-[0_0_100px_rgba(255,255,255,1)] animate-pulse'
                              : 'bg-black/90 border-amber-400/80 shadow-[0_0_80px_rgba(251,191,36,0.8)]'
                          }`}
                        >
                          {/* EXPANDING RADIANT GLOW BACKGROUND */}
                          {isSecretCard ? (
                            <>
                              <div className="absolute inset-0 bg-black z-0" />
                              {/* White shatter glass cracks expanding */}
                              <div className="absolute inset-0 z-10 opacity-80 animate-ping pointer-events-none">
                                <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                  <path d="M50 50 L0 0 M50 50 L100 10 M50 50 L95 90 M50 50 L10 95 M50 50 L0 50 M50 50 L50 100 M50 50 L100 50 M50 50 L50 0" stroke="white" strokeWidth="1.5" fill="none" />
                                </svg>
                              </div>
                              <div className="absolute inset-0 z-10 opacity-90 animate-pulse pointer-events-none">
                                <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                  <path d="M50 50 L20 15 M50 50 L80 25 M50 50 L85 75 M50 50 L30 85 M20 15 L5 40 M80 25 L95 50 M85 75 L60 95" stroke="#ffffff" strokeWidth="1" strokeDasharray="2,2" fill="none" />
                                </svg>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(251,191,36,0.5)_0%,_rgba(0,0,0,0)_75%)] animate-pulse" />
                              <div className="absolute w-48 h-48 rounded-full bg-amber-400/25 filter blur-xl animate-ping opacity-75" />
                              <div className="absolute w-36 h-36 rounded-full bg-yellow-300/35 filter blur-lg animate-scale-up" />
                            </>
                          )}

                          {/* Spinning Star / Secret Icon over background */}
                          <div className="relative z-20 flex flex-col items-center justify-center space-y-4 my-auto">
                            <span className={`text-6xl sm:text-7xl filter ${
                              isSecretCard 
                                ? 'drop-shadow-[0_0_30px_rgba(255,255,255,1)] animate-bounce' 
                                : 'drop-shadow-[0_0_30px_rgba(251,191,36,1)] animate-spin'
                            }`}>
                              {isSecretCard ? '🕶️' : '🌟'}
                            </span>
                            <span className={`text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-full border shadow-lg ${
                              isSecretCard
                                ? 'bg-white text-black border-white animate-pulse'
                                : 'bg-amber-950/90 text-amber-300 border-amber-400/50'
                            }`}>
                              {isSecretCard ? 'GİZLİ SECRET KART AÇILIYOR...' : 'KART HAZIRLANANIYOR...'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* FIFA REVEAL ANIMATION STAGE 3: FULL FUT CARD */}
                      {cardAnimStep === 3 && (
                        <div 
                          onClick={() => {
                            if (activePackCardIndex < drawnCards.length - 1) {
                              handleProceedToNextCard(activePackCardIndex + 1);
                            } else {
                              setPackStage('finished');
                            }
                          }}
                          className="relative group cursor-pointer transition-transform duration-300 hover:scale-105 select-none animate-scale-up"
                          title="Kartı sola eklemek ve sıradakine geçmek için tıklayın!"
                        >
                          {/* CARD COMPONENT WRAPPER */}
                          <div className="w-56 h-88 sm:w-64 sm:h-96 relative">
                            
                            {/* MAIN CARD STYLED CONTAINER */}
                            <div 
                              className={`w-full h-full rounded-2xl border-4 p-3 flex flex-col justify-between items-center text-center transition-all duration-500 transform shadow-2xl overflow-hidden ${
                                isSecretCard
                                  ? 'bg-black border-white text-white shadow-[0_0_50px_rgba(255,255,255,0.8)] animate-pulse'
                                  : card.isShiny
                                  ? 'bg-gradient-to-br from-amber-300 via-yellow-100 to-amber-500 border-amber-300 ring-4 ring-amber-300/80 shadow-[0_0_40px_rgba(251,191,36,0.8)]'
                                  : 'bg-[#FFFEE8] border-[#661616] text-black shadow-xl'
                              }`}
                            >
                              {/* Card Header Slot Code & Badges */}
                              <div className="w-full flex items-center justify-between z-10">
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                                  isSecretCard ? 'bg-white text-black border-black' : 'bg-brand-maroon text-amber-300 border-amber-300'
                                }`}>
                                  {card.slotCode}
                                </span>
                                {isSecretCard ? (
                                  <span className="text-[9px] font-black bg-white text-black px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-md animate-pulse">
                                    🕶️ GİZLİ SECRET
                                  </span>
                                ) : card.isShiny ? (
                                  <span className="text-[9px] font-black bg-amber-500 text-black px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-md">
                                    ✨ PARILTILI STİCKER
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold text-stone-600 bg-stone-200 px-2 py-0.5 rounded-full">
                                    NORMAL STİCKER
                                  </span>
                                )}
                              </div>

                              {/* Image Container */}
                              <div className="flex-1 flex items-center justify-center p-2 my-1 overflow-hidden z-10">
                                <img 
                                  src={card.image || card.playerData?.foto || 'https://via.placeholder.com/120'} 
                                  alt={card.title}
                                  className={`max-h-36 sm:max-h-44 max-w-full object-contain filter drop-shadow-xl ${
                                    isSecretCard ? 'brightness-125 contrast-125' : ''
                                  }`}
                                />
                              </div>

                              {/* Bottom Info Row: Rating (Left Box) & Team Logo (Right Box) */}
                              <div className="w-full grid grid-cols-2 gap-2 my-1 z-10">
                                {/* Left Box: Rating */}
                                <div className={`border rounded-xl flex flex-col items-center justify-center py-1 px-1 shadow-inner ${
                                  isSecretCard ? 'bg-stone-900 border-white/60 text-white' : 'bg-[#D96836] border-[#B34E1E] text-white'
                                }`}>
                                  <span className="text-[8px] font-black uppercase text-amber-200">RATİNG</span>
                                  <span className="text-sm sm:text-base font-black font-mono leading-none">
                                    {ratingVal}
                                  </span>
                                </div>

                                {/* Right Box: Team Logo */}
                                <div className={`border rounded-xl flex items-center justify-center p-1 shadow-inner overflow-hidden ${
                                  isSecretCard ? 'bg-stone-900 border-white/60' : 'bg-[#D96836] border-[#B34E1E]'
                                }`}>
                                  {card.teamLogo || card.image ? (
                                    <img 
                                      src={card.teamLogo || card.image} 
                                      alt="Team" 
                                      className="max-h-7 max-w-full object-contain filter drop-shadow-md"
                                    />
                                  ) : (
                                    <span className="text-xs">🛡️</span>
                                  )}
                                </div>
                              </div>

                              {/* Title Banner */}
                              <div className={`w-full py-1.5 px-2 rounded-xl border text-center z-10 ${
                                isSecretCard 
                                  ? 'bg-white text-black border-black font-black' 
                                  : 'bg-[#7A1515] text-amber-300 border-amber-400'
                              }`}>
                                <span className="font-black text-xs sm:text-sm uppercase tracking-tight block truncate">
                                  {card.title}
                                </span>
                              </div>

                            </div>
                          </div>
                        </div>
                      )}

                      {/* ACTION PROMPT */}
                      <p className="text-xs font-black text-amber-300 animate-pulse bg-black/60 px-4 py-1 rounded-full border border-amber-400/30">
                        {cardAnimStep < 3 
                          ? '👉 Animasyonu geçmek için tıklayın...' 
                          : `👉 Kartın üstüne tıklayarak sola aktarın (${activePackCardIndex + 1}/${drawnCards.length})`}
                      </p>

                    </div>
                  );
                })()}

              </div>
            )}

            {/* STAGE 3: FINISHED REVEAL SUMMARY */}
            {packStage === 'finished' && (
              <div className="py-4 space-y-4 animate-fade-in">
                <div className="bg-emerald-950/80 border-2 border-emerald-400 text-emerald-200 p-3 rounded-2xl text-xs font-black uppercase">
                  🎉 TEBRİKLER! 5 ADET STİCKER KARTINIZ ALBÜMÜNÜZE BAŞARIYLA YAPIŞTIRILDI!
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {drawnCards.map((card, idx) => {
                    const isSecretCard = Boolean(card.isSecret);
                    const isShinyCard = Boolean(card.isShiny);

                    return (
                      <div 
                        key={idx}
                        className={`aspect-[3/4] rounded-xl border p-2 flex flex-col justify-between items-center text-center relative overflow-hidden select-none ${
                          isSecretCard
                            ? 'bg-black border-2 border-white text-white shadow-[0_0_20px_rgba(255,255,255,0.9)] animate-pulse ring-2 ring-stone-900'
                            : isShinyCard
                            ? 'bg-gradient-to-br from-amber-300 via-yellow-100 to-amber-500 border-amber-300 text-black shadow-md'
                            : 'bg-[#FFFEE8] border-[#661616] text-black shadow-sm'
                        }`}
                      >
                        {/* White Broken Glass / Fracture Overlay for Secret cards */}
                        {isSecretCard && (
                          <>
                            <div className="absolute inset-0 pointer-events-none opacity-40 z-0">
                              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                <path d="M10 0 L50 50 L90 5 M98 45 L50 50 L85 95 M15 90 L50 50 L2 55" stroke="white" strokeWidth="0.8" fill="none" />
                              </svg>
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-white/30 to-transparent mix-blend-overlay opacity-90 pointer-events-none z-0" />
                          </>
                        )}

                        {/* Glossy Foil Overlay for Shiny cards */}
                        {isShinyCard && !isSecretCard && (
                          <div className="absolute inset-0 bg-gradient-to-tr from-cyan-400/20 via-pink-400/20 to-yellow-200/30 mix-blend-color-dodge opacity-90 pointer-events-none z-0" />
                        )}

                        <div className="w-full flex items-center justify-between z-10">
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${
                            isSecretCard ? 'bg-white text-black font-black' : 'bg-brand-maroon text-amber-300'
                          }`}>
                            {card.slotCode}
                          </span>
                          {isSecretCard ? (
                            <span className="text-[7px] font-black bg-white text-black px-1 py-0.5 rounded-full border border-gray-300 shadow-sm animate-bounce flex items-center gap-0.5">
                              🕶️ SECRET
                            </span>
                          ) : isShinyCard ? (
                            <span className="text-[7px] font-black bg-amber-500 text-black px-1 py-0.5 rounded-full border border-amber-200 shadow-xs">
                              ✨ PARILTILI
                            </span>
                          ) : null}
                        </div>

                        <div className="flex-1 flex items-center justify-center my-1 z-10 overflow-hidden">
                          <img 
                            src={card.image || card.playerData?.foto} 
                            alt={card.title} 
                            className={`max-h-16 object-contain filter drop-shadow-md ${isSecretCard ? 'brightness-110 contrast-125' : ''}`}
                          />
                        </div>

                        <span className={`text-[8px] font-black truncate w-full px-1 py-0.5 rounded z-10 ${
                          isSecretCard ? 'bg-white text-black font-black' : 'bg-[#7A1515] text-amber-300'
                        }`}>
                          {card.title}
                        </span>
                      </div>
                    );
                  })}
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
              
              {leaderboardUsers.length === 0 ? (
                <div className="text-center py-8 space-y-3 bg-white p-4 rounded-2xl border-2 border-amber-300">
                  <span className="text-3xl animate-bounce block">⏳</span>
                  <p className="text-xs font-black uppercase text-stone-600">
                    İstatistikler yükleniyor veya henüz veri yok...
                  </p>
                  <button
                    onClick={() => fetchLeaderboard()}
                    className="px-4 py-2 bg-amber-400 text-brand-maroon font-black text-xs uppercase rounded-xl border border-amber-600 shadow cursor-pointer"
                  >
                    🔄 Yeniden Yükle
                  </button>
                </div>
              ) : (
                <>
                  {/* Leaderboard Category 1: Most Secret Cards */}
                  <div className="bg-[#1a1a1a] p-4 rounded-2xl border-2 border-stone-700 space-y-3 shadow-md text-white">
                    <h4 className="font-black text-xs uppercase text-amber-300 flex items-center gap-1.5 border-b pb-2 border-stone-800">
                      <span>🕶️</span>
                      <span>EN ÇOK SECRET KART SAHİPLERİ</span>
                    </h4>

                    <div className="space-y-2">
                      {[...leaderboardUsers]
                        .sort((a, b) => b.totalSecretCards - a.totalSecretCards)
                        .slice(0, 5)
                        .map((user, idx) => (
                          <div key={user.uid} className="flex items-center justify-between bg-stone-900 p-2 rounded-xl border border-stone-800 text-xs font-bold">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 bg-amber-400 text-black rounded-full flex items-center justify-center text-[10px] font-black">
                                {idx + 1}
                              </span>
                              <span className="font-black text-stone-100">{user.displayName}</span>
                            </div>
                            <span className="font-black text-amber-300 bg-black px-2.5 py-0.5 rounded-full border border-amber-400/50">
                              🕶️ {user.totalSecretCards} Secret
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Leaderboard Category 2: Most Shiny Cards */}
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

                  {/* Leaderboard Category 3: Most Unique Cards */}
                  <div className="bg-white p-4 rounded-2xl border-2 border-amber-300 space-y-3 shadow-xs">
                    <h4 className="font-black text-xs uppercase text-brand-maroon flex items-center gap-1.5 border-b pb-2 border-amber-200">
                      <span>🏆</span>
                      <span>EN ÇOK FARKLI KART SAHİPLERİ (ÇİFTLER SAYILMAZ)</span>
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
                </>
              )}

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
                  isSecret={selectedCardModal.userAlbumEntry?.selectedVariant === 'secret' && selectedCardModal.userAlbumEntry?.hasSecret}
                />
              ) : (
                <PlayerStickerCard 
                  player={selectedCardModal}
                  teamLogo={selectedCardModal.teamLogo}
                  slotCode={selectedCardModal.slotCode}
                  isUnlocked={selectedCardModal.isUnlocked}
                  isShiny={selectedCardModal.isShiny}
                  isSecret={selectedCardModal.userAlbumEntry?.selectedVariant === 'secret' && selectedCardModal.userAlbumEntry?.hasSecret}
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

            {/* Card Variant Selector (Normal, Parıltılı & Secret) */}
            {selectedCardModal.isUnlocked && selectedCardModal.userAlbumEntry && (
              <div className="pt-2 border-t border-amber-400/30 space-y-2">
                <span className="text-[10px] font-black uppercase text-brand-maroon block">
                  ALBÜMDE GÖRÜNECEK VERSİYONU SEÇİN:
                </span>
                <div className={`grid ${selectedCardModal.userAlbumEntry.hasSecret ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                  <button
                    onClick={() => handleToggleCardVariant(selectedCardModal.slotCode, 'normal')}
                    disabled={!selectedCardModal.userAlbumEntry.hasNormal}
                    className={`py-2 px-1.5 rounded-xl font-black text-[9px] uppercase border transition-all cursor-pointer ${
                      selectedCardModal.userAlbumEntry.selectedVariant === 'normal' || (!selectedCardModal.userAlbumEntry.hasShiny && !selectedCardModal.userAlbumEntry.hasSecret)
                        ? 'bg-amber-400 text-brand-maroon border-brand-maroon shadow-md'
                        : 'bg-white text-stone-600 border-stone-300 hover:bg-amber-100'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    ⭐️ NORMAL
                  </button>

                  <button
                    onClick={() => handleToggleCardVariant(selectedCardModal.slotCode, 'shiny')}
                    disabled={!selectedCardModal.userAlbumEntry.hasShiny}
                    className={`py-2 px-1.5 rounded-xl font-black text-[9px] uppercase border transition-all cursor-pointer ${
                      selectedCardModal.userAlbumEntry.selectedVariant === 'shiny'
                        ? 'bg-amber-400 text-brand-maroon border-brand-maroon shadow-md'
                        : 'bg-white text-stone-600 border-stone-300 hover:bg-amber-100'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    ✨ PARILTILI
                  </button>

                  {selectedCardModal.userAlbumEntry.hasSecret && (
                    <button
                      onClick={() => handleToggleCardVariant(selectedCardModal.slotCode, 'secret')}
                      disabled={!selectedCardModal.userAlbumEntry.hasSecret}
                      className={`py-2 px-1.5 rounded-xl font-black text-[9px] uppercase border transition-all cursor-pointer ${
                        selectedCardModal.userAlbumEntry.selectedVariant === 'secret'
                          ? 'bg-black text-white border-white ring-2 ring-stone-900 shadow-md'
                          : 'bg-stone-900 text-stone-300 border-stone-700 hover:bg-black'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      🕶️ SECRET
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}



    </div>
  );
}
