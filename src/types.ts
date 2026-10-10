export interface UserProfile {
  uid: string;
  displayName: string;
  email?: string;
  avatar?: string;
  banner?: string;
  bgGradientStart?: string;
  bgGradientEnd?: string;
  balance?: number;
  admin?: boolean;
  test?: boolean;
  favTeam?: string;
  favPlayer?: string;
  bio?: string;
  followers?: string[];
  following?: string[];
  economyReset2026?: boolean;
}

export interface TradeCardItem {
  slotCode: string;
  variant: 'normal' | 'shiny' | 'secret';
  title: string;
  image: string;
  teamLogo?: string;
  count?: number;
}

export interface TradeOffer {
  id: string;
  senderUid: string;
  senderName: string;
  senderAvatar?: string;
  receiverUid: string;
  receiverName: string;
  receiverAvatar?: string;
  offeredCards: TradeCardItem[];
  requestedCards: TradeCardItem[];
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  createdAt: number;
  completedAt?: number;
  weekKey: string;
  pairKey: string;
}

export interface Team {
  name: string;
  logo: string;
  played?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  "atilan gol"?: number;
  "yenilen gol"?: number;
  points?: number;
  ülke?: string;
  hayvan?: string;
  insta?: string;
  likes?: string[];
  dislikes?: string[];
  kupalar?: Record<string, number>;
}

export interface Player {
  pname: string;
  pteam: string;
  foto: string;
  gen?: number;
  pülke?: string;
  goals: number;
  asistsay?: number;
  ratingoy?: string;
  poyn?: number;
  bilgi?: string;
  instaoy?: string;
  baskan?: boolean;
  likes?: string[];
  dislikes?: string[];
  kupalar?: Record<string, number>;
  kiralik?: boolean;
  kiralikTakim?: string;
}

export interface MatchTimelineEvent {
  id: string;
  type: 'goal' | 'period' | 'card' | 'sub';
  team?: 'team1' | 'team2';
  scorer?: string;
  assist?: string;
  minute: string;
  isKK?: boolean;
  player?: string;
  cardColor?: 'Sarı' | 'Kırmızı' | 'Yeşil';
  subOut?: string;
  subIn?: string;
  text?: string;
  score?: string;
}

export interface Match {
  id?: string;
  team1: string;
  team2: string;
  score1: string;
  score2: string;
  played: boolean;
  hafta: string;
  date?: string;
  datejav: number;
  ligm?: boolean;
  category?: string;
  isWorldCup?: boolean;
  mvp?: string;
  rating?: string;
  timeline?: MatchTimelineEvent[];
  iyScore?: string;
}

export interface Bet {
  id: string;
  uid: string;
  ad: string;
  avatar: string;
  matchId: string;
  choice: '1' | 'X' | '2';
  amount: number;
  status: 'pending' | 'won' | 'lost';
  winAmount?: number;
  finalOdd?: number;
  timestamp?: any;
}

export interface ForumPost {
  id: string;
  uid: string;
  ad: string;
  avatar: string;
  baslik: string;
  icerik: string;
  mediaUrl?: string;
  tarih: any;
  likes?: string[];
  admin?: boolean;
  dogru?: boolean;
  favTeam?: string;
}

export interface ForumReply {
  id: string;
  uid: string;
  ad: string;
  avatar: string;
  yorum: string;
  mediaUrl?: string;
  replyToId?: string;
  replyToName?: string;
  tarih: any;
  likes?: string[];
  admin?: boolean;
  dogru?: boolean;
  favTeam?: string;
}

export interface NewsComment {
  id: string;
  uid: string;
  ad: string;
  avatar: string;
  yorum: string;
  mediaUrl?: string;
  replyToId?: string;
  replyToName?: string;
  tarih: any;
  likes?: string[];
  admin?: boolean;
  dogru?: boolean;
  favTeam?: string;
}

export interface NewsReply {
  id: string;
  uid: string;
  ad: string;
  avatar: string;
  yorum: string;
  mediaUrl?: string;
  replyToId?: string;
  replyToName?: string;
  tarih: any;
  likes?: string[];
  admin?: boolean;
  dogru?: boolean;
  favTeam?: string;
}

export interface News {
  id: string;
  haberad: string;
  haberdetay: string;
  haberfoto?: string;
  tarih?: string;
  tarihjav?: number;
}

// ── WORLD CUP SPECIFIC MODELS ──

export interface WcTeam {
  id: string; // generated / custom document ID
  name: string;
  logo: string;
  playerName: string;
  playerPhoto: string;
  group: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
}

export interface WcMatch {
  id: string;
  team1: string;       // Team Name
  team2: string;       // Team Name
  score1: number | null;
  score2: number | null;
  played: boolean;
  group: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'Bracket';
  isGroup: boolean;
  stage?: 'Son 16' | 'Son 8' | 'Son 4' | 'Final';
  bracketId1?: string; // Pointer to slot id in previous round
  bracketId2?: string; // Pointer to slot id in previous round
  bracketSlotId?: string; // E.g., inner match identifier or matching id
  datejav: number;
  date?: string;
  mvp?: string;
  rating?: string;
  timeline?: MatchTimelineEvent[];
}

export interface WcBracket {
  id: string; // "wc_brackets_state" holds all slots as key-values: e.g. { "r16_m1_t1": "Arjantin", "r16_m1_t2": "Fransa", ... }
  slots: Record<string, string>;
}
