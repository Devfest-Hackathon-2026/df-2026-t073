import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, fontSizes } from '../styles/tokens';

const PETALS = 8;

/**
 * 花丸 (hanamaru): the flower-circle Japanese teachers draw on excellent work.
 * Marks a mastered Tango (where other apps would use a star).
 */
export function Hanamaru({
  size = fontSizes.lg,
  color = colors.hanamaru,
}: {
  size?: number;
  color?: string;
}): React.JSX.Element {
  // A spiral in the middle, ringed by scalloped petals.
  const petals = Array.from({ length: PETALS }, (_, i) => {
    const a = (i / PETALS) * Math.PI * 2;
    const b = ((i + 1) / PETALS) * Math.PI * 2;
    const mid = (a + b) / 2;
    const r = 9;
    const bulge = 12;
    const x1 = 12 + r * Math.cos(a);
    const y1 = 12 + r * Math.sin(a);
    const x2 = 12 + r * Math.cos(b);
    const y2 = 12 + r * Math.sin(b);
    const cx = 12 + bulge * Math.cos(mid);
    const cy = 12 + bulge * Math.sin(mid);
    return `${i === 0 ? `M${x1.toFixed(2)} ${y1.toFixed(2)}` : ''} Q${cx.toFixed(
      2,
    )} ${cy.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }).join(' ');
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={petals} fill="none" stroke={color} strokeWidth={1.6} />
      <Path
        d="M12 12 m-1 0 a1 1 0 1 1 2 0 a2.4 2.4 0 1 1 -4.4 0 a3.8 3.8 0 1 1 7.6 0"
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Circle cx={12} cy={12} r={0.6} fill={color} />
    </Svg>
  );
}
