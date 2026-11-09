import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef, type ComponentRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { ICONS, iconSvg } from '@/lib/icons';

import { TORONTO, type MapMarker, type TransitMapProps } from './types';

/** Web map: Leaflet + OpenStreetMap tiles (same look as the original web app). */
export default function TransitMap({ lines = [], markers = [], fit, fitKey, onLongPress, onViewChange, style }: TransitMapProps) {
  const host = useRef<ComponentRef<typeof View>>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const longPress = useRef(onLongPress);
  useEffect(() => { longPress.current = onLongPress; }, [onLongPress]);
  const viewChange = useRef(onViewChange);
  useEffect(() => { viewChange.current = onViewChange; }, [onViewChange]);

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
    const report = () => {
      const b = m.getBounds();
      viewChange.current?.({ minLat: b.getSouth(), maxLat: b.getNorth(), minLon: b.getWest(), maxLon: b.getEast(), zoom: m.getZoom() });
    };
    m.on('moveend', report);
    setTimeout(report, 0);
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
      const mk = L.marker([m.lat, m.lon], { icon: markerIcon(m), keyboard: false });
      if (m.title) mk.bindTooltip(m.title.replace(/[<>&]/g, ''), { direction: 'top', offset: [0, m.style === 'pin' ? -34 : -12] });
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

const esc = (t: string) => t.replace(/[<>&"]/g, '');

/** Same look as marker-view.tsx: round badge with a white icon (and label), or a map pin for trip start/end. */
function markerIcon(m: MapMarker): L.DivIcon {
  if (m.style === 'pin') {
    const html = `<div style="position:relative;width:38px;height:38px;filter:drop-shadow(0 1px 2px rgb(0 0 0/.35))">`
      + `<svg width="38" height="38" viewBox="0 0 24 24"><path fill="${esc(m.color)}" d="${ICONS.pin}"/></svg>`
      + `<div style="position:absolute;top:6px;left:9px;width:20px;height:20px;display:grid;place-items:center">${iconSvg(m.icon, '#fff', 14)}</div></div>`;
    return L.divIcon({ className: '', html, iconSize: [38, 38], iconAnchor: [19, 38] });
  }
  const size = m.size ?? 24;
  const icon = iconSvg(m.icon, '#fff', Math.round(size * 0.62));
  const label = m.label ? `<span style="font:700 11px/1 system-ui,sans-serif;color:#fff;padding-right:1px">${esc(m.label)}</span>` : '';
  const html = `<div style="display:inline-flex;align-items:center;justify-content:center;gap:2px;height:${size}px;min-width:${size}px;box-sizing:border-box;`
    + `padding:0 ${m.label ? 5 : 0}px;border-radius:${size / 2}px;background:${esc(m.color)};border:2px solid #fff;box-shadow:0 1px 3px rgb(0 0 0/.35);`
    + `transform:translate(-50%,-50%);white-space:nowrap">${icon}${label}</div>`;
  // zero-size anchor at the spot; the badge centres itself on it, whatever its width
  return L.divIcon({ className: '', html, iconSize: [0, 0] });
}
