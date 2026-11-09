import type { StyleProp, ViewStyle } from 'react-native';

import type { IconName } from '@/lib/icons';

export type LatLon = [number, number];

export type MapLine = { id: string; points: LatLon[]; color: string; width?: number; dashed?: boolean };
export type MapMarker = {
  id: string;
  lat: number;
  lon: number;
  color: string;
  /** vehicle / bike / place icon drawn in white on `color` */
  icon: IconName;
  /** short text next to the icon (route number, bike count) */
  label?: string;
  title?: string;
  /** 'badge': round icon centred on the spot. 'pin': map pin whose tip touches the spot (trip start/end). */
  style?: 'badge' | 'pin';
  /** badge height in px (default 24) */
  size?: number;
};

export type MapViewport = { minLat: number; minLon: number; maxLat: number; maxLon: number; zoom: number };

export type TransitMapProps = {
  lines?: MapLine[];
  markers?: MapMarker[];
  /** points to zoom to; the map refits whenever fitKey changes */
  fit?: LatLon[];
  fitKey?: string;
  onLongPress?: (lat: number, lon: number) => void;
  /** called after the user pans/zooms (and once at start) with the visible area */
  onViewChange?: (v: MapViewport) => void;
  style?: StyleProp<ViewStyle>;
};

export const TORONTO: LatLon = [43.6532, -79.3832];
