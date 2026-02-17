"use client";

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import FileUploader from './FileUploader';
import { calculateKanalMarla, calculateDimensions, calculateProjectedArea, KhasraStats, Dimension, CRS } from '@/lib/geo-utils';
import * as turf from '@turf/turf';
import { Layers, Map as MapIcon, Table, Info, Globe, Linkedin, MessageSquare } from 'lucide-react';

const Map = dynamic<any>(() => import('./Map'), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-slate-900 flex items-center justify-center text-white font-medium">Initializing Map...</div>
});

export type BaseLayer = 'satellite' | 'dark';

export interface KhasraData {
    id: string;
    feature: any;
    stats?: KhasraStats;
    dimensions?: Dimension[];
    center: [number, number];
}

export interface MapData {
    geojson: any;
    polygons: KhasraData[];
    availableFields: string[];
}

export default function Dashboard() {
    const [mapData, setMapData] = useState<MapData | null>(null);
    const [selectedPolyIds, setSelectedPolyIds] = useState<string[]>([]);
    const [labelField, setLabelField] = useState<string>('');
    const [selectedCRS, setSelectedCRS] = useState<CRS>('UTM42N');
    const [baseLayer, setBaseLayer] = useState<BaseLayer>('dark');
    const [isProcessing, setIsProcessing] = useState(false);
    const [fileVersion, setFileVersion] = useState(0);

    const handleFileProcessed = (geojson: any) => {
        setIsProcessing(true);
        try {
            // Extract fields from the first feature
            const properties = geojson.features[0]?.properties || {};
            const fields = Object.keys(properties);
            if (fields.length > 0 && !labelField) {
                setLabelField(fields[0]);
            }

            const polygons = geojson.features.map((feature: any, index: number) => {
                const center = turf.centerOfMass(feature).geometry.coordinates as [number, number];
                return {
                    id: `poly-${index}`,
                    feature,
                    center: [center[1], center[0]], // [lat, lng] for Leaflet
                };
            });

            setMapData({ geojson, polygons, availableFields: fields });
            setSelectedPolyIds([]);
            setFileVersion(v => v + 1);
        } catch (error) {
            console.error("Error processing geojson:", error);
            alert("Failed to process spatial data. Please ensure the shapefile is valid.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSelectKhasra = (id: string, toggle: boolean = true) => {
        if (!mapData) return;

        let nextIds = [...selectedPolyIds];
        const isSelected = nextIds.includes(id);

        if (toggle && isSelected) {
            nextIds = nextIds.filter(prevId => prevId !== id);
        } else if (!isSelected) {
            nextIds.push(id);
        }

        setSelectedPolyIds(nextIds);

        // Lazily calculate stats if not already present (or if we want to force re-calc)
        const polyIdx = mapData.polygons.findIndex(p => p.id === id);
        if (polyIdx !== -1) {
            const poly = mapData.polygons[polyIdx];
            // Calculate if toggle off (force) or if stats missing
            if (!toggle || !isSelected) {
                const area = calculateProjectedArea(poly.feature, selectedCRS);
                const stats = calculateKanalMarla(area);
                const dimensions = calculateDimensions(poly.feature, selectedCRS);

                setMapData(prev => {
                    if (!prev) return null;
                    const newPolys = [...prev.polygons];
                    newPolys[polyIdx] = { ...poly, stats, dimensions };
                    return { ...prev, polygons: newPolys };
                });
            }
        }
    };

    // Re-calculate stats when CRS changes for ALL selected polygons
    React.useEffect(() => {
        if (selectedPolyIds.length > 0 && mapData) {
            selectedPolyIds.forEach(id => {
                handleSelectKhasra(id, false); // force re-calc without toggling
            });
        }
    }, [selectedCRS]);

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
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 bg-slate-800/80 rounded-lg p-1 border border-slate-700">
                        <button
                            onClick={() => setBaseLayer('dark')}
                            className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${baseLayer === 'dark' ? 'bg-slate-900 text-red-500 shadow-inner' : 'text-slate-400 hover:text-white'}`}
                        >
                            Dark
                        </button>
                        <button
                            onClick={() => setBaseLayer('satellite')}
                            className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${baseLayer === 'satellite' ? 'bg-slate-900 text-red-500 shadow-inner' : 'text-slate-400 hover:text-white'}`}
                        >
                            Satellite
                        </button>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-800/80 rounded-lg p-1 border border-slate-700">
                        <div className="pl-2 flex items-center gap-1.5 text-slate-400">
                            <Globe className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Projection</span>
                        </div>
                        <select
                            value={selectedCRS}
                            onChange={(e) => setSelectedCRS(e.target.value as CRS)}
                            className="bg-slate-900 text-xs font-bold px-3 py-1.5 rounded-md border-none focus:ring-1 focus:ring-red-500 outline-none cursor-pointer"
                        >
                            <option value="UTM42N">UTM Zone 42N</option>
                            <option value="UTM43N">UTM Zone 43N</option>
                        </select>
                    </div>
                    <button
                        onClick={() => setMapData(null)}
                        className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                    >
                        Reset
                    </button>
                    <div className="flex items-center gap-4 pl-4 border-l border-slate-800">
                        <div className="flex flex-col">
                            <span className="text-[9px] uppercase font-bold text-slate-500 tracking-[0.2em] leading-tight">Developer</span>
                            <span className="text-sm font-extrabold text-white tracking-tight">Siddique Akbar</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <a
                                href="https://www.upwork.com/freelancers/~01e0473f622c19db44"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-2 bg-green-600/10 hover:bg-green-600/20 text-green-500 rounded-lg transition-all border border-green-600/20 group"
                                title="Discuss your requirements with me"
                            >
                                <MessageSquare className="w-4 h-4" />
                                <span className="text-xs font-bold whitespace-nowrap">Discuss Requirements</span>
                            </a>
                            <a
                                href="https://www.linkedin.com/in/siddique-akbar-436a651b7/?skipRedirect=true"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 bg-slate-800 hover:bg-blue-600/20 hover:text-blue-400 rounded-lg transition-all border border-slate-700"
                                title="Suggestions & Feedback"
                            >
                                <Linkedin className="w-4 h-4" />
                            </a>
                        </div>
                    </div>
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
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                            <Table className="w-4 h-4" /> Khasra List
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Label By:</span>
                                            <select
                                                value={labelField}
                                                onChange={(e) => setLabelField(e.target.value)}
                                                className="bg-slate-800 text-[10px] text-slate-300 border border-slate-700 rounded px-1.5 py-1 outline-none focus:border-red-500 max-w-[100px]"
                                            >
                                                {mapData.availableFields.map(f => (
                                                    <option key={f} value={f}>{f}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {mapData.polygons.map((poly, idx) => {
                                            const isSelected = selectedPolyIds.includes(poly.id);
                                            return (
                                                <div
                                                    key={poly.id}
                                                    className={`p-4 rounded-xl bg-slate-800/50 border ${isSelected ? 'border-red-500' : 'border-slate-700/50'} hover:border-red-500/50 transition-all cursor-pointer group`}
                                                    onClick={() => handleSelectKhasra(poly.id)}
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="text-xs font-bold text-red-400">
                                                            {poly.feature.properties[labelField] || `ID: ${idx + 1}`}
                                                        </span>
                                                        {poly.stats && <span className="text-[10px] text-slate-500">{poly.stats.areaSqFt.toLocaleString()} Sq Ft</span>}
                                                    </div>
                                                    <div className="text-lg font-bold text-white group-hover:text-red-400 transition-colors">
                                                        {poly.stats ? poly.stats.label : 'Click to select'}
                                                    </div>
                                                </div>
                                            );
                                        })}
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

                        {/* Sidebar Footer Credit */}
                        <div className="mt-auto pt-6 pb-2 text-center border-t border-slate-800/50">
                            <p className="text-[10px] text-slate-500 font-medium tracking-tight">
                                Developed with precision by <span className="text-slate-300 font-bold">Siddique Akbar</span>
                            </p>
                        </div>
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
                        <Map
                            data={mapData}
                            selectedPolyIds={selectedPolyIds}
                            labelField={labelField}
                            baseLayer={baseLayer}
                            fileVersion={fileVersion}
                            onSelect={handleSelectKhasra}
                        />
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
