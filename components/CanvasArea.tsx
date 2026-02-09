import React from 'react';
import { NodeData, CanvasTransform, Point, NodeType } from '../types';
import BaseNode from './Nodes/BaseNode';
import { NodeContent } from './Nodes/NodeContent';
import { Minimap } from './Minimap';
import { GroupToolbar } from './GroupToolbar';
import { Icons } from './Icons';

interface CanvasAreaProps {
    // Refs
    containerRef: React.RefObject<HTMLDivElement | null>;
    connectionStartRef: React.MutableRefObject<{ nodeId: string; type: 'source' | 'target' } | null>;
    // State
    nodes: NodeData[];
    visibleNodes: NodeData[];
    visibleConnections: { id: string; sourceId: string; targetId: string }[];
    transform: CanvasTransform;
    canvasBg: string;
    selectedNodeIds: Set<string>;
    selectedConnectionId: string | null;
    selectionBox: { x: number; y: number; w: number; h: number } | null;
    dragMode: string;
    tempConnection: Point | null;
    suggestedNodes: NodeData[];
    showMinimap: boolean;
    showColorPicker: boolean;
    nextGroupColor: string;
    viewportSize: { width: number; height: number };
    isDark: boolean;
    // Node operations
    getInputImages: (nodeId: string) => { src: string; isVideo: boolean }[];
    updateNodeData: (id: string, updates: Partial<NodeData>) => void;
    handleGenerate: (id: string) => void;
    handleMaximize: (id: string, setPreviewMedia: any) => void;
    handleDownload: (id: string) => void;
    handleToolbarAction: (nodeId: string, action: string) => void;
    deleteNode: (id: string) => void;
    setPreviewMedia: React.Dispatch<React.SetStateAction<{ url: string; type: 'image' | 'video' } | null>>;
    setSelectedConnectionId: React.Dispatch<React.SetStateAction<string | null>>;
    setShowColorPicker: React.Dispatch<React.SetStateAction<boolean>>;
    removeConnection: (id: string) => void;
    setShowMinimap: React.Dispatch<React.SetStateAction<boolean>>;
    // Grouping
    handleGroupSelection: () => void;
    handleUngroup: () => void;
    handleGroupColorChange: (color: string) => void;
    getSelectionCenter: (transform: CanvasTransform) => { x: number; y: number } | null;
    // Canvas handlers
    handleMouseDown: (e: React.MouseEvent) => void;
    handleMouseMove: (e: React.MouseEvent) => void;
    handleMouseUp: (e: React.MouseEvent) => void;
    handleWheel: (e: React.WheelEvent) => void;
    handleCanvasContextMenu: (e: React.MouseEvent) => void;
    handleDragOver: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent) => void;
    handleTouchStart: (e: React.TouchEvent) => void;
    handleTouchMove: (e: React.TouchEvent) => void;
    handleTouchEnd: (e: React.TouchEvent) => void;
    // Node handlers
    handleNodeMouseDown: (e: React.MouseEvent, id: string) => void;
    handleNodeTouchStart: (e: React.TouchEvent, id: string) => void;
    handleNodeTouchEnd: (e: React.TouchEvent, id: string) => void;
    handleNodeClick: (e: React.MouseEvent, id: string) => void;
    handleNodeContextMenu: (e: React.MouseEvent, id: string, type: NodeType) => void;
    handleResizeStart: (e: React.MouseEvent, nodeId: string, direction: string) => void;
    handleConnectStart: (e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => void;
    handleConnectTouchStart: (e: React.TouchEvent, nodeId: string, type: 'source' | 'target') => void;
    handlePortMouseUp: (e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => void;
    // Zoom
    handleResetZoom: () => void;
    handleZoom: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleNavigate: (x: number, y: number) => void;
}

export const CanvasArea: React.FC<CanvasAreaProps> = ({
    containerRef, connectionStartRef,
    nodes, visibleNodes, visibleConnections, transform, canvasBg,
    selectedNodeIds, selectedConnectionId, selectionBox, dragMode,
    tempConnection, suggestedNodes, showMinimap, showColorPicker, nextGroupColor,
    viewportSize, isDark,
    getInputImages, updateNodeData, handleGenerate, handleMaximize, handleDownload,
    handleToolbarAction, deleteNode, setPreviewMedia, setSelectedConnectionId, setShowColorPicker,
    removeConnection, setShowMinimap,
    handleGroupSelection, handleUngroup, handleGroupColorChange, getSelectionCenter,
    handleMouseDown, handleMouseMove, handleMouseUp, handleWheel,
    handleCanvasContextMenu, handleDragOver, handleDrop,
    handleTouchStart, handleTouchMove, handleTouchEnd,
    handleNodeMouseDown, handleNodeTouchStart, handleNodeTouchEnd, handleNodeClick,
    handleNodeContextMenu, handleResizeStart, handleConnectStart, handleConnectTouchStart, handlePortMouseUp,
    handleResetZoom, handleZoom, handleNavigate,
}) => {
    // Group Toolbar logic
    const isMultiSelect = selectedNodeIds.size > 1;
    const singleGroupSelected = selectedNodeIds.size === 1 && nodes.find(n => n.id === Array.from(selectedNodeIds)[0])?.type === NodeType.GROUP;
    const showGroupToolbar = isMultiSelect || singleGroupSelected;
    const groupToolbarPos = showGroupToolbar ? getSelectionCenter(transform) : null;

    return (
        <div
            ref={containerRef}
            className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing grid-pattern"
            style={{ backgroundColor: canvasBg, '--grid-color': isDark ? '#27272a' : '#E4E4E7' } as React.CSSProperties}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={handleCanvasContextMenu}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Connections SVG - Outside transform div, uses internal g transform */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-0">
                <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
                    {visibleConnections.map(conn => {
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
                            <g key={conn.id} className="pointer-events-auto cursor-pointer group" onClick={(e) => { e.stopPropagation(); setSelectedConnectionId(conn.id); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedConnectionId(conn.id); }}>
                                <path d={d} stroke={isSelected ? (isDark ? "#ffffff" : "#000000") : (isDark ? "#52525b" : "#a1a1aa")} strokeWidth={2} fill="none" className="transition-colors duration-200 group-hover:stroke-cyan-500" />
                                <path d={d} stroke="transparent" strokeWidth={20} fill="none" />
                                <foreignObject x={(sx + tx) / 2 - 12} y={(sy + ty) / 2 - 12} width={24} height={24} className={`overflow-visible pointer-events-auto transition-opacity duration-200 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                    <button className={`w-6 h-6 flex items-center justify-center border rounded-full transition-all shadow-md focus:outline-none ${isDark ? 'bg-[#1A1D21] border-zinc-600 text-zinc-400 hover:text-red-500 hover:border-red-500' : 'bg-white border-gray-300 text-gray-400 hover:text-red-600 hover:border-red-600'}`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); removeConnection(conn.id); }} onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); removeConnection(conn.id); }} title="Disconnect">
                                        <Icons.Scissors size={14} />
                                    </button>
                                </foreignObject>
                            </g>
                        );
                    })}
                    {dragMode === 'CONNECT' && connectionStartRef.current && tempConnection && (() => {
                        const startNode = nodes.find(n => n.id === connectionStartRef.current?.nodeId);
                        if (!startNode) return null;
                        return (
                            <path d={`M ${startNode.x + startNode.width} ${startNode.y + startNode.height / 2} L ${tempConnection.x} ${tempConnection.y}`} stroke={isDark ? "#52525b" : "#a1a1aa"} strokeWidth={2} strokeDasharray="5,5" fill="none" />
                        );
                    })()}
                </g>
            </svg>

            {/* Canvas Content - Nodes */}
            <div
                className="absolute origin-top-left will-change-transform"
                style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}
            >
                {/* Nodes */}
                {visibleNodes.map(node => (
                    <BaseNode
                        key={node.id}
                        data={node}
                        selected={selectedNodeIds.has(node.id)}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        onTouchStart={(e) => handleNodeTouchStart(e, node.id)}
                        onTouchEnd={(e) => handleNodeTouchEnd(e, node.id)}
                        onClick={(e) => handleNodeClick(e, node.id)}
                        onContextMenu={(e) => handleNodeContextMenu(e, node.id, node.type)}
                        onResizeStart={(e, dir) => handleResizeStart(e, node.id, dir)}
                        onConnectStart={(e, type) => handleConnectStart(e, node.id, type)}
                        onConnectTouchStart={(e, type) => handleConnectTouchStart(e, node.id, type)}
                        onPortMouseUp={(e, nodeId, type) => handlePortMouseUp(e, nodeId, type)}
                        isDark={isDark}
                        scale={transform.k}
                    >
                        <NodeContent
                            data={node}
                            updateData={updateNodeData}
                            onGenerate={handleGenerate}
                            selected={selectedNodeIds.has(node.id)}
                            showControls={selectedNodeIds.size === 1 && selectedNodeIds.has(node.id)}
                            inputs={getInputImages(node.id)}
                            onMaximize={(id) => handleMaximize(id, setPreviewMedia)}
                            onDownload={handleDownload}
                            onDelete={deleteNode}
                            onToolbarAction={handleToolbarAction}
                            isDark={isDark}
                            isSelecting={dragMode === 'SELECT' || dragMode === 'DRAG_NODE'}
                        />
                    </BaseNode>
                ))}

                {/* Suggested Nodes */}
                {suggestedNodes.map(node => (
                    <div
                        key={`suggest-${node.id}`}
                        className="absolute border-2 border-dashed border-cyan-500/50 rounded-xl pointer-events-none"
                        style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
                    />
                ))}
            </div>

            {/* Selection Box */}
            {selectionBox && (
                <div
                    className="absolute border border-cyan-500 bg-cyan-500/10 pointer-events-none"
                    style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.w, height: selectionBox.h }}
                />
            )}

            {/* Zoom Controls + Minimap */}
            <div className="absolute bottom-24 right-6 md:bottom-6 flex flex-col-reverse items-end gap-3 z-[100] pointer-events-none transition-all duration-300">
                <div className={`flex items-center gap-3 px-3 py-1.5 rounded-full shadow-lg pointer-events-auto border backdrop-blur-md ${isDark ? 'bg-[#1A1D21]/90 border-zinc-700 text-gray-300' : 'bg-white/90 border-gray-200 text-gray-600'}`}>
                    <button
                        onClick={() => setShowMinimap(!showMinimap)}
                        onTouchEnd={(e: React.TouchEvent) => { e.preventDefault(); e.stopPropagation(); setShowMinimap(!showMinimap); }}
                        className={`hidden md:block p-1 rounded-full transition-colors ${isDark ? 'hover:bg-zinc-700 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-black'} ${showMinimap ? (isDark ? 'text-cyan-400' : 'text-cyan-600') : ''}`}
                        title={showMinimap ? "Hide Minimap" : "Show Minimap"}
                    >
                        <Icons.Map size={16} />
                    </button>
                    <div className={`hidden md:block w-px h-4 ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`}></div>
                    <button
                        onClick={handleResetZoom}
                        onTouchEnd={(e: React.TouchEvent) => { e.preventDefault(); e.stopPropagation(); handleResetZoom(); }}
                        className={`p-1 rounded-full transition-colors ${isDark ? 'hover:bg-zinc-700 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-black'}`}
                        title="Reset Zoom (100%)"
                    >
                        <Icons.Maximize2 size={16} />
                    </button>
                    <input type="range" min="0.4" max="2" step="0.1" value={transform.k} onChange={handleZoom} className="w-20 h-1 accent-cyan-500 cursor-pointer" style={{ touchAction: 'auto' }} />
                    <span className={`text-xs font-mono w-8 text-right ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{Math.round(transform.k * 100)}%</span>
                </div>

                {showMinimap && (
                    <div className="pointer-events-auto hidden md:block">
                        <Minimap nodes={nodes} transform={transform} viewportSize={viewportSize} isDark={isDark} onNavigate={handleNavigate} />
                    </div>
                )}
            </div>

            {/* Group Toolbar */}
            {showGroupToolbar && groupToolbarPos && (
                <GroupToolbar
                    position={groupToolbarPos}
                    isDark={isDark}
                    currentColor={nextGroupColor}
                    showColorPicker={showColorPicker}
                    singleGroupSelected={!!singleGroupSelected}
                    onToggleColorPicker={() => setShowColorPicker(!showColorPicker)}
                    onColorChange={handleGroupColorChange}
                    onGroup={handleGroupSelection}
                    onUngroup={handleUngroup}
                />
            )}
        </div>
    );
};
