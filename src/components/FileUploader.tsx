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

    const processFiles = async (files: FileList | File[]) => {
        const fileList = Array.from(files);
        const zipFile = fileList.find(f => f.name.endsWith('.zip'));

        if (zipFile) {
            setFileName(zipFile.name);
            setStatus('processing');
            try {
                const buffer = await zipFile.arrayBuffer();
                const geojson = await shp(buffer);
                setStatus('success');
                onProcessed(geojson);
            } catch (error) {
                console.error('Zip parsing error:', error);
                setStatus('error');
            }
            return;
        }

        // Handle individual files
        const shpFile = fileList.find(f => f.name.endsWith('.shp'));
        const dbfFile = fileList.find(f => f.name.endsWith('.dbf'));

        if (!shpFile) {
            alert('Please upload at least a .shp file (and ideally .dbf and .shx).');
            return;
        }

        setFileName(`${shpFile.name} (+ ${fileList.length - 1} files)`);
        setStatus('processing');

        try {
            const shpBuffer = await shpFile.arrayBuffer();
            const dbfBuffer = dbfFile ? await dbfFile.arrayBuffer() : undefined;

            const geometries = shp.parseShp(shpBuffer);
            // @ts-ignore - shp.parseDbf usually takes one argument for basic use, types might vary
            const properties = dbfBuffer ? shp.parseDbf(dbfBuffer) : geometries.map(() => ({}));
            const geojson = shp.combine([geometries, properties]);

            setStatus('success');
            onProcessed(geojson);
        } catch (error) {
            console.error('Individual file parsing error:', error);
            setStatus('error');
        }
    };

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files.length > 0) processFiles(files);
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
                multiple
                accept=".zip,.shp,.dbf,.shx"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) processFiles(files);
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
                        {status === 'idle' && 'Upload Shapefile Components'}
                        {status === 'processing' && 'Processing Data...'}
                        {status === 'success' && 'Ready to view'}
                        {status === 'error' && 'Error parsing file'}
                    </p>
                    <p className="text-xs text-slate-500">
                        {fileName || 'Drop .shp, .dbf, .shx (or .zip)'}
                    </p>
                </div>
            </div>
        </div>
    );
}
