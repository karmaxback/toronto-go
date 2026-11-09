import Svg, { Path } from 'react-native-svg';

import { ICONS, type IconName } from '@/lib/icons';

/** Vector icon (Material Design Icons), same look on iPhone, Android and web. */
export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      <Path d={ICONS[name]} fill={color} />
    </Svg>
  );
}
