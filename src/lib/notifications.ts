import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { getMessaging, getToken, onMessage, isSupported, deleteToken } from 'firebase/messaging';
import { app, auth, db } from '../firebase';
import type { UserProfile } from '../types';

export type PushEventType = 'news' | 'goal' | 'card' | 'sub' | 'duel' | 'test';

export interface LiveNotificationPayload {
  id: string;
  title: string;
  body: string;
  type: PushEventType;
  tag: string;
  timestamp: number;
  url?: string;
}

const PREF_KEY = 'bobblekolik_push_enabled';
const TOKEN_KEY = 'bobblekolik_fcm_token';
const MAX_TRACKED_TAGS = 200;
const notifiedTags = new Set<string>();

function rememberTag(tag: string): boolean {
  if (notifiedTags.has(tag)) return false;
  notifiedTags.add(tag);
  if (notifiedTags.size > MAX_TRACKED_TAGS) {
    const first = notifiedTags.values().next().value;
    if (first) notifiedTags.delete(first);
  }
  return true;
}

export function getVapidKey(): string {
  return ((import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || '').trim();
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export function isInsideIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function getNotificationsEnabledPreference(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === 'true' && getNotificationPermission() === 'granted';
  } catch {
    return false;
  }
}

export function setNotificationsEnabledPreference(enabled: boolean) {
  try {
    localStorage.setItem(PREF_KEY, enabled ? 'true' : 'false');
  } catch {}
}

export async function showBrowserNotification(payload: LiveNotificationPayload) {
  if (!getNotificationsEnabledPreference()) return;
  if (getNotificationPermission() !== 'granted') return;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      if (reg && reg.showNotification) {
        await reg.showNotification(payload.title, {
          body: payload.body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: payload.tag,
          data: { url: payload.url || '/', type: payload.type }
        });
        return;
      }
    }
    new Notification(payload.title, {
      body: payload.body,
      tag: payload.tag
    });
  } catch (err) {
    console.warn('Browser notification display skipped:', err);
  }
}

export async function enablePushNotifications(userProfile: UserProfile | null): Promise<{
  ok: boolean;
  mode?: 'fcm' | 'live-browser';
  token?: string | null;
  error?: string;
}> {
  if (!isPushSupported()) {
    return { ok: false, error: 'Bu tarayıcı Web Push bildirimlerini desteklemiyor.' };
  }

  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return {
      ok: false,
      error: isInsideIframe()
        ? 'Önizleme penceresinde tarayıcı izinleri engellendi. Bildirimleri açmak için siteyi yeni sekmede açın.'
        : 'Bildirim izni alınamadı.'
    };
  }

  if (permission !== 'granted') {
    setNotificationsEnabledPreference(false);
    return {
      ok: false,
      error: isInsideIframe()
        ? 'Bildirim izni verilmedi veya önizleme çerçevesi tarafından engellendi. Siteyi yeni sekmede açıp deneyin.'
        : 'Tarayıcı bildirim izni reddedildi. Tarayıcı adres çubuğundan izin verebilirsiniz.'
    };
  }

  setNotificationsEnabledPreference(true);

  try {
    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    const vapidKey = getVapidKey();
    const fcmSupported = await isSupported().catch(() => false);

    if (vapidKey && fcmSupported) {
      const messaging = getMessaging(app);
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: swReg
      });

      if (token) {
        try {
          localStorage.setItem(TOKEN_KEY, token);
        } catch {}

        await fetch('/api/push/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            uid: userProfile?.uid || auth.currentUser?.uid || null,
            displayName: userProfile?.displayName || auth.currentUser?.displayName || null
          })
        }).catch(() => {});

        return { ok: true, mode: 'fcm', token };
      }
    }

    return { ok: true, mode: 'live-browser', token: null };
  } catch (err: any) {
    console.warn('FCM setup fallback to live browser notifications:', err);
    return { ok: true, mode: 'live-browser', token: null };
  }
}

export async function disablePushNotifications() {
  setNotificationsEnabledPreference(false);
  let storedToken = '';
  try {
    storedToken = localStorage.getItem(TOKEN_KEY) || '';
    localStorage.removeItem(TOKEN_KEY);
  } catch {}

  if (storedToken) {
    await fetch('/api/push/unregister', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: storedToken })
    }).catch(() => {});

    try {
      const fcmSupported = await isSupported().catch(() => false);
      if (fcmSupported && getVapidKey()) {
        const messaging = getMessaging(app);
        await deleteToken(messaging).catch(() => {});
      }
    } catch {}
  }
}

export async function sendPushNotificationEvent(payload: {
  title: string;
  body: string;
  type: PushEventType;
  tag: string;
  url?: string;
}): Promise<{ ok: boolean; sent?: number; skipped?: boolean; error?: string }> {
  try {
    const idToken = await auth.currentUser?.getIdToken().catch(() => '');
    if (!idToken) return { ok: false, error: 'Oturum token alınamadı.' };

    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    return data;
  } catch (err: any) {
    console.warn('Push dispatch notice:', err);
    return { ok: false, error: err?.message };
  }
}

export function initForegroundFcmListener(onNotify: (notif: LiveNotificationPayload) => void): () => void {
  let unsubFcm: (() => void) | null = null;
  let cancelled = false;

  if (getVapidKey()) {
    isSupported()
      .then((supported) => {
        if (!supported || cancelled) return;
        const messaging = getMessaging(app);
        unsubFcm = onMessage(messaging, (payload) => {
          const title = payload.notification?.title || payload.data?.title || 'Bobblekolik';
          const body = payload.notification?.body || payload.data?.body || '';
          const type = (payload.data?.type as PushEventType) || 'news';
          const tag = payload.data?.tag || `fcm_${Date.now()}`;

          if (!rememberTag(tag)) return;

          const notif: LiveNotificationPayload = {
            id: tag,
            title,
            body,
            type,
            tag,
            timestamp: Date.now(),
            url: payload.data?.url || '/'
          };

          onNotify(notif);
          showBrowserNotification(notif);
        });
      })
      .catch(() => {});
  }

  return () => {
    cancelled = true;
    if (unsubFcm) unsubFcm();
  };
}

/**
 * Listens in real-time to Firestore collections (haberler, matches timeline events, duels)
 * so every open client receives instant live notifications & browser popups whenever
 * news, goals, cards, substitutions, or duel results are added.
 */
export function subscribeToLivePushEvents(onNotify: (notif: LiveNotificationPayload) => void): () => void {
  let newsInitialized = false;
  const knownNewsIds = new Set<string>();

  const unsubNews = onSnapshot(
    query(collection(db, 'haberler'), orderBy('tarihjav', 'desc'), limit(15)),
    (snap) => {
      if (!newsInitialized) {
        snap.forEach((d) => knownNewsIds.add(d.id));
        newsInitialized = true;
        return;
      }

      snap.docChanges().forEach((change) => {
        if (change.type === 'added' && !knownNewsIds.has(change.doc.id)) {
          knownNewsIds.add(change.doc.id);
          const data = change.doc.data();
          const tag = `news_${change.doc.id}`;
          if (!rememberTag(tag)) return;

          const rawDetail = String(data.haberdetay || '').trim();
          const snippet = rawDetail.length > 110 ? `${rawDetail.slice(0, 107)}...` : rawDetail;

          const notif: LiveNotificationPayload = {
            id: tag,
            title: `📰 Yeni Haber: ${data.haberad || 'Son Dakika'}`,
            body: snippet || 'Yeni haber yayınlandı!',
            type: 'news',
            tag,
            timestamp: Date.now()
          };
          onNotify(notif);
          showBrowserNotification(notif);
        }
      });
    },
    (err) => console.warn('Live news notification listener warning:', err)
  );

  let matchesInitialized = false;
  const knownMatchEventIds = new Map<string, Set<string>>();

  const unsubMatches = onSnapshot(
    collection(db, 'matches'),
    (snap) => {
      if (!matchesInitialized) {
        snap.forEach((d) => {
          const data = d.data();
          const tl = Array.isArray(data.timeline) ? data.timeline : [];
          knownMatchEventIds.set(
            d.id,
            new Set(tl.map((evt: any, idx: number) => String(evt?.id || `${idx}_${evt?.type}`)))
          );
        });
        matchesInitialized = true;
        return;
      }

      snap.docChanges().forEach((change) => {
        const d = change.doc;
        const data = d.data();
        const tl = Array.isArray(data.timeline) ? data.timeline : [];
        const prevSet = knownMatchEventIds.get(d.id) || new Set<string>();
        const nextSet = new Set<string>();

        const team1 = String(data.team1 || 'Takım 1');
        const team2 = String(data.team2 || 'Takım 2');

        tl.forEach((evt: any, idx: number) => {
          const evtId = String(evt?.id || `${idx}_${evt?.type}`);
          nextSet.add(evtId);

          if (!prevSet.has(evtId) && change.type !== 'removed') {
            const tag = `evt_${evtId}`;
            const teamName = evt.team === 'team1' ? team1 : evt.team === 'team2' ? team2 : `${team1} - ${team2}`;
            const min = evt.minute ? ` (${evt.minute})` : '';

            if (evt.type === 'goal') {
              if (!rememberTag(tag)) return;
              const isKK = Boolean(evt.isKK);
              const scoreText =
                data.score1 !== undefined && data.score2 !== undefined
                  ? ` • Skor: ${team1} ${data.score1}-${data.score2} ${team2}`
                  : '';
              const assistText = evt.assist && evt.assist !== 'Şut' ? ` • Asist: ${evt.assist}` : '';
              const notif: LiveNotificationPayload = {
                id: tag,
                title: isKK ? `🥅 Kendi Kalesine Gol! (${teamName})` : `⚽ GOL! (${teamName})`,
                body: `${evt.scorer || 'Oyuncu'}${min}${assistText}${scoreText}`,
                type: 'goal',
                tag,
                timestamp: Date.now()
              };
              onNotify(notif);
              showBrowserNotification(notif);
            } else if (evt.type === 'card') {
              if (!rememberTag(tag)) return;
              const color = String(evt.cardColor || 'Sarı');
              const cardEmoji = color === 'Kırmızı' ? '🟥' : color === 'Yeşil' ? '🟩' : '🟨';
              const reasonText = evt.reason ? ` - ${evt.reason}` : '';
              const notif: LiveNotificationPayload = {
                id: tag,
                title: `${cardEmoji} ${color} Kart! (${teamName})`,
                body: `${evt.player || 'Oyuncu'}${min}${reasonText}`,
                type: 'card',
                tag,
                timestamp: Date.now()
              };
              onNotify(notif);
              showBrowserNotification(notif);
            } else if (evt.type === 'sub') {
              if (!rememberTag(tag)) return;
              const parts: string[] = [];
              if (evt.subIn) parts.push(`🟢 Giren: ${evt.subIn}`);
              if (evt.subOut) parts.push(`🔴 Çıkan: ${evt.subOut}`);
              const notif: LiveNotificationPayload = {
                id: tag,
                title: `🔄 Oyuncu Değişikliği (${teamName})`,
                body: `${parts.join(' | ')}${min}`,
                type: 'sub',
                tag,
                timestamp: Date.now()
              };
              onNotify(notif);
              showBrowserNotification(notif);
            }
          }
        });

        knownMatchEventIds.set(d.id, nextSet);
      });
    },
    (err) => console.warn('Live match events listener warning:', err)
  );

  let duelsInitialized = false;
  const knownDuelIds = new Set<string>();

  const unsubDuels = onSnapshot(
    collection(db, 'duels'),
    (snap) => {
      if (!duelsInitialized) {
        snap.forEach((d) => knownDuelIds.add(d.id));
        duelsInitialized = true;
        return;
      }

      snap.docChanges().forEach((change) => {
        if (change.type === 'added' && !knownDuelIds.has(change.doc.id)) {
          knownDuelIds.add(change.doc.id);
          const data = change.doc.data();
          const tag = `duel_${change.doc.id}`;
          if (!rememberTag(tag)) return;

          const matchNo = data.matchNumber ? ` (#${data.matchNumber})` : '';
          const notif: LiveNotificationPayload = {
            id: tag,
            title: `⚔️ Düello Sonucu${matchNo}`,
            body: `${data.player1Name || 'Oyuncu 1'} ${data.score1 ?? 0} - ${data.score2 ?? 0} ${data.player2Name || 'Oyuncu 2'}`,
            type: 'duel',
            tag,
            timestamp: Date.now()
          };
          onNotify(notif);
          showBrowserNotification(notif);
        }
      });
    },
    (err) => console.warn('Live duels listener warning:', err)
  );

  return () => {
    unsubNews();
    unsubMatches();
    unsubDuels();
  };
}
