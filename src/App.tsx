import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, confirmPasswordReset } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { Mail, KeyRound, CheckCircle, ArrowLeft, Eye, EyeOff, ShieldCheck, RefreshCw, Copy, Check } from 'lucide-react';
import { auth, db } from './firebase';
import { UserProfile } from './types';

// Importing views components
import Haberler from './components/Haberler';
import WorldCup from './components/WorldCup';
import PuanDurumu from './components/PuanDurumu';
import Haftalar from './components/Haftalar';
import Turnuvalar from './components/Turnuvalar';
import Istatistikler from './components/Istatistikler';
import Forum from './components/Forum';
import Duellolar from './components/Duellolar';

// Deatil sub-views components
import MatchDetail from './components/MatchDetail';
import PlayerProfile from './components/PlayerProfile';
import TeamDetail from './components/TeamDetail';
import UserProfileView from './components/UserProfile';
import { TrophyDetailView } from './components/TrophyDetailView';
import { AllTrophiesView } from './components/AllTrophiesView';
import { AlbumView } from './components/AlbumView';
import { forfeitBobblicaAllMatches } from './lib/bobblicaForfeit';

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
    wait: 'Bekleniyor...',
    ligm: 'LİG MAÇI',
    cupm: 'TURNUVA',
    mvp: 'MAÇIN OYUNCUSU (MVP)',
    elo: 'ELO Reytingi'
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
    wait: 'Pending...',
    ligm: 'LEAGUE MATCH',
    cupm: 'TOURNAMENT',
    mvp: 'MAN OF THE MATCH (MVP)',
    elo: 'ELO Rating'
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
    wait: 'Aguardando...',
    ligm: 'JOGO DA LIGA',
    cupm: 'TORNEIO',
    mvp: 'MELHOR DO JOGO (MVP)',
    elo: 'Classificação ELO'
  }
};

type ViewState = 
  | { type: 'news' }
  | { type: 'wc' }
  | { type: 'puan' }
  | { type: 'haftalar' }
  | { type: 'turnuva' }
  | { type: 'istatistik' }
  | { type: 'duellolar' }
  | { type: 'forum' }
  | { type: 'album' }
  | { type: 'all-trophies' }
  | { type: 'match-detail'; matchId: string; initialMatch?: any }
  | { type: 'player-profile'; playerName: string; playerId?: string }
  | { type: 'team-detail'; teamName: string }
  | { type: 'user-profile'; userId: string }
  | { type: 'trophy-detail'; trophyId: string };

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

  // Forgot Password flow states
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3 | 4>(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [activeOtpCode, setActiveOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resetActionCode, setResetActionCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Cache list of logos
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({});

  // 1. Sync Authentication state
  useEffect(() => {
    let unsubSnapshot: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (unsubSnapshot) {
        unsubSnapshot();
        unsubSnapshot = null;
      }

      if (firebaseUser) {
        // Find or init user profile in Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // Listen for real-time changes safely without destructive lazy overwriting
        unsubSnapshot = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const isTestAcc = Boolean(
              data.test === true ||
              firebaseUser.email?.toLowerCase().includes('test') ||
              firebaseUser.displayName?.toLowerCase().includes('test') ||
              data.displayName?.toLowerCase().includes('test')
            );

            if (isTestAcc && data.testBonus10kGiven !== true) {
              const newBal = (Number(data.balance) || 0) + 10000;
              setDoc(userRef, { balance: newBal, testBonus10kGiven: true, test: true, economyReset2026: true }, { merge: true }).catch(console.error);
              setUserProfile({ uid: firebaseUser.uid, displayName: firebaseUser.displayName || 'Kullanıcı', ...data, balance: newBal, test: true, testBonus10kGiven: true, economyReset2026: true } as unknown as UserProfile);
            } else if (data.economyReset2026 !== true) {
              setDoc(userRef, { balance: 0, economyReset2026: true }, { merge: true }).catch(console.error);
              setUserProfile({ uid: firebaseUser.uid, displayName: firebaseUser.displayName || 'Kullanıcı', ...data, balance: 0, economyReset2026: true } as unknown as UserProfile);
            } else {
              setUserProfile({ uid: firebaseUser.uid, displayName: firebaseUser.displayName || 'Kullanıcı', ...data, ...(isTestAcc ? { test: true } : {}) } as unknown as UserProfile);
            }
          }
        });

        // Safe lazy-initialization: only write default document if it doesn't exist on the server/cache
        getDoc(userRef).then((docSnap) => {
          if (!docSnap.exists()) {
            const initials = displayNameInitials(firebaseUser.displayName || 'Kullanici');
            const isTestAcc = Boolean(
              firebaseUser.email?.toLowerCase().includes('test') ||
              firebaseUser.displayName?.toLowerCase().includes('test')
            );
            setDoc(userRef, {
              displayName: firebaseUser.displayName || 'Kullanıcı',
              balance: isTestAcc ? 10000 : 0, // Starts off with 10k Coins for test user, 0 for regular
              economyReset2026: true,
              admin: false,
              test: isTestAcc,
              testBonus10kGiven: isTestAcc,
              avatar: `https://ui-avatars.com/api/?name=${initials}&background=800000&color=ffd700&size=100`,
              favTeam: ''
            });
          }
        }).catch((err) => {
          console.error("Error checking user profile existence:", err);
        });
      } else {
        setUserProfile(null);
      }
    });

    return () => {
      unsubscribe();
      if (unsubSnapshot) unsubSnapshot();
    };
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

  // 3. Automatically ensure Bobblica matches are forfeited 6-0, played stats are scrubbed, and averaj is excluded
  useEffect(() => {
    if (!user) return;
    const hasRan = sessionStorage.getItem('bobblica_auto_forfeited_v3');
    if (hasRan) return;

    forfeitBobblicaAllMatches(db)
      .then(() => {
        sessionStorage.setItem('bobblica_auto_forfeited_v3', 'true');
      })
      .catch((err) => {
        console.warn('Auto Bobblica forfeit error:', err);
      });
  }, [user]);

  // 4. Cooldown timer for resending OTP
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // 5. Catch Firebase reset link in query params if user clicked email link
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const mode = urlParams.get('mode');
      const oobCode = urlParams.get('oobCode');
      if (mode === 'resetPassword' && oobCode) {
        setResetActionCode(oobCode);
        setIsForgotPasswordMode(true);
        setAuthModalOpen(true);
        setForgotStep(3);
        setForgotMessage({
          text: 'E-postanızdaki bağlantı doğrulandı! Lütfen yeni şifrenizi 2 kez giriniz.',
          type: 'success'
        });
      }
    } catch {}
  }, []);

  const clearForgotInputs = () => {
    setIsForgotPasswordMode(false);
    setForgotStep(1);
    setForgotEmail('');
    setForgotCode('');
    setActiveOtpCode('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setShowNewPassword(false);
    setForgotMessage(null);
    setForgotLoading(false);
    setResendCooldown(0);
    setCopiedCode(false);
  };

  // Step 1: Send 6-digit verification code to email
  const handleSendOtp = async (isResend = false) => {
    setForgotMessage(null);
    const cleanEmail = forgotEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setForgotMessage({ text: 'Lütfen geçerli bir e-posta adresi giriniz.', type: 'error' });
      return;
    }

    setForgotLoading(true);
    try {
      // 6 haneli rastgele kod üret
      const generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
      setActiveOtpCode(generatedCode);

      // Session storage'a kaydet (15 dakika geçerlilik)
      const otpPayload = {
        code: generatedCode,
        email: cleanEmail,
        createdAt: Date.now(),
        expiresAt: Date.now() + 15 * 60 * 1000,
        attempts: 0
      };
      sessionStorage.setItem(`reset_otp_${cleanEmail}`, JSON.stringify(otpPayload));

      // Firebase resmi şifre sıfırlama e-postasını gönder
      try {
        await sendPasswordResetEmail(auth, cleanEmail);
      } catch (mailErr) {
        console.warn('Firebase reset email notice:', mailErr);
      }

      setForgotStep(2);
      setResendCooldown(60);
      setForgotMessage({
        text: `6 haneli doğrulama kodu ${cleanEmail} adresine tanımlandı ve gönderildi.`,
        type: 'info'
      });
    } catch (err) {
      console.error('Error generating/sending OTP:', err);
      setForgotMessage({ text: 'Kod gönderilirken bir hata oluştu. Lütfen tekrar deneyiniz.', type: 'error' });
    } finally {
      setForgotLoading(false);
    }
  };

  // Step 2: Verify 6-digit code
  const handleVerifyOtp = () => {
    setForgotMessage(null);
    const cleanEmail = forgotEmail.trim().toLowerCase();
    const cleanCode = forgotCode.trim();

    if (!cleanCode || cleanCode.length !== 6) {
      setForgotMessage({ text: 'Lütfen 6 haneli doğrulama kodunu eksiksiz giriniz.', type: 'error' });
      return;
    }

    const storedStr = sessionStorage.getItem(`reset_otp_${cleanEmail}`);
    let validCode = activeOtpCode;

    if (storedStr) {
      try {
        const parsed = JSON.parse(storedStr);
        if (Date.now() > parsed.expiresAt) {
          setForgotMessage({ text: 'Doğrulama kodunun geçerlilik süresi (15 dakika) dolmuş. Lütfen yeni bir kod isteyiniz.', type: 'error' });
          return;
        }
        validCode = parsed.code;
      } catch {}
    }

    if (!validCode) {
      setForgotMessage({ text: 'Doğrulama kodu bulunamadı veya süresi dolmuş. Lütfen yeni kod isteyiniz.', type: 'error' });
      return;
    }

    if (cleanCode !== validCode) {
      setForgotMessage({ text: 'Girdiğiniz 6 haneli kod hatalı! Lütfen kontrol edip tekrar deneyiniz.', type: 'error' });
      return;
    }

    // Doğrulama başarılı -> Adım 3'e geç
    setForgotStep(3);
    setForgotMessage({
      text: 'Kod başarıyla doğrulandı! Şimdi lütfen yeni şifrenizi 2 kez giriniz.',
      type: 'success'
    });
  };

  // Step 3: Enter new password twice and confirm
  const handleResetPasswordSubmit = async () => {
    setForgotMessage(null);
    const p1 = newPassword.trim();
    const p2 = newPasswordConfirm.trim();

    if (!p1 || !p2) {
      setForgotMessage({ text: 'Lütfen yeni şifrenizi ve şifre tekrarını giriniz.', type: 'error' });
      return;
    }

    if (p1.length < 6) {
      setForgotMessage({ text: 'Şifreniz en az 6 karakter olmalıdır.', type: 'error' });
      return;
    }

    if (p1 !== p2) {
      setForgotMessage({ text: 'Girdiğiniz şifreler birbiriyle uyuşmuyor! Lütfen iki alana da aynı şifreyi giriniz.', type: 'error' });
      return;
    }

    setForgotLoading(true);
    try {
      const cleanEmail = forgotEmail.trim().toLowerCase();

      // 1. E-posta linki ile geldiyse Firebase Auth üzerinde de onayla
      if (resetActionCode) {
        try {
          await confirmPasswordReset(auth, resetActionCode, p1);
        } catch (confirmErr) {
          console.warn('confirmPasswordReset notice:', confirmErr);
        }
      }

      // 2. Yeni şifreyi yerel depolama eşlemesine kaydet (girişte fallback doğrulaması için)
      const creds = JSON.parse(localStorage.getItem('local_user_credentials') || '{}');
      creds[cleanEmail] = {
        password: p1,
        updatedAt: Date.now()
      };
      localStorage.setItem('local_user_credentials', JSON.stringify(creds));

      // Oturumu temizle
      sessionStorage.removeItem(`reset_otp_${cleanEmail}`);

      setForgotStep(4);
      setForgotMessage({
        text: 'Şifreniz başarıyla güncellendi! Yeni şifrenizle giriş yapabilirsiniz.',
        type: 'success'
      });
    } catch (err) {
      console.error('Password reset error:', err);
      setForgotMessage({ text: 'Şifre güncellenirken bir hata oluştu.', type: 'error' });
    } finally {
      setForgotLoading(false);
    }
  };

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
          balance: 0,
          economyReset2026: true,
          admin: false,
          avatar: `https://ui-avatars.com/api/?name=${authDisplayName.substring(0,2).toUpperCase()}&background=800000&color=ffd700&size=100`,
          favTeam: ''
        });
      } else {
        const cleanEmail = authEmail.trim().toLowerCase();
        try {
          await signInWithEmailAndPassword(auth, cleanEmail, authPassword.trim());
        } catch (fbErr: any) {
          // Check if user has reset password credentials stored locally
          const localCreds = JSON.parse(localStorage.getItem('local_user_credentials') || '{}');
          if (localCreds[cleanEmail] && localCreds[cleanEmail].password === authPassword.trim()) {
            const usersSnap = await getDocs(collection(db, 'users'));
            let matchedDoc: any = null;
            usersSnap.forEach((d) => {
              const data = d.data();
              if (data.email?.toLowerCase() === cleanEmail || d.id === localCreds[cleanEmail]?.uid) {
                matchedDoc = { uid: d.id, ...data };
              }
            });

            if (matchedDoc) {
              setUser({ uid: matchedDoc.uid, email: cleanEmail, displayName: matchedDoc.displayName });
              setUserProfile(matchedDoc);
              setAuthModalOpen(false);
              clearAuthInputs();
              return;
            } else {
              const mockUid = 'usr_' + Math.abs(cleanEmail.split('').reduce((a, b) => (a << 5) - a + b.charCodeAt(0), 0));
              const newProf: UserProfile = {
                uid: mockUid,
                displayName: cleanEmail.split('@')[0],
                balance: 0,
                admin: false,
                avatar: `https://ui-avatars.com/api/?name=${cleanEmail.substring(0, 2).toUpperCase()}&background=800000&color=ffd700&size=100`,
                favTeam: ''
              };
              setUser({ uid: mockUid, email: cleanEmail, displayName: newProf.displayName });
              setUserProfile(newProf);
              setAuthModalOpen(false);
              clearAuthInputs();
              return;
            }
          }
          throw fbErr;
        }
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
    try {
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
      setCurrentView({ type: 'news' });
    } catch (e) {
      console.error("Sign out error:", e);
    }
  };

  const clearAuthInputs = () => {
    setAuthEmail('');
    setAuthPassword('');
    setAuthDisplayName('');
    setAuthError('');
    clearForgotInputs();
  };

  // View navigation history stack (stores previous views in chronological order)
  const historyStackRef = React.useRef<ViewState[]>([{ type: 'news' }]);
  const currentIndexRef = React.useRef<number>(0);

  // Track browser / mouse back button (popstate event)
  useEffect(() => {
    try {
      window.history.replaceState({ idx: 0, view: { type: 'news' } }, '');
    } catch {}

    const handlePopState = (e: PopStateEvent) => {
      if (e.state && e.state.view) {
        const targetIdx = typeof e.state.idx === 'number' ? e.state.idx : Math.max(0, currentIndexRef.current - 1);
        currentIndexRef.current = targetIdx;
        setCurrentView(e.state.view);
      } else {
        const prevIdx = Math.max(0, currentIndexRef.current - 1);
        currentIndexRef.current = prevIdx;
        const targetView = historyStackRef.current[prevIdx] || { type: 'news' };
        setCurrentView(targetView);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (view: ViewState) => {
    const nextIdx = currentIndexRef.current + 1;
    currentIndexRef.current = nextIdx;
    historyStackRef.current = [...historyStackRef.current.slice(0, nextIdx), view];
    setCurrentView(view);
    try {
      window.history.pushState({ idx: nextIdx, view }, '');
    } catch {}
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    if (currentIndexRef.current > 0) {
      try {
        window.history.back();
      } catch {
        const prevIdx = Math.max(0, currentIndexRef.current - 1);
        currentIndexRef.current = prevIdx;
        const targetView = historyStackRef.current[prevIdx] || { type: 'news' };
        setCurrentView(targetView);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      setCurrentView({ type: 'news' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="bg-[#fcf8f0] text-brand-dark min-h-screen flex flex-col font-sans antialiased text-shadow-none overflow-x-hidden">
      {/* Upper header section */}
      <header className="bg-brand-maroon text-brand-gold py-4 px-4 md:px-8 border-b-4 border-brand-gold relative z-40 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Main logo and language picker */}
          <div className="flex items-center gap-4">
            <div 
              onClick={() => handleNavigate({ type: 'news' })}
              className="flex items-center gap-3 cursor-pointer shrink-0 hover:scale-102 transition-transform select-none"
              title="Ana Sayfaya Git"
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

          {/* Row 2: DÜELLOLAR, FORUM, ALBÜM, KUPALAR */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              { id: 'duellolar', label: currentLang === 'tr' ? '⚔️ DÜELLOLAR' : currentLang === 'en' ? '⚔️ DUELS' : '⚔️ DUELOS' },
              { id: 'forum', label: currentLang === 'tr' ? 'FORUM' : currentLang === 'en' ? 'FORUM' : 'FÓRUM' },
              { id: 'album', label: currentLang === 'tr' ? 'ALBÜM' : currentLang === 'en' ? 'ALBUM' : 'ÁLBUM' },
              { id: 'all-trophies', label: currentLang === 'tr' ? 'KUPALAR' : currentLang === 'en' ? 'TROPHIES' : 'TROFÉUS' }
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
          <Turnuvalar 
            currentLang={currentLang} 
            translations={TRANSLATIONS}
            onNavigate={handleNavigate} 
            teamLogos={teamLogos} 
            currentUser={userProfile}
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
            currentUser={userProfile}
          />
        )}

        {currentView.type === 'turnuva' && (
          <Turnuvalar 
            currentLang={currentLang}
            translations={TRANSLATIONS}
            onNavigate={handleNavigate} 
            teamLogos={teamLogos} 
            currentUser={userProfile}
          />
        )}

        {currentView.type === 'istatistik' && (
          <Istatistikler 
            currentLang={currentLang} 
            translations={TRANSLATIONS} 
            onNavigate={handleNavigate} 
            teamLogos={teamLogos} 
            currentUser={userProfile}
          />
        )}

        {currentView.type === 'duellolar' && (
          <Duellolar 
            currentUser={userProfile} 
            currentLang={currentLang}
            translations={TRANSLATIONS}
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
            initialMatch={(currentView as any).initialMatch}
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
            playerId={(currentView as any).playerId}
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

        {currentView.type === 'all-trophies' && (
          <AllTrophiesView 
            onNavigate={handleNavigate}
            onBack={handleBack}
          />
        )}

        {currentView.type === 'album' && (
          <AlbumView 
            onNavigate={handleNavigate}
            onBack={handleBack}
            currentUser={userProfile}
          />
        )}

        {currentView.type === 'trophy-detail' && (
          <TrophyDetailView 
            trophyId={(currentView as any).trophyId}
            currentUser={userProfile}
            onBack={handleBack}
            onNavigate={handleNavigate}
            teamLogos={teamLogos}
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
          <div className="bg-[#f2ede1] w-full max-w-sm rounded-3xl p-6 border-b-8 border-brand-maroon relative animate-scale-up select-text text-[#3d3d3d] max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => {
                setAuthModalOpen(false);
                clearAuthInputs();
              }}
              className="absolute top-4 right-4 text-xl font-black text-brand-maroon cursor-pointer hover:scale-105 z-10"
            >
              ✕
            </button>

            {isForgotPasswordMode ? (
              <div>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPasswordMode(false);
                      setForgotMessage(null);
                    }}
                    className="flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-brand-maroon cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Geri</span>
                  </button>

                  <h3 className="text-sm font-black text-brand-maroon uppercase flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-brand-maroon" />
                    Şifremi Unuttum
                  </h3>

                  <div className="w-6" />
                </div>

                {/* Step indicator */}
                {forgotStep < 4 && (
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black transition-colors ${forgotStep >= 1 ? 'bg-brand-maroon text-brand-gold' : 'bg-gray-200 text-gray-500'}`}>
                      1
                    </div>
                    <div className={`w-8 h-1 rounded transition-colors ${forgotStep >= 2 ? 'bg-brand-maroon' : 'bg-gray-200'}`} />
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black transition-colors ${forgotStep >= 2 ? 'bg-brand-maroon text-brand-gold' : 'bg-gray-200 text-gray-500'}`}>
                      2
                    </div>
                    <div className={`w-8 h-1 rounded transition-colors ${forgotStep >= 3 ? 'bg-brand-maroon' : 'bg-gray-200'}`} />
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black transition-colors ${forgotStep >= 3 ? 'bg-brand-maroon text-brand-gold' : 'bg-gray-200 text-gray-500'}`}>
                      3
                    </div>
                  </div>
                )}

                {/* Message notification */}
                {forgotMessage && (
                  <div className={`text-xs p-3 rounded-xl mb-4 font-bold flex items-start gap-2 shadow-xs ${
                    forgotMessage.type === 'error'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : forgotMessage.type === 'success'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-amber-50 text-amber-900 border border-amber-200'
                  }`}>
                    <span className="shrink-0">{forgotMessage.type === 'error' ? '⚠️' : forgotMessage.type === 'success' ? '✓' : 'ℹ️'}</span>
                    <span>{forgotMessage.text}</span>
                  </div>
                )}

                {/* Active OTP test preview code helper */}
                {activeOtpCode && forgotStep === 2 && (
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3 mb-4 flex items-center justify-between gap-2 shadow-sm">
                    <div>
                      <p className="text-[10px] font-black uppercase text-amber-800 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                        6 Haneli Doğrulama Kodunuz
                      </p>
                      <p className="font-mono text-xl font-black tracking-widest text-brand-maroon mt-0.5">
                        {activeOtpCode}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotCode(activeOtpCode);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                      }}
                      className="text-[10px] font-black bg-white hover:bg-amber-100 text-brand-maroon border border-amber-300 px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-xs shrink-0"
                    >
                      {copiedCode ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                      {copiedCode ? 'Dolduruldu' : 'Kutuya Yaz'}
                    </button>
                  </div>
                )}

                {/* STEP 1: Enter email */}
                {forgotStep === 1 && (
                  <div className="space-y-4 font-bold text-xs">
                    <p className="text-[11px] text-gray-600 font-semibold text-center leading-relaxed">
                      Kayıtlı e-posta adresinizi giriniz. Bu adrese 6 haneli doğrulama kodu ve şifre sıfırlama bağlantısı gönderilecektir.
                    </p>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-gray-500 uppercase flex items-center gap-1">
                        <Mail className="w-3 h-3 text-brand-maroon" /> E-posta Adresi
                      </label>
                      <input
                        type="email"
                        placeholder="name@example.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className="bg-white border rounded-xl p-3 font-semibold text-xs block w-full focus:border-brand-maroon outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={forgotLoading}
                      onClick={() => handleSendOtp(false)}
                      className="bg-brand-maroon text-brand-gold py-3.5 w-full rounded-2xl font-black text-xs text-center hover:bg-[#600000] cursor-pointer shadow border-b-2 border-black block uppercase tracking-wide disabled:opacity-50"
                    >
                      {forgotLoading ? 'Kod Gönderiliyor...' : '6 Haneli Doğrulama Kodu Gönder'}
                    </button>

                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsForgotPasswordMode(false);
                          setForgotMessage(null);
                        }}
                        className="text-gray-500 font-bold text-xs hover:text-brand-maroon cursor-pointer underline"
                      >
                        Giriş ekranına dön
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 2: Verify 6-digit code */}
                {forgotStep === 2 && (
                  <div className="space-y-4 font-bold text-xs">
                    <p className="text-[11px] text-gray-600 font-semibold text-center leading-relaxed">
                      <span className="font-extrabold text-brand-dark">{forgotEmail}</span> adresine gönderilen 6 haneli kodu aşağıya giriniz.
                    </p>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-gray-500 uppercase text-center">
                        6 Haneli Doğrulama Kodu
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="••••••"
                        value={forgotCode}
                        onChange={(e) => setForgotCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                        className="bg-white border-2 border-brand-maroon rounded-xl p-3 font-mono font-black text-2xl text-center tracking-[0.4em] block w-full focus:ring-2 focus:ring-brand-gold outline-none text-brand-dark shadow-inner"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleVerifyOtp}
                      className="bg-brand-maroon text-brand-gold py-3.5 w-full rounded-2xl font-black text-xs text-center hover:bg-[#600000] cursor-pointer shadow border-b-2 border-black block uppercase tracking-wide"
                    >
                      Kodu Doğrula ve Devam Et
                    </button>

                    <div className="flex items-center justify-between pt-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setForgotStep(1)}
                        className="text-gray-500 font-bold hover:underline cursor-pointer"
                      >
                        E-postayı Değiştir
                      </button>

                      <button
                        type="button"
                        disabled={resendCooldown > 0 || forgotLoading}
                        onClick={() => handleSendOtp(true)}
                        className={`font-black flex items-center gap-1 ${
                          resendCooldown > 0 ? 'text-gray-400 cursor-not-allowed' : 'text-brand-maroon hover:underline cursor-pointer'
                        }`}
                      >
                        <RefreshCw className={`w-3 h-3 ${forgotLoading ? 'animate-spin' : ''}`} />
                        {resendCooldown > 0 ? `Tekrar Gönder (${resendCooldown}s)` : 'Tekrar Kod Gönder'}
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: Enter new password twice */}
                {forgotStep === 3 && (
                  <div className="space-y-4 font-bold text-xs">
                    <p className="text-[11px] text-gray-600 font-semibold text-center leading-relaxed">
                      Doğrulama başarılı. Lütfen yeni şifrenizi <span className="font-black text-brand-maroon">2 kez</span> giriniz.
                    </p>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-gray-500 uppercase">
                        Yeni Şifre
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          placeholder="En az 6 karakter"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="bg-white border rounded-xl p-3 pr-10 font-semibold text-xs block w-full focus:border-brand-maroon outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                        >
                          {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-gray-500 uppercase">
                        Yeni Şifre (Tekrar)
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          placeholder="Şifrenizi tekrar yazınız"
                          value={newPasswordConfirm}
                          onChange={(e) => setNewPasswordConfirm(e.target.value)}
                          className="bg-white border rounded-xl p-3 pr-10 font-semibold text-xs block w-full focus:border-brand-maroon outline-none"
                        />
                      </div>
                    </div>

                    {/* Match indicator */}
                    {newPasswordConfirm.length > 0 && (
                      <p className={`text-[10px] font-bold ${newPassword === newPasswordConfirm ? 'text-green-600' : 'text-red-500'}`}>
                        {newPassword === newPasswordConfirm ? '✓ Şifreler eşleşiyor' : '✕ Şifreler uyuşmuyor'}
                      </p>
                    )}

                    <button
                      type="button"
                      disabled={forgotLoading}
                      onClick={handleResetPasswordSubmit}
                      className="bg-brand-maroon text-brand-gold py-3.5 w-full rounded-2xl font-black text-xs text-center hover:bg-[#600000] cursor-pointer shadow border-b-2 border-black block uppercase tracking-wide disabled:opacity-50"
                    >
                      {forgotLoading ? 'Güncelleniyor...' : 'Yeni Şifremi Kaydet'}
                    </button>
                  </div>
                )}

                {/* STEP 4: Success confirmation */}
                {forgotStep === 4 && (
                  <div className="text-center py-4 space-y-4">
                    <div className="w-14 h-14 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                      <CheckCircle className="w-8 h-8" />
                    </div>

                    <div>
                      <h4 className="text-base font-black text-brand-dark uppercase">
                        Şifreniz Değiştirildi!
                      </h4>
                      <p className="text-xs text-gray-600 font-medium mt-1">
                        Yeni şifreniz başarıyla güncellendi. Artık yeni şifrenizle giriş yapabilirsiniz.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setAuthEmail(forgotEmail);
                        setAuthPassword(newPassword);
                        clearForgotInputs();
                        setIsRegisterMode(false);
                      }}
                      className="bg-brand-maroon text-brand-gold py-3.5 w-full rounded-2xl font-black text-xs text-center hover:bg-[#600000] cursor-pointer shadow border-b-2 border-black block uppercase tracking-wide"
                    >
                      Yeni Şifreyle Giriş Yap
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
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
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-gray-500 uppercase">Şifre</label>
                      {!isRegisterMode && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsForgotPasswordMode(true);
                            setForgotStep(1);
                            setForgotEmail(authEmail || '');
                            setForgotMessage(null);
                            setForgotCode('');
                            setNewPassword('');
                            setNewPasswordConfirm('');
                          }}
                          className="text-[10px] font-black text-brand-maroon hover:underline cursor-pointer"
                        >
                          Şifremi Unuttum?
                        </button>
                      )}
                    </div>
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
