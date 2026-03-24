"use client";

import React, { useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import 'leaflet/dist/leaflet.css';
import { MapData } from './Dashboard';

// Fix for default marker icons in Leaflet + Next.js
const fixLeafletIcon = () => {
    // @ts-ignore
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    });
};

function MapResizer({ data, fileVersion, isSidebarVisible }: { data: MapData | null, fileVersion: number, isSidebarVisible: boolean }) {
    const map = useMap();
    useEffect(() => {
        if (data?.geojson) {
            const bounds = L.geoJSON(data.geojson).getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    }, [fileVersion]);

    useEffect(() => {
        // Force Leaflet to re-measure its container size when sidebar toggles
        setTimeout(() => map.invalidateSize(), 300);
    }, [isSidebarVisible]);

    return null;
}

interface MapProps {
    data: MapData | null;
    selectedPolyIds: string[];
    labelField: string;
    baseLayer: 'satellite' | 'dark';
    fileVersion: number;
    onSelect: (id: string) => void;
    labelScale: number;
    isSidebarVisible: boolean;
}

/**
 * Renders:
 *  - Main (khasra ID + area) labels at polygon centroid, with light collision avoidance
 *  - Dimension labels placed exactly on each edge midpoint, rotated to match the edge,
 *    nudged slightly outward from the centroid so they sit outside the border line
 */
function PolyLabels({ data, selectedPolyIds, labelField, labelScale }: {
    data: MapData | null,
    selectedPolyIds: string[],
    labelField: string,
    labelScale: number
}) {
    const map = useMap();
    const [markers, setMarkers] = React.useState<React.ReactNode[]>([]);

    const rebuild = React.useCallback(() => {
        if (!data || selectedPolyIds.length === 0) {
            setMarkers([]);
            return;
        }

        const selectedPolys = data.polygons.filter(p => selectedPolyIds.includes(p.id));
        const nodes: React.ReactNode[] = [];

        // ── Icon factories ─────────────────────────────────────────────────────

        // Main label: always centred; font-size scales with polygon pixel size
        const mainIcon = (text: string, fontSize: number) => {
            const pad = Math.max(1, fontSize * 0.35);
            return L.divIcon({
                className: 'dim-label-icon',
                html: `<div style="position:relative;width:0;height:0;overflow:visible;">
                    <span style="
                        position:absolute;
                        left:0;top:0;
                        transform:translate(-50%,-50%);
                        transform-origin:center center;
                        display:inline-block;
                        padding:${pad}px ${pad * 2.5}px;
                        background:rgba(220,38,38,0.92);
                        color:#fff;
                        font-weight:700;
                        font-size:${fontSize}px;
                        border-radius:${Math.max(2, fontSize * 0.35)}px;
                        box-shadow:0 0 ${fontSize}px rgba(220,38,38,0.5);
                        white-space:nowrap;
                        pointer-events:none;
                        backdrop-filter:blur(4px);
                    ">${text}</span></div>`,
                iconSize: L.point(0, 0),
                iconAnchor: L.point(0, 0),
            });
        };

        // Dimension label: zero-size wrapper div; span is first centered at (0,0)
        // via translate(-50%,-50%), THEN rotated — so the label always sits
        // flush and centered on the edge midpoint for any rotation angle.
        const dimIcon = (text: string, angleDeg: number) => L.divIcon({
            className: 'dim-label-icon',
            html: `<div style="position:relative;width:0;height:0;overflow:visible;">
                <span style="
                    position:absolute;
                    left:0;top:0;
                    transform:translate(-50%,-50%) rotate(${angleDeg}deg);
                    transform-origin:center center;
                    display:inline-block;
                    padding:1px 3px;
                    background:rgba(0,0,0,0.82);
                    border:1px solid rgba(255,255,255,0.18);
                    color:#e2e8f0;
                    font-size:${7 * labelScale}px;
                    font-weight:600;
                    border-radius:3px;
                    box-shadow:0 1px 4px rgba(0,0,0,0.5);
                    white-space:nowrap;
                    pointer-events:none;
                    backdrop-filter:blur(3px);
                ">${text}</span></div>`,
            iconSize: L.point(0, 0),
            iconAnchor: L.point(0, 0),
        });

        // Vertex dot: tiny circle centered on each polygon corner
        const vertexIcon = () => L.divIcon({
            className: 'dim-label-icon',
            html: `<div style="
                width:6px;height:6px;
                border-radius:50%;
                background:#ffffff;
                border:1.5px solid rgba(220,38,38,0.9);
                box-shadow:0 0 3px rgba(0,0,0,0.6);
                transform:translate(-50%,-50%);
                pointer-events:none;
            "></div>`,
            iconSize: L.point(0, 0),
            iconAnchor: L.point(0, 0),
        });

        // ── Vertex dots ───────────────────────────────────────────────────────────
        // One dot per unique corner; shared vertices deduplicated with ~1 m threshold.
        const VERTEX_DEDUP = 9e-6;
        const seenVerts: Array<{ lat: number; lng: number }> = [];
        for (const p of selectedPolys) {
            const coords = (p.feature.geometry.type === 'Polygon'
                ? p.feature.geometry.coordinates[0]
                : p.feature.geometry.coordinates[0][0]) as [number, number][];
            // coords[0] === coords[last] for closed rings — skip the duplicate last point
            const unique = coords.slice(0, -1);
            unique.forEach((c, vi) => {
                const lat = c[1], lng = c[0];
                if (seenVerts.some(s =>
                    Math.abs(s.lat - lat) < VERTEX_DEDUP && Math.abs(s.lng - lng) < VERTEX_DEDUP
                )) return;
                seenVerts.push({ lat, lng });
                nodes.push(
                    <Marker
                        key={`vert-${p.id}-${vi}`}
                        position={[lat, lng]}
                        icon={vertexIcon()}
                    />
                );
            });
        }

        // ════════════════════════════════════════════════════════════════════════
        // COLLISION-DETECTION LABEL PIPELINE
        // Priority: dimension labels (0) are placed FIRST — they are always
        // shown. Center labels (1) are placed after and yield if they would
        // overlap a dimension label.
        // ════════════════════════════════════════════════════════════════════════

        // ── Helpers ──────────────────────────────────────────────────────────────

        /** Axis-aligned bounding box of a rotated rectangle centred at (cx,cy). */
        type AABB = { x: number; y: number; w: number; h: number };
        function rotatedAABB(cx: number, cy: number, w: number, h: number, angleDeg: number): AABB {
            const rad = angleDeg * Math.PI / 180;
            const cos = Math.abs(Math.cos(rad));
            const sin = Math.abs(Math.sin(rad));
            const ew = w * cos + h * sin;
            const eh = w * sin + h * cos;
            return { x: cx - ew / 2, y: cy - eh / 2, w: ew, h: eh };
        }

        const GUTTER = 4; // extra px breathing room between labels
        function overlaps(a: AABB, b: AABB): boolean {
            return !(
                a.x + a.w + GUTTER < b.x ||
                b.x + b.w + GUTTER < a.x ||
                a.y + a.h + GUTTER < b.y ||
                b.y + b.h + GUTTER < a.y
            );
        }

        // Approximate rendered width of a label string (good enough for collision)
        const CHAR_W = 0.52; // fraction of font-size per character (tuned for small fonts)
        function estimateSize(text: string, fontSize: number, hPad: number, vPad: number) {
            return {
                w: text.length * fontSize * CHAR_W + hPad * 2,
                h: fontSize * 1.5 + vPad * 2,
            };
        }

        // ── Shared constants ──────────────────────────────────────────────────────
        const DEDUP_DEG = 9e-6;
        const MIN_PX = 38;   // lower threshold → more edges qualify at same zoom

        // ── Candidate type ────────────────────────────────────────────────────────
        type Candidate = {
            priority: number;       // 0 = dim (placed first), 1 = center (tries nudging)
            lat: number; lng: number;
            text: string; fontSize: number;
            angleDeg: number;
            hPad: number; vPad: number;
            feature?: any;          // set for center labels to enable polygon-aware nudging
            buildNode: (lat: number, lng: number) => React.ReactNode;
        };
        const candidates: Candidate[] = [];

        // ── Step A: Center labels ─────────────────────────────────────────────────
        for (const p of selectedPolys) {
            const coords = (p.feature.geometry.type === 'Polygon'
                ? p.feature.geometry.coordinates[0]
                : p.feature.geometry.coordinates[0][0]) as [number, number][];
            const pxPts = coords.map((c: [number, number]) =>
                map.latLngToLayerPoint([c[1], c[0]])
            );
            const pxW = Math.max(...pxPts.map(pt => pt.x)) - Math.min(...pxPts.map(pt => pt.x));
            const pxH = Math.max(...pxPts.map(pt => pt.y)) - Math.min(...pxPts.map(pt => pt.y));
            const polyPx = Math.min(pxW, pxH);
            if (polyPx < MIN_PX) continue;

            const baseFontSize = Math.round(Math.max(6, Math.min(9, polyPx * 0.045)));
            const fontSize = Math.round(baseFontSize * labelScale);
            const text = `${p.feature.properties[labelField] || ''} | ${p.stats?.label || ''}`;
            const pad = Math.max(1, fontSize * 0.25);

            let labelLat = p.center[0], labelLng = p.center[1];
            try {
                const inside = turf.pointOnFeature(p.feature);
                labelLat = inside.geometry.coordinates[1];
                labelLng = inside.geometry.coordinates[0];
            } catch (_) { }

            const pid = p.id;
            candidates.push({
                priority: 1,
                lat: labelLat, lng: labelLng,
                text, fontSize, angleDeg: 0,
                hPad: pad * 2, vPad: pad,
                feature: p.feature,
                buildNode: (lat: number, lng: number) => (
                    <Marker
                        key={`main-${pid}`}
                        position={[lat, lng]}
                        icon={mainIcon(text, fontSize)}
                    />
                ),
            });
        }

        // ── Step B: Dimension labels ──────────────────────────────────────────────
        const seenDimPts: Array<{ lat: number; lng: number }> = [];
        for (const p of selectedPolys) {
            (p.dimensions || []).forEach((d, i) => {
                const lat = d.point[1], lng = d.point[0];
                if (seenDimPts.some(s =>
                    Math.abs(s.lat - lat) < DEDUP_DEG && Math.abs(s.lng - lng) < DEDUP_DEG
                )) return;
                const px1 = map.latLngToLayerPoint([d.geoP1[1], d.geoP1[0]]);
                const px2 = map.latLngToLayerPoint([d.geoP2[1], d.geoP2[0]]);
                if (Math.hypot(px2.x - px1.x, px2.y - px1.y) < MIN_PX) return;

                seenDimPts.push({ lat, lng });
                const pid = p.id;
                const fontSize = 7 * labelScale;
                candidates.push({
                    priority: 0,
                    lat, lng,
                    text: d.label, fontSize, angleDeg: d.angleDeg ?? 0,
                    hPad: 3, vPad: 1,
                    buildNode: (lt: number, ln: number) => (
                        <Marker
                            key={`dim-${pid}-${i}`}
                            position={[lt, ln]}
                            icon={dimIcon(d.label, d.angleDeg ?? 0)}
                        />
                    ),
                });
            });
        }

        // ── Step C: Sort → greedy placement with nudging for center labels ────────
        candidates.sort((a, b) => a.priority - b.priority);

        // 9 directions × 4 nudge distances (px) tried in order for center labels
        const NUDGE_DIRS: [number, number][] = [
            [0, 0],
            [0, -1], [0, 1], [-1, 0], [1, 0],
            [-1, -1], [1, -1], [-1, 1], [1, 1],
        ];
        const NUDGE_STEPS = [0, 10, 20, 30];

        const placed: AABB[] = [];
        for (const c of candidates) {
            const anchorPx = map.latLngToLayerPoint([c.lat, c.lng]);
            const { w, h } = estimateSize(c.text, c.fontSize, c.hPad, c.vPad);

            if (c.feature) {
                // ── Center label: try nudging inside the polygon ──────────────────
                let found = false;
                outer: for (const step of NUDGE_STEPS) {
                    for (const [dx, dy] of NUDGE_DIRS) {
                        if (step === 0 && (dx !== 0 || dy !== 0)) continue;

                        const testPx = L.point(anchorPx.x + dx * step, anchorPx.y + dy * step);
                        const aabb = rotatedAABB(testPx.x, testPx.y, w, h, 0);
                        if (placed.some(pl => overlaps(pl, aabb))) continue;

                        // For nudged positions verify point stays inside polygon
                        if (step > 0) {
                            const ll = map.layerPointToLatLng(testPx);
                            try {
                                if (!turf.booleanPointInPolygon(
                                    turf.point([ll.lng, ll.lat]), c.feature
                                )) continue;
                            } catch (_) { continue; }
                        }

                        const finalLl = step === 0
                            ? { lat: c.lat, lng: c.lng }
                            : map.layerPointToLatLng(testPx);
                        placed.push(aabb);
                        nodes.push(c.buildNode(finalLl.lat, finalLl.lng));
                        found = true;
                        break outer;
                    }
                }
                // If no free spot found after all nudges → label is omitted
                void found;
            } else {
                // ── Dim label: fixed position, skip if blocked ───────────────────
                const aabb = rotatedAABB(anchorPx.x, anchorPx.y, w, h, c.angleDeg);
                if (placed.some(pl => overlaps(pl, aabb))) continue;
                placed.push(aabb);
                nodes.push(c.buildNode(c.lat, c.lng));
            }
        }

        setMarkers(nodes);
    }, [data, selectedPolyIds, labelField, map, labelScale]);

    useEffect(() => {
        rebuild();
        map.on('zoomend moveend', rebuild);
        return () => { map.off('zoomend moveend', rebuild); };
    }, [rebuild, map]);

    return <>{markers}</>;
}

export default function Map({ data, selectedPolyIds, labelField, baseLayer, fileVersion, onSelect, labelScale, isSidebarVisible }: MapProps) {
    useEffect(() => { fixLeafletIcon(); }, []);

    const polygonStyle = (isSelected: boolean) => ({
        fillColor: isSelected ? '#ef4444' : '#fbbf24',
        weight: isSelected ? 3 : 2,
        opacity: 1,
        color: isSelected ? '#ef4444' : '#fbbf24',
        fillOpacity: isSelected ? 0.35 : 0.1,
    });

    const onEachFeature = (feature: any, layer: L.Layer) => {
        layer.on({
            click: (e) => {
                L.DomEvent.stopPropagation(e);
                const poly = data?.polygons.find(p => p.feature === feature);
                if (poly) onSelect(poly.id);
            },
            mouseover: (e: any) => e.target.setStyle({ fillOpacity: 0.4 }),
            mouseout: (e: any) => {
                const isSelected = selectedPolyIds.includes(
                    data?.polygons.find(p => p.feature === feature)?.id || ''
                );
                e.target.setStyle({ fillOpacity: isSelected ? 0.35 : 0.05 });
            },
        });
    };

    const tileUrl = 'http://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}';

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* ── Compass Rose Overlay ─────────────────────────────────────────── */}
            <div style={{
                position: 'absolute', top: 14, right: 14,
                zIndex: 1000, pointerEvents: 'none',
                filter: 'drop-shadow(0 2px 14px rgba(0,0,0,0.85))',
            }} className="compass-container">
                {/*
                  SVG canvas: 124×138 rendered px.
                  ViewBox "-16 -22 124 138" gives ample room:
                    x: -16 → 108  |  y: -22 → 116
                  Ring: center=(46,46), r=44 → ring edges at x=2…90, y=2…90
                */}
                <svg width="155" height="173" viewBox="-16 -22 124 138" xmlns="http://www.w3.org/2000/svg">
                    {/* Thin outer ring */}
                    <circle cx="46" cy="46" r="44" fill="rgba(0,0,0,0.30)"
                        stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />

                    {/* ── N needle (red, two-face 3-D) ── */}
                    <polygon points="46,8  42,46  46,40" fill="#ef4444" />
                    <polygon points="46,8  50,46  46,40" fill="#c62828" />

                    {/* ── S needle ── */}
                    <polygon points="46,84  42,46  46,52" fill="#e2e8f0" />
                    <polygon points="46,84  50,46  46,52" fill="#94a3b8" />

                    {/* ── E needle ── */}
                    <polygon points="84,46  46,42  52,46" fill="#e2e8f0" />
                    <polygon points="84,46  46,50  52,46" fill="#94a3b8" />

                    {/* ── W needle ── */}
                    <polygon points="8,46  46,42  40,46" fill="#e2e8f0" />
                    <polygon points="8,46  46,50  40,46" fill="#94a3b8" />

                    {/* Center jewel */}
                    <circle cx="46" cy="46" r="4" fill="#fff" stroke="#ef4444" strokeWidth="1.5" />

                    {/* ══ N / شمال ══ */}
                    <text x="46" y="-6" textAnchor="middle" dominantBaseline="auto"
                        fill="#ff4444" fontSize="12" fontWeight="900"
                        fontFamily="'Arial', sans-serif" letterSpacing="1">N</text>
                    <text x="46" y="5" textAnchor="middle" dominantBaseline="auto"
                        fill="#fca5a5" fontSize="7.5" fontWeight="600"
                        fontFamily="'Noto Nastaliq Urdu','Jameel Noori Nastaleeq','Arial Unicode MS',serif">شمال</text>

                    {/* ══ S / جنوب ══ */}
                    <text x="46" y="96" textAnchor="middle" dominantBaseline="auto"
                        fill="#e2e8f0" fontSize="10" fontWeight="700"
                        fontFamily="'Arial', sans-serif">S</text>
                    <text x="46" y="108" textAnchor="middle" dominantBaseline="auto"
                        fill="#cbd5e1" fontSize="7.5" fontWeight="600"
                        fontFamily="'Noto Nastaliq Urdu','Jameel Noori Nastaleeq','Arial Unicode MS',serif">جنوب</text>

                    {/* ══ E / مشرق ══ */}
                    <text x="93" y="43" textAnchor="middle" dominantBaseline="auto"
                        fill="#e2e8f0" fontSize="10" fontWeight="700"
                        fontFamily="'Arial', sans-serif">E</text>
                    <text x="93" y="55" textAnchor="middle" dominantBaseline="auto"
                        fill="#cbd5e1" fontSize="7" fontWeight="600"
                        fontFamily="'Noto Nastaliq Urdu','Jameel Noori Nastaleeq','Arial Unicode MS',serif">مشرق</text>

                    {/* ══ W / مغرب ══ */}
                    <text x="-1" y="43" textAnchor="middle" dominantBaseline="auto"
                        fill="#e2e8f0" fontSize="10" fontWeight="700"
                        fontFamily="'Arial', sans-serif">W</text>
                    <text x="-1" y="55" textAnchor="middle" dominantBaseline="auto"
                        fill="#cbd5e1" fontSize="7" fontWeight="600"
                        fontFamily="'Noto Nastaliq Urdu','Jameel Noori Nastaleeq','Arial Unicode MS',serif">مغرب</text>
                </svg>
            </div>

            <MapContainer
                center={[31.5204, 74.3587]}
                zoom={13}
                maxZoom={24}
                className="w-full h-full bg-[#0a0a0a]"
                zoomControl={false}
            >
                <TileLayer
                    url={tileUrl}
                    maxZoom={24}
                    maxNativeZoom={22}
                    attribution="&copy; Google Maps"
                    crossOrigin="anonymous"
                />

                {data?.geojson && (
                    <GeoJSON
                        key={`geojson-${fileVersion}-${selectedPolyIds.length}-${baseLayer}`}
                        data={data.geojson}
                        style={(feature) => {
                            const poly = data.polygons.find(p => p.feature === feature);
                            return polygonStyle(selectedPolyIds.includes(poly?.id || ''));
                        }}
                        onEachFeature={onEachFeature}
                        pointToLayer={(feature, latlng) => {
                            const name = feature.properties?.[labelField] || feature.properties?.name || '';
                            if (name) {
                                return L.marker(latlng, {
                                    icon: L.divIcon({
                                        className: 'point-label-icon',
                                        html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
                                            <div style="background:rgba(220,38,38,0.9);color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.5);">${name}</div>
                                            <div style="width:2px;height:6px;background:rgba(220,38,38,0.9);"></div>
                                            <div style="width:6px;height:6px;border-radius:50%;background:#fff;border:2px solid rgba(220,38,38,0.9);"></div>
                                        </div>`,
                                        iconSize: L.point(0, 0),
                                        iconAnchor: L.point(0, 0)
                                    })
                                });
                            }
                            return L.circleMarker(latlng, {
                                radius: 5,
                                fillColor: '#ef4444',
                                color: '#fff',
                                weight: 1.5,
                                opacity: 1,
                                fillOpacity: 0.9
                            });
                        }}
                    />
                )}

                <PolyLabels
                    data={data}
                    selectedPolyIds={selectedPolyIds}
                    labelField={labelField}
                    labelScale={labelScale}
                />

                <MapResizer data={data} fileVersion={fileVersion} isSidebarVisible={isSidebarVisible} />

                <style jsx global>{`
        .leaflet-container { background: #020617 !important; }
        .dim-label-icon { background: transparent !important; border: none !important; }
        @media (max-width: 768px) {
          .compass-container svg {
             transform: scale(0.65);
             transform-origin: top right;
          }
        }
      `}</style>
            </MapContainer>
        </div>
    );
}
