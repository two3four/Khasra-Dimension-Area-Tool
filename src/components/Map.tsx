"use client";

import React, { useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
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

function MapResizer({ data, fileVersion }: { data: MapData | null, fileVersion: number }) {
    const map = useMap();
    useEffect(() => {
        if (data?.geojson) {
            const bounds = L.geoJSON(data.geojson).getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    }, [fileVersion]); // Only trigger when a new file is loaded
    return null;
}

interface MapProps {
    data: MapData | null;
    selectedPolyIds: string[];
    labelField: string;
    baseLayer: 'satellite' | 'dark';
    fileVersion: number;
    onSelect: (id: string) => void;
}

/**
 * Enhanced Marker rendering that prevents overlapping labels based on screen pixel space.
 */
function CollisionManagedMarkers({ data, selectedPolyIds, labelField }: {
    data: MapData | null,
    selectedPolyIds: string[],
    labelField: string
}) {
    const map = useMap();
    const [visibleMarkers, setVisibleMarkers] = React.useState<React.ReactNode[]>([]);

    const calculateCollision = React.useCallback(() => {
        if (!data || selectedPolyIds.length === 0) {
            setVisibleMarkers([]);
            return;
        }

        const collisionBuffers: { x1: number, y1: number, x2: number, y2: number }[] = [];
        const newMarkers: React.ReactNode[] = [];

        const isOverlapping = (box: { x1: number, y1: number, x2: number, y2: number }) => {
            return collisionBuffers.some(target => {
                return !(box.x2 < target.x1 ||
                    box.x1 > target.x2 ||
                    box.y2 < target.y1 ||
                    box.y1 > target.y2);
            });
        };

        const getCollisionBox = (point: { x: number, y: number }, width: number, height: number, padding: number = 2) => ({
            x1: point.x - width / 2 - padding,
            y1: point.y - height / 2 - padding,
            x2: point.x + width / 2 + padding,
            y2: point.y + height / 2 + padding
        });

        // Search for a free position around the anchor
        const findFreePosition = (anchor: { x: number, y: number }, width: number, height: number) => {
            const offsets = [
                { x: 0, y: 0 },       // Center
                { x: 0, y: -25 },     // Top
                { x: 0, y: 25 },      // Bottom
                { x: -50, y: 0 },     // Left
                { x: 50, y: 0 },      // Right
                { x: -50, y: -25 },   // Top-Left
                { x: 50, y: -25 },    // Top-Right
                { x: -50, y: 25 },    // Bottom-Left
                { x: 50, y: 25 },     // Bottom-Right
                { x: 0, y: -50 },     // Far Top
                { x: 0, y: 50 },      // Far Bottom
                { x: -80, y: 0 },     // Far Left
                { x: 80, y: 0 },      // Far Right
            ];

            for (const offset of offsets) {
                const testPos = { x: anchor.x + offset.x, y: anchor.y + offset.y };
                const box = getCollisionBox(testPos, width, height);
                if (!isOverlapping(box)) return { pos: testPos, box };
            }

            // Final guarantee: find a spot with a slight random displacement if all predefined spots are full
            const finalPos = { x: anchor.x + (Math.random() - 0.5) * 80, y: anchor.y + (Math.random() - 0.5) * 80 };
            return { pos: finalPos, box: getCollisionBox(finalPos, width, height) };
        };

        const getLabelIcon = (text: string, isMain: boolean = false) => L.divIcon({
            className: 'custom-div-icon',
            html: `
        <div class="flex flex-col items-center pointer-events-none">
          <span class="${isMain
                    ? 'px-2 py-0.5 bg-red-600/95 text-white font-bold text-xs ring-1 ring-white/20 shadow-[0_0_15px_rgba(220,38,38,0.5)]'
                    : 'px-1 py-0 bg-black/85 border border-white/20 text-slate-100 text-[9px] font-semibold shadow-md'} rounded whitespace-nowrap backdrop-blur-[4px]">
            ${text}
          </span>
        </div>
      `,
            iconSize: L.point(0, 0),
        });

        const selectedPolys = data.polygons.filter(p => selectedPolyIds.includes(p.id));

        // Prepare all labels for sorting
        const allPending = [
            ...selectedPolys.map(p => ({
                id: `main-${p.id}`,
                type: 'main' as const,
                center: p.center,
                text: `${p.feature.properties[labelField] || ''} | ${p.stats?.label || ''}`
            })),
            ...selectedPolys.flatMap(p => (p.dimensions || []).map((d, i) => ({
                id: `dim-${p.id}-${i}`,
                type: 'dim' as const,
                center: [d.point[1], d.point[0]] as [number, number],
                text: d.label
            })))
        ];

        // Process Main labels first, then dimensions
        allPending.sort((a, b) => (a.type === 'main' ? -1 : 1));

        allPending.forEach(item => {
            const anchor = map.latLngToContainerPoint(L.latLng(item.center[0], item.center[1]));
            const isMain = item.type === 'main';
            const width = item.text.length * (isMain ? 7.5 : 6) + (isMain ? 12 : 8);
            const height = isMain ? 26 : 18;

            const result = findFreePosition(anchor, width, height);
            collisionBuffers.push(result.box);

            // Convert position back to LatLng so marker moves correctly with map
            const finalLatLng = map.containerPointToLatLng(L.point(result.pos.x, result.pos.y));

            newMarkers.push(
                <Marker
                    key={item.id}
                    position={finalLatLng}
                    icon={getLabelIcon(item.text, isMain)}
                />
            );
        });

        setVisibleMarkers(newMarkers);
    }, [data, selectedPolyIds, labelField, map]);

    useEffect(() => {
        calculateCollision();
        map.on('zoomend moveend', calculateCollision);
        return () => {
            map.off('zoomend moveend', calculateCollision);
        };
    }, [calculateCollision, map]);

    return <>{visibleMarkers}</>;
}

export default function Map({ data, selectedPolyIds, labelField, baseLayer, fileVersion, onSelect }: MapProps) {
    useEffect(() => {
        fixLeafletIcon();
    }, []);

    const polygonStyle = (isSelected: boolean) => ({
        fillColor: isSelected ? '#ef4444' : '#334155',
        weight: isSelected ? 3 : 1.5,
        opacity: 1,
        color: isSelected ? '#ef4444' : '#64748b',
        fillOpacity: isSelected ? 0.35 : 0.05,
    });

    const onEachFeature = (feature: any, layer: L.Layer) => {
        layer.on({
            click: (e) => {
                L.DomEvent.stopPropagation(e);
                const poly = data?.polygons.find(p => p.feature === feature);
                if (poly) {
                    onSelect(poly.id);
                }
            },
            mouseover: (e: any) => {
                const layer = e.target;
                layer.setStyle({ fillOpacity: 0.4 });
            },
            mouseout: (e: any) => {
                const layer = e.target;
                const isSelected = selectedPolyIds.includes(data?.polygons.find(p => p.feature === feature)?.id || '');
                layer.setStyle({ fillOpacity: isSelected ? 0.35 : 0.05 });
            }
        });
    };

    const tileUrl = baseLayer === 'satellite'
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    const filterClass = baseLayer === 'dark' ? 'grayscale-[0.5] invert-[0.85] hue-rotate-[180deg]' : '';

    return (
        <MapContainer
            center={[31.5204, 74.3587]}
            zoom={13}
            maxZoom={24}
            className="w-full h-full bg-[#0a0a0a]"
            zoomControl={false}
        >
            <div className={filterClass}>
                <TileLayer
                    url={tileUrl}
                    maxZoom={24}
                    maxNativeZoom={baseLayer === 'satellite' ? 20 : 19}
                    attribution={baseLayer === 'satellite' ? 'Esri &copy; OpenStreetMap' : '&copy; OpenStreetMap'}
                />
            </div>

            {data?.geojson && (
                <GeoJSON
                    key={`geojson-${fileVersion}-${selectedPolyIds.length}-${baseLayer}`}
                    data={data.geojson}
                    style={(feature) => {
                        const poly = data.polygons.find(p => p.feature === feature);
                        return polygonStyle(selectedPolyIds.includes(poly?.id || ''));
                    }}
                    onEachFeature={onEachFeature}
                />
            )}

            <CollisionManagedMarkers
                data={data}
                selectedPolyIds={selectedPolyIds}
                labelField={labelField}
            />

            <MapResizer data={data} fileVersion={fileVersion} />

            <style jsx global>{`
        .leaflet-container {
          background: #020617 !important;
        }
        .custom-div-icon {
          background: transparent;
          border: none;
        }
      `}</style>
        </MapContainer>
    );
}
