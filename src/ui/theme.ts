/** デザインPDFに合わせたテーマ: クリーム地 + 青がメイン + 赤いハンコ */
export const colors = {
  bg: '#FBF6EA',
  dot: '#EBE1C8',
  card: '#FFFFFF',
  ink: '#1B2A5C',
  inkSoft: '#5B6787',
  inkFaint: '#9AA3B8',
  blue: '#2F6FE0',
  blueDark: '#1F54B8',
  blueSoft: '#E3ECFC',
  blueBorder: '#C5D5F4',
  red: '#D8323A',
  redSoft: '#FDE9E9',
  green: '#2E9E5B',
  greenSoft: '#E1F3E8',
  yellow: '#FBE58A',
  yellowSoft: '#FFF3C9',
  yellowBorder: '#E6CB72',
  purpleSoft: '#ECE5FA',
  beige: '#F0E8D6',
  line: '#E8E0CC',
  orange: '#F2A93B',
  gold: '#D9A21B',
  white: '#FFFFFF',
} as const;

export const fonts = {
  display: 'DelaGothicOne_400Regular',
  body: 'ZenMaruGothic_500Medium',
  bold: 'ZenMaruGothic_700Bold',
  black: 'ZenMaruGothic_900Black',
} as const;

export const radius = { sm: 12, md: 16, lg: 22, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

export const shadow = {
  card: {
    shadowColor: '#7A6A3A',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
} as const;

/** 下部ナビの高さ(コンテンツの下余白に使う) */
export const NAV_HEIGHT = 76;
