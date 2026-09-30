import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect } from 'react-native-svg';
import type { AvatarKey } from '@/domain/validation';

const LINE = '#27335F';

const BG: Record<AvatarKey, string> = {
  cat: '#DCE8FB',
  frog: '#D7EEDB',
  panda: '#DDE6F3',
  rabbit: '#FBDDE6',
  shiba: '#FCEBC2',
  bear: '#F3E2CF',
  penguin: '#DCE8FB',
  fox: '#FDE3CC',
};

const eye = (cx: number, cy: number, r = 3.4) => <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={LINE} />;

function Face({ animal }: { animal: AvatarKey }) {
  const sw = 2.6;
  switch (animal) {
    case 'cat':
      return (
        <G stroke={LINE} strokeWidth={sw} strokeLinejoin="round">
          <Polygon points="24,44 27,14 47,32" fill="#fff" />
          <Polygon points="76,44 73,14 53,32" fill="#fff" />
          <Polygon points="29,38 30,22 41,32" fill="#9DBBF3" stroke="none" />
          <Polygon points="71,38 70,22 59,32" fill="#9DBBF3" stroke="none" />
          <Ellipse cx={50} cy={58} rx={32} ry={27} fill="#fff" />
          <Circle cx={36} cy={54} r={10} fill="#5C8DEB" stroke="none" />
          {eye(36, 55)}
          {eye(64, 55)}
          <Polygon points="46,63 54,63 50,68" fill="#F49BB0" stroke="none" />
          <Path d="M50 68 Q44 74 39 70 M50 68 Q56 74 61 70" fill="none" strokeLinecap="round" />
        </G>
      );
    case 'frog':
      return (
        <G stroke={LINE} strokeWidth={sw} strokeLinejoin="round">
          <Ellipse cx={50} cy={62} rx={35} ry={25} fill="#77C36F" />
          <Circle cx={31} cy={38} r={14} fill="#77C36F" />
          <Circle cx={69} cy={38} r={14} fill="#77C36F" />
          <Circle cx={31} cy={38} r={9} fill="#fff" />
          <Circle cx={69} cy={38} r={9} fill="#fff" />
          {eye(32, 39, 4.5)}
          {eye(68, 39, 4.5)}
          <Ellipse cx={26} cy={66} rx={6} ry={4} fill="#F9A8B8" stroke="none" />
          <Ellipse cx={74} cy={66} rx={6} ry={4} fill="#F9A8B8" stroke="none" />
          <Path d="M38 66 Q50 76 62 66" fill="none" strokeLinecap="round" />
        </G>
      );
    case 'panda':
      return (
        <G stroke={LINE} strokeWidth={sw} strokeLinejoin="round">
          <Circle cx={25} cy={30} r={12} fill={LINE} />
          <Circle cx={75} cy={30} r={12} fill={LINE} />
          <Circle cx={50} cy={56} r={33} fill="#fff" />
          <Ellipse cx={36} cy={52} rx={9} ry={12} fill={LINE} transform="rotate(20 36 52)" />
          <Ellipse cx={64} cy={52} rx={9} ry={12} fill={LINE} transform="rotate(-20 64 52)" />
          <Circle cx={37} cy={52} r={3.2} fill="#fff" stroke="none" />
          <Circle cx={63} cy={52} r={3.2} fill="#fff" stroke="none" />
          <Ellipse cx={50} cy={66} rx={5.5} ry={4} fill={LINE} />
          <Path d="M50 70 Q45 76 40 73 M50 70 Q55 76 60 73" fill="none" strokeLinecap="round" />
        </G>
      );
    case 'rabbit':
      return (
        <G stroke={LINE} strokeWidth={sw} strokeLinejoin="round">
          <Ellipse cx={36} cy={26} rx={9} ry={22} fill="#fff" />
          <Ellipse cx={64} cy={26} rx={9} ry={22} fill="#fff" />
          <Ellipse cx={36} cy={28} rx={4.5} ry={15} fill="#F9B4C6" stroke="none" />
          <Ellipse cx={64} cy={28} rx={4.5} ry={15} fill="#F9B4C6" stroke="none" />
          <Ellipse cx={50} cy={64} rx={31} ry={25} fill="#fff" />
          {eye(38, 62)}
          {eye(62, 62)}
          <Ellipse cx={29} cy={70} rx={6} ry={4} fill="#F9B4C6" stroke="none" />
          <Ellipse cx={71} cy={70} rx={6} ry={4} fill="#F9B4C6" stroke="none" />
          <Polygon points="46,68 54,68 50,72" fill="#F49BB0" stroke="none" />
          <Path d="M50 72 Q45 78 41 75 M50 72 Q55 78 59 75" fill="none" strokeLinecap="round" />
        </G>
      );
    case 'shiba':
      return (
        <G stroke={LINE} strokeWidth={sw} strokeLinejoin="round">
          <Polygon points="20,46 22,14 46,30" fill="#F2A23D" />
          <Polygon points="80,46 78,14 54,30" fill="#F2A23D" />
          <Ellipse cx={50} cy={58} rx={33} ry={28} fill="#F2A23D" />
          <Ellipse cx={34} cy={68} rx={16} ry={13} fill="#fff" stroke="none" />
          <Ellipse cx={66} cy={68} rx={16} ry={13} fill="#fff" stroke="none" />
          <Ellipse cx={50} cy={70} rx={12} ry={10} fill="#fff" stroke="none" />
          {eye(37, 52)}
          {eye(63, 52)}
          <Ellipse cx={50} cy={64} rx={5} ry={3.6} fill={LINE} />
          <Path d="M50 68 Q44 75 39 72 M50 68 Q56 75 61 72" fill="none" strokeLinecap="round" />
        </G>
      );
    case 'bear':
      return (
        <G stroke={LINE} strokeWidth={sw} strokeLinejoin="round">
          <Circle cx={26} cy={30} r={12} fill="#B7855A" />
          <Circle cx={74} cy={30} r={12} fill="#B7855A" />
          <Circle cx={26} cy={30} r={6} fill="#E4C09B" stroke="none" />
          <Circle cx={74} cy={30} r={6} fill="#E4C09B" stroke="none" />
          <Circle cx={50} cy={56} r={33} fill="#B7855A" />
          <Ellipse cx={50} cy={67} rx={15} ry={12} fill="#E4C09B" />
          {eye(37, 50)}
          {eye(63, 50)}
          <Ellipse cx={50} cy={62} rx={5} ry={3.6} fill={LINE} />
          <Path d="M50 66 Q45 72 41 70 M50 66 Q55 72 59 70" fill="none" strokeLinecap="round" />
        </G>
      );
    case 'penguin':
      return (
        <G stroke={LINE} strokeWidth={sw} strokeLinejoin="round">
          <Ellipse cx={50} cy={56} rx={31} ry={34} fill="#33437A" />
          <Ellipse cx={50} cy={62} rx={21} ry={25} fill="#fff" />
          <Circle cx={39} cy={44} r={7} fill="#fff" />
          <Circle cx={61} cy={44} r={7} fill="#fff" />
          {eye(40, 45, 3.4)}
          {eye(60, 45, 3.4)}
          <Polygon points="43,54 57,54 50,64" fill="#F5A742" />
          <Ellipse cx={30} cy={62} rx={4} ry={3} fill="#F9A8B8" stroke="none" />
          <Ellipse cx={70} cy={62} rx={4} ry={3} fill="#F9A8B8" stroke="none" />
        </G>
      );
    case 'fox':
      return (
        <G stroke={LINE} strokeWidth={sw} strokeLinejoin="round">
          <Polygon points="20,48 20,12 46,32" fill="#F08A3C" />
          <Polygon points="80,48 80,12 54,32" fill="#F08A3C" />
          <Polygon points="24,32 24,20 36,30" fill={LINE} stroke="none" />
          <Polygon points="76,32 76,20 64,30" fill={LINE} stroke="none" />
          <Path d="M17 52 Q50 20 83 52 Q80 88 50 90 Q20 88 17 52 Z" fill="#F08A3C" />
          <Path d="M17 60 Q35 62 50 80 Q65 62 83 60 Q78 88 50 90 Q22 88 17 60 Z" fill="#fff" stroke="none" />
          {eye(37, 56)}
          {eye(63, 56)}
          <Circle cx={50} cy={82} r={4.2} fill={LINE} />
        </G>
      );
  }
}

export function Avatar({ animal, size = 48, ring }: { animal: AvatarKey; size?: number; ring?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel={`${animal}のアイコン`}>
      <Circle cx={50} cy={50} r={50} fill={BG[animal]} />
      <Face animal={animal} />
      {ring ? <Circle cx={50} cy={50} r={48} fill="none" stroke={ring} strokeWidth={4} /> : null}
    </Svg>
  );
}

/** ホーム画面のマスコット(ハンコを持ったネコ) */
export function Mascot({ size = 84 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 1.1} viewBox="0 0 100 110" accessibilityLabel="マスコットのネコ">
      <G stroke={LINE} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round">
        <Ellipse cx={44} cy={88} rx={28} ry={18} fill="#fff" />
        <Ellipse cx={30} cy={102} rx={9} ry={5} fill="#fff" />
        <Ellipse cx={58} cy={102} rx={9} ry={5} fill="#fff" />
        <Polygon points="16,44 18,16 38,32" fill="#fff" />
        <Polygon points="72,44 70,16 50,32" fill="#fff" />
        <Polygon points="20,38 21,24 31,32" fill="#9DBBF3" stroke="none" />
        <Polygon points="68,38 67,24 57,32" fill="#9DBBF3" stroke="none" />
        <Ellipse cx={44} cy={54} rx={29} ry={24} fill="#fff" />
        <Circle cx={30} cy={50} r={9} fill="#5C8DEB" stroke="none" />
        <Path d="M25 52 Q30 47 35 52" fill="none" />
        <Path d="M53 52 Q58 47 63 52" fill="none" />
        <Polygon points="40,60 48,60 44,64" fill="#F49BB0" stroke="none" />
        <Path d="M44 64 Q40 69 36 66 M44 64 Q48 69 52 66" fill="none" />
        <Ellipse cx={26} cy={62} rx={4.5} ry={3} fill="#F9B4C6" stroke="none" />
        <Ellipse cx={62} cy={62} rx={4.5} ry={3} fill="#F9B4C6" stroke="none" />
        <Path d="M68 84 Q82 78 84 62" fill="none" strokeWidth={9} stroke="#fff" />
        <Path d="M68 84 Q82 78 84 62" fill="none" />
        <Rect x={80} y={34} width={9} height={22} rx={4} fill="#2F6FE0" />
        <Rect x={77} y={54} width={15} height={8} rx={3} fill="#D8323A" />
        <Line x1={84} y1={62} x2={84} y2={66} />
      </G>
    </Svg>
  );
}
