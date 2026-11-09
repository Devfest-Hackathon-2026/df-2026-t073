import React from 'react';
import Svg, { Defs, Mask, Path, Rect } from 'react-native-svg';
import { colors, fontSizes } from '../styles/tokens';

// The front card, tilted left; shared by the drawing and the mask.
const FRONT = {
  x: 4,
  y: 6.5,
  width: 11,
  height: 15,
  rx: 2,
  transform: 'rotate(-10 9.5 14)',
};

/**
 * The Tango mark: two word cards, the front one tilted left with two lines
 * of text, the back one tilted right. Drawn like the Lucide icons (24-unit
 * box, round line ends) so it sits beside them.
 */
export function TangoCard({
  size = fontSizes.lg,
  color = colors.text,
  strokeWidth = 2,
  fill = 'none',
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
}): React.JSX.Element {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Defs>
        {/* Hides the back card behind the front one, with a small gap. */}
        <Mask
          id="tango-back"
          maskUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={24}
          height={24}
        >
          <Rect x={0} y={0} width={24} height={24} fill="white" stroke="none" />
          <Rect {...FRONT} fill="black" stroke="black" strokeWidth={4} />
        </Mask>
      </Defs>
      <Rect
        x={9}
        y={2.5}
        width={11}
        height={15}
        rx={2}
        transform="rotate(12 14.5 10)"
        mask="url(#tango-back)"
      />
      <Rect {...FRONT} fill={fill} />
      <Path d="M6.75 14.5h5.5M6.75 17.5h3.5" transform={FRONT.transform} />
    </Svg>
  );
}
