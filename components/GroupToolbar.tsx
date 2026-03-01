import React from 'react';
import { Icons } from './Icons';
import { GROUP_COLORS } from '../hooks';

interface GroupToolbarProps {
    position: { x: number; y: number };
    isDark: boolean;
    currentColor: string;
    showColorPicker: boolean;
    singleGroupSelected: boolean;
    onToggleColorPicker: () => void;
    onColorChange: (color: string) => void;
    onGroup: () => void;
    onUngroup: () => void;
}

export const GroupToolbar: React.FC<GroupToolbarProps> = ({
    position, isDark, currentColor, showColorPicker, singleGroupSelected,
    onToggleColorPicker, onColorChange, onGroup, onUngroup,
}) => {
    return (
        <div className="absolute z-[150] flex flex-col items-center pointer-events-none" style={{ left: position.x, top: position.y - 60, transform: 'translateX(-50%)' }}>
            <div
                className={`pointer-events-auto flex items-center p-1.5 rounded-xl shadow-xl backdrop-blur-md border animate-in fade-in zoom-in-95 duration-200 relative ${isDark ? 'bg-[#1A1D21]/90 border-zinc-700' : 'bg-white/90 border-gray-200'}`}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
            >
                <div className="relative border-r border-gray-500/20 pr-1.5 mr-1.5">
                    <button
                        className={`w-6 h-6 rounded-md border flex items-center justify-center transition-transform hover:scale-105 ${isDark ? 'border-white/10' : 'border-black/5'}`}
                        style={{ backgroundColor: currentColor }}
                        onClick={(e) => { e.stopPropagation(); onToggleColorPicker(); }}
                        title="Select Color"
                    >
                        {showColorPicker ? <Icons.ChevronLeft size={12} className="text-black/50 rotate-90" /> : null}
                    </button>

                    {showColorPicker && (
                        <div className={`absolute top-full left-0 mt-2 p-2 rounded-xl shadow-2xl border grid grid-cols-4 gap-1.5 z-50 min-w-[120px] ${isDark ? 'bg-[#1A1D21] border-zinc-700' : 'bg-white border-gray-200'}`}>
                            {GROUP_COLORS.map(color => (
                                <button
                                    key={color}
                                    className={`w-5 h-5 rounded-full border transition-transform hover:scale-125 ${isDark ? 'border-white/10' : 'border-black/5'} ${color === currentColor ? 'ring-2 ring-cyan-500 ring-offset-1 ring-offset-black/20' : ''}`}
                                    style={{ backgroundColor: color }}
                                    onClick={(e) => { e.stopPropagation(); onColorChange(color); }}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {singleGroupSelected ? (
                    <button onClick={onUngroup} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                        <Icons.LayoutGrid size={14} /> Ungroup
                    </button>
                ) : (
                    <button onClick={onGroup} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${isDark ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-cyan-500 hover:bg-cyan-400 text-white'}`}>
                        <Icons.LayoutGrid size={14} /> Group
                    </button>
                )}
            </div>
        </div>
    );
};
