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

        const getLabelIcon = (text: string, isMain: boolean = false) => L.divIcon({
            className: 'custom-div-icon',
            html: `
        <div class="flex flex-col items-center pointer-events-none">
          <span class="${isMain
                    ? 'px-2 py-0.5 bg-red-600/90 text-white font-bold text-xs ring-1 ring-white/20'
                    : 'px-1 py-0 bg-black/70 border border-white/20 text-slate-200 text-[9px] font-medium'} rounded shadow-lg whitespace-nowrap backdrop-blur-[2px]">
            ${text}
          </span>
        </div>
      `,
            iconSize: L.point(0, 0),
        });

        const selectedPolys = data.polygons.filter(p => selectedPolyIds.includes(p.id));

        // Priority 1: Main Labels
        selectedPolys.forEach(poly => {
            const point = map.latLngToContainerPoint(L.latLng(poly.center[0], poly.center[1]));
            const text = `${poly.feature.properties[labelField] || ''} | ${poly.stats?.label || ''}`;
            const width = text.length * 7 + 10;
            const height = 24;

            const box = {
                x1: point.x - width / 2,
                y1: point.y - height / 2,
                x2: point.x + width / 2,
                y2: point.y + height / 2
            };

            if (!isOverlapping(box)) {
                collisionBuffers.push(box);
                newMarkers.push(
                    <Marker key={`main-${poly.id}`} position={poly.center} icon={getLabelIcon(text, true)} />
                );
            }
        });

        // Priority 2: Dimension Labels
        selectedPolys.forEach(poly => {
            poly.dimensions?.forEach((dim, dIdx) => {
                const point = map.latLngToContainerPoint(L.latLng(dim.point[1], dim.point[0]));
                const text = dim.label;
                const width = text.length * 6 + 6;
                const height = 16;

                const box = {
                    x1: point.x - width / 2,
                    y1: point.y - height / 2,
                    x2: point.x + width / 2,
                    y2: point.y + height / 2
                };

                if (!isOverlapping(box)) {
                    collisionBuffers.push(box);
                    newMarkers.push(
                        <Marker
                            key={`dim-${poly.id}-${dIdx}`}
                            position={[dim.point[1], dim.point[0]]}
                            icon={getLabelIcon(text)}
                        />
                    );
                }
            });
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
            className="w-full h-full bg-[#0a0a0a]"
            zoomControl={false}
        >
            <div className={filterClass}>
                <TileLayer
                    url={tileUrl}
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
