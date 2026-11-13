import React, { useState } from 'react';
import { Player, UserProfile, MarketValuePoint } from '../types';
import { getPlayerMarketValue, parseOwoValue, formatOwoValue, sortHistoryByDate, VALUATION_TODAY_DATE, calculatePerformanceMarketValue } from '../lib/marketValue';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface MarketValueModalProps {
  player: Player;
  isOpen?: boolean;
  isAdmin?: boolean;
  playerId?: string;
  currentUser?: UserProfile | null;
  teamLogos?: Record<string, string>;
  onClose: () => void;
  onPlayerUpdated?: (updatedPlayer: Player) => void;
  onSaveSuccess?: (updatedPlayer: Partial<Player>) => void;
}

export default function MarketValueModal({
  player,
  isOpen,
  isAdmin: propIsAdmin,
  playerId,
  currentUser,
  teamLogos = {},
  onClose,
  onPlayerUpdated,
  onSaveSuccess
}: MarketValueModalProps) {
  if (isOpen !== undefined && !isOpen) return null;

  const isAdmin = propIsAdmin !== undefined ? propIsAdmin : (currentUser?.admin === true);
  const mvData = getPlayerMarketValue(player);

  // Guarantee strictly chronological order from past to present
  const points = sortHistoryByDate(mvData.history);

  const [activePointIndex, setActivePointIndex] = useState<number | null>(
    points.length > 0 ? points.length - 1 : null
  );

  // Admin form state
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [showHistoryManager, setShowHistoryManager] = useState(false);
  const [newValueInput, setNewValueInput] = useState<string>('');
  const [newDateInput, setNewDateInput] = useState<string>(VALUATION_TODAY_DATE);
  const [newClubInput, setNewClubInput] = useState<string>(player.pteam || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  // Performance-based valuation calculation for 08.11.2026
  const perfValuation = calculatePerformanceMarketValue(player);

  // Chart dimensions & scaling
  const width = 640;
  const height = 240;
  const paddingX = 75; // generous padding for dynamic Y-axis label text
  const paddingY = 40;

  // Fully dynamic Y scale calculation based ONLY on actual values in points
  const numericValues = points.map((p) => p.value).filter((v) => typeof v === 'number' && !isNaN(v));
  const rawPeak = numericValues.length > 0 ? Math.max(...numericValues, 0) : 0;

  // Add 25% headroom so the peak doesn't touch the top border; if empty or 0, default to 10
  const maxVal = rawPeak > 0 ? Math.ceil(rawPeak * 1.25) : 10;
  const minVal = 0;

  // Calculate coordinates for SVG
  const coords = points.map((pt, idx) => {
    let x = width / 2;
    if (points.length > 1) {
      x = paddingX + (idx / (points.length - 1)) * (width - 2 * paddingX);
    }
    const val = typeof pt.value === 'number' && !isNaN(pt.value) ? pt.value : 0;
    const yRatio = (val - minVal) / (maxVal - minVal || 1);
    const y = height - paddingY - yRatio * (height - 2 * paddingY);
    return { x, y, pt };
  });

  // Construct SVG Path
  let pathD = '';
  let areaD = '';
  if (coords.length > 1) {
    pathD = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const cx1 = prev.x + (curr.x - prev.x) / 2;
      const cy1 = prev.y;
      const cx2 = prev.x + (curr.x - prev.x) / 2;
      const cy2 = curr.y;
      pathD += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${curr.x} ${curr.y}`;
    }

    const first = coords[0];
    const last = coords[coords.length - 1];
    areaD = `${pathD} L ${last.x} ${height - paddingY} L ${first.x} ${height - paddingY} Z`;
  }

  // Active point data
  const safeActiveIndex = activePointIndex !== null && activePointIndex < points.length
    ? activePointIndex
    : (points.length > 0 ? points.length - 1 : null);

  const activePoint = safeActiveIndex !== null && points[safeActiveIndex] ? points[safeActiveIndex] : null;
  const prevPoint = safeActiveIndex !== null && safeActiveIndex > 0 ? points[safeActiveIndex - 1] : null;
  const diffVal = activePoint && prevPoint ? activePoint.value - prevPoint.value : 0;

  // Save new valuation point
  const handleSaveValue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newValueInput.trim()) {
      setErrorMsg('Lütfen geçerli bir değer giriniz (Örn: 10 owo, 500 bin owo, 18 milyon owo)');
      return;
    }

    const docId = playerId || player.docId || player.id;
    if (!docId) {
      setErrorMsg('Oyuncu kimliği bulunamadı.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const parsed = parseOwoValue(newValueInput);
      const now = new Date();
      const defaultDateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
      const dateText = newDateInput.trim() || defaultDateStr;
      const clubName = newClubInput.trim() || player.pteam || '';
      const clubLogo = teamLogos[clubName] || '';

      const newPoint: MarketValuePoint = {
        id: `mv_${Date.now()}`,
        date: dateText,
        value: parsed.num,
        formattedValue: parsed.formatted,
        club: clubName,
        clubLogo: clubLogo
      };

      // Always sort history strictly chronologically (past -> present)
      const updatedHistory = sortHistoryByDate([...points, newPoint]);
      const latestPoint = updatedHistory[updatedHistory.length - 1];

      const ref = doc(db, 'players', docId);
      await updateDoc(ref, {
        deger: latestPoint.value,
        degerFormatted: latestPoint.formattedValue || formatOwoValue(latestPoint.value),
        degerHistory: updatedHistory
      });

      const updatedPlayer: Player = {
        ...player,
        deger: latestPoint.value,
        degerFormatted: latestPoint.formattedValue || formatOwoValue(latestPoint.value),
        degerHistory: updatedHistory
      };

      if (onPlayerUpdated) onPlayerUpdated(updatedPlayer);
      if (onSaveSuccess) onSaveSuccess(updatedPlayer);

      setNewValueInput('');
      setNewDateInput('');
      setShowAdminForm(false);
      setSuccessMsg(`✅ Değer (${parsed.formatted}) başarıyla kaydedildi!`);
      setTimeout(() => setSuccessMsg(null), 3000);

      const newIdx = updatedHistory.findIndex((pt) => pt.id === newPoint.id);
      setActivePointIndex(newIdx !== -1 ? newIdx : updatedHistory.length - 1);
    } catch (err: any) {
      console.error('Error saving market value:', err);
      setErrorMsg('Kayıt başarısız: ' + (err?.message || 'Bilinmeyen hata'));
    } finally {
      setSaving(false);
    }
  };

  // 1-Click apply performance-calculated value for 08.11.2026
  const handleApplyPerformanceValue = async () => {
    const docId = playerId || player.docId || player.id;
    if (!docId) {
      setErrorMsg('Oyuncu kimliği bulunamadı.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const clubName = player.pteam || '';
      const clubLogo = teamLogos[clubName] || (player as any).teamLogo || '';

      const newPoint: MarketValuePoint = {
        id: `mv_${Date.now()}`,
        date: VALUATION_TODAY_DATE,
        value: perfValuation.num,
        formattedValue: perfValuation.formatted,
        club: clubName,
        clubLogo: clubLogo
      };

      // Filter out previous today points to replace with fresh calculation if existing
      const filtered = points.filter((pt) => pt.date !== VALUATION_TODAY_DATE);
      const updatedHistory = sortHistoryByDate([...filtered, newPoint]);
      const latestPoint = updatedHistory[updatedHistory.length - 1];

      const ref = doc(db, 'players', docId);
      await updateDoc(ref, {
        deger: latestPoint.value,
        degerFormatted: latestPoint.formattedValue || formatOwoValue(latestPoint.value),
        degerHistory: updatedHistory
      });

      const updatedPlayer: Player = {
        ...player,
        deger: latestPoint.value,
        degerFormatted: latestPoint.formattedValue || formatOwoValue(latestPoint.value),
        degerHistory: updatedHistory
      };

      if (onPlayerUpdated) onPlayerUpdated(updatedPlayer);
      if (onSaveSuccess) onSaveSuccess(updatedPlayer);

      setSuccessMsg(`✅ 08.11.2026 Değeri (${perfValuation.formatted}) başarıyla kaydedildi!`);
      setTimeout(() => setSuccessMsg(null), 3000);

      const newIdx = updatedHistory.findIndex((pt) => pt.id === newPoint.id);
      setActivePointIndex(newIdx !== -1 ? newIdx : updatedHistory.length - 1);
    } catch (err: any) {
      console.error('Error applying performance market value:', err);
      setErrorMsg('Değer uygulanamadı: ' + (err?.message || 'Bilinmeyen hata'));
    } finally {
      setSaving(false);
    }
  };
  const handleDeletePoint = async (indexToDelete: number) => {
    const docId = playerId || player.docId || player.id;
    if (!docId) return;

    setSaving(true);
    setErrorMsg(null);

    try {
      // Sort after filtering to preserve chronological consistency
      const updatedHistory = sortHistoryByDate(points.filter((_, idx) => idx !== indexToDelete));
      const latestPoint = updatedHistory.length > 0 ? updatedHistory[updatedHistory.length - 1] : null;
      const newCurrentNum = latestPoint ? latestPoint.value : 0;
      const newFormatted = latestPoint ? latestPoint.formattedValue || formatOwoValue(latestPoint.value) : '';

      const ref = doc(db, 'players', docId);
      await updateDoc(ref, {
        deger: newCurrentNum,
        degerFormatted: newFormatted,
        degerHistory: updatedHistory
      });

      const updatedPlayer: Player = {
        ...player,
        deger: newCurrentNum,
        degerFormatted: newFormatted,
        degerHistory: updatedHistory
      };

      if (onPlayerUpdated) onPlayerUpdated(updatedPlayer);
      if (onSaveSuccess) onSaveSuccess(updatedPlayer);

      setActivePointIndex(updatedHistory.length > 0 ? updatedHistory.length - 1 : null);
      setSuccessMsg('✅ Kayıt silindi.');
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (e: any) {
      console.error(e);
      setErrorMsg('Silme hatası: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Reset / Clear ALL history
  const handleClearAllHistory = async () => {
    const docId = playerId || player.docId || player.id;
    if (!docId) return;

    setSaving(true);
    setErrorMsg(null);

    try {
      const ref = doc(db, 'players', docId);
      await updateDoc(ref, {
        deger: 0,
        degerFormatted: '',
        degerHistory: []
      });

      const updatedPlayer: Player = {
        ...player,
        deger: 0,
        degerFormatted: '',
        degerHistory: []
      };

      if (onPlayerUpdated) onPlayerUpdated(updatedPlayer);
      if (onSaveSuccess) onSaveSuccess(updatedPlayer);

      setActivePointIndex(null);
      setConfirmDeleteAll(false);
      setSuccessMsg('✅ Tüm piyasa değeri geçmişi tamamen temizlendi.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      console.error(e);
      setErrorMsg('Geçmişi temizleme hatası: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-4 select-text animate-fade-in">
      <div className="bg-[#fcfbf7] text-[#222] w-full max-w-2xl rounded-3xl border-3 border-brand-maroon shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-brand-maroon via-[#5e0000] to-brand-maroon text-brand-gold p-4 px-6 flex items-center justify-between border-b-2 border-brand-gold/40 shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <img 
              src={player.foto} 
              className="w-11 h-11 rounded-full object-cover border-2 border-brand-gold bg-white shadow-sm shrink-0" 
              alt={player.pname} 
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${player.pname}&background=800000&color=fff&size=100`;
              }}
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm md:text-base text-white uppercase tracking-wide">
                  {player.pname}
                </h3>
                <span className="bg-brand-gold text-brand-dark px-2 py-0.5 rounded text-[9px] font-black">
                  GEN {player.gen || '0'}
                </span>
              </div>
              <p className="text-[11px] text-brand-gold/90 font-bold flex items-center gap-1.5 mt-0.5">
                <span>📈 Piyasa Değeri Gelişimi (owo)</span>
                {player.pteam && (
                  <span className="text-gray-300 font-normal">| {player.pteam}</span>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-brand-gold flex items-center justify-center font-black text-lg transition-transform hover:scale-105 cursor-pointer"
            title="Kapat"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 md:p-6 overflow-y-auto space-y-4">
          {/* Notifications */}
          {successMsg && (
            <div className="bg-emerald-100 border border-emerald-400 text-emerald-900 px-4 py-2 rounded-xl text-xs font-bold text-center animate-fade-in shadow-xs">
              {successMsg}
            </div>
          )}
          {errorMsg && (
            <div className="bg-rose-100 border border-rose-400 text-rose-900 px-4 py-2 rounded-xl text-xs font-bold text-center animate-fade-in shadow-xs">
              {errorMsg}
            </div>
          )}

          {/* Transfermarkt Stats Top Row */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Aktüel Değer */}
            <div className="text-center sm:text-left flex-1">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                Aktüel Piyasa Değeri:
              </span>
              <div className="flex items-baseline gap-2 justify-center sm:justify-start mt-0.5">
                <span className="text-2xl md:text-3xl font-black text-[#0f4c81] tracking-tight">
                  {mvData.hasValue ? mvData.formatted : 'Belirtilmedi'}
                </span>
                {mvData.hasValue && (
                  <span className="text-[11px] text-gray-400 font-bold">
                    (owo)
                  </span>
                )}
              </div>
            </div>

            {/* En Yüksek Piyasa Değeri */}
            <div className="text-center sm:text-right flex-1 border-t sm:border-t-0 sm:border-l border-gray-150 pt-2 sm:pt-0 sm:pl-4">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                En Yüksek Piyasa Değeri:
              </span>
              <div className="flex flex-col items-center sm:items-end mt-0.5">
                <span className="text-lg md:text-xl font-black text-gray-800">
                  {mvData.hasValue ? mvData.peakFormatted : '-'}
                </span>
                <span className="text-[11px] font-bold text-gray-400">
                  {mvData.peakDate || '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Transfermarkt Style Area Chart */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 font-bold mb-2 px-1">
              <span>Piyasa Değeri Grafiği (owo)</span>
              <span>Son Güncelleme: {mvData.lastUpdateDate}</span>
            </div>

            {points.length === 0 ? (
              <div className="py-12 px-4 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                <span className="text-3xl block mb-2">📉</span>
                <p className="text-sm font-bold text-gray-700">Henüz piyasa değeri kaydı girilmedi.</p>
                <p className="text-xs text-gray-400 mt-1">
                  {isAdmin 
                    ? 'Aşağıdaki formu kullanarak bu oyuncu için ilk piyasa değerini belirleyebilirsiniz.'
                    : 'Admin tarafından henüz bu oyuncuya piyasa değeri atanmadı.'}
                </p>
                {isAdmin && !showAdminForm && (
                  <button
                    type="button"
                    onClick={() => setShowAdminForm(true)}
                    className="mt-4 bg-brand-maroon hover:bg-black text-brand-gold text-xs font-black uppercase px-4 py-2 rounded-xl transition-transform hover:scale-102 cursor-pointer shadow-sm"
                  >
                    ➕ İlk Değeri Ekle
                  </button>
                )}
              </div>
            ) : (
              <div className="w-full overflow-x-auto select-none">
                <svg 
                  viewBox={`0 0 ${width} ${height}`} 
                  className="w-full h-auto min-w-[500px]"
                  style={{ maxHeight: '250px' }}
                >
                  <defs>
                    <linearGradient id="tmGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1e40af" stopOpacity="0.85" />
                      <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.08" />
                    </linearGradient>

                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.25" />
                    </filter>
                  </defs>

                  {/* Dynamic Y-Axis Grid Lines & Actual Dynamic Labels */}
                  {[1, 0.66, 0.33, 0].map((ratio, i) => {
                    const y = height - paddingY - ratio * (height - 2 * paddingY);
                    const val = Math.round(minVal + ratio * (maxVal - minVal));
                    return (
                      <g key={i}>
                        <line 
                          x1={paddingX} 
                          y1={y} 
                          x2={width - 20} 
                          y2={y} 
                          stroke="#e2e8f0" 
                          strokeDasharray="4 4" 
                          strokeWidth="1" 
                        />
                        <text 
                          x={paddingX - 8} 
                          y={y + 3} 
                          textAnchor="end" 
                          fontSize="9" 
                          fontWeight="bold" 
                          fill="#64748b"
                        >
                          {formatOwoValue(val)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Bottom Baseline */}
                  <line 
                    x1={paddingX} 
                    y1={height - paddingY} 
                    x2={width - 20} 
                    y2={height - paddingY} 
                    stroke="#cbd5e1" 
                    strokeWidth="2" 
                  />

                  {/* Single point visual helper */}
                  {points.length === 1 && coords.length === 1 && (
                    <g>
                      <line 
                        x1={paddingX} 
                        y1={coords[0].y} 
                        x2={width - 20} 
                        y2={coords[0].y} 
                        stroke="#1e40af" 
                        strokeWidth="2.5" 
                        strokeDasharray="6 6" 
                        opacity="0.65" 
                      />
                      <polygon 
                        points={`${paddingX},${coords[0].y} ${width - 20},${coords[0].y} ${width - 20},${height - paddingY} ${paddingX},${height - paddingY}`} 
                        fill="url(#tmGradient)" 
                        opacity="0.35" 
                      />
                    </g>
                  )}

                  {/* Area Gradient Fill */}
                  {areaD && (
                    <path d={areaD} fill="url(#tmGradient)" />
                  )}

                  {/* Main Curve Line */}
                  {pathD && (
                    <path 
                      d={pathD} 
                      fill="none" 
                      stroke="#1e40af" 
                      strokeWidth="3.5" 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                    />
                  )}

                  {/* Points on Curve with Club Badges */}
                  {coords.map(({ x, y, pt }, idx) => {
                    const isActive = safeActiveIndex === idx;
                    const clubName = pt.club || player.pteam || '';
                    const hasLogo = Boolean(pt.clubLogo || teamLogos[clubName]);
                    const logoUrl = pt.clubLogo || teamLogos[clubName];

                    return (
                      <g 
                        key={pt.id || idx}
                        onClick={() => setActivePointIndex(idx)}
                        className="cursor-pointer group"
                      >
                        {/* Active vertical guide line */}
                        {isActive && (
                          <line 
                            x1={x} 
                            y1={paddingY - 10} 
                            x2={x} 
                            y2={height - paddingY} 
                            stroke="#3b82f6" 
                            strokeWidth="1.5" 
                            strokeDasharray="3 3" 
                          />
                        )}

                        {/* Milestone Circle */}
                        <circle 
                          cx={x} 
                          y={y} 
                          r={isActive ? 7 : 5} 
                          fill={isActive ? '#3b82f6' : '#1e3a8a'} 
                          stroke="#ffffff" 
                          strokeWidth={isActive ? 3 : 2} 
                          filter="url(#glow)"
                          className="transition-all hover:scale-125"
                        />

                        {/* Club Logo Badge on Curve (Transfermarkt style) */}
                        {hasLogo ? (
                          <g transform={`translate(${x - 11}, ${y - 32})`}>
                            <circle cx="11" cy="11" r="11" fill="#ffffff" stroke="#1e3a8a" strokeWidth="1.5" filter="url(#glow)" />
                            <clipPath id={`clip-${idx}`}>
                              <circle cx="11" cy="11" r="10" />
                            </clipPath>
                            <image 
                              href={logoUrl} 
                              x="1" 
                              y="1" 
                              width="20" 
                              height="20" 
                              clipPath={`url(#clip-${idx})`} 
                              preserveAspectRatio="xMidYMid slice" 
                            />
                          </g>
                        ) : (
                          <g transform={`translate(${x - 8}, ${y - 22})`}>
                            <circle cx="8" cy="8" r="8" fill="#ffffff" stroke="#64748b" strokeWidth="1" />
                            <text x="8" y="11" textAnchor="middle" fontSize="8" fontWeight="black" fill="#1e3a8a">⚽</text>
                          </g>
                        )}

                        {/* Date on X Axis */}
                        <text 
                          x={x} 
                          y={height - paddingY + 16} 
                          textAnchor="middle" 
                          fontSize="9" 
                          fontWeight={isActive ? 'black' : 'bold'} 
                          fill={isActive ? '#1e3a8a' : '#64748b'}
                        >
                          {pt.date}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}

            {/* Active Milestone Detail Box */}
            {activePoint && (
              <div className="mt-3 bg-gradient-to-r from-blue-50 via-slate-50 to-blue-50 p-3 rounded-xl border border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  {(activePoint.clubLogo || teamLogos[activePoint.club || player.pteam || '']) ? (
                    <img 
                      src={activePoint.clubLogo || teamLogos[activePoint.club || player.pteam || '']} 
                      className="w-9 h-9 rounded-full object-cover border border-blue-400 bg-white shrink-0 shadow-xs" 
                      alt="" 
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-blue-900 text-white flex items-center justify-center text-sm font-black shrink-0">
                      ⚽
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-[#0f4c81]">
                        {activePoint.formattedValue || formatOwoValue(activePoint.value)}
                      </span>
                      {diffVal > 0 && (
                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                          +{formatOwoValue(diffVal)}
                        </span>
                      )}
                      {diffVal < 0 && (
                        <span className="text-[10px] font-black text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                          -{formatOwoValue(Math.abs(diffVal))}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-600 font-bold block">
                      {activePoint.club || player.pteam || 'Kulüp'} • {activePoint.date}
                    </span>
                  </div>
                </div>

                {isAdmin && safeActiveIndex !== null && (
                  <button
                    type="button"
                    onClick={() => handleDeletePoint(safeActiveIndex)}
                    disabled={saving}
                    className="text-red-700 hover:text-white hover:bg-red-600 text-[10px] font-black bg-white px-3 py-1.5 rounded-lg border border-red-300 transition-all cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1"
                    title="Bu noktayı geçmişten siler"
                  >
                    <span>🗑️</span>
                    <span>Bu Noktayı Sil</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Admin Control Panel */}
          {isAdmin && (
            <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl p-4 border border-amber-300 shadow-sm space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">👑</span>
                  <span className="text-xs font-black uppercase text-amber-950 tracking-wide">
                    Admin: Piyasa Değeri Belirle / Güncelle
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleApplyPerformanceValue}
                    disabled={saving}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-black uppercase px-2.5 py-1 rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1"
                    title={`Önerilen 08.11.2026 Değeri: ${perfValuation.formatted}`}
                  >
                    <span>⚡</span>
                    <span>08.11.2026 Değeri Uygula</span>
                  </button>
                  {points.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowHistoryManager(!showHistoryManager)}
                      className="bg-white hover:bg-gray-100 text-gray-800 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border border-gray-300 transition-colors cursor-pointer shadow-xs"
                    >
                      {showHistoryManager ? 'Geçmişi Gizle' : `📋 Tüm Kayıtlar (${points.length})`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowAdminForm(!showAdminForm)}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black uppercase px-3 py-1 rounded-lg transition-colors cursor-pointer shadow-xs"
                  >
                    {showAdminForm ? '✕ Formu Kapat' : '➕ Yeni Değer / Milat Ekle'}
                  </button>
                </div>
              </div>

              {/* All History Records Manager Table */}
              {showHistoryManager && points.length > 0 && (
                <div className="pt-2 border-t border-amber-200 animate-fade-in space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-amber-900 uppercase">
                      Kayıtlı Milat Listesi ({points.length})
                    </span>
                    {!confirmDeleteAll ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteAll(true)}
                        className="text-[10px] font-black text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded border border-red-200 cursor-pointer"
                      >
                        🧹 Tüm Geçmişi Sıfırla
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 bg-red-100 p-1 px-2 rounded-lg border border-red-300">
                        <span className="text-[10px] font-black text-red-900">Emin misiniz?</span>
                        <button
                          type="button"
                          onClick={handleClearAllHistory}
                          className="bg-red-600 hover:bg-red-700 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase cursor-pointer"
                        >
                          Evet, Tümünü Sil
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteAll(false)}
                          className="bg-gray-300 hover:bg-gray-400 text-gray-800 text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer"
                        >
                          Vazgeç
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {points.map((pt, idx) => (
                      <div 
                        key={pt.id || idx}
                        className="flex items-center justify-between bg-white p-2 rounded-xl border border-amber-200 text-xs shadow-2xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 text-center font-black text-gray-400 text-[10px]">
                            #{idx + 1}
                          </span>
                          <span className="font-bold text-gray-700 text-[11px]">
                            {pt.date}
                          </span>
                          <span className="font-black text-[#0f4c81]">
                            {pt.formattedValue || formatOwoValue(pt.value)}
                          </span>
                          {pt.club && (
                            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.2 rounded truncate max-w-[120px]">
                              {pt.club}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeletePoint(idx)}
                          disabled={saving}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1 px-2 rounded font-bold text-[10px] border border-red-200 cursor-pointer disabled:opacity-50"
                          title="Bu kaydı sil"
                        >
                          Sil
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add New Value Form */}
              {showAdminForm && (
                <form onSubmit={handleSaveValue} className="space-y-3 pt-2 border-t border-amber-200 animate-fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Value Input */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-gray-700 uppercase">
                        Değer (owo)
                      </label>
                      <input 
                        type="text" 
                        value={newValueInput}
                        onChange={(e) => setNewValueInput(e.target.value)}
                        placeholder="Örn: 10 owo, 500 bin owo, 18 milyon owo"
                        className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 focus:border-brand-maroon focus:outline-hidden"
                      />
                    </div>

                    {/* Date / Month Input */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-gray-700 uppercase">
                        Tarih / Ay
                      </label>
                      <input 
                        type="text" 
                        value={newDateInput}
                        onChange={(e) => setNewDateInput(e.target.value)}
                        placeholder="Örn: 01.01.2026, 17.01.2026, Ocak 2026"
                        className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 focus:border-brand-maroon focus:outline-hidden"
                      />
                    </div>

                    {/* Club Selection */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-gray-700 uppercase">
                        Kulüp (Grafik Logosu)
                      </label>
                      <input 
                        type="text" 
                        value={newClubInput}
                        onChange={(e) => setNewClubInput(e.target.value)}
                        placeholder="Örn: Holy Munchen, Xeilmes, Pofuspor"
                        className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 focus:border-brand-maroon focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAdminForm(false)}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-black rounded-xl cursor-pointer"
                    >
                      Vazgeç
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2 bg-brand-maroon hover:bg-black text-brand-gold text-xs font-black rounded-xl uppercase tracking-wider cursor-pointer shadow-md disabled:opacity-50"
                    >
                      {saving ? '⏳ Kaydediliyor...' : '💾 Değeri Kaydet'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
