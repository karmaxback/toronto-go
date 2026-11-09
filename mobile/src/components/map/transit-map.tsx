import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { MarkerView } from './marker-view';
import { TORONTO, type MapMarker, type TransitMapProps } from './types';

/** iOS (Apple Maps) and Android (Google Maps) via react-native-maps. Web uses transit-map.web.tsx. */
export default function TransitMap({ lines = [], markers = [], fit, fitKey, onLongPress, onViewChange, style }: TransitMapProps) {
  const ref = useRef<MapView>(null);

  useEffect(() => {
    if (!fit?.length || !ref.current) return;
    if (fit.length === 1) {
      ref.current.animateToRegion({ latitude: fit[0][0], longitude: fit[0][1], latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
    } else {
      ref.current.fitToCoordinates(fit.map(([latitude, longitude]) => ({ latitude, longitude })), {
        edgePadding: { top: 50, right: 40, bottom: 50, left: 40 },
        animated: true,
      });
    }
    // fitKey says when to refit; fit itself is a new array every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return (
    <MapView
      ref={ref}
      style={[StyleSheet.absoluteFill, style]}
      initialRegion={{ latitude: TORONTO[0], longitude: TORONTO[1], latitudeDelta: 0.12, longitudeDelta: 0.12 }}
      showsUserLocation
      showsCompass={false}
      toolbarEnabled={false}
      onLongPress={(e) => onLongPress?.(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
      onRegionChangeComplete={(r) => onViewChange?.({
        minLat: r.latitude - r.latitudeDelta / 2, maxLat: r.latitude + r.latitudeDelta / 2,
        minLon: r.longitude - r.longitudeDelta / 2, maxLon: r.longitude + r.longitudeDelta / 2,
        zoom: Math.log2(360 / Math.max(r.longitudeDelta, 1e-6)),
      })}>
      {lines.map((l) => (
        <Polyline
          key={l.id}
          coordinates={l.points.map(([latitude, longitude]) => ({ latitude, longitude }))}
          strokeColor={l.color}
          strokeWidth={l.width ?? 5}
          lineDashPattern={l.dashed ? [2, 8] : undefined}
          lineCap="round"
        />
      ))}
      {markers.map((m) => <MapPin key={`${m.id}|${m.icon}|${m.label ?? ''}|${m.color}`} m={m} />)}
    </MapView>
  );
}

/**
 * Custom marker views are drawn once and then frozen (tracksViewChanges off) so hundreds of live vehicles stay smooth.
 * The icon is SVG, which needs a moment to draw first, so tracking stays on for the first half second.
 */
function MapPin({ m }: { m: MapMarker }) {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTracking(false), 500);
    return () => clearTimeout(t);
  }, []);
  return (
    <Marker coordinate={{ latitude: m.lat, longitude: m.lon }} title={m.title}
      anchor={m.style === 'pin' ? { x: 0.5, y: 1 } : { x: 0.5, y: 0.5 }} tracksViewChanges={tracking}>
      <MarkerView m={m} />
    </Marker>
  );
}
