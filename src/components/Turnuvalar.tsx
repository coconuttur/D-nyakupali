import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Team } from '../types';

interface TurnuvalarProps {
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
}

type CupType = 'wpc' | 'bcl' | 'bel' | 'becl';

export default function Turnuvalar({ currentLang, translations, onNavigate, teamLogos }: TurnuvalarProps) {
  const [activeCup, setActiveCup] = useState<CupType>('wpc');
  const [bclSeason, setBclSeason] = useState<4 | 5>(5);
  const [belSeason, setBelSeason] = useState<4 | 5>(5);
  const [beclSeason, setBeclSeason] = useState<4 | 5>(5);
  const [teams, setTeams] = useState<Team[]>([]);
  const [bracketData, setBracketData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
      if (docSnap.exists()) {
        setBracketData(docSnap.data() as Record<string, string>);
      }
    });

    return () => {
      unsubTeams();
      unsubBrackets();
    };
  }, []);

  const t = translations[currentLang];

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

    return (
      <div className="bg-[#1a1a1a] rounded-3xl overflow-hidden border border-gray-800 shadow-md">
        <div className="bg-brand-maroon text-brand-gold py-3 px-4 text-center font-black text-sm select-none">
          {groupLetter === 'A' ? t.ga : t.gb}
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

  // Helper to render Bracket match slot
  const renderSlot = (slotKey: string) => {
    const tName = bracketData[slotKey];
    if (tName) {
      const logo = teamLogos[tName] || 'https://via.placeholder.com/32?text=?';
      return (
        <div 
          onClick={() => onNavigate({ type: 'team-detail', teamName: tName })}
          className="flex items-center gap-2 font-extrabold text-xs text-brand-dark cursor-pointer py-1 truncate"
        >
          <img src={logo} className="w-6 h-6 rounded-full object-cover border border-brand-maroon bg-white" alt="logo" />
          <span className="truncate">{tName}</span>
        </div>
      );
    }
    return <span className="text-gray-400 font-bold text-xs">-</span>;
  };

  // Helper to render standard KO Tree Bracket
  const renderKoBracket = (tag: string, season: 4 | 5) => {
    const p = `${tag}${season}`; // E.g., bcl5 or bel4
    return (
      <div className="w-full overflow-x-auto py-6">
        <div className="flex gap-10 justify-center items-center h-96 min-w-[700px] max-w-4xl mx-auto select-none select-text">
          {/* SEMIS */}
          <div className="flex flex-col gap-10 justify-center">
            <div className="bg-brand-card border border-gray-300 rounded-xl p-3 w-44 shadow-sm space-y-2">
              <div className="border-b border-gray-200 pb-1.5">{renderSlot(`${p}s1`)}</div>
              <div>{renderSlot(`${p}s2`)}</div>
            </div>
            <div className="bg-brand-card border border-gray-300 rounded-xl p-3 w-44 shadow-sm space-y-2">
              <div className="border-b border-gray-200 pb-1.5">{renderSlot(`${p}s3`)}</div>
              <div>{renderSlot(`${p}s4`)}</div>
            </div>
          </div>

          {/* FINAL COUPLING */}
          <div className="flex flex-col gap-10 justify-center">
            <div className="bg-brand-card border-2 border-brand-maroon rounded-xl p-3 w-44 shadow-md space-y-2 relative">
              <span className="absolute -top-3 left-3 bg-brand-gold text-brand-maroon text-[9px] font-black px-2 rounded-full border border-brand-maroon">FINAL</span>
              <div className="border-b border-gray-200 pb-1.5">{renderSlot(`${p}s5`)}</div>
              <div>{renderSlot(`${p}s6`)}</div>
            </div>
          </div>

          {/* CHAMPION */}
          <div className="flex flex-col gap-10 justify-center">
            <div className="bg-brand-dark border-3 border-brand-gold rounded-2xl w-48 overflow-hidden shadow-lg">
              <div className="bg-brand-gold text-brand-dark text-center py-1.5 text-xs font-black tracking-widest uppercase">ŞAMPİYON</div>
              <div className="bg-brand-dark py-4 px-4 flex justify-center items-center h-16">
                {renderSlot(`${p}s7`)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Tab Selectors */}
      <div className="flex justify-center gap-2 flex-wrap">
        {(['wpc', 'bcl', 'bel', 'becl'] as CupType[]).map((cup) => (
          <button
            key={cup}
            onClick={() => setActiveCup(cup)}
            className={`py-1.5 px-4 rounded-lg font-black text-xs uppercase cursor-pointer border-2 transition-all ${
              activeCup === cup 
                ? 'bg-brand-gold text-brand-dark border-brand-maroon shadow-md' 
                : 'bg-brand-card border-brand-maroon text-brand-maroon/70'
            }`}
          >
            {cup === 'wpc' ? 'WORLD PEACE CUP' : cup.toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <h3 className="text-center text-gray-500 font-bold">{t.loading}</h3>
      ) : (
        <div className="animate-fade-in">
          {activeCup === 'wpc' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
              {renderWpcGroup('A')}
              {renderWpcGroup('B')}
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
