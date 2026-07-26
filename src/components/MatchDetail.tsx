import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, setDoc, collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Match, MatchTimelineEvent, Player, Team, UserProfile } from '../types';
import { recalculateStandings, recalculatePlayerRatings } from '../lib/standings';

interface MatchDetailProps {
  matchId: string; // "team1-vs-team2-datejav" representation
  currentUser: UserProfile | null;
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onBack: () => void;
  onNavigate: (view: any) => void;
}

type TabType = 'goal' | 'period' | 'card' | 'date' | 'mvp' | 'quick' | 'loan';

export default function MatchDetail({ matchId, currentUser, currentLang, translations, onBack, onNavigate }: MatchDetailProps) {
  const [match, setMatch] = useState<Match | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [team1Form, setTeam1Form] = useState<string[]>([]);
  const [team2Form, setTeam2Form] = useState<string[]>([]);
  const [team1Players, setTeam1Players] = useState<Player[]>([]);
  const [team2Players, setTeam2Players] = useState<Player[]>([]);
  const [allGlobalPlayers, setAllGlobalPlayers] = useState<Player[]>([]);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [teamDocIdToNameMap, setTeamDocIdToNameMap] = useState<Record<string, string>>({});
  const [teamNameToDocIdMap, setTeamNameToDocIdMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Admin controls
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState<TabType>('goal');

  // Kiralık Oyuncu Ekleme States
  const [selectedLoanTeam, setSelectedLoanTeam] = useState<'team1' | 'team2'>('team1');
  const [selectedLoanPlayerName, setSelectedLoanPlayerName] = useState<string>('');
  const [customLoanName, setCustomLoanName] = useState<string>('');

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
  const [matchCategory, setMatchCategory] = useState('');

  const [selectedMvp, setSelectedMvp] = useState('');
  const [mvpRating, setMvpRating] = useState('');

  // Football field / Lineup state
  const [activeLineupTeam, setActiveLineupTeam] = useState<'team1' | 'team2'>('team1');
  const [selectedLineupPlayer, setSelectedLineupPlayer] = useState<string>('');
  const [lineupPosition, setLineupPosition] = useState<'DEF' | 'MD' | 'FW'>('DEF');
  const [lineupRating, setLineupRating] = useState<string>('6.0');
  const [lineupPlayed, setLineupPlayed] = useState<boolean>(true);

  useEffect(() => {
    if (selectedLineupPlayer && match) {
      const lineup = match.lineup || {};
      const pInfo = lineup[selectedLineupPlayer];
      if (pInfo) {
        setLineupPosition(pInfo.position || 'DEF');
        setLineupRating(pInfo.rating ? String(pInfo.rating) : '6.0');
        setLineupPlayed(pInfo.played !== false);
      } else {
        setLineupPosition('DEF');
        setLineupRating('6.0');
        setLineupPlayed(true);
      }
    }
  }, [selectedLineupPlayer, match]);

  const handleSaveLineupPlayer = async () => {
    if (!docId || !selectedLineupPlayer) return;
    try {
      const updatedLineup = {
        ...(match?.lineup || {}),
        [selectedLineupPlayer]: {
          position: lineupPosition,
          rating: Number(lineupRating) || 0,
          played: lineupPlayed
        }
      };
      await updateDoc(doc(db, 'matches', docId), {
        lineup: updatedLineup
      });
      await recalculatePlayerRatings();
      alert('Oyuncu kadro ve rating bilgisi başarıyla kaydedildi!');
    } catch (err) {
      console.error(err);
      alert('Kadro kaydedilirken hata oluştu.');
    }
  };

  const handleRemoveLineupPlayer = async (pname: string) => {
    if (!docId) return;
    if (!confirm(`${pname} isimli oyuncuyu kadrodan çıkarmak istediğinize emin misiniz?`)) return;
    try {
      const updatedLineup = { ...(match?.lineup || {}) };
      delete updatedLineup[pname];
      await updateDoc(doc(db, 'matches', docId), {
        lineup: updatedLineup
      });
      await recalculatePlayerRatings();
      alert('Oyuncu kadrodan çıkarıldı!');
      if (selectedLineupPlayer === pname) {
        setSelectedLineupPlayer('');
      }
    } catch (err) {
      console.error(err);
      alert('Oyuncu çıkarılırken hata oluştu.');
    }
  };

  // Quick inputs
  const [quickInputString, setQuickInputString] = useState('');
  const [quickIyInputString, setQuickIyInputString] = useState('');

  const handleQuickSubmit = async () => {
    if (!docId) return;
    const parts = quickInputString.split('-');
    if (parts.length !== 2) {
      alert('Lütfen skoru "5-2" formatında giriniz!');
      return;
    }
    const s1 = parts[0].trim();
    const s2 = parts[1].trim();
    if (isNaN(Number(s1)) || isNaN(Number(s2))) {
      alert('Lütfen geçerli sayılar giriniz!');
      return;
    }

    try {
      await updateDoc(doc(db, 'matches', docId), {
        score1: s1,
        score2: s2,
        iyScore: quickIyInputString.trim() || null,
        played: true
      });
      await recalculateStandings();
      alert('Maç skoru başarıyla güncellendi ve puan durumları güncellendi!');
      setQuickInputString('');
      setQuickIyInputString('');
    } catch (e) {
      console.error(e);
      alert('Skor güncellenirken hata oluştu.');
    }
  };

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
    // 1. Fetch logos and map IDs/names
    getDocs(collection(db, "teams")).then((snap) => {
      const dict: Record<string, string> = {};
      const docToName: Record<string, string> = {};
      const nameToDoc: Record<string, string> = {};
      
      snap.forEach((d) => {
        const docId = d.id;
        const name = d.data().name || '';
        dict[name] = d.data().logo || '';
        docToName[docId.toLowerCase().trim()] = name;
        nameToDoc[name.toLowerCase().trim()] = docId;
      });
      setLogos(dict);
      setTeamDocIdToNameMap(docToName);
      setTeamNameToDocIdMap(nameToDoc);

      const t1Lower = team1Name.toLowerCase().trim();
      const t2Lower = team2Name.toLowerCase().trim();
      
      const t1DocId = nameToDoc[t1Lower] || t1Lower;
      const t2DocId = nameToDoc[t2Lower] || t2Lower;
      const t1DisplayName = docToName[t1Lower] || team1Name;
      const t2DisplayName = docToName[t2Lower] || team2Name;

      // 2. Load formats
      const findForm = (team: string, resolvedDocId: string, resolvedName: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
        getDocs(collection(db, "matches")).then((mSnap) => {
          const hist: any[] = [];
          mSnap.forEach((docSnap) => {
            const m = docSnap.data() as Match;
            const mt1 = (m.team1 || '').toLowerCase().trim();
            const mt2 = (m.team2 || '').toLowerCase().trim();
            const isTeam = mt1 === team.toLowerCase().trim() || 
                           mt1 === resolvedDocId.toLowerCase().trim() || 
                           mt1 === resolvedName.toLowerCase().trim() ||
                           mt2 === team.toLowerCase().trim() || 
                           mt2 === resolvedDocId.toLowerCase().trim() || 
                           mt2 === resolvedName.toLowerCase().trim();

            if (m.played && isTeam) {
              hist.push(m);
            }
          });
          hist.sort((a, b) => b.datejav - a.datejav);
          const last5 = hist.slice(0, 5).reverse();
          const sqs: string[] = last5.map((match) => {
            const mt1 = (match.team1 || '').toLowerCase().trim();
            const isT1 = mt1 === team.toLowerCase().trim() || 
                         mt1 === resolvedDocId.toLowerCase().trim() || 
                         mt1 === resolvedName.toLowerCase().trim();
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

      findForm(team1Name, t1DocId, t1DisplayName, setTeam1Form);
      findForm(team2Name, t2DocId, t2DisplayName, setTeam2Form);

      // 3. Load active players
      getDocs(collection(db, "players")).then((pSnap) => {
        const allP: Player[] = [];
        const t1p: Player[] = [];
        const t2p: Player[] = [];
        pSnap.forEach((docSnap) => {
          const p = docSnap.data() as Player;
          allP.push(p);
          const pTeamLower = (p.pteam || '').toLowerCase().trim();
          const pKiralikLower = (p.kiralikTakim || '').toLowerCase().trim();
          
          const isT1 = pTeamLower === t1Lower || 
                       pTeamLower === t1DocId.toLowerCase() || 
                       pTeamLower === t1DisplayName.toLowerCase().trim() ||
                       (p.kiralik && (pKiralikLower === t1Lower || pKiralikLower === t1DocId.toLowerCase() || pKiralikLower === t1DisplayName.toLowerCase().trim()));
                       
          const isT2 = pTeamLower === t2Lower || 
                       pTeamLower === t2DocId.toLowerCase() || 
                       pTeamLower === t2DisplayName.toLowerCase().trim() ||
                       (p.kiralik && (pKiralikLower === t2Lower || pKiralikLower === t2DocId.toLowerCase() || pKiralikLower === t2DisplayName.toLowerCase().trim()));

          if (isT1) t1p.push(p);
          if (isT2 && !isT1) t2p.push(p);
        });
        setAllGlobalPlayers(allP.sort((a,b) => a.pname.localeCompare(b.pname)));
        setTeam1Players(t1p.sort((a,b) => a.pname.localeCompare(b.pname)));
        setTeam2Players(t2p.sort((a,b) => a.pname.localeCompare(b.pname)));

        // Set defaults for selects
        if (t1p.length > 0) setSelectedScorer(t1p[0].pname);
        if (t1p.length > 0) setSelectedCardPlayer(t1p[0].pname);
      });
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
        setMatchCategory((found as any).category || '');
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
      await recalculateStandings();
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
    let isKK = false;
    if (playerInDb) {
      const pTeamLower = (playerInDb.pteam || '').toLowerCase().trim();
      const pKiralikLower = (playerInDb.kiralikTakim || '').toLowerCase().trim();
      const sTeamLower = scoringTeamName.toLowerCase().trim();
      
      const pDocId = teamNameToDocIdMap[pTeamLower] || pTeamLower;
      const pKiralikDocId = teamNameToDocIdMap[pKiralikLower] || pKiralikLower;
      const sDocId = teamNameToDocIdMap[sTeamLower] || sTeamLower;
      
      if (playerInDb.kiralik && pKiralikLower) {
        isKK = pKiralikDocId !== sDocId;
      } else {
        isKK = pDocId !== sDocId;
      }
    }

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
        datejav: javVal,
        category: matchCategory.trim()
      });
      await recalculateStandings();
      alert('Tarih ve kategori güncellendi! Standings yeniden hesaplandı.');
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
      await recalculateStandings();
      alert('MVP güncellendi ve puan durumları yeniden hesaplandı!');
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
                  <div className="flex flex-col items-center gap-2">
                    <button 
                      onClick={() => setAdminModalOpen(true)}
                      className="mt-6 bg-brand-maroon text-brand-gold py-2 px-4 rounded-xl hover:bg-[#600000] cursor-pointer font-black text-[10px] uppercase shadow tracking-wider border-b-2 border-black"
                    >
                      ⚙️ Düzenle / Olay Ekle
                    </button>
                    
                    <div className="mt-4 p-4 bg-[#f5efdf] rounded-2xl border border-brand-maroon/20 w-60 shadow-sm text-center">
                      <span className="text-[10px] font-black text-brand-maroon uppercase tracking-widest block mb-2">⚡ Hızlı Maç Sonucu Girişi</span>
                      <div className="flex gap-2 mb-2">
                        <input 
                          type="text" 
                          placeholder="Skor (örn: 5-2)" 
                          value={quickInputString}
                          onChange={(e) => setQuickInputString(e.target.value)}
                          className="bg-white border border-gray-300 rounded-xl px-2.5 py-1.5 text-xs font-black text-center w-full focus:outline-none focus:border-brand-maroon"
                        />
                        <button 
                          onClick={handleQuickSubmit}
                          className="bg-brand-maroon text-brand-gold hover:bg-[#600000] px-4 py-1.5 rounded-xl font-black text-xs shrink-0 cursor-pointer shadow-sm"
                        >
                          Kaydet
                        </button>
                      </div>
                      <input 
                        type="text" 
                        placeholder="İlk Yarı Sonucu (örn: 2-1) [Opsiyonel]" 
                        value={quickIyInputString}
                        onChange={(e) => setQuickIyInputString(e.target.value)}
                        className="bg-white border border-gray-300 rounded-xl px-2 py-1 text-[9px] font-bold text-center w-full focus:outline-none focus:border-brand-maroon"
                      />
                    </div>
                  </div>
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

            {/* Tactical Football Field and Squad Lineups */}
            <div className="border-t-3 border-dashed border-[#eadcb9] pt-8 mt-12">
              <h3 className="text-center font-black text-lg text-brand-maroon uppercase tracking-widest mb-6">📋 MAÇ KADROLARI & REYTİNGLER</h3>
            </div>

            {(() => {
              const lineup = match?.lineup || {};
              const activeList = Object.entries(lineup)
                .map(([pname, info]: any) => ({ pname, ...info }))
                .filter((p: any) => p.played && p.position);

              const t1Active = activeList.filter((p: any) => team1Players.some((dbP) => dbP.pname === p.pname));
              const t2Active = activeList.filter((p: any) => team2Players.some((dbP) => dbP.pname === p.pname));

              const t1DEF = t1Active.filter((p: any) => p.position === 'DEF');
              const t1MD  = t1Active.filter((p: any) => p.position === 'MD');
              const t1FW  = t1Active.filter((p: any) => p.position === 'FW');

              const t2FW  = t2Active.filter((p: any) => p.position === 'FW');
              const t2MD  = t2Active.filter((p: any) => p.position === 'MD');
              const t2DEF = t2Active.filter((p: any) => p.position === 'DEF');

              const renderPitchPlayer = (player: any, left: string, top: string) => {
                const playerDb = [...team1Players, ...team2Players].find(dbP => dbP.pname === player.pname);
                const fotoUrl = playerDb?.foto || '';
                const rating = Number(player.rating) || 0;
                
                let ratingBg = 'bg-amber-500 border-amber-400 text-black';
                if (rating > 7.0) {
                  ratingBg = 'bg-green-600 border-green-400 text-white';
                } else if (rating < 5.0) {
                  ratingBg = 'bg-red-600 border-red-400 text-white';
                }

                return (
                  <div 
                    key={player.pname} 
                    style={{ left, top, transform: 'translate(-50%, -50%)' }}
                    className="absolute flex flex-col items-center z-20 cursor-pointer group"
                    onClick={() => {
                      if (isAdmin) {
                        setSelectedLineupPlayer(player.pname);
                      }
                    }}
                  >
                    <div className="relative w-11 h-11 md:w-13 md:h-13 transition-transform group-hover:scale-110">
                      <div className="w-full h-full rounded-full border-2 border-white shadow-md flex items-center justify-center overflow-hidden bg-brand-dark active:scale-95 animate-fade-in">
                        {fotoUrl ? (
                          <img src={fotoUrl} referrerPolicy="no-referrer" className="w-full h-full object-cover" alt={player.pname} />
                        ) : (
                          <span className="text-white text-[10px] md:text-xs font-black uppercase tracking-wider">{player.pname.substring(0, 2)}</span>
                        )}
                      </div>
                      <span className={`absolute -top-1 -right-1 text-[8px] md:text-[9px] font-black px-1.5 py-0.5 rounded-full border shadow-md z-30 ${ratingBg}`}>
                        {rating.toFixed(1)}
                      </span>
                    </div>
                    <span className="bg-black/75 text-white text-[8px] md:text-[9px] font-black px-1.5 py-0.5 rounded mt-1 shadow truncate max-w-16 md:max-w-20 tracking-wide block uppercase text-center select-none pointer-events-none">
                      {player.pname.split(' ')[0]}
                    </span>
                  </div>
                );
              };

              return (
                <div className="space-y-6 select-text">
                  {/* Tactical Pitch Container */}
                  <div className="relative w-full aspect-[16/10] bg-emerald-800 rounded-3xl border-4 border-white/40 overflow-hidden shadow-inner select-none p-4">
                    <div className="absolute inset-0 bg-emerald-800 flex pointer-events-none">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className={`flex-1 h-full ${i % 2 === 0 ? 'bg-emerald-700/25' : 'bg-transparent'}`} />
                      ))}
                    </div>

                    <div className="absolute inset-4 border-2 border-white/25 rounded-lg pointer-events-none"></div>
                    <div className="absolute left-1/2 top-4 bottom-4 w-0.5 bg-white/25 pointer-events-none"></div>
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 md:w-28 md:h-28 rounded-full border-2 border-white/25 pointer-events-none"></div>
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white/40 rounded-full pointer-events-none"></div>

                    <div className="absolute left-4 top-1/4 bottom-1/4 w-12 md:w-16 border-2 border-l-0 border-white/25 pointer-events-none"></div>
                    <div className="absolute right-4 top-1/4 bottom-1/4 w-12 md:w-16 border-2 border-r-0 border-white/25 pointer-events-none"></div>

                    <div className="absolute left-4 top-1/3 bottom-1/3 w-5 border-2 border-l-0 border-white/25 pointer-events-none"></div>
                    <div className="absolute right-4 top-1/3 bottom-1/3 w-5 border-2 border-r-0 border-white/25 pointer-events-none"></div>

                    {/* Left team on left side */}
                    {t1DEF.map((p, idx) => {
                      const top = `${((idx + 1) * 100) / (t1DEF.length + 1)}%`;
                      return renderPitchPlayer(p, '18%', top);
                    })}
                    {t1MD.map((p, idx) => {
                      const top = `${((idx + 1) * 100) / (t1MD.length + 1)}%`;
                      return renderPitchPlayer(p, '33%', top);
                    })}
                    {t1FW.map((p, idx) => {
                      const top = `${((idx + 1) * 100) / (t1FW.length + 1)}%`;
                      return renderPitchPlayer(p, '45%', top);
                    })}

                    {/* Right team on right side */}
                    {t2FW.map((p, idx) => {
                      const top = `${((idx + 1) * 100) / (t2FW.length + 1)}%`;
                      return renderPitchPlayer(p, '55%', top);
                    })}
                    {t2MD.map((p, idx) => {
                      const top = `${((idx + 1) * 100) / (t2MD.length + 1)}%`;
                      return renderPitchPlayer(p, '67%', top);
                    })}
                    {t2DEF.map((p, idx) => {
                      const top = `${((idx + 1) * 100) / (t2DEF.length + 1)}%`;
                      return renderPitchPlayer(p, '82%', top);
                    })}
                  </div>

                  {/* SQUAD BUTTONS & DETAILS */}
                  <div className="bg-[#f5efdf] p-5 rounded-2xl border border-brand-maroon/20 shadow-sm space-y-4">
                    <div className="flex gap-2 justify-center border-b border-brand-maroon/10 pb-3">
                      <button
                        onClick={() => setActiveLineupTeam('team1')}
                        className={`py-2 px-4 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 cursor-pointer ${
                          activeLineupTeam === 'team1' 
                            ? 'bg-brand-maroon text-brand-gold border-b-2 border-black' 
                            : 'bg-white border border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        🏠 {match.team1} Kadrosu
                      </button>
                      <button
                        onClick={() => setActiveLineupTeam('team2')}
                        className={`py-2 px-4 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 cursor-pointer ${
                          activeLineupTeam === 'team2' 
                            ? 'bg-brand-maroon text-brand-gold border-b-2 border-black' 
                            : 'bg-white border border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        🚀 {match.team2} Kadrosu
                      </button>
                    </div>

                    {/* Grid of Players */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1 select-text">
                      {(activeLineupTeam === 'team1' ? team1Players : team2Players).map((player) => {
                        const playerLineup = lineup[player.pname];
                        const hasLineup = !!playerLineup;
                        const played = hasLineup && playerLineup.played;
                        const position = hasLineup ? playerLineup.position : '';
                        const rating = hasLineup ? Number(playerLineup.rating) : 0;

                        let ratingColor = 'bg-gray-200 text-gray-500';
                        if (hasLineup && played) {
                          if (rating > 7.0) {
                            ratingColor = 'bg-green-100 text-green-700 border border-green-300';
                          } else if (rating < 5.0) {
                            ratingColor = 'bg-red-100 text-red-700 border border-red-300';
                          } else {
                            ratingColor = 'bg-yellow-100 text-yellow-700 border border-yellow-300';
                          }
                        }

                        return (
                          <div 
                            key={player.pname}
                            onClick={() => {
                              if (isAdmin) {
                                setSelectedLineupPlayer(player.pname);
                              }
                            }}
                            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                              isAdmin ? 'cursor-pointer hover:border-brand-maroon/50 hover:bg-white' : 'bg-white'
                            } ${
                              selectedLineupPlayer === player.pname ? 'bg-white border-brand-maroon ring-1 ring-brand-maroon shadow-sm' : 'border-gray-200 bg-white/60'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <img 
                                src={player.foto || 'https://via.placeholder.com/100'} 
                                referrerPolicy="no-referrer" 
                                className="w-8 h-8 rounded-full object-cover border border-gray-200" 
                                alt={player.pname} 
                              />
                              <div>
                                <span className="text-xs font-black text-brand-dark uppercase block leading-none">{player.pname}</span>
                                <span className="text-[9px] text-gray-400 font-bold uppercase mt-1 block">
                                  {hasLineup ? (
                                    <span className="flex items-center gap-1.5">
                                      <span className="text-brand-maroon font-black">[{position}]</span>
                                      <span>•</span>
                                      <span>{played ? 'Oynadı' : 'Oynamadı'}</span>
                                    </span>
                                  ) : 'Kadroda Değil'}
                                </span>
                              </div>
                            </div>

                            {hasLineup && played && (
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${ratingColor}`}>
                                {rating.toFixed(1)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Admin Lineup Form */}
                    {isAdmin && (
                      <div className="border-t border-brand-maroon/10 pt-4 mt-2">
                        <span className="text-[10px] font-black text-brand-maroon uppercase tracking-widest block mb-3">🛠️ KADRO & REYTİNG DÜZENLEME (ADMİN)</span>
                        
                        <div className="bg-white p-4 rounded-xl border border-brand-maroon/10 space-y-4">
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-black text-gray-400 uppercase">Oyuncu Seçin</label>
                            <select
                              value={selectedLineupPlayer}
                              onChange={(e) => setSelectedLineupPlayer(e.target.value)}
                              className="w-full bg-brand-cream border border-gray-200 rounded-lg p-2 font-bold text-xs"
                            >
                              <option value="">-- Oyuncu Seçin --</option>
                              <optgroup label={`${match.team1} (🏠)`}>
                                {team1Players.map((p) => (
                                  <option key={p.pname} value={p.pname}>{p.pname}</option>
                                ))}
                              </optgroup>
                              <optgroup label={`${match.team2} (🚀)`}>
                                {team2Players.map((p) => (
                                  <option key={p.pname} value={p.pname}>{p.pname}</option>
                                ))}
                              </optgroup>
                            </select>
                          </div>

                          {selectedLineupPlayer && (
                            <div className="space-y-4">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] font-black text-gray-400 uppercase">Pozisyon</label>
                                <div className="grid grid-cols-3 gap-2">
                                  {(['DEF', 'MD', 'FW'] as const).map((pos) => (
                                    <button
                                      type="button"
                                      key={pos}
                                      onClick={() => setLineupPosition(pos)}
                                      className={`py-2 rounded-lg font-black text-xs uppercase tracking-wider transition-colors cursor-pointer border ${
                                        lineupPosition === pos 
                                          ? 'bg-brand-maroon text-brand-gold border-black' 
                                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                      }`}
                                    >
                                      {pos === 'DEF' ? '🛡️ DEF' : pos === 'MD' ? '⚙️ MD' : '⚡ FW'}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-black text-gray-400 uppercase">Maç Reytingi ({lineupRating})</label>
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="1.0"
                                    max="10.0"
                                    value={lineupRating}
                                    onChange={(e) => setLineupRating(e.target.value)}
                                    className="bg-brand-cream border border-gray-200 rounded-lg px-3 py-2 text-xs font-black w-24 focus:outline-none focus:border-brand-maroon text-center"
                                  />
                                  <input
                                    type="range"
                                    min="1.0"
                                    max="10.0"
                                    step="0.1"
                                    value={lineupRating}
                                    onChange={(e) => setLineupRating(e.target.value)}
                                    className="flex-1 accent-brand-maroon"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-between bg-brand-cream p-2.5 rounded-lg border border-gray-100 select-none">
                                <span className="text-xs font-black text-gray-700">Maçta Süre Aldı mı (Oynadı)?</span>
                                <input
                                  type="checkbox"
                                  checked={lineupPlayed}
                                  onChange={(e) => setLineupPlayed(e.target.checked)}
                                  className="w-5 h-5 accent-brand-maroon cursor-pointer"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2 pt-2">
                                <button
                                  type="button"
                                  onClick={handleSaveLineupPlayer}
                                  className="bg-green-700 hover:bg-green-800 text-white font-black py-2.5 rounded-lg text-[10px] uppercase tracking-wider shadow active:translate-y-0.5 cursor-pointer"
                                >
                                  💾 Kadroyu Güncelle
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLineupPlayer(selectedLineupPlayer)}
                                  className="bg-red-700 hover:bg-red-800 text-white font-black py-2.5 rounded-lg text-[10px] uppercase tracking-wider shadow active:translate-y-0.5 cursor-pointer"
                                >
                                  ❌ Kadrodan Çıkar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
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
              {(['goal', 'period', 'card', 'date', 'mvp', 'loan'] as TabType[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveAdminTab(tab)}
                  className={`py-1.5 px-3 rounded text-[9px] font-black uppercase tracking-wider shrink-0 ${activeAdminTab === tab ? 'bg-brand-maroon text-brand-gold' : 'bg-white border border-gray-300 text-gray-500'}`}
                >
                  {tab === 'goal' ? '⚽ Gol GİR' : tab === 'period' ? '⏱ Def/Tur' : tab === 'card' ? '🟨 Kart GİR' : tab === 'date' ? '📅 Tarih' : tab === 'mvp' ? '🏆 MVP' : '🔄 Kiralık Ekle'}
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
                      <option key={idx} value={p.pname} data-team={p.pteam}>
                        {p.pname} ({p.pteam === team1Name || p.kiralikTakim === team1Name ? 'T1' : 'T2'}{p.kiralik || p.kiralikTakim ? ' 🔄 Kiralık' : ''})
                      </option>
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
                      <option key={idx} value={p.pname}>
                        {p.pname} ({p.pteam === team1Name || p.kiralikTakim === team1Name ? 'T1' : 'T2'}{p.kiralik || p.kiralikTakim ? ' 🔄 Kiralık' : ''})
                      </option>
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
                      <option key={idx} value={p.pname}>
                        {p.pname} ({p.pteam === team1Name || p.kiralikTakim === team1Name ? 'T1' : 'T2'}{p.kiralik || p.kiralikTakim ? ' 🔄 Kiralık' : ''})
                      </option>
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
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500">🏆 Kategori / Turnuva Türü</label>
                  <select 
                    value={matchCategory} 
                    onChange={(e) => setMatchCategory(e.target.value)} 
                    className="w-full bg-white border border-gray-300 rounded p-2 text-xs font-bold"
                  >
                    <option value="">Varsayılan (Lig / Kupa)</option>
                    <option value="LİG MAÇI">LİG MAÇI</option>
                    <option value="TURNUVA">TURNUVA</option>
                    <option value="UCL">UCL (Champions League)</option>
                    <option value="UEL">UEL (Europa League)</option>
                    <option value="UECL">UECL (Conference League)</option>
                  </select>
                </div>
                <button onClick={handleUpdateDate} className="w-full py-2.5 bg-green-700 text-white font-black rounded-lg text-xs">TARİH VE KATEGORİ GÜNCELLE</button>
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
                      <option key={idx} value={p.pname}>
                        {p.pname} ({p.pteam === team1Name || p.kiralikTakim === team1Name ? 'T1' : 'T2'}{p.kiralik || p.kiralikTakim ? ' 🔄 Kiralık' : ''})
                      </option>
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

            {activeAdminTab === 'loan' && (
              <div className="space-y-4 bg-white/80 p-3.5 rounded-xl border border-gray-300 shadow-sm">
                <h4 className="font-extrabold text-xs text-brand-maroon uppercase text-center border-b pb-1">🔄 Maça Kiralık Oyuncu Ekle</h4>
                
                <div className="grid grid-cols-2 gap-3 bg-white/50 p-2 rounded-xl border border-gray-200">
                  <button 
                    type="button"
                    onClick={() => setSelectedLoanTeam('team1')} 
                    className={`py-2 rounded-lg font-black text-xs border-2 ${selectedLoanTeam === 'team1' ? 'border-brand-maroon bg-white text-brand-maroon shadow-sm' : 'border-transparent text-gray-500'}`}
                  >
                    T1: {team1Name}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setSelectedLoanTeam('team2')} 
                    className={`py-2 rounded-lg font-black text-xs border-2 ${selectedLoanTeam === 'team2' ? 'border-brand-maroon bg-white text-brand-maroon shadow-sm' : 'border-transparent text-gray-500'}`}
                  >
                    T2: {team2Name}
                  </button>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Veritabanındaki Tüm Oyunculardan Seç</label>
                  <select
                    value={selectedLoanPlayerName}
                    onChange={(e) => setSelectedLoanPlayerName(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded p-2 text-xs font-bold"
                  >
                    <option value="">-- Oyuncu Seçin --</option>
                    {allGlobalPlayers.map((p, idx) => (
                      <option key={idx} value={p.pname}>
                        {p.pname} ({p.pteam || 'Takımsız'}) {p.kiralik ? '🔄 [Zaten Kiralık]' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Veya Yeni Kiralık Oyuncu İsmi</label>
                  <input
                    type="text"
                    placeholder="Örn: Leo Messi"
                    value={customLoanName}
                    onChange={(e) => setCustomLoanName(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded p-2 text-xs font-bold"
                  />
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const targetTeamName = selectedLoanTeam === 'team1' ? team1Name : team2Name;
                    const pName = (customLoanName.trim() || selectedLoanPlayerName).trim();
                    
                    if (!pName) {
                      alert('Lütfen kiralık eklenecek bir oyuncu seçin veya ismini yazın!');
                      return;
                    }

                    try {
                      const qP = query(collection(db, "players"), where("pname", "==", pName));
                      const pSnap = await getDocs(qP);

                      if (!pSnap.empty) {
                        await updateDoc(doc(db, "players", pSnap.docs[0].id), {
                          kiralik: true,
                          kiralikTakim: targetTeamName
                        });
                      } else {
                        const newRef = doc(collection(db, "players"));
                        await setDoc(newRef, {
                          pname: pName,
                          pteam: targetTeamName,
                          foto: 'https://via.placeholder.com/150?text=Kiral%C4%B1k',
                          goals: 0,
                          asistsay: 0,
                          gen: 75,
                          kiralik: true,
                          kiralikTakim: targetTeamName
                        });
                      }

                      alert(`${pName} oyuncusu ${targetTeamName} kadrosuna kiralık eklendi!`);
                      
                      // Refresh players snapshot
                      const updatedSnap = await getDocs(collection(db, "players"));
                      const t1p: Player[] = [];
                      const t2p: Player[] = [];
                      const allP: Player[] = [];
                      const t1Lower = team1Name.toLowerCase().trim();
                      const t2Lower = team2Name.toLowerCase().trim();

                      updatedSnap.forEach(d => {
                        const pData = d.data() as Player;
                        allP.push(pData);
                        const pt = (pData.pteam || '').toLowerCase().trim();
                        const kt = (pData.kiralikTakim || '').toLowerCase().trim();
                        if (pt === t1Lower || (pData.kiralik && kt === t1Lower)) t1p.push(pData);
                        if (pt === t2Lower || (pData.kiralik && kt === t2Lower)) t2p.push(pData);
                      });

                      setAllGlobalPlayers(allP.sort((a,b) => a.pname.localeCompare(b.pname)));
                      setTeam1Players(t1p.sort((a,b) => a.pname.localeCompare(b.pname)));
                      setTeam2Players(t2p.sort((a,b) => a.pname.localeCompare(b.pname)));

                      setSelectedScorer(pName);
                      setSelectedCardPlayer(pName);
                      setCustomLoanName('');
                      setSelectedLoanPlayerName('');
                      setActiveAdminTab('goal');
                    } catch (err) {
                      console.error(err);
                      alert('Kiralık oyuncu eklenirken bir hata oluştu.');
                    }
                  }}
                  className="w-full py-2.5 bg-brand-maroon text-white font-black rounded-lg text-xs tracking-wider uppercase shadow hover:bg-red-900 transition-colors cursor-pointer"
                >
                  🔄 KİRALIK OLARAK KADROYA EKLE
                </button>
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
