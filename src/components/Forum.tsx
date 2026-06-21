import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, addDoc, doc, updateDoc, getDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { ForumPost, UserProfile } from '../types';

interface ForumProps {
  currentUser: UserProfile | null;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
}

export default function Forum({ currentUser, onNavigate, teamLogos }: ForumProps) {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [usersCache, setUsersCache] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    const q = query(collection(db, 'forum'), orderBy('tarih', 'desc'), limit(20));
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

  const fetchUserProfile = async (uid: string) => {
    if (usersCache[uid]) return usersCache[uid];
    try {
      const docRef = doc(db, 'users', uid);
      const res = await getDoc(docRef);
      if (res.exists()) {
        const u = { uid, ...res.data() } as UserProfile;
        setUsersCache((prev) => ({ ...prev, [uid]: u }));
        return u;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const handleCreatePost = async () => {
    if (!currentUser) return;
    if (!newTitle.trim() || !newBody.trim()) {
      setErrorMsg('Tüm alanları doldurmanız gerekmektedir.');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'forum'), {
        uid: currentUser.uid,
        ad: currentUser.displayName || 'Kullanıcı',
        avatar: currentUser.avatar || '',
        admin: currentUser.admin || false,
        dogru: true, // verified check default
        baslik: newTitle.trim(),
        icerik: newBody.trim(),
        tarih: new Date(),
        likes: [],
        favTeam: currentUser.favTeam || ''
      });
      setNewTitle('');
      setNewBody('');
      setModalOpen(false);
    } catch (e) {
      console.error(e);
      setErrorMsg('Gönderi eklenemedi.');
    } finally {
      setSubmitting(false);
    }
  };

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

  const handleOpenModal = () => {
    if (!currentUser) {
      alert('Gönderi paylaşmak için giriş yapmalısınız!');
      return;
    }
    setErrorMsg('');
    setModalOpen(true);
  };

  const renderBadge = (profile: any) => {
    if (profile?.admin) {
      return <span className="bg-red-600 text-white rounded-full w-3.5 h-3.5 inline-flex items-center justify-center text-[9px] ml-1 font-bold cursor-default" title="Admin">✓</span>;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pr-2">
        <h2 className="text-xl font-black text-brand-maroon">💬 Bobble Forum</h2>
        <button 
          onClick={handleOpenModal}
          className="bg-brand-maroon text-brand-gold py-2.5 px-5 rounded-xl font-black text-xs hover:bg-[#600000] cursor-pointer shadow border-b-2 border-black uppercase"
        >
          + Yeni Gönderi
        </button>
      </div>

      {loading ? (
        <h3 className="text-center text-gray-400 font-bold">Yükleniyor...</h3>
      ) : posts.length === 0 ? (
        <h3 className="text-center text-gray-400 font-bold p-6">Henüz forumda tartışma paylaşılmamış.</h3>
      ) : (
        <div className="space-y-4 max-w-3xl mx-auto select-text">
          {posts.map((post) => (
            <SingleForumPost 
              key={post.id}
              post={post}
              currentUser={currentUser}
              onLike={() => handleLikePost(post.id, post.likes || [])}
              onNavigate={onNavigate}
              fetchUserProfile={fetchUserProfile}
              renderBadge={renderBadge}
              teamLogos={teamLogos}
            />
          ))}
        </div>
      )}

      {/* NEW POST MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#f2ede1] w-full max-w-md rounded-2xl p-6 border-b-6 border-brand-maroon relative animate-scale-up">
            <button onClick={() => setModalOpen(false)} className="absolute top-4 right-4 text-xl font-black text-brand-maroon cursor-pointer">✕</button>
            <h3 className="text-lg font-black text-brand-maroon text-center mb-4">Yeni Gönderi</h3>

            {errorMsg && <p className="text-xs text-red-500 font-bold text-center mb-3">{errorMsg}</p>}

            <input 
              type="text" 
              placeholder="Konu Başlığı"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg p-3 text-sm font-bold block mb-3 outline-none focus:border-brand-maroon"
            />

            <textarea 
              placeholder="Açıklama, Ne düşünüyorsun?"
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              rows={4}
              className="w-full bg-white border border-gray-300 rounded-lg p-3 text-sm font-semibold block mb-4 outline-none focus:border-brand-maroon resize-none"
            />

            <button 
              onClick={handleCreatePost}
              disabled={submitting}
              className="bg-brand-maroon text-brand-gold py-3 w-full rounded-xl font-black text-sm uppercase hover:bg-[#600000] cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Gönderiliyor...' : 'Paylaş'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SUB-COMPONENT FOR EACH FORUM POST ──

interface SingleForumPostProps {
  key?: string;
  post: ForumPost;
  currentUser: UserProfile | null;
  onLike: () => void;
  onNavigate: (view: any) => void;
  fetchUserProfile: (uid: string) => Promise<UserProfile | null>;
  renderBadge: (profile: any) => React.ReactNode;
  teamLogos: Record<string, string>;
}

function SingleForumPost({ post, currentUser, onLike, onNavigate, fetchUserProfile, renderBadge, teamLogos }: SingleForumPostProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    fetchUserProfile(post.uid).then((res) => {
      setProfile(res);
    });

    const q = query(collection(db, 'forum', post.id, 'yanitlar'), orderBy('tarih', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setReplies(list);
    });
    return () => unsubscribe();
  }, [post.uid, post.id, fetchUserProfile]);

  const handlePostReply = async () => {
    if (!currentUser || !replyText.trim()) return;
    try {
      await addDoc(collection(db, 'forum', post.id, 'yanitlar'), {
        uid: currentUser.uid,
        ad: currentUser.displayName || 'Kullanıcı',
        avatar: currentUser.avatar || '',
        admin: currentUser.admin || false,
        yorum: replyText.trim(),
        tarih: new Date(),
        likes: []
      });
      setReplyText('');
      setShowReplyBox(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLikeReply = async (rid: string, rlikes: string[]) => {
    if (!currentUser) return;
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

  const avatar = profile?.avatar || post.avatar || `https://ui-avatars.com/api/?name=${post.ad}&background=800000&color=ffd700&size=40`;
  const isLiked = currentUser ? post.likes?.includes(currentUser.uid) : false;

  return (
    <div className="bg-brand-card rounded-2xl p-5 border-b-4 border-brand-maroon shadow-sm flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <img 
            src={avatar} 
            onClick={() => onNavigate({ type: 'user-profile', userId: post.uid })}
            className="w-10 h-10 rounded-full border-2 border-brand-maroon object-cover shrink-0 cursor-pointer bg-white" 
            alt="av" 
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span 
                onClick={() => onNavigate({ type: 'user-profile', userId: post.uid })}
                className="text-xs font-black text-brand-maroon hover:underline cursor-pointer"
              >
                {profile?.displayName || post.ad}
              </span>
              {renderBadge(profile || post)}
              {profile?.favTeam && teamLogos[profile.favTeam] && (
                <img 
                  onClick={() => onNavigate({ type: 'team-detail', teamName: profile?.favTeam })}
                  src={teamLogos[profile.favTeam]} 
                  title={profile.favTeam} 
                  className="w-4 h-4 rounded-full border border-gray-150 object-cover cursor-pointer bg-white"
                  alt="fav-team" 
                />
              )}
            </div>
            <span className="text-[10px] font-semibold text-gray-500">
              📅 {post.tarih ? new Date(post.tarih.seconds ? post.tarih.seconds * 1000 : post.tarih).toLocaleString('tr-TR') : ''}
            </span>
          </div>
        </div>

        <h3 className="text-base font-black text-brand-dark mb-1.5">{post.baslik}</h3>
        <p className="text-xs font-semibold text-gray-700 leading-relaxed whitespace-pre-wrap">{post.icerik}</p>

        <div className="flex gap-4 items-center mt-4">
          <button 
            onClick={() => setShowReplyBox(!showReplyBox)}
            className="text-[11px] font-black text-gray-400 hover:text-brand-maroon underline cursor-pointer"
          >
            💬 Yanıtla ({replies.length})
          </button>
        </div>

        {/* Inline reply composer */}
        {showReplyBox && (
          <div className="flex gap-2 items-center mt-3 border-t border-dashed border-gray-200 pt-3">
            <input 
              type="text" 
              placeholder="Tartışmaya katıl..." 
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="flex-1 bg-white border border-gray-300 rounded-lg py-2 px-3 text-xs font-semibold outline-none focus:border-brand-maroon"
              onKeyDown={(e) => e.key === 'Enter' && handlePostReply()}
            />
            <button 
              onClick={handlePostReply}
              className="bg-brand-maroon text-brand-gold py-1.5 px-4 rounded-lg font-black text-[10px]"
            >
              Gönder
            </button>
          </div>
        )}

        {/* Forum replies listings */}
        {replies.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200/50 space-y-2 max-h-56 overflow-y-auto">
            {replies.map((reply) => {
              const rLiked = currentUser ? reply.likes?.includes(currentUser.uid) : false;
              const rAvatar = reply.avatar || `https://ui-avatars.com/api/?name=${reply.ad}&background=800000&color=ffd700&size=28`;
              return (
                <div key={reply.id} className="flex justify-between items-start gap-4 p-2.5 rounded-xl border border-gray-150 bg-gray-50/50">
                  <div className="flex gap-2.5 items-start">
                    <img 
                      src={rAvatar} 
                      onClick={() => onNavigate({ type: 'user-profile', userId: reply.uid })}
                      className="w-7 h-7 rounded-full object-cover shrink-0 border border-brand-maroon cursor-pointer bg-white" 
                      alt="r-av" 
                    />
                    <div className="text-xs">
                      <div className="flex items-center gap-1">
                        <span 
                          onClick={() => onNavigate({ type: 'user-profile', userId: reply.uid })}
                          className="font-black text-brand-maroon hover:underline cursor-pointer"
                        >
                          {reply.ad}
                        </span>
                        {renderBadge(reply)}
                      </div>
                      <p className="text-gray-700 font-semibold mt-1 leading-snug">{reply.yorum}</p>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleLikeReply(reply.id, reply.likes || [])}
                    className="shrink-0 text-center flex flex-col items-center hover:scale-110 cursor-pointer"
                  >
                    <span className="text-xs">{rLiked ? '❤️' : '🤍'}</span>
                    <span className="text-[9px] font-black text-gray-400 mt-0.5">{reply.likes?.length || 0}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Big Like button display */}
      <div 
        onClick={onLike}
        className="shrink-0 text-center select-none cursor-pointer bg-white border border-gray-200/60 p-3 rounded-2xl min-w-[55px] shadow-sm hover:scale-105 active:scale-95 transition-transform"
      >
        <span className="text-2xl block leading-none">{isLiked ? '❤️' : '🤍'}</span>
        <span className={`text-xs font-black block mt-2 ${isLiked ? 'text-red-500' : 'text-gray-400'}`}>
          {post.likes?.length || 0}
        </span>
      </div>
    </div>
  );
}
