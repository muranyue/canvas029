import React from 'react';
import { Icons } from './Icons';
import { NodeData, NodeType } from '../types';

interface QuickConnectSuggestionsProps {
    suggestedNodes: NodeData[];
    mousePos: { x: number; y: number };
    isDark: boolean;
    onConnect: (targetNodeId: string) => void;
}

export const QuickConnectSuggestions: React.FC<QuickConnectSuggestionsProps> = ({
    suggestedNodes, mousePos, isDark, onConnect,
}) => {
    return (
        <div
            className={`fixed z-50 border rounded-xl shadow-2xl p-2 flex flex-col gap-1 w-48 pointer-events-auto ${isDark ? 'bg-[#1A1D21] border-zinc-700' : 'bg-white border-gray-200'}`}
            style={{ left: mousePos.x + 20, top: mousePos.y }}
        >
            <div className={`text-[10px] uppercase font-bold px-2 py-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Quick Connect</div>
            {suggestedNodes.map(node => (
                <button
                    key={node.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${isDark ? 'hover:bg-zinc-800 text-gray-300 hover:text-cyan-400' : 'hover:bg-gray-100 text-gray-700 hover:text-cyan-600'}`}
                    onClick={(e) => { e.stopPropagation(); onConnect(node.id); }}
                >
                    {node.type === NodeType.TEXT_TO_VIDEO ? <Icons.Video size={12} /> : <Icons.Image size={12} />}
                    <span className="truncate">{node.title}</span>
                </button>
            ))}
        </div>
    );
};
