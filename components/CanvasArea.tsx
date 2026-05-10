import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NodeData, CanvasTransform, Point, NodeType } from '../types';
import BaseNode from './Nodes/BaseNode';
import { NodeContent } from './Nodes/NodeContent';
import { Minimap } from './Minimap';
import { GroupToolbar } from './GroupToolbar';
import { ConnectionsLayer } from './ConnectionsLayer';
import { Icons } from './Icons';

function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
    const callbackRef = useRef(callback);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    return useCallback(((...args: any[]) => callbackRef.current(...args)) as T, []);
}

interface CanvasNodeItemProps {
    node: NodeData;
    selected: boolean;
    bulkConnectTarget: boolean;
    showControls: boolean;
    inputs: { src: string; isVideo: boolean }[];
    isDark: boolean;
    isSelecting: boolean;
    updateNodeData: (id: string, updates: Partial<NodeData>) => void;
    handleGenerate: (id: string) => void;
    handleMaximize: (id: string, setPreviewMedia: any, media?: { url: string; type: 'image' | 'video' }) => void;
    handleDownload: (id: string) => void;
    handleUploadToAssetLibrary: (id: string) => void;
    handleToolbarAction: (nodeId: string, action: string) => void;
    handleUpload: (id: string) => void;
    deleteNode: (id: string) => void;
    setPreviewMedia: React.Dispatch<React.SetStateAction<{ url: string; type: 'image' | 'video' } | null>>;
    handleNodeMouseDown: (e: React.MouseEvent, id: string) => void;
    handleNodeTouchStart: (e: React.TouchEvent, id: string) => void;
    handleNodeTouchEnd: (e: React.TouchEvent, id: string) => void;
    handleNodeClick: (e: React.MouseEvent, id: string) => void;
    handleNodeContextMenu: (e: React.MouseEvent, id: string, type: NodeType) => void;
    handleResizeStart: (e: React.MouseEvent, nodeId: string, direction: string) => void;
    handleConnectStart: (e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => void;
    handleConnectTouchStart: (e: React.TouchEvent, nodeId: string, type: 'source' | 'target') => void;
    handlePortMouseUp: (e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => void;
    scale: number;
}

const CanvasNodeItem = React.memo(({
    node,
    selected,
    bulkConnectTarget,
    showControls,
    inputs,
    isDark,
    isSelecting,
    updateNodeData,
    handleGenerate,
    handleMaximize,
    handleDownload,
    handleUploadToAssetLibrary,
    handleToolbarAction,
    handleUpload,
    deleteNode,
    setPreviewMedia,
    handleNodeMouseDown,
    handleNodeTouchStart,
    handleNodeTouchEnd,
    handleNodeClick,
    handleNodeContextMenu,
    handleResizeStart,
    handleConnectStart,
    handleConnectTouchStart,
    handlePortMouseUp,
    scale,
}: CanvasNodeItemProps) => (
    <BaseNode
        data={node}
        selected={selected}
        bulkConnectTarget={bulkConnectTarget}
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
        scale={scale}
    >
        <NodeContent
            data={node}
            updateData={updateNodeData}
            onGenerate={handleGenerate}
            selected={selected}
            showControls={showControls}
            inputs={inputs}
            onMaximize={(id, media) => handleMaximize(id, setPreviewMedia, media)}
            onDownload={handleDownload}
            onUploadToAssetLibrary={handleUploadToAssetLibrary}
            onDelete={deleteNode}
            onToolbarAction={handleToolbarAction}
            onUpload={handleUpload}
            isDark={isDark}
            isSelecting={isSelecting}
        />
    </BaseNode>
), (prev, next) => {
    return prev.node === next.node &&
        prev.selected === next.selected &&
        prev.bulkConnectTarget === next.bulkConnectTarget &&
        prev.showControls === next.showControls &&
        prev.inputs === next.inputs &&
        prev.isDark === next.isDark &&
        prev.isSelecting === next.isSelecting &&
        prev.scale === next.scale;
});

interface CanvasAreaProps {
    // Refs
    containerRef: React.RefObject<HTMLDivElement | null>;
    connectionStartRef: React.MutableRefObject<{ nodeId: string; type: 'source' | 'target' } | null>;
    // State
    nodes: NodeData[];
    visibleNodes: NodeData[];
    visibleConnections: { id: string; sourceId: string; targetId: string }[];
    nodeById: Map<string, NodeData>;
    transform: CanvasTransform;
    canvasBg: string;
    selectedNodeIds: Set<string>;
    selectedConnectionId: string | null;
    selectionBox: { x: number; y: number; w: number; h: number } | null;
    dragMode: string;
    bulkConnectSourceIds: Set<string> | null;
    draggingNodeIds: Set<string>;
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
    handleUploadToAssetLibrary: (id: string) => void;
    handleToolbarAction: (nodeId: string, action: string) => void;
    handleUpload: (id: string) => void;
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
    setBulkConnectSourceIds: React.Dispatch<React.SetStateAction<Set<string> | null>>;
    getSelectionCenter: (transform: CanvasTransform) => { x: number; y: number } | null;
    // Canvas handlers
    handleMouseDown: (e: React.MouseEvent) => void;
    handleMouseMove: (e: React.MouseEvent) => void;
    handleMouseUp: (e: React.MouseEvent) => void;
    handleWheel: (e: React.WheelEvent) => void;
    handleCanvasContextMenu: (e: React.MouseEvent) => void;
    handleCanvasDoubleClick: (e: React.MouseEvent) => void;
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

const CanvasAreaComponent: React.FC<CanvasAreaProps> = ({
    containerRef, connectionStartRef,
    nodes, visibleNodes, visibleConnections, nodeById, transform, canvasBg,
    selectedNodeIds, selectedConnectionId, selectionBox, dragMode, bulkConnectSourceIds,
    draggingNodeIds, tempConnection, suggestedNodes, showMinimap, showColorPicker, nextGroupColor,
    viewportSize, isDark,
    getInputImages, updateNodeData, handleGenerate, handleMaximize, handleDownload, handleUploadToAssetLibrary,
    handleToolbarAction, handleUpload, deleteNode, setPreviewMedia, setSelectedConnectionId, setShowColorPicker,
    removeConnection, setShowMinimap,
    handleGroupSelection, handleUngroup, handleGroupColorChange, setBulkConnectSourceIds, getSelectionCenter,
    handleMouseDown, handleMouseMove, handleMouseUp, handleWheel,
    handleCanvasContextMenu, handleCanvasDoubleClick, handleDragOver, handleDrop,
    handleTouchStart, handleTouchMove, handleTouchEnd,
    handleNodeMouseDown, handleNodeTouchStart, handleNodeTouchEnd, handleNodeClick,
    handleNodeContextMenu, handleResizeStart, handleConnectStart, handleConnectTouchStart, handlePortMouseUp,
    handleResetZoom, handleZoom, handleNavigate,
}) => {
    // Group Toolbar logic
    const isMultiSelect = selectedNodeIds.size > 1;
    const singleSelectedNodeId = selectedNodeIds.size === 1
        ? selectedNodeIds.values().next().value ?? null
        : null;
    const singleGroupSelected = singleSelectedNodeId
        ? nodeById.get(singleSelectedNodeId)?.type === NodeType.GROUP
        : false;
    const showGroupToolbar = isMultiSelect || singleGroupSelected;
    const groupToolbarPos = showGroupToolbar ? getSelectionCenter(transform) : null;
    const bulkConnectSourceCount = useMemo(
        () => Array.from(selectedNodeIds).filter(id => {
            const node = nodeById.get(id);
            return !!node && node.type !== NodeType.GROUP;
        }).length,
        [selectedNodeIds, nodeById]
    );
    const isBulkConnectMode = !!bulkConnectSourceIds && bulkConnectSourceIds.size > 0;
    const isSelecting = dragMode === 'SELECT' || dragMode === 'DRAG_NODE';
    const [activeControlNodeId, setActiveControlNodeId] = useState<string | null>(null);
    const renderedNodeList = useMemo(() => {
        if (draggingNodeIds.size === 0) return visibleNodes;

        const dragging: NodeData[] = [];
        const others: NodeData[] = [];
        for (const node of visibleNodes) {
            if (draggingNodeIds.has(node.id)) dragging.push(node);
            else others.push(node);
        }
        if (dragging.length === 0) return visibleNodes;

        dragging.sort((a, b) => {
            if (a.type === NodeType.GROUP && b.type !== NodeType.GROUP) return -1;
            if (a.type !== NodeType.GROUP && b.type === NodeType.GROUP) return 1;
            return 0;
        });

        return [...others, ...dragging];
    }, [visibleNodes, draggingNodeIds]);

    useEffect(() => {
        if (!singleSelectedNodeId || dragMode !== 'NONE') {
            setActiveControlNodeId(null);
            return;
        }

        const timer = window.setTimeout(() => {
            setActiveControlNodeId(singleSelectedNodeId);
        }, 120);

        return () => window.clearTimeout(timer);
    }, [singleSelectedNodeId, dragMode]);
    const stableUpdateNodeData = useStableCallback(updateNodeData);
    const stableHandleGenerate = useStableCallback(handleGenerate);
    const stableHandleMaximize = useStableCallback(handleMaximize);
    const stableHandleDownload = useStableCallback(handleDownload);
    const stableHandleUploadToAssetLibrary = useStableCallback(handleUploadToAssetLibrary);
    const stableHandleToolbarAction = useStableCallback(handleToolbarAction);
    const stableHandleUpload = useStableCallback(handleUpload);
    const stableDeleteNode = useStableCallback(deleteNode);
    const stableHandleNodeMouseDown = useStableCallback(handleNodeMouseDown);
    const stableHandleNodeTouchStart = useStableCallback(handleNodeTouchStart);
    const stableHandleNodeTouchEnd = useStableCallback(handleNodeTouchEnd);
    const stableHandleNodeClick = useStableCallback(handleNodeClick);
    const stableHandleNodeContextMenu = useStableCallback(handleNodeContextMenu);
    const stableHandleResizeStart = useStableCallback(handleResizeStart);
    const stableHandleConnectStart = useStableCallback(handleConnectStart);
    const stableHandleConnectTouchStart = useStableCallback(handleConnectTouchStart);
    const stableHandlePortMouseUp = useStableCallback(handlePortMouseUp);

    return (
        <div
            ref={containerRef}
            className={`flex-1 relative overflow-hidden grid-pattern ${dragMode === 'PAN' ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ backgroundColor: canvasBg, '--grid-color': isDark ? '#27272a' : '#E4E4E7' } as React.CSSProperties}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={handleCanvasContextMenu}
            onDoubleClick={handleCanvasDoubleClick}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <ConnectionsLayer
                connections={visibleConnections}
                nodeById={nodeById}
                transform={transform}
                selectedConnectionId={selectedConnectionId}
                isDark={isDark}
                dragMode={dragMode}
                connectionStartNodeId={connectionStartRef.current?.nodeId || null}
                tempConnection={tempConnection}
                onSelectConnection={setSelectedConnectionId}
                onRemoveConnection={removeConnection}
            />

            {/* Canvas Content - Nodes */}
            <div
                className="absolute origin-top-left"
                style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}
            >
                {/* Nodes */}
                {renderedNodeList.map(node => {
                    const isNodeSelected = selectedNodeIds.has(node.id);
                    const isBulkTarget =
                        isBulkConnectMode &&
                        !selectedNodeIds.has(node.id) &&
                        node.type !== NodeType.ORIGINAL_IMAGE &&
                        node.type !== NodeType.GROUP;
                    return (
                        <CanvasNodeItem
                            key={node.id}
                            node={node}
                            selected={isNodeSelected}
                            bulkConnectTarget={isBulkTarget}
                            showControls={activeControlNodeId === node.id}
                            inputs={getInputImages(node.id)}
                            isDark={isDark}
                            isSelecting={isSelecting && isNodeSelected}
                            updateNodeData={stableUpdateNodeData}
                            handleGenerate={stableHandleGenerate}
                            handleMaximize={stableHandleMaximize}
                            handleDownload={stableHandleDownload}
                            handleUploadToAssetLibrary={stableHandleUploadToAssetLibrary}
                            handleToolbarAction={stableHandleToolbarAction}
                            handleUpload={stableHandleUpload}
                            deleteNode={stableDeleteNode}
                            setPreviewMedia={setPreviewMedia}
                            handleNodeMouseDown={stableHandleNodeMouseDown}
                            handleNodeTouchStart={stableHandleNodeTouchStart}
                            handleNodeTouchEnd={stableHandleNodeTouchEnd}
                            handleNodeClick={stableHandleNodeClick}
                            handleNodeContextMenu={stableHandleNodeContextMenu}
                            handleResizeStart={stableHandleResizeStart}
                            handleConnectStart={stableHandleConnectStart}
                            handleConnectTouchStart={stableHandleConnectTouchStart}
                            handlePortMouseUp={stableHandlePortMouseUp}
                            scale={transform.k}
                        />
                    );
                })}

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
                    <input type="range" min="0.2" max="2" step="0.1" value={transform.k} onChange={handleZoom} className="w-20 h-1 accent-cyan-500 cursor-pointer" style={{ touchAction: 'auto' }} />
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
                    canBulkConnect={isMultiSelect && bulkConnectSourceCount > 0}
                    isBulkConnectMode={isBulkConnectMode}
                    onToggleColorPicker={() => setShowColorPicker(!showColorPicker)}
                    onColorChange={handleGroupColorChange}
                    onGroup={handleGroupSelection}
                    onUngroup={handleUngroup}
                    onBulkConnect={() => {
                        if (bulkConnectSourceCount <= 0) return;
                        setBulkConnectSourceIds(prev => (
                            prev && prev.size > 0
                                ? null
                                : new Set(
                                    Array.from(selectedNodeIds).filter(id => {
                                        const node = nodeById.get(id);
                                        return !!node && node.type !== NodeType.GROUP;
                                    })
                                )
                        ));
                    }}
                />
            )}

            {isBulkConnectMode && groupToolbarPos && (
                <div
                    className="absolute z-[160] pointer-events-none"
                    style={{ left: groupToolbarPos.x, top: groupToolbarPos.y - 18, transform: 'translate(-50%, -100%)' }}
                >
                    <div className={`px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-lg border backdrop-blur-md whitespace-nowrap ${
                        isDark ? 'bg-[#1A1D21]/95 border-cyan-500/35 text-cyan-100' : 'bg-white/95 border-cyan-200 text-cyan-700'
                    }`}>
                        点目标节点，连接 {bulkConnectSourceIds?.size || 0} 个已选节点。按 Esc 或点空白取消。
                    </div>
                </div>
            )}
        </div>
    );
};

export const CanvasArea = React.memo(CanvasAreaComponent, (prev, next) => {
    if (prev.transform !== next.transform) return false;
    if (prev.visibleNodes !== next.visibleNodes) return false;
    if (prev.visibleConnections !== next.visibleConnections) return false;
    if (prev.selectedNodeIds !== next.selectedNodeIds) return false;
    if (prev.bulkConnectSourceIds !== next.bulkConnectSourceIds) return false;
    if (prev.draggingNodeIds !== next.draggingNodeIds) return false;
    if (prev.selectedConnectionId !== next.selectedConnectionId) return false;
    if (prev.dragMode !== next.dragMode) return false;
    if (prev.tempConnection !== next.tempConnection) return false;
    if (prev.suggestedNodes !== next.suggestedNodes) return false;
    if (prev.selectionBox !== next.selectionBox) return false;
    if (prev.showMinimap !== next.showMinimap) return false;
    if (prev.showColorPicker !== next.showColorPicker) return false;
    if (prev.nextGroupColor !== next.nextGroupColor) return false;
    if (prev.viewportSize !== next.viewportSize) return false;
    if (prev.canvasBg !== next.canvasBg) return false;
    if (prev.isDark !== next.isDark) return false;
    if (prev.nodeById !== next.nodeById) return false;
    return true;
});
