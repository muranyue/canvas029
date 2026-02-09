import React from 'react';
import { Icons } from './Icons';
import { NodeType } from '../types';

interface QuickAddMenuProps {
    quickAddMenu: { sourceId: string; x: number; y: number; worldX: number; worldY: number };
    isDark: boolean;
    onAddNode: (type: NodeType) => void;
}

export const QuickAddMenu: React.FC<QuickAddMenuProps> = ({ quickAddMenu, isDark, onAddNode }) => {
    const itemClass = isDark
        ? 'text-gray-300 hover:bg-zinc-800 hover:text-white'
        : 'text-gray-700 hover:bg-gray-100 hover:text-black';

    return (
        <div
            className={`fixed z-50 border rounded-lg shadow-2xl py-1 min-w-[160px] flex flex-col animate-in fade-in zoom-in-95 duration-100 ${isDark ? 'bg-[#1A1D21] border-zinc-700' : 'bg-white border-gray-200'}`}
            style={{ left: quickAddMenu.x, top: quickAddMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            data-interactive="true"
        >
            <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b mb-1 ${isDark ? 'text-gray-500 border-zinc-800' : 'text-gray-400 border-gray-100'}`}>Add Node</div>
            <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${itemClass}`} onClick={() => onAddNode(NodeType.TEXT_TO_IMAGE)} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onAddNode(NodeType.TEXT_TO_IMAGE); }} data-interactive="true">
                <Icons.Image size={14} className="text-cyan-400" /> Text to Image
            </button>
            <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${itemClass}`} onClick={() => onAddNode(NodeType.TEXT_TO_VIDEO)} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onAddNode(NodeType.TEXT_TO_VIDEO); }} data-interactive="true">
                <Icons.Video size={14} className="text-cyan-400" /> Text to Video
            </button>
            <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${itemClass}`} onClick={() => onAddNode(NodeType.CREATIVE_DESC)} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onAddNode(NodeType.CREATIVE_DESC); }} data-interactive="true">
                <Icons.FileText size={14} className="text-cyan-400" /> Creative Desc
            </button>
        </div>
    );
};
