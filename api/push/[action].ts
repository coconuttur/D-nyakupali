import crypto from 'node:crypto';
import fs from 'node:fs';

const FIREBASE_PROJECT_ID = 'bobblekolik';
const FIREBASE_API_KEY = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyBEi_PQ2oYKW23Fu65M7MKPFKELRbqY6XQ';
const LOCAL_TOKENS_FILE = '/tmp/bobblekolik-fcm-tokens.json';

interface ServiceAccount {
  project_id?: string;
  client_email: string;
  private_key: string;
}

interface StoredTokenEntry {
  token: string;
  uid?: string | null;
  displayName?: string | null;
  updatedAt: number;
}

let cachedGoogleToken: { accessToken: string; expiresAt: number } | null = null;

function loadServiceAccount(): ServiceAccount | null {
  const rawEnv = (process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FCM_SERVICE_ACCOUNT)?.trim();
  if (rawEnv) {
    try {
      const cleaned = rawEnv.replace(/^['"]|['"]$/g, '');
      const jsonStr = cleaned.startsWith('{')
        ? cleaned
        : Buffer.from(cleaned, 'base64').toString('utf8');
      const parsed = JSON.parse(jsonStr) as ServiceAccount;
      if (parsed.client_email && parsed.private_key) {
        return {
          ...parsed,
          private_key: parsed.private_key.replace(/\\n/g, '\n')
        };
      }
    } catch (err) {
      console.warn('Invalid service account JSON:', err);
    }
  }

  const clientEmail = process.env.FCM_CLIENT_EMAIL?.trim().replace(/^['"]|['"]$/g, '');
  const privateKey = process.env.FCM_PRIVATE_KEY?.trim().replace(/^['"]|['"]$/g, '');
  if (clientEmail && privateKey) {
    return {
      project_id: process.env.FCM_PROJECT_ID?.trim() || FIREBASE_PROJECT_ID,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n')
    };
  }

  return null;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getGoogleAccessToken(sa: ServiceAccount): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedGoogleToken && cachedGoogleToken.expiresAt > nowSec + 120) {
    return cachedGoogleToken.accessToken;
  }

  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope: [
        'https://www.googleapis.com/auth/firebase.messaging',
        'https://www.googleapis.com/auth/datastore'
      ].join(' '),
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600
    })
  );

  const signingInput = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = base64UrlEncode(signer.sign(sa.private_key));
  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`OAuth token exchange failed (${tokenRes.status}): ${errText}`);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string; expires_in?: number };
  cachedGoogleToken = {
    accessToken: tokenData.access_token,
    expiresAt: nowSec + (tokenData.expires_in || 3600)
  };
  return tokenData.access_token;
}

function readLocalTokens(): Record<string, StoredTokenEntry> {
  try {
    if (!fs.existsSync(LOCAL_TOKENS_FILE)) return {};
    return JSON.parse(fs.readFileSync(LOCAL_TOKENS_FILE, 'utf8')) as Record<string, StoredTokenEntry>;
  } catch {
    return {};
  }
}

function writeLocalTokens(map: Record<string, StoredTokenEntry>) {
  try {
    fs.writeFileSync(LOCAL_TOKENS_FILE, JSON.stringify(map), 'utf8');
  } catch {}
}

function hashTokenId(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
}

async function saveTokenToFirestore(sa: ServiceAccount, entry: StoredTokenEntry) {
  const accessToken = await getGoogleAccessToken(sa);
  const projectId = sa.project_id || FIREBASE_PROJECT_ID;
  const docId = hashTokenId(entry.token);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/fcmTokens/${docId}`;

  const fields: Record<string, unknown> = {
    token: { stringValue: entry.token },
    updatedAt: { integerValue: String(entry.updatedAt) }
  };
  if (entry.uid) fields.uid = { stringValue: entry.uid };
  if (entry.displayName) fields.displayName = { stringValue: entry.displayName };

  await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });
}

async function deleteTokenFromFirestore(sa: ServiceAccount, token: string) {
  const accessToken = await getGoogleAccessToken(sa);
  const projectId = sa.project_id || FIREBASE_PROJECT_ID;
  const docId = hashTokenId(token);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/fcmTokens/${docId}`;
  await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  }).catch(() => {});
}

async function listTokensFromFirestore(sa: ServiceAccount): Promise<StoredTokenEntry[]> {
  const accessToken = await getGoogleAccessToken(sa);
  const projectId = sa.project_id || FIREBASE_PROJECT_ID;
  const list: StoredTokenEntry[] = [];
  let pageToken = '';

  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/fcmTokens`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) break;

    const json = (await res.json()) as {
      documents?: Array<{ fields?: Record<string, { stringValue?: string; integerValue?: string }> }>;
      nextPageToken?: string;
    };

    for (const d of json.documents || []) {
      const token = d.fields?.token?.stringValue;
      if (token) {
        list.push({
          token,
          uid: d.fields?.uid?.stringValue || null,
          displayName: d.fields?.displayName?.stringValue || null,
          updatedAt: Number(d.fields?.updatedAt?.integerValue) || Date.now()
        });
      }
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);

  return list;
}

async function verifyAdminCaller(idToken: string, sa: ServiceAccount | null): Promise<{ uid: string } | null> {
  if (!idToken) return null;

  const lookupRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    }
  );
  if (!lookupRes.ok) return null;

  const lookupJson = (await lookupRes.json()) as { users?: Array<{ localId?: string }> };
  const uid = lookupJson.users?.[0]?.localId;
  if (!uid) return null;

  const authHeader = sa
    ? `Bearer ${await getGoogleAccessToken(sa)}`
    : `Bearer ${idToken}`;
  const projectId = sa?.project_id || FIREBASE_PROJECT_ID;
  const userDocRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`,
    { headers: { Authorization: authHeader } }
  );
  if (!userDocRes.ok) return null;

  const userDoc = (await userDocRes.json()) as {
    fields?: { admin?: { booleanValue?: boolean } };
  };
  if (userDoc.fields?.admin?.booleanValue !== true) return null;

  return { uid };
}

function parseBody(req: any): Record<string, any> {
  if (!req?.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const rawAction = req.query?.action;
  const urlPath = typeof req.url === 'string' ? new URL(req.url, 'http://localhost').pathname : '';
  const action = Array.isArray(rawAction)
    ? rawAction[0]
    : (rawAction || urlPath.split('/').filter(Boolean).pop() || '');

  const sa = loadServiceAccount();

  if (action === 'status' && req.method === 'GET') {
    let count = Object.keys(readLocalTokens()).length;
    if (sa) {
      try {
        const fsTokens = await listTokensFromFirestore(sa);
        count = Math.max(count, fsTokens.length);
      } catch (err) {
        console.warn('Status token count error:', err);
      }
    }
    res.status(200).json({
      fcmConfigured: Boolean(sa),
      vapidConfigured: Boolean(process.env.VITE_FIREBASE_VAPID_KEY),
      subscriberCount: count,
      projectId: sa?.project_id || FIREBASE_PROJECT_ID
    });
    return;
  }

  if (action === 'register' && req.method === 'POST') {
    const body = parseBody(req);
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token) {
      res.status(400).json({ ok: false, error: 'Geçersiz FCM token.' });
      return;
    }

    const entry: StoredTokenEntry = {
      token,
      uid: body.uid || null,
      displayName: body.displayName || null,
      updatedAt: Date.now()
    };

    const localMap = readLocalTokens();
    localMap[hashTokenId(token)] = entry;
    writeLocalTokens(localMap);

    if (sa) {
      try {
        await saveTokenToFirestore(sa, entry);
      } catch (err) {
        console.warn('Firestore fcmTokens write error:', err);
      }
    }

    res.status(200).json({ ok: true, fcmConfigured: Boolean(sa) });
    return;
  }

  if (action === 'unregister' && req.method === 'POST') {
    const body = parseBody(req);
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token) {
      res.status(400).json({ ok: false, error: 'Token eksik.' });
      return;
    }

    const localMap = readLocalTokens();
    delete localMap[hashTokenId(token)];
    writeLocalTokens(localMap);

    if (sa) {
      await deleteTokenFromFirestore(sa, token);
    }

    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'send' && req.method === 'POST') {
    try {
      const authHeader = req.headers?.authorization || '';
      const idToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';

      const adminCaller = await verifyAdminCaller(idToken, sa);
      if (!adminCaller) {
        res.status(403).json({ ok: false, error: 'Yetkisiz işlem (Admin girişi gerekli).' });
        return;
      }

      if (!sa) {
        res.status(200).json({
          ok: false,
          skipped: true,
          reason: 'FIREBASE_SERVICE_ACCOUNT Vercel Environment Variables içinde tanımlı değil.'
        });
        return;
      }

      const payload = parseBody(req);
      const title = String(payload.title || 'Bobblekolik').slice(0, 120);
      const msgBody = String(payload.body || '').slice(0, 240);
      const tag = String(payload.tag || `push_${Date.now()}`);
      const type = String(payload.type || 'general');
      const targetUrl = String(payload.url || '/');

      const localEntries = Object.values(readLocalTokens());
      const fsEntries = await listTokensFromFirestore(sa);
      const tokenMap = new Map<string, StoredTokenEntry>();
      for (const e of [...localEntries, ...fsEntries]) {
        tokenMap.set(e.token, e);
      }

      const tokens = Array.from(tokenMap.keys());
      if (tokens.length === 0) {
        res.status(200).json({ ok: true, sent: 0, failed: 0, pruned: 0 });
        return;
      }

      const accessToken = await getGoogleAccessToken(sa);
      const projectId = sa.project_id || FIREBASE_PROJECT_ID;
      const fcmEndpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

      let sent = 0;
      let failed = 0;
      let pruned = 0;
      const updatedLocal = readLocalTokens();

      await Promise.all(
        tokens.map(async (deviceToken) => {
          const fcmRes = await fetch(fcmEndpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: {
                token: deviceToken,
                notification: {
                  title,
                  body: msgBody
                },
                webpush: {
                  headers: {
                    Urgency: 'high',
                    TTL: '86400'
                  },
                  notification: {
                    title,
                    body: msgBody,
                    tag,
                    renotify: true
                  },
                  fcm_options: {
                    link: targetUrl
                  }
                },
                data: {
                  title,
                  body: msgBody,
                  tag,
                  type,
                  url: targetUrl
                }
              }
            })
          });

          if (fcmRes.ok) {
            sent++;
          } else {
            failed++;
            const errText = await fcmRes.text();
            if (errText.includes('UNREGISTERED') || errText.includes('NOT_FOUND')) {
              pruned++;
              delete updatedLocal[hashTokenId(deviceToken)];
              await deleteTokenFromFirestore(sa, deviceToken);
            }
          }
        })
      );

      if (pruned > 0) {
        writeLocalTokens(updatedLocal);
      }

      res.status(200).json({ ok: true, sent, failed, pruned });
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      console.error('Vercel push send error:', msg);
      res.status(500).json({ ok: false, error: msg });
      return;
    }
  }

  res.status(404).json({ ok: false, error: 'Bilinmeyen push endpointi.' });
}
