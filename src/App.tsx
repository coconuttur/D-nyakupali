import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from './types';

// Importing views components
import Haberler from './components/Haberler';
import WorldCup from './components/WorldCup';
import PuanDurumu from './components/PuanDurumu';
import Haftalar from './components/Haftalar';
import Turnuvalar from './components/Turnuvalar';
import Istatistikler from './components/Istatistikler';
import Iddia from './components/Iddia';
import Forum from './components/Forum';

// Deatil sub-views components
import MatchDetail from './components/MatchDetail';
import PlayerProfile from './components/PlayerProfile';
import TeamDetail from './components/TeamDetail';
import UserProfileView from './components/UserProfile';

// Simple direct translations dictionary context
const TRANSLATIONS = {
  tr: {
    back: 'Geri',
    loading: 'Yükleniyor...',
    title: 'Detaylar',
    home: 'Ana Sayfa',
    player: 'Oyuncu',
    captain: 'Kaptan',
    goals: 'Goller',
    assists: 'Asistler',
    season: 'SÜPER LİG SEZON',
    country: 'Ülke',
    animal: 'Mascot',
    squad: '📋 Takım Kadrosu',
    stats: '📊 Sezon İstatistikleri',
    last: '📅 Son Oynanan Maçlar',
    next: '📅 Gelecek Maçlar',
    w: 'Galibiyet',
    d: 'Beraberlik',
    l: 'Mağlubiyet',
    gf: 'Atılan Gol',
    ga: 'Yenilen Gol',
    mac: 'Maç',
    gol: 'Gol',
    asist: 'Asist',
    gomac: 'G/O Oranı',
    gen: 'GEN',
    rat: 'Rating',
    kral: 'Krallığı',
    lider: 'Lideri',
    bio: '📝 Oyuncu Biyografisi',
    insta: 'Instagram',
    wait: 'Bekleniyor...'
  },
  en: {
    back: 'Back',
    loading: 'Loading...',
    title: 'Details',
    home: 'Home',
    player: 'Player',
    captain: 'Captain',
    goals: 'Goals',
    assists: 'Assists',
    season: 'SUPER LEAGUE SEASON',
    country: 'Country',
    animal: 'Mascot',
    squad: '📋 Team Squad',
    stats: '📊 Season Statistics',
    last: '📅 Last Played Matches',
    next: '📅 Next Matches',
    w: 'Wins',
    d: 'Draws',
    l: 'Losses',
    gf: 'Goals For',
    ga: 'Goals Against',
    mac: 'Match',
    gol: 'Goal',
    asist: 'Assist',
    gomac: 'G/M Ratio',
    gen: 'GEN',
    rat: 'Rating',
    kral: 'Kings',
    lider: 'Leaders',
    bio: '📝 Player Biography',
    insta: 'Instagram',
    wait: 'Pending...'
  },
  pt: {
    back: 'Voltar',
    loading: 'Carregando...',
    title: 'Detalhes',
    home: 'Início',
    player: 'Jogador',
    captain: 'Capitão',
    goals: 'Gols',
    assists: 'Assistências',
    season: 'TEMPORADA SUPER LEAGUE',
    country: 'País',
    animal: 'Mascote',
    squad: '📋 Elenco do Time',
    stats: '📊 Estatísticas da Temporada',
    last: '📅 Últimas Partidas',
    next: '📅 Próximas Partidas',
    w: 'Vitórias',
    d: 'Empates',
    l: 'Derrotas',
    gf: 'Gols Pró',
    ga: 'Gols Contra',
    mac: 'Partida',
    gol: 'Gol',
    asist: 'Assistência',
    gomac: 'Média G/P',
    gen: 'OVR',
    rat: 'Rating',
    kral: 'Artilharia',
    lider: 'Desenvolvimento',
    bio: '📝 Biografia do Jogador',
    insta: 'Instagram',
    wait: 'Aguardando...'
  }
};

type ViewState = 
  | { type: 'news' }
  | { type: 'wc' }
  | { type: 'puan' }
  | { type: 'haftalar' }
  | { type: 'turnuva' }
  | { type: 'istatistik' }
  | { type: 'iddia' }
  | { type: 'forum' }
  | { type: 'match-detail'; matchId: string }
  | { type: 'player-profile'; playerName: string }
  | { type: 'team-detail'; teamName: string }
  | { type: 'user-profile'; userId: string };

export default function App() {
  const [currentLang, setCurrentLang] = useState<'tr' | 'en' | 'pt'>('tr');
  const [currentView, setCurrentView] = useState<ViewState>({ type: 'news' });

  // User auth state representation
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Auth UI Modal controls
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authError, setAuthError] = useState('');

  // Cache list of logos
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({});

  // 1. Sync Authentication state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Find or init user profile in Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setUserProfile({ uid: firebaseUser.uid, ...docSnap.data() } as UserProfile);
          } else {
            // Lazy register default profile on first load
            const initials = displayNameInitials(firebaseUser.displayName || 'Kullanici');
            setDoc(userRef, {
              displayName: firebaseUser.displayName || 'Kullanıcı',
              balance: 1000, // Starts off with 1000 Coins gift!
              admin: false,
              avatar: `https://ui-avatars.com/api/?name=${initials}&background=800000&color=ffd700&size=100`,
              favTeam: ''
            });
          }
        });
      } else {
        setUserProfile(null);
      }
    });

    return () => unsubscribe();
  }, []);

  function displayNameInitials(name: string) {
    return name.substring(0, 2).toUpperCase();
  }

  // 2. Fetch team logos in global cache
  useEffect(() => {
    getDocs(collection(db, 'teams')).then((snap) => {
      const dict: Record<string, string> = {};
      snap.forEach((d) => {
        dict[d.data().name] = d.data().logo || 'https://via.placeholder.com/32?text=?';
      });
      setTeamLogos(dict);
    });
  }, []);

  // Auth triggers
  const handleAuthSubmit = async () => {
    setAuthError('');
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('E-posta ve Şifre alanları boş bırakılamaz.');
      return;
    }

    try {
      if (isRegisterMode) {
        if (!authDisplayName.trim()) {
          setAuthError('Görünen ad girmek zorunludur.');
          return;
        }
        const credential = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword.trim());
        // Write initial profile
        const userRef = doc(db, 'users', credential.user.uid);
        await setDoc(userRef, {
          displayName: authDisplayName.trim(),
          balance: 1000,
          admin: false,
          avatar: `https://ui-avatars.com/api/?name=${authDisplayName.substring(0,2).toUpperCase()}&background=800000&color=ffd700&size=100`,
          favTeam: ''
        });
      } else {
        await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword.trim());
      }
      setAuthModalOpen(false);
      clearAuthInputs();
    } catch (e: any) {
      console.error(e);
      let msg = 'İşlem başarısız oldu. Lütfen bilgilerinizi kontrol ediniz.';
      if (e.code === 'auth/email-already-in-use') msg = 'Bu e-posta adresi zaten kullanımda.';
      if (e.code === 'auth/weak-password') msg = 'Şifre en az 6 karakter olmalıdır.';
      if (e.code === 'auth/invalid-credential') msg = 'E-posta veya şifre hatalı.';
      setAuthError(msg);
    }
  };

  const handleSignOut = async () => {
    if (confirm('Oturumu kapatmak istediğinize emin misiniz?')) {
      await signOut(auth);
      setCurrentView({ type: 'news' });
    }
  };

  const clearAuthInputs = () => {
    setAuthEmail('');
    setAuthPassword('');
    setAuthDisplayName('');
    setAuthError('');
  };

  const handleNavigate = (view: ViewState) => {
    setCurrentView(view);
    // Scroll window back to top on transitions
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    // Falls back home safely
    handleNavigate({ type: 'news' });
  };

  return (
    <div className="bg-[#fcf8f0] text-brand-dark min-h-screen flex flex-col font-sans antialiased text-shadow-none overflow-x-hidden">
      {/* Upper header section */}
      <header className="bg-brand-maroon text-brand-gold py-4 px-4 md:px-8 border-b-4 border-brand-gold relative z-40 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Main logo and language picker */}
          <div className="flex items-center gap-4">
            <div 
              onClick={handleBack}
              className="flex items-center gap-3 cursor-pointer shrink-0 hover:scale-102 transition-transform select-none"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-gold flex items-center justify-center font-black text-brand-maroon border-2 border-white shadow">
                BK
              </div>
              <div>
                <h1 className="text-xl font-black uppercase tracking-widest text-white leading-none">BOBBLEKOLİK</h1>
                <span className="text-[10px] text-brand-gold font-bold tracking-widest block uppercase mt-1">EFSANELER LİGİ</span>
              </div>
            </div>

            {/* Language flags selectors */}
            <div className="flex gap-1.5 ml-4 border-l border-white/20 pl-4">
              {(['tr', 'en', 'pt'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setCurrentLang(lang)}
                  className={`w-5 h-5 rounded overflow-hidden cursor-pointer hover:scale-110 active:scale-95 transition-transform ${currentLang === lang ? 'outline-2 outline-white scale-105' : 'opacity-60'}`}
                >
                  <img 
                    src={lang === 'tr' ? 'https://flagicons.lipis.dev/flags/4x3/tr.svg' : lang === 'en' ? 'https://flagicons.lipis.dev/flags/4x3/gb.svg' : 'https://flagicons.lipis.dev/flags/4x3/pt.svg'} 
                    className="w-full h-full object-cover" 
                    alt={lang} 
                  />
                </button>
              ))}
            </div>
          </div>

          {/* User authentication stats banner in header */}
          <div className="flex items-center gap-4">
            {userProfile ? (
              <div className="flex items-center gap-3 bg-black/25 py-2 px-4 rounded-2xl border border-white/10 shrink-0">
                <img 
                  onClick={() => handleNavigate({ type: 'user-profile', userId: userProfile.uid })}
                  src={userProfile.avatar} 
                  className="w-9 h-9 rounded-full object-cover border-2 border-brand-gold bg-white cursor-pointer hover:scale-105" 
                  alt="avatar" 
                />
                
                <div className="text-left">
                  <div className="flex items-center gap-1">
                    <span 
                      onClick={() => handleNavigate({ type: 'user-profile', userId: userProfile.uid })}
                      className="text-xs font-black text-white hover:underline cursor-pointer truncate max-w-28 uppercase block"
                    >
                      {userProfile.displayName}
                    </span>
                    {userProfile.admin && <span className="bg-red-600 text-white rounded px-1.5 py-0.5 text-[8px] font-black" title="Yönetici">ADM</span>}
                  </div>
                  <span className="text-[10px] font-black text-brand-gold tracking-wide block mt-0.5">
                    💵 {(userProfile.balance || 0).toLocaleString()} ฿
                  </span>
                </div>

                <button 
                  onClick={handleSignOut}
                  className="bg-brand-gold/15 text-brand-gold border border-brand-gold/20 hover:bg-brand-gold hover:text-brand-dark cursor-pointer font-black text-[9px] uppercase px-3 py-1.5 rounded-lg ml-2 transition-colors"
                >
                  Çıkış
                </button>
              </div>
            ) : (
              <button 
                onClick={() => {
                  setIsRegisterMode(false);
                  setAuthModalOpen(true);
                }}
                className="bg-brand-gold hover:bg-white text-brand-dark py-2.5 px-6 rounded-xl font-black text-xs hover:scale-102 transition-transform cursor-pointer shadow uppercase"
              >
                GİRİŞ YAP / ÜYE OL
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Primary Menu selection strip under header */}
      <nav className="bg-transparent py-6 px-4 select-none sticky top-0 z-30 bg-[#fcf8f0]/95 backdrop-blur-sm border-b border-brand-maroon/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-4 items-center justify-center">
          
          {/* Row 1: HABERLER, PUAN DURUMU, TURNUVALAR, HAFTALAR, İSTATİSTİKLER */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              { id: 'news', label: currentLang === 'tr' ? 'HABERLER' : currentLang === 'en' ? 'NEWS' : 'NOTÍCIAS' },
              { id: 'puan', label: currentLang === 'tr' ? 'PUAN DURUMU' : currentLang === 'en' ? 'STANDINGS' : 'TABELA' },
              { id: 'turnuva', label: currentLang === 'tr' ? 'TURNUVALAR' : currentLang === 'en' ? 'TOURNAMENTS' : 'TORNEIOS' },
              { id: 'haftalar', label: currentLang === 'tr' ? 'HAFTALAR' : currentLang === 'en' ? 'WEEKS' : 'SEMANAS' },
              { id: 'istatistik', label: currentLang === 'tr' ? 'İSTATİSTİKLER' : currentLang === 'en' ? 'STATS' : 'ESTATÍSTICAS' }
            ].map((item) => {
              const isActive = currentView.type === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate({ type: item.id as any })}
                  className={`py-3 px-5 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider shrink-0 transition-all duration-150 cursor-pointer border-2 ${
                    isActive 
                      ? 'bg-brand-maroon text-white border-[#5c0101] shadow-[0_4px_0_0_#5c0101] translate-y-0.5' 
                      : 'bg-[#d7cdb7] text-brand-maroon border-brand-maroon shadow-[0_4px_0_0_#800000] hover:bg-[#c9bea9] active:translate-y-0.5'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Row 2: İDDAA, FORUM, 🌟 DÜNYA KUPASI 2026 */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              { id: 'iddia', label: currentLang === 'tr' ? 'İDDİA' : currentLang === 'en' ? 'BETTING' : 'APOSTA' },
              { id: 'forum', label: currentLang === 'tr' ? 'FORUM' : currentLang === 'en' ? 'FORUM' : 'FÓRUM' }
            ].map((item) => {
              const isActive = currentView.type === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate({ type: item.id as any })}
                  className={`py-3 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider shrink-0 transition-all duration-150 cursor-pointer border-2 ${
                    isActive 
                      ? 'bg-brand-maroon text-white border-[#5c0101] shadow-[0_4px_0_0_#5c0101] translate-y-0.5' 
                      : 'bg-[#d7cdb7] text-brand-maroon border-brand-maroon shadow-[0_4px_0_0_#800000] hover:bg-[#c9bea9] active:translate-y-0.5'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}

            {/* Special Gold/Orange World Cup Button */}
            {(() => {
              const item = { id: 'wc', label: currentLang === 'tr' ? '🌟 DÜNYA KUPASI 2026' : currentLang === 'en' ? '🌟 WORLD CUP 2026' : '🌟 COPA DO MUNDO 2026' };
              const isActive = currentView.type === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate({ type: item.id as any })}
                  className={`py-3 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider shrink-0 transition-all duration-150 cursor-pointer border-2 border-brand-maroon ${
                    isActive
                      ? 'bg-amber-500 text-brand-maroon border-[#5c0101] shadow-[0_4px_0_0_#5c0101] translate-y-0.5'
                      : 'bg-[#ffab00] hover:bg-[#e69a00] text-brand-maroon shadow-[0_4px_0_0_#800000] active:translate-y-0.5'
                  }`}
                >
                  {item.label}
                </button>
              );
            })()}
          </div>

        </div>
      </nav>

      {/* Main Container screen elements routing */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 shrink-0 min-h-[60vh]">
        {currentView.type === 'news' && (
          <Haberler 
            currentUser={userProfile} 
            currentLang={currentLang}
            translations={TRANSLATIONS}
            onNavigate={handleNavigate} 
            teamLogos={teamLogos} 
          />
        )}

        {currentView.type === 'wc' && (
          <WorldCup 
            currentUser={userProfile} 
            onNavigate={handleNavigate} 
            teamLogos={teamLogos} 
          />
        )}

        {currentView.type === 'puan' && (
          <PuanDurumu 
            currentLang={currentLang} 
            translations={TRANSLATIONS} 
            onNavigate={handleNavigate} 
          />
        )}

        {currentView.type === 'haftalar' && (
          <Haftalar 
            currentLang={currentLang}
            translations={TRANSLATIONS}
            onNavigate={handleNavigate} 
            teamLogos={teamLogos} 
          />
        )}

        {currentView.type === 'turnuva' && (
          <Turnuvalar 
            currentLang={currentLang}
            translations={TRANSLATIONS}
            onNavigate={handleNavigate} 
            teamLogos={teamLogos} 
          />
        )}

        {currentView.type === 'istatistik' && (
          <Istatistikler 
            currentLang={currentLang} 
            translations={TRANSLATIONS} 
            onNavigate={handleNavigate} 
            teamLogos={teamLogos} 
          />
        )}

        {currentView.type === 'iddia' && (
          <Iddia 
            currentUser={userProfile} 
            onNavigate={handleNavigate} 
            teamLogos={teamLogos} 
          />
        )}

        {currentView.type === 'forum' && (
          <Forum 
            currentUser={userProfile} 
            onNavigate={handleNavigate} 
            teamLogos={teamLogos} 
          />
        )}

        {/* DETAILS SUB-VIEWS ROUTERS */}
        {currentView.type === 'match-detail' && (
          <MatchDetail 
            matchId={(currentView as any).matchId} 
            currentUser={userProfile}
            currentLang={currentLang}
            translations={TRANSLATIONS}
            onBack={handleBack}
            onNavigate={handleNavigate}
          />
        )}

        {currentView.type === 'player-profile' && (
          <PlayerProfile 
            playerName={(currentView as any).playerName}
            currentUser={userProfile}
            currentLang={currentLang}
            translations={TRANSLATIONS}
            onBack={handleBack}
            onNavigate={handleNavigate}
          />
        )}

        {currentView.type === 'team-detail' && (
          <TeamDetail 
            teamName={(currentView as any).teamName}
            currentUser={userProfile}
            currentLang={currentLang}
            translations={TRANSLATIONS}
            onBack={handleBack}
            onNavigate={handleNavigate}
            teamLogos={teamLogos}
          />
        )}

        {currentView.type === 'user-profile' && (
          <UserProfileView 
            userId={(currentView as any).userId}
            currentUser={userProfile}
            currentLang={currentLang}
            translations={TRANSLATIONS}
            onBack={handleBack}
            onNavigate={handleNavigate}
          />
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-brand-dark py-10 px-4 text-center border-t-4 border-brand-maroon mt-16 text-gray-500 text-xs shrink-0 select-none">
        <div className="max-w-7xl mx-auto space-y-3">
          <p className="font-extrabold uppercase tracking-widest text-brand-gold">BOBBLEKOLİK EFSANELER LİGİ 2026</p>
          <p>© Tüm Hakları Saklıdır. Bobblekolik, canavar gibi bir topluluk kulübüdür.</p>
        </div>
      </footer>

      {/* AUTHENTICATION MODAL DIALOG OVERLAY */}
      {authModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#f2ede1] w-full max-w-sm rounded-3xl p-6 border-b-8 border-brand-maroon relative animate-scale-up select-text text-[#3d3d3d]">
            <button 
              onClick={() => {
                setAuthModalOpen(false);
                clearAuthInputs();
              }}
              className="absolute top-4 right-4 text-xl font-black text-brand-maroon cursor-pointer hover:scale-105"
            >
              ✕
            </button>

            <h3 className="text-xl font-black text-brand-maroon text-center mb-6 uppercase">
              {isRegisterMode ? 'Yeni Üyelik Oluştur' : 'Bobble Girişi'}
            </h3>

            {authError && <p className="text-xs text-red-500 font-bold text-center mb-4">{authError}</p>}

            <div className="space-y-4 font-bold text-xs">
              {isRegisterMode && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Görünen Adın</label>
                  <input 
                    type="text" 
                    placeholder="Ad Soyad veya Takma Ad" 
                    value={authDisplayName} 
                    onChange={(e) => setAuthDisplayName(e.target.value)}
                    className="bg-white border rounded p-3 font-semibold text-xs block w-full focus:border-brand-maroon outline-none"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">E-posta Adresi</label>
                <input 
                  type="email" 
                  placeholder="name@example.com" 
                  value={authEmail} 
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="bg-white border rounded p-3 font-semibold text-xs block w-full focus:border-brand-maroon outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">Şifre</label>
                <input 
                  type="password" 
                  placeholder="******" 
                  value={authPassword} 
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="bg-white border rounded p-3 font-semibold text-xs block w-full focus:border-brand-maroon outline-none"
                />
              </div>

              <button 
                onClick={handleAuthSubmit}
                className="bg-brand-maroon text-brand-gold py-3.5 w-full rounded-2xl font-black text-xs text-center hover:bg-[#600000] cursor-pointer shadow border-b-2 border-black block uppercase tracking-wide"
              >
                {isRegisterMode ? 'Hesap Oluştur ve Katıl' : 'Giriş Yap'}
              </button>

              <div className="text-center pt-3 border-t border-gray-200">
                <button 
                  onClick={() => {
                    setIsRegisterMode(!isRegisterMode);
                    setAuthError('');
                  }}
                  className="text-brand-maroon font-bold text-xs underline cursor-pointer"
                >
                  {isRegisterMode ? 'Zaten hesabım var? Giriş Yap' : 'Hesabın yok mu? Hemen Üye Ol'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
