"use client";

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import FileUploader from './FileUploader';
import { calculateKanalMarla, calculateDimensions, calculateProjectedArea, KhasraStats, Dimension, CRS } from '@/lib/geo-utils';
import * as turf from '@turf/turf';
import { Layers, Map as MapIcon, Table, Info, Globe, Linkedin, Briefcase, ZoomIn, ZoomOut, Type, ChevronLeft, ChevronRight, HelpCircle, X, Search } from 'lucide-react';

const Map = dynamic<any>(() => import('./Map'), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-slate-900 flex items-center justify-center text-white font-medium">Initializing Map...</div>
});

export type BaseLayer = 'satellite';

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
    const [baseLayer] = useState<BaseLayer>('satellite');
    const [isProcessing, setIsProcessing] = useState(false);
    const [fileVersion, setFileVersion] = useState(0);
    const [labelScale, setLabelScale] = useState(1.0);
    const [isSidebarVisible, setIsSidebarVisible] = useState(true);
    const [isGuideVisible, setIsGuideVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [hoveredPolyId, setHoveredPolyId] = useState<string | null>(null);

    const handleFileProcessed = (geojson: any) => {
        setIsProcessing(true);
        try {
            // Extract fields from the first feature
            const properties = geojson.features[0]?.properties || {};
            const fields = Object.keys(properties);
            if (fields.length > 0 && !labelField) {
                setLabelField(fields[0]);
            }

            const polygons = geojson.features
                .filter((f: any) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
                .map((feature: any, index: number) => {
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

                    <div className="flex items-center gap-1 bg-slate-800/80 rounded-lg p-1 border border-slate-700">
                        <div className="pl-1 pr-1 md:pl-2 flex items-center gap-1.5 text-slate-400">
                            <Type className="w-3 md:w-3.5 h-3 md:h-3.5" />
                            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider">Label Size</span>
                        </div>
                        <button 
                            onClick={() => setLabelScale(prev => Math.max(0.5, prev - 0.1))}
                            className="p-1 md:p-1.5 hover:bg-slate-700 rounded-md transition-colors text-slate-300"
                            title="Decrease Label Size"
                        >
                            <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <div className="px-1 md:px-2 min-w-[32px] text-center">
                            <span className="text-[10px] md:text-xs font-bold text-red-500">{Math.round(labelScale * 100)}%</span>
                        </div>
                        <button 
                            onClick={() => setLabelScale(prev => Math.min(3.0, prev + 0.1))}
                            className="p-1 md:p-1.5 hover:bg-slate-700 rounded-md transition-colors text-slate-300"
                            title="Increase Label Size"
                        >
                            <ZoomIn className="w-3.5 h-3.5" />
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
                    <button
                        onClick={() => setIsGuideVisible(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 md:py-2 text-xs md:text-sm font-medium text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 transition-colors border border-blue-900 md:border-none rounded-lg md:rounded-none"
                    >
                        <HelpCircle className="w-4 h-4" />
                        Guide
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
                                title="View my portfolio"
                            >
                                <Briefcase className="w-4 h-4" />
                                <span className="text-xs font-bold whitespace-nowrap">My Portfolio</span>
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

            <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
                {/* Sidebar / Info Panel */}
                <aside className={`transition-all duration-300 ease-in-out border-slate-800 bg-slate-900/30 flex flex-col z-[5] overflow-hidden
                    ${isSidebarVisible ? 'w-full md:w-80 opacity-100 max-h-[40vh] md:max-h-full border-b md:border-b-0 md:border-r' : 'w-0 h-0 md:h-full md:w-0 opacity-0 max-h-0 border-0'}
                    `}>
                    <div className="p-6 flex-1 overflow-y-auto custom-scrollbar min-w-[300px] md:min-w-[320px]">
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

                                    {/* Search Bar */}
                                    <div className="relative mb-4">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Search className="w-4 h-4 text-slate-500" />
                                        </div>
                                        <input
                                            type="text"
                                            placeholder={`Search by ${labelField}...`}
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full bg-slate-800/80 border border-slate-700 text-sm rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-red-500 text-slate-200 placeholder-slate-500 transition-colors"
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        {mapData.polygons
                                            .filter(poly => {
                                                if (!searchQuery) return true;
                                                const labelValue = String(poly.feature.properties[labelField] || `ID: ${poly.id}`).toLowerCase();
                                                return labelValue.includes(searchQuery.toLowerCase());
                                            })
                                            .map((poly, idx) => {
                                            const isSelected = selectedPolyIds.includes(poly.id);
                                            return (
                                                <div
                                                    key={poly.id}
                                                    className={`p-4 rounded-xl bg-slate-800/50 border ${isSelected ? 'border-red-500' : 'border-slate-700/50'} hover:border-red-500/50 transition-all cursor-pointer group`}
                                                    onClick={() => handleSelectKhasra(poly.id)}
                                                    onMouseEnter={() => setHoveredPolyId(poly.id)}
                                                    onMouseLeave={() => setHoveredPolyId(null)}
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

                        {/* Sidebar Footer Credit */}
                        <div className="mt-auto pt-6 pb-2 text-center border-t border-slate-800/50">
                            <p className="text-[10px] text-slate-500 font-medium tracking-tight">
                                Developed with precision by <span className="text-slate-300 font-bold">Siddique Akbar</span>
                            </p>
                        </div>
                    </div>
                </aside>

                {/* Map Area */}
                <section className="flex-1 relative bg-slate-950 flex flex-col min-w-0">
                    <div className="absolute top-4 left-4 z-[2005]">
                        <button
                            onClick={() => setIsSidebarVisible(!isSidebarVisible)}
                            className="p-2 md:p-2.5 bg-red-600 text-white rounded-lg shadow-2xl transition-all duration-300 hover:bg-red-700 hover:scale-105 active:scale-95 flex items-center gap-2 border border-red-500/50"
                            title={isSidebarVisible ? "Hide side panel" : "Show side panel"}
                        >
                            {isSidebarVisible ? (
                                <>
                                    <ChevronLeft size={16} className="md:w-[18px] md:h-[18px]" />
                                    <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider">Hide Side Panel</span>
                                </>
                            ) : (
                                <>
                                    <ChevronRight size={16} className="md:w-[18px] md:h-[18px]" />
                                    <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider">Show Side Panel</span>
                                </>
                            )}
                        </button>
                    </div>

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
                            hoveredPolyId={hoveredPolyId}
                            labelField={labelField}
                            baseLayer={baseLayer}
                            fileVersion={fileVersion}
                            onSelect={handleSelectKhasra}
                            labelScale={labelScale}
                            isSidebarVisible={isSidebarVisible}
                        />
                    </div>
                </section>
            </main>

            {/* Guide Modal Overlay */}
            {isGuideVisible && (
                <div className="absolute inset-0 z-[9999] p-4 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-800/50">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <HelpCircle className="w-5 h-5 text-blue-400" />
                                User Guide & Tools
                            </h2>
                            <button onClick={() => setIsGuideVisible(false)} className="text-slate-400 hover:text-white transition-colors p-1">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-5 text-sm text-slate-300 overflow-y-auto max-h-[70vh] custom-scrollbar">
                            
                            <div>
                                <h3 className="font-bold text-white mb-1">📐 Dimension Labels (K vs ft)</h3>
                                <p>When you select a Khasra/Polygon, side dimensions will be drawn. The labels use <strong>K</strong> for <em>Karam</em> and <strong>ft</strong> for <em>Feet</em>. This ensures you can read both common regional measurements at a glance.</p>
                            </div>

                            <div>
                                <h3 className="font-bold text-white mb-1">🏷️ Label Field Column</h3>
                                <p>You can choose which attribute from your Shapefile/KML data is used to label the polygons. Open the side panel and look for the <strong>Label By</strong> dropdown at the top of the Khasra list to change the active column.</p>
                            </div>

                            <div>
                                <h3 className="font-bold text-white mb-1">🔍 Label Size</h3>
                                <p>Use the <strong>Label Size</strong> (+ / -) controls in the top navigation bar. This scales all text annotations on the map so you can make them perfectly legible no matter how zoomed in or out you are.</p>
                            </div>

                            <div>
                                <h3 className="font-bold text-white mb-1">🌐 Map Projection</h3>
                                <p>Choose the correct <strong>Projection</strong> (e.g. UTM Zone 42N/43N) from the top bar to ensure the area and dimension calculations perfectly match ground truth distances for your region.</p>
                            </div>

                        </div>
                        <div className="p-4 border-t border-slate-800 bg-slate-800/30 text-right">
                            <button onClick={() => setIsGuideVisible(false)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors">
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
