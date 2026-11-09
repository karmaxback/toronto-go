import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { TORONTO, type TransitMapProps } from './types';

/** iOS (Apple Maps) and Android (Google Maps) via react-native-maps. Web uses transit-map.web.tsx. */
export default function TransitMap({ lines = [], markers = [], fit, fitKey, onLongPress, style }: TransitMapProps) {
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
      onLongPress={(e) => onLongPress?.(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}>
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
      {markers.map((m) => {
        const size = m.size ?? (m.label ? 22 : 14);
        return (
          <Marker key={m.id} coordinate={{ latitude: m.lat, longitude: m.lon }} title={m.title} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View
              style={[
                styles.pin,
                { width: size, height: size, backgroundColor: m.color, borderRadius: m.shape === 'square' ? 4 : size / 2 },
              ]}>
              {m.label ? <Text style={styles.pinText}>{m.label}</Text> : null}
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: { borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pinText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
