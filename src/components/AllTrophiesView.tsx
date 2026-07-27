import React from 'react';
import { TROPHIES_LIST } from '../lib/trophies';

interface AllTrophiesViewProps {
  onNavigate: (view: any) => void;
  onBack?: () => void;
}

export function AllTrophiesView({ onNavigate, onBack }: AllTrophiesViewProps) {
  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12 select-text">
      
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-brand-maroon via-[#6b0000] to-brand-maroon text-white p-6 sm:p-8 rounded-3xl border-4 border-brand-gold shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 text-center md:text-left z-10">
          <div className="inline-flex items-center gap-2 bg-brand-gold text-brand-maroon px-3 py-1 rounded-full font-black text-xs uppercase tracking-widest shadow-xs">
            <span>🏆 RESMİ KUPA & ÖDÜL KOLEKSİYONU</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black uppercase text-brand-gold tracking-tight drop-shadow-sm">
            KUPALAR & ŞAMPİYONLUK MÜZESİ
          </h1>
          <p className="text-xs sm:text-sm text-amber-100 font-bold max-w-xl">
            Tüm lig, kupa ve bireysel futbol ödüllerinin listesi. Herhangi bir kupaya tıklayarak sezon sezon şampiyonlar geçmişini ve kazanan oyuncuları inceleyebilirsiniz.
          </p>
        </div>

        {onBack && (
          <button
            onClick={onBack}
            className="bg-brand-gold hover:bg-white text-brand-dark font-black text-xs md:text-sm px-5 py-2.5 rounded-2xl border-2 border-brand-maroon shadow-md flex items-center gap-2 transition-all cursor-pointer uppercase shrink-0 z-10"
          >
            <span>←</span>
            <span>Geri Dön</span>
          </button>
        )}
      </div>

      {/* Grid of All Trophies */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4 sm:gap-6">
        {TROPHIES_LIST.map((trophy) => (
          <div
            key={trophy.id}
            onClick={() => onNavigate({ type: 'trophy-detail', trophyId: trophy.id })}
            className="bg-brand-card hover:bg-white rounded-3xl border-2 border-brand-maroon/20 hover:border-brand-gold p-5 flex flex-col items-center justify-between text-center transition-all duration-200 hover:-translate-y-1.5 hover:shadow-xl cursor-pointer group relative overflow-hidden"
          >
            {/* Background shimmer */}
            <div className="absolute inset-0 bg-gradient-to-b from-brand-gold/0 via-brand-gold/5 to-brand-gold/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>

            {/* Image Container */}
            <div className="w-28 h-28 sm:w-36 sm:h-36 flex items-center justify-center p-3 my-2 relative z-10">
              <img
                src={trophy.icon}
                alt={trophy.name}
                className="max-w-full max-h-full object-contain filter drop-shadow-lg group-hover:scale-110 transition-transform duration-300"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://via.placeholder.com/120?text=🏆';
                }}
              />
            </div>

            {/* Trophy Name Underneath */}
            <div className="w-full pt-3 border-t-2 border-brand-maroon/10 relative z-10 mt-2">
              <h3 className="font-black text-sm sm:text-base text-brand-maroon uppercase tracking-tight group-hover:text-amber-700 transition-colors line-clamp-2">
                {trophy.name}
              </h3>
              <span className="text-[10px] font-extrabold text-brand-gold bg-brand-maroon px-2.5 py-0.5 rounded-full inline-block mt-2 uppercase shadow-xs">
                Sezon Geçmişi →
              </span>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
