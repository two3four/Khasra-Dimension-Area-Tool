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

    const labelIcon = (text: string, isMain: boolean = false) => L.divIcon({
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

            {data?.polygons.filter(p => selectedPolyIds.includes(p.id)).map((poly) => (
                <React.Fragment key={poly.id}>
                    {/* Main Label: Area + Custom Field */}
                    <Marker
                        position={poly.center}
                        icon={labelIcon(`${poly.feature.properties[labelField] || ''} | ${poly.stats?.label || ''}`, true)}
                    />

                    {/* Side Dimensions at Midpoints - Only show if not too many segments or zoomed in? */}
                    {/* Or just make them smaller as we did */}
                    {poly.dimensions?.map((dim, dIdx) => (
                        <Marker
                            key={`${poly.id}-dim-${dIdx}`}
                            position={[dim.point[1], dim.point[0]]}
                            icon={labelIcon(dim.label)}
                        />
                    ))}
                </React.Fragment>
            ))}

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
