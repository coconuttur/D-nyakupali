import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDoc, updateDoc, deleteDoc, writeBatch, setDoc, addDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';

interface WorldCupProps {
  currentUser: UserProfile | null;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
}

interface WcTeam {
  id: string; // generated
  teamName: string;
  teamLogo: string;
  playerName: string;
  playerPhoto: string;
  group: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
}

interface WcMatch {
  id: string;
  team1: string;
  team2: string;
  score1: string;
  score2: string;
  played: boolean;
  group?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  round?: 'Son 16' | 'Çeyrek Final' | 'Yarı Final' | 'Final';
}

interface BracketMatchNodeProps {
  slotA: string;
  slotB: string;
  roundName: 'Son 16' | 'Çeyrek Final' | 'Yarı Final' | 'Final';
  matchNumStr: string;
  bracketState: Record<string, string>;
  matches: WcMatch[];
  teams: WcTeam[];
  isAdmin: boolean;
  handleSaveBracketSlot: (slotId: string, teamVal: string) => Promise<void>;
  createKnockoutMatch: (team1: string, team2: string, roundName: 'Son 16' | 'Çeyrek Final' | 'Yarı Final' | 'Final', slotNum: string) => Promise<void>;
  handleKnockoutScoreUpdate: (matchId: string, score1: string, score2: string) => Promise<void>;
  onOpenDetail?: (match: WcMatch) => void;
}

function BracketMatchNode({
  slotA,
  slotB,
  roundName,
  matchNumStr,
  bracketState,
  matches,
  teams,
  isAdmin,
  handleSaveBracketSlot,
  createKnockoutMatch,
  handleKnockoutScoreUpdate,
  onOpenDetail
}: BracketMatchNodeProps) {
  const t1 = bracketState[slotA] || '';
  const t2 = bracketState[slotB] || '';
  
  // Find matching created game
  const mId = `wc-ko-${roundName.replace(/\s+/g, '-')}-${matchNumStr}`.replace(/\s+/g, '-');
  const dbMatch = matches.find(m => m.id === mId);

  // Dynamic advancements based on winner:
  let winner = '';
  if (dbMatch && dbMatch.played) {
    const s1 = parseInt(dbMatch.score1) || 0;
    const s2 = parseInt(dbMatch.score2) || 0;
    if (s1 > s2) winner = dbMatch.team1;
    else if (s2 > s1) winner = dbMatch.team2;
  }

  // Populate advanced slots automatically under reactive context!
  useEffect(() => {
    if (winner) {
      let destSlot = '';
      if (roundName === 'Son 16') {
        const num = parseInt(matchNumStr);
        if (num === 1) destSlot = 'q1_t1';
        if (num === 2) destSlot = 'q1_t2';
        if (num === 3) destSlot = 'q2_t1';
        if (num === 4) destSlot = 'q2_t2';
        if (num === 5) destSlot = 'q3_t1';
        if (num === 6) destSlot = 'q3_t2';
        if (num === 7) destSlot = 'q4_t1';
        if (num === 8) destSlot = 'q4_t2';
      } else if (roundName === 'Çeyrek Final') {
        const num = parseInt(matchNumStr);
        if (num === 1) destSlot = 's1_t1';
        if (num === 2) destSlot = 's1_t2';
        if (num === 3) destSlot = 's2_t1';
        if (num === 4) destSlot = 's2_t2';
      } else if (roundName === 'Yarı Final') {
        const num = parseInt(matchNumStr);
        if (num === 1) destSlot = 'f_t1';
        if (num === 2) destSlot = 'f_t2';
      } else if (roundName === 'Final') {
        destSlot = 'champ';
      }

      if (destSlot && bracketState[destSlot] !== winner) {
        handleSaveBracketSlot(destSlot, winner);
      }
    }
  }, [winner, roundName, matchNumStr]);

  const activeList = teams.map(t => t.teamName);

  return (
    <div className="bg-white p-3 rounded-2xl border border-gray-200 flex flex-col gap-2.5 shadow-sm min-w-[180px]">
      <div className="flex justify-between items-center text-[10px] font-black text-brand-maroon uppercase tracking-wide">
        <span>{roundName} - M{matchNumStr}</span>
        {dbMatch && dbMatch.played && <span className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded">BİTTİ</span>}
      </div>

      {/* Team 1 box */}
      <div className="flex items-center justify-between border border-gray-150 p-1.5 rounded-lg bg-gray-50 select-text">
        {isAdmin ? (
          <select 
            value={t1} 
            onChange={(e) => handleSaveBracketSlot(slotA, e.target.value)}
            className="text-xs font-black outline-none bg-transparent w-full text-[#333]"
          >
            <option value="">Seçiniz (T1)</option>
            {activeList.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        ) : (
          <span className="text-xs font-black truncate text-brand-dark">{t1 || 'Seçilmedi'}</span>
        )}
        {dbMatch && <strong className="text-sm font-black text-brand-maroon pr-1">{dbMatch.score1}</strong>}
      </div>

      {/* Team 2 box */}
      <div className="flex items-center justify-between border border-gray-150 p-1.5 rounded-lg bg-gray-50 select-text">
        {isAdmin ? (
          <select 
            value={t2} 
            onChange={(e) => handleSaveBracketSlot(slotB, e.target.value)}
            className="text-xs font-black outline-none bg-transparent w-full text-[#333]"
          >
            <option value="">Seçiniz (T2)</option>
            {activeList.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        ) : (
          <span className="text-xs font-black truncate text-brand-dark">{t2 || 'Seçilmedi'}</span>
        )}
        {dbMatch && <strong className="text-sm font-black text-brand-maroon pr-1">{dbMatch.score2}</strong>}
      </div>

      {/* Action Button */}
      {isAdmin && t1 && t2 && (
        <div className="flex gap-2">
          {!dbMatch ? (
            <button 
              onClick={() => createKnockoutMatch(t1, t2, roundName, matchNumStr)}
              className="w-full text-[9px] font-black uppercase text-brand-gold bg-brand-maroon rounded py-1 cursor-pointer"
            >
              Kupon Oluştur
            </button>
          ) : (
            <div className="flex gap-1 w-full scale-90">
              <input 
                type="number" 
                placeholder="S1" 
                defaultValue={dbMatch.score1} 
                onBlur={(e) => handleKnockoutScoreUpdate(mId, e.target.value, dbMatch.score2)}
                className="w-10 text-xs font-black text-center bg-gray-100 rounded order-1 text-[#333]" 
              />
              <input 
                type="number" 
                placeholder="S2" 
                defaultValue={dbMatch.score2} 
                onBlur={(e) => handleKnockoutScoreUpdate(mId, dbMatch.score1, e.target.value)}
                className="w-10 text-xs font-black text-center bg-gray-100 rounded order-2 text-[#333]" 
              />
            </div>
          )}
        </div>
      )}

      {dbMatch && (
        <button
          type="button"
          onClick={() => onOpenDetail?.(dbMatch)}
          className="w-full text-[9px] font-black uppercase text-[#800000] border border-[#800000] rounded py-1.5 cursor-pointer hover:bg-[#800000]/10 tracking-wider font-sans mt-1"
        >
          Detayları Gör
        </button>
      )}
    </div>
  );
}

export default function WorldCup({ currentUser, onNavigate, teamLogos }: WorldCupProps) {
  const [activeTab, setActiveTab] = useState<'groups' | 'bracket' | 'stats'>('groups');
  const [isAdmin, setIsAdmin] = useState(false);

  // Firestore caches
  const [teams, setTeams] = useState<WcTeam[]>([]);
  const [matches, setMatches] = useState<WcMatch[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected Match Detail Modal states
  const [selectedWcMatch, setSelectedWcMatch] = useState<WcMatch | null>(null);
  const [matchScore1, setMatchScore1] = useState('');
  const [matchScore2, setMatchScore2] = useState('');
  const [matchPlayed, setMatchPlayed] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [savingMatch, setSavingMatch] = useState(false);

  // Admin "Takım Ekle" Modal states
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [targetGroup, setTargetGroup] = useState<'A' | 'B' | 'C' | 'D' | 'E' | 'F'>('A');
  const [teamName, setTeamName] = useState('');
  const [teamLogoUrl, setTeamLogoUrl] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerPhotoUrl, setPlayerPhotoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Bracket state representation in Firestore or local
  // Standard bracket contains slots for the rounds
  const [bracketState, setBracketState] = useState<Record<string, string>>({});

  // 1. Check Admin Roles
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

  // 2. Load World Cup Teams
  useEffect(() => {
    const unsubTeams = onSnapshot(collection(db, 'wc_teams'), (snap) => {
      const list: WcTeam[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as WcTeam);
      });
      setTeams(list);
    });

    // 3. Load World Cup Matches
    const unsubMatches = onSnapshot(collection(db, 'wc_matches'), (snap) => {
      const list: WcMatch[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as WcMatch);
      });
      setMatches(list);
    });

    // 4. Load Bracket config
    const unsubBracket = onSnapshot(doc(db, 'wc_config', 'bracket'), (docSnap) => {
      if (docSnap.exists()) {
        setBracketState(docSnap.data() || {});
      } else {
        setBracketState({});
      }
      setLoading(false);
    });

    return () => {
      unsubTeams();
      unsubMatches();
      unsubBracket();
    };
  }, []);

  // Compute calculated standings dynamically from matches
  const getComputedStandings = () => {
    // Initial templates flat structure
    const stats: Record<string, any> = {};
    teams.forEach((t) => {
      stats[t.teamName] = {
        teamName: t.teamName,
        teamLogo: t.teamLogo,
        playerName: t.playerName,
        playerPhoto: t.playerPhoto,
        group: t.group,
        o: 0, g: 0, b: 0, m: 0, ag: 0, yg: 0, av: 0, p: 0
      };
    });

    // Process group matches
    matches.forEach((match) => {
      if (!match.group || !match.played) return;
      
      const score1 = parseInt(match.score1) || 0;
      const score2 = parseInt(match.score2) || 0;

      const t1 = stats[match.team1];
      const t2 = stats[match.team2];

      if (t1 && t2) {
        t1.o++;
        t2.o++;
        t1.ag += score1;
        t1.yg += score2;
        t2.ag += score2;
        t2.yg += score1;
        t1.av = t1.ag - t1.yg;
        t2.av = t2.ag - t2.yg;

        if (score1 > score2) {
          t1.g++;
          t2.m++;
          t1.p += 3;
        } else if (score1 < score2) {
          t2.g++;
          t1.m++;
          t2.p += 3;
        } else {
          t1.b++;
          t2.b++;
          t1.p += 1;
          t2.p += 1;
        }
      }
    });

    return stats;
  };

  const allStats = getComputedStandings();

  // Get groups listing sorted
  const getGroupStandings = (group: 'A' | 'B' | 'C' | 'D' | 'E' | 'F') => {
    const list = Object.values(allStats).filter((x: any) => x.group === group);
    list.sort((a: any, b: any) => {
      if (b.p !== a.p) return b.p - a.p;
      if (b.av !== a.av) return b.av - a.av;
      return b.ag - a.ag;
    });
    return list;
  };

  // Get 3rd placed lists
  const getThirdPlacedStandings = () => {
    const thirds: any[] = [];
    (['A', 'B', 'C', 'D', 'E', 'F'] as const).forEach((grp) => {
      const sortedGrp = getGroupStandings(grp);
      if (sortedGrp.length >= 3) {
        thirds.push({ ...sortedGrp[2], originalGroup: grp });
      }
    });
    // Sort these 3rd-placed records
    thirds.sort((a, b) => {
      if (b.p !== a.p) return b.p - a.p;
      if (b.av !== a.av) return b.av - a.av;
      return b.ag - a.ag;
    });
    return thirds;
  };

  // Admin add team trigger
  const handleOpenAddModal = (grp: 'A' | 'B' | 'C' | 'D' | 'E' | 'F') => {
    setTargetGroup(grp);
    setTeamName('');
    setTeamLogoUrl('');
    setPlayerName('');
    setPlayerPhotoUrl('');
    setAddModalOpen(true);
  };

  const handleAddWcTeam = async () => {
    if (!teamName.trim() || !playerName.trim()) {
      alert('Takım adı ve Oyuncu adı zorunludur!');
      return;
    }

    setSubmitting(true);
    try {
      const ref = doc(collection(db, 'wc_teams'));
      const placeholderLogo = `https://ui-avatars.com/api/?name=${teamName.trim()}&background=800000&color=fff&size=80`;
      const placeholderUser = `https://ui-avatars.com/api/?name=${playerName.trim()}&background=0f2d4e&color=fff&size=80`;
      
      await setDoc(ref, {
        teamName: teamName.trim(),
        teamLogo: teamLogoUrl.trim() || placeholderLogo,
        playerName: playerName.trim(),
        playerPhoto: playerPhotoUrl.trim() || placeholderUser,
        group: targetGroup
      });

      setAddModalOpen(false);
    } catch (e) {
      console.error(e);
      alert('Sorgu işlenemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteWcTeam = async (id: string, name: string) => {
    if (!confirm(`${name} takımını Dünya Kupası'ndan silmek istiyor musunuz?`)) return;
    try {
      await deleteDoc(doc(db, 'wc_teams', id));
    } catch (e) {
      console.error(e);
    }
  };

  // Match generation standard round-robin
  const generateGroupMatches = async () => {
    if (!confirm('Tüm grupların fikstür kombinasyonları silinip yeniden oluşturulacaktır. Emin misiniz?')) return;
    
    try {
      // 1. Delete all old matches
      const batchDelete = writeBatch(db);
      matches.forEach((m) => {
        batchDelete.delete(doc(db, 'wc_matches', m.id));
      });
      await batchDelete.commit();

      // 2. Generate matches group by group
      const groups: Record<string, WcTeam[]> = { A: [], B: [], C: [], D: [], E: [], F: [] };
      teams.forEach((t) => {
        groups[t.group].push(t);
      });

      const batchCreate = writeBatch(db);
      Object.keys(groups).forEach((gKey) => {
        const grpTeams = groups[gKey];
        if (grpTeams.length < 2) return;

        // Round robin pairings builder
        for (let i = 0; i < grpTeams.length; i++) {
          for (let j = i + 1; j < grpTeams.length; j++) {
            const mId = `wc-${grpTeams[i].teamName}-vs-${grpTeams[j].teamName}`.replace(/\s+/g, '-');
            const mRef = doc(db, 'wc_matches', mId);
            batchCreate.set(mRef, {
              team1: grpTeams[i].teamName,
              team2: grpTeams[j].teamName,
              score1: '0',
              score2: '0',
              played: false,
              group: gKey
            });
          }
        }
      });

      await batchCreate.commit();
      alert('Grup maçları başarıyla oluşturuldu!');
    } catch (e) {
      console.error(e);
    }
  };

  // Bracket state save
  const handleSaveBracketSlot = async (slotId: string, teamVal: string) => {
    try {
      const ref = doc(db, 'wc_config', 'bracket');
      await updateDoc(ref, {
        [slotId]: teamVal
      });
    } catch (e) {
      // If doc doesn't exist, set it
      const ref = doc(db, 'wc_config', 'bracket');
      await setDoc(ref, { [slotId]: teamVal }, { merge: true });
    }
  };

  // Generate Knockout stage match files
  const createKnockoutMatch = async (team1: string, team2: string, roundName: 'Son 16' | 'Çeyrek Final' | 'Yarı Final' | 'Final', slotNum: string) => {
    if (!team1 || !team2) return;
    const mId = `wc-ko-${roundName.replace(/\s+/g, '-')}-${slotNum}`.replace(/\s+/g, '-');
    try {
      await setDoc(doc(db, 'wc_matches', mId), {
        team1,
        team2,
        score1: '0',
        score2: '0',
        played: false,
        round: roundName
      });
      alert(`${roundName} - Maç kartı başarıyla oluşturuldu!`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleKnockoutScoreUpdate = async (matchId: string, s1: string, s2: string) => {
    try {
      await updateDoc(doc(db, 'wc_matches', matchId), {
        score1: s1,
        score2: s2,
        played: true
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveWcMatchScore = async () => {
    if (!selectedWcMatch) return;
    setSavingMatch(true);
    try {
      await updateDoc(doc(db, 'wc_matches', selectedWcMatch.id), {
        score1: String(matchScore1),
        score2: String(matchScore2),
        played: matchPlayed
      });
      setDetailModalOpen(false);
      setSelectedWcMatch(null);
    } catch (e) {
      console.error(e);
      alert('Kaydedilirken bir hata oluştu.');
    } finally {
      setSavingMatch(false);
    }
  };

  // Statistics goals calculation
  const getGoalScorers = () => {
    // Collect all scorers inside wc_teams
    return Object.values(allStats).sort((a: any, b: any) => b.ag - a.ag);
  };

  const scorers = getGoalScorers();

  // Rendering a group layout standing block
  const renderGroupWidget = (groupCode: 'A' | 'B' | 'C' | 'D' | 'E' | 'F') => {
    const entries = getGroupStandings(groupCode);
    return (
      <div className="bg-brand-card rounded-3xl p-4 md:p-6 shadow border border-gray-150 select-text">
        <div className="flex justify-between items-center border-b border-gray-200 pb-3 mb-4">
          <h3 className="text-base font-black text-brand-maroon tracking-wider">GRUBU {groupCode}</h3>
          
          {isAdmin && (
            <button 
              onClick={() => handleOpenAddModal(groupCode)}
              className="bg-brand-maroon text-brand-gold py-1.5 px-3.5 rounded-lg font-black text-[10px] uppercase hover:bg-black transition-colors"
            >
              + Takım Ekle
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-gray-400 font-extrabold select-none">
                <th className="py-2">Takım</th>
                <th className="py-2 text-center">O</th>
                <th className="py-2 text-center text-green-600">G</th>
                <th className="py-2 text-center text-yellow-600">B</th>
                <th className="py-2 text-center text-red-600">M</th>
                <th className="py-2 text-center">Gol/Av</th>
                <th className="py-2 text-right">P</th>
                {isAdmin && <th className="py-2 text-right">Sil</th>}
              </tr>
            </thead>
            <tbody className="font-bold text-[#333]">
              {entries.map((ent: any) => {
                const rawTeamMatch = teams.find(t => t.teamName === ent.teamName);
                return (
                  <tr key={ent.teamName} className="border-b border-gray-100 hover:bg-white/40">
                    <td className="py-2.5 flex items-center gap-2">
                      <img src={ent.teamLogo} className="w-6 h-6 rounded-full border bg-white object-cover shrink-0" alt="logo" />
                      <div className="min-w-0">
                        <span className="block truncate uppercase leading-tight font-black text-[11px] md:text-xs">{ent.teamName}</span>
                        <span className="text-[9px] font-bold text-gray-400 block truncate">{ent.playerName}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-center">{ent.o}</td>
                    <td className="py-2.5 text-center text-green-600">{ent.g}</td>
                    <td className="py-2.5 text-center text-yellow-600">{ent.b}</td>
                    <td className="py-2.5 text-center text-red-600">{ent.m}</td>
                    <td className="py-2.5 text-center text-[10px]" title="Atılan-Yenilen / Averaj">
                      {ent.ag}-{ent.yg} / <strong className={ent.av > 0 ? 'text-green-600' : ent.av < 0 ? 'text-red-500' : 'text-gray-500'}>{ent.av > 0 ? `+${ent.av}` : ent.av}</strong>
                    </td>
                    <td className="py-2.5 text-right font-black text-brand-maroon">{ent.p}</td>
                    {isAdmin && rawTeamMatch && (
                      <td className="py-2.5 text-right">
                        <button onClick={() => handleDeleteWcTeam(rawTeamMatch.id, ent.teamName)} className="text-red-500 text-[10px] font-black hover:underline px-2">✕</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Rendering bracket cards
  const renderBracketMatchNode = (slotA: string, slotB: string, roundName: 'Son 16' | 'Çeyrek Final' | 'Yarı Final' | 'Final', matchNumStr: string) => {
    return (
      <BracketMatchNode
        slotA={slotA}
        slotB={slotB}
        roundName={roundName}
        matchNumStr={matchNumStr}
        bracketState={bracketState}
        matches={matches}
        teams={teams}
        isAdmin={isAdmin}
        handleSaveBracketSlot={handleSaveBracketSlot}
        createKnockoutMatch={createKnockoutMatch}
        handleKnockoutScoreUpdate={handleKnockoutScoreUpdate}
        onOpenDetail={(m) => {
          setSelectedWcMatch(m);
          setMatchScore1(m.score1);
          setMatchScore2(m.score2);
          setMatchPlayed(m.played);
          setDetailModalOpen(true);
        }}
      />
    );
  };

  return (
    <div className="space-y-6">
      {/* Upper header segment styled with tournament vibe colors */}
      <div className="bg-gradient-to-r from-[#003B46] to-[#07575B] p-6 rounded-3xl text-center text-white border-b-6 border-[#66A5AD] shadow select-none">
        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-widest text-[#F4F4F2]">🏆 DÜNYA KUPASI 2026</h1>
        <p className="text-[10px] md:text-xs font-bold text-[#66A5AD] uppercase mt-2">Büyük Turnuva Grup Aşaması ve Eleme Ağacı</p>
      </div>

      {/* Navigation sub-tabs */}
      <div className="flex justify-center gap-2">
        {[
          { id: 'groups', label: '📊 Gruplar ve Fikstür' },
          { id: 'bracket', label: '🌳 Eleme Ağacı (Son 16)' },
          { id: 'stats', label: '🎯 İstatistikler (Krallık)' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`py-2 px-4 rounded-xl font-black text-xs uppercase cursor-pointer border-2 transition-all ${
              activeTab === tab.id 
                ? 'bg-brand-maroon border-brand-maroon text-brand-gold shadow' 
                : 'bg-brand-card border-brand-maroon text-brand-maroon/70'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <h3 className="text-center text-gray-400 font-bold">Yükleniyor...</h3>
      ) : (
        <div className="animate-fade-in space-y-8 select-text">
          {activeTab === 'groups' && (
            <div className="space-y-8">
              {/* Groups grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(['A', 'B', 'C', 'D', 'E', 'F'] as const).map((g) => (
                  <div key={g}>{renderGroupWidget(g)}</div>
                ))}
              </div>

              {/* 3rd placed rankings overview */}
              <div className="bg-brand-card p-5 md:p-6 rounded-3xl border-l-12 border-brand-gold shadow max-w-3xl mx-auto">
                <h3 className="text-base font-black text-brand-maroon tracking-wider uppercase mb-3 flex items-center gap-2">
                  🎖️ En İyi 3.ler Sıralaması
                </h3>
                <p className="text-[10px] text-gray-500 font-bold mb-4">Gruplarını 3. bitiren en iyi 4 takım Son 16'ya yükselir.</p>
                <div className="overflow-x-auto select-text">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-400 font-black">
                        <th className="py-2">Grup</th>
                        <th className="py-2">Takım</th>
                        <th className="py-2 text-center">O</th>
                        <th className="py-2 text-center">G</th>
                        <th className="py-2 text-center">AG-YG</th>
                        <th className="py-2 text-center">Av</th>
                        <th className="py-2 text-right">P</th>
                      </tr>
                    </thead>
                    <tbody className="font-bold text-[#333]">
                      {getThirdPlacedStandings().map((tRecord, idx) => (
                        <tr key={idx} className="border-b border-gray-100">
                          <td className="py-2">Grup {tRecord.originalGroup}</td>
                          <td className="py-2 flex items-center gap-2">
                            <img src={tRecord.teamLogo} className="w-5 h-5 rounded-full object-cover" alt="logo" />
                            <span>{tRecord.teamName}</span>
                          </td>
                          <td className="py-2 text-center">{tRecord.o}</td>
                          <td className="py-2 text-center">{tRecord.g}</td>
                          <td className="py-2 text-center">{tRecord.ag}-{tRecord.yg}</td>
                          <td className="py-2 text-center text-brand-maroon">{tRecord.av}</td>
                          <td className="py-2 text-right font-black text-brand-maroon">{tRecord.p}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Fikstür / Match display cards below standings */}
              <div className="border-t-3 border-dashed border-[#eadcb9] pt-8 mt-10 max-w-3xl mx-auto">
                <div className="flex justify-between items-center mb-6 pr-2">
                  <h3 className="text-lg font-black text-brand-dark uppercase tracking-wider">📅 DÜNYA KUPASI MATCHES</h3>
                  {isAdmin && (
                    <button 
                      onClick={generateGroupMatches}
                      className="bg-brand-maroon text-brand-gold py-2 px-5 rounded-xl font-black text-xs uppercase"
                    >
                      🪄 Fikstür Oluştur
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  {matches.filter(m => m.group).length === 0 ? (
                    <span className="text-xs text-gray-400 font-bold block text-center p-4">Henüz oluşturulmuş grup maçı bulunmuyor.</span>
                  ) : (
                    // Sort: Group first (A, B, C...) alphabetically, then unplayed matches first within groups
                    [...matches.filter(m => m.group)].sort((a, b) => {
                      const grpA = a.group || '';
                      const grpB = b.group || '';
                      if (grpA !== grpB) {
                        return grpA.localeCompare(grpB);
                      }
                      return (a.played ? 1 : 0) - (b.played ? 1 : 0);
                    }).map((m) => {
                      const wcTeam1 = teams.find(t => t.teamName.toLowerCase() === m.team1.toLowerCase());
                      const wcTeam2 = teams.find(t => t.teamName.toLowerCase() === m.team2.toLowerCase());
                      const logo1 = wcTeam1?.teamLogo || teamLogos[m.team1] || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.team1)}&background=800000&color=ffd700`;
                      const logo2 = wcTeam2?.teamLogo || teamLogos[m.team2] || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.team2)}&background=800000&color=ffd700`;
                      return (
                        <div 
                          key={m.id}
                          onClick={() => {
                            setSelectedWcMatch(m);
                            setMatchScore1(m.score1);
                            setMatchScore2(m.score2);
                            setMatchPlayed(m.played);
                            setDetailModalOpen(true);
                          }}
                          className="bg-white rounded-2xl p-4 md:p-5 border-b-4 border-brand-maroon flex items-center justify-between shadow-sm cursor-pointer hover:border-brand-gold hover:scale-[1.01] transition-all select-text"
                          title="Detayları görmek ve skoru düzenlemek için tıklayın"
                        >
                          <div className="text-[10px] font-black text-brand-maroon shrink-0 uppercase tracking-widest pl-1">
                            GRUP {m.group}
                          </div>

                          <div className="flex-1 flex items-center justify-center gap-4 text-brand-dark px-4">
                            <div className="flex-1 flex items-center justify-end gap-2 text-right min-w-0">
                              <span className="font-extrabold text-xs md:text-sm truncate uppercase">{m.team1}</span>
                              <img src={logo1} className="w-8 h-8 rounded-full border bg-white object-cover shrink-0" alt="logo1" />
                            </div>

                            <div className="bg-brand-dark text-[#fcd34d] font-black text-xs py-1 px-3.5 rounded-lg border-2 border-[#fcd34d] shrink-0 min-w-[50px] text-center shadow-inner">
                              {m.played ? `${m.score1} - ${m.score2}` : 'VS'}
                            </div>

                            <div className="flex-1 flex items-center justify-start gap-2 text-left min-w-0">
                              <img src={logo2} className="w-8 h-8 rounded-full border bg-white object-cover shrink-0" alt="logo2" />
                              <span className="font-extrabold text-xs md:text-sm truncate uppercase">{m.team2}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'bracket' && (
            <div className="space-y-8 select-text overflow-x-auto pb-6">
              <h3 className="text-center font-black text-base uppercase text-brand-maroon mb-6">[ SON 16 ELEME AĞACI VE FİKSTÜRÜ ]</h3>

              {/* Bracket Grid view */}
              <div className="flex gap-6 min-w-[900px] justify-between p-4 bg-brand-card/30 border border-gray-150 rounded-3xl">
                {/* Round 1: Son 16 (8 Matches) */}
                <div className="space-y-4">
                  <h4 className="text-[11px] font-black text-brand-maroon uppercase tracking-wider text-center border-b border-gray-200 pb-1.5">Son 16</h4>
                  {renderBracketMatchNode('s16_m1_t1', 's16_m1_t2', 'Son 16', '1')}
                  {renderBracketMatchNode('s16_m2_t1', 's16_m2_t2', 'Son 16', '2')}
                  {renderBracketMatchNode('s16_m3_t1', 's16_m3_t2', 'Son 16', '3')}
                  {renderBracketMatchNode('s16_m4_t1', 's16_m4_t2', 'Son 16', '4')}
                  {renderBracketMatchNode('s16_m5_t1', 's16_m5_t2', 'Son 16', '5')}
                  {renderBracketMatchNode('s16_m6_t1', 's16_m6_t2', 'Son 16', '6')}
                  {renderBracketMatchNode('s16_m7_t1', 's16_m7_t2', 'Son 16', '7')}
                  {renderBracketMatchNode('s16_m8_t1', 's16_m8_t2', 'Son 16', '8')}
                </div>

                {/* Round 2: Son 8 / Çeyrek Final (4 Matches) */}
                <div className="space-y-16 pt-10">
                  <h4 className="text-[11px] font-black text-brand-maroon uppercase tracking-wider text-center border-b border-gray-200 pb-1.5">Çeyrek Final</h4>
                  {renderBracketMatchNode('q1_t1', 'q1_t2', 'Çeyrek Final', '1')}
                  {renderBracketMatchNode('q2_t1', 'q2_t2', 'Çeyrek Final', '2')}
                  {renderBracketMatchNode('q3_t1', 'q3_t2', 'Çeyrek Final', '3')}
                  {renderBracketMatchNode('q4_t1', 'q4_t2', 'Çeyrek Final', '4')}
                </div>

                {/* Round 3: Son 4 / Yarı Final (2 Matches) */}
                <div className="space-y-36 pt-24">
                  <h4 className="text-[11px] font-black text-brand-maroon uppercase tracking-wider text-center border-b border-gray-200 pb-1.5">Yarı Final</h4>
                  {renderBracketMatchNode('s1_t1', 's1_t2', 'Yarı Final', '1')}
                  {renderBracketMatchNode('s2_t1', 's2_t2', 'Yarı Final', '2')}
                </div>

                {/* Round 4: Final (1 Match) */}
                <div className="space-y-4 pt-48 flex flex-col justify-center">
                  <h4 className="text-[11px] font-black text-brand-maroon uppercase tracking-wider text-center border-b border-gray-200 pb-1.5">Final</h4>
                  {renderBracketMatchNode('f_t1', 'f_t2', 'Final', '1')}

                  {/* Champion display block */}
                  <div className="bg-[#fff3b0] p-4 rounded-2xl border-2 border-yellow-400 text-center shadow-lg mt-8 font-black text-xs uppercase text-brand-dark animate-pulse">
                    🏆 ŞAMPİYON
                    <h5 className="text-base font-black text-brand-maroon block mt-1">
                      {bracketState['champ'] || 'Bekleniyor...'}
                    </h5>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="max-w-2xl mx-auto space-y-4">
              <h3 className="text-center font-black text-base uppercase text-brand-maroon mb-4">🎯 ATILAN GOLLERLE DÜNYA KUPASI KRALLIĞI</h3>
              {scorers.length === 0 ? (
                <span className="text-xs text-gray-500 font-bold block text-center p-6">Sorgu çözülemedi.</span>
              ) : (
                scorers.map((sc, idx) => (
                  <div key={idx} className="bg-brand-card p-4 rounded-xl flex items-center justify-between border-l-8 border-brand-maroon shadow-sm select-text">
                    <div className="flex items-center gap-3">
                      <b className="font-black text-lg text-brand-maroon w-8">{idx + 1}.</b>
                      <img src={sc.playerPhoto} className="w-10 h-10 rounded-xl object-cover border" alt="scorer" />
                      <div>
                        <h4 className="font-extrabold text-brand-dark text-xs md:text-sm uppercase">{sc.playerName}</h4>
                        <span className="text-[9px] font-black text-gray-400 uppercase">{sc.teamName}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-black text-brand-maroon leading-none block">{sc.ag}</span>
                      <span className="text-[8px] font-black text-gray-400 block tracking-wider mt-0.5 uppercase">KUPA GOLÜ</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ADMIN ADD TEAM MODAL */}
      {addModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#f2ede1] text-[#3d3d3d] w-full max-w-sm rounded-2xl p-6 border-b-6 border-brand-maroon relative animate-scale-up">
            <button onClick={() => setAddModalOpen(false)} className="absolute top-4 right-4 text-xl font-bold text-brand-maroon">✕</button>
            <h3 className="text-lg font-black text-brand-maroon text-center mb-4 uppercase">Takım Ekle - Grup {targetGroup}</h3>

            <div className="space-y-4 text-xs font-bold">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">Takım Adı</label>
                <input 
                  type="text" 
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Örn: Brezilya"
                  className="bg-white border rounded p-2 font-bold block w-full focus:border-brand-maroon outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">Takım Amblemi URL</label>
                <input 
                  type="text" 
                  value={teamLogoUrl}
                  onChange={(e) => setTeamLogoUrl(e.target.value)}
                  placeholder="Amblem web linki (URL)"
                  className="bg-white border rounded p-2 block w-full font-bold focus:border-brand-maroon outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">Oyuncu Adı</label>
                <input 
                  type="text" 
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Örn: Neymar Jr."
                  className="bg-white border rounded p-2 block w-full font-bold focus:border-brand-maroon outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">Oyuncu Fotoğrafı URL</label>
                <input 
                  type="text" 
                  value={playerPhotoUrl}
                  onChange={(e) => setPlayerPhotoUrl(e.target.value)}
                  placeholder="Oyuncu Fotoğrafı web linki (URL)"
                  className="bg-white border rounded p-2 block w-full font-bold focus:border-brand-maroon outline-none"
                />
              </div>

              <button 
                onClick={handleAddWcTeam}
                disabled={submitting}
                className="w-full py-2.5 bg-brand-maroon text-brand-gold font-black rounded-lg uppercase tracking-wider hover:bg-black transition-colors shrink-0"
              >
                {submitting ? 'Kaydediliyor...' : 'Turnuvaya Yerleştir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MATCH DETAIL / EDIT SCORE MODAL */}
      {detailModalOpen && selectedWcMatch && (() => {
        const t1Info = teams.find(t => t.teamName.toLowerCase() === selectedWcMatch.team1.toLowerCase());
        const t2Info = teams.find(t => t.teamName.toLowerCase() === selectedWcMatch.team2.toLowerCase());
        const logo1 = t1Info?.teamLogo || teamLogos[selectedWcMatch.team1] || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedWcMatch.team1)}&background=800000&color=ffd700`;
        const logo2 = t2Info?.teamLogo || teamLogos[selectedWcMatch.team2] || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedWcMatch.team2)}&background=800000&color=ffd700`;
        const player1 = t1Info?.playerName || 'Yıldız Oyuncu';
        const player2 = t2Info?.playerName || 'Yıldız Oyuncu';
        const photo1 = t1Info?.playerPhoto || 'https://via.placeholder.com/80?text=Logo';
        const photo2 = t2Info?.playerPhoto || 'https://via.placeholder.com/80?text=Logo';

        return (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-[#f2ede1] text-[#3d3d3d] w-full max-w-md rounded-3xl p-6 border-b-8 border-brand-maroon relative animate-scale-up select-text">
              <button 
                onClick={() => {
                  setDetailModalOpen(false);
                  setSelectedWcMatch(null);
                }} 
                className="absolute top-4 right-4 text-xl font-black text-brand-maroon hover:scale-105 cursor-pointer"
              >
                ✕
              </button>
              
              <h3 className="text-center font-black text-xs uppercase tracking-widest text-[#800000]/60 mb-2">
                🏆 DÜNYA KUPASI 2026 MAÇ DETAYI
              </h3>
              
              <h4 className="text-center font-black text-[10px] uppercase text-brand-dark bg-yellow-400/20 text-[#800000] py-1 px-3 w-max mx-auto rounded-full mb-6">
                {selectedWcMatch.group ? `GRUP ${selectedWcMatch.group} MÜCADELESİ` : `${selectedWcMatch.round || 'Kupa'} Karşılaşması`}
              </h4>

              {/* Scoreboard Arena */}
              <div className="flex items-center justify-between gap-2 border-b border-[#ebdcb9] pb-6 mb-6">
                {/* Team 1 Area */}
                <div className="flex-1 flex flex-col items-center text-center">
                  <img src={logo1} className="w-16 h-16 rounded-full border bg-white object-cover shadow-sm mb-2" alt="logo1" />
                  <span className="font-black text-xs md:text-sm uppercase text-brand-dark tracking-tight leading-tight mb-1">{selectedWcMatch.team1}</span>
                  <div className="text-[10px] font-bold text-gray-400 uppercase leading-none">{player1}</div>
                </div>

                {/* VS / SCORE BADGE */}
                <div className="flex flex-col items-center justify-center shrink-0 min-w-[80px]">
                  {selectedWcMatch.played ? (
                    <div className="bg-brand-dark text-brand-gold font-sans font-black text-lg md:text-2xl py-2 px-4 rounded-2xl border-2 border-brand-gold shadow-md">
                      {selectedWcMatch.score1} - {selectedWcMatch.score2}
                    </div>
                  ) : (
                    <div className="bg-brand-dark text-brand-gold font-black text-xs py-1.5 px-3.5 rounded-xl border border-brand-gold uppercase tracking-wide">
                      VS
                    </div>
                  )}
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-2 block">
                    {selectedWcMatch.played ? 'OYNANDI' : 'BEKLENİYOR'}
                  </span>
                </div>

                {/* Team 2 Area */}
                <div className="flex-1 flex flex-col items-center text-center">
                  <img src={logo2} className="w-16 h-16 rounded-full border bg-white object-cover shadow-sm mb-2" alt="logo2" />
                  <span className="font-black text-xs md:text-sm uppercase text-brand-dark tracking-tight leading-tight mb-1">{selectedWcMatch.team2}</span>
                  <div className="text-[10px] font-bold text-gray-400 uppercase leading-none">{player2}</div>
                </div>
              </div>

              {/* Star Players Showcase */}
              <div className="bg-white/50 border border-[#ebdcb9] rounded-2xl p-4 mb-6 space-y-3">
                <h5 className="font-black text-[10px] text-brand-maroon uppercase tracking-wider text-center border-b border-[#ebdcb9] pb-1.5 mb-2">⭐ TAKIM YILDIZLARI SPOT IŞIĞI</h5>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <img src={photo1} className="w-8 h-8 rounded-lg object-cover border" alt="p1" />
                    <div className="truncate mb-1">
                      <div className="text-[10px] font-black text-brand-dark uppercase truncate leading-tight">{player1}</div>
                      <div className="text-[8px] font-black text-gray-400 uppercase">Star Player</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 justify-end text-right">
                    <div className="truncate mb-1">
                      <div className="text-[10px] font-black text-brand-dark uppercase truncate leading-tight">{player2}</div>
                      <div className="text-[8px] font-black text-gray-400 uppercase">Star Player</div>
                    </div>
                    <img src={photo2} className="w-8 h-8 rounded-lg object-cover border justify-self-end" alt="p2" />
                  </div>
                </div>
              </div>

              {/* ADMIN PANEL ZONE */}
              {isAdmin ? (
                <div className="bg-[#800000]/5 border border-[#800000]/10 rounded-2xl p-4 space-y-4">
                  <h5 className="font-black text-[10px] text-[#800000] uppercase tracking-widest text-center">⚙️ YÖNETİCİ SKOR PANELİ</h5>
                  
                  <div className="grid grid-cols-2 gap-4 text-xs font-bold">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-black text-gray-500 uppercase">{selectedWcMatch.team1} Skoru</label>
                      <input 
                        type="number" 
                        value={matchScore1} 
                        onChange={(e) => setMatchScore1(e.target.value)} 
                        className="bg-white border rounded p-2 text-xs font-black w-full text-center text-[#333] focus:border-brand-maroon outline-none" 
                        placeholder="0"
                      />
                    </div>
                    
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-black text-gray-500 uppercase">{selectedWcMatch.team2} Skoru</label>
                      <input 
                        type="number" 
                        value={matchScore2} 
                        onChange={(e) => setMatchScore2(e.target.value)} 
                        className="bg-white border rounded p-2 text-xs font-black w-full text-center text-[#333] focus:border-brand-maroon outline-none" 
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-[#ebdcb9] pt-3 mt-1.5 text-xs font-black text-[#555]">
                    <span>Oynandı Olarak İşaretle</span>
                    <input 
                      type="checkbox" 
                      checked={matchPlayed} 
                      onChange={(e) => setMatchPlayed(e.target.checked)} 
                      className="w-4 h-4 accent-brand-maroon cursor-pointer"
                    />
                  </div>

                  <button
                    onClick={handleSaveWcMatchScore}
                    disabled={savingMatch}
                    className="w-full py-2 bg-brand-maroon text-brand-gold hover:bg-black font-black rounded-lg text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                  >
                    {savingMatch ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                  </button>
                </div>
              ) : (
                <div className="text-center text-[10px] font-black text-gray-400 bg-gray-150 py-2.5 px-4 rounded-xl uppercase tracking-wider">
                  ⚠️ Skoru düzenlemek için yönetici yetkisi gerekir.
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
