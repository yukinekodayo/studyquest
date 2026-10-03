import Svg, { Circle, Polygon, Text as SvgText } from 'react-native-svg';
import { STAMP_META, type StampType } from '@/domain/stamps';
import { colors, fonts, getScheme } from './theme';

interface StampProps {
  type: StampType;
  size?: number;
  /** 未獲得(グレー表示) */
  locked?: boolean;
  /** 中央の文字を上書き(タスクの頭文字など) */
  mark?: string;
  showSub?: boolean;
}

const SCALLOPED: StampType[] = ['green', 'gold', 'special'];
const TINT: Record<StampType, string> = { normal: '#FDEEEC', blue: '#E8EEFC', green: '#EAF5EE', gold: '#FBF3DE', special: '#EFEAFA', team: '#EAF0F6' };
const TINT_DARK: Record<StampType, string> = { normal: '#3A2124', blue: '#1F2A4A', green: '#1B3326', gold: '#383018', special: '#2D274A', team: '#222E3E' };

function scallopPoints(cx: number, cy: number, r: number, bumps: number, amp: number): string {
  const pts: string[] = [];
  const steps = bumps * 12;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r + amp * Math.cos(a * bumps);
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}
const SCALLOP = scallopPoints(50, 50, 43, 16, 2.4);

/** 「済」「7日連続」などのハンコ(明朝体の「済」+ 二重の輪)。すべてSVG描画 */
export function Stamp({ type, size = 64, locked = false, mark, showSub = true }: StampProps) {
  const meta = STAMP_META[type];
  const dark = getScheme() === 'dark';
  const color = locked ? colors.lockedFg : meta.color;
  const fill = locked ? colors.lockedFill : (dark ? TINT_DARK : TINT)[type];
  const text = mark ?? meta.mark;
  const isKanji = type === 'normal' || type === 'team' || mark !== undefined;
  const hasSub = showSub && !!meta.sub && mark === undefined && !isKanji;
  const numSize = text.length >= 3 ? 30 : text.length === 2 ? 38 : 46;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel={`${meta.name}ハンコ${locked ? '(未獲得)' : ''}`}>
      {SCALLOPED.includes(type) ? (
        <>
          <Polygon points={SCALLOP} fill={fill} stroke={color} strokeWidth={2} strokeLinejoin="round" />
          <Circle cx={50} cy={50} r={35} fill="none" stroke={color} strokeWidth={1} />
        </>
      ) : (
        <>
          <Circle cx={50} cy={50} r={46} fill={fill} stroke={color} strokeWidth={3.2} />
          <Circle cx={50} cy={50} r={39} fill="none" stroke={color} strokeWidth={1.2} />
        </>
      )}
      {isKanji ? (
        <SvgText x={50} y={mark ? 66 : 67} fontSize={mark ? 46 : 52} fontFamily={fonts.serif} fill={color} textAnchor="middle">
          {text}
        </SvgText>
      ) : (
        <>
          <SvgText x={50} y={hasSub ? 59 : 64} fontSize={numSize} fontFamily={fonts.num} fill={color} textAnchor="middle">
            {text}
          </SvgText>
          {hasSub ? (
            <SvgText x={50} y={76} fontSize={11} fontFamily={fonts.bold} fill={color} textAnchor="middle">
              {meta.sub}
            </SvgText>
          ) : null}
        </>
      )}
    </Svg>
  );
}

/** まだ押されていない枠(薄い円) */
export function EmptyStamp({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="未達成">
      <Circle cx={50} cy={50} r={44} fill="none" stroke={colors.track} strokeWidth={3} />
    </Svg>
  );
}

/** 達成したけどまだ押していない日(タップで押せる)。点線の青い輪 */
export function PendingStamp({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="ハンコを押せる">
      <Circle cx={50} cy={50} r={44} fill={colors.blueSoft} stroke={colors.blue} strokeWidth={3.5} strokeDasharray="8 7" />
      <SvgText x={50} y={61} fontSize={30} fontFamily={fonts.serif} fill={colors.blue} textAnchor="middle">押</SvgText>
    </Svg>
  );
}
