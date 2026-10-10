import React, { useState, useRef } from 'react';
import { UserProfile } from '../types';
import { Coins } from 'lucide-react';

export interface UserHoverCardProps {
  uid: string;
  userProfile?: UserProfile | null;
  fallbackName: string;
  fallbackAvatar: string;
  teamLogos: Record<string, string>;
  onNavigate: (view: any) => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
}

function isLightColor(hex?: string): boolean {
  if (!hex) return false;
  let c = hex.replace('#', '').trim();
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  if (c.length !== 6) return false;
  const num = parseInt(c, 16);
  if (isNaN(num)) return false;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  // Standard perceived luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55;
}

export default function UserHoverCard({
  uid,
  userProfile,
  fallbackName,
  fallbackAvatar,
  teamLogos,
  onNavigate,
  children,
  align = 'left'
}: UserHoverCardProps) {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<any>(null);

  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setShow(true);
    }, 200);
  };

  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setShow(false);
    }, 250);
  };

  const name = userProfile?.displayName || fallbackName || 'Kullanıcı';
  const avatar = userProfile?.avatar || fallbackAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=800000&color=ffd700&size=64`;
  const banner = userProfile?.banner;
  const bio = userProfile?.bio;
  const favTeam = userProfile?.favTeam;
  const favPlayer = userProfile?.favPlayer;
  const isAdmin = Boolean(userProfile?.admin);
  const balance = userProfile?.balance || 0;

  // 2-color gradient from user profile - completely covers the card background!
  const bgStart = userProfile?.bgGradientStart || '#800000';
  const bgEnd = userProfile?.bgGradientEnd || '#1e1f22';
  const bgGradient = `linear-gradient(to bottom, ${bgStart}, ${bgEnd})`;
  const isLight = isLightColor(bgEnd);

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {show && (
        <div 
          className={`absolute z-50 ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-2 w-72 rounded-2xl shadow-2xl overflow-hidden text-left animate-fade-in pointer-events-auto border`}
          style={{ 
            background: bgGradient,
            borderColor: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.15)',
            color: isLight ? '#171717' : '#ffffff'
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Banner with custom image or ambient watermark */}
          <div className="h-20 w-full relative overflow-hidden flex items-center justify-center">
            {banner ? (
              <img src={banner} alt="banner" className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full flex flex-col items-center justify-center font-mono text-[9px] font-black uppercase tracking-wider ${
                isLight ? 'bg-black/5 text-black/40' : 'bg-black/20 text-white/30'
              }`}>
                <span className="text-sm">⚽</span>
                <span>BOBBLE LİG</span>
              </div>
            )}
          </div>

          {/* Overlapping Avatar & Content */}
          <div className="px-4 pb-4 pt-0">
            <div className="flex items-end justify-between -mt-9 mb-2">
              <div className="relative">
                <img 
                  src={avatar} 
                  alt={name} 
                  className="w-16 h-16 rounded-full border-4 object-cover bg-white shadow-xl"
                  style={{ borderColor: bgStart }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=800000&color=ffd700&size=64`;
                  }}
                />
                {isAdmin && (
                  <span 
                    className="absolute bottom-0 right-0 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold border-2" 
                    style={{ borderColor: bgStart }}
                    title="Admin"
                  >
                    ✓
                  </span>
                )}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate({ type: 'user-profile', userId: uid });
                }}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase shadow cursor-pointer transition-transform hover:scale-105 ${
                  isLight 
                    ? 'bg-neutral-900 hover:bg-black text-amber-300 border border-black/30' 
                    : 'bg-brand-maroon hover:bg-[#600000] text-amber-300 border border-amber-400/40'
                }`}
              >
                Profili Gör
              </button>
            </div>

            {/* Display Name & Role */}
            <div className="space-y-0.5 mb-2">
              <div className="flex items-center gap-1.5">
                <h4 className={`font-black text-sm truncate max-w-[190px] ${isLight ? 'text-neutral-900' : 'text-white'}`}>
                  {name}
                </h4>
                {isAdmin && (
                  <span className="bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase">
                    Yönetici
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-semibold block ${isLight ? 'text-neutral-700' : 'text-gray-300'}`}>
                {isAdmin ? '🛡️ Lig Yetkilisi' : '⚽ Bobble Lig Oyuncusu'}
              </span>
            </div>

            {/* Bio */}
            {bio ? (
              <p className={`text-[11px] font-semibold leading-tight p-2.5 rounded-xl mb-2.5 whitespace-pre-wrap backdrop-blur-sm border ${
                isLight 
                  ? 'bg-black/10 text-neutral-900 border-black/10' 
                  : 'bg-black/35 text-neutral-100 border-white/10'
              }`}>
                {bio}
              </p>
            ) : (
              <p className={`text-[10px] italic mb-2 ${isLight ? 'text-neutral-600' : 'text-gray-400'}`}>
                Henüz biyografi eklenmemiş.
              </p>
            )}

            {/* Favorites Info */}
            <div className="space-y-1.5 text-xs mb-3">
              {favTeam && (
                <div className={`flex items-center gap-2 p-2 rounded-xl backdrop-blur-sm border ${
                  isLight 
                    ? 'bg-black/10 text-neutral-900 border-black/10' 
                    : 'bg-black/35 text-white border-white/10'
                }`}>
                  {teamLogos[favTeam] ? (
                    <img src={teamLogos[favTeam]} alt={favTeam} className="w-5 h-5 rounded-full object-cover bg-white shadow-sm" />
                  ) : (
                    <span className="text-sm">🛡️</span>
                  )}
                  <div className="leading-none">
                    <span className={`text-[8px] font-black uppercase block ${isLight ? 'text-neutral-700' : 'text-amber-400'}`}>
                      TUTTUĞU TAKIM
                    </span>
                    <span className="text-[11px] font-black">{favTeam}</span>
                  </div>
                </div>
              )}

              {favPlayer && (
                <div className={`flex items-center gap-2 p-2 rounded-xl backdrop-blur-sm border ${
                  isLight 
                    ? 'bg-black/10 text-neutral-900 border-black/10' 
                    : 'bg-black/35 text-white border-white/10'
                }`}>
                  <span className="text-sm">⭐</span>
                  <div className="leading-none">
                    <span className={`text-[8px] font-black uppercase block ${isLight ? 'text-neutral-700' : 'text-amber-400'}`}>
                      FAVORİ OYUNCU
                    </span>
                    <span className="text-[11px] font-black">{favPlayer}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Wallet info */}
            <div className={`border-t pt-2 flex items-center justify-between text-[11px] font-bold ${
              isLight ? 'border-black/15 text-neutral-900' : 'border-white/15 text-gray-200'
            }`}>
              <span className="flex items-center gap-1 font-extrabold">
                <Coins className={`w-3.5 h-3.5 ${isLight ? 'text-neutral-900' : 'text-amber-400'}`} />
                <span>Bakiye:</span>
              </span>
              <span className={`font-mono font-black ${isLight ? 'text-neutral-950' : 'text-amber-300'}`}>
                {balance.toLocaleString('tr-TR')} ฿
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
