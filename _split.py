#!/usr/bin/env python3
import os

base = 'components'

files = {}

# ============================================================
# 1. QuickAddMenu.tsx
# ============================================================
files[os.path.join(base, 'QuickAddMenu.tsx')] = '''import React from 'react';
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
'''

# ============================================================
# 2. NewWorkflowDialog.tsx
# ============================================================
files[os.path.join(base, 'NewWorkflowDialog.tsx')] = '''import React from 'react';
import { Icons } from './Icons';

interface NewWorkflowDialogProps {
    isDark: boolean;
    onClose: () => void;
    onConfirmNew: (shouldSave: boolean) => void;
}

export const NewWorkflowDialog: React.FC<NewWorkflowDialogProps> = ({ isDark, onClose, onConfirmNew }) => {
    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
            onTouchEnd={(e) => { e.preventDefault(); onClose(); }}
        >
            <div
                className={`w-[400px] max-w-[90vw] p-6 rounded-2xl shadow-2xl border flex flex-col gap-4 transform transition-all scale-100 ${isDark ? 'bg-[#1A1D21] border-zinc-700 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}
                onClick={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
            >
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Icons.FilePlus size={20} className="text-cyan-500" />Create New Workflow
                    </h3>
                    <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Do you want to save your current workflow before creating a new one? <br />Any unsaved changes will be permanently lost.
                    </p>
                </div>
                <div className={`flex flex-wrap justify-end gap-2 mt-2 pt-4 border-t ${isDark ? 'border-zinc-800' : 'border-gray-100'}`}>
                    <button
                        onClick={onClose}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
                        className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${isDark ? 'hover:bg-zinc-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}
                    >Cancel</button>
                    <button
                        onClick={() => onConfirmNew(false)}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onConfirmNew(false); }}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${isDark ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'}`}
                    >Don't Save</button>
                    <button
                        onClick={() => onConfirmNew(true)}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onConfirmNew(true); }}
                        className={`px-4 py-2 rounded-lg text-xs font-bold text-white transition-colors shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 ${isDark ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-cyan-500 hover:bg-cyan-400'}`}
                    ><Icons.Save size={14} />Save & New</button>
                </div>
            </div>
        </div>
    );
};
'''

# ============================================================
# 3. GroupToolbar.tsx
# ============================================================
files[os.path.join(base, 'GroupToolbar.tsx')] = '''import React from 'react';
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
            <div className={`pointer-events-auto flex items-center p-1.5 rounded-xl shadow-xl backdrop-blur-md border animate-in fade-in zoom-in-95 duration-200 relative ${isDark ? 'bg-[#1A1D21]/90 border-zinc-700' : 'bg-white/90 border-gray-200'}`}>
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
'''

# ============================================================
# 4. PreviewModal.tsx
# ============================================================
files[os.path.join(base, 'PreviewModal.tsx')] = '''import React from 'react';
import { Icons } from './Icons';

interface PreviewModalProps {
    previewMedia: { url: string; type: 'image' | 'video' };
    onClose: () => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({ previewMedia, onClose }) => {
    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={onClose}
            onTouchEnd={(e) => { e.preventDefault(); onClose(); }}
        >
            <button
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                onClick={onClose}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
            >
                <Icons.X size={24} />
            </button>
            {previewMedia.type === 'image' ? (
                <img src={previewMedia.url} alt="Preview" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
            ) : (
                <video src={previewMedia.url} controls autoPlay className="max-w-[90vw] max-h-[90vh] rounded-lg" onClick={(e) => e.stopPropagation()} />
            )}
        </div>
    );
};
'''

# ============================================================
# 5. ConnectionsLayer.tsx
# ============================================================
files[os.path.join(base, 'ConnectionsLayer.tsx')] = '''import React from 'react';
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
'''

# ============================================================
# 6. ZoomControls.tsx
# ============================================================
files[os.path.join(base, 'ZoomControls.tsx')] = '''import React from 'react';
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
'''

# ============================================================
# 7. QuickConnectSuggestions.tsx
# ============================================================
files[os.path.join(base, 'QuickConnectSuggestions.tsx')] = '''import React from 'react';
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
'''

# Write all files
for path, content in files.items():
    with open(path, 'w') as f:
        f.write(content.lstrip('\n'))
    print(f"Created: {path}")

print("All component files created!")
