"use client";

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import FileUploader from './FileUploader';
import { calculateKanalMarla, calculateDimensions, calculateProjectedArea, KhasraStats, Dimension, CRS } from '@/lib/geo-utils';
import * as turf from '@turf/turf';
import { Layers, Map as MapIcon, Table, Info, Globe, Linkedin, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';

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
    const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(true);

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
            setIsMobilePanelOpen(false); // Hide panel on mobile to reveal map
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
            <header className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex flex-col md:flex-row items-center justify-between z-10 gap-3 md:gap-0">
                <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-600 rounded-lg">
                            <Layers className="w-5 h-5 md:w-6 md:h-6 text-white" />
                        </div>
                        <h1 className="text-lg md:text-xl font-bold tracking-tight">Khasra Dimension <span className="text-red-500">Tool</span></h1>
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 md:gap-6 w-full md:w-auto">
                    <div className="flex items-center gap-2 bg-slate-800/80 rounded-lg p-1 border border-slate-700">
                        <button
                            onClick={() => setBaseLayer('dark')}
                            className={`px-2 py-1 md:px-3 md:py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${baseLayer === 'dark' ? 'bg-slate-900 text-red-500 shadow-inner' : 'text-slate-400 hover:text-white'}`}
                        >
                            Dark
                        </button>
                        <button
                            onClick={() => setBaseLayer('satellite')}
                            className={`px-2 py-1 md:px-3 md:py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${baseLayer === 'satellite' ? 'bg-slate-900 text-red-500 shadow-inner' : 'text-slate-400 hover:text-white'}`}
                        >
                            Satellite
                        </button>
                    </div>

                    <div className="flex items-center gap-1 md:gap-2 bg-slate-800/80 rounded-lg p-1 border border-slate-700">
                        <div className="pl-1 md:pl-2 flex items-center gap-1.5 text-slate-400 hidden sm:flex">
                            <Globe className="w-3 md:w-3.5 h-3 md:h-3.5" />
                            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider">Projection</span>
                        </div>
                        <select
                            value={selectedCRS}
                            onChange={(e) => setSelectedCRS(e.target.value as CRS)}
                            className="bg-slate-900 text-[10px] md:text-xs font-bold px-2 md:px-3 py-1 md:py-1.5 rounded-md border-none focus:ring-1 focus:ring-red-500 outline-none cursor-pointer"
                        >
                            <option value="UTM42N">UTM Zone 42N</option>
                            <option value="UTM43N">UTM Zone 43N</option>
                        </select>
                    </div>
                    <button
                        onClick={() => setMapData(null)}
                        className="px-2 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium text-slate-400 hover:text-white transition-colors border border-slate-700 md:border-none rounded-lg md:rounded-none"
                    >
                        Reset
                    </button>
                    <div className="hidden lg:flex items-center gap-4 pl-4 border-l border-slate-800">
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

            <main className="flex-1 flex overflow-hidden relative">

                {/* Sidebar / Info Panel - Bottom Sheet on Mobile */}
                <aside className={`absolute md:relative w-full md:w-80 border-t md:border-t-0 md:border-r border-slate-800 bg-slate-900/95 md:bg-slate-900/40 backdrop-blur-2xl md:backdrop-blur-none flex flex-col z-[40] h-[75vh] md:h-full bottom-0 left-0 transition-transform duration-300 ease-in-out shadow-[0_-10px_40px_rgba(0,0,0,0.5)] md:shadow-none ${isMobilePanelOpen ? 'translate-y-0' : 'translate-y-[calc(100%-48px)] md:translate-y-0'}`}>
                    
                    {/* Mobile Drag Handle */}
                    <div 
                        className="md:hidden w-full h-12 flex justify-center items-center cursor-pointer active:bg-slate-800/50 transition-colors flex-shrink-0"
                        onClick={() => setIsMobilePanelOpen(!isMobilePanelOpen)}
                    >
                        <div className="w-16 h-1.5 bg-slate-500/80 rounded-full" />
                    </div>

                    <div className="p-4 md:p-6 flex-1 overflow-y-auto custom-scrollbar">
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

                    <div className="p-4 md:p-6 border-t border-slate-800 mb-6 md:mb-0">
                        {!mapData && <FileUploader onProcessed={handleFileProcessed} />}

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
                            <div className="max-w-md text-center px-4">
                                <h2 className="text-2xl md:text-3xl font-bold mb-4">Start by uploading your data</h2>
                                <p className="text-slate-400 mb-8 text-sm md:text-base">Drop your .zip shapefile folder containing .shp, .dbf, and .shx files.</p>
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
