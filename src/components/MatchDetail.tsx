import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, setDoc, collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Match, MatchTimelineEvent, Player, Team, UserProfile } from '../types';
import { recalculateStandings, recalculatePlayerRatings } from '../lib/standings';
import { getStoredTournamentMatches, DEFAULT_TOURNAMENT_MATCHES, saveStoredTournamentMatch, saveStoredBracketData, normalizeCupKey } from '../lib/tournamentMatches';

interface MatchDetailProps {
  matchId: string; // "team1-vs-team2-datejav" representation or tournament id
  initialMatch?: Match;
  currentUser: UserProfile | null;
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onBack: () => void;
  onNavigate: (view: any) => void;
}

type TabType = 'goal' | 'period' | 'card' | 'sub' | 'incident' | 'date' | 'mvp' | 'quick' | 'loan';

export default function MatchDetail({ matchId, initialMatch, currentUser, currentLang, translations, onBack, onNavigate }: MatchDetailProps) {
  const [match, setMatch] = useState<Match | null>(initialMatch || null);
  const [docId, setDocId] = useState<string | null>(initialMatch?.id || matchId);
  const [team1Form, setTeam1Form] = useState<string[]>([]);
  const [team2Form, setTeam2Form] = useState<string[]>([]);
  const [team1Players, setTeam1Players] = useState<Player[]>([]);
  const [team2Players, setTeam2Players] = useState<Player[]>([]);
  const [allGlobalPlayers, setAllGlobalPlayers] = useState<Player[]>([]);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [teamDocIdToNameMap, setTeamDocIdToNameMap] = useState<Record<string, string>>({});
  const [teamNameToDocIdMap, setTeamNameToDocIdMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!initialMatch);

  // Extract team names and datejav from state representation safely
  const parseMatchId = () => {
    let cleanId = matchId;
    try {
      cleanId = decodeURIComponent(matchId);
    } catch {}

    if (cleanId.includes("-vs-")) {
      const parts = cleanId.split("-vs-");
      const t1 = parts[0]?.trim() || initialMatch?.team1 || "";
      const t2_date = parts[1]?.trim() || "";
      const lastHyphen = t2_date.lastIndexOf("-");
      const t2 = lastHyphen !== -1 ? t2_date.substring(0, lastHyphen).trim() : (t2_date || initialMatch?.team2 || "");
      const datejavStr = lastHyphen !== -1 ? t2_date.substring(lastHyphen + 1).trim() : "";
      return { 
        t1: t1 || initialMatch?.team1 || "", 
        t2: t2 || initialMatch?.team2 || "", 
        datejav: parseInt(datejavStr) || initialMatch?.datejav || undefined, 
        cleanId 
      };
    }

    // Custom or Tournament slot id (e.g. "bcl_4_semi1", "becl_4_semi1", etc.)
    const localMatches = getStoredTournamentMatches();
    const tourMatch = initialMatch || localMatches.find(m => m.id === cleanId) || DEFAULT_TOURNAMENT_MATCHES.find(m => m.id === cleanId);
    return {
      t1: tourMatch?.team1 || initialMatch?.team1 || "",
      t2: tourMatch?.team2 || initialMatch?.team2 || "",
      datejav: tourMatch?.datejav || initialMatch?.datejav || undefined,
      cleanId
    };
  };

  const { t1: team1Name, t2: team2Name, datejav: currentMatchDatejav, cleanId: decodedMatchId } = parseMatchId();
  const effectiveTeam1 = match?.team1 || initialMatch?.team1 || team1Name || '';
  const effectiveTeam2 = match?.team2 || initialMatch?.team2 || team2Name || '';

  // Admin controls
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState<TabType>('goal');

  // In-app Toast Notification state (replaces intrusive window.alert popups)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(curr => curr?.message === message ? null : curr);
    }, 3500);
  };

  // Kiralık Oyuncu Ekleme States
  const [selectedLoanTeam, setSelectedLoanTeam] = useState<'team1' | 'team2'>('team1');
  const [selectedLoanPlayerName, setSelectedLoanPlayerName] = useState<string>('');
  const [customLoanName, setCustomLoanName] = useState<string>('');

  const [selectedGoalTeam, setSelectedGoalTeam] = useState<'team1' | 'team2'>('team1');
  const [selectedScorer, setSelectedScorer] = useState('');
  const [selectedAssist, setSelectedAssist] = useState('');
  const [goalMinute, setGoalMinute] = useState('');
  const [isKKGoal, setIsKKGoal] = useState(false);

  const [periodText, setPeriodText] = useState('');
  const [periodMinute, setPeriodMinute] = useState('45');

  const [selectedCardTeam, setSelectedCardTeam] = useState<'team1' | 'team2'>('team1');
  const [selectedCardPlayer, setSelectedCardPlayer] = useState('');
  const [cardColor, setCardColor] = useState<'Sarı' | 'Kırmızı' | 'Yeşil'>('Sarı');
  const [cardMinute, setCardMinute] = useState('');

  // Oyuncu Değişikliği (Substitution) States
  const [selectedSubTeam, setSelectedSubTeam] = useState<'team1' | 'team2'>('team1');
  const [selectedSubOut, setSelectedSubOut] = useState<string>('');
  const [selectedSubIn, setSelectedSubIn] = useState<string>('');
  const [subMinute, setSubMinute] = useState<string>('');

  // Özel Olay (Gol İptali, VAR, Penaltı Kaçtı vb.) States
  const [incidentText, setIncidentText] = useState<string>('');
  const [incidentMinute, setIncidentMinute] = useState<string>('');
  const [selectedIncidentTeam, setSelectedIncidentTeam] = useState<'team1' | 'team2' | 'general'>('general');

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
  const [lineupTeam, setLineupTeam] = useState<'team1' | 'team2'>('team1');

  // Accurately determine whether a player belongs to Team 1 or Team 2 in this match
  const getPlayerTeamLabel = (p: Player): string => {
    const pNameLower = (p.pname || '').toLowerCase().trim();
    const pTeamLower = (p.pteam || '').toLowerCase().trim();
    const pKiralikLower = (p.kiralikTakim || '').toLowerCase().trim();
    
    const t1L = (effectiveTeam1 || '').toLowerCase().trim();
    const t1Doc = (teamNameToDocIdMap[t1L] || t1L).toLowerCase().trim();
    const t1Disp = (teamDocIdToNameMap[t1L] || effectiveTeam1).toLowerCase().trim();

    const t2L = (effectiveTeam2 || '').toLowerCase().trim();
    const t2Doc = (teamNameToDocIdMap[t2L] || t2L).toLowerCase().trim();
    const t2Disp = (teamDocIdToNameMap[t2L] || effectiveTeam2).toLowerCase().trim();

    // 1. Direct membership in team1Players / team2Players state
    const inT1 = team1Players.some(tp => tp.pname.toLowerCase().trim() === pNameLower);
    const inT2 = team2Players.some(tp => tp.pname.toLowerCase().trim() === pNameLower);

    if (p.kiralik && pKiralikLower) {
      if (t1L && (pKiralikLower === t1L || pKiralikLower === t1Doc || pKiralikLower === t1Disp)) return 'T1 🔄 Kiralık';
      if (t2L && (pKiralikLower === t2L || pKiralikLower === t2Doc || pKiralikLower === t2Disp)) return 'T2 🔄 Kiralık';
    }

    if (inT1 || (t1L && (pTeamLower === t1L || pTeamLower === t1Doc || pTeamLower === t1Disp))) {
      return p.kiralik || p.kiralikTakim ? 'T1 🔄 Kiralık' : 'T1';
    }
    if (inT2 || (t2L && (pTeamLower === t2L || pTeamLower === t2Doc || pTeamLower === t2Disp))) {
      return p.kiralik || p.kiralikTakim ? 'T2 🔄 Kiralık' : 'T2';
    }

    return 'Diğer';
  };

  const resolvePlayerMatchTeam = (pname: string, info?: any): 'team1' | 'team2' => {
    if (info?.team === 'team1' || info?.team === 'team2') return info.team;
    if (effectiveTeam1 && info?.team === effectiveTeam1) return 'team1';
    if (effectiveTeam2 && info?.team === effectiveTeam2) return 'team2';
    
    const pNameLower = pname.toLowerCase().trim();
    // Check timeline events
    const tlEvt = (match?.timeline || []).find((e: any) => 
      (e.scorer?.toLowerCase().trim() === pNameLower || 
       e.player?.toLowerCase().trim() === pNameLower || 
       e.subIn?.toLowerCase().trim() === pNameLower || 
       e.subOut?.toLowerCase().trim() === pNameLower) && (e.team === 'team1' || e.team === 'team2')
    );
    if (tlEvt?.team) return tlEvt.team;

    // Check current team or kiralik
    const t1Found = team1Players.some(p => p.pname.toLowerCase().trim() === pNameLower);
    if (t1Found) return 'team1';
    const t2Found = team2Players.some(p => p.pname.toLowerCase().trim() === pNameLower);
    if (t2Found) return 'team2';

    const globalP = allGlobalPlayers.find(p => p.pname.toLowerCase().trim() === pNameLower);
    if (globalP) {
      const pt = (globalP.pteam || '').toLowerCase().trim();
      const kt = (globalP.kiralikTakim || '').toLowerCase().trim();
      const t1Lower = (effectiveTeam1 || '').toLowerCase().trim();
      const t2Lower = (effectiveTeam2 || '').toLowerCase().trim();
      if (t1Lower && (pt === t1Lower || kt === t1Lower)) return 'team1';
      if (t2Lower && (pt === t2Lower || kt === t2Lower)) return 'team2';
    }

    return activeLineupTeam;
  };

  useEffect(() => {
    if (selectedLineupPlayer && match) {
      const lineup = match.lineup || {};
      const pInfo = lineup[selectedLineupPlayer];
      if (pInfo) {
        setLineupPosition(pInfo.position || 'DEF');
        setLineupRating(pInfo.rating !== undefined ? String(pInfo.rating) : '6.0');
        setLineupPlayed(pInfo.played !== false);
        setLineupTeam(resolvePlayerMatchTeam(selectedLineupPlayer, pInfo));
      } else {
        setLineupPosition('DEF');
        setLineupRating('6.0');
        setLineupPlayed(true);
        setLineupTeam(resolvePlayerMatchTeam(selectedLineupPlayer));
      }
    }
  }, [selectedLineupPlayer, match]);

  const handleSaveLineupPlayer = async () => {
    const targetDocId = docId || matchId;
    if (!targetDocId || !selectedLineupPlayer) return;
    try {
      const allAvailable = [...team1Players, ...team2Players];
      const matchedP = allAvailable.find(p => p.pname.toLowerCase().trim() === selectedLineupPlayer.toLowerCase().trim() || (p as any).id === selectedLineupPlayer);
      const pId = (matchedP as any)?.id || (matchedP as any)?.docId || selectedLineupPlayer;

      const updatedLineup = {
        ...(match?.lineup || {}),
        [selectedLineupPlayer]: {
          position: lineupPosition,
          rating: Number(lineupRating) || 0,
          played: lineupPlayed,
          team: lineupTeam,
          playerId: pId,
          pname: matchedP ? matchedP.pname : selectedLineupPlayer
        }
      };
      await setDoc(doc(db, 'matches', targetDocId), {
        lineup: updatedLineup
      }, { merge: true });
      await recalculatePlayerRatings();
      showToast('Oyuncu kadro ve rating bilgisi başarıyla kaydedildi!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Kadro kaydedilirken hata oluştu.', 'error');
    }
  };

  const handleRemoveLineupPlayer = async (pname: string) => {
    const targetDocId = docId || matchId;
    if (!targetDocId) return;
    if (!confirm(`${pname} isimli oyuncuyu kadrodan çıkarmak istediğinize emin misiniz?`)) return;
    try {
      const updatedLineup = { ...(match?.lineup || {}) };
      delete updatedLineup[pname];
      await setDoc(doc(db, 'matches', targetDocId), {
        lineup: updatedLineup
      }, { merge: true });
      await recalculatePlayerRatings();
      showToast('Oyuncu kadrodan çıkarıldı!', 'info');
      if (selectedLineupPlayer === pname) {
        setSelectedLineupPlayer('');
      }
    } catch (err) {
      console.error(err);
      showToast('Oyuncu çıkarılırken hata oluştu.', 'error');
    }
  };

  // Quick inputs
  const [quickInputString, setQuickInputString] = useState('');
  const [quickIyInputString, setQuickIyInputString] = useState('');

  const handleQuickSubmit = async () => {
    const targetDocId = docId || matchId;
    if (!targetDocId) return;
    const parts = quickInputString.split('-');
    if (parts.length !== 2) {
      showToast('Lütfen skoru "5-2" formatında giriniz!', 'error');
      return;
    }
    const s1 = parts[0].trim();
    const s2 = parts[1].trim();
    if (isNaN(Number(s1)) || isNaN(Number(s2))) {
      showToast('Lütfen geçerli sayılar giriniz!', 'error');
      return;
    }

    try {
      await setDoc(doc(db, 'matches', targetDocId), {
        score1: s1,
        score2: s2,
        iyScore: quickIyInputString.trim() || null,
        played: true
      }, { merge: true });
      await recalculateStandings();
      showToast('Maç skoru başarıyla güncellendi!', 'success');
      setQuickInputString('');
      setQuickIyInputString('');
    } catch (e) {
      console.error(e);
      showToast('Skor güncellenirken hata oluştu.', 'error');
    }
  };



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

      const t1Lower = (effectiveTeam1 || '').toLowerCase().trim();
      const t2Lower = (effectiveTeam2 || '').toLowerCase().trim();
      
      const t1DocId = nameToDoc[t1Lower] || t1Lower;
      const t2DocId = nameToDoc[t2Lower] || t2Lower;
      const t1DisplayName = docToName[t1Lower] || effectiveTeam1;
      const t2DisplayName = docToName[t2Lower] || effectiveTeam2;

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

      if (effectiveTeam1) findForm(effectiveTeam1, t1DocId, t1DisplayName, setTeam1Form);
      if (effectiveTeam2) findForm(effectiveTeam2, t2DocId, t2DisplayName, setTeam2Form);

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
  }, [effectiveTeam1, effectiveTeam2]);

  // Set default Scorer and card player on side toggle
  useEffect(() => {
    const list = selectedGoalTeam === 'team1' ? team1Players : team2Players;
    if (list.length > 0) {
      setSelectedScorer(list[0].pname);
    }
  }, [selectedGoalTeam, team1Players, team2Players]);

  useEffect(() => {
    if (!selectedScorer) {
      setIsKKGoal(false);
      return;
    }
    const scoringTeamName = selectedGoalTeam === 'team1' ? effectiveTeam1 : effectiveTeam2;
    const playerInDb = [...team1Players, ...team2Players].find(p => p.pname === selectedScorer);
    if (playerInDb) {
      const pTeamLower = (playerInDb.pteam || '').toLowerCase().trim();
      const pKiralikLower = (playerInDb.kiralikTakim || '').toLowerCase().trim();
      const sTeamLower = (scoringTeamName || '').toLowerCase().trim();
      
      const pDocId = teamNameToDocIdMap[pTeamLower] || pTeamLower;
      const pKiralikDocId = teamNameToDocIdMap[pKiralikLower] || pKiralikLower;
      const sDocId = teamNameToDocIdMap[sTeamLower] || sTeamLower;
      
      let autoKK = false;
      if (playerInDb.kiralik && pKiralikLower) {
        autoKK = pKiralikDocId !== sDocId;
      } else {
        autoKK = pDocId !== sDocId;
      }
      setIsKKGoal(autoKK);
    }
  }, [selectedScorer, selectedGoalTeam, effectiveTeam1, effectiveTeam2, teamNameToDocIdMap, team1Players, team2Players]);

  useEffect(() => {
    const list = selectedCardTeam === 'team1' ? team1Players : team2Players;
    if (list.length > 0) {
      setSelectedCardPlayer(list[0].pname);
    }
  }, [selectedCardTeam, team1Players, team2Players]);

  // 4. Real-time Match Subscription
  useEffect(() => {
    let isSubscribed = true;
    const targetId = decodedMatchId || matchId;

    // Direct doc snapshot first for instantaneous loading
    const unsubDoc = onSnapshot(doc(db, "matches", targetId), (dSnap) => {
      if (!isSubscribed) return;
      if (dSnap.exists()) {
        const m = { id: dSnap.id, ...dSnap.data() } as Match;
        setMatch(m);
        setDocId(dSnap.id);
        setMatchDateText(m.date || '');
        setMatchDatejavText(String(m.datejav || ''));
        setMatchCategory((m as any).category || '');
        setSelectedMvp(m.mvp || '');
        setMvpRating(m.rating || '');
        setLoading(false);
      }
    });

    const q = collection(db, "matches");
    const unsubCollection = onSnapshot(q, (snap) => {
      if (!isSubscribed) return;
      let found: Match | null = null;
      let fId: string | null = null;

      // First check by direct docId (exact, decoded, case-insensitive)
      snap.forEach((docSnap) => {
        const dId = docSnap.id;
        if (dId === matchId || dId === targetId || dId.toLowerCase() === targetId.toLowerCase()) {
          found = { id: docSnap.id, ...docSnap.data() } as Match;
          fId = docSnap.id;
        }
      });

      // Second check by team names
      if (!found) {
        snap.forEach((docSnap) => {
          const m = docSnap.data() as Match;
          const mt1 = (m.team1 || '').toLowerCase().trim();
          const mt2 = (m.team2 || '').toLowerCase().trim();
          const t1L = (team1Name || '').toLowerCase().trim();
          const t2L = (team2Name || '').toLowerCase().trim();
          if (mt1 && mt2 && t1L && t2L) {
            const matchesTeams = (mt1 === t1L && mt2 === t2L) || (mt1 === t2L && mt2 === t1L);
            if (matchesTeams) {
              if (!currentMatchDatejav || Number(m.datejav) === Number(currentMatchDatejav)) {
                found = { id: docSnap.id, ...m };
                fId = docSnap.id;
              }
            }
          }
        });
      }

      if (found) {
        setMatch(found);
        setDocId(fId);
        setMatchDateText((found as Match).date || '');
        setMatchDatejavText(String((found as Match).datejav || ''));
        setMatchCategory((found as any).category || '');
        setSelectedMvp((found as Match).mvp || '');
        setMvpRating((found as Match).rating || '');
      } else {
        setDocId(targetId);
      }
      setLoading(false);
    });

    return () => {
      isSubscribed = false;
      unsubDoc();
      unsubCollection();
    };
  }, [matchId, decodedMatchId, team1Name, team2Name, currentMatchDatejav]);

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

  const handleSaveTimeline = async (events: MatchTimelineEvent[], customLineup?: Record<string, any>) => {
    const targetDocId = docId || matchId;
    if (!targetDocId) {
      showToast('Hata: Maç kimliği bulunamadı.', 'error');
      return;
    }

    let calScore1 = 0;
    let calScore2 = 0;
    let hasGoalEvents = false;
    events.forEach(evt => {
      if (evt.type === 'goal') {
        hasGoalEvents = true;
        if (evt.team === 'team1') calScore1++;
        else if (evt.team === 'team2') calScore2++;
      }
    });

    // Strip ALL undefined fields from events so Firestore never throws "Unsupported field value: undefined"
    const sanitizedEvents = events.map(evt => {
      const clean: any = {};
      Object.keys(evt).forEach(k => {
        const val = (evt as any)[k];
        if (val !== undefined && val !== null) {
          clean[k] = val;
        }
      });
      return clean;
    });

    const updatePayload: any = {
      timeline: sanitizedEvents,
      played: true
    };

    // If there are goals in timeline, use calculated scores; otherwise preserve existing match scores
    if (hasGoalEvents) {
      updatePayload.score1 = String(calScore1);
      updatePayload.score2 = String(calScore2);
    } else if (match?.score1 !== undefined && match?.score2 !== undefined) {
      updatePayload.score1 = String(match.score1);
      updatePayload.score2 = String(match.score2);
    }

    if (customLineup) {
      const sanitizedLineup: Record<string, any> = {};
      Object.entries(customLineup).forEach(([pName, pData]: [string, any]) => {
        if (!pName || typeof pData !== 'object' || pData === null) return;
        const cleanPlayer: any = {};
        Object.keys(pData).forEach(k => {
          if (pData[k] !== undefined && pData[k] !== null) {
            cleanPlayer[k] = pData[k];
          }
        });
        sanitizedLineup[pName] = cleanPlayer;
      });
      updatePayload.lineup = sanitizedLineup;
    }

    // Preserve and ensure core match data on first save
    if (match?.team1 || team1Name) updatePayload.team1 = match?.team1 || team1Name;
    if (match?.team2 || team2Name) updatePayload.team2 = match?.team2 || team2Name;
    if (match?.datejav || currentMatchDatejav) updatePayload.datejav = match?.datejav || currentMatchDatejav || Date.now();
    if (match?.date || matchDateText) updatePayload.date = match?.date || matchDateText || '---';
    if (match?.category || matchCategory) updatePayload.category = match?.category || matchCategory || 'LİG MAÇI';

    try {
      await setDoc(doc(db, 'matches', targetDocId), updatePayload, { merge: true });
      setDocId(targetDocId);

      // If it's a tournament match, synchronize locally and advance bracket if played
      const fullMatch: Match = {
        ...(match || {}),
        ...updatePayload,
        id: targetDocId
      };
      const cat = String(fullMatch.category || matchCategory || '').toUpperCase();
      const hStr = String(fullMatch.hafta || '').toUpperCase();
      const cupKey = normalizeCupKey(cat, hStr);
      if (cupKey && cupKey !== 'wpc') {
        saveStoredTournamentMatch(fullMatch);
        const s = Number((fullMatch as any).season) || 5;
        const r = String((fullMatch as any).round || '').toLowerCase();
        const p = `${cupKey}${s}`;
        const s1 = Number(fullMatch.score1) || 0;
        const s2 = Number(fullMatch.score2) || 0;
        let winner = '';
        if (s1 > s2) winner = fullMatch.team1;
        else if (s2 > s1) winner = fullMatch.team2;
        else winner = (fullMatch as any).penaltyWinner || fullMatch.team1;

        const bUpdates: Record<string, string> = {};
        if (r === 'semi1' && winner) bUpdates[`${p}s5`] = winner;
        else if (r === 'semi2' && winner) bUpdates[`${p}s6`] = winner;
        else if (r === 'final' && winner) bUpdates[`${p}s7`] = winner;

        if (Object.keys(bUpdates).length > 0) {
          saveStoredBracketData(bUpdates);
          setDoc(doc(db, 'brackets', 'data'), bUpdates, { merge: true }).catch(() => {});
        }
      } else if (cat.includes('WPC') || cat.includes('TURNUVA')) {
        saveStoredTournamentMatch(fullMatch);
      }

      try {
        await recalculateStandings();
      } catch (stErr) {
        console.warn('recalculateStandings notice:', stErr);
      }
    } catch (e: any) {
      console.error("handleSaveTimeline error:", e);
      showToast(`Kaydedilemedi: ${e?.message || 'Bilinmeyen hata'}`, 'error');
      throw e;
    }
  };

  const handleAddGoal = async () => {
    if (!selectedScorer || !goalMinute.trim()) {
      showToast('Oyuncu ve dakika alanları boş bırakılamaz!', 'error');
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
      isKK: isKKGoal
    };

    const updated = [...(match?.timeline || []), newEvt];
    try {
      await handleSaveTimeline(updated);
      setGoalMinute('');
      showToast('Gol başarıyla kaydedildi!', 'success');
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddPeriod = async () => {
    if (!periodText.trim()) {
      showToast('Lütfen başlık giriniz!', 'error');
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
    try {
      await handleSaveTimeline(updated);
      setPeriodText('');
      showToast('Devre/Tur kaydedildi!', 'success');
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddCard = async () => {
    if (!selectedCardPlayer || !cardMinute.trim()) {
      showToast('Oyuncu ve dakika alanları boş bırakılamaz!', 'error');
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
    try {
      await handleSaveTimeline(updated);
      setCardMinute('');
      showToast('Kart başarıyla kaydedildi!', 'success');
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddSub = async () => {
    const subOutTrimmed = selectedSubOut.trim();
    const subInTrimmed = selectedSubIn.trim();

    if (!subOutTrimmed && !subInTrimmed) {
      showToast('Lütfen çıkan veya giren en az bir oyuncu seçiniz!', 'error');
      return;
    }
    if (subOutTrimmed && subInTrimmed && subOutTrimmed.toLowerCase() === subInTrimmed.toLowerCase()) {
      showToast('Giren ve çıkan oyuncu aynı kişi olamaz!', 'error');
      return;
    }

    let min = subMinute.trim();
    if (!min) {
      min = "45'";
    } else if (!min.endsWith("'")) {
      min += "'";
    }

    const newEvt: any = {
      id: 'evt_' + Date.now(),
      type: 'sub',
      team: selectedSubTeam,
      minute: min
    };
    if (subOutTrimmed) {
      newEvt.subOut = subOutTrimmed;
    }
    if (subInTrimmed) {
      newEvt.subIn = subInTrimmed;
    }

    const updated = [...(match?.timeline || []), newEvt];

    // Ensure subbed players are recorded in match lineup
    const updatedLineup = { ...(match?.lineup || {}) };
    if (subInTrimmed) {
      const existing = updatedLineup[subInTrimmed] || {};
      updatedLineup[subInTrimmed] = {
        position: existing.position || 'MD',
        rating: existing.rating !== undefined ? existing.rating : 6.0,
        played: true,
        team: existing.team || selectedSubTeam
      };
    }
    if (subOutTrimmed && !updatedLineup[subOutTrimmed]) {
      updatedLineup[subOutTrimmed] = {
        position: 'MD',
        rating: 6.0,
        played: true,
        team: selectedSubTeam
      };
    }

    try {
      await handleSaveTimeline(updated, updatedLineup);
      setSubMinute('');
      setSelectedSubOut('');
      setSelectedSubIn('');
      showToast('Oyuncu değişikliği başarıyla kaydedildi!', 'success');
    } catch (err: any) {
      console.error("handleAddSub error:", err);
    }
  };

  const handleAddIncident = async () => {
    if (!incidentText.trim()) {
      showToast('Lütfen olay açıklamasını yazınız! (Örn: Gol İptali, VAR İncelemesi, Penaltı Kaçtı)', 'error');
      return;
    }

    let min = incidentMinute.trim();
    if (!min) {
      min = "-";
    } else if (!min.endsWith("'")) {
      min += "'";
    }

    const newEvt: any = {
      id: 'evt_' + Date.now(),
      type: 'incident',
      text: incidentText.trim(),
      minute: min
    };
    if (selectedIncidentTeam !== 'general') {
      newEvt.team = selectedIncidentTeam;
    }

    const updated = [...(match?.timeline || []), newEvt];
    try {
      await handleSaveTimeline(updated);
      setIncidentText('');
      setIncidentMinute('');
      showToast('Maç olayı başarıyla kaydedildi!', 'success');
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateDate = async () => {
    const targetDocId = docId || matchId;
    if (!targetDocId) return;
    const javVal = parseInt(matchDatejavText);
    if (!matchDateText || isNaN(javVal)) {
      showToast('Lütfen geçerli tarih ve Datejav değeri girin.', 'error');
      return;
    }

    try {
      await setDoc(doc(db, 'matches', targetDocId), {
        date: matchDateText.trim(),
        datejav: javVal,
        category: matchCategory.trim()
      }, { merge: true });
      await recalculateStandings();
      showToast('Tarih ve kategori güncellendi!', 'success');
      // Update screen representation
      onBack();
    } catch (e) {
      console.error(e);
      showToast('Tarih güncellenirken hata oluştu.', 'error');
    }
  };

  const handleUpdateMvp = async () => {
    const targetDocId = docId || matchId;
    if (!targetDocId) return;
    try {
      await setDoc(doc(db, 'matches', targetDocId), {
        mvp: selectedMvp,
        rating: mvpRating.trim() || '0.0',
        played: true
      }, { merge: true });
      await recalculateStandings();
      showToast('MVP başarıyla güncellendi!', 'success');
    } catch (e) {
      console.error(e);
      showToast('MVP güncellenirken hata oluştu.', 'error');
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

  // Fallback match representation in case doc is uninitialized or being planned
  const fallbackMatch: Match = {
    id: decodedMatchId || initialMatch?.id || matchId,
    team1: initialMatch?.team1 || team1Name || 'Takım 1',
    team2: initialMatch?.team2 || team2Name || 'Takım 2',
    date: initialMatch?.date || matchDateText || new Date().toLocaleDateString('tr-TR'),
    datejav: initialMatch?.datejav || currentMatchDatejav || Date.now(),
    score1: initialMatch?.score1 !== undefined ? String(initialMatch.score1) : '0',
    score2: initialMatch?.score2 !== undefined ? String(initialMatch.score2) : '0',
    played: initialMatch?.played || false,
    timeline: initialMatch?.timeline || [],
    lineup: initialMatch?.lineup || {},
    category: initialMatch?.category || matchCategory || 'TURNUVA',
    hafta: initialMatch?.hafta || 'Turnuva',
    ligm: false
  };

  const activeMatch: Match = match || initialMatch || fallbackMatch;

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
    <div className="space-y-6 relative">
      {/* Toast Notification Container */}
      {toast && (
        <div 
          className={`fixed top-4 right-4 z-[9999] max-w-sm px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border text-xs font-black transition-all ${
            toast.type === 'error'
              ? 'bg-rose-50 border-rose-500 text-rose-800'
              : toast.type === 'info'
              ? 'bg-sky-50 border-sky-500 text-sky-800'
              : 'bg-emerald-50 border-emerald-500 text-emerald-800'
          }`}
        >
          <span className="text-base">{toast.type === 'error' ? '⚠️' : toast.type === 'info' ? 'ℹ️' : '✅'}</span>
          <span className="flex-1 leading-snug">{toast.message}</span>
          <button 
            type="button" 
            onClick={() => setToast(null)}
            className="text-gray-400 hover:text-gray-700 ml-1 font-bold text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
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

      {loading && !match ? (
        <h3 className="text-center text-gray-500 font-bold">{t.loading}</h3>
      ) : (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in select-text">
          <div className="bg-brand-card rounded-3xl p-6 md:p-12 shadow-xl border-t-8 border-brand-maroon select-text">
            <span className="text-center text-xs font-black text-gray-400 block mb-6 uppercase tracking-widest">
              {activeMatch.date || 'Tarih Belirsiz'}
            </span>

            <div className="flex flex-col md:flex-row items-center justify-center gap-10">
              {/* Team 1 Card */}
              <div 
                className="flex-1 flex flex-col items-center cursor-pointer hover:scale-105 transition-transform text-center"
                onClick={() => onNavigate({ type: 'team-detail', teamName: activeMatch.team1 })}
              >
                <img src={logos[activeMatch.team1] || 'https://via.placeholder.com/128?text=?'} className="w-32 h-32 rounded-full border-4 border-brand-maroon object-cover bg-white shadow-md shadow-black/10" alt="team1" />
                <span className="text-xl md:text-2xl font-black text-brand-dark block mt-4 leading-tight">{activeMatch.team1}</span>
                <div className="flex gap-1.5 justify-center mt-3 scale-90">{renderFormSqs(team1Form)}</div>
              </div>

              {/* Scoreboard Block */}
              <div className="flex flex-col items-center">
                <span className="text-6xl md:text-8xl font-black text-brand-maroon text-shadow leading-none">
                  {activeMatch.played ? `${activeMatch.score1} - ${activeMatch.score2}` : 'VS'}
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
                onClick={() => onNavigate({ type: 'team-detail', teamName: activeMatch.team2 })}
              >
                <img src={logos[activeMatch.team2] || 'https://via.placeholder.com/128?text=?'} className="w-32 h-32 rounded-full border-4 border-brand-maroon object-cover bg-white shadow-md shadow-black/10" alt="team2" />
                <span className="text-xl md:text-2xl font-black text-brand-dark block mt-4 leading-tight">{activeMatch.team2}</span>
                <div className="flex gap-1.5 justify-center mt-3 scale-90">{renderFormSqs(team2Form)}</div>
              </div>
            </div>

            {/* MVP award segment */}
            {activeMatch.played && activeMatch.mvp && (
              <div className="bg-brand-dark rounded-2xl p-4 text-brand-gold flex items-center justify-between border-l-12 border-brand-gold mt-10 shadow-lg">
                <div>
                  <span className="bg-brand-maroon text-[9px] px-2 py-0.5 rounded text-white font-extrabold uppercase select-none">{t.mvp}</span>
                  <h4 
                    onClick={() => onNavigate({ type: 'player-profile', playerName: activeMatch.mvp || '' })}
                    className="text-lg md:text-xl font-black uppercase hover:underline cursor-pointer tracking-wide mt-1.5 text-white"
                  >
                    {activeMatch.mvp}
                  </h4>
                </div>
                <div className="text-right">
                  <span className="text-3xl md:text-4xl font-black block leading-none">{activeMatch.rating}</span>
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

                      if (evt.type === 'sub') {
                        const isT1 = evt.team === 'team1';
                        return (
                          <div key={i} className="grid grid-cols-[1fr_70px_1fr] items-center gap-4 py-2 select-text">
                            {/* Left Col (T1) */}
                            {isT1 ? (
                              <div className="flex items-center gap-2.5 justify-end">
                                <div className="text-right space-y-0.5">
                                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">🔄 Oyuncu Değişikliği</span>
                                  {evt.subIn && (
                                    <div className="text-xs md:text-sm font-black text-emerald-700 flex items-center justify-end gap-1.5 truncate max-w-36 md:max-w-48">
                                      <span className="truncate">{evt.subIn}</span>
                                      <span className="text-[8px] md:text-[9px] font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.2 rounded-full shrink-0">▲ GİREN</span>
                                    </div>
                                  )}
                                  {evt.subOut && (
                                    <div className="text-xs md:text-sm font-black text-red-600 flex items-center justify-end gap-1.5 truncate max-w-36 md:max-w-48">
                                      <span className="truncate">{evt.subOut}</span>
                                      <span className="text-[8px] md:text-[9px] font-black text-red-800 bg-red-100 border border-red-300 px-1.5 py-0.2 rounded-full shrink-0">▼ ÇIKAN</span>
                                    </div>
                                  )}
                                </div>
                                <span className="text-xl shrink-0">🔄</span>
                              </div>
                            ) : <div />}

                            {/* Center Min block */}
                            <div className="flex flex-col items-center justify-center p-1 bg-brand-card rounded-xl border border-gray-300 shadow-sm shrink-0">
                              <span className="text-xs font-black text-brand-maroon">{evt.minute}</span>
                              <span className="text-[8px] font-bold text-gray-500 uppercase tracking-tighter">DEĞ.</span>
                            </div>

                            {/* Right Col (T2) */}
                            {!isT1 ? (
                              <div className="flex items-center gap-2.5 justify-start">
                                <span className="text-xl shrink-0">🔄</span>
                                <div className="text-left space-y-0.5">
                                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">🔄 Oyuncu Değişikliği</span>
                                  {evt.subIn && (
                                    <div className="text-xs md:text-sm font-black text-emerald-700 flex items-center justify-start gap-1.5 truncate max-w-36 md:max-w-48">
                                      <span className="text-[8px] md:text-[9px] font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.2 rounded-full shrink-0">▲ GİREN</span>
                                      <span className="truncate">{evt.subIn}</span>
                                    </div>
                                  )}
                                  {evt.subOut && (
                                    <div className="text-xs md:text-sm font-black text-red-600 flex items-center justify-start gap-1.5 truncate max-w-36 md:max-w-48">
                                      <span className="text-[8px] md:text-[9px] font-black text-red-800 bg-red-100 border border-red-300 px-1.5 py-0.2 rounded-full shrink-0">▼ ÇIKAN</span>
                                      <span className="truncate">{evt.subOut}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : <div />}
                          </div>
                        );
                      }

                      if (evt.type === 'incident') {
                        const isT1 = evt.team === 'team1';
                        const isT2 = evt.team === 'team2';
                        const isGeneral = !isT1 && !isT2;

                        if (isGeneral) {
                          return (
                            <div key={i} className="flex justify-center select-text py-1">
                              <span className="bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black py-1.5 px-4 rounded-full shadow-xs flex items-center gap-1.5 uppercase">
                                <span className="font-extrabold text-[10px] bg-amber-200 px-1.5 py-0.2 rounded-full">{evt.minute}</span>
                                <span>⚠️ {evt.text}</span>
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div key={i} className="grid grid-cols-[1fr_70px_1fr] items-center gap-4 py-2 select-text">
                            {/* Left Col (T1) */}
                            {isT1 ? (
                              <div className="flex items-center gap-2.5 justify-end">
                                <div className="text-right space-y-0.5">
                                  <span className="text-xs md:text-sm font-black text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg inline-block truncate max-w-44">
                                    ⚠️ {evt.text}
                                  </span>
                                </div>
                              </div>
                            ) : <div />}

                            {/* Center Min block */}
                            <div className="flex flex-col items-center justify-center p-1 bg-amber-50 rounded-xl border border-amber-300 shadow-sm shrink-0">
                              <span className="text-xs font-black text-amber-900">{evt.minute}</span>
                              <span className="text-[8px] font-bold text-amber-700 uppercase tracking-tighter">OLAY</span>
                            </div>

                            {/* Right Col (T2) */}
                            {isT2 ? (
                              <div className="flex items-center gap-2.5 justify-start">
                                <div className="text-left space-y-0.5">
                                  <span className="text-xs md:text-sm font-black text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg inline-block truncate max-w-44">
                                    ⚠️ {evt.text}
                                  </span>
                                </div>
                              </div>
                            ) : <div />}
                          </div>
                        );
                      }

                      const isT1 = evt.team === 'team1';
                      const cardEmoji = evt.cardColor === 'Sarı' ? '🟨' : evt.cardColor === 'Yeşil' ? '🟩' : '🟥';
                      const cardLabel = `${evt.cardColor || 'Sarı'} Kart`;

                      return (
                        <div key={i} className="grid grid-cols-[1fr_70px_1fr] items-center gap-4 py-1.5 select-text">
                          {/* Left Col */}
                          {isT1 ? (
                            <div className="flex items-center gap-2.5 justify-end">
                              <div className="text-right">
                                <span className={`text-xs md:text-sm font-black text-brand-dark block uppercase truncate max-w-32 ${evt.isKK ? 'text-red-500' : ''}`}>
                                  {evt.scorer} {evt.isKK ? '(K.K)' : ''} {evt.player}
                                </span>
                                <span className="text-[10px] text-gray-400 font-bold block truncate max-w-32">{evt.type === 'goal' ? `Asist: ${evt.assist}` : cardLabel}</span>
                              </div>
                              <span className="text-xl">{evt.type === 'goal' ? '⚽' : cardEmoji}</span>
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
                              <span className="text-xl">{evt.type === 'goal' ? '⚽' : cardEmoji}</span>
                              <div className="text-left">
                                <span className={`text-xs md:text-sm font-black text-brand-dark block uppercase truncate max-w-32 ${evt.isKK ? 'text-red-500' : ''}`}>
                                  {evt.scorer} {evt.isKK ? '(K.K)' : ''} {evt.player}
                                </span>
                                <span className="text-[10px] text-gray-400 font-bold block truncate max-w-32">{evt.type === 'goal' ? `Asist: ${evt.assist}` : cardLabel}</span>
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
                .map(([pname, info]: any) => {
                  const matchTeam = resolvePlayerMatchTeam(pname, info);
                  return {
                    pname,
                    ...info,
                    position: info.position || 'MD',
                    matchTeam
                  };
                })
                .filter((p: any) => p.played !== false || Number(p.rating) > 0);

              const t1Active = activeList.filter((p: any) => p.matchTeam === 'team1');
              const t2Active = activeList.filter((p: any) => p.matchTeam === 'team2');

              const t1DEF = t1Active.filter((p: any) => p.position === 'DEF');
              const t1MD  = t1Active.filter((p: any) => p.position === 'MD');
              const t1FW  = t1Active.filter((p: any) => p.position === 'FW');

              const t2FW  = t2Active.filter((p: any) => p.position === 'FW');
              const t2MD  = t2Active.filter((p: any) => p.position === 'MD');
              const t2DEF = t2Active.filter((p: any) => p.position === 'DEF');

              const renderPitchPlayer = (player: any, left: string, top: string) => {
                const playerDb = [...team1Players, ...team2Players, ...allGlobalPlayers].find(dbP => dbP.pname.toLowerCase().trim() === player.pname.toLowerCase().trim());
                const fotoUrl = playerDb?.foto || '';
                const rating = Number(player.rating) || 0;
                
                let ratingBg = 'bg-amber-500 border-amber-400 text-black';
                if (rating > 7.0) {
                  ratingBg = 'bg-green-600 border-green-400 text-white';
                } else if (rating < 5.0) {
                  ratingBg = 'bg-red-600 border-red-400 text-white';
                }

                // Oyuncunun bu maçtaki değişiklik olayları (giren / çıkan)
                const pNameLower = player.pname.toLowerCase().trim();
                const subInEvents = (match?.timeline || []).filter(e => e.type === 'sub' && e.subIn?.toLowerCase().trim() === pNameLower);
                const subOutEvents = (match?.timeline || []).filter(e => e.type === 'sub' && e.subOut?.toLowerCase().trim() === pNameLower);
                const isSubIn = subInEvents.length > 0;
                const isSubOut = subOutEvents.length > 0;
                const subInMins = subInEvents.map(e => e.minute).join(', ');
                const subOutMins = subOutEvents.map(e => e.minute).join(', ');

                // Oyuncunun bu maçtaki kartları (Sarı, Yeşil, Kırmızı)
                const playerCards = (match?.timeline || []).filter(e => e.type === 'card' && e.player?.toLowerCase().trim() === pNameLower);

                // Oyuncunun bu maçtaki kendi kalesine golleri (K.K.)
                const playerKKEvents = (match?.timeline || []).filter(e => {
                  if (e.type !== 'goal') return false;
                  const isKK = Boolean(
                    e.isKK === true ||
                    (e.scorer || '').toLowerCase().includes('(k.k') ||
                    (e.scorer || '').toLowerCase().includes('(kk') ||
                    (e.scorer || '').toLowerCase().includes('kendi kalesine') ||
                    (e.assist || '').toLowerCase().includes('kendi kalesine')
                  );
                  if (!isKK) return false;
                  const clean = (e.scorer || '')
                    .replace(/\(k\.?k\.?\)/gi, '')
                    .replace(/kendi kalesine/gi, '')
                    .trim()
                    .toLowerCase();
                  return clean === pNameLower;
                });

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

                      {/* KARTLAR - Sahadaki oyuncu dairesinin sol üstünde (Sarı, Yeşil, Kırmızı) */}
                      {playerCards.length > 0 && (
                        <div className="absolute -top-1.5 -left-1.5 flex items-center -space-x-1 z-30 pointer-events-none">
                          {playerCards.map((c, cIdx) => {
                            const isYellow = c.cardColor === 'Sarı';
                            const isGreen = c.cardColor === 'Yeşil';
                            const cardBg = isYellow 
                              ? 'bg-amber-400 border-amber-500 text-amber-950' 
                              : isGreen 
                                ? 'bg-emerald-500 border-emerald-400 text-white' 
                                : 'bg-rose-600 border-rose-500 text-white';
                            const cardEmoji = isYellow ? '🟨' : isGreen ? '🟩' : '🟥';
                            return (
                              <span
                                key={cIdx}
                                title={`${c.cardColor || 'Kart'} (${c.minute})`}
                                className={`w-3.5 h-4 md:w-4 md:h-5 rounded-[2px] border shadow-md flex items-center justify-center text-[7px] font-black ${cardBg}`}
                              >
                                <span className="scale-75 select-none">{cardEmoji}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* K.K. (Kendi Kalesine Gol) BADGE - Sahadaki oyuncu dairesinin sol altında */}
                      {playerKKEvents.length > 0 && (
                        <div 
                          className="absolute -bottom-1.5 -left-1.5 bg-red-700 text-white border border-white rounded-full px-1 py-0.2 text-[7px] font-black z-30 shadow leading-none select-none flex items-center gap-0.5"
                          title={`Kendi Kalesine Gol: ${playerKKEvents.map(e => e.minute).join(', ')}`}
                        >
                          <span>🥅</span>
                          <span>K.K.</span>
                        </div>
                      )}

                      {/* REYTİNG BADGE & ALTINDA KÜÇÜK YEŞİL / KIRMIZI OK */}
                      <div className="absolute -top-1 -right-1 flex flex-col items-center z-30 pointer-events-none">
                        <span className={`text-[8px] md:text-[9px] font-black px-1.5 py-0.5 rounded-full border shadow-md leading-none ${ratingBg}`}>
                          {rating.toFixed(1)}
                        </span>
                        {(isSubIn || isSubOut) && (
                          <div 
                            className="flex items-center gap-0.5 mt-0.5 bg-black/85 px-1 py-0.5 rounded-full border border-white/30 shadow-md text-[7px] md:text-[8px] font-black leading-none"
                            title={`${isSubIn ? `Giren Oyuncu (${subInMins})` : ''}${isSubIn && isSubOut ? ' | ' : ''}${isSubOut ? `Çıkan Oyuncu (${subOutMins})` : ''}`}
                          >
                            {isSubIn && (
                              <span className="text-emerald-400 font-extrabold flex items-center" title={`Oyuna Girdi: ${subInMins}`}>
                                ▲
                              </span>
                            )}
                            {isSubOut && (
                              <span className="text-rose-500 font-extrabold flex items-center" title={`Oyundan Çıktı: ${subOutMins}`}>
                                ▼
                              </span>
                            )}
                          </div>
                        )}
                      </div>
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
                      {(() => {
                        const result: Player[] = [];
                        const addedNames = new Set<string>();

                        // 1. All players in lineup assigned to activeLineupTeam for this match
                        Object.entries(lineup).forEach(([pName, pInfo]: any) => {
                          const matchTeam = resolvePlayerMatchTeam(pName, pInfo);
                          if (matchTeam === activeLineupTeam) {
                            const globalP = allGlobalPlayers.find(p => p.pname.toLowerCase().trim() === pName.toLowerCase().trim());
                            result.push(globalP || { pname: pName, pteam: activeLineupTeam === 'team1' ? match.team1 : match.team2, foto: '', goals: 0 });
                            addedNames.add(pName.toLowerCase().trim());
                          }
                        });

                        // 2. Current team players who have not been assigned to the opponent in this match
                        const baseTeamPlayers = activeLineupTeam === 'team1' ? team1Players : team2Players;
                        baseTeamPlayers.forEach(p => {
                          const pNameLower = p.pname.toLowerCase().trim();
                          if (!addedNames.has(pNameLower)) {
                            const pInfo = lineup[p.pname] || Object.entries(lineup).find(([k]) => k.toLowerCase().trim() === pNameLower)?.[1];
                            if (pInfo) {
                              const otherMatchTeam = resolvePlayerMatchTeam(p.pname, pInfo);
                              if (otherMatchTeam !== activeLineupTeam) return;
                            }
                            result.push(p);
                            addedNames.add(pNameLower);
                          }
                        });

                        return result;
                      })().map((player) => {
                        const playerLineup = lineup[player.pname];
                        const hasLineup = !!playerLineup;
                        const played = hasLineup && playerLineup.played;
                        const position = hasLineup ? playerLineup.position : '';
                        const rating = hasLineup ? Number(playerLineup.rating) : 0;

                        const pNameLower = player.pname.toLowerCase().trim();
                        const pCards = (match?.timeline || []).filter(e => e.type === 'card' && e.player?.toLowerCase().trim() === pNameLower);
                        const pSubIn = (match?.timeline || []).filter(e => e.type === 'sub' && e.subIn?.toLowerCase().trim() === pNameLower);
                        const pSubOut = (match?.timeline || []).filter(e => e.type === 'sub' && e.subOut?.toLowerCase().trim() === pNameLower);
                        const pKKGoals = (match?.timeline || []).filter(e => {
                          if (e.type !== 'goal') return false;
                          const isKK = Boolean(
                            e.isKK === true ||
                            (e.scorer || '').toLowerCase().includes('(k.k') ||
                            (e.scorer || '').toLowerCase().includes('(kk') ||
                            (e.scorer || '').toLowerCase().includes('kendi kalesine') ||
                            (e.assist || '').toLowerCase().includes('kendi kalesine')
                          );
                          if (!isKK) return false;
                          const clean = (e.scorer || '')
                            .replace(/\(k\.?k\.?\)/gi, '')
                            .replace(/kendi kalesine/gi, '')
                            .trim()
                            .toLowerCase();
                          return clean === pNameLower;
                        });

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
                                className="w-8 h-8 rounded-full object-cover border border-gray-200 shrink-0" 
                                alt={player.pname} 
                              />
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-black text-brand-dark uppercase block leading-none">{player.pname}</span>
                                  {pCards.map((c, cIdx) => (
                                    <span key={cIdx} title={`${c.cardColor} Kart (${c.minute})`} className="text-[10px] leading-none">
                                      {c.cardColor === 'Sarı' ? '🟨' : c.cardColor === 'Yeşil' ? '🟩' : '🟥'}
                                    </span>
                                  ))}
                                  {pSubIn.map((s, sIdx) => (
                                    <span key={`in-${sIdx}`} className="text-[8px] font-black text-emerald-800 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300">
                                      ▲ {s.minute}
                                    </span>
                                  ))}
                                  {pSubOut.map((s, sIdx) => (
                                    <span key={`out-${sIdx}`} className="text-[8px] font-black text-rose-800 bg-rose-100 px-1 py-0.2 rounded border border-rose-300">
                                      ▼ {s.minute}
                                    </span>
                                  ))}
                                  {pKKGoals.map((g, gIdx) => (
                                    <span key={`kk-${gIdx}`} className="text-[8px] font-black text-white bg-red-700 px-1.5 py-0.2 rounded-full border border-red-500 shadow-sm" title={`Kendi Kalesine Gol (${g.minute})`}>
                                      🥅 K.K. {g.minute}
                                    </span>
                                  ))}
                                </div>
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
                              {Object.keys(match?.lineup || {}).length > 0 && (
                                <optgroup label="📋 Bu Maçın Kadrosundaki Oyuncular">
                                  {Object.keys(match?.lineup || {}).map((pName) => (
                                    <option key={`lineup-${pName}`} value={pName}>
                                      {pName} ({match?.lineup?.[pName]?.rating ? `⭐ ${match?.lineup?.[pName]?.rating}` : ''} - {resolvePlayerMatchTeam(pName, match?.lineup?.[pName]) === 'team2' ? match.team2 : match.team1})
                                    </option>
                                  ))}
                                </optgroup>
                              )}
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
                              <optgroup label="Tüm Diğer Oyuncular (Eski / Transfer / Takımsız)">
                                {allGlobalPlayers
                                  .filter(p => !team1Players.some(t1 => t1.pname === p.pname) && !team2Players.some(t2 => t2.pname === p.pname) && !Object.keys(match?.lineup || {}).includes(p.pname))
                                  .map(p => (
                                    <option key={p.pname} value={p.pname}>{p.pname} ({p.pteam || 'Takımsız'})</option>
                                  ))
                                }
                              </optgroup>
                            </select>
                          </div>

                          {selectedLineupPlayer && (
                            <div className="space-y-4">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] font-black text-gray-400 uppercase">Bu Maçtaki Takımı (Maçlık Takımda Kalma)</label>
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setLineupTeam('team1')}
                                    className={`py-2 px-2 rounded-lg font-black text-xs uppercase tracking-wider transition-colors cursor-pointer border ${
                                      lineupTeam === 'team1' 
                                        ? 'bg-brand-maroon text-brand-gold border-black shadow-sm' 
                                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                    }`}
                                  >
                                    🏠 {match.team1} (T1)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setLineupTeam('team2')}
                                    className={`py-2 px-2 rounded-lg font-black text-xs uppercase tracking-wider transition-colors cursor-pointer border ${
                                      lineupTeam === 'team2' 
                                        ? 'bg-brand-maroon text-brand-gold border-black shadow-sm' 
                                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                    }`}
                                  >
                                    🚀 {match.team2} (T2)
                                  </button>
                                </div>
                              </div>
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

            {toast && (
              <div 
                className={`mb-4 p-2.5 rounded-lg border text-xs font-bold flex items-center justify-between animate-fade-in ${
                  toast.type === 'error'
                    ? 'bg-rose-50 border-rose-300 text-rose-800'
                    : toast.type === 'info'
                    ? 'bg-sky-50 border-sky-300 text-sky-800'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                }`}
              >
                <span>{toast.type === 'error' ? '⚠️' : '✅'} {toast.message}</span>
                <button type="button" onClick={() => setToast(null)} className="text-gray-400 hover:text-black font-bold ml-2">✕</button>
              </div>
            )}

            {/* Admin sub-tabs */}
            <div className="flex gap-1 border-b border-gray-300 pb-2 mb-4 overflow-x-auto">
              {(['goal', 'period', 'card', 'sub', 'incident', 'date', 'mvp', 'loan'] as TabType[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveAdminTab(tab)}
                  className={`py-1.5 px-3 rounded text-[9px] font-black uppercase tracking-wider shrink-0 ${activeAdminTab === tab ? 'bg-brand-maroon text-brand-gold' : 'bg-white border border-gray-300 text-gray-500'}`}
                >
                  {tab === 'goal' ? '⚽ Gol GİR' : tab === 'period' ? '⏱ Devre/Tur' : tab === 'card' ? '🟨 Kart GİR' : tab === 'sub' ? '🔄 Değişiklik GİR' : tab === 'incident' ? '⚠️ Olay/İptal GİR' : tab === 'date' ? '📅 Tarih' : tab === 'mvp' ? '🏆 MVP' : '🔄 Kiralık Ekle'}
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

                <div className="flex items-center justify-between bg-red-50 p-2.5 rounded-xl border border-red-200 select-none">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🥅</span>
                    <div>
                      <span className="text-xs font-black text-red-800 block">Kendi Kalesine Gol (K.K.)</span>
                      <span className="text-[9px] font-bold text-red-600 block">Kendi kalesine atılan goller istatistiğine işlenir</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isKKGoal}
                    onChange={(e) => setIsKKGoal(e.target.checked)}
                    className="w-5 h-5 accent-red-600 cursor-pointer"
                  />
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
                      <option value="Sarı">🟨 Sarı Kart</option>
                      <option value="Yeşil">🟩 Yeşil Kart</option>
                      <option value="Kırmızı">🟥 Kırmızı Kart</option>
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

            {/* Substitution Form Panel */}
            {activeAdminTab === 'sub' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 bg-white/50 p-2 rounded-xl border border-gray-200">
                  <button 
                    type="button"
                    onClick={() => setSelectedSubTeam('team1')} 
                    className={`py-2 rounded-lg font-black text-xs border-2 ${selectedSubTeam === 'team1' ? 'border-brand-maroon bg-white text-brand-maroon shadow-sm' : 'border-transparent text-gray-500'}`}
                  >
                    T1: {team1Name}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setSelectedSubTeam('team2')} 
                    className={`py-2 rounded-lg font-black text-xs border-2 ${selectedSubTeam === 'team2' ? 'border-brand-maroon bg-white text-brand-maroon shadow-sm' : 'border-transparent text-gray-500'}`}
                  >
                    T2: {team2Name}
                  </button>
                </div>

                {/* Çıkan Oyuncu (Giden) */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-rose-600 uppercase">🔻 Çıkan (Giden) Oyuncu</label>
                    <span className="text-[9px] text-gray-400 font-bold">(İsteğe Bağlı)</span>
                  </div>
                  <select 
                    value={selectedSubOut}
                    onChange={(e) => setSelectedSubOut(e.target.value)}
                    className="w-full bg-white border border-rose-200 focus:border-rose-500 rounded p-2 text-xs font-bold text-gray-800"
                  >
                    <option value="">-- Çıkan Oyuncu Yok / Seçilmedi --</option>
                    {(() => {
                      const teamNameCurrent = selectedSubTeam === 'team1' ? team1Name : team2Name;
                      const basePlayers = selectedSubTeam === 'team1' ? team1Players : team2Players;
                      const lineupPlayers = Object.entries(match?.lineup || {})
                        .filter(([pName, info]: any) => resolvePlayerMatchTeam(pName, info) === selectedSubTeam)
                        .map(([pname]) => pname);

                      const seen = new Set<string>();
                      const teamOptions: { name: string; tag: string }[] = [];

                      lineupPlayers.forEach(pName => {
                        if (!seen.has(pName.toLowerCase().trim())) {
                          seen.add(pName.toLowerCase().trim());
                          teamOptions.push({ name: pName, tag: 'Maç Kadrosu' });
                        }
                      });

                      basePlayers.forEach(p => {
                        if (!seen.has(p.pname.toLowerCase().trim())) {
                          seen.add(p.pname.toLowerCase().trim());
                          teamOptions.push({ name: p.pname, tag: p.pteam === teamNameCurrent ? 'Asil' : 'Kiralık' });
                        }
                      });

                      const otherOptions: { name: string; tag: string }[] = [];
                      allGlobalPlayers.forEach(p => {
                        if (!seen.has(p.pname.toLowerCase().trim())) {
                          seen.add(p.pname.toLowerCase().trim());
                          otherOptions.push({ name: p.pname, tag: p.pteam || 'Takımsız' });
                        }
                      });

                      return (
                        <>
                          <optgroup label={`${teamNameCurrent} Kadrosu`}>
                            {teamOptions.map((opt, idx) => (
                              <option key={`out-t-${idx}`} value={opt.name}>
                                {opt.name} ({opt.tag})
                              </option>
                            ))}
                          </optgroup>
                          {otherOptions.length > 0 && (
                            <optgroup label="Tüm Diğer Oyuncular (Transfer / Takımsız)">
                              {otherOptions.map((opt, idx) => (
                                <option key={`out-o-${idx}`} value={opt.name}>
                                  {opt.name} ({opt.tag})
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      );
                    })()}
                  </select>
                </div>

                {/* Giren Oyuncu */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-emerald-700 uppercase">▲ Giren Oyuncu</label>
                    <span className="text-[9px] text-gray-400 font-bold">(İsteğe Bağlı)</span>
                  </div>
                  <select 
                    value={selectedSubIn}
                    onChange={(e) => setSelectedSubIn(e.target.value)}
                    className="w-full bg-white border border-emerald-200 focus:border-emerald-500 rounded p-2 text-xs font-bold text-gray-800"
                  >
                    <option value="">-- Giren Oyuncu Yok / Seçilmedi --</option>
                    {(() => {
                      const teamNameCurrent = selectedSubTeam === 'team1' ? team1Name : team2Name;
                      const basePlayers = selectedSubTeam === 'team1' ? team1Players : team2Players;
                      const lineupPlayers = Object.entries(match?.lineup || {})
                        .filter(([pName, info]: any) => resolvePlayerMatchTeam(pName, info) === selectedSubTeam)
                        .map(([pname]) => pname);

                      const seen = new Set<string>();
                      const teamOptions: { name: string; tag: string }[] = [];

                      lineupPlayers.forEach(pName => {
                        if (!seen.has(pName.toLowerCase().trim())) {
                          seen.add(pName.toLowerCase().trim());
                          teamOptions.push({ name: pName, tag: 'Maç Kadrosu' });
                        }
                      });

                      basePlayers.forEach(p => {
                        if (!seen.has(p.pname.toLowerCase().trim())) {
                          seen.add(p.pname.toLowerCase().trim());
                          teamOptions.push({ name: p.pname, tag: p.pteam === teamNameCurrent ? 'Asil' : 'Kiralık' });
                        }
                      });

                      const otherOptions: { name: string; tag: string }[] = [];
                      allGlobalPlayers.forEach(p => {
                        if (!seen.has(p.pname.toLowerCase().trim())) {
                          seen.add(p.pname.toLowerCase().trim());
                          otherOptions.push({ name: p.pname, tag: p.pteam || 'Takımsız' });
                        }
                      });

                      return (
                        <>
                          <optgroup label={`${teamNameCurrent} Kadrosu`}>
                            {teamOptions.map((opt, idx) => (
                              <option key={`in-t-${idx}`} value={opt.name}>
                                {opt.name} ({opt.tag})
                              </option>
                            ))}
                          </optgroup>
                          {otherOptions.length > 0 && (
                            <optgroup label="Tüm Diğer Oyuncular (Transfer / Takımsız)">
                              {otherOptions.map((opt, idx) => (
                                <option key={`in-o-${idx}`} value={opt.name}>
                                  {opt.name} ({opt.tag})
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      );
                    })()}
                  </select>
                </div>

                {/* Dakika */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500">⏱ Dakika</label>
                  <input 
                    type="text" 
                    placeholder="Örn: 65 veya 65'" 
                    value={subMinute} 
                    onChange={(e) => setSubMinute(e.target.value)} 
                    className="w-full bg-white border border-gray-300 rounded p-2 text-xs font-bold" 
                  />
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[10px] text-amber-900 font-bold leading-relaxed">
                  💡 İkisini de girmek zorunlu değildir. Sadece çıkan (örn. sakatlık/ihraç) veya sadece oyuna dahil olan oyuncu girilebilir.
                </div>

                <button 
                  type="button"
                  onClick={handleAddSub} 
                  className="w-full py-2.5 bg-brand-maroon hover:bg-[#600000] text-brand-gold font-black rounded-lg text-xs tracking-wider uppercase shadow cursor-pointer transition-colors"
                >
                  🔄 OYUNCU DEĞİŞİKLİĞİNİ KAYDET
                </button>
              </div>
            )}

            {/* Dakikada Özel Olay (Gol İptali, VAR vb.) Ekleme Formu */}
            {activeAdminTab === 'incident' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Taraf / Takım Seçimi</label>
                  <div className="grid grid-cols-3 gap-2 bg-white/50 p-1.5 rounded-xl border border-gray-200">
                    <button
                      type="button"
                      onClick={() => setSelectedIncidentTeam('team1')}
                      className={`py-1.5 rounded-lg font-black text-[10px] truncate border-2 ${selectedIncidentTeam === 'team1' ? 'border-brand-maroon bg-white text-brand-maroon' : 'border-transparent text-gray-500'}`}
                    >
                      {team1Name}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIncidentTeam('general')}
                      className={`py-1.5 rounded-lg font-black text-[10px] truncate border-2 ${selectedIncidentTeam === 'general' ? 'border-brand-maroon bg-white text-brand-maroon' : 'border-transparent text-gray-500'}`}
                    >
                      Genel / Ortak
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIncidentTeam('team2')}
                      className={`py-1.5 rounded-lg font-black text-[10px] truncate border-2 ${selectedIncidentTeam === 'team2' ? 'border-brand-maroon bg-white text-brand-maroon' : 'border-transparent text-gray-500'}`}
                    >
                      {team2Name}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">⏱ Olay Dakikası</label>
                  <input
                    type="text"
                    placeholder="Örn: 34 veya 45+2"
                    value={incidentMinute}
                    onChange={(e) => setIncidentMinute(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded p-2 text-xs font-bold"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">⚠️ Olay Açıklaması / Detayı</label>
                  <input
                    type="text"
                    placeholder="Örn: Gol İptal Edildi (Ofsayt / VAR) veya Penaltı Kaçtı"
                    value={incidentText}
                    onChange={(e) => setIncidentText(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded p-2 text-xs font-bold"
                  />
                  <div className="flex flex-wrap gap-1 mt-1">
                    {[
                      'Gol İptal Edildi (VAR)',
                      'Gol İptal Edildi (Ofsayt)',
                      'Gol İptal Edildi (Faul)',
                      'Penaltı Kaçtı',
                      'Direkten Döndü',
                      'VAR Kontrolü'
                    ].map((sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => setIncidentText(sample)}
                        className="text-[9px] font-bold bg-white hover:bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-300 cursor-pointer"
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddIncident}
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-lg text-xs tracking-wider uppercase shadow cursor-pointer transition-colors"
                >
                  ⚠️ MAÇ OLAYINI KAYDET
                </button>
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
                      showToast('Lütfen kiralık eklenecek bir oyuncu seçin veya ismini yazın!', 'error');
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

                      showToast(`${pName} oyuncusu ${targetTeamName} kadrosuna kiralık eklendi!`, 'success');
                      
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
                      showToast('Kiralık oyuncu eklenirken bir hata oluştu.', 'error');
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
                      const cEmoji = e.cardColor === 'Sarı' ? '🟨' : e.cardColor === 'Yeşil' ? '🟩' : '🟥';
                      desc = `${cEmoji} [${e.minute}] ${e.player} (${e.cardColor || 'Sarı'} Kart)`;
                    } else if (e.type === 'sub') {
                      const parts = [];
                      if (e.subIn) parts.push(`▲ Giren: ${e.subIn}`);
                      if (e.subOut) parts.push(`▼ Çıkan: ${e.subOut}`);
                      desc = `🔄 [${e.minute}] ${parts.join(' | ') || 'Değişiklik'}`;
                    } else if (e.type === 'incident') {
                      desc = `⚠️ [${e.minute}] ${e.text}`;
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
