/** 落ち着いたトーン: 温かいグレー地 + 濃い青 + 朱色のハンコ。見出しは明朝体 */
const light = {
  bg: '#F4F2ED',
  card: '#FFFFFF',
  ink: '#14182B',
  inkSoft: '#656A78',
  inkFaint: '#A3A7B1',
  blue: '#2350D2',
  blueDark: '#1B40A8',
  blueSoft: '#E6ECFB',
  blueBorder: '#C9D6F4',
  red: '#C8372D',
  redSoft: '#FBE9E7',
  green: '#2B7A4B',
  greenSoft: '#E3F1E8',
  beige: '#EDEAE2',
  track: '#E3E1DA',
  line: '#ECE9E1',
  orange: '#D9822B',
  gold: '#B8892B',
  /** 青や色付きの面の上に載せる文字・アイコン(常に白) */
  white: '#FFFFFF',
  scrim: 'rgba(20,24,43,0.45)',
  toast: '#14182B',
  ringBorder: '#C9C6BD',
  switchOff: '#D5D3CB',
  lockedFg: '#BDBAB1',
  lockedFill: '#F1EFEA',
  levelBanner: '#FBEFDD',
};

const dark: typeof light = {
  bg: '#0F1118',
  card: '#1A1D28',
  ink: '#ECEEF4',
  inkSoft: '#A0A6B6',
  inkFaint: '#6B7183',
  blue: '#4F7BF5',
  blueDark: '#6E94FF',
  blueSoft: '#1D2744',
  blueBorder: '#2F3F6E',
  red: '#EF6A60',
  redSoft: '#3A1F1E',
  green: '#4DBE80',
  greenSoft: '#173024',
  beige: '#242836',
  track: '#2C3040',
  line: '#272B38',
  orange: '#E89440',
  gold: '#D9AE4A',
  white: '#FFFFFF',
  scrim: 'rgba(0,0,0,0.6)',
  toast: '#323749',
  ringBorder: '#454B5E',
  switchOff: '#3A3F50',
  lockedFg: '#4B5062',
  lockedFill: '#202431',
  levelBanner: '#3A2D1A',
};

export type Palette = typeof light;
export type Scheme = 'light' | 'dark';

/** 現在の配色。ThemeProvider が切り替え、画面ツリーは作り直される(読み取りは描画時) */
export const colors: Palette = { ...light };
let currentScheme: Scheme = 'light';
let version = 0;

export function setScheme(scheme: Scheme): void {
  if (scheme === currentScheme) return;
  currentScheme = scheme;
  Object.assign(colors, scheme === 'dark' ? dark : light);
  version += 1;
}
export const getScheme = (): Scheme => currentScheme;

/**
 * 配色に依存するスタイル。`StyleSheet.create` の代わりに `themed(() => StyleSheet.create({...}))` と書く。
 * 配色が変わったあとの最初のアクセスで作り直す
 */
export function themed<T extends object>(make: () => T): T {
  let cache: T | null = null;
  let builtAt = -1;
  const get = (): T => {
    if (!cache || builtAt !== version) {
      cache = make();
      builtAt = version;
    }
    return cache;
  };
  return new Proxy({} as T, {
    get: (_t, key) => (get() as Record<PropertyKey, unknown>)[key],
    has: (_t, key) => key in get(),
    ownKeys: () => Reflect.ownKeys(get()),
    getOwnPropertyDescriptor: (_t, key) => (key in get() ? { enumerable: true, configurable: true, value: (get() as Record<PropertyKey, unknown>)[key] } : undefined),
  });
}

export const fonts = {
  /** 見出し(明朝体) */
  serif: 'ShipporiMincho_700Bold',
  serifMedium: 'ShipporiMincho_500Medium',
  /** 本文(ゴシック) */
  body: 'NotoSansJP_500Medium',
  bold: 'NotoSansJP_700Bold',
  /** 数字・時計(幾何学的なサンセリフ) */
  num: 'DMSans_700Bold',
  numMedium: 'DMSans_500Medium',
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

export const shadow = {
  card: {
    shadowColor: '#1B2240',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
} as const;

/** 下部ナビの高さ(コンテンツの下余白に使う) */
export const NAV_HEIGHT = 68;
