"use client";

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import FileUploader from './FileUploader';
import { calculateKanalMarla, calculateDimensions, KhasraStats, Dimension } from '@/lib/geo-utils';
import * as turf from '@turf/turf';
import { Layers, Map as MapIcon, Table, Info } from 'lucide-react';

const Map = dynamic<any>(() => import('./Map'), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-slate-900 flex items-center justify-center text-white font-medium">Initializing Map...</div>
});

export interface MapData {
    geojson: any;
    polygons: Array<{
        id: string;
        stats: KhasraStats;
        dimensions: Dimension[];
        center: [number, number];
    }>;
}

export default function Dashboard() {
    const [mapData, setMapData] = useState<MapData | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleFileProcessed = (geojson: any) => {
        setIsProcessing(true);
        try {
            const polygons = geojson.features.map((feature: any, index: number) => {
                // Calculate area using turf (returns sq meters)
                const area = turf.area(feature);
                const stats = calculateKanalMarla(area);
                const dimensions = calculateDimensions(feature);
                const center = turf.centerOfMass(feature).geometry.coordinates as [number, number];

                return {
                    id: `poly-${index}`,
                    stats,
                    dimensions,
                    center: [center[1], center[0]], // [lat, lng] for Leaflet
                };
            });

            setMapData({ geojson, polygons });
        } catch (error) {
            console.error("Error processing geojson:", error);
            alert("Failed to process spatial data. Please ensure the shapefile is valid.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-black text-slate-100 overflow-hidden font-sans">
            {/* Header */}
            <header className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-600 rounded-lg">
                        <Layers className="w-6 h-6 text-white" />
                    </div>
                    <h1 className="text-xl font-bold tracking-tight">Khasra Dimension <span className="text-red-500">Tool</span></h1>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setMapData(null)}
                        className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                    >
                        Reset
                    </button>
                    <a
                        href="#"
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium transition-all"
                    >
                        Vercel Deployment
                    </a>
                </div>
            </header>

            <main className="flex-1 flex overflow-hidden">
                {/* Sidebar / Info Panel */}
                <aside className="w-80 border-r border-slate-800 bg-slate-900/30 flex flex-col">
                    <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                        {!mapData ? (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
                                <Info className="w-12 h-12 mb-4" />
                                <p className="text-sm">Upload a zipped shapefile to see Khasra details, area in Kanal-Marla and side dimensions.</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <Table className="w-4 h-4" /> Data Summary
                                    </h3>
                                    <div className="space-y-3">
                                        {mapData.polygons.map((poly, idx) => (
                                            <div key={poly.id} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-red-500/50 transition-all cursor-pointer group">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-xs font-bold text-red-400">KHASRA #{idx + 1}</span>
                                                    <span className="text-[10px] text-slate-500">{poly.stats.areaSqFt.toLocaleString()} Sq Ft</span>
                                                </div>
                                                <div className="text-lg font-bold text-white group-hover:text-red-400 transition-colors">
                                                    {poly.stats.label}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-6 border-t border-slate-800">
                        {!mapData && <FileUploader onProcessed={handleFileProcessed} />}
                        {mapData && (
                            <div className="flex flex-col gap-2">
                                <button className="w-full py-3 bg-red-600 hover:bg-red-500 rounded-xl font-bold transition-all shadow-lg shadow-red-900/20">
                                    Export Report
                                </button>
                            </div>
                        )}
                    </div>
                </aside>

                {/* Map Area */}
                <section className="flex-1 relative bg-slate-950">
                    {!mapData && (
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                            <div className="max-w-md text-center">
                                <h2 className="text-3xl font-bold mb-4">Start by uploading your data</h2>
                                <p className="text-slate-400 mb-8">Drop your .zip shapefile folder containing .shp, .dbf, and .shx files.</p>
                            </div>
                        </div>
                    )}
                    <div className="w-full h-full relative">
                        {/* @ts-ignore */}
                        <Map data={mapData} />
                    </div>
                </section>
            </main>

            <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
      `}</style>
        </div>
    );
}
