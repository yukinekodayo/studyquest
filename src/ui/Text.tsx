import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { colors, fonts, themed } from './theme';

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'bodyBold' | 'caption' | 'label' | 'num' | 'numMedium';

const variants = themed((): Record<TextVariant, TextStyle> => ({
  /** ページ見出し(明朝体) */
  display: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 40, color: colors.ink },
  title: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 30, color: colors.ink },
  heading: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 23, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.ink },
  bodyBold: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 22, color: colors.ink },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.inkSoft },
  label: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 17, color: colors.inkSoft },
  num: { fontFamily: fonts.num, fontSize: 28, lineHeight: 34, color: colors.ink },
  numMedium: { fontFamily: fonts.numMedium, fontSize: 20, lineHeight: 26, color: colors.ink },
}));

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  size?: number;
  align?: TextStyle['textAlign'];
  /** 見出し以外で明朝体を使いたいとき */
  serif?: boolean;
}

export function Text({ variant = 'body', color, size, align, serif, style, ...rest }: AppTextProps) {
  return (
    <RNText
      {...rest}
      style={[
        variants[variant],
        serif ? { fontFamily: fonts.serif } : null,
        color ? { color } : null,
        size ? { fontSize: size, lineHeight: Math.round(size * (variant === 'num' || variant === 'numMedium' ? 1.2 : 1.45)) } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
