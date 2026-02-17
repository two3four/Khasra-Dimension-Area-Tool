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

function MapResizer({ data }: { data: MapData | null }) {
    const map = useMap();
    useEffect(() => {
        if (data?.geojson) {
            const bounds = L.geoJSON(data.geojson).getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    }, [data, map]);
    return null;
}

interface MapProps {
    data: MapData | null;
    selectedPolyId: string | null;
    onSelect: (id: string) => void;
}

export default function Map({ data, selectedPolyId, onSelect }: MapProps) {
    useEffect(() => {
        fixLeafletIcon();
    }, []);

    const polygonStyle = (feature: any, isSelected: boolean) => ({
        fillColor: isSelected ? '#ef4444' : '#334155',
        weight: isSelected ? 3 : 1,
        opacity: 1,
        color: isSelected ? '#ef4444' : '#475569',
        fillOpacity: isSelected ? 0.3 : 0.1,
    });

    const onEachFeature = (feature: any, layer: L.Layer) => {
        layer.on({
            click: (e) => {
                L.DomEvent.stopPropagation(e);
                // Find the poly id in data
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
                const isSelected = data?.polygons.find(p => p.feature === feature)?.id === selectedPolyId;
                layer.setStyle({ fillOpacity: isSelected ? 0.3 : 0.1 });
            }
        });
    };

    const labelIcon = (text: string, isArea: boolean = false) => L.divIcon({
        className: 'custom-div-icon',
        html: `
      <div class="flex flex-col items-center">
        <span class="${isArea ? 'px-2 py-1 bg-red-600 text-white font-bold' : 'px-1.5 py-0.5 bg-slate-900 border border-slate-700 text-slate-300 text-[10px]'} rounded shadow-xl whitespace-nowrap">
          ${text}
        </span>
      </div>
    `,
        iconSize: L.point(0, 0),
    });

    const selectedPoly = data?.polygons.find(p => p.id === selectedPolyId);

    return (
        <MapContainer
            center={[31.5204, 74.3587]} // Default to Lahore
            zoom={13}
            className="w-full h-full grayscale-[0.5] invert-[0.85] hue-rotate-[180deg]"
            zoomControl={false}
        >
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />

            {data?.geojson && (
                <GeoJSON
                    key={`geojson-${selectedPolyId}`} // Remount to apply styles correctly if needed, though onEachFeature is better
                    data={data.geojson}
                    style={(feature) => {
                        const poly = data.polygons.find(p => p.feature === feature);
                        return polygonStyle(feature, poly?.id === selectedPolyId);
                    }}
                    onEachFeature={onEachFeature}
                />
            )}

            {selectedPoly && selectedPoly.stats && (
                <React.Fragment>
                    {/* Area Label at Center */}
                    <Marker
                        position={selectedPoly.center}
                        icon={labelIcon(selectedPoly.stats.label, true)}
                    />

                    {/* Side Dimensions at Midpoints */}
                    {selectedPoly.dimensions?.map((dim, dIdx) => (
                        <Marker
                            key={`${selectedPoly.id}-dim-${dIdx}`}
                            position={[dim.point[1], dim.point[0]]}
                            icon={labelIcon(dim.label)}
                        />
                    ))}
                </React.Fragment>
            )}

            <MapResizer data={data} />

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
