import React from 'react';
import { Icons } from './Icons';
import { NodeData, Connection, CanvasTransform, Point } from '../types';

interface ConnectionsLayerProps {
    connections: Connection[];
    nodes: NodeData[];
    transform: CanvasTransform;
    selectedConnectionId: string | null;
    isDark: boolean;
    dragMode: string;
    connectionStartNodeId: string | null;
    tempConnection: Point | null;
    onSelectConnection: (id: string) => void;
    onRemoveConnection: (id: string) => void;
}

export const ConnectionsLayer: React.FC<ConnectionsLayerProps> = ({
    connections, nodes, transform, selectedConnectionId, isDark,
    dragMode, connectionStartNodeId, tempConnection,
    onSelectConnection, onRemoveConnection,
}) => {
    return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-0">
            <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
                {connections.map(conn => {
                    const source = nodes.find(n => n.id === conn.sourceId);
                    const target = nodes.find(n => n.id === conn.targetId);
                    if (!source || !target) return null;
                    const sx = source.x + source.width;
                    const sy = source.y + source.height / 2;
                    const tx = target.x;
                    const ty = target.y + target.height / 2;
                    const dist = Math.abs(tx - sx);
                    const cp = Math.min(80, Math.max(24, dist / 2));
                    const d = `M ${sx} ${sy} C ${sx + cp} ${sy}, ${tx - cp} ${ty}, ${tx} ${ty}`;
                    const isSelected = selectedConnectionId === conn.id;
                    return (
                        <g key={conn.id} className="pointer-events-auto cursor-pointer group" onClick={(e) => { e.stopPropagation(); onSelectConnection(conn.id); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onSelectConnection(conn.id); }}>
                            <path d={d} stroke={isSelected ? (isDark ? "#ffffff" : "#000000") : (isDark ? "#52525b" : "#a1a1aa")} strokeWidth={2} fill="none" className="transition-colors duration-200 group-hover:stroke-cyan-500" />
                            <path d={d} stroke="transparent" strokeWidth={20} fill="none" />
                            <foreignObject x={(sx + tx) / 2 - 12} y={(sy + ty) / 2 - 12} width={24} height={24} className={`overflow-visible pointer-events-auto transition-opacity duration-200 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                <button className={`w-6 h-6 flex items-center justify-center border rounded-full transition-all shadow-md focus:outline-none ${isDark ? 'bg-[#1A1D21] border-zinc-600 text-zinc-400 hover:text-red-500 hover:border-red-500' : 'bg-white border-gray-300 text-gray-400 hover:text-red-600 hover:border-red-600'}`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemoveConnection(conn.id); }} onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onRemoveConnection(conn.id); }} title="Disconnect">
                                    <Icons.Scissors size={14} />
                                </button>
                            </foreignObject>
                        </g>
                    );
                })}
                {dragMode === 'CONNECT' && connectionStartNodeId && tempConnection && (() => {
                    const startNode = nodes.find(n => n.id === connectionStartNodeId);
                    if (!startNode) return null;
                    return (
                        <path d={`M ${startNode.x + startNode.width} ${startNode.y + startNode.height / 2} L ${tempConnection.x} ${tempConnection.y}`} stroke={isDark ? "#52525b" : "#a1a1aa"} strokeWidth={2} strokeDasharray="5,5" fill="none" />
                    );
                })()}
            </g>
        </svg>
    );
};
