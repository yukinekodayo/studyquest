import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { colors, fonts } from './theme';

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'bodyBold' | 'caption' | 'label' | 'num';

const variants: Record<TextVariant, TextStyle> = {
  display: { fontFamily: fonts.display, fontSize: 30, lineHeight: 38, color: colors.ink },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 32, color: colors.ink },
  heading: { fontFamily: fonts.black, fontSize: 17, lineHeight: 24, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.ink },
  bodyBold: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 22, color: colors.ink },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.inkSoft },
  label: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  num: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.ink },
};

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  size?: number;
  align?: TextStyle['textAlign'];
}

export function Text({ variant = 'body', color, size, align, style, ...rest }: AppTextProps) {
  return (
    <RNText
      {...rest}
      style={[
        variants[variant],
        color ? { color } : null,
        size ? { fontSize: size, lineHeight: Math.round(size * 1.4) } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
