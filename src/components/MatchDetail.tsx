import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, collection, onSnapshot, query, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Match, MatchTimelineEvent, Player, Team, UserProfile } from '../types';

interface MatchDetailProps {
  matchId: string; // "team1-vs-team2-datejav" representation
  currentUser: UserProfile | null;
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onBack: () => void;
  onNavigate: (view: any) => void;
}

type TabType = 'goal' | 'period' | 'card' | 'date' | 'mvp';

export default function MatchDetail({ matchId, currentUser, currentLang, translations, onBack, onNavigate }: MatchDetailProps) {
  const [match, setMatch] = useState<Match | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [team1Form, setTeam1Form] = useState<string[]>([]);
  const [team2Form, setTeam2Form] = useState<string[]>([]);
  const [team1Players, setTeam1Players] = useState<Player[]>([]);
  const [team2Players, setTeam2Players] = useState<Player[]>([]);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Admin controls
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState<TabType>('goal');

  // Input states
  const [selectedGoalTeam, setSelectedGoalTeam] = useState<'team1' | 'team2'>('team1');
  const [selectedScorer, setSelectedScorer] = useState('');
  const [selectedAssist, setSelectedAssist] = useState('');
  const [goalMinute, setGoalMinute] = useState('');

  const [periodText, setPeriodText] = useState('');
  const [periodMinute, setPeriodMinute] = useState('45');

  const [selectedCardTeam, setSelectedCardTeam] = useState<'team1' | 'team2'>('team1');
  const [selectedCardPlayer, setSelectedCardPlayer] = useState('');
  const [cardColor, setCardColor] = useState<'Sarı' | 'Kırmızı'>('Sarı');
  const [cardMinute, setCardMinute] = useState('');

  const [matchDateText, setMatchDateText] = useState('');
  const [matchDatejavText, setMatchDatejavText] = useState('');

  const [selectedMvp, setSelectedMvp] = useState('');
  const [mvpRating, setMvpRating] = useState('');

  // Extract team names and datejav from state representation
  const parseMatchId = () => {
    const parts = matchId.split("-vs-");
    const t1 = parts[0] || "";
    const t2_date = parts[1] || "";
    const lastHyphen = t2_date.lastIndexOf("-");
    const t2 = lastHyphen !== -1 ? t2_date.substring(0, lastHyphen) : t2_date;
    const datejavStr = lastHyphen !== -1 ? t2_date.substring(lastHyphen + 1) : "";
    return { t1, t2, datejav: parseInt(datejavStr) };
  };

  const { t1: team1Name, t2: team2Name, datejav: currentMatchDatejav } = parseMatchId();

  // Check Admin Status
  useEffect(() => {
    if (currentUser) {
      getDoc(doc(db, 'users', currentUser.uid)).then((docSnap) => {
        if (docSnap.exists() && docSnap.data().admin === true) {
          setIsAdmin(true);
        }
      });
    } else {
      setIsAdmin(false);
    }
  }, [currentUser]);

  // Load team logos & forms
  useEffect(() => {
    // 1. Fetch logos
    getDocs(collection(db, "teams")).then((snap) => {
      const dict: Record<string, string> = {};
      snap.forEach((d) => {
        dict[d.data().name] = d.data().logo || '';
      });
      setLogos(dict);
    });

    // 2. Load formats
    const findForm = (team: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
      getDocs(collection(db, "matches")).then((snap) => {
        const hist: any[] = [];
        snap.forEach((docSnap) => {
          const m = docSnap.data() as Match;
          if (m.played && (m.team1 === team || m.team2 === team)) {
            hist.push(m);
          }
        });
        hist.sort((a, b) => b.datejav - a.datejav);
        const last5 = hist.slice(0, 5).reverse();
        const sqs: string[] = last5.map((match) => {
          const isT1 = match.team1 === team;
          const own = Number(isT1 ? match.score1 : match.score2);
          const opp = Number(isT1 ? match.score2 : match.score1);
          if (own > opp) return 'W';
          if (own < opp) return 'L';
          return 'D';
        });
        // pad to 5 records minimum
        while (sqs.length < 5) sqs.unshift('-');
        setter(sqs);
      });
    };

    findForm(team1Name, setTeam1Form);
    findForm(team2Name, setTeam2Form);

    // 3. Load active players
    getDocs(collection(db, "players")).then((pSnap) => {
      const t1p: Player[] = [];
      const t2p: Player[] = [];
      pSnap.forEach((docSnap) => {
        const p = docSnap.data() as Player;
        if (p.pteam === team1Name) t1p.push(p);
        if (p.pteam === team2Name) t2p.push(p);
      });
      setTeam1Players(t1p.sort((a,b) => a.pname.localeCompare(b.pname)));
      setTeam2Players(t2p.sort((a,b) => a.pname.localeCompare(b.pname)));

      // Set defaults for selects
      if (t1p.length > 0) setSelectedScorer(t1p[0].pname);
      if (t1p.length > 0) setSelectedCardPlayer(t1p[0].pname);
    });
  }, [team1Name, team2Name]);

  // Set default Scorer and card player on side toggle
  useEffect(() => {
    const list = selectedGoalTeam === 'team1' ? team1Players : team2Players;
    if (list.length > 0) {
      setSelectedScorer(list[0].pname);
    }
  }, [selectedGoalTeam, team1Players, team2Players]);

  useEffect(() => {
    const list = selectedCardTeam === 'team1' ? team1Players : team2Players;
    if (list.length > 0) {
      setSelectedCardPlayer(list[0].pname);
    }
  }, [selectedCardTeam, team1Players, team2Players]);

  // 4. Real-time Match Subscription
  useEffect(() => {
    const q = collection(db, "matches");
    const unsubscribe = onSnapshot(q, (snap) => {
      let found: Match | null = null;
      let fId: string | null = null;
      snap.forEach((docSnap) => {
        const m = docSnap.data() as Match;
        if (m.team1 === team1Name && m.team2 === team2Name && Number(m.datejav) === Number(currentMatchDatejav)) {
          found = m;
          fId = docSnap.id;
        }
      });

      if (found) {
        setMatch(found);
        setDocId(fId);
        setMatchDateText((found as Match).date || '');
        setMatchDatejavText(String((found as Match).datejav || ''));
        setSelectedMvp((found as Match).mvp || '');
        setMvpRating((found as Match).rating || '');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [team1Name, team2Name, currentMatchDatejav]);

  const t = translations[currentLang];

  const parseMinute = (minStr: string) => {
    if (!minStr) return 0;
    const clean = minStr.toString().replace(/'/g, '').trim();
    if (clean.includes('+')) {
      const parts = clean.split('+');
      return (parseInt(parts[0]) || 0) + (parseInt(parts[1]) || 0) / 10;
    }
    return parseFloat(clean) || 0;
  };

  const getSortedTimeline = () => {
    if (!match?.timeline) return [];
    return [...match.timeline].sort((a, b) => parseMinute(a.minute) - parseMinute(b.minute));
  };

  const handleSaveTimeline = async (events: MatchTimelineEvent[]) => {
    if (!docId) return;

    let calScore1 = 0;
    let calScore2 = 0;
    events.forEach(evt => {
      if (evt.type === 'goal') {
        if (evt.team === 'team1') calScore1++;
        else if (evt.team === 'team2') calScore2++;
      }
    });

    try {
      await updateDoc(doc(db, 'matches', docId), {
        timeline: events,
        score1: String(calScore1),
        score2: String(calScore2),
        played: events.some(evt => evt.type === 'goal' || evt.type === 'period')
      });
    } catch (e) {
      console.error(e);
      alert('Kaydedilemedi.');
    }
  };

  const handleAddGoal = async () => {
    if (!selectedScorer || !goalMinute.trim()) {
      alert('Oyuncu ve dakika alanları boş bırakılamaz!');
      return;
    }

    let min = goalMinute.trim();
    if (!min.endsWith("'")) min += "'";

    const scoringTeamName = selectedGoalTeam === 'team1' ? team1Name : team2Name;
    const playerInDb = [...team1Players, ...team2Players].find(p => p.pname === selectedScorer);
    const isKK = playerInDb ? playerInDb.pteam !== scoringTeamName : false;

    const newEvt: MatchTimelineEvent = {
      id: 'evt_' + Date.now(),
      type: 'goal',
      team: selectedGoalTeam,
      scorer: selectedScorer,
      assist: selectedAssist || 'Şut',
      minute: min,
      isKK
    };

    const updated = [...(match?.timeline || []), newEvt];
    await handleSaveTimeline(updated);
    setGoalMinute('');
  };

  const handleAddPeriod = async () => {
    if (!periodText.trim()) {
      alert('Lütfen başlık giriniz!');
      return;
    }
    let min = periodMinute.trim();
    if (!min.endsWith("'")) min += "'";

    const newEvt: MatchTimelineEvent = {
      id: 'evt_' + Date.now(),
      type: 'period',
      text: periodText.trim(),
      minute: min
    };

    const updated = [...(match?.timeline || []), newEvt];
    await handleSaveTimeline(updated);
    setPeriodText('');
  };

  const handleAddCard = async () => {
    if (!selectedCardPlayer || !cardMinute.trim()) {
      alert('Oyuncu ve dakika alanları boş bırakılamaz!');
      return;
    }
    let min = cardMinute.trim();
    if (!min.endsWith("'")) min += "'";

    const newEvt: MatchTimelineEvent = {
      id: 'evt_' + Date.now(),
      type: 'card',
      team: selectedCardTeam,
      player: selectedCardPlayer,
      cardColor: cardColor,
      minute: min
    };

    const updated = [...(match?.timeline || []), newEvt];
    await handleSaveTimeline(updated);
    setCardMinute('');
  };

  const handleUpdateDate = async () => {
    if (!docId) return;
    const javVal = parseInt(matchDatejavText);
    if (!matchDateText || isNaN(javVal)) {
      alert('Lütfen geçerli tarih ve Datejav değeri girin.');
      return;
    }

    try {
      await updateDoc(doc(db, 'matches', docId), {
        date: matchDateText.trim(),
        datejav: javVal
      });
      alert('Tarih güncellendi! Yeni URL atanıyor...');
      // Update screen representation
      onBack();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateMvp = async () => {
    if (!docId) return;
    try {
      await updateDoc(doc(db, 'matches', docId), {
        mvp: selectedMvp,
        rating: mvpRating.trim() || '0.0',
        played: true
      });
      alert('MVP güncellendi!');
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteEvent = async (evtId: string) => {
    if (!confirm('Bu olayı silmek istediğinizden emin misiniz?')) return;
    const updated = (match?.timeline || []).filter(e => e.id !== evtId);
    await handleSaveTimeline(updated);
  };

  // Rendering form indicators
  const renderFormSqs = (sqs: string[]) => {
    return sqs.map((indicator, idx) => {
      let bg = 'bg-gray-400';
      if (indicator === 'W') bg = 'bg-green-500';
      if (indicator === 'L') bg = 'bg-red-500';
      return (
        <div 
          key={idx} 
          className={`w-7 h-7 rounded-lg text-white font-black text-xs flex items-center justify-center shadow ${bg}`}
          title={indicator === '-' ? 'Bekleniyor' : indicator}
        >
          {indicator}
        </div>
      );
    });
  };

  const sortedEvents = getSortedTimeline();

  // Accumulate goals for scores
  let rScore1 = 0;
  let rScore2 = 0;
  const eventsWithScores = sortedEvents.map(evt => {
    if (evt.type === 'goal') {
      if (evt.team === 'team1') rScore1++;
      if (evt.team === 'team2') rScore2++;
      return { ...evt, score: `${rScore1} - ${rScore2}` };
    }
    return evt;
  });

  return (
    <div className="space-y-6">
      <div className="bg-brand-card p-4 rounded-b-2xl flex items-center justify-between border-b-4 border-brand-maroon shadow-md relative shrink-0">
        <button 
          onClick={onBack}
          className="bg-brand-gold text-brand-dark hover:scale-105 transition-transform font-black text-xs uppercase px-4 py-2 rounded-xl h-10 cursor-pointer border border-brand-maroon focus:outline-none"
        >
          ← {t.back}
        </button>
        <span className="font-extrabold text-[#800000] text-sm uppercase tracking-widest">{t.title}</span>
        <div className="w-16"></div>
      </div>

      {loading ? (
        <h3 className="text-center text-gray-500 font-bold">{t.loading}</h3>
      ) : !match ? (
        <h3 className="text-center text-red-500 font-bold">Maç kaydı bulunamadı.</h3>
      ) : (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in select-text">
          <div className="bg-brand-card rounded-3xl p-6 md:p-12 shadow-xl border-t-8 border-brand-maroon select-text">
            <span className="text-center text-xs font-black text-gray-400 block mb-6 uppercase tracking-widest">
              {match.date || 'Tarih Belirsiz'}
            </span>

            <div className="flex flex-col md:flex-row items-center justify-center gap-10">
              {/* Team 1 Card */}
              <div 
                className="flex-1 flex flex-col items-center cursor-pointer hover:scale-105 transition-transform text-center"
                onClick={() => onNavigate({ type: 'team-detail', teamName: match.team1 })}
              >
                <img src={logos[match.team1]} className="w-32 h-32 rounded-full border-4 border-brand-maroon object-cover bg-white shadow-md shadow-black/10" alt="team1" />
                <span className="text-xl md:text-2xl font-black text-brand-dark block mt-4 leading-tight">{match.team1}</span>
                <div className="flex gap-1.5 justify-center mt-3 scale-90">{renderFormSqs(team1Form)}</div>
              </div>

              {/* Scoreboard Block */}
              <div className="flex flex-col items-center">
                <span className="text-6xl md:text-8xl font-black text-brand-maroon text-shadow leading-none">
                  {match.played ? `${match.score1} - ${match.score2}` : 'VS'}
                </span>
                
                {isAdmin && (
                  <button 
                    onClick={() => setAdminModalOpen(true)}
                    className="mt-6 bg-brand-maroon text-brand-gold py-2 px-4 rounded-xl hover:bg-[#600000] cursor-pointer font-black text-[10px] uppercase shadow tracking-wider border-b-2 border-black"
                  >
                    ⚙️ Düzenle / Olay Ekle
                  </button>
                )}
              </div>

              {/* Team 2 Card */}
              <div 
                className="flex-1 flex flex-col items-center cursor-pointer hover:scale-105 transition-transform text-center"
                onClick={() => onNavigate({ type: 'team-detail', teamName: match.team2 })}
              >
                <img src={logos[match.team2]} className="w-32 h-32 rounded-full border-4 border-brand-maroon object-cover bg-white shadow-md shadow-black/10" alt="team2" />
                <span className="text-xl md:text-2xl font-black text-brand-dark block mt-4 leading-tight">{match.team2}</span>
                <div className="flex gap-1.5 justify-center mt-3 scale-90">{renderFormSqs(team2Form)}</div>
              </div>
            </div>

            {/* MVP award segment */}
            {match.played && match.mvp && (
              <div className="bg-brand-dark rounded-2xl p-4 text-brand-gold flex items-center justify-between border-l-12 border-brand-gold mt-10 shadow-lg">
                <div>
                  <span className="bg-brand-maroon text-[9px] px-2 py-0.5 rounded text-white font-extrabold uppercase select-none">{t.mvp}</span>
                  <h4 
                    onClick={() => onNavigate({ type: 'player-profile', playerName: match.mvp || '' })}
                    className="text-lg md:text-xl font-black uppercase hover:underline cursor-pointer tracking-wide mt-1.5 text-white"
                  >
                    {match.mvp}
                  </h4>
                </div>
                <div className="text-right">
                  <span className="text-3xl md:text-4xl font-black block leading-none">{match.rating}</span>
                  <span className="text-[9px] text-gray-400 font-extrabold block mt-1 select-none">STAR RATING</span>
                </div>
              </div>
            )}

            {/* Timeline Segment */}
            <div className="border-t-3 border-dashed border-[#eadcb9] pt-8 mt-10">
              <h3 className="text-center font-black text-lg text-brand-maroon uppercase tracking-widest mb-8">⚽ MAÇ KRONOLOJİSİ</h3>
              <div className="relative max-w-xl mx-auto select-text">
                <div className="absolute left-1/2 -translate-x-1/2-translate-y-0 w-0.5 bg-gray-300 inset-y-0 z-0"></div>

                <div className="space-y-6 relative z-10 select-text">
                  {eventsWithScores.length === 0 ? (
                    <p className="text-center text-xs text-gray-500 font-bold py-4">Henüz girilmiş maç olayı bulunmuyor.</p>
                  ) : (
                    eventsWithScores.map((evt: any, i) => {
                      if (evt.type === 'period') {
                        // Determine score at this period block
                        let pScore1 = 0;
                        let pScore2 = 0;
                        const pMin = parseMinute(evt.minute);
                        eventsWithScores.forEach((other: any) => {
                          if (other.type === 'goal' && parseMinute(other.minute) <= pMin) {
                            if (other.team === 'team1') pScore1++;
                            if (other.team === 'team2') pScore2++;
                          }
                        });
                        return (
                          <div key={i} className="flex justify-center select-text">
                            <span className="bg-neutral-300 text-neutral-800 text-xs font-black py-1.5 px-6 rounded-full border border-neutral-400 shadow-inner block uppercase">
                              {evt.text} | {pScore1} - {pScore2}
                            </span>
                          </div>
                        );
                      }

                      const isT1 = evt.team === 'team1';

                      return (
                        <div key={i} className="grid grid-cols-[1fr_70px_1fr] items-center gap-4 py-1.5 select-text">
                          {/* Left Col */}
                          {isT1 ? (
                            <div className="flex items-center gap-2.5 justify-end">
                              <div className="text-right">
                                <span className={`text-xs md:text-sm font-black text-brand-dark block uppercase truncate max-w-32 ${evt.isKK ? 'text-red-500' : ''}`}>
                                  {evt.scorer} {evt.isKK ? '(K.K)' : ''} {evt.player}
                                </span>
                                <span className="text-[10px] text-gray-400 font-bold block truncate max-w-32">{evt.type === 'goal' ? `Asist: ${evt.assist}` : `${evt.cardColor} Kart`}</span>
                              </div>
                              <span className="text-xl">{evt.type === 'goal' ? '⚽' : evt.cardColor === 'Sarı' ? '🟨' : '🟥'}</span>
                            </div>
                          ) : <div />}

                          {/* Center Min block */}
                          <div className="flex flex-col items-center justify-center p-1 bg-brand-card rounded-xl border border-gray-300 shadow-sm shrink-0">
                            <span className="text-xs font-black text-brand-maroon">{evt.minute}</span>
                            {evt.type === 'goal' && (
                              <span className="text-[9px] font-black text-[#666] bg-gray-200 px-1.5 rounded mt-0.5">{evt.score}</span>
                            )}
                          </div>

                          {/* Right Col */}
                          {!isT1 ? (
                            <div className="flex items-center gap-2.5 justify-start">
                              <span className="text-xl">{evt.type === 'goal' ? '⚽' : evt.cardColor === 'Sarı' ? '🟨' : '🟥'}</span>
                              <div className="text-left">
                                <span className={`text-xs md:text-sm font-black text-brand-dark block uppercase truncate max-w-32 ${evt.isKK ? 'text-red-500' : ''}`}>
                                  {evt.scorer} {evt.isKK ? '(K.K)' : ''} {evt.player}
                                </span>
                                <span className="text-[10px] text-gray-400 font-bold block truncate max-w-32">{evt.type === 'goal' ? `Asist: ${evt.assist}` : `${evt.cardColor} Kart`}</span>
                              </div>
                            </div>
                          ) : <div />}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN CONTROLS modal */}
      {adminModalOpen && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
          <div className="bg-[#f2ede1] text-[#3d3d3d] w-full max-w-md rounded-2xl p-6 border-b-8 border-brand-maroon shadow-2xl overflow-y-auto max-h-[92vh] relative select-text">
            <button onClick={() => setAdminModalOpen(false)} className="absolute top-4 right-4 text-xl font-bold text-brand-maroon">✕</button>
            <h3 className="text-brand-maroon font-black text-base text-center uppercase tracking-wide border-b-2 border-brand-maroon pb-2 mb-4">Maç Olayı Yönetimi</h3>

            {/* Admin sub-tabs */}
            <div className="flex gap-1 border-b border-gray-300 pb-2 mb-4 overflow-x-auto">
              {(['goal', 'period', 'card', 'date', 'mvp'] as TabType[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveAdminTab(tab)}
                  className={`py-1.5 px-3 rounded text-[9px] font-black uppercase tracking-wider ${activeAdminTab === tab ? 'bg-brand-maroon text-brand-gold' : 'bg-white border border-gray-300 text-gray-500'}`}
                >
                  {tab === 'goal' ? '⚽ Gol GİR' : tab === 'period' ? '⏱ Def/Tur' : tab === 'card' ? '🟨 Kart GİR' : tab === 'date' ? '📅 Tarih' : '🏆 MVP'}
                </button>
              ))}
            </div>

            {/* Form panels */}
            {activeAdminTab === 'goal' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 bg-white/50 p-2 rounded-xl border border-gray-200">
                  <button onClick={() => setSelectedGoalTeam('team1')} className={`py-2 rounded-lg font-black text-xs border-2 ${selectedGoalTeam === 'team1' ? 'border-brand-maroon bg-white text-brand-maroon' : 'border-transparent text-gray-500'}`}>T1: {team1Name}</button>
                  <button onClick={() => setSelectedGoalTeam('team2')} className={`py-2 rounded-lg font-black text-xs border-2 ${selectedGoalTeam === 'team2' ? 'border-brand-maroon bg-white text-brand-maroon' : 'border-transparent text-gray-500'}`}>T2: {team2Name}</button>
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">⚽ Golü Atan Oyuncu</label>
                  <select 
                    value={selectedScorer}
                    onChange={(e) => setSelectedScorer(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded p-2 font-bold text-xs"
                  >
                    {[...team1Players, ...team2Players].map((p, idx) => (
                      <option key={idx} value={p.pname} data-team={p.pteam}>{p.pname} ({p.pteam === team1Name ? 'T1' : 'T2'})</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500">👟 Asist Yapan Oyuncu (Opsiyonel)</label>
                  <select 
                    value={selectedAssist}
                    onChange={(e) => setSelectedAssist(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded p-2 text-xs font-bold"
                  >
                    <option value="">Asist Yok (Şut)</option>
                    {[...team1Players, ...team2Players].map((p, idx) => (
                      <option key={idx} value={p.pname}>{p.pname} ({p.pteam === team1Name ? 'T1' : 'T2'})</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500">⏱ Dakika</label>
                  <input type="text" placeholder="Örn: 14" value={goalMinute} onChange={(e) => setGoalMinute(e.target.value)} className="w-full bg-white border border-gray-300 rounded p-2 text-xs font-bold" />
                </div>

                <button onClick={handleAddGoal} className="w-full py-2.5 bg-green-700 text-white font-black rounded-lg text-xs tracking-wider">GOLÜ KAYDET</button>
              </div>
            )}

            {activeAdminTab === 'period' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500">⏱ Başlık</label>
                  <input type="text" placeholder="Örn: İlk Yarı Sonucu" value={periodText} onChange={(e) => setPeriodText(e.target.value)} className="w-full bg-white border border-gray-300 rounded p-2 text-xs font-bold" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500">🧭 Dakika / Sıralama</label>
                  <input type="text" placeholder="Örn: 45" value={periodMinute} onChange={(e) => setPeriodMinute(e.target.value)} className="w-full bg-white border border-gray-300 rounded p-2 text-xs font-bold" />
                </div>
                <button onClick={handleAddPeriod} className="w-full py-2.5 bg-green-700 text-white font-black rounded-lg text-xs">TUR / DEVRE KAYDET</button>
              </div>
            )}

            {activeAdminTab === 'card' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 bg-white/50 p-2 rounded-xl border border-gray-200">
                  <button onClick={() => setSelectedCardTeam('team1')} className={`py-2 rounded-lg font-black text-xs border-2 ${selectedCardTeam === 'team1' ? 'border-brand-maroon bg-white text-brand-maroon' : 'border-transparent text-gray-500'}`}>T1: {team1Name}</button>
                  <button onClick={() => setSelectedCardTeam('team2')} className={`py-2 rounded-lg font-black text-xs border-2 ${selectedCardTeam === 'team2' ? 'border-brand-maroon bg-white text-brand-maroon' : 'border-transparent text-gray-500'}`}>T2: {team2Name}</button>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500">💳 Kart Gören Oyuncu</label>
                  <select 
                    value={selectedCardPlayer}
                    onChange={(e) => setSelectedCardPlayer(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded p-2 text-xs font-bold"
                  >
                    {[...team1Players, ...team2Players].map((p, idx) => (
                      <option key={idx} value={p.pname}>{p.pname} ({p.pteam === team1Name ? 'T1' : 'T2'})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-gray-500">Renk</label>
                    <select value={cardColor} onChange={(e) => setCardColor(e.target.value as any)} className="bg-white border rounded p-2 text-xs font-bold w-full">
                      <option value="Sarı">🟨 SarıKart</option>
                      <option value="Kırmızı">🟥 KırmızıKart</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-gray-500">Dk</label>
                    <input type="text" placeholder="Örn: 52'" value={cardMinute} onChange={(e) => setCardMinute(e.target.value)} className="bg-white border rounded p-2 text-xs font-bold w-full" />
                  </div>
                </div>

                <button onClick={handleAddCard} className="w-full py-2.5 bg-green-700 text-white font-black rounded-lg text-xs">KARTI KAYDET</button>
              </div>
            )}

            {activeAdminTab === 'date' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500">📅 Tarih Adı</label>
                  <input type="text" value={matchDateText} onChange={(e) => setMatchDateText(e.target.value)} className="w-full bg-white border border-gray-300 rounded p-2 text-xs font-bold" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500">🧭 Datejav (Benzersiz Tarih id Number)</label>
                  <input type="number" value={matchDatejavText} onChange={(e) => setMatchDatejavText(e.target.value)} className="w-full bg-white border border-gray-300 rounded p-2 text-xs font-bold" />
                </div>
                <button onClick={handleUpdateDate} className="w-full py-2.5 bg-green-700 text-white font-black rounded-lg text-xs">TARİH GÜNCELLE</button>
              </div>
            )}

            {activeAdminTab === 'mvp' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500">🏆 MVP Oyuncu</label>
                  <select 
                    value={selectedMvp}
                    onChange={(e) => setSelectedMvp(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded p-2 text-xs font-bold"
                  >
                    <option value="">Seçilmedi</option>
                    {[...team1Players, ...team2Players].map((p, idx) => (
                      <option key={idx} value={p.pname}>{p.pname}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500">⭐ Averaj Puanı (Rating)</label>
                  <input type="text" value={mvpRating} onChange={(e) => setMvpRating(e.target.value)} className="w-full bg-white border border-gray-300 rounded p-2 text-xs font-bold" />
                </div>
                <button onClick={handleUpdateMvp} className="w-full py-2.5 bg-green-700 text-white font-black rounded-lg text-xs">MVP GÜNCELLE</button>
              </div>
            )}

            {/* List and delete panel */}
            <div className="mt-6 border-t-2 border-gray-300 pt-4">
              <h4 className="text-xs font-black text-brand-maroon uppercase tracking-wider mb-3">Girilen Olaylar / Silme Paneli</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {(match.timeline || []).length === 0 ? (
                  <span className="text-xs text-gray-500 font-bold block text-center">Listelenecek olay bulunmuyor.</span>
                ) : (
                  (match.timeline || []).map((e) => {
                    let desc = '';
                    if (e.type === 'goal') {
                      desc = `⚽ [${e.minute}] ${e.scorer} - Asist: ${e.assist}`;
                    } else if (e.type === 'card') {
                      desc = `${e.cardColor === 'Sarı' ? '🟨' : '🟥'} [${e.minute}] ${e.player}`;
                    } else if (e.type === 'period') {
                      desc = `⏱️ [${e.minute}] ${e.text}`;
                    }
                    return (
                      <div key={e.id} className="flex justify-between items-center bg-white border border-gray-200 p-2 rounded-xl text-xs font-bold shadow-sm">
                        <span className="truncate pr-2">{desc}</span>
                        <button onClick={() => handleDeleteEvent(e.id)} className="bg-red-700 text-white text-[9px] font-black px-2 py-1 rounded-lg">SİL</button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
