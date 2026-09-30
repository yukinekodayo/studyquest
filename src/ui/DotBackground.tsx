import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { colors } from './theme';

/** PDFのクリーム地のドット柄 */
export function DotBackground() {
  return (
    <Svg width="100%" height="100%" style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
      <Defs>
        <Pattern id="dots" width={18} height={18} patternUnits="userSpaceOnUse">
          <Circle cx={2} cy={2} r={1.1} fill={colors.dot} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={colors.bg} />
      <Rect width="100%" height="100%" fill="url(#dots)" />
    </Svg>
  );
}
