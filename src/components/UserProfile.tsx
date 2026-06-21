import React, { useState, useEffect } from 'react';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  collection, 
  getDocs, 
  collectionGroup, 
  query, 
  where, 
  limit, 
  arrayUnion, 
  arrayRemove 
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile as UserProfileType, Team, Player } from '../types';
import { 
  ArrowLeft, 
  Coins, 
  MessageSquare, 
  Heart, 
  Award, 
  PenSquare, 
  Check, 
  Loader2, 
  Users, 
  Settings, 
  X, 
  ExternalLink 
} from 'lucide-react';

interface UserProfileProps {
  userId: string; // The ID of the user whose profile is being viewed
  currentUser: UserProfileType | null; // The logged-in user
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onBack: () => void;
  onNavigate: (view: any) => void;
}

interface ActivityItem {
  id: string;
  date: Date;
  text: string;
  type: string;
}

export default function UserProfile({ 
  userId, 
  currentUser, 
  currentLang, 
  translations, 
  onBack, 
  onNavigate 
}: UserProfileProps) {
  const [profile, setProfile] = useState<UserProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Stats
  const [commentCount, setCommentCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  // Favoriler
  const [favTeamLogo, setFavTeamLogo] = useState<string>('https://via.placeholder.com/50?text=?');
  const [favPlayerPhoto, setFavPlayerPhoto] = useState<string>('https://via.placeholder.com/50?text=?');

  // Edit (Account Console) Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editBio, setEditBio] = useState('');

  // Dropdown selectors for Favoriler (Lazy loaded/loaded on demand when owner viewed)
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedFavTeam, setSelectedFavTeam] = useState('');
  const [selectedFavPlayer, setSelectedFavPlayer] = useState('');
  const [savingFavs, setSavingFavs] = useState(false);
  const [favSaveSuccess, setFavSaveSuccess] = useState(false);

  // Activities Feed
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  // Follow Modal List
  const [followModalType, setFollowModalType] = useState<'followers' | 'following' | null>(null);
  const [followModalUsers, setFollowModalUsers] = useState<UserProfileType[]>([]);
  const [loadingFollowList, setLoadingFollowList] = useState(false);

  // Cache to prevent repetitive database reads for follower names
  const [userCache, setUserCache] = useState<Record<string, UserProfileType>>({});

  const t = translations[currentLang] || {};
  const isOwnProfile = currentUser && currentUser.uid === userId;

  // 1. Initial Load: user profile details
  useEffect(() => {
    let active = true;
    setLoading(true);

    const loadProfile = async () => {
      try {
        const ref = doc(db, 'users', userId);
        const res = await getDoc(ref);
        if (!res.exists()) {
          if (active) {
            setProfile(null);
            setLoading(false);
          }
          return;
        }

        const data = { uid: res.id, ...res.data() } as UserProfileType;
        if (active) {
          setProfile(data);
          setEditName(data.displayName || '');
          setEditAvatar(data.avatar || '');
          setEditBio(data.bio || '');
          setSelectedFavTeam(data.favTeam || '');
          setSelectedFavPlayer(data.favPlayer || '');
          
          setFollowersCount(data.followers?.length || 0);
          setFollowingCount(data.following?.length || 0);

          if (currentUser) {
            setIsFollowing((data.followers || []).includes(currentUser.uid));
          }
        }

        // Display Favorites badges dynamically & optimize quota
        if (data.favTeam) {
          const tSnap = await getDocs(query(collection(db, 'teams'), where('name', '==', data.favTeam), limit(1)));
          if (!tSnap.empty && active) {
            setFavTeamLogo(tSnap.docs[0].data().logo || 'https://via.placeholder.com/50?text=?');
          } else if (active) {
            setFavTeamLogo('https://via.placeholder.com/50?text=?');
          }
        } else if (active) {
          setFavTeamLogo('https://via.placeholder.com/50?text=?');
        }

        if (data.favPlayer) {
          const pSnap = await getDocs(query(collection(db, 'players'), where('pname', '==', data.favPlayer), limit(1)));
          if (!pSnap.empty && active) {
            setFavPlayerPhoto(pSnap.docs[0].data().foto || 'https://via.placeholder.com/50?text=?');
          } else if (active) {
            setFavPlayerPhoto('https://via.placeholder.com/50?text=?');
          }
        } else if (active) {
          setFavPlayerPhoto('https://via.placeholder.com/50?text=?');
        }

        // Fetch user activities
        fetchActivities(userId, active);
      } catch (err) {
        console.error("Error loading user profile:", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, [userId, currentUser?.uid]);

  // Lazy load option lists only for the own profile settings
  useEffect(() => {
    if (isOwnProfile) {
      // Teams
      getDocs(collection(db, 'teams')).then((snap) => {
        const list: Team[] = [];
        snap.forEach((d) => {
          list.push(d.data() as Team);
        });
        setTeams(list.sort((a, b) => a.name.localeCompare(b.name)));
      });

      // Players
      getDocs(collection(db, 'players')).then((snap) => {
        const list: Player[] = [];
        snap.forEach((d) => {
          list.push(d.data() as Player);
        });
        setPlayers(list.sort((a, b) => a.pname.localeCompare(b.pname)));
      });
    }
  }, [isOwnProfile]);

  // Fetch activities from separate sub-collections/root collections wrapped safely in try-catch blocks
  const fetchActivities = async (targetUid: string, active: boolean) => {
    if (!active) return;
    setLoadingActivities(true);
    let masterList: ActivityItem[] = [];

    // 1. News comments
    try {
      const qComment = query(
        collectionGroup(db, 'yorumlar'),
        where('uid', '==', targetUid),
        limit(15)
      );
      const snapComment = await getDocs(qComment);
      snapComment.forEach((d) => {
        const data = d.data();
        let dateVal = new Date();
        if (data.tarih) {
          dateVal = typeof data.tarih.toDate === 'function' ? data.tarih.toDate() : new Date(data.tarih);
        }
        masterList.push({
          id: `comment-${d.id}`,
          date: dateVal,
          text: `"${data.yorum || ''}"`,
          type: currentLang === 'tr' ? 'Haber Yorumu' : currentLang === 'en' ? 'News Comment' : 'Comentário'
        });
      });
    } catch (e) {
      console.warn("Could not load news comments for user:", e);
    }

    // 2. Forum posts
    try {
      const qForum = query(
        collection(db, 'forum'),
        where('uid', '==', targetUid),
        limit(15)
      );
      const snapForum = await getDocs(qForum);
      snapForum.forEach((d) => {
        const data = d.data();
        let dateVal = new Date();
        if (data.tarih) {
          dateVal = typeof data.tarih.toDate === 'function' ? data.tarih.toDate() : new Date(data.tarih);
        }
        masterList.push({
          id: `forum-${d.id}`,
          date: dateVal,
          text: `<strong>${data.baslik || ''}</strong><br/>${data.icerik || ''}`,
          type: currentLang === 'tr' ? 'Forum Gönderisi' : currentLang === 'en' ? 'Forum Post' : 'Post no Fórum'
        });
      });
    } catch (e) {
      console.warn("Could not load forum posts for user:", e);
    }

    // 3. News/Forum replies
    try {
      const qReplies = query(
        collectionGroup(db, 'yanitlar'),
        where('uid', '==', targetUid),
        limit(15)
      );
      const snapReplies = await getDocs(qReplies);
      snapReplies.forEach((d) => {
        const data = d.data();
        let dateVal = new Date();
        if (data.tarih) {
          dateVal = typeof data.tarih.toDate === 'function' ? data.tarih.toDate() : new Date(data.tarih);
        }
        masterList.push({
          id: `reply-${d.id}`,
          date: dateVal,
          text: `"${data.yorum || ''}"`,
          type: currentLang === 'tr' ? 'Yanıt' : currentLang === 'en' ? 'Reply' : 'Resposta'
        });
      });
    } catch (e) {
      console.warn("Could not load replies for user:", e);
    }

    if (!active) return;
    masterList.sort((a, b) => b.date.getTime() - a.date.getTime());
    const cutList = masterList.slice(0, 15);
    setActivities(cutList);
    setCommentCount(cutList.length);
    setLoadingActivities(false);
  };

  // Follow or unfollow toggle
  const toggleFollow = async () => {
    if (!currentUser) {
      alert(currentLang === 'tr' ? "Lütfen önce giriş yapın!" : "Please login first!");
      return;
    }
    setActionLoading(true);

    const targetRef = doc(db, 'users', userId);
    const currentRef = doc(db, 'users', currentUser.uid);

    try {
      if (isFollowing) {
        // Unfollow
        await updateDoc(targetRef, {
          followers: arrayRemove(currentUser.uid)
        });
        await updateDoc(currentRef, {
          following: arrayRemove(userId)
        });
        setFollowersCount(prev => Math.max(0, prev - 1));
        setIsFollowing(false);
      } else {
        // Follow
        await updateDoc(targetRef, {
          followers: arrayUnion(currentUser.uid)
        });
        await updateDoc(currentRef, {
          following: arrayUnion(userId)
        });
        setFollowersCount(prev => prev + 1);
        setIsFollowing(true);
      }
    } catch (err) {
      console.error("Error toggling follow:", err);
      alert(currentLang === 'tr' ? "İşlem başarısız oldu!" : "Action failed!");
    } finally {
      setActionLoading(false);
    }
  };

  // Account settings saving
  const handleSaveAccountData = async () => {
    if (!editName.trim()) {
      alert(currentLang === 'tr' ? "Kullanıcı adı boş bırakılamaz!" : "Username cannot be empty!");
      return;
    }

    setActionLoading(true);
    try {
      const ref = doc(db, 'users', userId);
      const updates = {
        displayName: editName.trim(),
        avatar: editAvatar.trim(),
        bio: editBio.trim()
      };
      await updateDoc(ref, updates);

      // update locally
      setProfile(prev => prev ? { ...prev, ...updates } : null);
      setEditModalOpen(false);
    } catch (err) {
      console.error(err);
      alert(currentLang === 'tr' ? "Kaydedilemedi!" : "Could not save details!");
    } finally {
      setActionLoading(false);
    }
  };

  // Favorites selection saving
  const handleSaveFavorites = async () => {
    setSavingFavs(true);
    try {
      const ref = doc(db, 'users', userId);
      await updateDoc(ref, {
        favTeam: selectedFavTeam,
        favPlayer: selectedFavPlayer
      });

      setProfile(prev => prev ? { ...prev, favTeam: selectedFavTeam, favPlayer: selectedFavPlayer } : null);
      
      // Update displayed images on the fly
      if (selectedFavTeam) {
        const foundT = teams.find(tObj => tObj.name === selectedFavTeam);
        if (foundT) setFavTeamLogo(foundT.logo);
      } else {
        setFavTeamLogo('https://via.placeholder.com/50?text=?');
      }

      if (selectedFavPlayer) {
        const foundP = players.find(pObj => pObj.pname === selectedFavPlayer);
        if (foundP) setFavPlayerPhoto(foundP.foto);
      } else {
        setFavPlayerPhoto('https://via.placeholder.com/50?text=?');
      }

      setFavSaveSuccess(true);
      setTimeout(() => setFavSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingFavs(false);
    }
  };

  // Followers lists modal loader
  const handleOpenFollowModal = async (type: 'followers' | 'following') => {
    setFollowModalType(type);
    setLoadingFollowList(true);
    setFollowModalUsers([]);

    const arr = type === 'followers' 
      ? (profile?.followers || []) 
      : (profile?.following || []);

    if (arr.length === 0) {
      setLoadingFollowList(false);
      return;
    }

    const fetchedList: UserProfileType[] = [];
    const updatedCache = { ...userCache };

    try {
      for (const uid of arr) {
        if (updatedCache[uid]) {
          fetchedList.push(updatedCache[uid]);
        } else {
          const docRef = doc(db, 'users', uid);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = { uid: snap.id, ...snap.data() } as UserProfileType;
            updatedCache[uid] = data;
            fetchedList.push(data);
          } else {
            fetchedList.push({ uid, displayName: currentLang === 'tr' ? 'Bilinmeyen Kullanıcı' : 'Unknown User' });
          }
        }
      }
      setUserCache(updatedCache);
      setFollowModalUsers(fetchedList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingFollowList(false);
    }
  };

  const currentAvatar = profile?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.displayName || 'U')}&background=800000&color=ffd700&size=150`;

  return (
    <div className="bg-[#e8e1d1] min-h-screen text-[#3d3d3d] font-sans">
      
      {/* Navbar Header resembling user custom layout */}
      <div className="bg-[#800000] py-4 px-6 flex items-center justify-between border-b-4 border-[#1a1a1a] shadow-md sticky top-0 z-20">
        <button 
          onClick={onBack}
          className="text-[#ffd700] hover:scale-105 active:scale-95 transition-transform font-black text-sm md:text-base flex items-center gap-1.5 uppercase cursor-pointer"
        >
          ⬅ {currentLang === 'tr' ? 'Ana Sayfa' : 'Home'}
        </button>
        <span className="text-xl md:text-2xl font-black text-[#e8e1d1] tracking-widest uppercase">
          BOBBLEKOLİK
        </span>
        <div className="w-20"></div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-[#800000]" />
          <p className="font-extrabold text-sm uppercase text-[#800000] tracking-wider">
            {currentLang === 'tr' ? 'Profil Yükleniyor...' : 'Loading Profile...'}
          </p>
        </div>
      ) : !profile ? (
        <div className="max-w-md mx-auto py-20 px-4 text-center">
          <h2 className="text-lg font-black text-[#800000] uppercase mb-2">
            {currentLang === 'tr' ? 'Kullanıcı Bulunamadı!' : 'User Not Found!'}
          </h2>
          <p className="font-bold text-xs text-gray-500">
            {currentLang === 'tr' ? 'Bu kullanıcı silinmiş veya bulunamıyor.' : 'This user has been deleted or cannot be found.'}
          </p>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
          
          {/* Main User Card Section */}
          <div className="bg-[#f2ede1] p-6 rounded-3xl border-b-8 border-[#800000] shadow-sm">
            <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
              
              {/* Avatar circle */}
              <div className="flex-shrink-0 relative">
                <img 
                  src={currentAvatar} 
                  className="w-28 h-28 md:w-36 md:h-36 rounded-full border-4 border-[#800000] object-cover bg-white p-1 shadow-inner" 
                  alt="avatar" 
                />
                {profile.admin && (
                  <span className="absolute bottom-1 right-1/2 translate-x-1/2 bg-red-600 text-white rounded-md px-2 py-0.5 text-[8px] font-black tracking-wide border-2 border-[#f2ede1]">
                    YÖNETİCİ
                  </span>
                )}
              </div>

              {/* Informative credentials */}
              <div className="flex-1 text-center md:text-left space-y-3 w-full">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                  <h1 className="text-2xl md:text-3xl font-black text-brand-dark max-w-xs truncate uppercase leading-none">
                    {profile.displayName || 'İsimsiz'}
                  </h1>
                  
                  {isOwnProfile ? (
                    <button 
                      onClick={() => setEditModalOpen(true)}
                      className="bg-[#1a1a1a] hover:bg-black text-[#ffd700] hover:scale-102 cursor-pointer font-black text-xs px-4 py-2 rounded-lg transition-transform flex items-center gap-1.5 uppercase"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      {currentLang === 'tr' ? 'HESAP KONSOLU' : 'ACCOUNT SETTINGS'}
                    </button>
                  ) : (
                    <button 
                      onClick={toggleFollow}
                      disabled={actionLoading}
                      className={`font-black text-xs px-5 py-2.5 rounded-xl cursor-pointer shadow transition-all duration-150 shrink-0 uppercase tracking-wider ${
                        isFollowing 
                          ? 'bg-gray-400 text-white hover:bg-gray-500' 
                          : 'bg-[#800000] text-[#ffd700] hover:bg-[#600000]'
                      }`}
                    >
                      {actionLoading ? '...' : isFollowing ? (currentLang === 'tr' ? 'Takibi Bırak' : 'Unfollow') : (currentLang === 'tr' ? 'Takip Et' : 'Takip Et')}
                    </button>
                  )}
                </div>

                {/* Profile Bio */}
                <p className="text-sm font-semibold text-gray-700 leading-relaxed max-w-md whitespace-pre-wrap word-break h-auto">
                  {profile.bio || (currentLang === 'tr' ? 'Henüz bir biyografi eklenmemiş.' : 'No biography added yet.')}
                </p>

                {/* Counter metrics (Clickable list loaders) */}
                <div className="flex items-center justify-center md:justify-start gap-6 pt-3 select-none">
                  <div className="text-center md:text-left">
                    <span className="block text-xl font-black text-brand-dark leading-none">{commentCount}</span>
                    <span className="text-[11px] font-bold text-gray-500 uppercase">{currentLang === 'tr' ? 'Aktivite' : 'Activities'}</span>
                  </div>
                  <div 
                    onClick={() => handleOpenFollowModal('followers')}
                    className="text-center md:text-left cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    <span className="block text-xl font-black text-brand-dark leading-none">{followersCount}</span>
                    <span className="text-[11px] font-bold text-gray-500 uppercase hover:underline">{currentLang === 'tr' ? 'Takipçi' : 'Followers'}</span>
                  </div>
                  <div 
                    onClick={() => handleOpenFollowModal('following')}
                    className="text-center md:text-left cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    <span className="block text-xl font-black text-brand-dark leading-none">{followingCount}</span>
                    <span className="text-[11px] font-bold text-gray-500 uppercase hover:underline">{currentLang === 'tr' ? 'Takip Edilen' : 'Following'}</span>
                  </div>
                </div>

                {/* Balance coin display */}
                <div className="bg-[#1a1a1a]/10 backdrop-blur-sm shadow-sm rounded-xl p-2.5 inline-flex items-center gap-2 mt-4 px-4">
                  <Coins className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-black text-brand-dark">
                    Cüzdan Bakiyesi: <strong className="text-[#800000]">{(profile.balance || 0).toLocaleString()} ฿</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Favori Seçim Paneli (Only if Owner and is dropdown choices filled) */}
          {isOwnProfile && (
            <div className="bg-[#fffdf5] border-2 border-dashed border-gray-400 p-6 rounded-3xl space-y-4 shadow-inner">
              <h3 className="text-sm font-black text-[#800000] uppercase tracking-wide flex items-center gap-1.5">
                🏆 {currentLang === 'tr' ? 'Favorilerini Seç' : 'Choose Your Favorites'}
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Tuttuğun Takım</label>
                  <select 
                    value={selectedFavTeam}
                    onChange={(e) => setSelectedFavTeam(e.target.value)}
                    className="bg-white border rounded-lg p-3 font-semibold text-xs focus:border-brand-maroon outline-none text-[#333]"
                  >
                    <option value="">{currentLang === 'tr' ? 'Tuttuğun Takım...' : 'Select Team...'}</option>
                    {teams.map(tOption => (
                      <option key={tOption.name} value={tOption.name}>{tOption.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Favori Oyuncun</label>
                  <select 
                    value={selectedFavPlayer}
                    onChange={(e) => setSelectedFavPlayer(e.target.value)}
                    className="bg-white border rounded-lg p-3 font-semibold text-xs focus:border-brand-maroon outline-none text-[#333]"
                  >
                    <option value="">{currentLang === 'tr' ? 'Favori Oyuncun...' : 'Select Player...'}</option>
                    {players.map(pOption => (
                      <option key={pOption.pname} value={pOption.pname}>{pOption.pname} ({pOption.pteam})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button 
                  onClick={handleSaveFavorites}
                  disabled={savingFavs}
                  className="bg-[#ffd700] hover:bg-amber-400 text-brand-dark px-6 py-2.5 rounded-xl font-black text-xs uppercase cursor-pointer border-b-2 border-black tracking-wide"
                >
                  {savingFavs ? '...' : (currentLang === 'tr' ? 'Favorileri Kaydet' : 'Save Favorites')}
                </button>
                {favSaveSuccess && (
                  <span className="text-green-600 font-extrabold text-xs animate-fade-in">
                    ✓ {currentLang === 'tr' ? 'Kaydedildi!' : 'Saved successfully!'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Show Favorites Showcase Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Club */}
            <div 
              onClick={() => profile.favTeam && onNavigate({ type: 'team-detail', teamName: profile.favTeam })}
              className={`bg-white p-4 rounded-2xl border-l-8 border-[#ffd700] flex items-center gap-4 shadow-sm ${profile.favTeam ? 'cursor-pointer hover:border-[#800000] hover:scale-[1.01] transition-all' : ''}`}
            >
              <img 
                src={favTeamLogo} 
                className="w-12 h-12 rounded-full object-cover border border-gray-200 bg-white" 
                alt="team"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://via.placeholder.com/50?text=?';
                }}
              />
              <div>
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
                  {currentLang === 'tr' ? 'TUTTUĞU TAKIM' : 'FAVORITE TEAM'}
                </div>
                <div className="font-black text-sm text-brand-dark mb-0.5">
                  {profile.favTeam || (currentLang === 'tr' ? 'Belirtilmedi' : 'Not Saved')}
                </div>
                {profile.favTeam && (
                  <span className="text-[9px] text-[#800000] font-bold uppercase flex items-center gap-0.5">
                    {currentLang === 'tr' ? 'Detayları Gör' : 'View Team Detail'} <ExternalLink className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
            </div>

            {/* Favorite Player */}
            <div 
              onClick={() => profile.favPlayer && onNavigate({ type: 'player-profile', playerName: profile.favPlayer })}
              className={`bg-white p-4 rounded-2xl border-l-8 border-[#ffd700] flex items-center gap-4 shadow-sm ${profile.favPlayer ? 'cursor-pointer hover:border-[#800000] hover:scale-[1.01] transition-all' : ''}`}
            >
              <img 
                src={favPlayerPhoto} 
                className="w-12 h-12 rounded-full object-cover border border-gray-200 bg-white" 
                alt="player"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://via.placeholder.com/50?text=?';
                }}
              />
              <div>
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
                  {currentLang === 'tr' ? 'FAVORİ OYUNCU' : 'FAVORITE PLAYER'}
                </div>
                <div className="font-black text-sm text-brand-dark mb-0.5">
                  {profile.favPlayer || (currentLang === 'tr' ? 'Belirtilmedi' : 'Not Saved')}
                </div>
                {profile.favPlayer && (
                  <span className="text-[9px] text-[#800000] font-bold uppercase flex items-center gap-0.5">
                    {currentLang === 'tr' ? 'Profilini İncele' : 'View Player Profile'} <ExternalLink className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
            </div>

          </div>

          {/* Activities Comment List */}
          <div className="space-y-4 pt-4 border-t-2 border-gray-300">
            <h2 className="text-base md:text-lg font-black text-brand-dark uppercase tracking-wide flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#800000]" />
              {currentLang === 'tr' ? 'Son Aktiviteler (Forum & Yorumlar)' : 'Recent Activities (Forum & Comments)'}
            </h2>

            {loadingActivities ? (
              <div className="flex justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-[#800000]" />
              </div>
            ) : activities.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center text-gray-400 font-bold text-xs shadow-inner">
                {currentLang === 'tr' ? 'Henüz hiçbir aktivitesi yok.' : 'No recent activity.'}
              </div>
            ) : (
              <div className="activity-feed space-y-3">
                {activities.map((act) => (
                  <div key={act.id} className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-[#800000] hover:scale-[1.005] transition-transform">
                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-500 mb-2 border-b border-gray-100 pb-1">
                      <span>📅 {act.date.toLocaleString(currentLang === 'tr' ? 'tr-TR' : 'en-US')}</span>
                      <span className="bg-[#ffd700] text-brand-dark px-2 py-0.5 rounded-full text-[9px] font-black uppercase">
                        {act.type}
                      </span>
                    </div>
                    <div 
                      className="text-xs text-[#333] font-medium leading-relaxed" 
                      dangerouslySetInnerHTML={{ __html: act.text }} 
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ================= ACCOUNT CONSOLE MODAL ================= */}
      {editModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#f2ede1] w-full max-w-sm rounded-3xl p-6 border-b-8 border-[#800000] relative animate-scale-up text-[#3d3d3d] shadow-2xl">
            <button 
              onClick={() => setEditModalOpen(false)}
              className="absolute top-4 right-4 text-xl font-black text-[#800000] cursor-pointer hover:scale-105"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black text-[#800000] text-center mb-6 uppercase">
              {currentLang === 'tr' ? 'Hesap Konsolu' : 'Account Console'}
            </h3>

            {/* Avatar Preview */}
            <div className="mb-4">
              <img 
                src={editAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(editName || 'U')}`} 
                className="w-20 h-20 rounded-full border-3 border-[#800000] mx-auto object-cover bg-white p-0.5 shadow" 
                alt="preview" 
              />
            </div>

            <div className="space-y-4 font-bold text-xs text-left">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">{currentLang === 'tr' ? 'Görünen Adın' : 'Display Name'}</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-white border rounded p-3 font-semibold text-xs block w-full focus:border-brand-maroon outline-none text-[#333]"
                  placeholder="Ad Soyad veya Takma Ad"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">{currentLang === 'tr' ? 'Profil Resmi URL' : 'Profile Picture URL'}</label>
                <input 
                  type="url" 
                  value={editAvatar}
                  onChange={(e) => setEditAvatar(e.target.value)}
                  className="bg-white border rounded p-3 font-semibold text-xs block w-full focus:border-brand-maroon outline-none text-[#333]"
                  placeholder="https://images.unsplash.com/..."
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">{currentLang === 'tr' ? 'Biyografin' : 'Biography'}</label>
                <textarea 
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value.slice(0, 150))}
                  rows={3}
                  className="bg-white border rounded p-3 font-semibold text-xs block w-full focus:border-brand-maroon outline-none text-[#333]"
                  placeholder={currentLang === 'tr' ? "Biyografin (Max 150 karakter)" : "Brief bio..."}
                />
                <span className="text-[9px] text-right text-gray-400 block mt-0.5">{editBio.length}/150</span>
              </div>

              <button 
                onClick={handleSaveAccountData}
                disabled={actionLoading}
                className="bg-[#800000] text-[#ffd700] py-3 w-full rounded-2xl font-black text-xs text-center hover:bg-[#600000] cursor-pointer shadow border-b-2 border-black block uppercase tracking-wide mt-4"
              >
                {actionLoading ? '...' : (currentLang === 'tr' ? 'Değişiklikleri Kaydet' : 'Save Modifications')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= FOLLOWERS / FOLLOWING MODAL ================= */}
      {followModalType && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#f2ede1] w-full max-w-sm rounded-[24px] p-6 border-b-8 border-[#800000] relative animate-scale-up text-[#3d3d3d] shadow-2xl">
            <button 
              onClick={() => {
                setFollowModalType(null);
                setFollowModalUsers([]);
              }}
              className="absolute top-4 right-4 text-xl font-black text-[#800000] cursor-pointer hover:scale-105"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-[#800000] text-center mb-4 uppercase">
              {followModalType === 'followers' 
                ? (currentLang === 'tr' ? 'TAKİPÇİLER' : 'FOLLOWERS') 
                : (currentLang === 'tr' ? 'TAKİP EDİLENLER' : 'FOLLOWING')}
            </h3>

            {loadingFollowList ? (
              <div className="flex justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-[#800000]" />
              </div>
            ) : followModalUsers.length === 0 ? (
              <div className="text-center text-gray-400 py-8 text-xs font-bold uppercase">
                {currentLang === 'tr' ? 'Liste Boş' : 'List is Empty'}
              </div>
            ) : (
              <div className="follow-list-container max-h-80 overflow-y-auto space-y-2.5 pr-1 no-scrollbar">
                {followModalUsers.map((uItem) => {
                  const av = uItem.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(uItem.displayName || 'U')}&background=800000&color=ffd700`;
                  return (
                    <div 
                      key={uItem.uid}
                      onClick={() => {
                        setFollowModalType(null);
                        setFollowModalUsers([]);
                        onNavigate({ type: 'user-profile', userId: uItem.uid });
                      }}
                      className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-gray-200 cursor-pointer hover:border-[#800000] hover:scale-[1.01] transition-all"
                    >
                      <img src={av} className="w-10 h-10 rounded-full object-cover border-2 border-[#800000]" alt="avatar" />
                      <span className="font-extrabold text-sm text-[#3d3d3d] uppercase tracking-wide">
                        {uItem.displayName}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
