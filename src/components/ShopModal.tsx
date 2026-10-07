import React from 'react';
import { UserProfile } from '../types';

export type ShopPackType = 'shop_normal' | 'shop_enhanced' | 'shop_secret';

interface ShopModalProps {
  currentUser: UserProfile | null;
  currentBalance: number;
  onClose: () => void;
  onBuyPack: (packType: ShopPackType, price: number) => void;
}

export const SHOP_PACK_CONFIGS: Record<ShopPackType, {
  id: ShopPackType;
  name: string;
  price: number;
  cardCount: number;
  shinyChance: number;   // fraction, e.g. 0.06
  secretChance: number;  // fraction, e.g. 0.006
  shinyLabel: string;
  secretLabel: string;
  badge: string;
  icon: string;
  gradient: string;
  borderColor: string;
  description: string;
}> = {
  shop_normal: {
    id: 'shop_normal',
    name: 'Normal Kutu',
    price: 500,
    cardCount: 5,
    shinyChance: 0.06,
    secretChance: 0.006,
    shinyLabel: '%6',
    secretLabel: '%0.6',
    badge: 'STANDART',
    icon: '📦',
    gradient: 'from-amber-600 via-amber-700 to-amber-900',
    borderColor: 'border-amber-400',
    description: 'Klasik koleksiyon kutusu. 5 kart içerir. Temel parıltılı ve gizemli kart şansı sunar.'
  },
  shop_enhanced: {
    id: 'shop_enhanced',
    name: 'Enhanced Kutu',
    price: 1000,
    cardCount: 5,
    shinyChance: 0.12,
    secretChance: 0.012,
    shinyLabel: '%12',
    secretLabel: '%1.2',
    badge: '2X GELİŞMİŞ',
    icon: '⚡',
    gradient: 'from-amber-500 via-yellow-600 to-orange-800',
    borderColor: 'border-yellow-400',
    description: 'Gelişmiş koleksiyoncu kutusu! 2 kat daha yüksek Altın (%12) ve Secret (%1.2) şansı!'
  },
  shop_secret: {
    id: 'shop_secret',
    name: 'Secret Kutusu',
    price: 5000,
    cardCount: 5,
    shinyChance: 0.24,
    secretChance: 0.10,
    shinyLabel: '%24',
    secretLabel: '%10',
    badge: '🕶️ EFSANEVİ',
    icon: '👑',
    gradient: 'from-purple-900 via-stone-900 to-black',
    borderColor: 'border-purple-400 ring-2 ring-purple-400/50',
    description: 'Ultra nadir elit kutu! Her kartta %10 Secret ve %24 Altın çıkma ihtimali!'
  }
};

export function ShopModal({ currentUser, currentBalance, onClose, onBuyPack }: ShopModalProps) {
  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5 animate-fade-in overflow-y-auto">
      <div className="bg-[#1f0000] border-4 border-amber-400 rounded-3xl max-w-4xl w-full p-4 sm:p-6 text-white shadow-2xl relative space-y-6 my-auto">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 bg-red-700 hover:bg-red-800 text-white rounded-full w-9 h-9 flex items-center justify-center font-black text-sm border-2 border-amber-300 transition-colors cursor-pointer shadow-md z-20"
        >
          ✕
        </button>

        {/* Header Bar */}
        <div className="text-center space-y-2 border-b border-amber-400/30 pb-4">
          <div className="inline-flex items-center gap-2 bg-amber-400 text-brand-maroon px-4 py-1 rounded-full font-black text-xs uppercase tracking-widest shadow-md">
            <span>🛒 RESMİ KART MAĞAZASI</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black uppercase text-amber-300 tracking-tight">
            PANINI KOLEKSİYON KUTULARI
          </h2>
          <p className="text-xs sm:text-sm text-stone-300 font-bold max-w-lg mx-auto">
            Kutulardan çıkan çift kartları satarak para kazanın, mağazadan daha yüksek oranlı kutular satın alın!
          </p>

          {/* User Balance Display */}
          <div className="inline-flex items-center gap-2.5 bg-black/60 border-2 border-amber-400/80 px-5 py-2 rounded-2xl shadow-inner mt-2">
            <span className="text-xl">💰</span>
            <span className="text-xs font-black uppercase text-amber-200">Mevcut Bakiyeniz:</span>
            <span className="text-lg font-black font-mono text-yellow-300">
              {currentBalance.toLocaleString('tr-TR')} Para
            </span>
          </div>
        </div>

        {/* 3 Pack Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {(Object.keys(SHOP_PACK_CONFIGS) as ShopPackType[]).map((key) => {
            const pack = SHOP_PACK_CONFIGS[key];
            const canAfford = currentBalance >= pack.price;

            return (
              <div
                key={pack.id}
                className={`bg-gradient-to-b ${pack.gradient} border-4 ${pack.borderColor} rounded-3xl p-5 flex flex-col justify-between items-center text-center space-y-4 shadow-xl relative overflow-hidden transition-all duration-300 hover:scale-[1.02]`}
              >
                {/* Pack Top Badge */}
                <div className="w-full flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase bg-black/60 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-300/40">
                    {pack.badge}
                  </span>
                  <span className="text-[10px] font-black uppercase bg-amber-400 text-brand-maroon px-2 py-0.5 rounded-full">
                    {pack.cardCount} KART
                  </span>
                </div>

                {/* Pack Icon / Art */}
                <div className="relative py-2">
                  <span className="text-6xl sm:text-7xl block filter drop-shadow-2xl animate-pulse">
                    {pack.icon}
                  </span>
                </div>

                {/* Name & Description */}
                <div className="space-y-1.5 flex-1">
                  <h3 className="text-xl font-black uppercase text-white tracking-wide drop-shadow">
                    {pack.name}
                  </h3>
                  <p className="text-[11px] text-amber-100/90 font-medium leading-relaxed">
                    {pack.description}
                  </p>
                </div>

                {/* Odds Breakdown Table */}
                <div className="w-full bg-black/50 border border-white/20 rounded-2xl p-2.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between font-bold text-amber-300">
                    <span className="flex items-center gap-1">✨ Altın Kart:</span>
                    <span className="font-mono font-black text-amber-200">{pack.shinyLabel}</span>
                  </div>
                  <div className="flex items-center justify-between font-bold text-purple-300">
                    <span className="flex items-center gap-1">🕶️ Secret Kart:</span>
                    <span className="font-mono font-black text-purple-200">{pack.secretLabel}</span>
                  </div>
                </div>

                {/* Price & Buy Button */}
                <div className="w-full space-y-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-center gap-1.5 text-amber-300 font-mono font-black text-lg">
                    <span>🪙</span>
                    <span>{pack.price.toLocaleString('tr-TR')} PARA</span>
                  </div>

                  <button
                    onClick={() => {
                      if (!currentUser) {
                        alert('⚠️ Kutu satın almak için lütfen giriş yapın.');
                        return;
                      }
                      if (!canAfford) {
                        alert(`⚠️ Yetersiz bakiye! ${pack.name} için ${pack.price} Paraya ihtiyacınız var. Mevcut bakiyeniz: ${currentBalance} Para.`);
                        return;
                      }
                      onBuyPack(pack.id, pack.price);
                    }}
                    disabled={!canAfford}
                    className={`w-full py-3 px-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 shadow-lg ${
                      canAfford
                        ? 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-brand-maroon border-2 border-white hover:scale-105 active:scale-95'
                        : 'bg-stone-700/80 text-stone-400 border border-stone-600 cursor-not-allowed opacity-80'
                    }`}
                  >
                    <span>{canAfford ? '🛒 SATIN AL VE AÇ' : '🔒 YETERSİZ BAKİYE'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Helper Info */}
        <div className="bg-black/50 border border-amber-400/30 rounded-2xl p-3 text-[11px] text-amber-200/90 flex flex-wrap items-center justify-around gap-2 text-center">
          <span>💡 <b>Normal Çift Kart</b>: +100 Para</span>
          <span>•</span>
          <span>✨ <b>Altın Çift Kart</b>: +500 Para</span>
          <span>•</span>
          <span>🕶️ <b>Secret Çift Kart</b>: +1,000 Para</span>
        </div>

      </div>
    </div>
  );
}
