import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Match, UserProfile, Team } from '../types';

interface HaftalarProps {
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
  currentUser: UserProfile | null;
}

// Robust helper function to calculate or retrieve the first half score
function getFirstHalfScore(m: Match): string | null {
  if (m.iyScore) return m.iyScore;
  if (!m.played || !m.timeline || m.timeline.length === 0) return null;
  
  // Method 1: Look for a period event that represents first half (usually around minute 45)
  const firstHalfPeriod = m.timeline.find(evt => evt.type === 'period' && (evt.minute.includes('45') || evt.text?.toLowerCase().includes('ilk yarı') || evt.text?.toLowerCase().includes('iy')));
  if (firstHalfPeriod) {
    const pMin = parseFloat(firstHalfPeriod.minute.replace(/'/g, '')) || 45;
    let s1 = 0;
    let s2 = 0;
    m.timeline.forEach(evt => {
      if (evt.type === 'goal') {
        const minVal = parseFloat(evt.minute.replace(/'/g, '')) || 0;
        if (minVal <= pMin) {
          if (evt.team === 'team1') s1++;
          else if (evt.team === 'team2') s2++;
        }
      }
    });
    return `${s1} - ${s2}`;
  }
  
  // Method 2: Fallback to all goals scored in minutes <= 45 (or 45+X)
  let s1 = 0;
  let s2 = 0;
  let hasFirstHalfGoals = false;
  m.timeline.forEach(evt => {
    if (evt.type === 'goal') {
      const minStr = evt.minute.replace(/'/g, '').trim();
      let minVal = 0;
      if (minStr.includes('+')) {
        const parts = minStr.split('+');
        minVal = (parseFloat(parts[0]) || 0) + (parseFloat(parts[1]) || 0) / 10;
      } else {
        minVal = parseFloat(minStr) || 0;
      }
      if (minVal <= 45.9) {
        hasFirstHalfGoals = true;
        if (evt.team === 'team1') s1++;
        else if (evt.team === 'team2') s2++;
      }
    }
  });
  
  return hasFirstHalfGoals ? `${s1} - ${s2}` : '0 - 0';
}

export default function Haftalar({ currentLang, translations, onNavigate, teamLogos, currentUser }: HaftalarProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const activeBtnRef = React.useRef<HTMLDivElement | null>(null);

  // Admin match add states
  const [isAdmin, setIsAdmin] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [allTeams, setAllTeams] = useState<Team[]>([]);

  // Form states
  const [team1, setTeam1] = useState('');
  const [team2, setTeam2] = useState('');
  const [weekInput, setWeekInput] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [matchCategory, setMatchCategory] = useState('LİG MAÇI');

  // Check Admin status
  useEffect(() => {
    if (currentUser) {
      if (currentUser.admin === true) {
        setIsAdmin(true);
      } else {
        getDoc(doc(db, 'users', currentUser.uid)).then((docSnap) => {
          if (docSnap.exists() && docSnap.data().admin === true) {
            setIsAdmin(true);
          }
        });
      }
    } else {
      setIsAdmin(false);
    }
  }, [currentUser]);

  // Fetch teams for dropdown options
  useEffect(() => {
    const unsubTeams = onSnapshot(collection(db, "teams"), (snap) => {
      const list: Team[] = [];
      snap.forEach((doc) => {
        list.push({ name: doc.id, ...doc.data() } as Team);
      });
      setAllTeams(list.sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => unsubTeams();
  }, []);

  // Set default week input whenever selectedWeek changes
  useEffect(() => {
    setWeekInput(String(selectedWeek));
  }, [selectedWeek]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "matches"), (snap) => {
      const list: Match[] = [];
      snap.forEach(doc => {
        const m = doc.data() as Match;
        // Verify that this is a regular league match (week is numeric)
        const weekNum = Number(m.hafta);
        // Ensure m.isWorldCup is not true
        if (m.hafta && !isNaN(weekNum) && !(m as any).isWorldCup) {
          list.push(m);
        }
      });
      // Sort matches by datejav
      setMatches(list);
      
      // Determine default active week (first week that has unplayed matches, or the last week)
      if (list.length > 0) {
        const weeks = Array.from(new Set(list.map(m => Number(m.hafta)))).sort((a,b) => a - b);
        const firstUnplayedWeek = weeks.find(w => 
          list.some(m => Number(m.hafta) === w && !m.played)
        );
        setSelectedWeek(firstUnplayedWeek || weeks[weeks.length - 1] || 1);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (activeBtnRef.current) {
      activeBtnRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [selectedWeek, loading]);

  const t = translations[currentLang];

  // Group matches by week
  const grouped: Record<number, Match[]> = {};
  matches.forEach(m => {
    const w = Number(m.hafta);
    if (!grouped[w]) grouped[w] = [];
    grouped[w].push(m);
  });

  // Generate sequence from 1 to maximum week to allow full navigation
  const maxWeekFromGroup = Math.max(...Object.keys(grouped).map(Number), 1);
  const maxWeek = maxWeekFromGroup > 0 ? maxWeekFromGroup : 1;
  const weekNumbers = Array.from({ length: maxWeek }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      {loading ? (
        <h3 className="text-center text-gray-500 font-bold">{t.loading}</h3>
      ) : weekNumbers.length === 0 ? (
        <h3 className="text-center text-gray-500 font-bold">Henüz maç fikstürü eklenmemiş.</h3>
      ) : (
        <div className="space-y-8 animate-fade-in">
          {/* Week Horizontal Navigation */}
          <div className="flex gap-4 overflow-x-auto py-3 px-4 justify-start border-b border-brand-cream pb-4 scrollbar-thin">
            {weekNumbers.map((wNum) => {
              const weekMatches = grouped[wNum] || [];
              const unplayedCount = weekMatches.filter(m => !m.played).length;
              const isActive = selectedWeek === wNum;
              return (
                <div 
                  key={wNum} 
                  ref={isActive ? activeBtnRef : undefined}
                  className="flex flex-col items-center gap-1.5 min-w-[110px] pb-2 shrink-0"
                >
                  <button
                    onClick={() => setSelectedWeek(wNum)}
                    className={`py-2.5 px-4 rounded-xl font-black text-xs uppercase cursor-pointer border-2 transition-all w-full text-center ${
                      isActive
                        ? 'bg-brand-maroon text-white border-[#5c0101] shadow-[0_3px_0_0_#5c0101] translate-y-0.5'
                        : 'bg-[#d7cdb7] text-brand-maroon border-brand-maroon shadow-[0_3px_0_0_#800000] hover:bg-[#cbbfa6]'
                    }`}
                  >
                    {wNum}. {t.wText || (currentLang === 'tr' ? 'Hafta' : 'Week')}
                  </button>
                  {unplayedCount > 0 && (
                    <span className="text-[9px] font-black text-brand-maroon/75 tracking-wider uppercase mt-1">
                      {unplayedCount} {t.unplayed || (currentLang === 'tr' ? 'OYNANMAMIŞ' : 'UNPLAYED')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Matches List for selected Week */}
          <div className="max-w-2xl mx-auto space-y-8 px-4">
            {isAdmin && (
              <div className="flex justify-center mb-6">
                <button
                  onClick={() => setAddModalOpen(true)}
                  className="bg-brand-maroon text-brand-gold border-2 border-brand-gold shadow-[0_4px_0_0_#5c0101] hover:bg-[#600000] active:translate-y-1 py-3 px-6 rounded-2xl font-black text-xs uppercase tracking-wider cursor-pointer flex items-center gap-2 select-none"
                >
                  ➕ Yeni Maç Ekle
                </button>
              </div>
            )}

            {(() => {
              const selectedMatches = (grouped[selectedWeek] || []).slice();
              // Sort by played status: unplayed first, played last
              selectedMatches.sort((a,b) => (a.played ? 1 : 0) - (b.played ? 0 : 1));

              if (selectedMatches.length === 0) {
                return <p className="text-center text-gray-400 font-bold">Bu haftaya ait maç bulunmuyor.</p>;
              }

              return selectedMatches.map((m, idx) => {
                const docId = `${m.team1}-vs-${m.team2}-${m.datejav}`;
                const hasMvp = m.played && m.mvp;
                return (
                  <div 
                    key={idx}
                    onClick={() => onNavigate({ type: 'match-detail', matchId: docId })}
                    className="relative cursor-pointer transition-transform hover:scale-[1.01] animate-fade-in select-text pb-2"
                  >
                    <div className="absolute -top-3.5 left-4 bg-brand-gold text-brand-dark px-3 py-1 rounded-full text-[9px] font-black uppercase border border-brand-dark z-20 shadow-sm">
                      {(m as any).category || (m.ligm ? t.ligm : t.cupm)}
                    </div>

                    <div className="bg-white rounded-3xl border-b-6 border-brand-maroon shadow-md relative overflow-hidden z-10 flex flex-col">
                      <div className="p-5 md:p-6 pb-5">
                        <div className="text-center text-[11px] font-bold text-gray-500 mb-3 block">
                          📅 {m.date || '---'}
                        </div>
                        
                        <div className="flex items-center justify-between gap-2">
                          {/* Team 1 */}
                          <div className="flex-1 flex items-center justify-end gap-3 text-right">
                            <span className="font-black text-sm md:text-lg text-brand-dark leading-tight">{m.team1}</span>
                            <img 
                              src={teamLogos[m.team1] || 'https://via.placeholder.com/40?text=?'} 
                              className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover border-2 border-gray-100 bg-white shadow-sm shrink-0" 
                              alt="logo" 
                            />
                          </div>

                          {/* Versus / Score display & First Half Display */}
                          <div className="flex flex-col items-center shrink-0">
                            <div className="px-4 py-2 bg-brand-dark text-brand-gold rounded-2xl font-black text-base md:text-2xl min-w-[70px] md:min-w-[90px] text-center border-2 border-brand-gold">
                              {m.played ? `${m.score1} - ${m.score2}` : 'VS'}
                            </div>
                            {m.played && (
                              <span className="text-[9px] md:text-[10px] font-black text-brand-maroon mt-1.5 bg-brand-cream px-2 py-0.5 rounded-full border border-brand-maroon/20 uppercase select-none">
                                İY: {m.iyScore || getFirstHalfScore(m) || '0 - 0'}
                              </span>
                            )}
                          </div>

                          {/* Team 2 */}
                          <div className="flex-1 flex items-center justify-start gap-3 text-left">
                            <img 
                              src={teamLogos[m.team2] || 'https://via.placeholder.com/40?text=?'} 
                              className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover border-2 border-gray-100 bg-white shadow-sm shrink-0" 
                              alt="logo" 
                            />
                            <span className="font-black text-sm md:text-lg text-brand-dark leading-tight">{m.team2}</span>
                          </div>
                        </div>
                      </div>

                      {/* MVP Section inside the same white card at the bottom */}
                      {hasMvp && (
                        <div className="bg-brand-dark text-brand-gold py-2.5 px-6 text-[10px] md:text-xs font-bold flex justify-between items-center border-t border-brand-gold/30">
                          <span>👑 {t.mvp}: <strong className="text-white uppercase">{m.mvp}</strong></span>
                          <span className="text-brand-gold">★ {m.rating || '0.0'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            })()}
          </div>
        </div>
      )}

      {/* ADD MATCH MODAL */}
      {addModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              if (!team1 || !team2) {
                alert('Lütfen her iki takımı da seçiniz!');
                return;
              }
              if (team1 === team2) {
                alert('Bir takım kendisiyle karşılaşamaz!');
                return;
              }
              const weekNum = Number(weekInput);
              if (isNaN(weekNum) || weekNum <= 0) {
                alert('Lütfen geçerli bir hafta sayısı giriniz!');
                return;
              }

              const datejavVal = Date.now();
              const formattedDate = matchDate.trim() || new Date().toLocaleDateString('tr-TR');

              const newMatch: Match = {
                team1,
                team2,
                score1: "0",
                score2: "0",
                played: false,
                hafta: String(weekNum),
                date: formattedDate,
                datejav: datejavVal,
                ligm: matchCategory === 'LİG MAÇI',
                timeline: []
              };
              if (matchCategory) {
                (newMatch as any).category = matchCategory;
              }

              const docId = `${team1}-vs-${team2}-${datejavVal}`;
              
              try {
                await setDoc(doc(db, 'matches', docId), newMatch);
                alert('Yeni maç başarıyla eklendi!');
                setSelectedWeek(weekNum);
                setAddModalOpen(false);
                
                // Reset state
                setTeam1('');
                setTeam2('');
                setMatchDate('');
              } catch (err) {
                console.error(err);
                alert('Maç eklenirken bir hata oluştu.');
              }
            }} 
            className="bg-[#f2ede1] text-[#3d3d3d] w-full max-w-md rounded-2xl p-6 border-b-8 border-brand-maroon shadow-2xl overflow-y-auto max-h-[92vh] relative select-text"
          >
            <button 
              type="button"
              onClick={() => setAddModalOpen(false)} 
              className="absolute top-4 right-4 text-xl font-bold text-brand-maroon focus:outline-none"
            >
              ✕
            </button>
            <h3 className="text-brand-maroon font-black text-base text-center uppercase tracking-wide border-b-2 border-brand-maroon pb-2 mb-4">Yeni Maç Ekle ({selectedWeek}. Hafta)</h3>

            <div className="space-y-4">
              {/* Team 1 Selection */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">🏠 Ev Sahibi Takım (T1)</label>
                <select 
                  value={team1}
                  onChange={(e) => setTeam1(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 font-bold text-xs"
                  required
                >
                  <option value="">Ev Sahibi Seçin</option>
                  {allTeams.map((team) => (
                    <option key={team.name} value={team.name}>{team.name}</option>
                  ))}
                </select>
              </div>

              {/* Team 2 Selection */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">🚀 Deplasman Takımı (T2)</label>
                <select 
                  value={team2}
                  onChange={(e) => setTeam2(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 font-bold text-xs"
                  required
                >
                  <option value="">Deplasman Seçin</option>
                  {allTeams.map((team) => (
                    <option key={team.name} value={team.name}>{team.name}</option>
                  ))}
                </select>
              </div>

              {/* Week input (Hafta) */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">📅 Hafta (Sayı Değeri)</label>
                <input 
                  type="number" 
                  min="1"
                  required
                  placeholder="Örn: 5" 
                  value={weekInput} 
                  onChange={(e) => setWeekInput(e.target.value)} 
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-xs font-bold" 
                />
              </div>

              {/* Match Date */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">📅 Maç Tarihi</label>
                <input 
                  type="text" 
                  placeholder="Örn: 13.07.2026 veya Pazartesi 20:00" 
                  value={matchDate} 
                  onChange={(e) => setMatchDate(e.target.value)} 
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-xs font-bold" 
                />
              </div>

              {/* Match Category / Type */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">🏆 Maç Kategorisi / Turnuva Türü</label>
                <select 
                  value={matchCategory}
                  onChange={(e) => setMatchCategory(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 font-bold text-xs"
                >
                  <option value="LİG MAÇI">LİG MAÇI</option>
                  <option value="TURNUVA">TURNUVA (World Peace Cup)</option>
                  <option value="UCL">UCL (Champions League)</option>
                  <option value="UEL">UEL (Europa League)</option>
                  <option value="UECL">UECL (Conference League)</option>
                </select>
                <span className="text-[9px] text-gray-400 font-extrabold italic mt-1 select-none block">
                  * Maç sonucu turnuva seçilirse otomatik olarak "World Peace Cup" turnuva durumunu, lig maçı seçilirse normal lig durumunu etkiler.
                </span>
              </div>

              <button 
                type="submit"
                className="w-full py-3 bg-green-700 hover:bg-green-800 text-white font-black rounded-xl text-xs tracking-wider uppercase shadow-md active:translate-y-0.5 transition-transform cursor-pointer mt-4"
              >
                MAÇI OLUŞTUR / KAYDET
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
