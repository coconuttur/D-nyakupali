export interface TrophyInfo {
  id: 'lig' | 'ziraat' | 'ucl' | 'uel' | 'uecl' | 'wc';
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
    id: 'wc',
    name: 'Dünya Kupası',
    icon: 'https://tmssl.akamaized.net//images/erfolge/header/101.png?lm=1774860361'
  }
];

export const TROPHY_MAP: Record<string, TrophyInfo> = TROPHIES_LIST.reduce((acc, t) => {
  acc[t.id] = t;
  return acc;
}, {} as Record<string, TrophyInfo>);
