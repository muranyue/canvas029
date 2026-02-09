import React from 'react';
import { Icons } from './Icons';
import { CanvasTransform, NodeData } from '../types';
import { Minimap } from './Minimap';

interface ZoomControlsProps {
    transform: CanvasTransform;
    isDark: boolean;
    showMinimap: boolean;
    nodes: NodeData[];
    viewportSize: { width: number; height: number };
    onToggleMinimap: () => void;
    onResetZoom: () => void;
    onZoomChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onNavigate: (x: number, y: number) => void;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
    transform, isDark, showMinimap, nodes, viewportSize,
    onToggleMinimap, onResetZoom, onZoomChange, onNavigate,
}) => {
    return (
        <div className="absolute bottom-24 right-6 md:bottom-6 flex flex-col items-end gap-3 z-[100] pointer-events-none transition-all duration-300">
            {showMinimap && (
                <div className="pointer-events-auto hidden md:block">
                    <Minimap nodes={nodes} transform={transform} viewportSize={viewportSize} isDark={isDark} onNavigate={onNavigate} />
                </div>
            )}

            <div className={`flex items-center gap-3 px-3 py-1.5 rounded-full shadow-lg pointer-events-auto border backdrop-blur-md ${isDark ? 'bg-[#1A1D21]/90 border-zinc-700 text-gray-300' : 'bg-white/90 border-gray-200 text-gray-600'}`}>
                <button
                    onClick={onToggleMinimap}
                    onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onToggleMinimap(); }}
                    className={`hidden md:block p-1 rounded-full transition-colors ${isDark ? 'hover:bg-zinc-700 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-black'} ${showMinimap ? (isDark ? 'text-cyan-400' : 'text-cyan-600') : ''}`}
                    title={showMinimap ? "Hide Minimap" : "Show Minimap"}
                >
                    <Icons.Map size={16} />
                </button>
                <div className={`hidden md:block w-px h-4 ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`}></div>
                <button
                    onClick={onResetZoom}
                    onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onResetZoom(); }}
                    className={`p-1 rounded-full transition-colors ${isDark ? 'hover:bg-zinc-700 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-black'}`}
                    title="Reset Zoom (100%)"
                >
                    <Icons.Maximize2 size={16} />
                </button>
                <input type="range" min="0.4" max="2" step="0.1" value={transform.k} onChange={onZoomChange} className="w-20 h-1 accent-cyan-500 cursor-pointer" />
                <span className={`text-xs font-mono w-8 text-right ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{Math.round(transform.k * 100)}%</span>
            </div>
        </div>
    );
};
