import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot, addDoc, doc, updateDoc, getDoc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { News, NewsComment, UserProfile } from '../types';
import UserHoverCard from './UserHoverCard';
import { 
  MoreVertical, 
  Trash2, 
  Reply, 
  Image as ImageIcon, 
  Heart, 
  X, 
  Sparkles 
} from 'lucide-react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

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

  // Form states for adding news
  const [showAddForm, setShowAddForm] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addPhoto, setAddPhoto] = useState('');
  const [addDetail, setAddDetail] = useState('');
  const [addTarih, setAddTarih] = useState('');
  const [addTarihjav, setAddTarihjav] = useState('');

  // Form states for editing news
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPhoto, setEditPhoto] = useState('');
  const [editDetail, setEditDetail] = useState('');
  const [editTarih, setEditTarih] = useState('');
  const [editTarihjav, setEditTarihjav] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'haberler'), orderBy('tarihjav', 'desc'), limit(15));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: News[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as News);
      });
      setNewsList(list);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'haberler');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (showAddForm) {
      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const year = today.getFullYear();
      setAddTarih(`${day}.${month}.${year}`);
      setAddTarihjav(String(Date.now()));
    }
  }, [showAddForm]);

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

  const handleAddNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addTitle.trim() || !addDetail.trim()) {
      alert('Lütfen başlık ve detay alanlarını doldurun!');
      return;
    }
    try {
      await addDoc(collection(db, 'haberler'), {
        haberad: addTitle.trim(),
        haberdetay: addDetail.trim(),
        haberfoto: addPhoto.trim() || null,
        tarih: addTarih.trim() || null,
        tarihjav: Number(addTarihjav) || Date.now()
      });
      setAddTitle('');
      setAddPhoto('');
      setAddDetail('');
      setShowAddForm(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'haberler');
    }
  };

  const startEdit = (item: News) => {
    setEditingId(item.id);
    setEditTitle(item.haberad || '');
    setEditPhoto(item.haberfoto || '');
    setEditDetail(item.haberdetay || '');
    setEditTarih(item.tarih || '');
    setEditTarihjav(String(item.tarihjav || Date.now()));
  };

  const handleSaveEdit = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (!editTitle.trim() || !editDetail.trim()) {
      alert('Lütfen başlık ve detay alanlarını doldurun!');
      return;
    }
    try {
      await updateDoc(doc(db, 'haberler', id), {
        haberad: editTitle.trim(),
        haberdetay: editDetail.trim(),
        haberfoto: editPhoto.trim() || null,
        tarih: editTarih.trim() || null,
        tarihjav: Number(editTarihjav) || Date.now()
      });
      setEditingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `haberler/${id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bu haberi silmek istediğinize emin misiniz?')) return;
    try {
      await deleteDoc(doc(db, 'haberler', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `haberler/${id}`);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      <div className="flex-1 w-full space-y-8">
        
        {/* Admin Haber Ekleme Paneli */}
        {currentUser?.admin && (
          <div className="bg-brand-card p-6 rounded-3xl border-2 border-dashed border-brand-maroon/30 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-brand-maroon uppercase tracking-wider text-xs">
                📢 Haber Yönetim Paneli
              </h3>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="bg-brand-maroon text-brand-gold py-1.5 px-4 rounded-full font-black text-[10px] hover:bg-[#600000] cursor-pointer transition-all active:scale-95"
              >
                {showAddForm ? 'Kapat ✕' : '+ Yeni Haber Ekle'}
              </button>
            </div>

            {showAddForm && (
              <form onSubmit={handleAddNews} className="mt-4 space-y-4 border-t border-gray-150 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-brand-dark uppercase mb-1">Haber Başlığı *</label>
                    <input
                      type="text"
                      required
                      placeholder="Örn: Süper Transfer Açıklandı!"
                      value={addTitle}
                      onChange={(e) => setAddTitle(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl py-2 px-3 text-xs font-semibold outline-none focus:border-brand-maroon"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-brand-dark uppercase mb-1">Fotoğraf URL</label>
                    <input
                      type="text"
                      placeholder="Örn: https://example.com/foto.jpg"
                      value={addPhoto}
                      onChange={(e) => setAddPhoto(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl py-2 px-3 text-xs font-semibold outline-none focus:border-brand-maroon"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-brand-dark uppercase mb-1">Haber Detayı *</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Haber içeriğini buraya yazınız..."
                    value={addDetail}
                    onChange={(e) => setAddDetail(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl py-2 px-3 text-xs font-semibold outline-none focus:border-brand-maroon resize-y"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-brand-dark uppercase mb-1">Tarih Metni (date)</label>
                    <input
                      type="text"
                      placeholder="Örn: 22.06.2026"
                      value={addTarih}
                      onChange={(e) => setAddTarih(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl py-2 px-3 text-xs font-semibold outline-none focus:border-brand-maroon"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-brand-dark uppercase mb-1">Tarih Sayısı (datejav)</label>
                    <input
                      type="number"
                      placeholder="Filtreleme için sayı (milisaniye). Örn: 1782136224000"
                      value={addTarihjav}
                      onChange={(e) => setAddTarihjav(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl py-2 px-3 text-xs font-semibold outline-none focus:border-brand-maroon"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="bg-green-600 text-white py-2 px-6 rounded-xl font-black text-[10px] hover:bg-green-700 cursor-pointer transition-all active:scale-95 shadow-md uppercase tracking-wider"
                  >
                    Haberi Yayınla 🚀
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {loading ? (
          <h3 className="text-center text-gray-500 font-bold">{translations[currentLang].loading}</h3>
        ) : newsList.length === 0 ? (
          <h3 className="text-center text-gray-500 font-bold">Henüz haber eklenmemiş.</h3>
        ) : (
          newsList.map((item) => {
            const isEditing = editingId === item.id;
            return (
              <div key={item.id} className="bg-brand-card rounded-3xl overflow-hidden border-b-8 border-brand-maroon shadow-md transition-all">
                {isEditing ? (
                  <form onSubmit={(e) => handleSaveEdit(e, item.id)} className="p-6 space-y-4">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h4 className="font-black text-brand-maroon uppercase tracking-wider text-xs">
                        ✍️ Haberi Düzenle
                      </h4>
                      <div className="space-x-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="bg-gray-400 text-white py-1 px-3 rounded-full text-[10px] font-black hover:bg-gray-500 cursor-pointer"
                        >
                          Vazgeç
                        </button>
                        <button
                          type="submit"
                          className="bg-green-600 text-white py-1 px-3 rounded-full text-[10px] font-black hover:bg-green-700 cursor-pointer"
                        >
                          Kaydet 💾
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-brand-dark uppercase mb-1">Haber Başlığı</label>
                        <input
                          type="text"
                          required
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl py-1.5 px-3 text-xs font-semibold outline-none focus:border-brand-maroon"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-brand-dark uppercase mb-1">Fotoğraf URL</label>
                        <input
                          type="text"
                          value={editPhoto}
                          onChange={(e) => setEditPhoto(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl py-1.5 px-3 text-xs font-semibold outline-none focus:border-brand-maroon"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-brand-dark uppercase mb-1">Haber Detayı</label>
                      <textarea
                        required
                        rows={4}
                        value={editDetail}
                        onChange={(e) => setEditDetail(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl py-1.5 px-3 text-xs font-semibold outline-none focus:border-brand-maroon resize-y"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-brand-dark uppercase mb-1">Tarih Metni (date)</label>
                        <input
                          type="text"
                          value={editTarih}
                          onChange={(e) => setEditTarih(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl py-1.5 px-3 text-xs font-semibold outline-none focus:border-brand-maroon"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-brand-dark uppercase mb-1">Tarih Sayısı (datejav)</label>
                        <input
                          type="number"
                          value={editTarihjav}
                          onChange={(e) => setEditTarihjav(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl py-1.5 px-3 text-xs font-semibold outline-none focus:border-brand-maroon"
                        />
                      </div>
                    </div>
                  </form>
                ) : (
                  <>
                    {item.haberfoto && <img src={item.haberfoto} className="w-full h-80 object-cover border-b-4 border-brand-gold" alt="haber" />}
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-brand-maroon font-extrabold text-xs uppercase tracking-wider block">
                          📅 {item.tarih || ''}
                        </span>
                        
                        {/* Admin Kontrolleri */}
                        {currentUser?.admin && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => startEdit(item)}
                              className="text-[10px] font-black text-brand-maroon hover:bg-brand-maroon/10 py-1 px-3 rounded-full border border-brand-maroon/20 cursor-pointer transition-all active:scale-95"
                            >
                              Düzenle ✍️
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="text-[10px] font-black text-red-600 hover:bg-red-50 hover:text-red-700 py-1 px-3 rounded-full border border-red-200 cursor-pointer transition-all active:scale-95"
                            >
                              Sil 🗑️
                            </button>
                          </div>
                        )}
                      </div>
                      <h2 className="text-2xl font-black text-brand-dark mb-4 leading-tight">{item.haberad}</h2>
                      <p className="text-sm text-gray-700 leading-relaxed font-semibold whitespace-pre-line">{item.haberdetay}</p>
                    </div>
                  </>
                )}
                
                {/* Comments Section */}
                <CommentsArea 
                  newsId={item.id} 
                  currentUser={currentUser} 
                  fetchUserProfile={fetchUserProfile}
                  onNavigate={onNavigate}
                  teamLogos={teamLogos}
                />
              </div>
            );
          })
        )}
      </div>

      <div className="w-full lg:w-90 flex-shrink-0 sticky top-24">
        <iframe 
          src="https://discord.com/widget?id=1512996223370399815&theme=dark" 
          width="100%" 
          height="500" 
          allowTransparency={true} 
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          style={{ border: 0 }}
          className="rounded-2xl shadow-md border-b-8 border-brand-maroon"
        ></iframe>
      </div>
    </div>
  );
}

// ── QUICK FOOTBALL PHOTO & GIF PRESETS FOR NEWS COMMENTS ──
const PRESET_MEDIA = [
  { label: '⚽ Gol Sevinci', url: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=800&q=80' },
  { label: '🏆 Şampiyonluk', url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=800&q=80' },
  { label: '🔥 Taraftar Tribün', url: 'https://images.unsplash.com/photo-1518091043644-c1d4457512c6?auto=format&fit=crop&w=800&q=80' },
  { label: '⚡ Yeşil Saha', url: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=800&q=80' }
];

// ── NESTED COMMENTS SUB-COMPONENT ──

interface CommentsAreaProps {
  newsId: string;
  currentUser: UserProfile | null;
  fetchUserProfile?: (uid: string) => Promise<UserProfile | null>;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
}

function CommentsArea({ newsId, currentUser, onNavigate, teamLogos }: CommentsAreaProps) {
  const [comments, setComments] = useState<any[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Live real-time user profiles cache
  const [usersCache, setUsersCache] = useState<Record<string, UserProfile>>({});
  const activeListeners = useRef<Record<string, () => void>>({});

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

  useEffect(() => {
    return () => {
      Object.values(activeListeners.current).forEach((unsub) => {
        if (typeof unsub === 'function') unsub();
      });
      activeListeners.current = {};
    };
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'haberler', newsId, 'yorumlar'), orderBy('tarih', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({ id: d.id, ...data });
        if (data.uid) registerUserListener(data.uid);
      });
      setComments(list);
    });
    return () => unsubscribe();
  }, [newsId]);

  const handlePostComment = async () => {
    if (!currentUser) {
      alert('Yorum yapmak için giriş yapmalısınız!');
      return;
    }
    if (!newCommentText.trim() && !newMediaUrl.trim()) return;

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'haberler', newsId, 'yorumlar'), {
        uid: currentUser.uid,
        ad: currentUser.displayName || 'Kullanıcı',
        avatar: currentUser.avatar || '',
        admin: currentUser.admin || false,
        dogru: true,
        yorum: newCommentText.trim(),
        mediaUrl: newMediaUrl.trim() || '',
        tarih: new Date(),
        likes: [],
        favTeam: currentUser.favTeam || ''
      });
      setNewCommentText('');
      setNewMediaUrl('');
      setShowMediaInput(false);
    } catch (e) {
      console.error(e);
      alert('Yorum eklenirken hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (cid: string) => {
    if (!confirm('Bu yorumu silmek istediğinize emin misiniz?')) return;
    try {
      await deleteDoc(doc(db, 'haberler', newsId, 'yorumlar', cid));
    } catch (e) {
      console.error(e);
      alert('Yorum silinirken hata oluştu.');
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

  return (
    <div className="bg-[#fafaf7] border-t border-gray-200 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black text-brand-maroon tracking-wider uppercase flex items-center gap-1.5">
          <span>💬</span>
          <span>Haber Yorumları ({comments.length})</span>
        </h3>
        <span className="text-[10px] text-gray-500 font-bold">
          Fotoğraf, GIF ve yanıt özelliği aktif
        </span>
      </div>
      
      {/* List of Comments */}
      {comments.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-xs font-bold bg-white rounded-2xl border border-dashed border-gray-200">
          Bu habere henüz yorum yapılmamış. İlk yorumu siz yazın!
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <SingleComment 
              key={comment.id}
              comment={comment}
              newsId={newsId}
              currentUser={currentUser}
              usersCache={usersCache}
              registerUserListener={registerUserListener}
              onLike={() => handleLikeComment(comment.id, comment.likes || [])}
              onDelete={() => handleDeleteComment(comment.id)}
              onNavigate={onNavigate}
              teamLogos={teamLogos}
            />
          ))}
        </div>
      )}

      {/* New Comment Input Box with Media Attachment */}
      {currentUser ? (
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-3 shadow-sm space-y-2 mt-4">
          <div className="flex gap-2 items-center">
            <input 
              type="text" 
              placeholder="Habere yorumunuzu yazın..." 
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl py-2 px-3 text-xs font-semibold outline-none focus:border-brand-maroon"
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handlePostComment()}
            />
            <button
              type="button"
              onClick={() => setShowMediaInput(!showMediaInput)}
              className={`p-2 rounded-xl border cursor-pointer transition-colors flex items-center gap-1 text-[11px] font-black ${
                showMediaInput || newMediaUrl 
                  ? 'bg-amber-100 border-amber-300 text-amber-900' 
                  : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700'
              }`}
              title="Ek Ekle (Fotoğraf veya GIF)"
            >
              <ImageIcon className="w-4 h-4 text-amber-700" />
              <span className="hidden sm:inline">Ek Ekle</span>
            </button>
            <button 
              onClick={handlePostComment}
              disabled={submitting || (!newCommentText.trim() && !newMediaUrl.trim())}
              className="bg-brand-maroon text-brand-gold py-2 px-5 rounded-xl font-black text-xs hover:bg-[#600000] cursor-pointer disabled:opacity-40 transition-transform active:scale-95"
            >
              {submitting ? '...' : 'Gönder'}
            </button>
          </div>

          {/* Media attachment input area */}
          {showMediaInput && (
            <div className="bg-amber-50/50 p-2.5 rounded-xl border border-amber-200/80 space-y-2 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-amber-900 uppercase flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  <span>Fotoğraf veya GIF Linki</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowMediaInput(false)}
                  className="text-[10px] font-bold text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  ✕ Gizle
                </button>
              </div>

              <input 
                type="url"
                placeholder="https://... Fotoğraf veya GIF Linki yapıştırın"
                value={newMediaUrl}
                onChange={(e) => setNewMediaUrl(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs font-semibold outline-none focus:border-brand-maroon"
              />

              {/* Media Presets */}
              <div className="flex flex-wrap items-center gap-1 pt-0.5">
                <span className="text-[9px] text-gray-400 font-bold">Hızlı Seçim:</span>
                {PRESET_MEDIA.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setNewMediaUrl(preset.url)}
                    className="text-[9px] font-bold bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Preview */}
              {newMediaUrl && (
                <div className="relative rounded-lg overflow-hidden border border-amber-300 max-h-36 mt-1 inline-block">
                  <img 
                    src={newMediaUrl} 
                    alt="ek önizleme" 
                    className="max-h-36 max-w-full object-cover rounded-lg"
                    onError={() => {}}
                  />
                  <button
                    type="button"
                    onClick={() => setNewMediaUrl('')}
                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 text-[10px] hover:bg-red-700 cursor-pointer shadow"
                    title="Kaldır"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] font-bold text-gray-500 bg-white p-3 rounded-xl border border-gray-200 text-center">
          Yorum yapmak için giriş yapmalısınız.
        </p>
      )}
    </div>
  );
}

// ── COMPONENT FOR EACH INDIVIDUAL COMMENT WITH ITS REPLIES ──

interface SingleCommentProps {
  key?: any;
  comment: any;
  newsId: string;
  currentUser: UserProfile | null;
  usersCache: Record<string, UserProfile>;
  registerUserListener: (uid: string) => void;
  onLike: () => void;
  onDelete: () => void;
  onNavigate: (view: any) => void;
  teamLogos: Record<string, string>;
}

function SingleComment({ 
  comment, 
  newsId, 
  currentUser, 
  usersCache,
  registerUserListener,
  onLike, 
  onDelete,
  onNavigate, 
  teamLogos 
}: SingleCommentProps) {
  const [replies, setReplies] = useState<any[]>([]);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyMediaUrl, setReplyMediaUrl] = useState('');
  const [showReplyMedia, setShowReplyMedia] = useState(false);
  const [replyTargetName, setReplyTargetName] = useState<string>('');
  const [showMenu, setShowMenu] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close 3-dots menu on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showMenu]);

  // Listen to replies
  useEffect(() => {
    const q = query(collection(db, 'haberler', newsId, 'yorumlar', comment.id, 'yanitlar'), orderBy('tarih', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({ id: d.id, ...data });
        if (data.uid) registerUserListener(data.uid);
      });
      setReplies(list);
    });
    return () => unsubscribe();
  }, [newsId, comment.id]);

  const authorProfile = usersCache[comment.uid];
  const authorName = authorProfile?.displayName || comment.ad || 'Kullanıcı';
  const authorAvatar = authorProfile?.avatar || comment.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=800000&color=ffd700&size=40`;
  const authorFavTeam = authorProfile?.favTeam || comment.favTeam;
  const isAdmin = Boolean(authorProfile?.admin ?? comment.admin);

  const canDeleteComment = currentUser && (currentUser.uid === comment.uid || currentUser.admin);
  const isLiked = currentUser ? comment.likes?.includes(currentUser.uid) : false;
  const commentLikesCount = comment.likes?.length || 0;

  // Handle post reply
  const handlePostReply = async () => {
    if (!currentUser) {
      alert('Yanıt vermek için giriş yapmalısınız!');
      return;
    }
    if (!replyText.trim() && !replyMediaUrl.trim()) return;

    setSubmittingReply(true);
    try {
      await addDoc(collection(db, 'haberler', newsId, 'yorumlar', comment.id, 'yanitlar'), {
        uid: currentUser.uid,
        ad: currentUser.displayName || 'Kullanıcı',
        avatar: currentUser.avatar || '',
        admin: currentUser.admin || false,
        yorum: replyText.trim(),
        mediaUrl: replyMediaUrl.trim() || '',
        replyToName: replyTargetName || authorName,
        tarih: new Date(),
        likes: [],
        favTeam: currentUser.favTeam || ''
      });
      setReplyText('');
      setReplyMediaUrl('');
      setShowReplyMedia(false);
      setShowReplyBox(false);
      setReplyTargetName('');
    } catch (e) {
      console.error(e);
      alert('Yanıt eklenirken hata oluştu.');
    } finally {
      setSubmittingReply(false);
    }
  };

  // Like a reply
  const handleLikeReply = async (rid: string, rlikes: string[]) => {
    if (!currentUser) {
      alert('Beğenmek için giriş yapmalısınız!');
      return;
    }
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

  // Delete a reply
  const handleDeleteReply = async (rid: string) => {
    if (!confirm('Bu yanıtı silmek istediğinize emin misiniz?')) return;
    try {
      await deleteDoc(doc(db, 'haberler', newsId, 'yorumlar', comment.id, 'yanitlar', rid));
    } catch (e) {
      console.error(e);
      alert('Yanıt silinirken hata oluştu.');
    }
  };

  // Format date
  let dateStr = '';
  if (comment.tarih) {
    if (typeof comment.tarih.toDate === 'function') {
      dateStr = comment.tarih.toDate().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } else if (comment.tarih instanceof Date) {
      dateStr = comment.tarih.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
  }

  return (
    <div className="flex gap-3 items-start select-text relative">
      {/* Avatar with UserHoverCard on cursor hover */}
      <UserHoverCard
        uid={comment.uid}
        userProfile={authorProfile}
        fallbackName={authorName}
        fallbackAvatar={authorAvatar}
        teamLogos={teamLogos}
        onNavigate={onNavigate}
      >
        <img 
          src={authorAvatar} 
          className="w-10 h-10 rounded-full border-2 border-brand-maroon object-cover shrink-0 cursor-pointer hover:scale-105 transition-transform bg-white"
          alt="avatar" 
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=800000&color=ffd700&size=40`;
          }}
        />
      </UserHoverCard>

      <div className="flex-1 bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm space-y-2 relative">
        {/* Comment Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            <UserHoverCard
              uid={comment.uid}
              userProfile={authorProfile}
              fallbackName={authorName}
              fallbackAvatar={authorAvatar}
              teamLogos={teamLogos}
              onNavigate={onNavigate}
            >
              <span className="text-xs font-black text-brand-maroon hover:underline cursor-pointer">
                {authorName}
              </span>
            </UserHoverCard>

            {isAdmin && (
              <span className="bg-red-600 text-white rounded-md px-1.5 py-0.2 text-[8px] font-black uppercase tracking-wide">
                Yönetici
              </span>
            )}

            {authorFavTeam && teamLogos[authorFavTeam] && (
              <img 
                onClick={() => onNavigate({ type: 'team-detail', teamName: authorFavTeam })}
                src={teamLogos[authorFavTeam]} 
                title={authorFavTeam} 
                className="w-4 h-4 rounded-full border border-gray-200 object-cover cursor-pointer hover:scale-110 transition-transform"
                alt="team"
              />
            )}

            {dateStr && (
              <span className="text-[10px] text-gray-400 font-bold ml-1">
                {dateStr}
              </span>
            )}
          </div>

          {/* Three Dots Menu for Comment */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 text-gray-400 hover:text-brand-maroon hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
              title="Seçenekler"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-xl shadow-xl border border-gray-200 py-1 z-30 animate-fade-in text-left">
                {canDeleteComment ? (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onDelete();
                    }}
                    className="w-full px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-1.5 cursor-pointer text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yorumu Sil</span>
                  </button>
                ) : (
                  <span className="block px-3 py-1.5 text-[10px] text-gray-400 font-bold">
                    Silme yetkisi yok
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Comment Body */}
        {comment.yorum && (
          <p className="text-xs text-gray-800 font-semibold leading-relaxed whitespace-pre-wrap">
            {comment.yorum}
          </p>
        )}

        {/* Comment Photo/GIF Media Attachment */}
        {comment.mediaUrl && (
          <div className="rounded-xl overflow-hidden border border-gray-200 max-h-64 mt-2">
            <img 
              src={comment.mediaUrl} 
              alt="yorum eki" 
              className="max-h-64 w-full object-cover rounded-xl hover:opacity-95 transition-opacity cursor-pointer"
              onClick={() => window.open(comment.mediaUrl, '_blank')}
              onError={() => {}}
            />
          </div>
        )}

        {/* Comment Actions: Like & Reply */}
        <div className="flex gap-3 items-center pt-1 border-t border-gray-100 text-xs font-bold">
          <button 
            onClick={onLike}
            className={`flex items-center gap-1 py-1 px-2 rounded-lg transition-colors cursor-pointer text-[11px] font-extrabold ${
              isLiked 
                ? 'text-red-600 bg-red-50' 
                : 'text-gray-500 hover:text-red-500 hover:bg-gray-50'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-red-600' : ''}`} />
            <span>{commentLikesCount}</span>
          </button>

          <button 
            onClick={() => {
              setShowReplyBox(!showReplyBox);
              setReplyTargetName(authorName);
            }} 
            className="flex items-center gap-1 text-[11px] font-extrabold text-gray-500 hover:text-brand-maroon hover:bg-gray-50 py-1 px-2 rounded-lg cursor-pointer transition-colors"
          >
            <Reply className="w-3.5 h-3.5" />
            <span>Yanıtla</span>
          </button>
        </div>

        {/* Nested Replies Stream */}
        {replies.length > 0 && (
          <div className="mt-3 space-y-2.5 pl-3 border-l-2 border-brand-maroon/20">
            {replies.map((reply) => {
              const rProfile = usersCache[reply.uid];
              const rName = rProfile?.displayName || reply.ad || 'Kullanıcı';
              const rAvatar = rProfile?.avatar || reply.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(rName)}&background=800000&color=ffd700&size=28`;
              const rLiked = currentUser ? reply.likes?.includes(currentUser.uid) : false;
              const rLikesCount = reply.likes?.length || 0;
              const canDeleteReply = currentUser && (currentUser.uid === reply.uid || currentUser.admin);

              return (
                <div key={reply.id} className="flex gap-2 items-start bg-gray-50 p-2.5 rounded-xl border border-gray-100 group relative">
                  {/* Reply Avatar with UserHoverCard */}
                  <UserHoverCard
                    uid={reply.uid}
                    userProfile={rProfile}
                    fallbackName={rName}
                    fallbackAvatar={rAvatar}
                    teamLogos={teamLogos}
                    onNavigate={onNavigate}
                  >
                    <img 
                      src={rAvatar} 
                      className="w-7 h-7 rounded-full border border-brand-maroon object-cover shrink-0 cursor-pointer hover:scale-105 transition-transform bg-white"
                      alt="avatar" 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(rName)}&background=800000&color=ffd700&size=28`;
                      }}
                    />
                  </UserHoverCard>

                  <div className="flex-1 text-left space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <UserHoverCard
                          uid={reply.uid}
                          userProfile={rProfile}
                          fallbackName={rName}
                          fallbackAvatar={rAvatar}
                          teamLogos={teamLogos}
                          onNavigate={onNavigate}
                        >
                          <span className="text-[11px] font-black text-brand-maroon hover:underline cursor-pointer">
                            {rName}
                          </span>
                        </UserHoverCard>

                        {reply.admin && (
                          <span className="bg-red-600 text-white rounded px-1 py-0.2 text-[7px] font-black uppercase">
                            Yönetici
                          </span>
                        )}

                        {reply.replyToName && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100/60 px-1 rounded">
                            @{reply.replyToName}
                          </span>
                        )}
                      </div>

                      {/* Delete button on reply */}
                      {canDeleteReply && (
                        <button
                          onClick={() => handleDeleteReply(reply.id)}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 transition-opacity p-0.5 cursor-pointer"
                          title="Yanıtı Sil"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {reply.yorum && (
                      <p className="text-[11px] text-gray-800 font-semibold leading-relaxed whitespace-pre-wrap">
                        {reply.yorum}
                      </p>
                    )}

                    {/* Reply Media Attachment */}
                    {reply.mediaUrl && (
                      <div className="rounded-lg overflow-hidden border border-gray-200 max-h-48 mt-1">
                        <img 
                          src={reply.mediaUrl} 
                          alt="yanıt eki" 
                          className="max-h-48 w-full object-cover rounded-lg"
                          onError={() => {}}
                        />
                      </div>
                    )}

                    <div className="flex gap-2 items-center pt-0.5">
                      <button 
                        onClick={() => handleLikeReply(reply.id, reply.likes || [])}
                        className={`text-[10px] font-extrabold flex items-center gap-0.5 cursor-pointer ${
                          rLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'
                        }`}
                      >
                        <Heart className={`w-3 h-3 ${rLiked ? 'fill-red-500' : ''}`} />
                        <span>{rLikesCount}</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowReplyBox(true);
                          setReplyTargetName(rName);
                        }}
                        className="text-[10px] font-bold text-gray-400 hover:text-brand-maroon cursor-pointer hover:underline"
                      >
                        Yanıtla
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Reply Input Form */}
        {showReplyBox && (
          <div className="mt-3 bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-2 animate-fade-in text-left">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-brand-maroon uppercase flex items-center gap-1">
                <Reply className="w-3 h-3 text-brand-maroon" />
                <span>@{replyTargetName || authorName} kullanıcısına yanıt veriyorsunuz</span>
              </span>
              <button 
                type="button"
                onClick={() => {
                  setShowReplyBox(false);
                  setReplyText('');
                  setReplyMediaUrl('');
                  setShowReplyMedia(false);
                }}
                className="text-[10px] font-bold text-gray-400 hover:text-red-600 cursor-pointer"
              >
                ✕ İptal
              </button>
            </div>

            <div className="flex gap-2 items-center">
              <input 
                type="text" 
                placeholder="Yanıtınızı yazın..." 
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="flex-1 bg-white border border-gray-200 rounded-lg py-1.5 px-3 text-xs font-semibold outline-none focus:border-brand-maroon"
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handlePostReply()}
              />
              <button
                type="button"
                onClick={() => setShowReplyMedia(!showReplyMedia)}
                className={`p-1.5 rounded-lg border cursor-pointer text-[10px] font-black flex items-center gap-1 ${
                  showReplyMedia || replyMediaUrl 
                    ? 'bg-amber-100 border-amber-300 text-amber-900' 
                    : 'bg-white border-gray-200 text-gray-600'
                }`}
                title="Yanıta Foto / GIF ekle"
              >
                <ImageIcon className="w-3.5 h-3.5 text-amber-700" />
                <span className="hidden sm:inline">Foto/GIF</span>
              </button>
              <button 
                onClick={handlePostReply}
                disabled={submittingReply || (!replyText.trim() && !replyMediaUrl.trim())}
                className="bg-brand-maroon text-brand-gold py-1.5 px-4 rounded-lg font-black text-[11px] hover:bg-[#600000] cursor-pointer disabled:opacity-40 uppercase tracking-wide"
              >
                {submittingReply ? '...' : 'Yanıtla'}
              </button>
            </div>

            {/* Reply media attachment input */}
            {showReplyMedia && (
              <div className="bg-white p-2 rounded-lg border border-amber-200 space-y-1.5 animate-fade-in">
                <input 
                  type="url"
                  placeholder="https://... Fotoğraf veya GIF Linki"
                  value={replyMediaUrl}
                  onChange={(e) => setReplyMediaUrl(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded p-1.5 text-[11px] font-semibold outline-none focus:border-brand-maroon"
                />
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[9px] text-gray-400 font-bold">Hızlı Seçim:</span>
                  {PRESET_MEDIA.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setReplyMediaUrl(preset.url)}
                      className="text-[9px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {replyMediaUrl && (
                  <div className="relative rounded overflow-hidden border border-amber-300 max-h-24 mt-1 inline-block">
                    <img src={replyMediaUrl} alt="yanıt eki" className="max-h-24 object-cover rounded" onError={() => {}} />
                    <button
                      type="button"
                      onClick={() => setReplyMediaUrl('')}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 text-[8px] hover:bg-red-700 cursor-pointer shadow"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

