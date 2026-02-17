"use client";

import React, { useCallback, useState } from 'react';
import { Upload, FileType, CheckCircle, AlertCircle } from 'lucide-react';
import shp from 'shpjs';

interface FileUploaderProps {
    onProcessed: (geojson: any) => void;
}

export default function FileUploader({ onProcessed }: FileUploaderProps) {
    const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
    const [fileName, setFileName] = useState<string | null>(null);

    const processFile = async (file: File) => {
        if (!file.name.endsWith('.zip')) {
            alert('Please upload a .zip file containing the shapefile components.');
            return;
        }

        setFileName(file.name);
        setStatus('processing');

        try {
            const buffer = await file.arrayBuffer();
            // shpjs automatically parses the zip and returns GeoJSON
            const geojson = await shp(buffer);
            setStatus('success');
            onProcessed(geojson);
        } catch (error) {
            console.error('File parsing error:', error);
            setStatus('error');
        }
    };

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    }, []);

    return (
        <div
            className={`
        relative group border-2 border-dashed rounded-2xl p-8 transition-all
        ${status === 'idle' ? 'border-slate-700 hover:border-red-500 bg-slate-900/50' : ''}
        ${status === 'processing' ? 'border-amber-500 bg-amber-500/5' : ''}
        ${status === 'success' ? 'border-green-500 bg-green-500/5' : ''}
        ${status === 'error' ? 'border-red-500 bg-red-500/5' : ''}
      `}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
        >
            <input
                type="file"
                accept=".zip"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) processFile(file);
                }}
            />

            <div className="flex flex-col items-center text-center gap-4">
                <div className={`
          p-3 rounded-xl transition-colors
          ${status === 'idle' ? 'bg-slate-800 text-slate-400 group-hover:bg-red-500 group-hover:text-white' : ''}
          ${status === 'processing' ? 'bg-amber-500 text-white' : ''}
          ${status === 'success' ? 'bg-green-500 text-white' : ''}
          ${status === 'error' ? 'bg-red-500 text-white' : ''}
        `}>
                    {status === 'idle' && <Upload className="w-6 h-6" />}
                    {status === 'processing' && <FileType className="w-6 h-6 animate-pulse" />}
                    {status === 'success' && <CheckCircle className="w-6 h-6" />}
                    {status === 'error' && <AlertCircle className="w-6 h-6" />}
                </div>

                <div>
                    <p className="text-sm font-semibold mb-1">
                        {status === 'idle' && 'Select Zipped Shapefile'}
                        {status === 'processing' && 'Processing Data...'}
                        {status === 'success' && 'Ready to view'}
                        {status === 'error' && 'Error parsing file'}
                    </p>
                    <p className="text-xs text-slate-500">
                        {fileName || 'Drop .zip or browse local files'}
                    </p>
                </div>
            </div>
        </div>
    );
}
