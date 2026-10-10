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

  // 2-color gradient from user profile
  const bgStart = userProfile?.bgGradientStart || '#800000';
  const bgEnd = userProfile?.bgGradientEnd || '#1e1f22';
  const bgGradient = `linear-gradient(to bottom, ${bgStart}, ${bgEnd})`;

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {show && (
        <div 
          className={`absolute z-50 ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-2 w-72 rounded-2xl bg-[#1e1f22] text-white shadow-2xl border border-white/10 overflow-hidden text-left animate-fade-in pointer-events-auto`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Banner with 2-color blend or banner image */}
          <div 
            className="h-20 w-full relative overflow-hidden flex items-center justify-center"
            style={{ background: bgGradient }}
          >
            {banner ? (
              <img src={banner} alt="banner" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center opacity-40 text-white font-mono text-[9px] font-black uppercase tracking-wider">
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
                  className="w-16 h-16 rounded-full border-4 border-[#1e1f22] object-cover bg-white shadow-xl"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=800000&color=ffd700&size=64`;
                  }}
                />
                {isAdmin && (
                  <span className="absolute bottom-0 right-0 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold border border-[#1e1f22]" title="Admin">
                    ✓
                  </span>
                )}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate({ type: 'user-profile', userId: uid });
                }}
                className="bg-brand-maroon hover:bg-[#600000] text-amber-300 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border border-amber-400/40 shadow cursor-pointer transition-transform hover:scale-105"
              >
                Profili Gör
              </button>
            </div>

            {/* Display Name & Role */}
            <div className="space-y-0.5 mb-2">
              <div className="flex items-center gap-1.5">
                <h4 className="font-black text-sm text-white truncate max-w-[190px]">{name}</h4>
                {isAdmin && (
                  <span className="bg-red-600/90 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase">
                    Yönetici
                  </span>
                )}
              </div>
              <span className="text-[10px] text-gray-400 font-semibold block">
                {isAdmin ? '🛡️ Lig Yetkilisi' : '⚽ Bobble Lig Oyuncusu'}
              </span>
            </div>

            {/* Bio */}
            {bio ? (
              <p className="text-[11px] font-semibold text-gray-300 leading-tight bg-[#2b2d31] p-2 rounded-xl mb-2.5 whitespace-pre-wrap">
                {bio}
              </p>
            ) : (
              <p className="text-[10px] italic text-gray-500 mb-2">
                Henüz biyografi eklenmemiş.
              </p>
            )}

            {/* Favorites Info */}
            <div className="space-y-1.5 text-xs mb-3">
              {favTeam && (
                <div className="flex items-center gap-2 bg-[#2b2d31] p-2 rounded-xl">
                  {teamLogos[favTeam] ? (
                    <img src={teamLogos[favTeam]} alt={favTeam} className="w-5 h-5 rounded-full object-cover bg-white" />
                  ) : (
                    <span className="text-sm">🛡️</span>
                  )}
                  <div className="leading-none">
                    <span className="text-[8px] font-black uppercase text-amber-400 block">TUTTUĞU TAKIM</span>
                    <span className="text-[11px] font-black text-white">{favTeam}</span>
                  </div>
                </div>
              )}

              {favPlayer && (
                <div className="flex items-center gap-2 bg-[#2b2d31] p-2 rounded-xl">
                  <span className="text-sm">⭐</span>
                  <div className="leading-none">
                    <span className="text-[8px] font-black uppercase text-amber-400 block">FAVORİ OYUNCU</span>
                    <span className="text-[11px] font-black text-white">{favPlayer}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Wallet info */}
            <div className="border-t border-white/10 pt-2 flex items-center justify-between text-[11px] text-gray-300 font-bold">
              <span className="flex items-center gap-1 text-amber-400">
                <Coins className="w-3.5 h-3.5" />
                <span>Bakiye:</span>
              </span>
              <span className="font-mono font-black text-amber-300">
                {balance.toLocaleString('tr-TR')} ฿
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
