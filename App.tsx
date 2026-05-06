import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import { CanvasTransform, Point } from './types';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { SettingsModal } from './components/Settings/SettingsModal';
import { ContextMenu } from './components/ContextMenu';
import { QuickAddMenu } from './components/QuickAddMenu';
import { NewWorkflowDialog } from './components/NewWorkflowDialog';
import { PreviewModal } from './components/PreviewModal';
import { CanvasArea } from './components/CanvasArea';
import { Sd2AssetLibraryModal } from './components/Sd2AssetLibraryModal';
import {
    useCanvasState,
    useNodeOperations,
    useConnectionManager,
    useClipboard,
    useKeyboardShortcuts,
    useGrouping,
    useCanvasHandlers,
} from './hooks';

const App: React.FC = () => {
    return <CanvasWithSidebar />;
};

const CULL_RENDER_THRESHOLD = 300;

function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
    const callbackRef = useRef(callback);
    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);
    return useCallback(((...args: any[]) => callbackRef.current(...args)) as T, []);
}

const CanvasWithSidebar: React.FC = () => {
    // ========== Refs ==========
    const containerRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ x: number; y: number; w?: number; h?: number; nodeId?: string; initialNodeX?: number; direction?: string }>({ x: 0, y: 0 });
    const initialTransformRef = useRef<CanvasTransform>({ x: 0, y: 0, k: 1 });
    const initialNodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
    const connectionStartRef = useRef<{ nodeId: string; type: 'source' | 'target' } | null>(null);
    const lastMousePosRef = useRef<Point>({ x: 0, y: 0 });
    const workflowInputRef = useRef<HTMLInputElement>(null);
    const assetInputRef = useRef<HTMLInputElement>(null);
    const replaceImageRef = useRef<HTMLInputElement>(null);
    const nodeToReplaceRef = useRef<string | null>(null);
    const draggingNodesRef = useRef<Set<string>>(new Set());
    const touchStartRef = useRef<{ x: number; y: number; dist: number; centerX: number; centerY: number } | null>(null);
    const [isSd2AssetLibraryOpen, setIsSd2AssetLibraryOpen] = useState(false);
    const [renderModeOverride, setRenderModeOverride] = useState<'AUTO' | 'FULL' | 'CULL'>('AUTO');
    const [draggingNodeIds, setDraggingNodeIds] = useState<Set<string>>(new Set());

    // ========== Canvas State ==========
    const canvasState = useCanvasState();
    const {
        nodes, setNodes, connections, setConnections, transform, setTransform,
        canvasBg, setCanvasBg, deletedNodes, setDeletedNodes,
        selectedNodeIds, setSelectedNodeIds, selectedConnectionId, setSelectedConnectionId,
        selectionBox, setSelectionBox, dragMode, setDragMode, dragModeRef,
        viewportSize, setViewportSize, visibleNodes, visibleConnections, nodeById,
        getNodesIntersectingBounds,
        previewMedia, setPreviewMedia, contextMenu, setContextMenu,
        quickAddMenu, setQuickAddMenu, showNewWorkflowDialog, setShowNewWorkflowDialog,
        isSettingsOpen, setIsSettingsOpen, showMinimap,
        showColorPicker, setShowColorPicker, nextGroupColor, setNextGroupColor,
        desktopPlatform, setDesktopPlatform,
        tempConnection, setTempConnection, suggestedNodes, setSuggestedNodes,
        isDark, screenToWorld, updateNodeData, markInteractionActivity,
    } = canvasState;

    // ========== Hooks ==========
    const connectionManager = useConnectionManager({
        nodes, connections, setConnections, setDragMode, setTempConnection, setSuggestedNodes, setSelectedConnectionId,
    });
    const { getInputImages, createConnection, removeConnection } = connectionManager;

    const nodeOps = useNodeOperations({
        nodes, setNodes, connections, setConnections, deletedNodes, setDeletedNodes,
        selectedNodeIds, setSelectedNodeIds, updateNodeData, screenToWorld, getInputImages, containerRef,
    });
    const { addNode, deleteNode, handleGenerate, handleMaximize, handleDownload, handleUploadToAssetLibrary, handleAlign, handleToolbarAction, generateId } = nodeOps;

    const grouping = useGrouping({
        nodes, setNodes, selectedNodeIds, setSelectedNodeIds, nextGroupColor, setNextGroupColor, setShowColorPicker,
    });
    const { handleGroupSelection, handleUngroup, handleGroupColorChange, getSelectionCenter } = grouping;

    const clipboard = useClipboard({
        nodes, setNodes, connections, setConnections, selectedNodeIds, setSelectedNodeIds, screenToWorld, addNode, lastMousePosRef,
    });
    const { internalClipboard, performCopy, performPaste, copyImageToClipboard } = clipboard;

    const { spacePressed } = useKeyboardShortcuts({
        nodes, setNodes, connections, setConnections,
        viewportSize, setTransform,
        selectedNodeIds, setSelectedNodeIds, selectedConnectionId, setSelectedConnectionId,
        deletedNodes, setDeletedNodes, previewMedia, setPreviewMedia,
        contextMenu, setContextMenu, quickAddMenu, setQuickAddMenu,
        showNewWorkflowDialog, setShowNewWorkflowDialog, isSettingsOpen, setIsSettingsOpen,
        showColorPicker, setShowColorPicker, performCopy, handleAlign, handleGroupSelection,
    });

    const triggerReplaceImage = (nodeId: string) => {
        nodeToReplaceRef.current = nodeId;
        replaceImageRef.current?.click();
    };

    const sidebarNodes = useMemo(() => [...nodes, ...deletedNodes], [nodes, deletedNodes]);

    const handleSidebarLoadWorkflow = useCallback(() => workflowInputRef.current?.click(), []);
    const handleSidebarNewWorkflow = useCallback(() => setShowNewWorkflowDialog(true), []);
    const handleSidebarImportAsset = useCallback(() => assetInputRef.current?.click(), []);
    const handleSidebarOpenSd2Library = useCallback(() => setIsSd2AssetLibraryOpen(true), []);
    const handleSidebarOpenSettings = useCallback(() => setIsSettingsOpen(true), []);
    const handleSidebarToggleDesktop = useCallback(() => {
        setDesktopPlatform(prev => prev === 'WIN' ? 'MAC' : 'WIN');
    }, [setDesktopPlatform]);

    // ========== Canvas Handlers ==========
    const handlers = useCanvasHandlers({
        refs: {
            containerRef, dragStartRef, initialTransformRef, initialNodePositionsRef,
            connectionStartRef, lastMousePosRef,
            replaceImageRef, nodeToReplaceRef, draggingNodesRef, touchStartRef, spacePressed,
        },
        state: {
            nodes, connections, transform, selectedNodeIds, selectedConnectionId, dragMode,
            contextMenu, quickAddMenu, showColorPicker, desktopPlatform,
            setNodes, setConnections, setTransform, setDeletedNodes,
            setSelectedNodeIds, setSelectedConnectionId, setSelectionBox, setDragMode,
            setTempConnection, setSuggestedNodes, setContextMenu, setQuickAddMenu,
            setShowNewWorkflowDialog, setPreviewMedia, setCanvasBg, setShowColorPicker, setNextGroupColor,
            setDraggingNodeIds,
            getNodesIntersectingBounds, screenToWorld, updateNodeData, markInteractionActivity,
        },
        ops: {
            addNode, generateId, createConnection,
        },
    });

    const handleSidebarAddNode = useStableCallback(addNode);
    const handleSidebarSaveWorkflow = useStableCallback(handlers.handleSaveWorkflow);
    const handleSidebarPreviewMedia = useStableCallback(handlers.handleHistoryPreview);
    const autoRenderMode = nodes.length > CULL_RENDER_THRESHOLD ? 'CULL' : 'FULL';
    const effectiveRenderMode = renderModeOverride === 'AUTO' ? autoRenderMode : renderModeOverride;

    const renderedNodes = useMemo(
        () => effectiveRenderMode === 'FULL' ? nodes : visibleNodes,
        [effectiveRenderMode, nodes, visibleNodes]
    );
    const renderedConnections = useMemo(
        () => effectiveRenderMode === 'FULL' ? connections : visibleConnections,
        [effectiveRenderMode, connections, visibleConnections]
    );

    // ========== Effects ==========
    useEffect(() => {
        const updateViewportSize = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setViewportSize({ width: rect.width, height: rect.height });
            }
        };
        const timer = setTimeout(updateViewportSize, 0);
        window.addEventListener('resize', updateViewportSize);
        return () => { clearTimeout(timer); window.removeEventListener('resize', updateViewportSize); };
    }, [setViewportSize]);

    useEffect(() => {
        const handleGlobalMouseUp = (e: MouseEvent) => {
            const target = e.target;
            if (containerRef.current && target instanceof Node && containerRef.current.contains(target)) {
                return;
            }
            if (dragModeRef.current !== 'NONE') {
                handlers.handleMouseUp(e as any);
            }
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [dragModeRef, handlers]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'F9') return;
            const target = e.target as HTMLElement | null;
            const isInput = !!target && (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable
            );
            if (isInput) return;
            e.preventDefault();
            setRenderModeOverride(prev => {
                if (prev === 'AUTO') return 'FULL';
                if (prev === 'FULL') return 'CULL';
                return 'AUTO';
            });
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    // ========== Render ==========
    return (
        <div className="w-full h-screen overflow-hidden flex relative font-sans text-gray-800">
            <ThemeSwitcher isDark={isDark} onToggle={handlers.toggleTheme} />
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} isDark={isDark} />

            <Sidebar
                onAddNode={handleSidebarAddNode}
                onSaveWorkflow={handleSidebarSaveWorkflow}
                onLoadWorkflow={handleSidebarLoadWorkflow}
                onNewWorkflow={handleSidebarNewWorkflow}
                onImportAsset={handleSidebarImportAsset}
                onOpenSd2AssetLibrary={handleSidebarOpenSd2Library}
                onOpenSettings={handleSidebarOpenSettings}
                onUpdateCanvasBg={setCanvasBg}
                desktopPlatform={desktopPlatform}
                onToggleDesktopPlatform={handleSidebarToggleDesktop}
                nodes={sidebarNodes}
                onPreviewMedia={handleSidebarPreviewMedia}
                isDark={isDark}
            />

            <input type="file" ref={workflowInputRef} hidden accept=".aistudio-flow,.json" onChange={handlers.handleLoadWorkflow} />
            <input type="file" ref={assetInputRef} hidden accept="image/*" onChange={handlers.handleImportAsset} />
            <input type="file" ref={replaceImageRef} hidden accept="image/*" onChange={handlers.handleReplaceImage} />

            <CanvasArea
                containerRef={containerRef}
                connectionStartRef={connectionStartRef}
                nodes={nodes}
                visibleNodes={renderedNodes}
                visibleConnections={renderedConnections}
                nodeById={nodeById}
                transform={transform}
                canvasBg={canvasBg}
                selectedNodeIds={selectedNodeIds}
                selectedConnectionId={selectedConnectionId}
                selectionBox={selectionBox}
                dragMode={dragMode}
                draggingNodeIds={draggingNodeIds}
                tempConnection={tempConnection}
                suggestedNodes={suggestedNodes}
                showMinimap={showMinimap}
                showColorPicker={showColorPicker}
                nextGroupColor={nextGroupColor}
                viewportSize={viewportSize}
                isDark={isDark}
                getInputImages={getInputImages}
                updateNodeData={updateNodeData}
                handleGenerate={handleGenerate}
                handleMaximize={handleMaximize}
                handleDownload={handleDownload}
                handleUploadToAssetLibrary={handleUploadToAssetLibrary}
                handleToolbarAction={handleToolbarAction}
                handleUpload={triggerReplaceImage}
                deleteNode={deleteNode}
                setPreviewMedia={setPreviewMedia}
                setSelectedConnectionId={setSelectedConnectionId}
                setShowColorPicker={setShowColorPicker}
                handleGroupSelection={handleGroupSelection}
                handleUngroup={handleUngroup}
                handleGroupColorChange={handleGroupColorChange}
                getSelectionCenter={getSelectionCenter}
                handleMouseDown={handlers.handleMouseDown}
                handleMouseMove={handlers.handleMouseMove}
                handleMouseUp={handlers.handleMouseUp}
                handleWheel={handlers.handleWheel}
                handleCanvasContextMenu={handlers.handleCanvasContextMenu}
                handleCanvasDoubleClick={handlers.handleCanvasDoubleClick}
                handleDragOver={handlers.handleDragOver}
                handleDrop={handlers.handleDrop}
                handleTouchStart={handlers.handleTouchStart}
                handleTouchMove={handlers.handleTouchMove}
                handleTouchEnd={handlers.handleTouchEnd}
                handleNodeMouseDown={handlers.handleNodeMouseDown}
                handleNodeTouchStart={handlers.handleNodeTouchStart}
                handleNodeTouchEnd={handlers.handleNodeTouchEnd}
                handleNodeClick={handlers.handleNodeClick}
                handleNodeContextMenu={handlers.handleNodeContextMenu}
                handleResizeStart={handlers.handleResizeStart}
                handleConnectStart={handlers.handleConnectStart}
                handleConnectTouchStart={handlers.handleConnectTouchStart}
                handlePortMouseUp={handlers.handlePortMouseUp}
                handleResetZoom={handlers.handleResetZoom}
                handleZoom={handlers.handleZoom}
                removeConnection={removeConnection}
                setShowMinimap={canvasState.setShowMinimap}
                handleNavigate={handlers.handleNavigate}
            />

            {/* Overlays */}
            {contextMenu && (
                <ContextMenu
                    contextMenu={contextMenu}
                    isDark={isDark}
                    onClose={() => setContextMenu(null)}
                    onCopy={performCopy}
                    onPaste={performPaste}
                    onDelete={deleteNode}
                    onUngroup={handleUngroup}
                    onReplaceImage={triggerReplaceImage}
                    onCopyImageData={copyImageToClipboard}
                    onAddNode={addNode}
                    hasCopiedData={!!internalClipboard}
                />
            )}

            {quickAddMenu && (
                <QuickAddMenu
                    quickAddMenu={quickAddMenu}
                    isDark={isDark}
                    onAddNode={handlers.handleQuickAddNode}
                />
            )}

            {showNewWorkflowDialog && (
                <NewWorkflowDialog
                    isDark={isDark}
                    onClose={() => setShowNewWorkflowDialog(false)}
                    onConfirmNew={handlers.handleConfirmNew}
                />
            )}

            {previewMedia && (
                <PreviewModal
                    previewMedia={previewMedia}
                    onClose={() => setPreviewMedia(null)}
                />
            )}

            <Sd2AssetLibraryModal
                isOpen={isSd2AssetLibraryOpen}
                isDark={isDark}
                onClose={() => setIsSd2AssetLibraryOpen(false)}
            />
        </div>
    );
};

export default App;
