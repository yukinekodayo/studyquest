/** 落ち着いたトーン: 温かいグレー地 + 濃い青 + 朱色のハンコ。見出しは明朝体 */
export const colors = {
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
  white: '#FFFFFF',
} as const;

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
