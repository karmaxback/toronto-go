import { ICONS, type IconName } from '@/lib/icons';

/** Website: a plain browser <svg> (react-native-svg's web version adds attributes browsers reject). */
export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ flexShrink: 0, pointerEvents: 'none', display: 'block' }}>
      <path d={ICONS[name]} fill={color} />
    </svg>
  );
}
