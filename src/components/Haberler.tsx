import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, addDoc, doc, updateDoc, getDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { News, NewsComment, UserProfile } from '../types';

interface HaberlerProps {
  currentUser: UserProfile | null;
  currentLang: 'tr' | 'en' | 'pt';
  translations: any;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
}

export default function Haberler({ currentUser, currentLang, translations, onNavigate, teamLogos }: HaberlerProps) {
  const [newsList, setNewsList] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [usersCache, setUsersCache] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    const q = query(collection(db, 'haberler'), orderBy('tarihjav', 'desc'), limit(15));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: News[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as News);
      });
      setNewsList(list);
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

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      <div className="flex-1 w-full space-y-8">
        {loading ? (
          <h3 className="text-center text-gray-500 font-bold">{translations[currentLang].loading}</h3>
        ) : newsList.length === 0 ? (
          <h3 className="text-center text-gray-500 font-bold">Henüz haber eklenmemiş.</h3>
        ) : (
          newsList.map((item) => (
            <div key={item.id} className="bg-brand-card rounded-3xl overflow-hidden border-b-8 border-brand-maroon shadow-md transition-all">
              {item.haberfoto && <img src={item.haberfoto} className="w-full h-80 object-cover border-b-4 border-brand-gold" alt="haber" />}
              <div className="p-6">
                <span className="text-brand-maroon font-extrabold text-xs uppercase tracking-wider block mb-2">
                  📅 {item.tarih || ''}
                </span>
                <h2 className="text-2xl font-black text-brand-dark mb-4 leading-tight">{item.haberad}</h2>
                <p className="text-sm text-gray-700 leading-relaxed font-semibold whitespace-pre-line">{item.haberdetay}</p>
              </div>
              
              {/* Comments Section */}
              <CommentsArea 
                newsId={item.id} 
                currentUser={currentUser} 
                fetchUserProfile={fetchUserProfile}
                onNavigate={onNavigate}
                teamLogos={teamLogos}
              />
            </div>
          ))
        )}
      </div>

      <div className="w-full lg:w-90 flex-shrink-0 sticky top-24">
        <iframe 
          src="https://discord.com/widget?id=1106663307122851850&theme=dark" 
          width="100%" 
          height="500" 
          allowTransparency={true} 
          frameBorder="0"
          className="rounded-2xl shadow-md border-b-8 border-brand-maroon"
        ></iframe>
      </div>
    </div>
  );
}

// ── NESTED COMMENTS SUB-COMPONENT ──

interface CommentsAreaProps {
  newsId: string;
  currentUser: UserProfile | null;
  fetchUserProfile: (uid: string) => Promise<UserProfile | null>;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
}

function CommentsArea({ newsId, currentUser, fetchUserProfile, onNavigate, teamLogos }: CommentsAreaProps) {
  const [comments, setComments] = useState<any[]>([]);
  const [newCommentText, setNewCommentText] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'haberler', newsId, 'yorumlar'), orderBy('tarih', 'asc'));
    const unsubscribe = onSnapshot(q, async (snap) => {
      const list: any[] = [];
      for (const d of snap.docs) {
        const c = d.data();
        list.push({ id: d.id, ...c });
      }
      setComments(list);
    });
    return () => unsubscribe();
  }, [newsId]);

  const handlePostComment = async () => {
    if (!currentUser || !newCommentText.trim()) return;
    try {
      await addDoc(collection(db, 'haberler', newsId, 'yorumlar'), {
        uid: currentUser.uid,
        ad: currentUser.displayName || 'Kullanıcı',
        avatar: currentUser.avatar || '',
        admin: currentUser.admin || false,
        yorum: newCommentText.trim(),
        tarih: new Date(),
        likes: []
      });
      setNewCommentText('');
    } catch (e) {
      console.error(e);
    }
  };

  const handleLikeComment = async (cid: string, likes: string[]) => {
    if (!currentUser) {
      alert('Yorumu beğenmek için giriş yapmalısınız!');
      return;
    }
    const ref = doc(db, 'haberler', newsId, 'yorumlar', cid);
    const hasLiked = likes?.includes(currentUser.uid);
    try {
      await updateDoc(ref, {
        likes: hasLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid)
      });
    } catch (e) {
      console.error(e);
    }
  };

  const renderBadge = (profile: any) => {
    if (profile?.admin) {
      return <span className="bg-red-600 text-white rounded-full w-4 h-4 inline-flex items-center justify-center text-[10px] ml-1 font-bold select-none cursor-default" title="Admin">✓</span>;
    }
    return null;
  };

  return (
    <div className="bg-[#fafaf7] border-t border-gray-200 p-6">
      <h3 className="text-xs font-black text-brand-maroon tracking-wider uppercase mb-4">💬 Yorumlar ({comments.length})</h3>
      
      <div className="space-y-4 mb-6">
        {comments.map((comment) => (
          <SingleComment 
            key={comment.id}
            comment={comment}
            newsId={newsId}
            currentUser={currentUser}
            onLike={() => handleLikeComment(comment.id, comment.likes || [])}
            fetchUserProfile={fetchUserProfile}
            renderBadge={renderBadge}
            onNavigate={onNavigate}
            teamLogos={teamLogos}
          />
        ))}
      </div>

      {currentUser ? (
        <div className="flex gap-2 items-center">
          <input 
            type="text" 
            placeholder="Yorum yaz..." 
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
            className="flex-1 bg-white border-2 border-gray-200 rounded-full py-2 px-4 text-sm font-semibold outline-none focus:border-brand-maroon"
            onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
          />
          <button 
            onClick={handlePostComment}
            className="bg-brand-maroon text-brand-gold py-2 px-6 rounded-full font-black text-xs hover:bg-[#600000] cursor-pointer"
          >
            Gönder
          </button>
        </div>
      ) : (
        <p className="text-[11px] font-bold text-gray-500">Yorum yapmak için giriş yapmalısınız.</p>
      )}
    </div>
  );
}

// ── COMPONENT FOR EACH INDIVIDUAL COMMENT WITH ITS REPLIES ──

interface SingleCommentProps {
  key?: string;
  comment: any;
  newsId: string;
  currentUser: UserProfile | null;
  onLike: () => void;
  fetchUserProfile: (uid: string) => Promise<UserProfile | null>;
  renderBadge: (profile: any) => React.ReactNode;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
}

function SingleComment({ comment, newsId, currentUser, onLike, fetchUserProfile, renderBadge, onNavigate, teamLogos }: SingleCommentProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    fetchUserProfile(comment.uid).then((res) => {
      setProfile(res);
    });

    const q = query(collection(db, 'haberler', newsId, 'yorumlar', comment.id, 'yanitlar'), orderBy('tarih', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setReplies(list);
    });
    return () => unsubscribe();
  }, [comment.uid, comment.id, newsId, fetchUserProfile]);

  const handlePostReply = async () => {
    if (!currentUser || !replyText.trim()) return;
    try {
      await addDoc(collection(db, 'haberler', newsId, 'yorumlar', comment.id, 'yanitlar'), {
        uid: currentUser.uid,
        ad: currentUser.displayName || 'Kullanıcı',
        avatar: currentUser.avatar || '',
        admin: currentUser.admin || false,
        yorum: replyText.trim(),
        tarih: new Date(),
        likes: []
      });
      setReplyText('');
      setShowReplyInput(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLikeReply = async (rid: string, rlikes: string[]) => {
    if (!currentUser) return;
    const ref = doc(db, 'haberler', newsId, 'yorumlar', comment.id, 'yanitlar', rid);
    const hasLiked = rlikes?.includes(currentUser.uid);
    try {
      await updateDoc(ref, {
        likes: hasLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid)
      });
    } catch (e) {
      console.error(e);
    }
  };

  const avatarSrc = profile?.avatar || comment.avatar || `https://ui-avatars.com/api/?name=${comment.ad}&background=800000&color=ffd700&size=40`;
  const commentLikesCount = comment.likes?.length || 0;
  const isLiked = currentUser ? comment.likes?.includes(currentUser.uid) : false;

  return (
    <div className="flex gap-3 items-start select-text">
      <img 
        src={avatarSrc} 
        onClick={() => onNavigate({ type: 'user-profile', userId: comment.uid })}
        className="w-10 h-10 rounded-full border-2 border-brand-maroon object-cover shrink-0 cursor-pointer"
        alt="avatar" 
      />
      <div className="flex-1 bg-white border border-gray-200 rounded-2xl p-3 shadow-sm">
        <div className="flex items-center gap-1">
          <span 
            onClick={() => onNavigate({ type: 'user-profile', userId: comment.uid })}
            className="text-xs font-black text-brand-maroon hover:underline cursor-pointer"
          >
            {profile?.displayName || comment.ad}
          </span>
          {renderBadge(profile || comment)}
          {profile?.favTeam && teamLogos[profile.favTeam] && (
            <img 
              onClick={() => onNavigate({ type: 'team-detail', teamName: profile?.favTeam })}
              src={teamLogos[profile.favTeam]} 
              title={profile.favTeam} 
              className="w-4 h-4 rounded-full border border-gray-200 object-cover cursor-pointer ml-1"
              alt="team"
            />
          )}
        </div>
        <p className="text-xs text-gray-800 font-semibold mt-1">{comment.yorum}</p>

        <div className="flex gap-3 items-center mt-2">
          <button 
            onClick={() => setShowReplyInput(!showReplyInput)} 
            className="text-[10px] font-extrabold text-gray-400 hover:text-brand-maroon underline"
          >
            Yanıtla
          </button>
          <button 
            onClick={onLike}
            className={`text-[10px] font-extrabold flex items-center gap-1 ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
          >
            {isLiked ? '❤️' : '🤍'} {commentLikesCount}
          </button>
        </div>

        {/* Reply Input Form */}
        {showReplyInput && (
          <div className="flex gap-2 items-center mt-3 border-t border-dashed border-gray-200 pt-3">
            <input 
              type="text" 
              placeholder="Yanıtınız..." 
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-full py-1.5 px-3 text-xs font-medium outline-none focus:border-brand-maroon"
              onKeyDown={(e) => e.key === 'Enter' && handlePostReply()}
            />
            <button 
              onClick={handlePostReply}
              className="bg-brand-maroon text-brand-gold py-1.5 px-4 rounded-full font-black text-[10px] hover:bg-[#600000] cursor-pointer"
            >
              Gönder
            </button>
          </div>
        )}

        {/* Nested Replies Stream */}
        {replies.length > 0 && (
          <div className="mt-3 space-y-3 pl-4 border-l-2 border-gray-100">
            {replies.map((reply) => {
              const rLiked = currentUser ? reply.likes?.includes(currentUser.uid) : false;
              const rAvatar = reply.avatar || `https://ui-avatars.com/api/?name=${reply.ad}&background=800000&color=ffd700&size=24`;
              return (
                <div key={reply.id} className="flex gap-2 items-start bg-gray-50 p-2 rounded-xl border border-gray-100">
                  <img 
                    src={rAvatar} 
                    onClick={() => onNavigate({ type: 'user-profile', userId: reply.uid })}
                    className="w-6 h-6 rounded-full border border-brand-maroon object-cover shrink-0 cursor-pointer"
                    alt="avatar" 
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1">
                      <span 
                        onClick={() => onNavigate({ type: 'user-profile', userId: reply.uid })}
                        className="text-[10px] font-black text-brand-maroon hover:underline cursor-pointer"
                      >
                        {reply.ad}
                      </span>
                      {renderBadge(reply)}
                    </div>
                    <p className="text-[11px] text-gray-700 font-semibold mt-0.5">{reply.yorum}</p>
                    <div className="mt-1">
                      <button 
                        onClick={() => handleLikeReply(reply.id, reply.likes || [])}
                        className={`text-[9px] font-extrabold flex items-center gap-0.5 ${rLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
                      >
                        {rLiked ? '❤️' : '🤍'} {reply.likes?.length || 0}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
