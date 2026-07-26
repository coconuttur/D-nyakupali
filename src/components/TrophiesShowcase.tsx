import React, { useState } from 'react';
import { TROPHIES_LIST, TROPHY_MAP } from '../lib/trophies';

interface TrophiesShowcaseProps {
  kupalar?: Record<string, number>;
  isAdmin?: boolean;
  onManageClick?: () => void;
  title?: string;
  size?: 'normal' | 'large';
}

export function TrophiesShowcase({ kupalar = {}, isAdmin = false, onManageClick, size = 'large' }: TrophiesShowcaseProps) {
  // Filter trophies with count > 0
  const activeTrophies = TROPHIES_LIST.filter(t => (kupalar[t.id] || 0) > 0);

  if (activeTrophies.length === 0 && !isAdmin) {
    return null;
  }

  const isLarge = size === 'large';

  return (
    <div className={`w-full flex items-center justify-center flex-wrap gap-4 md:gap-6 my-4 p-4 md:p-6 bg-gradient-to-r from-amber-500/10 via-brand-gold/15 to-amber-500/10 rounded-3xl border-2 border-brand-gold/40 shadow-sm relative overflow-hidden select-text ${isLarge ? 'py-5 md:py-7' : 'py-3'}`}>
      
      {activeTrophies.length === 0 && isAdmin && (
        <div className="text-center py-2">
          <p className="text-xs font-bold text-gray-500 mb-2">Henüz kupa eklenmemiş.</p>
        </div>
      )}

      {activeTrophies.map(t => {
        const count = kupalar[t.id] || 0;
        return (
          <div 
            key={t.id} 
            className="relative flex flex-col items-center justify-end group cursor-pointer transition-transform hover:scale-110 duration-200 select-text"
            title={`${count}x ${t.name}`}
          >
            <img 
              src={t.icon} 
              alt={t.name}
              className={`${isLarge ? 'h-20 md:h-28' : 'h-12 md:h-16'} w-auto object-contain filter drop-shadow-md`} 
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/60?text=🏆';
              }}
            />
            {/* Transfermarkt style blue circle count badge */}
            <span className={`bg-[#29b6f6] text-white font-black rounded-full flex items-center justify-center border-2 border-white shadow-lg z-10 select-none ${
              isLarge 
                ? 'min-w-[28px] h-[28px] text-xs md:text-sm px-1 -mt-3.5' 
                : 'min-w-[22px] h-[22px] text-[10px] md:text-xs px-1 -mt-2.5'
            }`}>
              {count}
            </span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-6 bg-brand-dark text-white text-[9px] font-bold py-0.5 px-2 rounded whitespace-nowrap z-20 pointer-events-none">
              {t.name}
            </span>
          </div>
        );
      })}

      {isAdmin && onManageClick && (
        <button
          onClick={onManageClick}
          className="bg-brand-gold text-brand-dark hover:bg-amber-400 font-black text-xs md:text-sm uppercase px-4 py-2 rounded-xl border-2 border-brand-maroon shadow-md flex items-center gap-1.5 cursor-pointer transition-transform hover:scale-105 my-auto"
          title="Kupa sayılarını güncelle"
        >
          <span>🏆</span>
          <span>Kupa Ekle/Düzenle</span>
        </button>
      )}
    </div>
  );
}

interface TrophyAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  kupalar?: Record<string, number>;
  onSave: (updated: Record<string, number>) => Promise<void>;
  targetName: string;
}

export function TrophyAdminModal({ isOpen, onClose, kupalar = {}, onSave, targetName }: TrophyAdminModalProps) {
  const [counts, setCounts] = useState<Record<string, number>>(() => ({ ...kupalar }));
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleCountChange = (id: string, delta: number) => {
    setCounts(prev => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [id]: next };
    });
  };

  const handleDirectChange = (id: string, val: string) => {
    const parsed = parseInt(val, 10);
    setCounts(prev => ({
      ...prev,
      [id]: isNaN(parsed) || parsed < 0 ? 0 : parsed
    }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSave(counts);
      onClose();
    } catch (err) {
      console.error(err);
      alert('Kupalar güncellenirken bir hata oluştu!');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 select-text">
      <div className="bg-[#f2ede1] text-[#3d3d3d] w-full max-w-md rounded-2xl p-6 border-b-6 border-brand-maroon shadow-2xl relative select-text">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-xl font-bold text-brand-maroon hover:scale-110 transition-transform cursor-pointer"
        >
          ✕
        </button>

        <h3 className="text-center font-black text-base md:text-lg text-brand-maroon border-b border-gray-300 pb-2 mb-4 uppercase">
          🏆 Kupa Yönetimi: <span className="text-brand-dark">{targetName}</span>
        </h3>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {TROPHIES_LIST.map(t => {
            const count = counts[t.id] || 0;
            return (
              <div 
                key={t.id} 
                className="flex items-center justify-between bg-white/90 p-3 rounded-xl border border-gray-200 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <img src={t.icon} className="h-10 w-10 object-contain" alt={t.name} />
                  <div>
                    <h4 className="font-extrabold text-xs md:text-sm text-brand-dark">{t.name}</h4>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCountChange(t.id, -1)}
                    className="w-8 h-8 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 font-black text-base flex items-center justify-center cursor-pointer border border-red-300"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={count}
                    onChange={(e) => handleDirectChange(t.id, e.target.value)}
                    className="w-12 h-8 text-center font-black text-sm bg-white border border-gray-300 rounded-lg"
                  />
                  <button
                    onClick={() => handleCountChange(t.id, 1)}
                    className="w-8 h-8 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 font-black text-base flex items-center justify-center cursor-pointer border border-green-300"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-gray-300">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 bg-gray-200 hover:bg-gray-300 cursor-pointer uppercase"
          >
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-xs font-black text-white bg-brand-maroon hover:bg-red-900 cursor-pointer shadow-md uppercase border border-brand-dark disabled:opacity-50"
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
