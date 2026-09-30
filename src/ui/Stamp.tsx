import Svg, { Circle, Polygon, Text as SvgText } from 'react-native-svg';
import { STAMP_META, type StampType } from '@/domain/stamps';
import { fonts } from './theme';

interface StampProps {
  type: StampType;
  size?: number;
  /** 未獲得(グレー表示) */
  locked?: boolean;
  /** 中央の文字を上書き(タスクのハンコに「英」など) */
  mark?: string;
  showSub?: boolean;
}

const SCALLOPED: StampType[] = ['green', 'gold', 'special'];

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
const SCALLOP = scallopPoints(50, 50, 42, 14, 3.5);

/** 「済」「7日連続」などのハンコ。すべてSVGで描画(画像アセット不要) */
export function Stamp({ type, size = 64, locked = false, mark, showSub = true }: StampProps) {
  const meta = STAMP_META[type];
  const color = locked ? '#B4BCCD' : meta.color;
  const text = mark ?? meta.mark;
  const fill = locked ? '#F3F5F9' : type === 'normal' ? '#FFF7F7' : '#FFFFFF';
  const hasSub = showSub && !!meta.sub && mark === undefined;
  const fontSize = text.length >= 3 ? 27 : text.length === 2 ? 34 : hasSub ? 40 : 46;
  const textY = hasSub ? 58 : 65;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel={`${meta.name}ハンコ${locked ? '(未獲得)' : ''}`}>
      {SCALLOPED.includes(type) ? (
        <>
          <Polygon points={SCALLOP} fill={locked ? '#F3F5F9' : type === 'green' ? '#EAF7EF' : type === 'gold' ? '#FFF6D9' : '#F1EAFD'} stroke={color} strokeWidth={3.5} strokeLinejoin="round" strokeDasharray={locked ? '5 4' : undefined} />
          <Circle cx={50} cy={50} r={33} fill="none" stroke={color} strokeWidth={1.4} strokeDasharray="2 3" />
        </>
      ) : (
        <>
          <Circle cx={50} cy={50} r={45} fill={fill} stroke={color} strokeWidth={4} strokeDasharray={locked ? '6 5' : undefined} />
          <Circle cx={50} cy={50} r={37} fill="none" stroke={color} strokeWidth={1.4} strokeDasharray={type === 'blue' ? '2 3' : undefined} />
        </>
      )}
      <SvgText x={50} y={textY} fontSize={fontSize} fontFamily={fonts.display} fill={color} textAnchor="middle">
        {text}
      </SvgText>
      {hasSub ? (
        <SvgText x={50} y={76} fontSize={11} fontFamily={fonts.bold} fill={color} textAnchor="middle">
          {meta.sub}
        </SvgText>
      ) : null}
    </Svg>
  );
}

/** まだ押されていない枠(点線の丸) */
export function EmptyStamp({ size = 40, label }: { size?: number; label?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="未達成">
      <Circle cx={50} cy={50} r={44} fill="none" stroke="#C9CFDC" strokeWidth={4} strokeDasharray="9 7" />
      {label ? (
        <SvgText x={50} y={64} fontSize={40} fontFamily={fonts.display} fill="#9AA3B8" textAnchor="middle">
          {label}
        </SvgText>
      ) : null}
    </Svg>
  );
}


/** 達成したけどまだ押していない日(タップで押せる) */
export function PendingStamp({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="ハンコを押せる">
      <Circle cx={50} cy={50} r={44} fill="#E3ECFC" stroke="#2F6FE0" strokeWidth={4} strokeDasharray="9 7" />
      <SvgText x={50} y={62} fontSize={34} fontFamily={fonts.display} fill="#2F6FE0" textAnchor="middle">押す</SvgText>
    </Svg>
  );
}
