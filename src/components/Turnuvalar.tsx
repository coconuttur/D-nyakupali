import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { collection, onSnapshot, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Team, UserProfile, Match, Player, MatchTimelineEvent } from '../types';
import WorldCup from './WorldCup';
import { recalculateStandings, recalculatePlayerStats } from '../lib/standings';

interface TurnuvalarProps {
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
  currentUser?: UserProfile | null;
}

type CupType = 'wpc' | 'bcl' | 'bel' | 'becl' | 'wc';

import {
  DEFAULT_TOURNAMENT_MATCHES,
  PURGED_SEASON_4_MATCH_IDS,
  getDeletedTournamentMatchIds,
  addDeletedTournamentMatchId,
  getStoredTournamentMatches,
  saveStoredTournamentMatch,
  removeStoredTournamentMatch,
  getStoredBracketData,
  saveStoredBracketData,
  normalizeCupKey,
  getTournamentInfo,
  mergeTournamentMatches,
  normalizeTeamName
} from '../lib/tournamentMatches';
import { calculateMatchScore, getMatchMultiplier } from '../lib/elo';

// Compatibility aliases
const getStoredMatches = getStoredTournamentMatches;
const saveStoredMatch = saveStoredTournamentMatch;
const removeStoredMatch = removeStoredTournamentMatch;

export const isSameTeam = (t1?: string, t2?: string): boolean => {
  if (!t1 || !t2) return false;
  const s1 = normalizeTeamName(t1).toLowerCase().trim();
  const s2 = normalizeTeamName(t2).toLowerCase().trim();
  return s1 === s2;
};

export const isMatchBetweenTeams = (m?: Match | null, teamA?: string, teamB?: string): boolean => {
  if (!m || !teamA || !teamB) return false;
  return (
    (isSameTeam(m.team1, teamA) && isSameTeam(m.team2, teamB)) ||
    (isSameTeam(m.team1, teamB) && isSameTeam(m.team2, teamA))
  );
};

export const getWinnerOfMatch = (m?: Match | null): string => {
  if (!m || !m.played) return '';
  const s1 = Number(m.score1) || 0;
  const s2 = Number(m.score2) || 0;
  if (s1 > s2) return m.team1;
  if (s2 > s1) return m.team2;
  if ((m as any).penaltyWinner) return (m as any).penaltyWinner;
  return m.team1;
};

export const resolveMatchRound = (
  m: Match,
  cupFilter: 'bcl' | 'bel' | 'becl' | 'wpc',
  activeSeason: number = 5,
  bracketData: Record<string, string> = {}
): { roundKey: 'semi1' | 'semi2' | 'final' | string; roundTitle: string } => {
  const r = String((m as any).round || '').toLowerCase().trim();
  const h = String(m.hafta || '').toLowerCase().trim();

  // WPC Quarter Finals (2 Legs)
  if (r === 'wpc_qf1_1' || r === 'qf1_1' || h.includes('çeyrek final 1 (1') || h.includes('ceyrek final 1 (1')) return { roundKey: 'wpc_qf1_1', roundTitle: '⚔️ Çeyrek Final 1 (1. Maç)' };
  if (r === 'wpc_qf1_2' || r === 'qf1_2' || h.includes('çeyrek final 1 (r') || h.includes('ceyrek final 1 (r') || h.includes('çeyrek final 1 (2') || h.includes('ceyrek final 1 (2')) return { roundKey: 'wpc_qf1_2', roundTitle: '⚔️ Çeyrek Final 1 (Rövanş)' };
  if (r === 'wpc_qf2_1' || r === 'qf2_1' || h.includes('çeyrek final 2 (1') || h.includes('ceyrek final 2 (1')) return { roundKey: 'wpc_qf2_1', roundTitle: '⚔️ Çeyrek Final 2 (1. Maç)' };
  if (r === 'wpc_qf2_2' || r === 'qf2_2' || h.includes('çeyrek final 2 (r') || h.includes('ceyrek final 2 (r') || h.includes('çeyrek final 2 (2') || h.includes('ceyrek final 2 (2')) return { roundKey: 'wpc_qf2_2', roundTitle: '⚔️ Çeyrek Final 2 (Rövanş)' };
  if (r === 'wpc_qf3_1' || r === 'qf3_1' || h.includes('çeyrek final 3 (1') || h.includes('ceyrek final 3 (1')) return { roundKey: 'wpc_qf3_1', roundTitle: '⚔️ Çeyrek Final 3 (1. Maç)' };
  if (r === 'wpc_qf3_2' || r === 'qf3_2' || h.includes('çeyrek final 3 (r') || h.includes('ceyrek final 3 (r') || h.includes('çeyrek final 3 (2') || h.includes('ceyrek final 3 (2')) return { roundKey: 'wpc_qf3_2', roundTitle: '⚔️ Çeyrek Final 3 (Rövanş)' };
  if (r === 'wpc_qf4_1' || r === 'qf4_1' || h.includes('çeyrek final 4 (1') || h.includes('ceyrek final 4 (1')) return { roundKey: 'wpc_qf4_1', roundTitle: '⚔️ Çeyrek Final 4 (1. Maç)' };
  if (r === 'wpc_qf4_2' || r === 'qf4_2' || h.includes('çeyrek final 4 (r') || h.includes('ceyrek final 4 (r') || h.includes('çeyrek final 4 (2') || h.includes('ceyrek final 4 (2')) return { roundKey: 'wpc_qf4_2', roundTitle: '⚔️ Çeyrek Final 4 (Rövanş)' };

  // WPC Semi Finals (2 Legs)
  if (r === 'wpc_sf1_1' || r === 'sf1_1' || h.includes('wpc yarı final 1 (1') || h.includes('yarı final 1 (1') || h.includes('yari final 1 (1')) return { roundKey: 'wpc_sf1_1', roundTitle: '⚔️ Yarı Final 1 (1. Maç)' };
  if (r === 'wpc_sf1_2' || r === 'sf1_2' || h.includes('wpc yarı final 1 (r') || h.includes('yarı final 1 (r') || h.includes('yari final 1 (r') || h.includes('yarı final 1 (2') || h.includes('yari final 1 (2')) return { roundKey: 'wpc_sf1_2', roundTitle: '⚔️ Yarı Final 1 (Rövanş)' };
  if (r === 'wpc_sf2_1' || r === 'sf2_1' || h.includes('wpc yarı final 2 (1') || h.includes('yarı final 2 (1') || h.includes('yari final 2 (1')) return { roundKey: 'wpc_sf2_1', roundTitle: '⚔️ Yarı Final 2 (1. Maç)' };
  if (r === 'wpc_sf2_2' || r === 'sf2_2' || h.includes('wpc yarı final 2 (r') || h.includes('yarı final 2 (r') || h.includes('yari final 2 (r') || h.includes('yarı final 2 (2') || h.includes('yari final 2 (2')) return { roundKey: 'wpc_sf2_2', roundTitle: '⚔️ Yarı Final 2 (Rövanş)' };

  // WPC Groups
  if (r === 'groupa' || h.includes('a grubu')) return { roundKey: 'groupA', roundTitle: 'A Grubu' };
  if (r === 'groupb' || h.includes('b grubu')) return { roundKey: 'groupB', roundTitle: 'B Grubu' };

  if (r === 'semi1' || h.includes('yarı final 1') || h.includes('semi 1') || h === 'yf1') {
    return { roundKey: 'semi1', roundTitle: '⚔️ Yarı Final 1' };
  }
  if (r === 'semi2' || h.includes('yarı final 2') || h.includes('semi 2') || h === 'yf2') {
    return { roundKey: 'semi2', roundTitle: '⚔️ Yarı Final 2' };
  }
  if (r === 'final' || r === 'wpc_final' || h.includes('büyük final') || (h === 'final' && !h.includes('yarı') && !h.includes('semi'))) {
    return { roundKey: 'final', roundTitle: '🏆 Büyük Final' };
  }

  // Bracket slot matching
  const cup = normalizeCupKey(m.category, m.hafta) || cupFilter;
  if (cup !== 'wpc') {
    const s = Number((m as any).season) || activeSeason || 5;
    const p = `${cup}${s}`;

    const s1T1 = bracketData[`${p}s1`];
    const s1T2 = bracketData[`${p}s2`];
    if (s1T1 && s1T2 && isMatchBetweenTeams(m, s1T1, s1T2)) {
      return { roundKey: 'semi1', roundTitle: '⚔️ Yarı Final 1' };
    }

    const s2T1 = bracketData[`${p}s3`];
    const s2T2 = bracketData[`${p}s4`];
    if (s2T1 && s2T2 && isMatchBetweenTeams(m, s2T1, s2T2)) {
      return { roundKey: 'semi2', roundTitle: '⚔️ Yarı Final 2' };
    }

    const finT1 = bracketData[`${p}s5`];
    const finT2 = bracketData[`${p}s6`];
    if (finT1 && finT2 && isMatchBetweenTeams(m, finT1, finT2)) {
      return { roundKey: 'final', roundTitle: '🏆 Büyük Final' };
    }
  }

  return { 
    roundKey: (m as any).round || 'semi1', 
    roundTitle: (m as any).roundLabel || m.hafta || (m as any).round || 'Turnuva Maçı' 
  };
};

export default function Turnuvalar({ currentLang, translations, onNavigate, teamLogos, currentUser }: TurnuvalarProps) {
  const [activeCup, setActiveCup] = useState<CupType>('wpc');
  const [bclSeason, setBclSeason] = useState<4 | 5>(5);
  const [belSeason, setBelSeason] = useState<4 | 5>(5);
  const [beclSeason, setBeclSeason] = useState<4 | 5>(5);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [bracketData, setBracketData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Add Match Modal state
  const [addMatchModalOpen, setAddMatchModalOpen] = useState(false);
  const [modalCup, setModalCup] = useState<'wpc' | 'bcl' | 'bel' | 'becl'>('bcl');
  const [modalSeason, setModalSeason] = useState<number>(5);
  const [modalRound, setModalRound] = useState<string>('semi1');
  const [modalTeam1, setModalTeam1] = useState<string>('');
  const [modalTeam2, setModalTeam2] = useState<string>('');
  const [modalDate, setModalDate] = useState<string>('');
  const [modalScore1, setModalScore1] = useState<string>('0');
  const [modalScore2, setModalScore2] = useState<string>('0');
  const [modalPlayed, setModalPlayed] = useState<boolean>(false);
  const [savingMatch, setSavingMatch] = useState<boolean>(false);

  // Quick Score / Result Modal state (allows instant score entry on any bracket card)
  const [quickScoreModalOpen, setQuickScoreModalOpen] = useState(false);
  const [qsMatch, setQsMatch] = useState<Match | null>(null);
  const [qsCupTag, setQsCupTag] = useState<'bcl' | 'bel' | 'becl' | 'wpc'>('bcl');
  const [qsSeason, setQsSeason] = useState<number>(5);
  const [qsRoundKey, setQsRoundKey] = useState<string>('semi1');
  const [qsRoundTitle, setQsRoundTitle] = useState<string>('');
  const [qsTeam1, setQsTeam1] = useState<string>('');
  const [qsTeam2, setQsTeam2] = useState<string>('');
  const [qsScore1, setQsScore1] = useState<string>('0');
  const [qsScore2, setQsScore2] = useState<string>('0');
  const [qsPlayed, setQsPlayed] = useState<boolean>(true);
  const [qsDate, setQsDate] = useState<string>('');
  const [qsPenaltyWinner, setQsPenaltyWinner] = useState<string>('');
  const [qsMvp, setQsMvp] = useState<string>('');
  const [qsMvpRating, setQsMvpRating] = useState<string>('7.5');
  const [qsTeam1Goals, setQsTeam1Goals] = useState<{ scorer: string; assist: string }[]>([]);
  const [qsTeam2Goals, setQsTeam2Goals] = useState<{ scorer: string; assist: string }[]>([]);
  const [savingQuickScore, setSavingQuickScore] = useState<boolean>(false);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);

  // Change Teams Modal state
  const [changeTeamsModalOpen, setChangeTeamsModalOpen] = useState(false);
  const [ctCupTag, setCtCupTag] = useState<'bcl' | 'bel' | 'becl' | 'wpc'>('bcl');
  const [ctSeason, setCtSeason] = useState<number>(5);
  const [ctRoundKey, setCtRoundKey] = useState<string>('semi1');
  const [ctRoundTitle, setCtRoundTitle] = useState<string>('');
  const [ctSlotAKey, setCtSlotAKey] = useState<string>('');
  const [ctSlotBKey, setCtSlotBKey] = useState<string>('');
  const [ctTeam1, setCtTeam1] = useState<string>('');
  const [ctTeam2, setCtTeam2] = useState<string>('');
  const [ctMatch, setCtMatch] = useState<Match | null>(null);
  const [savingTeams, setSavingTeams] = useState<boolean>(false);

  useEffect(() => {
    // 0. Load locally saved bracket data
    const localBracket = getStoredBracketData();
    if (Object.keys(localBracket).length > 0) {
      setBracketData((prev) => ({ ...prev, ...localBracket }));
    }

    // 1. Fetch Teams
    const unsubTeams = onSnapshot(collection(db, 'teams'), (snap) => {
      const list: Team[] = [];
      snap.forEach((doc) => {
        list.push({ name: doc.id, ...doc.data() } as Team);
      });
      setTeams(list);
      setLoading(false);
    });

    // 2. Fetch brackets document
    const unsubBrackets = onSnapshot(doc(db, 'brackets', 'data'), (docSnap) => {
      const local = getStoredBracketData();
      if (docSnap.exists()) {
        setBracketData({ ...local, ...(docSnap.data() as Record<string, string>) });
      } else if (Object.keys(local).length > 0) {
        setBracketData(local);
      }
    });

    // 3. Fetch Matches and merge with local custom matches (respecting deleted tombstones)
    const unsubMatches = onSnapshot(collection(db, 'matches'), (snap) => {
      const deletedIds = getDeletedTournamentMatchIds();
      const mList: Match[] = [];
      snap.forEach((d) => {
        if (!deletedIds.has(d.id) && !PURGED_SEASON_4_MATCH_IDS.includes(d.id)) {
          mList.push({ id: d.id, ...d.data() } as Match);
        }
      });
      const localM = getStoredMatches();
      localM.forEach((lm) => {
        if (deletedIds.has(lm.id) || PURGED_SEASON_4_MATCH_IDS.includes(lm.id)) return;
        const existingIdx = mList.findIndex((m) => m.id === lm.id);
        if (existingIdx >= 0) {
          if ((Number(lm.datejav) || 0) >= (Number(mList[existingIdx].datejav) || 0)) {
            mList[existingIdx] = lm;
          }
        } else {
          mList.push(lm);
        }
      });
      setMatches(mList);
    });

    // 4. Fetch Players for MVP selection
    const unsubPlayers = onSnapshot(collection(db, 'players'), (pSnap) => {
      const pList: Player[] = [];
      pSnap.forEach((d) => {
        pList.push({ id: d.id, docId: d.id, ...d.data() } as unknown as Player);
      });
      setAllPlayers(pList);
    });

    return () => {
      unsubTeams();
      unsubBrackets();
      unsubMatches();
      unsubPlayers();
    };
  }, []);

  // Check admin status
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

  const t = translations[currentLang];

  // Merge default tournament matches with real matches from Firestore & local edits
  const allTournamentMatches = useMemo(() => {
    return mergeTournamentMatches(matches);
  }, [matches]);

  // Synchronize bracket progression automatically whenever matches update
  useEffect(() => {
    const cups: ('bcl' | 'bel' | 'becl')[] = ['bcl', 'bel', 'becl'];
    const seasons: (4 | 5)[] = [4, 5];
    const pendingUpdates: Record<string, string> = {};
    const matchesToUpdate: Match[] = [];

    cups.forEach((cup) => {
      seasons.forEach((season) => {
        const p = `${cup}${season}`;
        const sMatches = allTournamentMatches.filter(m => {
          const cat = String(m.category || '').toUpperCase();
          const hStr = String(m.hafta || '').toUpperCase();
          const mSeason = Number((m as any).season);
          const matchesCup = 
            (cup === 'bcl' && (cat.includes('BCL') || cat.includes('UCL') || hStr.includes('BCL') || hStr.includes('UCL'))) ||
            (cup === 'bel' && (cat.includes('BEL') || cat.includes('UEL') || hStr.includes('BEL') || hStr.includes('UEL'))) ||
            (cup === 'becl' && (cat.includes('BECL') || cat.includes('UECL') || hStr.includes('BECL') || hStr.includes('UECL')));
          if (!matchesCup) return false;
          return mSeason ? mSeason === season : season === 5;
        });

        if (sMatches.length === 0) return;

        const s1SlotT1 = bracketData[`${p}s1`];
        const s1SlotT2 = bracketData[`${p}s2`];
        const s2SlotT1 = bracketData[`${p}s3`];
        const s2SlotT2 = bracketData[`${p}s4`];

        // Find Semi 1 match
        const s1Match = sMatches.find(m => {
          const r = String((m as any).round || '').toLowerCase();
          const h = String(m.hafta || '').toLowerCase();
          if (r === 'semi1' || h.includes('yarı final 1') || h.includes('semi 1') || h === 'yf1') return true;
          if (s1SlotT1 && s1SlotT2 && isMatchBetweenTeams(m, s1SlotT1, s1SlotT2) && r !== 'semi2' && r !== 'final' && !h.includes('yarı final 2') && !h.includes('büyük final')) return true;
          return false;
        });

        // Find Semi 2 match
        const s2Match = sMatches.find(m => {
          const r = String((m as any).round || '').toLowerCase();
          const h = String(m.hafta || '').toLowerCase();
          if (r === 'semi2' || h.includes('yarı final 2') || h.includes('semi 2') || h === 'yf2') return true;
          if (s2SlotT1 && s2SlotT2 && isMatchBetweenTeams(m, s2SlotT1, s2SlotT2) && r !== 'semi1' && r !== 'final' && !h.includes('yarı final 1') && !h.includes('büyük final')) return true;
          return false;
        });

        let w1 = '';
        if (s1Match) {
          if ((s1Match as any).round !== 'semi1') {
            matchesToUpdate.push({ ...s1Match, round: 'semi1', hafta: 'Yarı Final 1' });
          }
          if (!bracketData[`${p}s1`] && s1Match.team1) pendingUpdates[`${p}s1`] = s1Match.team1;
          if (!bracketData[`${p}s2`] && s1Match.team2) pendingUpdates[`${p}s2`] = s1Match.team2;
          if (s1Match.played) {
            w1 = getWinnerOfMatch(s1Match);
            if (w1 && bracketData[`${p}s5`] !== w1) {
              pendingUpdates[`${p}s5`] = w1;
            }
          }
        }

        let w2 = '';
        if (s2Match) {
          if ((s2Match as any).round !== 'semi2') {
            matchesToUpdate.push({ ...s2Match, round: 'semi2', hafta: 'Yarı Final 2' });
          }
          if (!bracketData[`${p}s3`] && s2Match.team1) pendingUpdates[`${p}s3`] = s2Match.team1;
          if (!bracketData[`${p}s4`] && s2Match.team2) pendingUpdates[`${p}s4`] = s2Match.team2;
          if (s2Match.played) {
            w2 = getWinnerOfMatch(s2Match);
            if (w2 && bracketData[`${p}s6`] !== w2) {
              pendingUpdates[`${p}s6`] = w2;
            }
          }
        }

        const finT1 = w1 || bracketData[`${p}s5`] || pendingUpdates[`${p}s5`];
        const finT2 = w2 || bracketData[`${p}s6`] || pendingUpdates[`${p}s6`];

        const fMatch = sMatches.find(m => {
          const r = String((m as any).round || '').toLowerCase();
          const h = String(m.hafta || '').toLowerCase();
          if (r === 'final' || h.includes('büyük final') || (h === 'final' && !h.includes('yarı') && !h.includes('semi'))) return true;
          if (finT1 && finT2 && isMatchBetweenTeams(m, finT1, finT2) && r !== 'semi1' && r !== 'semi2' && !h.includes('yarı') && !h.includes('semi')) return true;
          return false;
        });

        if (fMatch) {
          if ((fMatch as any).round !== 'final') {
            matchesToUpdate.push({ ...fMatch, round: 'final', hafta: 'Büyük Final' });
          }
          if (fMatch.played) {
            const champ = getWinnerOfMatch(fMatch);
            if (champ && bracketData[`${p}s7`] !== champ) {
              pendingUpdates[`${p}s7`] = champ;
            }
          }
        }
      });
    });

    if (Object.keys(pendingUpdates).length > 0) {
      setBracketData(prev => ({ ...prev, ...pendingUpdates }));
      saveStoredBracketData(pendingUpdates);
      setDoc(doc(db, 'brackets', 'data'), pendingUpdates, { merge: true }).catch(() => {});
    }

    if (matchesToUpdate.length > 0) {
      matchesToUpdate.forEach(um => {
        saveStoredTournamentMatch(um);
        if (um.id) {
          setDoc(doc(db, 'matches', um.id), um, { merge: true }).catch(() => {});
        }
      });
    }
  }, [allTournamentMatches]);

  // Helper to open Add Match modal with optional pre-filled teams
  const handleOpenAddMatch = (
    cup: 'wpc' | 'bcl' | 'bel' | 'becl', 
    season?: number, 
    round?: string,
    defaultT1?: string,
    defaultT2?: string
  ) => {
    setModalCup(cup);
    const activeS = season || (cup === 'bcl' ? bclSeason : cup === 'bel' ? belSeason : cup === 'becl' ? beclSeason : 5);
    setModalSeason(activeS);
    setModalRound(round || (cup === 'wpc' ? 'groupA' : 'semi1'));
    if (defaultT1 && defaultT2) {
      setModalTeam1(defaultT1);
      setModalTeam2(defaultT2);
    } else if (teams.length > 0) {
      setModalTeam1(teams[0].name);
      setModalTeam2(teams.length > 1 ? teams[1].name : teams[0].name);
    }
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    setModalDate(`${day}.${month}.${year}`);
    setModalScore1('0');
    setModalScore2('0');
    setModalPlayed(false);
    setAddMatchModalOpen(true);
  };

  // Helper to delete tournament match
  const handleDeleteMatch = async (matchDocId: string) => {
    if (!window.confirm('Bu turnuva maçını silmek istediğinizden emin misiniz?')) return;
    try {
      // Optimistic delete and permanent tombstone registration
      addDeletedTournamentMatchId(matchDocId);
      setMatches(prev => prev.filter(m => m.id !== matchDocId));
      removeStoredMatch(matchDocId);
      await deleteDoc(doc(db, 'matches', matchDocId));
      setToastMessage('🗑️ Maç silindi.');
    } catch (err: any) {
      console.warn("Delete notice:", err);
      setToastMessage('🗑️ Maç silindi.');
    }
  };

  // Helper to save new tournament match
  const handleSaveNewMatch = async () => {
    if (!modalTeam1 || !modalTeam2) {
      alert('Lütfen iki takımı da seçiniz!');
      return;
    }
    if (modalTeam1 === modalTeam2) {
      alert('İki takım aynı olamaz!');
      return;
    }
    setSavingMatch(true);
    try {
      const now = Date.now();
      const canonicalSlotId = modalCup !== 'wpc' && modalRound ? `${modalCup}_${modalSeason}_${modalRound}` : '';
      const docId = canonicalSlotId || `${modalTeam1}-vs-${modalTeam2}-${now}`;
      const categoryTag = modalCup === 'wpc' ? 'TURNUVA' : modalCup.toUpperCase();
      
      let roundLabel = '';
      if (modalRound === 'semi1') roundLabel = 'Yarı Final 1';
      else if (modalRound === 'semi2') roundLabel = 'Yarı Final 2';
      else if (modalRound === 'final' || modalRound === 'wpc_final') roundLabel = 'Büyük Final';
      else if (modalRound === 'groupA') roundLabel = 'A Grubu';
      else if (modalRound === 'groupB') roundLabel = 'B Grubu';
      else if (modalRound === 'wpc_qf1_1') roundLabel = 'Çeyrek Final 1 (1. Maç)';
      else if (modalRound === 'wpc_qf1_2') roundLabel = 'Çeyrek Final 1 (Rövanş)';
      else if (modalRound === 'wpc_qf2_1') roundLabel = 'Çeyrek Final 2 (1. Maç)';
      else if (modalRound === 'wpc_qf2_2') roundLabel = 'Çeyrek Final 2 (Rövanş)';
      else if (modalRound === 'wpc_qf3_1') roundLabel = 'Çeyrek Final 3 (1. Maç)';
      else if (modalRound === 'wpc_qf3_2') roundLabel = 'Çeyrek Final 3 (Rövanş)';
      else if (modalRound === 'wpc_qf4_1') roundLabel = 'Çeyrek Final 4 (1. Maç)';
      else if (modalRound === 'wpc_qf4_2') roundLabel = 'Çeyrek Final 4 (Rövanş)';
      else if (modalRound === 'wpc_sf1_1') roundLabel = 'Yarı Final 1 (1. Maç)';
      else if (modalRound === 'wpc_sf1_2') roundLabel = 'Yarı Final 1 (Rövanş)';
      else if (modalRound === 'wpc_sf2_1') roundLabel = 'Yarı Final 2 (1. Maç)';
      else if (modalRound === 'wpc_sf2_2') roundLabel = 'Yarı Final 2 (Rövanş)';
      else roundLabel = modalRound;

      const s1 = Number(modalScore1) || 0;
      const s2 = Number(modalScore2) || 0;
      let winner = '';
      if (modalPlayed) {
        if (s1 > s2) winner = modalTeam1;
        else if (s2 > s1) winner = modalTeam2;
        else winner = modalTeam1;
      }

      const matchData: Match = {
        id: docId,
        team1: modalTeam1,
        team2: modalTeam2,
        category: categoryTag,
        season: modalSeason as any,
        round: modalRound,
        hafta: roundLabel,
        score1: modalPlayed ? String(modalScore1) : '0',
        score2: modalPlayed ? String(modalScore2) : '0',
        played: modalPlayed,
        date: modalDate.trim() || new Date().toLocaleDateString('tr-TR'),
        datejav: now,
        ligm: false,
        timeline: [],
        lineup: {}
      };

      // 1. Optimistic update
      setMatches(prev => {
        const next = [...prev];
        const idx = next.findIndex(m => m.id === docId || (
          (m as any).round === modalRound &&
          Number((m as any).season) === Number(modalSeason) &&
          String(m.category || '').toUpperCase().includes(modalCup.toUpperCase())
        ));
        if (idx >= 0) next[idx] = { ...next[idx], ...matchData };
        else next.push(matchData);
        return next;
      });

      // 2. Synchronize bracket progression
      const bracketUpdates: Record<string, string> = {};
      if (modalCup !== 'wpc') {
        const p = `${modalCup}${modalSeason}`;
        if (modalRound === 'semi1') {
          bracketUpdates[`${p}s1`] = modalTeam1;
          bracketUpdates[`${p}s2`] = modalTeam2;
          if (modalPlayed && winner) {
            bracketUpdates[`${p}s5`] = winner;
          }
        } else if (modalRound === 'semi2') {
          bracketUpdates[`${p}s3`] = modalTeam1;
          bracketUpdates[`${p}s4`] = modalTeam2;
          if (modalPlayed && winner) {
            bracketUpdates[`${p}s6`] = winner;
          }
        } else if (modalRound === 'final') {
          bracketUpdates[`${p}s5`] = modalTeam1;
          bracketUpdates[`${p}s6`] = modalTeam2;
          if (modalPlayed && winner) {
            bracketUpdates[`${p}s7`] = winner;
          }
        }
        if (Object.keys(bracketUpdates).length > 0) {
          setBracketData(prev => ({ ...prev, ...bracketUpdates }));
          saveStoredBracketData(bracketUpdates);
        }
      }

      saveStoredMatch(matchData);

      // 3. Firestore sync
      try {
        await setDoc(doc(db, 'matches', docId), matchData, { merge: true });
        if (Object.keys(bracketUpdates).length > 0) {
          await setDoc(doc(db, 'brackets', 'data'), bracketUpdates, { merge: true });
        }
        await recalculateStandings().catch(console.error);
        await recalculatePlayerStats().catch(console.error);
        window.dispatchEvent(new CustomEvent('tournament_matches_updated', { detail: matchData }));
      } catch (fbErr: any) {
        console.warn('Firestore write notice (saved locally):', fbErr);
      }

      setAddMatchModalOpen(false);
      setToastMessage('✅ Maç eklendi ve fikstür güncellendi!');
    } catch (err: any) {
      console.error("Error creating match:", err);
      alert('Maç eklenirken hata: ' + (err?.message || 'Bilinmeyen hata'));
    } finally {
      setSavingMatch(false);
    }
  };

  // Helper to open Quick Score modal for any bracket match or slot
  const handleOpenQuickScore = (
    roundTitle: string,
    roundKey: 'semi1' | 'semi2' | 'final' | string,
    cupTag: 'bcl' | 'bel' | 'becl' | 'wpc',
    season: number,
    existingMatch?: Match,
    defaultT1?: string,
    defaultT2?: string
  ) => {
    // If existingMatch not provided, attempt to locate existing match by round or teams
    let foundMatch = existingMatch;
    if (!foundMatch) {
      const sMatches = getCupSeasonMatches(cupTag, season as any);
      foundMatch = sMatches.find(m => {
        const r = String((m as any).round || '').toLowerCase();
        if (roundKey && r === roundKey) return true;
        if (defaultT1 && defaultT2 && isMatchBetweenTeams(m, defaultT1, defaultT2)) return true;
        return false;
      });
    }

    setQsCupTag(cupTag);
    setQsSeason(season);
    setQsRoundKey(roundKey);
    setQsRoundTitle(roundTitle);
    setQsMatch(foundMatch || null);

    const t1 = foundMatch?.team1 || defaultT1 || (teams[0]?.name || 'Takım 1');
    const t2 = foundMatch?.team2 || defaultT2 || (teams[1]?.name || 'Takım 2');
    setQsTeam1(t1);
    setQsTeam2(t2);

    const score1Val = foundMatch ? String(foundMatch.score1 ?? '0') : '0';
    const score2Val = foundMatch ? String(foundMatch.score2 ?? '0') : '0';
    setQsScore1(score1Val);
    setQsScore2(score2Val);
    setQsPlayed(foundMatch ? Boolean(foundMatch.played) : true);
    setQsPenaltyWinner((foundMatch as any)?.penaltyWinner || '');
    setQsMvp(foundMatch?.mvp || '');
    setQsMvpRating(foundMatch?.rating || '7.5');

    // Populate existing goals or allocate goal slots
    const t1Goals: { scorer: string; assist: string }[] = [];
    const t2Goals: { scorer: string; assist: string }[] = [];
    if (foundMatch && Array.isArray(foundMatch.timeline)) {
      foundMatch.timeline.forEach(evt => {
        if (evt.type === 'goal') {
          if (evt.team === 'team1') {
            t1Goals.push({ scorer: evt.scorer || '', assist: evt.assist || '' });
          } else if (evt.team === 'team2') {
            t2Goals.push({ scorer: evt.scorer || '', assist: evt.assist || '' });
          }
        }
      });
    }
    const s1Target = Math.max(0, parseInt(score1Val) || 0);
    while (t1Goals.length < s1Target) t1Goals.push({ scorer: '', assist: '' });
    const s2Target = Math.max(0, parseInt(score2Val) || 0);
    while (t2Goals.length < s2Target) t2Goals.push({ scorer: '', assist: '' });

    setQsTeam1Goals(t1Goals.slice(0, s1Target));
    setQsTeam2Goals(t2Goals.slice(0, s2Target));

    const todayStr = new Date().toLocaleDateString('tr-TR');
    setQsDate(foundMatch?.date || todayStr);
    setQuickScoreModalOpen(true);
  };

  const handleScore1Change = (val: string) => {
    setQsScore1(val);
    const count = Math.max(0, parseInt(val) || 0);
    setQsTeam1Goals(prev => {
      const next = [...prev];
      while (next.length < count) next.push({ scorer: '', assist: '' });
      return next.slice(0, count);
    });
  };

  const handleScore2Change = (val: string) => {
    setQsScore2(val);
    const count = Math.max(0, parseInt(val) || 0);
    setQsTeam2Goals(prev => {
      const next = [...prev];
      while (next.length < count) next.push({ scorer: '', assist: '' });
      return next.slice(0, count);
    });
  };

  // Helper to save quick score directly with instant optimistic UI and automatic bracket progression
  const handleSaveQuickScore = async () => {
    if (!qsTeam1 || !qsTeam2) {
      alert('Lütfen iki takımı da belirleyiniz!');
      return;
    }
    setSavingQuickScore(true);
    try {
      const now = Date.now();
      // Locate existing match to avoid creating duplicate match records
      const existingMatch = qsMatch || matches.find(m => 
        (qsMatch?.id && m.id === qsMatch.id) ||
        (isMatchBetweenTeams(m, qsTeam1, qsTeam2) &&
         Number((m as any).season) === Number(qsSeason) &&
         String(m.category || '').toUpperCase().includes(qsCupTag.toUpperCase()))
      );

      const canonicalSlotId = qsCupTag !== 'wpc' && qsRoundKey ? `${qsCupTag}_${qsSeason}_${qsRoundKey}` : '';
      const docId = existingMatch?.id || canonicalSlotId || `${qsTeam1}-vs-${qsTeam2}-${now}`;
      const categoryTag = qsCupTag === 'wpc' ? 'TURNUVA' : qsCupTag.toUpperCase();

      let roundLabel = qsRoundTitle;
      if (!roundLabel) {
        if (qsRoundKey === 'semi1') roundLabel = 'Yarı Final 1';
        else if (qsRoundKey === 'semi2') roundLabel = 'Yarı Final 2';
        else if (qsRoundKey === 'final') roundLabel = 'Büyük Final';
        else roundLabel = qsRoundKey;
      }

      const s1Num = Number(qsScore1) || 0;
      const s2Num = Number(qsScore2) || 0;
      let winner = '';
      if (qsPlayed) {
        if (s1Num > s2Num) winner = qsTeam1;
        else if (s2Num > s1Num) winner = qsTeam2;
        else winner = qsPenaltyWinner || qsTeam1;
      }

      // Generate timeline goal events from Quick Score inputs
      const nonGoalEvents = (existingMatch?.timeline || []).filter(e => e.type !== 'goal');
      const generatedTimeline: MatchTimelineEvent[] = [...nonGoalEvents];

      qsTeam1Goals.forEach((g, idx) => {
        const scorerName = g.scorer.trim();
        if (scorerName) {
          generatedTimeline.push({
            id: `evt_qs_t1_${idx}_${now}`,
            type: 'goal',
            team: 'team1',
            scorer: scorerName,
            assist: g.assist.trim() || 'Şut',
            minute: `${(idx + 1) * 15}'`
          });
        }
      });

      qsTeam2Goals.forEach((g, idx) => {
        const scorerName = g.scorer.trim();
        if (scorerName) {
          generatedTimeline.push({
            id: `evt_qs_t2_${idx}_${now}`,
            type: 'goal',
            team: 'team2',
            scorer: scorerName,
            assist: g.assist.trim() || 'Şut',
            minute: `${(idx + 1) * 20}'`
          });
        }
      });

      const matchPayload: Match = {
        id: docId,
        team1: qsTeam1,
        team2: qsTeam2,
        category: categoryTag,
        season: qsSeason as any,
        round: qsRoundKey,
        hafta: roundLabel,
        score1: String(qsScore1),
        score2: String(qsScore2),
        played: qsPlayed,
        date: qsDate.trim() || new Date().toLocaleDateString('tr-TR'),
        datejav: existingMatch?.datejav || now,
        ligm: false,
        timeline: generatedTimeline,
        lineup: existingMatch?.lineup || {},
        penaltyWinner: qsPenaltyWinner || undefined,
        mvp: qsMvp ? qsMvp.trim() : (existingMatch?.mvp || undefined),
        rating: qsMvp ? (qsMvpRating.trim() || '7.5') : (existingMatch?.rating || undefined)
      };

      // 1. Optimistic state update in React
      setMatches((prev) => {
        const next = [...prev];
        const idx = next.findIndex(m => m.id === docId || (
          (m as any).round === qsRoundKey &&
          Number((m as any).season) === Number(qsSeason) &&
          String(m.category || '').toUpperCase().includes(qsCupTag.toUpperCase())
        ) || (
          isMatchBetweenTeams(m, qsTeam1, qsTeam2) &&
          Number((m as any).season) === Number(qsSeason) &&
          String(m.category || '').toUpperCase().includes(qsCupTag.toUpperCase())
        ));
        if (idx >= 0) {
          next[idx] = { ...next[idx], ...matchPayload, id: next[idx].id || docId };
        } else {
          next.push(matchPayload);
        }
        return next;
      });

      // 2. Synchronize brackets/data and advance winners to the next stage
      const p = `${qsCupTag}${qsSeason}`;
      const bUpdates: Record<string, string> = {};

      if (qsCupTag !== 'wpc') {
        if (qsRoundKey === 'semi1') {
          bUpdates[`${p}s1`] = qsTeam1;
          bUpdates[`${p}s2`] = qsTeam2;
          if (qsPlayed && winner) {
            bUpdates[`${p}s5`] = winner; // Advances to Finalist 1!
          } else if (!qsPlayed) {
            bUpdates[`${p}s5`] = '';
          }
        } else if (qsRoundKey === 'semi2') {
          bUpdates[`${p}s3`] = qsTeam1;
          bUpdates[`${p}s4`] = qsTeam2;
          if (qsPlayed && winner) {
            bUpdates[`${p}s6`] = winner; // Advances to Finalist 2!
          } else if (!qsPlayed) {
            bUpdates[`${p}s6`] = '';
          }
        } else if (qsRoundKey === 'final') {
          bUpdates[`${p}s5`] = qsTeam1;
          bUpdates[`${p}s6`] = qsTeam2;
          if (qsPlayed && winner) {
            bUpdates[`${p}s7`] = winner; // Champion crowned!
          } else if (!qsPlayed) {
            bUpdates[`${p}s7`] = '';
          }
        }

        if (Object.keys(bUpdates).length > 0) {
          setBracketData(prev => ({ ...prev, ...bUpdates }));
          saveStoredBracketData(bUpdates);
        }
      }

      // 3. Persist match locally
      saveStoredMatch(matchPayload);

      // 4. Persist to Firestore (graceful non-blocking fallback if permissions/network fail)
      try {
        await setDoc(doc(db, 'matches', docId), matchPayload, { merge: true });
        if (Object.keys(bUpdates).length > 0) {
          await setDoc(doc(db, 'brackets', 'data'), bUpdates, { merge: true });
        }
        await recalculateStandings().catch(console.error);
        await recalculatePlayerStats().catch(console.error);
        window.dispatchEvent(new CustomEvent('tournament_matches_updated', { detail: matchPayload }));
      } catch (fbErr: any) {
        console.warn('Firestore write notice (saved locally):', fbErr);
      }

      setQuickScoreModalOpen(false);
      setToastMessage(
        qsRoundKey === 'final' && qsPlayed && winner
          ? `👑 Büyük Final kaydedildi! ${winner} ŞAMPİYON OLDU!`
          : '✅ Maç sonucu kaydedildi ve eleme ağacı güncellendi!'
      );
    } catch (err: any) {
      console.error('Error saving quick score:', err);
      alert('Sonuç kaydedilirken hata oluştu: ' + (err?.message || 'Bilinmeyen hata'));
    } finally {
      setSavingQuickScore(false);
    }
  };

  // Helper to open Change Teams modal
  const handleOpenChangeTeams = (
    roundTitle: string,
    roundKey: 'semi1' | 'semi2' | 'final' | string,
    cupTag: 'bcl' | 'bel' | 'becl' | 'wpc',
    season: number,
    slotAKey: string,
    slotBKey: string,
    existingMatch?: Match,
    defaultT1?: string,
    defaultT2?: string
  ) => {
    setCtCupTag(cupTag);
    setCtSeason(season);
    setCtRoundKey(roundKey);
    setCtRoundTitle(roundTitle);
    setCtSlotAKey(slotAKey);
    setCtSlotBKey(slotBKey);
    setCtMatch(existingMatch || null);

    const initialT1 = bracketData[slotAKey] || existingMatch?.team1 || defaultT1 || (teams[0]?.name || '');
    const initialT2 = bracketData[slotBKey] || existingMatch?.team2 || defaultT2 || (teams[1]?.name || '');
    setCtTeam1(initialT1);
    setCtTeam2(initialT2);
    setChangeTeamsModalOpen(true);
  };

  // Helper to save changed teams to bracketData and match
  const handleSaveChangeTeams = async () => {
    if (!ctTeam1 || !ctTeam2) {
      alert('Lütfen iki takımı da seçiniz!');
      return;
    }
    if (ctTeam1 === ctTeam2) {
      alert('İki takım aynı olamaz!');
      return;
    }
    setSavingTeams(true);
    try {
      const now = Date.now();
      const p = `${ctCupTag}${ctSeason}`;
      const bUpdates: Record<string, string> = {};

      if (ctSlotAKey) bUpdates[ctSlotAKey] = ctTeam1;
      if (ctSlotBKey) bUpdates[ctSlotBKey] = ctTeam2;

      // Update bracket progression seeds
      if (ctRoundKey === 'semi1') {
        bUpdates[`${p}s1`] = ctTeam1;
        bUpdates[`${p}s2`] = ctTeam2;
      } else if (ctRoundKey === 'semi2') {
        bUpdates[`${p}s3`] = ctTeam1;
        bUpdates[`${p}s4`] = ctTeam2;
      } else if (ctRoundKey === 'final') {
        bUpdates[`${p}s5`] = ctTeam1;
        bUpdates[`${p}s6`] = ctTeam2;
      }

      setBracketData((prev) => ({ ...prev, ...bUpdates }));
      saveStoredBracketData(bUpdates);

      // Also update or create the match in that slot
      const canonicalSlotId = ctCupTag !== 'wpc' && ctRoundKey ? `${ctCupTag}_${ctSeason}_${ctRoundKey}` : '';
      const docId = ctMatch?.id || canonicalSlotId || `${ctTeam1}-vs-${ctTeam2}-${now}`;
      const categoryTag = ctCupTag === 'wpc' ? 'TURNUVA' : ctCupTag.toUpperCase();

      const updatedMatch: Match = {
        id: docId,
        team1: ctTeam1,
        team2: ctTeam2,
        category: categoryTag,
        season: ctSeason as any,
        round: ctRoundKey,
        hafta: ctRoundTitle || ctRoundKey,
        score1: ctMatch ? ctMatch.score1 : '0',
        score2: ctMatch ? ctMatch.score2 : '0',
        played: ctMatch ? ctMatch.played : false,
        date: ctMatch?.date || new Date().toLocaleDateString('tr-TR'),
        datejav: ctMatch?.datejav || now,
        ligm: false,
        timeline: ctMatch?.timeline || [],
        lineup: ctMatch?.lineup || {}
      };

      // 1. Optimistic React update
      setMatches((prev) => {
        const next = [...prev];
        const idx = next.findIndex(m => m.id === docId || (
          (m as any).round === ctRoundKey &&
          Number((m as any).season) === Number(ctSeason) &&
          String(m.category || '').toUpperCase().includes(ctCupTag.toUpperCase())
        ));
        if (idx >= 0) {
          next[idx] = { ...next[idx], ...updatedMatch };
        } else {
          next.push(updatedMatch);
        }
        return next;
      });

      // 2. Persist locally
      saveStoredTournamentMatch(updatedMatch);

      // 3. Persist to Firestore
      try {
        await setDoc(doc(db, 'matches', docId), updatedMatch, { merge: true });
        if (Object.keys(bUpdates).length > 0) {
          await setDoc(doc(db, 'brackets', 'data'), bUpdates, { merge: true });
        }
      } catch (fbErr) {
        console.warn('Firestore write notice (saved locally):', fbErr);
      }

      setChangeTeamsModalOpen(false);
      setToastMessage(`✅ Takımlar güncellendi: ${ctTeam1} vs ${ctTeam2}`);
    } catch (err: any) {
      console.error('Error saving teams:', err);
      alert('Takımlar güncellenirken hata: ' + (err?.message || 'Bilinmeyen hata'));
    } finally {
      setSavingTeams(false);
    }
  };

  // Helper to check if a team is Bobblica (for averaj exclusion rule)
  const isBobblica = (name?: string): boolean => {
    if (!name) return false;
    const n = name.trim().toLowerCase();
    return n === 'bobblica' || n === 'hiyar city' || n === 'bobbli̇ca' || n.includes('bobblica');
  };

  // Helper to filter matches by cup and season
  const getCupSeasonMatches = (cupFilter: 'wpc' | 'bcl' | 'bel' | 'becl', season?: 4 | 5) => {
    return allTournamentMatches.filter((m) => {
      const cat = String(m.category || '').toUpperCase().trim();
      const hStr = String(m.hafta || '').toUpperCase().trim();
      const mSeason = (m as any).season;
      const mRound = String((m as any).round || '').toLowerCase();
      
      let matchesCup = false;
      if (cupFilter === 'wpc') {
        matchesCup = 
          cat.includes('WPC') || 
          cat.includes('WORLD PEACE') || 
          cat.includes('TURNUVA') || 
          hStr.includes('WPC') || 
          hStr.includes('WORLD PEACE') || 
          hStr.includes('ÇEYREK') || 
          hStr.includes('CEYREK') || 
          hStr.includes('YARI') || 
          hStr.includes('SEMI') || 
          mRound.startsWith('wpc_') || 
          mRound.includes('group') || 
          (m as any).kgrup !== undefined;
      } else if (cupFilter === 'bcl') {
        matchesCup = cat.includes('BCL') || cat.includes('UCL') || cat.includes('CHAMPIONS') || hStr.includes('BCL') || hStr.includes('UCL');
      } else if (cupFilter === 'bel') {
        matchesCup = cat.includes('BEL') || cat.includes('UEL') || cat.includes('EUROPA') || hStr.includes('BEL') || hStr.includes('UEL');
      } else if (cupFilter === 'becl') {
        matchesCup = cat.includes('BECL') || cat.includes('UECL') || cat.includes('CONFERENCE') || hStr.includes('BECL') || hStr.includes('UECL');
      }

      if (!matchesCup) return false;
      if (cupFilter === 'wpc') return true;

      // Check season match if season provided
      if (season) {
        if (mSeason !== undefined && mSeason !== null) {
          return Number(mSeason) === season;
        }
        return season === 5;
      }
      return true;
    });
  };

  // Helper to compute live WPC Group Standings from all matches (with Bobblica averaj exclusion)
  const getWpcGroupStandings = (groupLetter: 'A' | 'B') => {
    // 1. Filter teams belonging to this group
    const groupTeams = teams.filter((t: any) => t.kgrup === groupLetter);
    const teamStats: Record<string, {
      name: string;
      logo?: string;
      played: number;
      wins: number;
      draws: number;
      losses: number;
      atilan: number;
      yenilen: number;
      points: number;
    }> = {};

    groupTeams.forEach((t) => {
      teamStats[t.name] = {
        name: t.name,
        logo: t.logo,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        atilan: 0,
        yenilen: 0,
        points: 0
      };
    });

    const groupTeamNames = new Set(groupTeams.map((t) => normalizeTeamName(t.name).toLowerCase()));

    // 2. Scan all tournament matches for group stage matches
    allTournamentMatches.forEach((m) => {
      if (!m.played) return;
      const cat = String(m.category || '').toUpperCase().trim();
      const h = String(m.hafta || '').toLowerCase().trim();
      const r = String((m as any).round || '').toLowerCase().trim();

      // Ensure it is WPC group match and not knockout/bracket match
      const isKnockout = 
        r.includes('qf') || 
        r.includes('sf') || 
        r.includes('final') || 
        h.includes('çeyrek') || 
        h.includes('ceyrek') || 
        h.includes('yarı') || 
        h.includes('yari') || 
        h.includes('büyük final');
      if (isKnockout) return;

      const isWpcCat = cat.includes('WPC') || cat.includes('TURNUVA') || cat.includes('WORLD PEACE') || h.includes('wpc') || h.includes('world peace');
      const isExplicitGroup = r === `group${groupLetter.toLowerCase()}` || h.includes(`${groupLetter.toLowerCase()} grubu`);

      const t1Norm = normalizeTeamName(m.team1);
      const t2Norm = normalizeTeamName(m.team2);
      const t1InGroup = groupTeamNames.has(t1Norm.toLowerCase());
      const t2InGroup = groupTeamNames.has(t2Norm.toLowerCase());

      const belongsToThisGroup = isExplicitGroup || (isWpcCat && (t1InGroup && t2InGroup));
      if (!belongsToThisGroup) return;

      // Locate stats object
      const t1Key = groupTeams.find((gt) => isSameTeam(gt.name, t1Norm))?.name || (t1InGroup ? t1Norm : null);
      const t2Key = groupTeams.find((gt) => isSameTeam(gt.name, t2Norm))?.name || (t2InGroup ? t2Norm : null);

      const s1 = Number(m.score1) || 0;
      const s2 = Number(m.score2) || 0;

      // Bobblica Averaj Kuralı: "Puan hesaplarken rakip takip Bobblica ise averaja yazma"
      const hasBobblica = isBobblica(t1Norm) || isBobblica(t2Norm);

      if (t1Key && teamStats[t1Key]) {
        teamStats[t1Key].played += 1;
        if (!hasBobblica) {
          teamStats[t1Key].atilan += s1;
          teamStats[t1Key].yenilen += s2;
        }
        if (s1 > s2) {
          teamStats[t1Key].wins += 1;
          teamStats[t1Key].points += 3;
        } else if (s1 === s2) {
          teamStats[t1Key].draws += 1;
          teamStats[t1Key].points += 1;
        } else {
          teamStats[t1Key].losses += 1;
        }
      }

      if (t2Key && teamStats[t2Key]) {
        teamStats[t2Key].played += 1;
        if (!hasBobblica) {
          teamStats[t2Key].atilan += s2;
          teamStats[t2Key].yenilen += s1;
        }
        if (s2 > s1) {
          teamStats[t2Key].wins += 1;
          teamStats[t2Key].points += 3;
        } else if (s1 === s2) {
          teamStats[t2Key].draws += 1;
          teamStats[t2Key].points += 1;
        } else {
          teamStats[t2Key].losses += 1;
        }
      }
    });

    // 3. Fallback to team.kg* stats if no group matches played yet in match collection
    const result = groupTeams.map((gt) => {
      const stats = teamStats[gt.name] || {
        name: gt.name,
        logo: gt.logo,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        atilan: 0,
        yenilen: 0,
        points: 0
      };

      if (stats.played === 0 && ((gt as any).kgw || (gt as any).kgpuan || (gt as any).kgl || (gt as any).kgb)) {
        stats.wins = Number((gt as any).kgw) || 0;
        stats.draws = Number((gt as any).kgb) || 0;
        stats.losses = Number((gt as any).kgl) || 0;
        stats.atilan = Number((gt as any).kgatilan) || 0;
        stats.yenilen = Number((gt as any).kgyenilen) || 0;
        stats.points = Number((gt as any).kgpuan) || 0;
        stats.played = stats.wins + stats.draws + stats.losses;
      }

      const gav = stats.atilan - stats.yenilen;
      return {
        ...gt,
        name: gt.name,
        logo: teamLogos[gt.name] || gt.logo || 'https://via.placeholder.com/32?text=?',
        oynanan: stats.played,
        gw: stats.wins,
        gb: stats.draws,
        gl: stats.losses,
        atilan: stats.atilan,
        yenilen: stats.yenilen,
        gav,
        gp: stats.points,
      };
    });

    // 4. Sort: Puan, Averaj, Atılan Gol, Galibiyet, Alfabetik
    return result.sort((a, b) => b.gp - a.gp || b.gav - a.gav || b.atilan - a.atilan || b.gw - a.gw || a.name.localeCompare(b.name));
  };

  // Helper to find a 2-legged tie match by round, id, or teams
  const findWpcTieMatch = (tieKey: string, legNumber: 1 | 2, teamA: string, teamB: string): Match | undefined => {
    const canonicalId = `wpc_5_${tieKey}_leg${legNumber}`;
    const roundTag = `wpc_${tieKey}_${legNumber}`;

    // 1. By canonical ID or round tag
    const byIdOrRound = allTournamentMatches.find(m => 
      m.id === canonicalId || 
      (m as any).round === roundTag ||
      (m as any).round === `${tieKey}_${legNumber}`
    );
    if (byIdOrRound) return byIdOrRound;

    // 2. By teams and leg indicator
    return allTournamentMatches.find(m => {
      if (!isMatchBetweenTeams(m, teamA, teamB)) return false;
      const h = String(m.hafta || '').toLowerCase();
      const r = String((m as any).round || '').toLowerCase();
      const isLeg1 = h.includes('1. maç') || r.endsWith('_1') || (!h.includes('rövanş') && !h.includes('2. maç'));
      const isLeg2 = h.includes('rövanş') || h.includes('2. maç') || r.endsWith('_2');
      return legNumber === 1 ? isLeg1 : isLeg2;
    });
  };

  // Helper to calculate aggregate tie scores and winner for a 2-legged matchup
  const computeWpcTie = (
    tieKey: 'qf1' | 'qf2' | 'qf3' | 'qf4' | 'sf1' | 'sf2',
    teamA: string, // Seed A (e.g. A1, A2, A3, A4, or Winner QF1/QF3)
    teamB: string, // Seed B (e.g. B4, B3, B2, B1, or Winner QF2/QF4)
    title: string,
    subTitle: string
  ) => {
    // Leg 1: Team B (home) vs Team A (away)
    const leg1Match = findWpcTieMatch(tieKey, 1, teamA, teamB);
    // Leg 2: Team A (home) vs Team B (away)
    const leg2Match = findWpcTieMatch(tieKey, 2, teamA, teamB);

    let leg1ScoreA = 0;
    let leg1ScoreB = 0;
    if (leg1Match && leg1Match.played) {
      const s1 = Number(leg1Match.score1) || 0;
      const s2 = Number(leg1Match.score2) || 0;
      if (isSameTeam(leg1Match.team1, teamA)) {
        leg1ScoreA = s1;
        leg1ScoreB = s2;
      } else {
        leg1ScoreA = s2;
        leg1ScoreB = s1;
      }
    }

    let leg2ScoreA = 0;
    let leg2ScoreB = 0;
    if (leg2Match && leg2Match.played) {
      const s1 = Number(leg2Match.score1) || 0;
      const s2 = Number(leg2Match.score2) || 0;
      if (isSameTeam(leg2Match.team1, teamA)) {
        leg2ScoreA = s1;
        leg2ScoreB = s2;
      } else {
        leg2ScoreA = s2;
        leg2ScoreB = s1;
      }
    }

    const isLeg1Played = Boolean(leg1Match?.played);
    const isLeg2Played = Boolean(leg2Match?.played);
    const isCompleted = isLeg1Played && isLeg2Played;

    const totalScoreA = leg1ScoreA + leg2ScoreA;
    const totalScoreB = leg1ScoreB + leg2ScoreB;

    let winner = '';
    let isTied = false;
    let penaltyWinner = (leg2Match as any)?.penaltyWinner || (leg1Match as any)?.penaltyWinner || bracketData[`wpc_${tieKey}_pen`];

    if (isCompleted) {
      if (totalScoreA > totalScoreB) {
        winner = teamA;
      } else if (totalScoreB > totalScoreA) {
        winner = teamB;
      } else {
        isTied = true;
        if (penaltyWinner) {
          winner = penaltyWinner;
        }
      }
    }

    return {
      tieKey,
      title,
      subTitle,
      teamA,
      teamB,
      leg1Match,
      leg2Match,
      leg1ScoreA,
      leg1ScoreB,
      leg2ScoreA,
      leg2ScoreB,
      totalScoreA,
      totalScoreB,
      isLeg1Played,
      isLeg2Played,
      isCompleted,
      winner,
      isTied,
      penaltyWinner
    };
  };

  // Helper to compile full WPC bracket state (QF 1-4, SF 1-2, Final, Champion)
  const getWpcBracketData = () => {
    const groupA = getWpcGroupStandings('A');
    const groupB = getWpcGroupStandings('B');

    // Rule:
    // QF1: A1 vs B4
    // QF2: A2 vs B3
    // QF3: A3 vs B2
    // QF4: A4 vs B1
    const a1 = groupA[0]?.name || bracketData['wpc_qf1_t1'] || 'A Grubu 1.si';
    const a2 = groupA[1]?.name || bracketData['wpc_qf2_t1'] || 'A Grubu 2.si';
    const a3 = groupA[2]?.name || bracketData['wpc_qf3_t1'] || 'A Grubu 3.sü';
    const a4 = groupA[3]?.name || bracketData['wpc_qf4_t1'] || 'A Grubu 4.sü';

    const b1 = groupB[0]?.name || bracketData['wpc_qf4_t2'] || 'B Grubu 1.si';
    const b2 = groupB[1]?.name || bracketData['wpc_qf3_t2'] || 'B Grubu 2.si';
    const b3 = groupB[2]?.name || bracketData['wpc_qf2_t2'] || 'B Grubu 3.sü';
    const b4 = groupB[3]?.name || bracketData['wpc_qf1_t2'] || 'B Grubu 4.sü';

    const qf1 = computeWpcTie('qf1', a1, b4, 'Çeyrek Final 1', 'A1 vs B4');
    const qf2 = computeWpcTie('qf2', a2, b3, 'Çeyrek Final 2', 'A2 vs B3');
    const qf3 = computeWpcTie('qf3', a3, b2, 'Çeyrek Final 3', 'A3 vs B2');
    const qf4 = computeWpcTie('qf4', a4, b1, 'Çeyrek Final 4', 'A4 vs B1');

    const qf1Winner = qf1.winner || bracketData['wpc_sf1_t1'] || '';
    const qf2Winner = qf2.winner || bracketData['wpc_sf1_t2'] || '';
    const qf3Winner = qf3.winner || bracketData['wpc_sf2_t1'] || '';
    const qf4Winner = qf4.winner || bracketData['wpc_sf2_t2'] || '';

    // Semi-Finals:
    // SF1: Winner QF1 vs Winner QF2
    // SF2: Winner QF3 vs Winner QF4
    const sf1 = computeWpcTie('sf1', qf1Winner || 'ÇF 1 Galibi', qf2Winner || 'ÇF 2 Galibi', 'Yarı Final 1', 'ÇF1 Galibi vs ÇF2 Galibi');
    const sf2 = computeWpcTie('sf2', qf3Winner || 'ÇF 3 Galibi', qf4Winner || 'ÇF 4 Galibi', 'Yarı Final 2', 'ÇF3 Galibi vs ÇF4 Galibi');

    const sf1Winner = sf1.winner || bracketData['wpc_final_t1'] || '';
    const sf2Winner = sf2.winner || bracketData['wpc_final_t2'] || '';

    // Final (Single Match):
    const finalMatch = allTournamentMatches.find(m => {
      const r = String((m as any).round || '').toLowerCase();
      const h = String(m.hafta || '').toLowerCase();
      const cat = String(m.category || '').toUpperCase();
      if (m.id === 'wpc_5_final' || r === 'wpc_final') return true;
      if (cat.includes('WPC') || cat.includes('TURNUVA') || h.includes('wpc')) {
        if ((r === 'final' || h.includes('büyük final')) && !h.includes('yarı') && !h.includes('çeyrek')) return true;
        if (sf1Winner && sf2Winner && isMatchBetweenTeams(m, sf1Winner, sf2Winner) && !h.includes('yarı') && !h.includes('çeyrek')) return true;
      }
      return false;
    });

    let champion = '';
    if (finalMatch && finalMatch.played) {
      champion = getWinnerOfMatch(finalMatch);
    } else if (bracketData['wpc_champion']) {
      champion = bracketData['wpc_champion'];
    }

    return {
      qf1,
      qf2,
      qf3,
      qf4,
      qf1Winner,
      qf2Winner,
      qf3Winner,
      qf4Winner,
      sf1,
      sf2,
      sf1Winner,
      sf2Winner,
      finalMatch,
      champion
    };
  };

  // Helper to auto-create WPC matches (QF 1-4, SF 1-2, Final)
  const autoCreateWpcMatches = async (force: boolean = false) => {
    const groupA = getWpcGroupStandings('A');
    const groupB = getWpcGroupStandings('B');
    if (groupA.length < 4 || groupB.length < 4) return;

    const all5Played = groupA.length === 6 && groupB.length === 6 && groupA.every(t => t.oynanan >= 5) && groupB.every(t => t.oynanan >= 5);
    if (!all5Played && !force) return;

    // Seeds:
    // A1 vs B4
    // A2 vs B3
    // A3 vs B2
    // A4 vs B1
    const a1 = groupA[0].name;
    const a2 = groupA[1].name;
    const a3 = groupA[2].name;
    const a4 = groupA[3].name;

    const b1 = groupB[0].name;
    const b2 = groupB[1].name;
    const b3 = groupB[2].name;
    const b4 = groupB[3].name;

    const qfPairings = [
      { key: 'qf1', tA: a1, tB: b4, label: 'Çeyrek Final 1' },
      { key: 'qf2', tA: a2, tB: b3, label: 'Çeyrek Final 2' },
      { key: 'qf3', tA: a3, tB: b2, label: 'Çeyrek Final 3' },
      { key: 'qf4', tA: a4, tB: b1, label: 'Çeyrek Final 4' },
    ];

    const todayStr = new Date().toLocaleDateString('tr-TR');
    const now = Date.now();
    const newMatches: Match[] = [];

    qfPairings.forEach(({ key, tA, tB, label }) => {
      // Leg 1: Team B (home) vs Team A (away)
      const leg1Id = `wpc_5_${key}_leg1`;
      const leg1Existing = allTournamentMatches.find(m => m.id === leg1Id || (m as any).round === `wpc_${key}_1` || (m as any).round === `${key}_1`);
      if (!leg1Existing) {
        newMatches.push({
          id: leg1Id,
          team1: tB,
          team2: tA,
          category: 'TURNUVA',
          season: 5 as any,
          round: `wpc_${key}_1`,
          hafta: `${label} (1. Maç)`,
          score1: '0',
          score2: '0',
          played: false,
          date: todayStr,
          datejav: now,
          ligm: false,
          timeline: [],
          lineup: {}
        });
      }

      // Leg 2: Team A (home) vs Team B (away)
      const leg2Id = `wpc_5_${key}_leg2`;
      const leg2Existing = allTournamentMatches.find(m => m.id === leg2Id || (m as any).round === `wpc_${key}_2` || (m as any).round === `${key}_2`);
      if (!leg2Existing) {
        newMatches.push({
          id: leg2Id,
          team1: tA,
          team2: tB,
          category: 'TURNUVA',
          season: 5 as any,
          round: `wpc_${key}_2`,
          hafta: `${label} (Rövanş)`,
          score1: '0',
          score2: '0',
          played: false,
          date: todayStr,
          datejav: now + 1000,
          ligm: false,
          timeline: [],
          lineup: {}
        });
      }
    });

    if (newMatches.length > 0) {
      setMatches(prev => {
        const next = [...prev];
        newMatches.forEach(nm => {
          const idx = next.findIndex(m => m.id === nm.id);
          if (idx >= 0) next[idx] = nm;
          else next.push(nm);
        });
        return next;
      });

      for (const m of newMatches) {
        saveStoredTournamentMatch(m);
        try {
          await setDoc(doc(db, 'matches', m.id), m, { merge: true });
        } catch (e) {}
      }
      setToastMessage('🏆 World Peace Cup Çeyrek Final eşleşmeleri fikstüre eklendi!');
    } else {
      setToastMessage('ℹ️ Çeyrek Final maçları zaten fikstürde mevcut.');
    }
  };

  // Helper to set penalty winner for tied 2-legged ties
  const handleSetPenaltyWinner = async (tieKey: string, chosenTeam: string) => {
    const update = { [`wpc_${tieKey}_pen`]: chosenTeam };
    setBracketData(prev => ({ ...prev, ...update }));
    saveStoredBracketData(update);
    try {
      await setDoc(doc(db, 'brackets', 'data'), update, { merge: true });
    } catch (e) {}
    setToastMessage(`🎯 Penaltı galibi kaydedildi: ${chosenTeam}`);
  };

  // Helper to render interactive 2-legged tie card
  const renderWpcTieCard = (tie: ReturnType<typeof computeWpcTie>, subTitleText: string) => {
    const isCompleted = tie.isCompleted;
    const isTiedPendingPenalty = tie.isTied && !tie.winner;

    return (
      <div className="bg-white rounded-3xl border-2 border-brand-maroon/30 hover:border-brand-maroon shadow-md hover:shadow-xl transition-all p-4 flex flex-col justify-between gap-3 relative select-text">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-gray-100 pb-2 text-[10px] font-black uppercase tracking-wider text-brand-maroon">
          <div className="flex items-center gap-1.5">
            <span>{tie.title}</span>
            <span className="text-[9px] text-gray-400 font-bold">({subTitleText})</span>
          </div>
          {isCompleted ? (
            <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[8px] font-black">
              BİTTİ
            </span>
          ) : tie.isLeg1Played ? (
            <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[8px] font-black">
              1. MAÇ OYNANDI
            </span>
          ) : (
            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[8px] font-black">
              BEKLENİYOR
            </span>
          )}
        </div>

        {/* Aggregate Score Bar (Toplam Skor) */}
        <div className="bg-gradient-to-r from-gray-900 via-brand-dark to-gray-900 text-white rounded-2xl p-2.5 px-3 flex items-center justify-between shadow-inner">
          {/* Team A */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <img 
              src={teamLogos[tie.teamA] || 'https://via.placeholder.com/28?text=?'} 
              className="w-7 h-7 rounded-full object-cover border border-brand-gold bg-white shrink-0" 
              alt={tie.teamA} 
            />
            <div className="truncate">
              <span className={`text-xs font-black truncate block ${isSameTeam(tie.winner, tie.teamA) ? 'text-brand-gold' : 'text-white'}`}>
                {tie.teamA}
              </span>
              {isSameTeam(tie.winner, tie.teamA) && (
                <span className="text-[8px] font-black text-emerald-400 tracking-wider">TUR ATLADI ✓</span>
              )}
            </div>
          </div>

          {/* Aggregate Badge */}
          <div className="flex flex-col items-center px-3 shrink-0">
            <span className="text-[8px] font-black text-brand-gold/80 uppercase tracking-widest">TOPLAM</span>
            <div className="text-sm font-black text-brand-gold tracking-widest px-2 py-0.5 bg-black/60 rounded-lg border border-brand-gold/40">
              {tie.totalScoreA} - {tie.totalScoreB}
            </div>
          </div>

          {/* Team B */}
          <div className="flex items-center justify-end gap-2 min-w-0 flex-1 text-right">
            <div className="truncate">
              <span className={`text-xs font-black truncate block ${isSameTeam(tie.winner, tie.teamB) ? 'text-brand-gold' : 'text-white'}`}>
                {tie.teamB}
              </span>
              {isSameTeam(tie.winner, tie.teamB) && (
                <span className="text-[8px] font-black text-emerald-400 tracking-wider">TUR ATLADI ✓</span>
              )}
            </div>
            <img 
              src={teamLogos[tie.teamB] || 'https://via.placeholder.com/28?text=?'} 
              className="w-7 h-7 rounded-full object-cover border border-brand-gold bg-white shrink-0" 
              alt={tie.teamB} 
            />
          </div>
        </div>

        {/* 1. Maç & 2. Maç (Rövanş) Rows */}
        <div className="space-y-2 text-xs">
          {/* LEG 1 */}
          <div className="bg-gray-50 hover:bg-gray-100 rounded-xl p-2 border border-gray-200 transition-colors flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-[9px] font-black text-brand-maroon bg-white px-1.5 py-0.5 rounded border border-gray-200 shrink-0">
                1. Maç
              </span>
              <span className="text-[11px] font-bold text-gray-700 truncate">
                {tie.teamB} vs {tie.teamA}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-black text-xs px-2 py-0.5 rounded bg-white border border-gray-300">
                {tie.leg1Match?.played ? `${tie.leg1Match.score1} - ${tie.leg1Match.score2}` : 'VS'}
              </span>
              <button
                type="button"
                onClick={() => handleOpenQuickScore(
                  `${tie.title} (1. Maç)`,
                  `wpc_${tie.tieKey}_1`,
                  'wpc',
                  5,
                  tie.leg1Match,
                  tie.teamB,
                  tie.teamA
                )}
                className="bg-brand-maroon hover:bg-black text-brand-gold text-[9px] font-black px-2 py-1 rounded-lg uppercase transition-colors"
                title="1. Maç Skorunu Gir"
              >
                ⚡ Skor
              </button>
            </div>
          </div>

          {/* LEG 2 */}
          <div className="bg-gray-50 hover:bg-gray-100 rounded-xl p-2 border border-gray-200 transition-colors flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-[9px] font-black text-purple-700 bg-white px-1.5 py-0.5 rounded border border-gray-200 shrink-0">
                Rövanş
              </span>
              <span className="text-[11px] font-bold text-gray-700 truncate">
                {tie.teamA} vs {tie.teamB}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-black text-xs px-2 py-0.5 rounded bg-white border border-gray-300">
                {tie.leg2Match?.played ? `${tie.leg2Match.score1} - ${tie.leg2Match.score2}` : 'VS'}
              </span>
              <button
                type="button"
                onClick={() => handleOpenQuickScore(
                  `${tie.title} (Rövanş)`,
                  `wpc_${tie.tieKey}_2`,
                  'wpc',
                  5,
                  tie.leg2Match,
                  tie.teamA,
                  tie.teamB
                )}
                className="bg-brand-maroon hover:bg-black text-brand-gold text-[9px] font-black px-2 py-1 rounded-lg uppercase transition-colors"
                title="Rövanş Maçı Skorunu Gir"
              >
                ⚡ Skor
              </button>
            </div>
          </div>
        </div>

        {/* Tie-breaker & Penalty Winner Prompt if Agrega is level */}
        {isTiedPendingPenalty && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-2.5 text-center space-y-1.5 animate-pulse">
            <span className="text-[10px] font-black text-amber-900 block">
              ⚖️ Toplam Skor Eşit! Penaltı Atışları Galibini Belirleyiniz:
            </span>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => handleSetPenaltyWinner(tie.tieKey, tie.teamA)}
                className="bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] px-2.5 py-1 rounded-lg shadow-xs"
              >
                🎯 {tie.teamA} Kazandı
              </button>
              <button
                type="button"
                onClick={() => handleSetPenaltyWinner(tie.tieKey, tie.teamB)}
                className="bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] px-2.5 py-1 rounded-lg shadow-xs"
              >
                🎯 {tie.teamB} Kazandı
              </button>
            </div>
          </div>
        )}

        {/* Penalty winner badge if won via penalties */}
        {tie.penaltyWinner && (
          <div className="text-[9px] font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg text-center">
            🎯 Penaltılar Sonucu Galip: <strong>{tie.penaltyWinner}</strong>
          </div>
        )}
      </div>
    );
  };

  // Helper to render interactive WPC Final Card
  const renderWpcFinalCard = (finalMatch: Match | undefined, sf1Winner: string, sf2Winner: string) => {
    const t1 = finalMatch?.team1 || sf1Winner || 'Yarı Final 1 Galibi';
    const t2 = finalMatch?.team2 || sf2Winner || 'Yarı Final 2 Galibi';
    const isPlayed = Boolean(finalMatch?.played);
    const s1 = finalMatch ? finalMatch.score1 : '0';
    const s2 = finalMatch ? finalMatch.score2 : '0';
    const winner = isPlayed ? getWinnerOfMatch(finalMatch) : '';

    return (
      <div className="bg-white rounded-3xl border-3 border-brand-gold hover:border-brand-maroon shadow-xl transition-all p-4 flex flex-col justify-between gap-3 relative select-text">
        <div className="flex justify-between items-center border-b border-gray-100 pb-2 text-[10px] font-black uppercase tracking-wider text-brand-maroon">
          <span>🏆 BÜYÜK FİNAL</span>
          {isPlayed ? (
            <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-[8px] font-black">
              ŞAMPİYON BELİRLENDİ
            </span>
          ) : sf1Winner && sf2Winner ? (
            <span className="bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full text-[8px] font-black">
              FİNALİSTLER HAZIR
            </span>
          ) : (
            <span className="bg-gray-100 text-gray-500 px-2.5 py-0.5 rounded-full text-[8px] font-black">
              BEKLENİYOR
            </span>
          )}
        </div>

        <div className="space-y-2">
          {/* Team 1 */}
          <div className={`flex items-center justify-between gap-2 p-2 rounded-xl transition-colors ${isSameTeam(winner, t1) ? 'bg-brand-maroon text-brand-gold font-black' : 'bg-gray-50 text-gray-800'}`}>
            <div className="flex items-center gap-2 truncate">
              <img 
                src={teamLogos[t1] || 'https://via.placeholder.com/28?text=?'} 
                className="w-7 h-7 rounded-full object-cover border border-gray-300 bg-white shrink-0" 
                alt={t1} 
              />
              <span className="text-xs font-black truncate">{t1}</span>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded font-black shrink-0 bg-white/20">
              {isPlayed ? s1 : '-'}
            </span>
          </div>

          {/* Team 2 */}
          <div className={`flex items-center justify-between gap-2 p-2 rounded-xl transition-colors ${isSameTeam(winner, t2) ? 'bg-brand-maroon text-brand-gold font-black' : 'bg-gray-50 text-gray-800'}`}>
            <div className="flex items-center gap-2 truncate">
              <img 
                src={teamLogos[t2] || 'https://via.placeholder.com/28?text=?'} 
                className="w-7 h-7 rounded-full object-cover border border-gray-300 bg-white shrink-0" 
                alt={t2} 
              />
              <span className="text-xs font-black truncate">{t2}</span>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded font-black shrink-0 bg-white/20">
              {isPlayed ? s2 : '-'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            onClick={() => handleOpenQuickScore(
              'World Peace Cup Büyük Final',
              'wpc_final',
              'wpc',
              5,
              finalMatch,
              t1,
              t2
            )}
            className="flex-1 py-2 bg-brand-maroon hover:bg-black text-brand-gold text-[10px] font-black rounded-xl uppercase tracking-wider transition-colors shadow flex items-center justify-center gap-1.5"
          >
            <span>⚡</span>
            <span>Final Skorunu Gir</span>
          </button>
        </div>
      </div>
    );
  };

  // Helper to render World Peace Cup Knockout Bracket
  const renderWpcBracket = () => {
    const wpcData = getWpcBracketData();
    const groupA = getWpcGroupStandings('A');
    const groupB = getWpcGroupStandings('B');
    const all5Played = groupA.length === 6 && groupB.length === 6 && groupA.every(t => t.oynanan >= 5) && groupB.every(t => t.oynanan >= 5);

    return (
      <div className="w-full space-y-6">
        {/* Banner with Status & Quick Actions */}
        <div className="bg-gradient-to-r from-purple-950 via-brand-dark to-purple-950 text-white rounded-3xl p-5 border-2 border-brand-gold/50 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-gold text-brand-dark flex items-center justify-center text-2xl font-black shrink-0 shadow-lg">
              🏆
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-sm md:text-base text-brand-gold uppercase tracking-wide">
                  WORLD PEACE CUP ELEME AĞACI (BRACKET)
                </h3>
                <span className="text-[10px] font-black bg-purple-600/80 text-white px-2.5 py-0.5 rounded-full border border-purple-300 shadow-xs">
                  2 MAÇ ÜZERİNDEN (RÖVANŞLI)
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-1">
                {all5Played 
                  ? '✅ Grup aşaması tamamlandı! Çeyrek Final eşleşmeleri resmi puan durumuna göre oluşturuldu.' 
                  : '⏳ Grup aşaması devam ediyor. Takımlar 5 maçı tamamlayınca Çeyrek Finaller (A1-B4, A2-B3, A3-B2, A4-B1) otomatik kilitlenip fikstüre eklenir.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <button
                type="button"
                onClick={() => autoCreateWpcMatches(true)}
                className="bg-brand-gold hover:bg-amber-400 text-brand-dark font-black text-xs uppercase px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                title="Puan durumundaki mevcut sıralamaya göre çeyrek finalleri fikstüre ekler"
              >
                <span>⚡</span>
                <span>{wpcData.qf1.leg1Match ? 'Eşleşmeleri Yenile' : 'Fikstürü Şimdi Oluştur'}</span>
              </button>
            )}
          </div>
        </div>

        {/* BRACKET TREE */}
        <div className="w-full overflow-x-auto py-4">
          <div className="flex gap-6 md:gap-10 justify-center items-start min-w-[950px] max-w-7xl mx-auto select-text">
            {/* COLUMN 1: ÇEYREK FİNALLER (4 Ties) */}
            <div className="flex flex-col gap-4 w-72 shrink-0">
              <div className="bg-brand-maroon text-brand-gold py-1.5 px-3 rounded-xl text-center font-black text-xs uppercase tracking-wider shadow">
                ⚔️ ÇEYREK FİNAL (2 MAÇ)
              </div>
              {renderWpcTieCard(wpcData.qf1, 'A1 vs B4')}
              {renderWpcTieCard(wpcData.qf2, 'A2 vs B3')}
              {renderWpcTieCard(wpcData.qf3, 'A3 vs B2')}
              {renderWpcTieCard(wpcData.qf4, 'A4 vs B1')}
            </div>

            {/* COLUMN 2: YARI FİNALLER (2 Ties) */}
            <div className="flex flex-col gap-8 w-72 shrink-0 pt-16">
              <div className="bg-amber-950 text-amber-200 py-1.5 px-3 rounded-xl text-center font-black text-xs uppercase tracking-wider shadow border border-amber-600/50">
                🥈 YARI FİNAL (2 MAÇ)
              </div>
              {renderWpcTieCard(wpcData.sf1, 'ÇF 1 Galibi vs ÇF 2 Galibi')}
              {renderWpcTieCard(wpcData.sf2, 'ÇF 3 Galibi vs ÇF 4 Galibi')}
            </div>

            {/* COLUMN 3: BÜYÜK FİNAL & ŞAMPİYON */}
            <div className="flex flex-col gap-6 w-72 shrink-0 pt-28">
              <div className="bg-gradient-to-r from-brand-maroon to-black text-brand-gold py-1.5 px-3 rounded-xl text-center font-black text-xs uppercase tracking-wider shadow border border-brand-gold">
                🏆 BÜYÜK FİNAL (TEK MAÇ)
              </div>
              {renderWpcFinalCard(wpcData.finalMatch, wpcData.sf1Winner, wpcData.sf2Winner)}

              {/* Champion Showcase */}
              <div className="bg-gradient-to-b from-[#2a1a08] to-[#120b03] border-3 border-brand-gold rounded-3xl overflow-hidden shadow-2xl text-center">
                <div className="bg-brand-gold text-brand-dark py-2 text-xs font-black tracking-widest uppercase flex items-center justify-center gap-1.5 shadow">
                  <span>👑</span>
                  <span>WORLD PEACE CUP ŞAMPİYONU</span>
                  <span>👑</span>
                </div>
                <div className="py-5 px-4 flex flex-col justify-center items-center min-h-[130px] gap-2">
                  {wpcData.champion ? (
                    <div 
                      onClick={() => onNavigate({ type: 'team-detail', teamName: wpcData.champion })}
                      className="cursor-pointer group flex flex-col items-center gap-2"
                    >
                      <img 
                        src={teamLogos[wpcData.champion] || 'https://via.placeholder.com/64?text=?'} 
                        className="w-16 h-16 rounded-full object-cover border-2 border-brand-gold bg-white shadow-md group-hover:scale-105 transition-transform" 
                        alt={wpcData.champion} 
                      />
                      <span className="font-black text-base text-brand-gold tracking-wide leading-tight group-hover:underline">
                        {wpcData.champion}
                      </span>
                      <span className="bg-brand-gold text-brand-dark font-black text-[9px] px-2.5 py-0.5 rounded-full uppercase">
                        KUPA SAHİBİ
                      </span>
                    </div>
                  ) : (
                    <div className="text-center py-4 space-y-1">
                      <span className="text-2xl block">⏳</span>
                      <span className="text-gray-400 font-bold text-xs block">Büyük Final Galibi Bekleniyor</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Helper to render WPC Group Standings Table
  const renderWpcGroup = (groupLetter: 'A' | 'B') => {
    const groupTeams = getWpcGroupStandings(groupLetter);

    const groupName = currentLang === 'tr'
      ? `${groupLetter} GRUBU`
      : currentLang === 'en'
        ? `GROUP ${groupLetter}`
        : `GRUPO ${groupLetter}`;

    return (
      <div className="bg-[#1a1a1a] rounded-3xl overflow-hidden border border-gray-800 shadow-md">
        <div className="bg-brand-maroon text-brand-gold py-3 px-4 text-center font-black text-sm select-none flex items-center justify-between">
          <span className="text-[10px] bg-brand-gold text-brand-dark px-2 py-0.5 rounded font-black">WPC</span>
          <span className="tracking-wider">{groupName}</span>
          <span className="text-[10px] text-brand-gold/80 font-bold">İlk 4 Çeyrek Finale Çıkar</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-white border-collapse">
            <thead>
              <tr className="border-b-2 border-brand-gold bg-[#262626] text-[10px] font-black uppercase tracking-wider text-gray-400">
                <th className="py-3 px-3 text-center w-12">#</th>
                <th className="py-3 px-3 text-left">{t.takim}</th>
                <th className="py-3 px-2 text-center" title="Oynanan Maç">O</th>
                <th className="py-3 px-2 text-center" title="Galibiyet">G</th>
                <th className="py-3 px-2 text-center" title="Beraberlik">B</th>
                <th className="py-3 px-2 text-center" title="Mağlubiyet">M</th>
                <th className="py-3 px-2 text-center" title="Averaj (Bobblica hariç)">AV</th>
                <th className="py-3 px-3 text-center w-16" title="Puan">P</th>
              </tr>
            </thead>
            <tbody>
              {groupTeams.map((team, i) => {
                const avColor = team.gav > 0 ? 'text-green-500' : team.gav < 0 ? 'text-red-500' : 'text-gray-400';
                // Top 4 qualify for QF!
                const isQualifying = i < 4;
                const rowBg = isQualifying 
                  ? 'bg-emerald-950/20 hover:bg-emerald-900/30' 
                  : 'bg-rose-950/15 hover:bg-rose-900/25';
                const rankBadgeBg = isQualifying 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-gray-800 text-gray-400';
                const seedTag = isQualifying ? `${groupLetter}${i + 1}` : '-';

                return (
                  <tr 
                    key={team.name}
                    onClick={() => onNavigate({ type: 'team-detail', teamName: team.name })}
                    className={`border-b border-[#2a2a2a] cursor-pointer transition-colors ${rowBg}`}
                  >
                    <td className="py-2.5 px-3 text-center font-black">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black ${rankBadgeBg}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-left">
                      <div className="flex items-center gap-2">
                        <img 
                          src={teamLogos[team.name] || team.logo || 'https://via.placeholder.com/32?text=?'} 
                          className="w-8 h-8 rounded-full bg-white object-cover border border-brand-gold shrink-0" 
                          alt="logo" 
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/32?text=?';
                          }}
                        />
                        <div className="truncate max-w-[140px]">
                          <span className="font-bold text-xs tracking-wide text-white block truncate">{team.name}</span>
                          {isQualifying && (
                            <span className="text-[9px] font-black text-brand-gold/80 font-mono">
                              {seedTag} Çeyrek Final
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center text-xs font-bold text-gray-200">{team.oynanan}</td>
                    <td className="py-2.5 px-2 text-center text-xs font-bold text-green-400">{team.gw}</td>
                    <td className="py-2.5 px-2 text-center text-xs font-bold text-amber-300">{team.gb}</td>
                    <td className="py-2.5 px-2 text-center text-xs font-bold text-red-400">{team.gl}</td>
                    <td className={`py-2.5 px-2 text-center text-xs font-black ${avColor}`}>
                      {team.gav > 0 ? `+${team.gav}` : team.gav}
                    </td>
                    <td className="py-2.5 px-3 text-center font-black text-sm text-brand-gold">{team.gp}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Synchronize WPC bracket progression automatically (QF -> SF -> Final -> Champion)
  useEffect(() => {
    if (teams.length < 12) return;
    const groupA = getWpcGroupStandings('A');
    const groupB = getWpcGroupStandings('B');
    if (groupA.length < 4 || groupB.length < 4) return;

    const all5Played = groupA.length === 6 && groupB.length === 6 && groupA.every(t => t.oynanan >= 5) && groupB.every(t => t.oynanan >= 5);
    const wpcData = getWpcBracketData();

    // 1. If all group matches are played (all 12 teams have 5 matches played), auto-create 4 Quarter-Final ties if not yet created
    if (all5Played && !wpcData.qf1.leg1Match) {
      autoCreateWpcMatches(false);
    }

    // 2. If all 4 QF ties are completed, auto-create Semi-Finals if not yet created
    if (wpcData.qf1Winner && wpcData.qf2Winner && wpcData.qf3Winner && wpcData.qf4Winner) {
      const sf1_1_Id = 'wpc_5_sf1_leg1';
      const sf1_2_Id = 'wpc_5_sf1_leg2';
      const sf2_1_Id = 'wpc_5_sf2_leg1';
      const sf2_2_Id = 'wpc_5_sf2_leg2';

      const hasSf1 = allTournamentMatches.some(m => m.id === sf1_1_Id || (m as any).round === 'wpc_sf1_1');
      const hasSf2 = allTournamentMatches.some(m => m.id === sf2_1_Id || (m as any).round === 'wpc_sf2_1');

      if (!hasSf1 || !hasSf2) {
        const todayStr = new Date().toLocaleDateString('tr-TR');
        const now = Date.now();
        const sfMatches: Match[] = [
          {
            id: sf1_1_Id,
            team1: wpcData.qf2Winner,
            team2: wpcData.qf1Winner,
            category: 'TURNUVA',
            season: 5 as any,
            round: 'wpc_sf1_1',
            hafta: 'Yarı Final 1 (1. Maç)',
            score1: '0',
            score2: '0',
            played: false,
            date: todayStr,
            datejav: now,
            ligm: false,
            timeline: [],
            lineup: {}
          },
          {
            id: sf1_2_Id,
            team1: wpcData.qf1Winner,
            team2: wpcData.qf2Winner,
            category: 'TURNUVA',
            season: 5 as any,
            round: 'wpc_sf1_2',
            hafta: 'Yarı Final 1 (Rövanş)',
            score1: '0',
            score2: '0',
            played: false,
            date: todayStr,
            datejav: now + 1000,
            ligm: false,
            timeline: [],
            lineup: {}
          },
          {
            id: sf2_1_Id,
            team1: wpcData.qf4Winner,
            team2: wpcData.qf3Winner,
            category: 'TURNUVA',
            season: 5 as any,
            round: 'wpc_sf2_1',
            hafta: 'Yarı Final 2 (1. Maç)',
            score1: '0',
            score2: '0',
            played: false,
            date: todayStr,
            datejav: now + 2000,
            ligm: false,
            timeline: [],
            lineup: {}
          },
          {
            id: sf2_2_Id,
            team1: wpcData.qf3Winner,
            team2: wpcData.qf4Winner,
            category: 'TURNUVA',
            season: 5 as any,
            round: 'wpc_sf2_2',
            hafta: 'Yarı Final 2 (Rövanş)',
            score1: '0',
            score2: '0',
            played: false,
            date: todayStr,
            datejav: now + 3000,
            ligm: false,
            timeline: [],
            lineup: {}
          }
        ];

        setMatches(prev => {
          const next = [...prev];
          sfMatches.forEach(sm => {
            const idx = next.findIndex(m => m.id === sm.id);
            if (idx >= 0) next[idx] = sm;
            else next.push(sm);
          });
          return next;
        });

        sfMatches.forEach(sm => {
          saveStoredTournamentMatch(sm);
          setDoc(doc(db, 'matches', sm.id), sm, { merge: true }).catch(() => {});
        });
      }
    }

    // 3. If both Semi-Finals are completed, auto-create Büyük Final if not yet created
    if (wpcData.sf1Winner && wpcData.sf2Winner) {
      const finalId = 'wpc_5_final';
      const hasFinal = allTournamentMatches.some(m => m.id === finalId || (m as any).round === 'wpc_final');
      if (!hasFinal) {
        const todayStr = new Date().toLocaleDateString('tr-TR');
        const now = Date.now();
        const fMatch: Match = {
          id: finalId,
          team1: wpcData.sf1Winner,
          team2: wpcData.sf2Winner,
          category: 'TURNUVA',
          season: 5 as any,
          round: 'wpc_final',
          hafta: 'Büyük Final',
          score1: '0',
          score2: '0',
          played: false,
          date: todayStr,
          datejav: now + 4000,
          ligm: false,
          timeline: [],
          lineup: {}
        };

        setMatches(prev => {
          const next = [...prev];
          const idx = next.findIndex(m => m.id === finalId);
          if (idx >= 0) next[idx] = fMatch;
          else next.push(fMatch);
          return next;
        });

        saveStoredTournamentMatch(fMatch);
        setDoc(doc(db, 'matches', finalId), fMatch, { merge: true }).catch(() => {});
      }
    }
  }, [allTournamentMatches, teams]);

  // Helper to render Bracket match card based strictly on tournament Match data
  const renderBracketMatchCard = (
    roundTitle: string, 
    roundKey: 'semi1' | 'semi2' | 'final', 
    match: Match | undefined,
    cupTag: 'bcl' | 'bel' | 'becl',
    season: 4 | 5,
    slotAKey: string,
    slotBKey: string,
    semi1?: Match,
    semi2?: Match
  ) => {
    // 1. If an actual match exists in tournament matches, render rich interactive card
    if (match) {
      const isPlayed = match.played;
      const matchDocId = match.id || `${match.team1}-vs-${match.team2}-${match.datejav}`;

      // Respect bracket slot team ordering if available, otherwise match ordering
      let displayT1 = bracketData[slotAKey] || match.team1;
      let displayT2 = bracketData[slotBKey] || match.team2;
      let scoreT1 = match.score1;
      let scoreT2 = match.score2;

      if (isSameTeam(match.team1, displayT2) && isSameTeam(match.team2, displayT1)) {
        scoreT1 = match.score2;
        scoreT2 = match.score1;
      } else if (!isSameTeam(match.team1, displayT1) && !isSameTeam(match.team2, displayT2)) {
        displayT1 = match.team1;
        displayT2 = match.team2;
        scoreT1 = match.score1;
        scoreT2 = match.score2;
      }

      const s1Num = Number(scoreT1) || 0;
      const s2Num = Number(scoreT2) || 0;
      let t1Win = isPlayed && s1Num > s2Num;
      let t2Win = isPlayed && s2Num > s1Num;
      if (isPlayed && s1Num === s2Num && (match as any).penaltyWinner) {
        t1Win = isSameTeam((match as any).penaltyWinner, displayT1);
        t2Win = isSameTeam((match as any).penaltyWinner, displayT2);
      }

      const { multiplier: cupMult } = getMatchMultiplier(match.category || cupTag);
      const res1 = calculateMatchScore(s1Num, s2Num);
      const res2 = calculateMatchScore(s2Num, s1Num);
      const delta1 = Number((res1.baseScore * cupMult).toFixed(2));
      const delta2 = Number((res2.baseScore * cupMult).toFixed(2));

      return (
        <div 
          onClick={() => handleOpenQuickScore(roundTitle, roundKey, cupTag, season, match, displayT1, displayT2)}
          className="bg-white rounded-2xl border-2 border-brand-maroon/30 hover:border-brand-maroon shadow-md hover:shadow-xl transition-all p-3.5 w-56 cursor-pointer group flex flex-col justify-between gap-2.5 relative select-text"
        >
          <div className="flex justify-between items-center border-b border-gray-100 pb-1 text-[9px] font-black uppercase tracking-wider text-brand-maroon">
            <span>{roundTitle}</span>
            {isPlayed ? (
              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[8px] font-black">BİTTİ</span>
            ) : (
              <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[8px] font-black">BEKLENİYOR</span>
            )}
          </div>

          {/* Team 1 */}
          <div className={`flex items-center justify-between gap-2 ${t1Win ? 'font-black text-brand-maroon' : 'text-gray-700'}`}>
            <div className="flex items-center gap-2 truncate">
              <img 
                src={teamLogos[displayT1] || 'https://via.placeholder.com/28?text=?'} 
                className="w-6 h-6 rounded-full object-cover border border-gray-200 bg-white shrink-0" 
                alt={displayT1} 
              />
              <span className="text-xs font-black truncate">{displayT1}</span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded font-black shrink-0 ${t1Win ? 'bg-brand-maroon text-brand-gold' : 'bg-gray-100 text-gray-700'}`}>
              {isPlayed ? scoreT1 : '-'}
            </span>
          </div>

          {/* Team 2 */}
          <div className={`flex items-center justify-between gap-2 ${t2Win ? 'font-black text-brand-maroon' : 'text-gray-700'}`}>
            <div className="flex items-center gap-2 truncate">
              <img 
                src={teamLogos[displayT2] || 'https://via.placeholder.com/28?text=?'} 
                className="w-6 h-6 rounded-full object-cover border border-gray-200 bg-white shrink-0" 
                alt={displayT2} 
              />
              <span className="text-xs font-black truncate">{displayT2}</span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded font-black shrink-0 ${t2Win ? 'bg-brand-maroon text-brand-gold' : 'bg-gray-100 text-gray-700'}`}>
              {isPlayed ? scoreT2 : '-'}
            </span>
          </div>

          {/* ELO Result Pill */}
          {isPlayed && (
            <div className="flex items-center justify-between text-[8px] font-black px-2 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-950">
              <span className="flex items-center gap-1">
                <span>⚡ ELO ({cupMult}x):</span>
              </span>
              <div className="flex items-center gap-1 font-mono">
                <span className={delta1 > 0 ? 'text-emerald-700 font-extrabold' : delta1 < 0 ? 'text-rose-700 font-extrabold' : 'text-gray-600'}>
                  {delta1 >= 0 ? `+${delta1}` : delta1}
                </span>
                <span className="text-gray-400">/</span>
                <span className={delta2 > 0 ? 'text-emerald-700 font-extrabold' : delta2 < 0 ? 'text-rose-700 font-extrabold' : 'text-gray-600'}>
                  {delta2 >= 0 ? `+${delta2}` : delta2}
                </span>
              </div>
            </div>
          )}

          {/* MVP Badge on bracket card if assigned */}
          {isPlayed && match.mvp && (
            <div className="flex items-center justify-between text-[9px] font-black px-2 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-950 shadow-2xs">
              <span className="flex items-center gap-1 truncate max-w-[150px]">
                <span>👑 MVP:</span>
                <strong className="truncate">{match.mvp}</strong>
              </span>
              {match.rating && (
                <span className="bg-amber-500 text-black px-1.5 py-0.2 rounded font-mono text-[8px] shrink-0 font-extrabold">
                  ⭐ {match.rating}
                </span>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="text-[9px] border-t border-dashed border-gray-100 pt-1.5 flex justify-between items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenChangeTeams(roundTitle, roundKey, cupTag, season, slotAKey, slotBKey, match, displayT1, displayT2);
              }}
              className="text-gray-600 hover:text-brand-maroon bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded font-black text-[9px] transition-colors border border-gray-300"
              title="Bu eşleşmedeki takımları değiştir"
            >
              🔄 Değiştir
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenQuickScore(roundTitle, roundKey, cupTag, season, match, displayT1, displayT2);
              }}
              className="bg-brand-gold hover:bg-amber-400 text-brand-dark px-2 py-0.5 rounded font-black text-[9px] uppercase transition-colors shadow-xs"
            >
              ⚡ Sonuç Gir
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate({ type: 'match-detail', matchId: matchDocId, initialMatch: match });
              }}
              className="text-brand-maroon hover:underline font-black text-[9px] ml-auto"
            >
              Detay →
            </button>
          </div>
        </div>
      );
    }

    // 2. Final Round logic (automatic finalist propagation)
    if (roundKey === 'final') {
      const s1Winner = (semi1 && semi1.played ? getWinnerOfMatch(semi1) : '') || bracketData[slotAKey] || '';
      const s2Winner = (semi2 && semi2.played ? getWinnerOfMatch(semi2) : '') || bracketData[slotBKey] || '';

      if (s1Winner && s2Winner) {
        return (
          <div 
            onClick={() => handleOpenQuickScore(roundTitle, 'final', cupTag, season, undefined, s1Winner, s2Winner)}
            className="bg-white rounded-2xl border-2 border-brand-gold hover:border-brand-maroon shadow-md hover:shadow-xl transition-all p-3.5 w-56 cursor-pointer group flex flex-col justify-between gap-2.5 relative select-text"
          >
            <div className="flex justify-between items-center border-b border-gray-100 pb-1 text-[9px] font-black uppercase tracking-wider text-brand-maroon">
              <span>{roundTitle}</span>
              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[8px] font-black">FİNALİSTLER</span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 truncate">
                  <img src={teamLogos[s1Winner] || 'https://via.placeholder.com/24?text=?'} className="w-5 h-5 rounded-full object-cover bg-white border border-gray-200 shrink-0" alt="" />
                  <span className="text-xs font-black truncate">{s1Winner}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded font-black bg-gray-100 text-gray-500">-</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 truncate">
                  <img src={teamLogos[s2Winner] || 'https://via.placeholder.com/24?text=?'} className="w-5 h-5 rounded-full object-cover bg-white border border-gray-200 shrink-0" alt="" />
                  <span className="text-xs font-black truncate">{s2Winner}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded font-black bg-gray-100 text-gray-500">-</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 mt-1">
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenChangeTeams(roundTitle, 'final', cupTag, season, slotAKey, slotBKey, undefined, s1Winner, s2Winner);
                }}
                className="py-1 px-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[9px] font-black rounded-lg transition-colors border border-gray-300"
                title="Finalistleri Değiştir"
              >
                🔄 Değiştir
              </button>
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenQuickScore(roundTitle, 'final', cupTag, season, undefined, s1Winner, s2Winner);
                }}
                className="flex-1 py-1.5 bg-brand-maroon hover:bg-black text-brand-gold text-[9px] font-black rounded-lg transition-colors cursor-pointer uppercase flex items-center justify-center gap-1 shadow-xs"
              >
                <span>⚡</span>
                <span>Final Sonucu Gir</span>
              </button>
            </div>
          </div>
        );
      } else if (s1Winner || s2Winner) {
        const knownWinner = s1Winner || s2Winner;
        const waitingRound = s1Winner ? 'Yarı Final 2 Galibi' : 'Yarı Final 1 Galibi';
        return (
          <div 
            onClick={() => handleOpenQuickScore(roundTitle, 'final', cupTag, season, undefined, s1Winner || '', s2Winner || '')}
            className="bg-white/95 rounded-2xl border-2 border-brand-gold/60 hover:border-brand-maroon shadow-sm hover:shadow-md transition-all p-3.5 w-56 cursor-pointer flex flex-col justify-between gap-2.5"
          >
            <div className="flex justify-between items-center border-b border-gray-100 pb-1 text-[9px] font-black uppercase tracking-wider text-brand-maroon">
              <span>{roundTitle}</span>
              <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[8px] font-black">1 FİNALİST HAZIR</span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 truncate">
                  <img src={teamLogos[knownWinner] || 'https://via.placeholder.com/24?text=?'} className="w-5 h-5 rounded-full object-cover bg-white border border-gray-200 shrink-0" alt="" />
                  <span className="text-xs font-black truncate">{knownWinner}</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-emerald-100 text-emerald-800">FİNALDE</span>
              </div>
              <div className="flex items-center justify-between gap-2 opacity-70">
                <div className="flex items-center gap-2 truncate">
                  <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] shrink-0">⏳</span>
                  <span className="text-[11px] font-bold text-gray-500 italic truncate">{waitingRound}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded font-black bg-gray-100 text-gray-400">-</span>
              </div>
            </div>

            <div className="text-[9px] border-t border-dashed border-gray-100 pt-1 flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenChangeTeams(roundTitle, 'final', cupTag, season, slotAKey, slotBKey, undefined, s1Winner || '', s2Winner || '');
                }}
                className="py-1 px-2 bg-gray-100 hover:bg-brand-maroon hover:text-brand-gold text-gray-700 text-[9px] font-black rounded-lg transition-all w-full text-center"
              >
                🔄 Finalistleri Seç / Değiştir
              </button>
            </div>
          </div>
        );
      } else {
        return (
          <div 
            onClick={() => handleOpenQuickScore(roundTitle, 'final', cupTag, season)}
            className="bg-white/80 border-2 border-dashed border-gray-300 hover:border-brand-maroon rounded-2xl p-3.5 w-56 shadow-sm flex flex-col justify-between gap-2.5 transition-colors cursor-pointer"
          >
            <div className="flex justify-between items-center border-b border-gray-100 pb-1 text-[9px] font-black uppercase tracking-wider text-gray-500">
              <span>{roundTitle}</span>
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[8px] font-black">BEKLENİYOR</span>
            </div>
            <div className="space-y-1.5 text-gray-400 text-xs font-bold py-1">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center text-[9px]">1</span>
                <span className="truncate">Yarı Final 1 Galibi</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center text-[9px]">2</span>
                <span className="truncate">Yarı Final 2 Galibi</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-0.5">
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenChangeTeams(roundTitle, 'final', cupTag, season, slotAKey, slotBKey);
                }}
                className="py-1 px-2 bg-gray-100 hover:bg-brand-maroon hover:text-brand-gold text-gray-700 text-[9px] font-black rounded-lg uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1"
              >
                <span>🔄</span>
                <span>Takım Seç</span>
              </button>
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenQuickScore(roundTitle, 'final', cupTag, season);
                }}
                className="py-1 px-2.5 bg-brand-maroon hover:bg-black text-brand-gold text-[9px] font-black rounded-lg uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1"
              >
                <span>⚡</span>
                <span>Skor Gir</span>
              </button>
            </div>
          </div>
        );
      }
    }

    // 3. Fallback slot with preset seeds from bracketData if available
    const defaultT1 = bracketData[slotAKey] || '';
    const defaultT2 = bracketData[slotBKey] || '';

    if (defaultT1 && defaultT2) {
      return (
        <div 
          onClick={() => handleOpenQuickScore(roundTitle, roundKey, cupTag, season, undefined, defaultT1, defaultT2)}
          className="bg-white rounded-2xl border-2 border-dashed border-brand-maroon/40 hover:border-brand-maroon shadow-sm hover:shadow-md transition-all p-3.5 w-56 cursor-pointer flex flex-col justify-between gap-2.5"
        >
          <div className="flex justify-between items-center border-b border-gray-100 pb-1 text-[9px] font-black uppercase tracking-wider text-brand-maroon">
            <span>{roundTitle}</span>
            <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[8px] font-black">BEKLENİYOR</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 truncate">
                <img 
                  src={teamLogos[defaultT1] || 'https://via.placeholder.com/24?text=?'} 
                  className="w-5 h-5 rounded-full object-cover bg-white border border-gray-200" 
                  alt={defaultT1} 
                />
                <span className="text-xs font-black truncate">{defaultT1}</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded font-black bg-gray-100 text-gray-500">-</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 truncate">
                <img 
                  src={teamLogos[defaultT2] || 'https://via.placeholder.com/24?text=?'} 
                  className="w-5 h-5 rounded-full object-cover bg-white border border-gray-200" 
                  alt={defaultT2} 
                />
                <span className="text-xs font-black truncate">{defaultT2}</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded font-black bg-gray-100 text-gray-500">-</span>
            </div>
          </div>

          <div className="text-[9px] border-t border-dashed border-gray-100 pt-1.5 flex justify-between items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenChangeTeams(roundTitle, roundKey, cupTag, season, slotAKey, slotBKey, undefined, defaultT1, defaultT2);
              }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-lg font-black text-[9px] uppercase tracking-wider transition-colors border border-gray-300"
            >
              🔄 Değiştir
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenQuickScore(roundTitle, roundKey, cupTag, season, undefined, defaultT1, defaultT2);
              }}
              className="bg-brand-maroon hover:bg-black text-brand-gold px-2.5 py-1 rounded-lg font-black text-[9px] uppercase tracking-wider transition-colors shadow-xs flex items-center gap-1 ml-auto"
            >
              <span>⚡</span>
              <span>Sonuç Gir</span>
            </button>
          </div>
        </div>
      );
    }

    // 4. Fully empty slot
    return (
      <div 
        onClick={() => handleOpenQuickScore(roundTitle, roundKey, cupTag, season)}
        className="bg-white/80 border-2 border-dashed border-gray-300 hover:border-brand-maroon rounded-2xl p-4 w-56 shadow-sm flex flex-col items-center justify-center gap-2 text-center transition-colors cursor-pointer"
      >
        <span className="text-[10px] font-black text-gray-500 uppercase">{roundTitle}</span>
        <span className="text-[10px] text-gray-400 font-bold">Henüz maç eklenmedi</span>
        <div className="flex items-center gap-1.5 mt-1">
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenChangeTeams(roundTitle, roundKey, cupTag, season, slotAKey, slotBKey);
            }}
            className="py-1 px-2.5 bg-gray-100 hover:bg-brand-maroon hover:text-brand-gold text-gray-700 text-[9px] font-black rounded-xl uppercase tracking-wider transition-all cursor-pointer border border-gray-300 flex items-center gap-1"
          >
            <span>🔄</span>
            <span>Takım Seç</span>
          </button>
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenQuickScore(roundTitle, roundKey, cupTag, season);
            }}
            className="py-1 px-2.5 bg-brand-maroon hover:bg-black text-brand-gold text-[9px] font-black rounded-xl uppercase tracking-wider transition-all cursor-pointer shadow flex items-center gap-1"
          >
            <span>⚡</span>
            <span>Sonuç Gir</span>
          </button>
        </div>
      </div>
    );
  };

  // Helper to render Bracket strictly based on tournament matches at the bottom
  const renderKoBracket = (tag: 'bcl' | 'bel' | 'becl', season: 4 | 5) => {
    const p = `${tag}${season}`;
    const seasonMatches = getCupSeasonMatches(tag, season);

    // Prioritized match finder: matches canonical ID, explicit round, hafta text, or bracket slot teams
    const findRoundMatch = (rKey: 'semi1' | 'semi2' | 'final', semi1Ref?: Match, semi2Ref?: Match) => {
      let slotTeamA = '';
      let slotTeamB = '';
      if (rKey === 'semi1') {
        slotTeamA = bracketData[`${p}s1`] || '';
        slotTeamB = bracketData[`${p}s2`] || '';
      } else if (rKey === 'semi2') {
        slotTeamA = bracketData[`${p}s3`] || '';
        slotTeamB = bracketData[`${p}s4`] || '';
      } else if (rKey === 'final') {
        slotTeamA = (semi1Ref && semi1Ref.played ? getWinnerOfMatch(semi1Ref) : '') || bracketData[`${p}s5`] || '';
        slotTeamB = (semi2Ref && semi2Ref.played ? getWinnerOfMatch(semi2Ref) : '') || bracketData[`${p}s6`] || '';
      }

      const scoredMatches: { match: Match; priority: number }[] = [];

      for (const m of seasonMatches) {
        const mRound = String((m as any).round || '').toLowerCase().trim();
        const mHafta = String(m.hafta || '').toLowerCase().trim();
        const mId = String(m.id || '').toLowerCase().trim();

        // 1. Check if strictly excluded from this round
        if (rKey === 'semi1') {
          if (mRound === 'semi2' || mRound === 'final') continue;
          if (mHafta.includes('yarı final 2') || mHafta.includes('semi 2') || mHafta.includes('büyük final')) continue;
        } else if (rKey === 'semi2') {
          if (mRound === 'semi1' || mRound === 'final') continue;
          if (mHafta.includes('yarı final 1') || mHafta.includes('semi 1') || mHafta.includes('büyük final')) continue;
        } else if (rKey === 'final') {
          if (mRound === 'semi1' || mRound === 'semi2') continue;
          if (mHafta.includes('yarı') || mHafta.includes('semi')) continue;
          if (semi1Ref && (m.id === semi1Ref.id || isMatchBetweenTeams(m, semi1Ref.team1, semi1Ref.team2))) continue;
          if (semi2Ref && (m.id === semi2Ref.id || isMatchBetweenTeams(m, semi2Ref.team1, semi2Ref.team2))) continue;
        }

        // 2. Score priority
        const canonicalId = `${tag}_${season}_${rKey}`.toLowerCase();
        if (mId === canonicalId) {
          scoredMatches.push({ match: m, priority: 100 });
          continue;
        }

        if (mRound === rKey) {
          scoredMatches.push({ match: m, priority: 90 });
          continue;
        }

        if (rKey === 'semi1' && (mHafta.includes('yarı final 1') || mHafta.includes('semi 1') || mHafta === 'yf1')) {
          scoredMatches.push({ match: m, priority: 80 });
          continue;
        }

        if (rKey === 'semi2' && (mHafta.includes('yarı final 2') || mHafta.includes('semi 2') || mHafta === 'yf2')) {
          scoredMatches.push({ match: m, priority: 80 });
          continue;
        }

        if (rKey === 'final' && (mHafta.includes('büyük final') || mHafta === 'final')) {
          scoredMatches.push({ match: m, priority: 80 });
          continue;
        }

        // 3. Match by teams in bracket slot
        if (slotTeamA && slotTeamB && isMatchBetweenTeams(m, slotTeamA, slotTeamB)) {
          scoredMatches.push({ match: m, priority: 70 });
          continue;
        }
      }

      if (scoredMatches.length === 0) return undefined;

      // Sort by priority desc, then played desc, then datejav desc
      scoredMatches.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        if (a.match.played && !b.match.played) return -1;
        if (!a.match.played && b.match.played) return 1;
        return (Number(b.match.datejav) || 0) - (Number(a.match.datejav) || 0);
      });

      return scoredMatches[0].match;
    };

    const semi1Match = findRoundMatch('semi1');
    const semi2Match = findRoundMatch('semi2');
    const finalMatch = findRoundMatch('final', semi1Match, semi2Match);

    // Determine Champion strictly when the final match is actually played or stored in bracketData
    let championTeam = '';
    if (finalMatch && finalMatch.played) {
      championTeam = getWinnerOfMatch(finalMatch);
    } else if (bracketData[`${p}s7`]) {
      championTeam = bracketData[`${p}s7`];
    }

    const champLogo = championTeam ? (teamLogos[championTeam] || 'https://via.placeholder.com/48?text=?') : '';

    return (
      <div className="w-full overflow-x-auto py-6">
        <div className="flex gap-8 md:gap-12 justify-center items-center h-auto min-h-[380px] min-w-[750px] max-w-5xl mx-auto select-none select-text">
          {/* SEMIS */}
          <div className="flex flex-col gap-6 justify-center">
            {renderBracketMatchCard(
              '⚔️ Yarı Final 1',
              'semi1',
              semi1Match,
              tag,
              season,
              `${p}s1`,
              `${p}s2`
            )}
            {renderBracketMatchCard(
              '⚔️ Yarı Final 2',
              'semi2',
              semi2Match,
              tag,
              season,
              `${p}s3`,
              `${p}s4`
            )}
          </div>

          {/* FINAL */}
          <div className="flex flex-col gap-6 justify-center">
            {renderBracketMatchCard(
              '🏆 BÜYÜK FİNAL',
              'final',
              finalMatch,
              tag,
              season,
              `${p}s5`,
              `${p}s6`,
              semi1Match,
              semi2Match
            )}
          </div>

          {/* CHAMPION */}
          <div className="flex flex-col gap-6 justify-center">
            <div className="bg-gradient-to-b from-[#2a1a08] to-[#120b03] border-3 border-brand-gold rounded-2xl w-52 overflow-hidden shadow-2xl text-center">
              <div className="bg-brand-gold text-brand-dark py-2 text-xs font-black tracking-widest uppercase flex items-center justify-center gap-1.5 shadow">
                <span>👑</span>
                <span>ŞAMPİYON</span>
                <span>👑</span>
              </div>
              <div className="py-5 px-4 flex flex-col justify-center items-center min-h-[120px] gap-2">
                {championTeam ? (
                  <div 
                    onClick={() => onNavigate({ type: 'team-detail', teamName: championTeam })}
                    className="cursor-pointer group flex flex-col items-center gap-2"
                  >
                    <img 
                      src={champLogo} 
                      className="w-16 h-16 rounded-full object-cover border-2 border-brand-gold bg-white shadow-md group-hover:scale-105 transition-transform" 
                      alt={championTeam} 
                    />
                    <span className="font-black text-sm text-brand-gold tracking-wide leading-tight group-hover:underline">
                      {championTeam}
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-400 font-bold text-xs">Final Galibi Bekleniyor</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bracket ELO Katsayısı ve Kuralları Bilgi Kartı */}
        {(() => {
          const tInfo = getTournamentInfo(tag);
          return (
            <div className="mt-8 max-w-3xl mx-auto bg-gradient-to-r from-brand-maroon/5 via-brand-gold/15 to-brand-maroon/5 border-2 border-brand-gold/60 rounded-2xl p-4 shadow-sm select-text">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-maroon text-brand-gold flex items-center justify-center text-lg font-black shrink-0 shadow-xs border border-brand-gold/40">
                    ⚡
                  </div>
                  <div>
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <span className="font-black text-xs md:text-sm text-brand-maroon uppercase">
                        {tInfo.cupTitle} ELO Katsayısı:
                      </span>
                      <span className="bg-brand-maroon text-brand-gold font-black text-xs px-2.5 py-0.5 rounded-lg border border-brand-gold shadow-xs">
                        {tInfo.multiplier}x
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-600 font-bold mt-0.5">
                      Bu eleme ağacındaki (bracket) tüm maç sonuçları, <strong>{tInfo.multiplier}x çarpanla</strong> doğrudan takım ELO reytingine işlenir.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-1.5 shrink-0 text-[10px] font-black text-brand-dark bg-white/90 px-3 py-1.5 rounded-xl border border-gray-200 shadow-xs">
                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono">🟢 G: +{(3 * tInfo.multiplier).toFixed(2)} (+fark)</span>
                  <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-mono">🟡 B: +{(1 * tInfo.multiplier).toFixed(2)}</span>
                  <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded font-mono">🔴 M: -{(3 * tInfo.multiplier).toFixed(2)} (-fark)</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  // Helper to render tournament matches list with Add Match button
  const renderTournamentMatches = (cupFilter: 'wpc' | 'bcl' | 'bel' | 'becl') => {
    const activeSeason = cupFilter === 'bcl' ? bclSeason : cupFilter === 'bel' ? belSeason : cupFilter === 'becl' ? beclSeason : undefined;
    const cupMatches = getCupSeasonMatches(cupFilter, activeSeason);

    // Sort by datejav descending
    cupMatches.sort((a, b) => (Number(b.datejav) || 0) - (Number(a.datejav) || 0));

    const cupTitle = cupFilter === 'wpc' 
      ? 'WORLD PEACE CUP' 
      : cupFilter === 'bcl' 
      ? 'UCL (ŞAMPİYONLAR LİGİ)' 
      : cupFilter === 'bel' 
      ? 'UEL (AVRUPA LİGİ)' 
      : 'UECL (KONFERANS LİGİ)';

    return (
      <div className="mt-8 max-w-2xl mx-auto space-y-4">
        {/* Section Header with Add Match Button */}
        <div className="flex items-center justify-between border-b-2 border-brand-maroon pb-3 px-1">
          <h4 className="font-black text-xs md:text-sm text-brand-maroon uppercase tracking-wider flex items-center gap-2">
            <span>⚽</span>
            <span>{cupTitle} MAÇLARI ({cupMatches.length})</span>
          </h4>
          <button
            type="button"
            onClick={() => handleOpenAddMatch(cupFilter, activeSeason)}
            className="bg-brand-maroon text-brand-gold hover:bg-black font-black text-xs uppercase px-3.5 py-1.5 rounded-xl transition-all shadow cursor-pointer flex items-center gap-1.5"
          >
            <span>➕</span>
            <span>Maç Ekle</span>
          </button>
        </div>

        {cupMatches.length === 0 ? (
          <div className="text-center py-8 text-gray-500 font-bold text-xs bg-white/60 rounded-2xl border border-dashed border-gray-300 space-y-3">
            <p>Bu turnuvaya ait henüz maç kaydı bulunmuyor.</p>
            <button
              type="button"
              onClick={() => handleOpenAddMatch(cupFilter, activeSeason)}
              className="bg-brand-maroon text-brand-gold font-black text-xs uppercase px-4 py-2 rounded-xl transition-all shadow cursor-pointer flex items-center gap-1.5 mx-auto"
            >
              <span>➕</span>
              <span>İlk Maçı Ekle</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {cupMatches.map((m, idx) => {
              const docId = m.id || `${m.team1}-vs-${m.team2}-${m.datejav}`;
              const roundInfo = resolveMatchRound(m, cupFilter, activeSeason, bracketData);
              const roundTag = roundInfo.roundTitle;
              return (
                <div
                  key={m.id || idx}
                  onClick={() => onNavigate({ type: 'match-detail', matchId: docId, initialMatch: m })}
                  className="bg-white rounded-2xl border-b-4 border-brand-maroon p-4 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-between gap-3 group relative select-text"
                >
                  {/* Round Badge */}
                  <span className="absolute -top-2.5 left-4 bg-brand-gold text-brand-dark px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase border border-brand-dark shadow-xs">
                    {roundTag}
                  </span>

                  {/* Team 1 */}
                  <div className="flex-1 flex items-center justify-end gap-2.5 text-right min-w-0">
                    <span className="font-black text-xs md:text-sm text-brand-dark truncate">{m.team1}</span>
                    <img
                      src={teamLogos[m.team1] || 'https://via.placeholder.com/32?text=?'}
                      className="w-7 h-7 md:w-8 md:h-8 rounded-full object-cover border border-gray-200 bg-white shrink-0"
                      alt={m.team1}
                    />
                  </div>

                  {/* Score & Quick Actions */}
                  <div className="flex flex-col items-center shrink-0 min-w-[70px]">
                    <div className="px-3 py-1 bg-brand-dark text-brand-gold rounded-xl font-black text-xs md:text-sm text-center border border-brand-gold">
                      {m.played ? `${m.score1} - ${m.score2}` : 'VS'}
                    </div>
                    {m.played && (() => {
                      const { multiplier: mult } = getMatchMultiplier(m.category || cupFilter);
                      const s1 = Number(m.score1) || 0;
                      const s2 = Number(m.score2) || 0;
                      const d1 = Number((calculateMatchScore(s1, s2).baseScore * mult).toFixed(2));
                      const d2 = Number((calculateMatchScore(s2, s1).baseScore * mult).toFixed(2));
                      return (
                        <div className="text-[8px] font-black text-amber-900 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded mt-1 font-mono text-center shadow-2xs">
                          ⚡ ELO ({mult}x): {d1 >= 0 ? `+${d1}` : d1} / {d2 >= 0 ? `+${d2}` : d2}
                        </div>
                      );
                    })()}
                    {m.played && m.mvp && (
                      <div className="text-[8px] md:text-[9px] font-black text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded mt-1 text-center shadow-2xs truncate max-w-[140px]">
                        👑 MVP: <strong>{m.mvp}</strong>{m.rating ? ` (${m.rating})` : ''}
                      </div>
                    )}
                    <span className="text-[8px] md:text-[9px] font-bold text-gray-400 mt-0.5 truncate max-w-[90px]">
                      {m.date || 'Tarih Belirsiz'}
                    </span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenQuickScore(roundInfo.roundTitle, roundInfo.roundKey, cupFilter, (m as any).season || activeSeason || 5, m, m.team1, m.team2);
                        }}
                        className="bg-brand-gold hover:bg-amber-400 text-brand-dark text-[8px] font-black uppercase px-2 py-0.5 rounded shadow-xs"
                      >
                        ⚡ Skor
                      </button>
                      <span className="text-[8px] font-black text-brand-maroon group-hover:underline">
                        Detay →
                      </span>
                    </div>
                  </div>

                  {/* Team 2 */}
                  <div className="flex-1 flex items-center justify-start gap-2.5 text-left min-w-0">
                    <img
                      src={teamLogos[m.team2] || 'https://via.placeholder.com/32?text=?'}
                      className="w-7 h-7 md:w-8 md:h-8 rounded-full object-cover border border-gray-200 bg-white shrink-0"
                      alt={m.team2}
                    />
                    <span className="font-black text-xs md:text-sm text-brand-dark truncate">{m.team2}</span>
                  </div>

                  {/* Admin Delete Action */}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMatch(docId);
                      }}
                      className="text-gray-300 hover:text-red-600 transition-colors p-1 rounded cursor-pointer shrink-0 ml-1"
                      title="Maçı Sil"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Tab Selectors */}
      <div className="flex justify-center gap-2 flex-wrap">
        {(['wpc', 'bcl', 'bel', 'becl', 'wc'] as CupType[]).map((cup) => (
          <button
            key={cup}
            onClick={() => setActiveCup(cup)}
            className={`py-1.5 px-4 rounded-lg font-black text-xs uppercase cursor-pointer border-2 transition-all ${
              activeCup === cup 
                ? 'bg-brand-gold text-brand-dark border-brand-maroon shadow-md' 
                : 'bg-brand-card border-brand-maroon text-brand-maroon/70'
            }`}
          >
            {cup === 'wpc' ? 'WORLD PEACE CUP' : cup === 'wc' ? '🌟 DÜNYA KUPASI 2026' : cup === 'bcl' ? 'BCL / UCL' : cup === 'bel' ? 'BEL / UEL' : 'BECL / UECL'}
          </button>
        ))}
      </div>

      {loading ? (
        <h3 className="text-center text-gray-500 font-bold">{t.loading}</h3>
      ) : (
        <div className="animate-fade-in">
          {activeCup === 'wc' && (
            <div className="mt-2">
              <WorldCup 
                currentUser={currentUser || null}
                onNavigate={onNavigate}
                teamLogos={teamLogos}
              />
            </div>
          )}

          {activeCup === 'wpc' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                {renderWpcGroup('A')}
                {renderWpcGroup('B')}
              </div>

              {renderWpcBracket()}

              {/* WPC ELO Katsayısı Bilgi Kartı */}
              <div className="max-w-3xl mx-auto bg-gradient-to-r from-brand-maroon/5 via-brand-gold/15 to-brand-maroon/5 border-2 border-brand-gold/60 rounded-2xl p-4 shadow-sm select-text">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-maroon text-brand-gold flex items-center justify-center text-lg font-black shrink-0 shadow-xs border border-brand-gold/40">
                      ⚡
                    </div>
                    <div>
                      <div className="flex items-center gap-2 justify-center sm:justify-start">
                        <span className="font-black text-xs md:text-sm text-brand-maroon uppercase">
                          World Peace Cup ELO Katsayısı:
                        </span>
                        <span className="bg-brand-maroon text-brand-gold font-black text-xs px-2.5 py-0.5 rounded-lg border border-brand-gold shadow-xs">
                          0.50x
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-600 font-bold mt-0.5">
                        World Peace Cup turnuva maçları, <strong>0.50x katsayısıyla</strong> doğrudan takım ELO reytingine işlenir.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-1.5 shrink-0 text-[10px] font-black text-brand-dark bg-white/90 px-3 py-1.5 rounded-xl border border-gray-200 shadow-xs">
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono">🟢 G: +1.65 (+fark)</span>
                    <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-mono">🟡 B: +0.50</span>
                    <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded font-mono">🔴 M: -1.65 (-fark)</span>
                  </div>
                </div>
              </div>

              {renderTournamentMatches('wpc')}
            </div>
          )}

          {activeCup === 'bcl' && (
            <div className="space-y-4">
              <div className="flex gap-2 justify-center">
                <button 
                  onClick={() => setBclSeason(5)} 
                  className={`py-1 px-3 rounded text-[11px] font-extrabold cursor-pointer border ${bclSeason === 5 ? 'bg-brand-maroon text-brand-gold border-transparent' : 'bg-gray-150 border-gray-300'}`}
                >
                  5. Sezon
                </button>
                <button 
                  onClick={() => setBclSeason(4)} 
                  className={`py-1 px-3 rounded text-[11px] font-extrabold cursor-pointer border ${bclSeason === 4 ? 'bg-brand-maroon text-brand-gold border-transparent' : 'bg-gray-150 border-gray-300'}`}
                >
                  4. Sezon
                </button>
              </div>
              {renderKoBracket('bcl', bclSeason)}
              {renderTournamentMatches('bcl')}
            </div>
          )}

          {activeCup === 'bel' && (
            <div className="space-y-4">
              <div className="flex gap-2 justify-center">
                <button 
                  onClick={() => setBelSeason(5)} 
                  className={`py-1 px-3 rounded text-[11px] font-extrabold cursor-pointer border ${belSeason === 5 ? 'bg-brand-maroon text-brand-gold border-transparent' : 'bg-gray-150 border-gray-300'}`}
                >
                  5. Sezon
                </button>
                <button 
                  onClick={() => setBelSeason(4)} 
                  className={`py-1 px-3 rounded text-[11px] font-extrabold cursor-pointer border ${belSeason === 4 ? 'bg-brand-maroon text-brand-gold border-transparent' : 'bg-gray-150 border-gray-300'}`}
                >
                  4. Sezon
                </button>
              </div>
              {renderKoBracket('bel', belSeason)}
              {renderTournamentMatches('bel')}
            </div>
          )}

          {activeCup === 'becl' && (
            <div className="space-y-4">
              <div className="flex gap-2 justify-center">
                <button 
                  onClick={() => setBeclSeason(5)} 
                  className={`py-1 px-3 rounded text-[11px] font-extrabold cursor-pointer border ${beclSeason === 5 ? 'bg-brand-maroon text-brand-gold border-transparent' : 'bg-gray-150 border-gray-300'}`}
                >
                  5. Sezon
                </button>
                <button 
                  onClick={() => setBeclSeason(4)} 
                  className={`py-1 px-3 rounded text-[11px] font-extrabold cursor-pointer border ${beclSeason === 4 ? 'bg-brand-maroon text-brand-gold border-transparent' : 'bg-gray-150 border-gray-300'}`}
                >
                  4. Sezon
                </button>
              </div>
              {renderKoBracket('becl', beclSeason)}
              {renderTournamentMatches('becl')}
            </div>
          )}
        </div>
      )}

      {/* ADD TOURNAMENT MATCH MODAL */}
      {addMatchModalOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/80 z-[99999] flex items-center justify-center p-4">
          <div className="bg-[#f2ede1] text-[#3d3d3d] w-full max-w-md rounded-3xl p-6 border-b-8 border-brand-maroon shadow-2xl overflow-y-auto max-h-[92vh] relative select-text">
            <button 
              type="button"
              onClick={() => setAddMatchModalOpen(false)} 
              className="absolute top-4 right-4 text-xl font-bold text-brand-maroon cursor-pointer hover:opacity-75"
            >
              ✕
            </button>
            <h3 className="text-brand-maroon font-black text-base text-center uppercase tracking-wide border-b-2 border-brand-maroon pb-2 mb-4">
              ➕ Turnuva Maçı Ekle
            </h3>

            <div className="space-y-4">
              {/* Turnuva Seçimi */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-brand-maroon uppercase">Turnuva</label>
                <select
                  value={modalCup}
                  onChange={(e) => setModalCup(e.target.value as any)}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2 text-xs font-black text-gray-800"
                >
                  <option value="bcl">BCL / UCL (Şampiyonlar Ligi)</option>
                  <option value="bel">BEL / UEL (Avrupa Ligi)</option>
                  <option value="becl">BECL / UECL (Konferans Ligi)</option>
                  <option value="wpc">World Peace Cup (Turnuva)</option>
                </select>
              </div>

              {/* Sezon Seçimi (BCL, BEL, BECL için) */}
              {modalCup !== 'wpc' && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-brand-maroon uppercase">Sezon</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setModalSeason(5)}
                      className={`py-2 rounded-xl font-black text-xs border ${modalSeason === 5 ? 'bg-brand-maroon text-brand-gold border-black' : 'bg-white border-gray-300 text-gray-600'}`}
                    >
                      5. Sezon
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalSeason(4)}
                      className={`py-2 rounded-xl font-black text-xs border ${modalSeason === 4 ? 'bg-brand-maroon text-brand-gold border-black' : 'bg-white border-gray-300 text-gray-600'}`}
                    >
                      4. Sezon
                    </button>
                  </div>
                </div>
              )}

              {/* Aşama (Round) Seçimi */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-brand-maroon uppercase">Aşama / Tur</label>
                <select
                  value={modalRound}
                  onChange={(e) => setModalRound(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2 text-xs font-black text-gray-800"
                >
                  {modalCup === 'wpc' ? (
                    <>
                      <option value="groupA">A Grubu</option>
                      <option value="groupB">B Grubu</option>
                      <option value="wpc_qf1_1">Çeyrek Final 1 (1. Maç)</option>
                      <option value="wpc_qf1_2">Çeyrek Final 1 (Rövanş)</option>
                      <option value="wpc_qf2_1">Çeyrek Final 2 (1. Maç)</option>
                      <option value="wpc_qf2_2">Çeyrek Final 2 (Rövanş)</option>
                      <option value="wpc_qf3_1">Çeyrek Final 3 (1. Maç)</option>
                      <option value="wpc_qf3_2">Çeyrek Final 3 (Rövanş)</option>
                      <option value="wpc_qf4_1">Çeyrek Final 4 (1. Maç)</option>
                      <option value="wpc_qf4_2">Çeyrek Final 4 (Rövanş)</option>
                      <option value="wpc_sf1_1">Yarı Final 1 (1. Maç)</option>
                      <option value="wpc_sf1_2">Yarı Final 1 (Rövanş)</option>
                      <option value="wpc_sf2_1">Yarı Final 2 (1. Maç)</option>
                      <option value="wpc_sf2_2">Yarı Final 2 (Rövanş)</option>
                      <option value="wpc_final">Büyük Final</option>
                    </>
                  ) : (
                    <>
                      <option value="semi1">Yarı Final 1</option>
                      <option value="semi2">Yarı Final 2</option>
                      <option value="final">Büyük Final</option>
                    </>
                  )}
                </select>
              </div>

              {/* Ev Sahibi Takım 1 */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-600 uppercase">🏠 1. Takım (Ev Sahibi)</label>
                <select
                  value={modalTeam1}
                  onChange={(e) => setModalTeam1(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2 text-xs font-black text-gray-800"
                >
                  {teams.map((t) => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Deplasman Takım 2 */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-600 uppercase">🚀 2. Takım (Deplasman)</label>
                <select
                  value={modalTeam2}
                  onChange={(e) => setModalTeam2(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2 text-xs font-black text-gray-800"
                >
                  {teams.map((t) => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Maç Tarihi */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-600 uppercase">📅 Maç Tarihi</label>
                <input
                  type="text"
                  placeholder="Örn: 17.10.2026"
                  value={modalDate}
                  onChange={(e) => setModalDate(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl p-2 text-xs font-bold"
                />
              </div>

              {/* Oynandı mı? */}
              <div className="flex items-center gap-2 p-3 bg-white/70 rounded-xl border border-gray-200">
                <input
                  type="checkbox"
                  id="modalPlayedCheckbox"
                  checked={modalPlayed}
                  onChange={(e) => setModalPlayed(e.target.checked)}
                  className="w-4 h-4 text-brand-maroon rounded"
                />
                <label htmlFor="modalPlayedCheckbox" className="text-xs font-black text-gray-700 cursor-pointer">
                  Maç oynandı olarak işaretle ve skor gir
                </label>
              </div>

              {/* Skor Alanları (Eğer oynandıysa) */}
              {modalPlayed && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-brand-maroon/5 rounded-xl border border-brand-maroon/20">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-brand-maroon uppercase">{modalTeam1 || 'T1'} Skor</label>
                    <input
                      type="number"
                      min="0"
                      value={modalScore1}
                      onChange={(e) => setModalScore1(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-xl p-2 text-center text-sm font-black"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-brand-maroon uppercase">{modalTeam2 || 'T2'} Skor</label>
                    <input
                      type="number"
                      min="0"
                      value={modalScore2}
                      onChange={(e) => setModalScore2(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-xl p-2 text-center text-sm font-black"
                    />
                  </div>
                </div>
              )}

              {/* ELO Notice */}
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-2.5 text-center flex items-center justify-center gap-2 text-xs font-black text-amber-900 shadow-2xs">
                <span>⚡</span>
                <span>
                  Bu maç <strong>{modalCup.toUpperCase()}</strong> ({getMatchMultiplier(modalCup).multiplier}x) katsayısıyla takım ELO reytingine işlenecektir.
                </span>
              </div>

              {/* Kaydet Butonu */}
              <button
                type="button"
                disabled={savingMatch}
                onClick={handleSaveNewMatch}
                className="w-full py-3 bg-brand-maroon text-brand-gold hover:bg-black font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow cursor-pointer disabled:opacity-50 mt-2"
              >
                {savingMatch ? 'Kaydediliyor...' : '💾 Maçı Kaydet ve Fikstüre Ekle'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* QUICK SCORE / RESULT ENTRY MODAL */}
      {quickScoreModalOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-[99999] flex items-center justify-center p-4">
          <div className="bg-[#f2ede1] text-[#3d3d3d] w-full max-w-md rounded-3xl p-6 border-b-8 border-brand-maroon shadow-2xl relative select-text animate-fade-in max-h-[95vh] overflow-y-auto">
            <button 
              type="button"
              onClick={() => setQuickScoreModalOpen(false)} 
              className="absolute top-4 right-4 text-xl font-bold text-brand-maroon cursor-pointer hover:opacity-75"
            >
              ✕
            </button>
            
            <div className="text-center border-b-2 border-brand-maroon pb-3 mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-maroon block">
                {qsCupTag.toUpperCase()} {qsSeason}. SEZON • {qsRoundTitle || qsRoundKey}
              </span>
              <h3 className="text-base font-black text-brand-dark uppercase tracking-wide mt-0.5">
                ⚡ Maç Sonucu & Skor Girişi
              </h3>
            </div>

            <div className="space-y-4">
              {/* Teams & Scores Row */}
              <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex items-center justify-between gap-3">
                {/* Team 1 */}
                <div className="flex-1 flex flex-col items-center text-center gap-1.5">
                  <img 
                    src={teamLogos[qsTeam1] || 'https://via.placeholder.com/48?text=?'} 
                    className="w-12 h-12 rounded-full object-cover border-2 border-brand-maroon bg-white shadow-sm"
                    alt={qsTeam1}
                  />
                  <select
                    value={qsTeam1}
                    onChange={(e) => setQsTeam1(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg p-1 text-[11px] font-black text-brand-dark text-center truncate"
                  >
                    <option value="">{qsTeam1 || '-- Takım 1 --'}</option>
                    {teams.map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    value={qsScore1}
                    onChange={(e) => handleScore1Change(e.target.value)}
                    className="w-16 h-12 text-center text-2xl font-black bg-brand-card border-2 border-brand-maroon rounded-xl text-brand-maroon shadow-inner"
                  />
                </div>

                <div className="flex flex-col items-center gap-1.5 shrink-0 px-1">
                  <button
                    type="button"
                    onClick={() => {
                      const t1 = qsTeam1;
                      const s1 = qsScore1;
                      setQsTeam1(qsTeam2);
                      setQsScore1(qsScore2);
                      setQsTeam2(t1);
                      setQsScore2(s1);
                      if (qsPenaltyWinner) {
                        setQsPenaltyWinner(qsPenaltyWinner === t1 ? qsTeam2 : t1);
                      }
                    }}
                    title="Takımları Yer Değiştir"
                    className="p-1.5 bg-gray-100 hover:bg-brand-maroon hover:text-brand-gold text-gray-700 rounded-full text-xs font-black transition-all cursor-pointer shadow-xs border border-gray-300 flex items-center justify-center"
                  >
                    ⇄
                  </button>
                  <span className="text-sm font-black text-gray-400">VS</span>
                  <span className="text-[9px] font-bold text-gray-400">Skor</span>
                </div>

                {/* Team 2 */}
                <div className="flex-1 flex flex-col items-center text-center gap-1.5">
                  <img 
                    src={teamLogos[qsTeam2] || 'https://via.placeholder.com/48?text=?'} 
                    className="w-12 h-12 rounded-full object-cover border-2 border-brand-maroon bg-white shadow-sm"
                    alt={qsTeam2}
                  />
                  <select
                    value={qsTeam2}
                    onChange={(e) => setQsTeam2(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg p-1 text-[11px] font-black text-brand-dark text-center truncate"
                  >
                    <option value="">{qsTeam2 || '-- Takım 2 --'}</option>
                    {teams.map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    value={qsScore2}
                    onChange={(e) => handleScore2Change(e.target.value)}
                    className="w-16 h-12 text-center text-2xl font-black bg-brand-card border-2 border-brand-maroon rounded-xl text-brand-maroon shadow-inner"
                  />
                </div>
              </div>

              {/* Match Date & Status Options */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-brand-maroon uppercase">Maç Tarihi</label>
                  <input
                    type="text"
                    value={qsDate}
                    onChange={(e) => setQsDate(e.target.value)}
                    placeholder="DD.MM.YYYY"
                    className="w-full bg-white border border-gray-300 rounded-xl p-2 text-xs font-bold text-gray-800"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-gray-300 cursor-pointer h-10">
                    <input
                      type="checkbox"
                      checked={qsPlayed}
                      onChange={(e) => setQsPlayed(e.target.checked)}
                      className="w-4 h-4 text-brand-maroon rounded"
                    />
                    <span className="text-xs font-black text-gray-800">Oynandı (Bitti)</span>
                  </label>
                </div>
              </div>

              {/* Tie-breaker selection if scores are equal and match is played */}
              {qsPlayed && Number(qsScore1) === Number(qsScore2) && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-center space-y-2">
                  <p className="text-[11px] font-black text-amber-900">
                    ⚖️ Skorlar eşit! Penaltılarla tur atlayan / kazanan takımı seçiniz:
                  </p>
                  <div className="flex gap-2 justify-center">
                    <button
                      type="button"
                      onClick={() => setQsPenaltyWinner(qsTeam1)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        qsPenaltyWinner === qsTeam1
                          ? 'bg-brand-maroon text-brand-gold shadow-md scale-105'
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      🏆 {qsTeam1}
                    </button>
                    <button
                      type="button"
                      onClick={() => setQsPenaltyWinner(qsTeam2)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        qsPenaltyWinner === qsTeam2
                          ? 'bg-brand-maroon text-brand-gold shadow-md scale-105'
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      🏆 {qsTeam2}
                    </button>
                  </div>
                </div>
              )}

              {/* Optional MVP Selection */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-amber-900 uppercase flex items-center gap-1">
                    <span>👑</span>
                    <span>Maçın Oyuncusu (MVP)</span>
                  </label>
                  <span className="text-[9px] font-bold text-gray-400">(İsteğe Bağlı)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_85px] gap-2">
                  <select
                    value={qsMvp}
                    onChange={(e) => setQsMvp(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2 text-xs font-bold text-gray-800"
                  >
                    <option value="">-- MVP Seçilmedi --</option>
                    {(() => {
                      const t1Lower = qsTeam1.toLowerCase().trim();
                      const t2Lower = qsTeam2.toLowerCase().trim();
                      const t1List = allPlayers.filter(p => (p.pteam || '').toLowerCase().trim() === t1Lower || (p.kiralikTakim || '').toLowerCase().trim() === t1Lower);
                      const t2List = allPlayers.filter(p => (p.pteam || '').toLowerCase().trim() === t2Lower || (p.kiralikTakim || '').toLowerCase().trim() === t2Lower);
                      const otherList = allPlayers.filter(p => !t1List.includes(p) && !t2List.includes(p));

                      return (
                        <>
                          {t1List.length > 0 && (
                            <optgroup label={`${qsTeam1} Oyuncuları`}>
                              {t1List.map(p => (
                                <option key={p.pname} value={p.pname}>{p.pname} ({qsTeam1})</option>
                              ))}
                            </optgroup>
                          )}
                          {t2List.length > 0 && (
                            <optgroup label={`${qsTeam2} Oyuncuları`}>
                              {t2List.map(p => (
                                <option key={p.pname} value={p.pname}>{p.pname} ({qsTeam2})</option>
                              ))}
                            </optgroup>
                          )}
                          {otherList.length > 0 && (
                            <optgroup label="Tüm Diğer Oyuncular">
                              {otherList.map(p => (
                                <option key={p.pname} value={p.pname}>{p.pname} ({p.pteam || 'Takımsız'})</option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      );
                    })()}
                  </select>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-black text-gray-500">⭐</span>
                    <input
                      type="text"
                      placeholder="Reyting"
                      value={qsMvpRating}
                      onChange={(e) => setQsMvpRating(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-xl p-2 text-xs font-bold text-gray-800 text-center"
                    />
                  </div>
                </div>
              </div>

              {/* Goal Scorers & Assists Section */}
              {(qsTeam1Goals.length > 0 || qsTeam2Goals.length > 0) && (
                <div className="bg-white rounded-2xl p-4 border border-brand-gold/60 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-150 pb-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-brand-maroon flex items-center gap-1.5">
                      <span>⚽</span>
                      <span>Gol Atan ve Asist Yapan Oyuncular</span>
                    </span>
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      İstatistiklere İşlenir
                    </span>
                  </div>

                  {/* Team 1 Goals */}
                  {qsTeam1Goals.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-brand-dark uppercase block">
                        🏠 {qsTeam1} ({qsTeam1Goals.length} Gol)
                      </span>
                      {qsTeam1Goals.map((g, idx) => (
                        <div key={`t1-g-${idx}`} className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#f8f5ee] p-2.5 rounded-xl border border-gray-200">
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[9px] font-black text-brand-maroon uppercase">{idx + 1}. Golü Atan</label>
                            <select
                              value={g.scorer}
                              onChange={(e) => {
                                const val = e.target.value;
                                setQsTeam1Goals(prev => {
                                  const next = [...prev];
                                  next[idx] = { ...next[idx], scorer: val };
                                  return next;
                                });
                              }}
                              className="bg-white border border-gray-300 rounded-lg p-1.5 text-xs font-bold text-gray-800"
                            >
                              <option value="">-- Golü Atan Oyuncu --</option>
                              {(() => {
                                const t1Lower = qsTeam1.toLowerCase().trim();
                                const t1List = allPlayers.filter(p => (p.pteam || '').toLowerCase().trim() === t1Lower || (p.kiralikTakim || '').toLowerCase().trim() === t1Lower);
                                const otherList = allPlayers.filter(p => !t1List.includes(p));
                                return (
                                  <>
                                    {t1List.length > 0 && (
                                      <optgroup label={`${qsTeam1} Oyuncuları`}>
                                        {t1List.map(p => (
                                          <option key={p.pname} value={p.pname}>{p.pname} ({qsTeam1})</option>
                                        ))}
                                      </optgroup>
                                    )}
                                    {otherList.length > 0 && (
                                      <optgroup label="Tüm Diğer Oyuncular">
                                        {otherList.map(p => (
                                          <option key={p.pname} value={p.pname}>{p.pname} ({p.pteam || 'Takımsız'})</option>
                                        ))}
                                      </optgroup>
                                    )}
                                  </>
                                );
                              })()}
                            </select>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[9px] font-black text-gray-500 uppercase">Asist (İsteğe Bağlı)</label>
                            <select
                              value={g.assist}
                              onChange={(e) => {
                                const val = e.target.value;
                                setQsTeam1Goals(prev => {
                                  const next = [...prev];
                                  next[idx] = { ...next[idx], assist: val };
                                  return next;
                                });
                              }}
                              className="bg-white border border-gray-300 rounded-lg p-1.5 text-xs font-bold text-gray-800"
                            >
                              <option value="">Asist Yok (Şut)</option>
                              {(() => {
                                const t1Lower = qsTeam1.toLowerCase().trim();
                                const t1List = allPlayers.filter(p => (p.pteam || '').toLowerCase().trim() === t1Lower || (p.kiralikTakim || '').toLowerCase().trim() === t1Lower);
                                const otherList = allPlayers.filter(p => !t1List.includes(p));
                                return (
                                  <>
                                    {t1List.length > 0 && (
                                      <optgroup label={`${qsTeam1} Oyuncuları`}>
                                        {t1List.map(p => (
                                          <option key={p.pname} value={p.pname}>{p.pname} ({qsTeam1})</option>
                                        ))}
                                      </optgroup>
                                    )}
                                    {otherList.length > 0 && (
                                      <optgroup label="Tüm Diğer Oyuncular">
                                        {otherList.map(p => (
                                          <option key={p.pname} value={p.pname}>{p.pname} ({p.pteam || 'Takımsız'})</option>
                                        ))}
                                      </optgroup>
                                    )}
                                  </>
                                );
                              })()}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Team 2 Goals */}
                  {qsTeam2Goals.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-gray-150">
                      <span className="text-[10px] font-black text-brand-dark uppercase block">
                        🚀 {qsTeam2} ({qsTeam2Goals.length} Gol)
                      </span>
                      {qsTeam2Goals.map((g, idx) => (
                        <div key={`t2-g-${idx}`} className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#f8f5ee] p-2.5 rounded-xl border border-gray-200">
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[9px] font-black text-brand-maroon uppercase">{idx + 1}. Golü Atan</label>
                            <select
                              value={g.scorer}
                              onChange={(e) => {
                                const val = e.target.value;
                                setQsTeam2Goals(prev => {
                                  const next = [...prev];
                                  next[idx] = { ...next[idx], scorer: val };
                                  return next;
                                });
                              }}
                              className="bg-white border border-gray-300 rounded-lg p-1.5 text-xs font-bold text-gray-800"
                            >
                              <option value="">-- Golü Atan Oyuncu --</option>
                              {(() => {
                                const t2Lower = qsTeam2.toLowerCase().trim();
                                const t2List = allPlayers.filter(p => (p.pteam || '').toLowerCase().trim() === t2Lower || (p.kiralikTakim || '').toLowerCase().trim() === t2Lower);
                                const otherList = allPlayers.filter(p => !t2List.includes(p));
                                return (
                                  <>
                                    {t2List.length > 0 && (
                                      <optgroup label={`${qsTeam2} Oyuncuları`}>
                                        {t2List.map(p => (
                                          <option key={p.pname} value={p.pname}>{p.pname} ({qsTeam2})</option>
                                        ))}
                                      </optgroup>
                                    )}
                                    {otherList.length > 0 && (
                                      <optgroup label="Tüm Diğer Oyuncular">
                                        {otherList.map(p => (
                                          <option key={p.pname} value={p.pname}>{p.pname} ({p.pteam || 'Takımsız'})</option>
                                        ))}
                                      </optgroup>
                                    )}
                                  </>
                                );
                              })()}
                            </select>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[9px] font-black text-gray-500 uppercase">Asist (İsteğe Bağlı)</label>
                            <select
                              value={g.assist}
                              onChange={(e) => {
                                const val = e.target.value;
                                setQsTeam2Goals(prev => {
                                  const next = [...prev];
                                  next[idx] = { ...next[idx], assist: val };
                                  return next;
                                });
                              }}
                              className="bg-white border border-gray-300 rounded-lg p-1.5 text-xs font-bold text-gray-800"
                            >
                              <option value="">Asist Yok (Şut)</option>
                              {(() => {
                                const t2Lower = qsTeam2.toLowerCase().trim();
                                const t2List = allPlayers.filter(p => (p.pteam || '').toLowerCase().trim() === t2Lower || (p.kiralikTakim || '').toLowerCase().trim() === t2Lower);
                                const otherList = allPlayers.filter(p => !t2List.includes(p));
                                return (
                                  <>
                                    {t2List.length > 0 && (
                                      <optgroup label={`${qsTeam2} Oyuncuları`}>
                                        {t2List.map(p => (
                                          <option key={p.pname} value={p.pname}>{p.pname} ({qsTeam2})</option>
                                        ))}
                                      </optgroup>
                                    )}
                                    {otherList.length > 0 && (
                                      <optgroup label="Tüm Diğer Oyuncular">
                                        {otherList.map(p => (
                                          <option key={p.pname} value={p.pname}>{p.pname} ({p.pteam || 'Takımsız'})</option>
                                        ))}
                                      </optgroup>
                                    )}
                                  </>
                                );
                              })()}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ELO Notice */}
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-2.5 text-center flex items-center justify-center gap-2 text-xs font-black text-amber-900 shadow-2xs">
                <span>⚡</span>
                <span>
                  Bu maç <strong>{qsCupTag.toUpperCase()}</strong> ({getMatchMultiplier(qsCupTag).multiplier}x) katsayısıyla takım ELO reytingine doğrudan işlenecektir.
                </span>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  disabled={savingQuickScore}
                  onClick={handleSaveQuickScore}
                  className="w-full py-3 bg-brand-maroon text-brand-gold hover:bg-black font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span>💾</span>
                  <span>{savingQuickScore ? 'Kaydediliyor...' : 'Sonucu Kaydet ve Ağacı Güncelle'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setQuickScoreModalOpen(false);
                    const now = qsMatch?.datejav || Date.now();
                    const docId = qsMatch?.id || `${qsTeam1}-vs-${qsTeam2}-${now}`;
                    const targetMatch: Match = qsMatch || {
                      id: docId,
                      team1: qsTeam1 || 'Takım 1',
                      team2: qsTeam2 || 'Takım 2',
                      category: qsCupTag === 'wpc' ? 'TURNUVA' : qsCupTag.toUpperCase(),
                      season: qsSeason as any,
                      round: qsRoundKey,
                      hafta: qsRoundTitle || qsRoundKey,
                      score1: qsScore1,
                      score2: qsScore2,
                      played: qsPlayed,
                      date: qsDate || new Date().toLocaleDateString('tr-TR'),
                      datejav: now,
                      ligm: false,
                      timeline: [],
                      lineup: {}
                    };
                    onNavigate({ type: 'match-detail', matchId: docId, initialMatch: targetMatch });
                  }}
                  className="w-full py-2 bg-white hover:bg-gray-100 text-brand-maroon border border-brand-maroon/30 font-black text-[11px] uppercase tracking-wider rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>📋</span>
                  <span>Ayrıntılı Maç Detayına Git (Kadro, Goller, MVP) →</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* CHANGE BRACKET TEAMS MODAL */}
      {changeTeamsModalOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-[99999] flex items-center justify-center p-4">
          <div className="bg-[#f2ede1] text-[#3d3d3d] w-full max-w-md rounded-3xl p-6 border-b-8 border-brand-maroon shadow-2xl relative select-text animate-fade-in max-h-[95vh] overflow-y-auto">
            <button 
              type="button"
              onClick={() => setChangeTeamsModalOpen(false)} 
              className="absolute top-4 right-4 text-xl font-bold text-brand-maroon cursor-pointer hover:opacity-75"
            >
              ✕
            </button>

            <div className="text-center border-b-2 border-brand-maroon pb-3 mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-maroon block">
                {ctCupTag.toUpperCase()} {ctSeason}. SEZON • {ctRoundTitle || ctRoundKey}
              </span>
              <h3 className="text-base font-black text-brand-dark uppercase tracking-wide mt-0.5">
                🔄 Eşleşme Takımlarını Değiştir
              </h3>
              <p className="text-[11px] text-gray-600 font-bold mt-1">
                Bu turdaki eşleşmeyi dilediğiniz takımlarla güncelleyebilir veya yerlerini değiştirebilirsiniz.
              </p>
            </div>

            <div className="space-y-4">
              {/* Team 1 Selection */}
              <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex flex-col gap-2">
                <label className="text-[10px] font-black text-brand-maroon uppercase flex items-center gap-1.5">
                  <span>🏠 1. Takım (Ev Sahibi / Üst Slot)</span>
                </label>
                <div className="flex items-center gap-3">
                  <img 
                    src={teamLogos[ctTeam1] || 'https://via.placeholder.com/40?text=?'} 
                    className="w-10 h-10 rounded-full object-cover border-2 border-brand-maroon bg-white shrink-0 shadow-xs"
                    alt={ctTeam1}
                  />
                  <select
                    value={ctTeam1}
                    onChange={(e) => setCtTeam1(e.target.value)}
                    className="flex-1 bg-white border border-gray-300 rounded-xl p-2 text-xs font-black text-brand-dark"
                  >
                    {teams.map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Swap Teams Button */}
              <div className="flex justify-center -my-1">
                <button
                  type="button"
                  onClick={() => {
                    const tmp = ctTeam1;
                    setCtTeam1(ctTeam2);
                    setCtTeam2(tmp);
                  }}
                  className="py-1.5 px-4 bg-brand-maroon text-brand-gold hover:bg-black rounded-full font-black text-xs uppercase tracking-wider transition-all shadow-md flex items-center gap-2 cursor-pointer border border-brand-gold/40"
                >
                  <span>⇄</span>
                  <span>Takımları Yer Değiştir</span>
                </button>
              </div>

              {/* Team 2 Selection */}
              <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex flex-col gap-2">
                <label className="text-[10px] font-black text-brand-maroon uppercase flex items-center gap-1.5">
                  <span>🚀 2. Takım (Deplasman / Alt Slot)</span>
                </label>
                <div className="flex items-center gap-3">
                  <img 
                    src={teamLogos[ctTeam2] || 'https://via.placeholder.com/40?text=?'} 
                    className="w-10 h-10 rounded-full object-cover border-2 border-brand-maroon bg-white shrink-0 shadow-xs"
                    alt={ctTeam2}
                  />
                  <select
                    value={ctTeam2}
                    onChange={(e) => setCtTeam2(e.target.value)}
                    className="flex-1 bg-white border border-gray-300 rounded-xl p-2 text-xs font-black text-brand-dark"
                  >
                    {teams.map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Info banner */}
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-2.5 text-center text-xs font-black text-amber-900 shadow-2xs">
                💡 Seçilen takımlar bu tura atanır, turnuva ağacında gösterilir ve sonuç girildiğinde doğrudan ELO reytingine işlenir.
              </div>

              {/* Save Button */}
              <button
                type="button"
                disabled={savingTeams}
                onClick={handleSaveChangeTeams}
                className="w-full py-3 bg-brand-maroon text-brand-gold hover:bg-black font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span>💾</span>
                <span>{savingTeams ? 'Kaydediliyor...' : 'Takımları Kaydet ve Ağacı Güncelle'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[999999] bg-brand-dark text-brand-gold border-2 border-brand-gold px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-fade-in font-black text-xs md:text-sm">
          <span>✨</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
