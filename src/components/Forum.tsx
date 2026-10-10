import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc, 
  doc, 
  updateDoc, 
  deleteDoc, 
  arrayUnion, 
  arrayRemove 
} from 'firebase/firestore';
import { db } from '../firebase';
import { ForumPost, ForumReply, UserProfile } from '../types';
import UserHoverCard from './UserHoverCard';
import { 
  MoreVertical, 
  Trash2, 
  Reply, 
  Image as ImageIcon, 
  Heart, 
  X, 
  Coins, 
  ExternalLink,
  Sparkles
} from 'lucide-react';

interface ForumProps {
  currentUser: UserProfile | null;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
}

// Quick football photo & GIF presets
const PRESET_MEDIA = [
  { label: '⚽ Gol Sevinci', url: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=800&q=80' },
  { label: '🏆 Şampiyonluk', url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=800&q=80' },
  { label: '🔥 Taraftar Tribün', url: 'https://images.unsplash.com/photo-1518091043644-c1d4457512c6?auto=format&fit=crop&w=800&q=80' },
  { label: '⚡ Yeşil Saha', url: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=800&q=80' }
];

export default function Forum({ currentUser, onNavigate, teamLogos }: ForumProps) {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Live real-time users cache so any profile/name change reflects immediately everywhere
  const [usersCache, setUsersCache] = useState<Record<string, UserProfile>>({});
  const activeListeners = useRef<Record<string, () => void>>({});

  // 1. Listen to top forum posts
  useEffect(() => {
    const q = query(collection(db, 'forum'), orderBy('tarih', 'desc'), limit(30));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: ForumPost[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as ForumPost);
      });
      setPosts(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time profile listener for any UID in the forum
  const registerUserListener = (uid: string) => {
    if (!uid || activeListeners.current[uid]) return;

    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      if (snap.exists()) {
        const u = { uid: snap.id, ...snap.data() } as UserProfile;
        setUsersCache((prev) => ({ ...prev, [uid]: u }));
      }
    });

    activeListeners.current[uid] = unsub;
  };

  // Clean up user listeners on unmount
  useEffect(() => {
    return () => {
      Object.values(activeListeners.current).forEach((unsub) => {
        if (typeof unsub === 'function') {
          (unsub as () => void)();
        }
      });
      activeListeners.current = {};
    };
  }, []);

  // Whenever posts change, register all post authors
  useEffect(() => {
    posts.forEach((p) => {
      if (p.uid) registerUserListener(p.uid);
    });
  }, [posts]);

  // Create new forum post
  const handleCreatePost = async () => {
    if (!currentUser) return;
    if (!newTitle.trim() || !newBody.trim()) {
      setErrorMsg('Lütfen başlık ve açıklama alanlarını doldurun.');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'forum'), {
        uid: currentUser.uid,
        ad: currentUser.displayName || 'Kullanıcı',
        avatar: currentUser.avatar || '',
        admin: currentUser.admin || false,
        dogru: true,
        baslik: newTitle.trim(),
        icerik: newBody.trim(),
        mediaUrl: newMediaUrl.trim() || '',
        tarih: new Date(),
        likes: [],
        favTeam: currentUser.favTeam || ''
      });
      setNewTitle('');
      setNewBody('');
      setNewMediaUrl('');
      setShowMediaInput(false);
      setModalOpen(false);
    } catch (e) {
      console.error(e);
      setErrorMsg('Gönderi eklenirken hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  // Like or unlike forum post
  const handleLikePost = async (pid: string, likes: string[]) => {
    if (!currentUser) {
      alert('Gönderiyi beğenmek için giriş yapmalısınız!');
      return;
    }
    const ref = doc(db, 'forum', pid);
    const hasLiked = likes?.includes(currentUser.uid);
    try {
      await updateDoc(ref, {
        likes: hasLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid)
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Delete forum post
  const handleDeletePost = async (postId: string) => {
    if (!confirm('Bu forum konusunu silmek istediğinize emin misiniz?')) return;
    try {
      await deleteDoc(doc(db, 'forum', postId));
    } catch (err) {
      console.error(err);
      alert('Gönderi silinirken hata oluştu.');
    }
  };

  const handleOpenModal = () => {
    if (!currentUser) {
      alert('Gönderi paylaşmak için lütfen giriş yapın!');
      return;
    }
    setErrorMsg('');
    setModalOpen(true);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-2">
      <div className="flex justify-between items-center pr-2">
        <div>
          <h2 className="text-2xl font-black text-brand-maroon tracking-tight flex items-center gap-2">
            <span>💬</span>
            <span>Bobble Lig Forumu</span>
          </h2>
          <p className="text-xs font-semibold text-gray-500 mt-0.5">
            Tartışmalara katılın, foto/gif ekleyin ve futbolseverlerle sohbet edin!
          </p>
        </div>
        <button 
          onClick={handleOpenModal}
          className="bg-brand-maroon text-[#ffd700] hover:bg-[#600000] py-2.5 px-5 rounded-2xl font-black text-xs cursor-pointer shadow-md hover:scale-105 active:scale-95 transition-all uppercase border-b-2 border-black flex items-center gap-1.5"
        >
          <span>+</span>
          <span>Yeni Gönderi</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="w-10 h-10 border-4 border-brand-maroon border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <h3 className="text-gray-500 font-bold text-sm">Forum Yükleniyor...</h3>
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-[#f2ede1] p-10 rounded-3xl text-center border-b-4 border-brand-maroon space-y-3">
          <span className="text-4xl block">⚽</span>
          <h3 className="text-gray-600 font-black text-base">Henüz forumda tartışma paylaşılmamış.</h3>
          <p className="text-xs text-gray-500 font-semibold">İlk gönderiyi oluşturarak tartışmayı siz başlatın!</p>
          <button 
            onClick={handleOpenModal}
            className="mt-2 bg-brand-maroon text-[#ffd700] py-2 px-5 rounded-xl text-xs font-black uppercase cursor-pointer"
          >
            İlk Konuyu Aç
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {posts.map((post) => (
            <SingleForumPost 
              key={post.id}
              post={post}
              currentUser={currentUser}
              usersCache={usersCache}
              registerUserListener={registerUserListener}
              onLike={() => handleLikePost(post.id, post.likes || [])}
              onDelete={() => handleDeletePost(post.id)}
              onNavigate={onNavigate}
              teamLogos={teamLogos}
            />
          ))}
        </div>
      )}

      {/* NEW POST MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#f2ede1] w-full max-w-lg rounded-3xl p-6 border-b-8 border-brand-maroon relative animate-scale-up text-brand-dark shadow-2xl">
            <button 
              onClick={() => setModalOpen(false)} 
              className="absolute top-4 right-4 text-xl font-black text-brand-maroon cursor-pointer hover:scale-110"
            >
              ✕
            </button>
            <h3 className="text-xl font-black text-brand-maroon text-center mb-4 uppercase">
              Yeni Forum Gönderisi
            </h3>

            {errorMsg && (
              <p className="text-xs text-red-600 font-bold text-center mb-3 bg-red-100 p-2 rounded-xl">
                {errorMsg}
              </p>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 block mb-1">Konu Başlığı</label>
                <input 
                  type="text" 
                  placeholder="Örn: Bu haftaki derbide kim kazanır?"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-brand-maroon"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 block mb-1">Açıklama / Mesaj</label>
                <textarea 
                  placeholder="Düşüncelerini ve maç analizini buraya yaz..."
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  rows={4}
                  className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm font-semibold outline-none focus:border-brand-maroon resize-none"
                />
              </div>

              {/* Media Attachment Button & Section */}
              <div className="bg-white p-3 rounded-2xl border border-gray-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-brand-maroon flex items-center gap-1.5 uppercase">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
                    <span>Ek Ekle (Fotoğraf veya GIF)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowMediaInput(!showMediaInput)}
                    className="text-[10px] font-bold text-amber-700 hover:underline cursor-pointer"
                  >
                    {showMediaInput ? 'Gizle' : '+ Link Ekle'}
                  </button>
                </div>

                {showMediaInput && (
                  <div className="space-y-2 pt-1 animate-fade-in">
                    <input 
                      type="url"
                      placeholder="https://... Fotoğraf veya GIF Linki yapıştırın"
                      value={newMediaUrl}
                      onChange={(e) => setNewMediaUrl(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2 text-xs font-semibold outline-none focus:border-brand-maroon"
                    />

                    {/* Presets */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[9px] text-gray-400 font-bold">Hızlı Seçim:</span>
                      {PRESET_MEDIA.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setNewMediaUrl(preset.url)}
                          className="text-[9px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md cursor-pointer transition-colors"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Media Preview */}
                {newMediaUrl && (
                  <div className="relative rounded-xl overflow-hidden border border-gray-200 max-h-48 mt-2">
                    <img 
                      src={newMediaUrl} 
                      alt="preview" 
                      className="w-full max-h-48 object-cover rounded-xl"
                      onError={() => {}}
                    />
                    <button
                      type="button"
                      onClick={() => setNewMediaUrl('')}
                      className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 text-xs hover:bg-red-700 cursor-pointer shadow"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <button 
                onClick={handleCreatePost}
                disabled={submitting}
                className="bg-brand-maroon text-[#ffd700] py-3.5 w-full rounded-2xl font-black text-sm uppercase hover:bg-[#600000] cursor-pointer disabled:opacity-50 shadow-md transition-transform hover:scale-102 mt-2"
              >
                {submitting ? 'Paylaşılıyor...' : '🚀 Gönderiyi Paylaş'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



// ──────────────────────────────────────────────────────────────
// SINGLE FORUM POST COMPONENT
// ──────────────────────────────────────────────────────────────

interface SingleForumPostProps {
  key?: React.Key;
  post: ForumPost;
  currentUser: UserProfile | null;
  usersCache: Record<string, UserProfile>;
  registerUserListener: (uid: string) => void;
  onLike: () => void;
  onDelete: () => void;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
}

function SingleForumPost({
  post,
  currentUser,
  usersCache,
  registerUserListener,
  onLike,
  onDelete,
  onNavigate,
  teamLogos
}: SingleForumPostProps) {
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyMediaUrl, setReplyMediaUrl] = useState('');
  const [showReplyMedia, setShowReplyMedia] = useState(false);
  const [postMenuOpen, setPostMenuOpen] = useState(false);
  
  // Replying to a specific comment
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string; uid: string } | null>(null);

  // Active user live details for author of the post
  const authorProfile = usersCache[post.uid];
  const authorName = authorProfile?.displayName || post.ad || 'Kullanıcı';
  const authorAvatar = authorProfile?.avatar || post.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=800000&color=ffd700&size=40`;

  // Fetch replies in real-time
  useEffect(() => {
    const q = query(collection(db, 'forum', post.id, 'yanitlar'), orderBy('tarih', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: ForumReply[] = [];
      snap.forEach((d) => {
        const item = { id: d.id, ...d.data() } as ForumReply;
        list.push(item);
        if (item.uid) registerUserListener(item.uid);
      });
      setReplies(list);
    });
    return () => unsubscribe();
  }, [post.id, registerUserListener]);

  // Post a reply
  const handlePostReply = async () => {
    if (!currentUser || (!replyText.trim() && !replyMediaUrl.trim())) return;
    try {
      await addDoc(collection(db, 'forum', post.id, 'yanitlar'), {
        uid: currentUser.uid,
        ad: currentUser.displayName || 'Kullanıcı',
        avatar: currentUser.avatar || '',
        admin: currentUser.admin || false,
        yorum: replyText.trim(),
        mediaUrl: replyMediaUrl.trim() || '',
        replyToId: replyingTo ? replyingTo.id : null,
        replyToName: replyingTo ? replyingTo.name : null,
        tarih: new Date(),
        likes: []
      });
      setReplyText('');
      setReplyMediaUrl('');
      setShowReplyMedia(false);
      setReplyingTo(null);
    } catch (e) {
      console.error(e);
      alert('Yorum gönderilirken hata oluştu.');
    }
  };

  // Like a reply
  const handleLikeReply = async (rid: string, rlikes: string[]) => {
    if (!currentUser) {
      alert('Yorumu beğenmek için lütfen giriş yapın!');
      return;
    }
    const ref = doc(db, 'forum', post.id, 'yanitlar', rid);
    const hasLiked = rlikes?.includes(currentUser.uid);
    try {
      await updateDoc(ref, {
        likes: hasLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid)
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Delete a reply
  const handleDeleteReply = async (rid: string) => {
    if (!confirm('Bu yorumu silmek istediğinize emin misiniz?')) return;
    try {
      await deleteDoc(doc(db, 'forum', post.id, 'yanitlar', rid));
    } catch (e) {
      console.error(e);
      alert('Yorum silinirken hata oluştu.');
    }
  };

  const isLiked = currentUser ? post.likes?.includes(currentUser.uid) : false;
  const canDeletePost = currentUser && (currentUser.uid === post.uid || currentUser.admin);

  return (
    <div className="bg-[#f2ede1] rounded-3xl p-5 border-b-6 border-brand-maroon shadow-md flex items-start gap-4 relative">
      <div className="flex-1 min-w-0">
        
        {/* Post Header with User Details & Three Dots Menu */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <UserHoverCard
              uid={post.uid}
              userProfile={authorProfile}
              fallbackName={authorName}
              fallbackAvatar={authorAvatar}
              teamLogos={teamLogos}
              onNavigate={onNavigate}
            >
              <img 
                src={authorAvatar} 
                onClick={() => onNavigate({ type: 'user-profile', userId: post.uid })}
                className="w-11 h-11 rounded-full border-2 border-brand-maroon object-cover shrink-0 cursor-pointer bg-white shadow-sm hover:scale-105 transition-transform" 
                alt="avatar" 
              />
            </UserHoverCard>

            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <UserHoverCard
                  uid={post.uid}
                  userProfile={authorProfile}
                  fallbackName={authorName}
                  fallbackAvatar={authorAvatar}
                  teamLogos={teamLogos}
                  onNavigate={onNavigate}
                >
                  <span 
                    onClick={() => onNavigate({ type: 'user-profile', userId: post.uid })}
                    className="text-xs font-black text-brand-maroon hover:underline cursor-pointer"
                  >
                    {authorName}
                  </span>
                </UserHoverCard>

                {authorProfile?.admin && (
                  <span className="bg-red-600 text-white rounded-full w-3.5 h-3.5 inline-flex items-center justify-center text-[9px] font-bold cursor-default" title="Yönetici">
                    ✓
                  </span>
                )}

                {authorProfile?.favTeam && teamLogos[authorProfile.favTeam] && (
                  <img 
                    onClick={() => onNavigate({ type: 'team-detail', teamName: authorProfile.favTeam })}
                    src={teamLogos[authorProfile.favTeam]} 
                    title={authorProfile.favTeam} 
                    className="w-4 h-4 rounded-full border border-gray-200 object-cover cursor-pointer bg-white"
                    alt="fav-team" 
                  />
                )}
              </div>
              <span className="text-[10px] font-semibold text-gray-500">
                📅 {post.tarih ? new Date(post.tarih.seconds ? post.tarih.seconds * 1000 : post.tarih).toLocaleString('tr-TR') : ''}
              </span>
            </div>
          </div>

          {/* Three dots menu for post */}
          <div className="relative">
            <button 
              onClick={() => setPostMenuOpen(!postMenuOpen)}
              className="p-1.5 rounded-full hover:bg-black/5 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
              title="Seçenekler"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {postMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-200 py-1 z-30 min-w-[130px] animate-fade-in">
                {canDeletePost ? (
                  <button
                    onClick={() => {
                      setPostMenuOpen(false);
                      onDelete();
                    }}
                    className="flex items-center gap-2 text-xs font-bold text-red-600 hover:bg-red-50 px-3 py-2 w-full text-left cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Gönderiyi Sil</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-gray-400 px-3 py-2 block">Yetkiniz yok</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Post Title & Content */}
        <h3 className="text-base font-black text-brand-dark mb-1.5">{post.baslik}</h3>
        <p className="text-xs font-semibold text-gray-800 leading-relaxed whitespace-pre-wrap">{post.icerik}</p>

        {/* Media Attachment (Photo or GIF) */}
        {post.mediaUrl && (
          <div className="mt-3 rounded-2xl overflow-hidden border-2 border-brand-maroon/20 max-h-80 shadow-inner bg-black/5">
            <img 
              src={post.mediaUrl} 
              alt="attachment" 
              className="w-full max-h-80 object-cover rounded-xl hover:scale-101 transition-transform" 
              onError={(e) => {
                // hide broken images
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Post Footer Actions */}
        <div className="flex gap-4 items-center mt-4 pt-2 border-t border-gray-200/50">
          <button 
            onClick={() => setShowReplyBox(!showReplyBox)}
            className="text-[11px] font-black text-brand-maroon hover:underline cursor-pointer flex items-center gap-1.5 bg-brand-gold/20 px-3 py-1 rounded-full border border-brand-gold/40"
          >
            <span>💬</span>
            <span>Yanıtlar ({replies.length})</span>
          </button>
        </div>

        {/* Inline reply composer */}
        {showReplyBox && (
          <div className="mt-3 border-t border-dashed border-gray-300 pt-3 space-y-2">
            
            {/* Replying-to badge if targeting another comment */}
            {replyingTo && (
              <div className="flex items-center justify-between bg-amber-100 text-brand-maroon px-3 py-1 rounded-xl text-[10px] font-black border border-amber-300">
                <span className="flex items-center gap-1">
                  <Reply className="w-3 h-3" />
                  <span>@{replyingTo.name} kullanıcısına yanıt veriyorsunuz</span>
                </span>
                <button 
                  onClick={() => setReplyingTo(null)}
                  className="text-red-600 hover:scale-110 font-bold ml-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="flex gap-2 items-center">
              <input 
                type="text" 
                placeholder={replyingTo ? `@${replyingTo.name} yanıt yaz...` : 'Tartışmaya katıl, yorum yaz...'} 
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="flex-1 bg-white border border-gray-300 rounded-xl py-2 px-3 text-xs font-semibold outline-none focus:border-brand-maroon"
                onKeyDown={(e) => e.key === 'Enter' && handlePostReply()}
              />

              <button 
                type="button"
                onClick={() => setShowReplyMedia(!showReplyMedia)}
                className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                  replyMediaUrl 
                    ? 'bg-amber-100 border-amber-400 text-amber-900' 
                    : 'bg-white border-gray-300 text-gray-500 hover:text-brand-maroon'
                }`}
                title="Fotoğraf / GIF Ekle"
              >
                <ImageIcon className="w-4 h-4" />
              </button>

              <button 
                onClick={handlePostReply}
                className="bg-brand-maroon text-[#ffd700] py-2 px-4 rounded-xl font-black text-xs hover:bg-[#600000] cursor-pointer shadow uppercase"
              >
                Gönder
              </button>
            </div>

            {/* Media Attachment section for replies */}
            {showReplyMedia && (
              <div className="bg-white p-2.5 rounded-xl border border-gray-200 space-y-1.5 animate-fade-in text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-gray-500 uppercase">Yoruma Fotoğraf veya GIF Ekle</span>
                  <button 
                    onClick={() => setShowReplyMedia(false)} 
                    className="text-[10px] text-gray-400 font-bold cursor-pointer"
                  >
                    Kapat
                  </button>
                </div>
                <input 
                  type="url"
                  placeholder="https://... Fotoğraf veya GIF Linki"
                  value={replyMediaUrl}
                  onChange={(e) => setReplyMediaUrl(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2 text-xs font-semibold outline-none focus:border-brand-maroon"
                />

                {/* Quick Presets for reply */}
                <div className="flex flex-wrap gap-1">
                  {PRESET_MEDIA.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setReplyMediaUrl(preset.url)}
                      className="text-[9px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {replyMediaUrl && (
                  <div className="relative max-h-32 rounded-lg overflow-hidden border border-gray-200 mt-1">
                    <img src={replyMediaUrl} alt="preview" className="w-full max-h-32 object-cover rounded-lg" />
                    <button 
                      onClick={() => setReplyMediaUrl('')}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 text-xs cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Forum replies listings */}
        {replies.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200/60 space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {replies.map((reply) => (
              <SingleReplyItem 
                key={reply.id}
                reply={reply}
                currentUser={currentUser}
                usersCache={usersCache}
                teamLogos={teamLogos}
                onNavigate={onNavigate}
                onLike={() => handleLikeReply(reply.id, reply.likes || [])}
                onDelete={() => handleDeleteReply(reply.id)}
                onReply={() => {
                  const rAuthor = usersCache[reply.uid];
                  const rName = rAuthor?.displayName || reply.ad || 'Kullanıcı';
                  setReplyingTo({ id: reply.id, name: rName, uid: reply.uid });
                  setShowReplyBox(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Big Like button on the right */}
      <div 
        onClick={onLike}
        className="shrink-0 text-center select-none cursor-pointer bg-white border-2 border-brand-maroon/20 p-3 rounded-2xl min-w-[55px] shadow-sm hover:scale-105 active:scale-95 transition-transform"
        title="Beğen"
      >
        <span className="text-2xl block leading-none">{isLiked ? '❤️' : '🤍'}</span>
        <span className={`text-xs font-black block mt-2 ${isLiked ? 'text-red-500' : 'text-gray-400'}`}>
          {post.likes?.length || 0}
        </span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// SINGLE REPLY ITEM COMPONENT (WITH THREE DOTS SIL & HOVER POPUP)
// ──────────────────────────────────────────────────────────────

interface SingleReplyItemProps {
  key?: React.Key;
  reply: ForumReply;
  currentUser: UserProfile | null;
  usersCache: Record<string, UserProfile>;
  teamLogos: Record<string, string>;
  onNavigate: (view: any) => void;
  onLike: () => void;
  onDelete: () => void;
  onReply: () => void;
}

function SingleReplyItem({
  reply,
  currentUser,
  usersCache,
  teamLogos,
  onNavigate,
  onLike,
  onDelete,
  onReply
}: SingleReplyItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Live user profile data for reply author
  const authorProfile = usersCache[reply.uid];
  const authorName = authorProfile?.displayName || reply.ad || 'Kullanıcı';
  const authorAvatar = authorProfile?.avatar || reply.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=800000&color=ffd700&size=30`;
  const isLiked = currentUser ? reply.likes?.includes(currentUser.uid) : false;
  const canDelete = currentUser && (currentUser.uid === reply.uid || currentUser.admin);

  return (
    <div className="flex justify-between items-start gap-3 p-3 rounded-2xl border border-gray-200/80 bg-white/80 shadow-xs hover:bg-white transition-colors relative">
      <div className="flex gap-2.5 items-start flex-1 min-w-0">
        
        {/* Three dots menu on the left / options */}
        <div className="relative shrink-0 pt-0.5">
          <button 
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 rounded-full text-gray-300 hover:text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors"
            title="Seçenekler"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {menuOpen && (
            <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-200 py-1 z-30 min-w-[120px] animate-fade-in">
              {canDelete ? (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:bg-red-50 px-2.5 py-1.5 w-full text-left cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Yorumu Sil</span>
                </button>
              ) : (
                <span className="text-[10px] text-gray-400 px-2.5 py-1.5 block">Silme yetkiniz yok</span>
              )}
            </div>
          )}
        </div>

        {/* Author Avatar with Discord Hover Popover */}
        <UserHoverCard
          uid={reply.uid}
          userProfile={authorProfile}
          fallbackName={authorName}
          fallbackAvatar={authorAvatar}
          teamLogos={teamLogos}
          onNavigate={onNavigate}
        >
          <img 
            src={authorAvatar} 
            onClick={() => onNavigate({ type: 'user-profile', userId: reply.uid })}
            className="w-8 h-8 rounded-full object-cover shrink-0 border border-brand-maroon cursor-pointer bg-white shadow-xs" 
            alt="reply-av" 
          />
        </UserHoverCard>

        {/* Comment Content */}
        <div className="text-xs flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <UserHoverCard
              uid={reply.uid}
              userProfile={authorProfile}
              fallbackName={authorName}
              fallbackAvatar={authorAvatar}
              teamLogos={teamLogos}
              onNavigate={onNavigate}
            >
              <span 
                onClick={() => onNavigate({ type: 'user-profile', userId: reply.uid })}
                className="font-black text-brand-maroon hover:underline cursor-pointer"
              >
                {authorName}
              </span>
            </UserHoverCard>

            {authorProfile?.admin && (
              <span className="bg-red-600 text-white rounded-full w-3.5 h-3.5 inline-flex items-center justify-center text-[9px] font-bold cursor-default" title="Yönetici">
                ✓
              </span>
            )}

            {authorProfile?.favTeam && teamLogos[authorProfile.favTeam] && (
              <img 
                src={teamLogos[authorProfile.favTeam]} 
                title={authorProfile.favTeam} 
                className="w-3.5 h-3.5 rounded-full border border-gray-200 object-cover" 
                alt="fav"
              />
            )}
          </div>

          {/* If this reply is targeted to another user */}
          {reply.replyToName && (
            <div className="inline-flex items-center gap-1 bg-amber-100 text-brand-maroon px-2 py-0.5 rounded-md text-[9px] font-bold my-0.5">
              <Reply className="w-2.5 h-2.5" />
              <span>@{reply.replyToName} yanıtı</span>
            </div>
          )}

          {/* Comment text */}
          {reply.yorum && (
            <p className="text-gray-800 font-semibold mt-0.5 leading-snug whitespace-pre-wrap">
              {reply.yorum}
            </p>
          )}

          {/* Attached Media (Photo or GIF) */}
          {reply.mediaUrl && (
            <div className="mt-1.5 rounded-xl overflow-hidden max-h-48 border border-gray-200 inline-block bg-black/5">
              <img 
                src={reply.mediaUrl} 
                alt="comment media" 
                className="max-h-48 object-cover rounded-xl"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Action to reply to this comment */}
          <div className="mt-1.5 flex items-center gap-3">
            <button
              onClick={onReply}
              className="text-[10px] font-bold text-gray-500 hover:text-brand-maroon flex items-center gap-1 cursor-pointer"
            >
              <Reply className="w-3 h-3" />
              <span>Yanıtla</span>
            </button>
          </div>
        </div>
      </div>

      {/* Heart Like button for reply */}
      <button 
        onClick={onLike}
        className="shrink-0 text-center flex flex-col items-center hover:scale-115 active:scale-95 transition-transform cursor-pointer p-1"
        title="Beğen"
      >
        <span className="text-sm leading-none">{isLiked ? '❤️' : '🤍'}</span>
        <span className={`text-[9px] font-black mt-0.5 ${isLiked ? 'text-red-500' : 'text-gray-400'}`}>
          {reply.likes?.length || 0}
        </span>
      </button>
    </div>
  );
}
