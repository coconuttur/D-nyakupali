export interface TrophyInfo {
  id: string;
  name: string;
  icon: string;
}

export const TROPHIES_LIST: TrophyInfo[] = [
  {
    id: 'lig',
    name: 'Lig Kupası',
    icon: 'https://tmssl.akamaized.net//images/erfolge/medium/20.png?lm=1780043166'
  },
  {
    id: 'ziraat',
    name: 'Ziraat Kupası',
    icon: 'https://tmssl.akamaized.net//images/erfolge/header/148.png?lm=1780049586'
  },
  {
    id: 'ucl',
    name: 'UEFA Champions League',
    icon: 'https://imgs.search.brave.com/GGCCkycLhLk2WrdB2s5ycWcSUunAJlDIBJ8hmFpbxuI/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly93d3cu/cG5nbWFydC5jb20v/ZmlsZXMvMjIvVUVG/QS1DaGFtcGlvbnMt/TGVhZ3VlLVBORy1Q/aWMucG5n'
  },
  {
    id: 'uel',
    name: 'UEFA Europa League',
    icon: 'https://tmssl.akamaized.net//images/erfolge/header/264.png?lm=1520606999'
  },
  {
    id: 'uecl',
    name: 'UEFA Conference League',
    icon: 'https://tmssl.akamaized.net//images/erfolge/medium/856.png?lm=1639997104'
  },
  {
    id: 'super_cup',
    name: 'UEFA Süper Kupa',
    icon: 'https://tmssl.akamaized.net//images/erfolge/medium/354.png?lm=1780326884'
  },
  {
    id: 'wc',
    name: 'Dünya Kupası',
    icon: 'https://tmssl.akamaized.net//images/erfolge/header/101.png?lm=1774860361'
  },
  {
    id: 'ballondor',
    name: 'Ballon d\'Or',
    icon: 'https://tmssl.akamaized.net//images/titel/medium/676.png?lm=1575286775'
  },
  {
    id: 'golden_boy',
    name: 'Golden Boy Ödülü',
    icon: 'https://i.ibb.co/zh24DjrG/golden-boy-listesinde-3-turk-futbolcu200t-Ygn0-depositphotos-bgremover.png'
  },
  {
    id: 'fairplay',
    name: 'Fair Play Ödülü',
    icon: 'https://tmssl.akamaized.net//images/erfolge/medium/157.png?lm=1472215916'
  },
  {
    id: 'puskas',
    name: 'Puskás Ödülü',
    icon: 'https://i.pinimg.com/736x/a4/a6/1a/a4a61adc8155c829bf31f5ab5c95b9b6.jpg'
  }
];

export const TROPHY_MAP: Record<string, TrophyInfo> = TROPHIES_LIST.reduce((acc, t) => {
  acc[t.id] = t;
  return acc;
}, {} as Record<string, TrophyInfo>);
