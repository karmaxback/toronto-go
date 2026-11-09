import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef, type ComponentRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { TORONTO, type TransitMapProps } from './types';

/** Web map: Leaflet + OpenStreetMap tiles (same look as the original web app). */
export default function TransitMap({ lines = [], markers = [], fit, fitKey, onLongPress, style }: TransitMapProps) {
  const host = useRef<ComponentRef<typeof View>>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const longPress = useRef(onLongPress);
  useEffect(() => { longPress.current = onLongPress; }, [onLongPress]);

  // create the map once
  useEffect(() => {
    const el = host.current as unknown as HTMLElement | null;
    if (!el || map.current) return;
    const m = L.map(el, { zoomControl: false }).setView(TORONTO, 12);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('contextmenu', (e: L.LeafletMouseEvent) => longPress.current?.(e.latlng.lat, e.latlng.lng));
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el);
    map.current = m;
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);

  // redraw lines + markers
  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    for (const l of lines) {
      if (!l.dashed) L.polyline(l.points, { color: '#fff', weight: (l.width ?? 5) + 3, opacity: 0.9 }).addTo(g);
      L.polyline(l.points, { color: l.color, weight: l.width ?? 5, dashArray: l.dashed ? '2 8' : undefined, lineCap: 'round' }).addTo(g);
    }
    for (const m of markers) {
      const size = m.size ?? (m.label ? 22 : 14);
      const radius = m.shape === 'square' ? '4px' : '50%';
      const html = `<div style="width:${size}px;height:${size}px;border-radius:${radius};background:${m.color};border:2px solid #fff;box-shadow:0 1px 3px rgb(0 0 0/.35);display:grid;place-items:center;color:#fff;font:700 10px/1 system-ui,sans-serif">${m.label ?? ''}</div>`;
      const mk = L.marker([m.lat, m.lon], { icon: L.divIcon({ className: '', html, iconSize: [size, size] }), keyboard: false });
      if (m.title) mk.bindTooltip(m.title.replace(/[<>&]/g, ''));
      mk.addTo(g);
    }
  }, [lines, markers]);

  // zoom to the requested points
  useEffect(() => {
    const m = map.current;
    if (!m || !fit?.length) return;
    if (fit.length === 1) m.setView(fit[0], Math.max(m.getZoom(), 15));
    else m.fitBounds(L.latLngBounds(fit), { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return <View ref={host} style={[StyleSheet.absoluteFill, style]} />;
}
