import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { collection, onSnapshot, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Team, UserProfile, Match } from '../types';
import WorldCup from './WorldCup';

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

  if (r === 'semi1' || h.includes('yarı final 1') || h.includes('semi 1') || h === 'yf1') {
    return { roundKey: 'semi1', roundTitle: '⚔️ Yarı Final 1' };
  }
  if (r === 'semi2' || h.includes('yarı final 2') || h.includes('semi 2') || h === 'yf2') {
    return { roundKey: 'semi2', roundTitle: '⚔️ Yarı Final 2' };
  }
  if (r === 'final' || h.includes('büyük final') || (h === 'final' && !h.includes('yarı') && !h.includes('semi'))) {
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
  const [savingQuickScore, setSavingQuickScore] = useState<boolean>(false);

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

    return () => {
      unsubTeams();
      unsubBrackets();
      unsubMatches();
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
      else if (modalRound === 'final') roundLabel = 'Büyük Final';
      else if (modalRound === 'groupA') roundLabel = 'A Grubu';
      else if (modalRound === 'groupB') roundLabel = 'B Grubu';
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

    setQsScore1(foundMatch ? String(foundMatch.score1 ?? '0') : '0');
    setQsScore2(foundMatch ? String(foundMatch.score2 ?? '0') : '0');
    setQsPlayed(foundMatch ? Boolean(foundMatch.played) : true);
    setQsPenaltyWinner((foundMatch as any)?.penaltyWinner || '');

    const todayStr = new Date().toLocaleDateString('tr-TR');
    setQsDate(foundMatch?.date || todayStr);
    setQuickScoreModalOpen(true);
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
        timeline: existingMatch?.timeline || [],
        lineup: existingMatch?.lineup || {},
        penaltyWinner: qsPenaltyWinner || undefined
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

  // Helper to filter matches by cup and season
  const getCupSeasonMatches = (cupFilter: 'wpc' | 'bcl' | 'bel' | 'becl', season?: 4 | 5) => {
    return allTournamentMatches.filter((m) => {
      const cat = String(m.category || '').toUpperCase().trim();
      const hStr = String(m.hafta || '').toUpperCase().trim();
      const mSeason = (m as any).season;
      
      let matchesCup = false;
      if (cupFilter === 'wpc') {
        matchesCup = cat.includes('WPC') || cat.includes('WORLD PEACE') || cat.includes('TURNUVA') || hStr.includes('WPC');
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

  // Helper to render WPC Group
  const renderWpcGroup = (groupLetter: 'A' | 'B') => {
    const groupTeams = teams
      .filter((team: any) => team.kgrup === groupLetter)
      .map((team: any) => {
        const atilan = Number(team.kgatilan) || 0;
        const yenilen = Number(team.kgyenilen) || 0;
        const gav = atilan - yenilen;
        const gw = Number(team.kgw) || 0;
        const gb = Number(team.kgb) || 0;
        const gl = Number(team.kgl) || 0;
        const gp = Number(team.kgpuan) || 0;
        const oynanan = gw + gb + gl;
        return {
          ...team,
          oynanan,
          gw,
          gb,
          gl,
          gav,
          gp,
        };
      })
      .sort((a, b) => b.gp - a.gp || b.gav - a.gav);

    const groupName = currentLang === 'tr'
      ? `${groupLetter} GRUBU`
      : currentLang === 'en'
        ? `GROUP ${groupLetter}`
        : `GRUPO ${groupLetter}`;

    return (
      <div className="bg-[#1a1a1a] rounded-3xl overflow-hidden border border-gray-800 shadow-md">
        <div className="bg-brand-maroon text-brand-gold py-3 px-4 text-center font-black text-sm select-none">
          {groupName}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-white border-collapse">
            <thead>
              <tr className="border-b-2 border-brand-gold bg-[#262626] text-[10px] font-black uppercase tracking-wider text-gray-400">
                <th className="py-3 px-3 text-center w-12">#</th>
                <th className="py-3 px-3 text-left">{t.takim}</th>
                <th className="py-3 px-2 text-center">O</th>
                <th className="py-3 px-2 text-center">G</th>
                <th className="py-3 px-2 text-center">B</th>
                <th className="py-3 px-2 text-center">M</th>
                <th className="py-3 px-2 text-center">AV</th>
                <th className="py-3 px-3 text-center w-16">P</th>
              </tr>
            </thead>
            <tbody>
              {groupTeams.map((team, i) => {
                const avColor = team.gav > 0 ? 'text-green-500' : team.gav < 0 ? 'text-red-500' : 'text-gray-400';
                const rowBg = i < 4 ? 'bg-[#a3267b]/20 hover:bg-[#a3267b]/30' : 'hover:bg-white/5';
                return (
                  <tr 
                    key={team.name}
                    onClick={() => onNavigate({ type: 'team-detail', teamName: team.name })}
                    className={`border-b border-[#2a2a2a] cursor-pointer transition-colors ${rowBg}`}
                  >
                    <td className="py-2.5 px-3 text-center font-black text-brand-gold">{i + 1}</td>
                    <td className="py-2.5 px-3 text-left">
                      <div className="flex items-center gap-2">
                        <img 
                          src={team.logo} 
                          className="w-8 h-8 rounded-full bg-white object-cover border border-brand-gold shrink-0" 
                          alt="logo" 
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/32?text=?';
                          }}
                        />
                        <span className="font-bold text-xs tracking-wide truncate w-32">{team.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center text-xs font-bold">{team.oynanan}</td>
                    <td className="py-2.5 px-2 text-center text-xs font-bold text-green-500">{team.gw}</td>
                    <td className="py-2.5 px-2 text-center text-xs font-bold text-gray-400">{team.gb}</td>
                    <td className="py-2.5 px-2 text-center text-xs font-bold text-red-500">{team.gl}</td>
                    <td className={`py-2.5 px-2 text-center text-xs font-extrabold ${avColor}`}>
                      {team.gav > 0 ? '+' : ''}{team.gav}
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
                      <option value="semi1">Yarı Final 1</option>
                      <option value="semi2">Yarı Final 2</option>
                      <option value="final">Büyük Final</option>
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
                    onChange={(e) => setQsScore1(e.target.value)}
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
                    onChange={(e) => setQsScore2(e.target.value)}
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
