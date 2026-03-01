import React, { useRef, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import { CanvasTransform, Point } from './types';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { SettingsModal } from './components/Settings/SettingsModal';
import { ContextMenu } from './components/ContextMenu';
import { QuickAddMenu } from './components/QuickAddMenu';
import { NewWorkflowDialog } from './components/NewWorkflowDialog';
import { PreviewModal } from './components/PreviewModal';
import { CanvasArea } from './components/CanvasArea';
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

const CanvasWithSidebar: React.FC = () => {
    // ========== Refs ==========
    const containerRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ x: number; y: number; w?: number; h?: number; nodeId?: string; initialNodeX?: number; direction?: string }>({ x: 0, y: 0 });
    const initialTransformRef = useRef<CanvasTransform>({ x: 0, y: 0, k: 1 });
    const initialNodePositionsRef = useRef<{ id: string; x: number; y: number }[]>([]);
    const connectionStartRef = useRef<{ nodeId: string; type: 'source' | 'target' } | null>(null);
    const lastMousePosRef = useRef<Point>({ x: 0, y: 0 });
    const workflowInputRef = useRef<HTMLInputElement>(null);
    const assetInputRef = useRef<HTMLInputElement>(null);
    const replaceImageRef = useRef<HTMLInputElement>(null);
    const nodeToReplaceRef = useRef<string | null>(null);
    const draggingNodesRef = useRef<Set<string>>(new Set());
    const touchStartRef = useRef<{ x: number; y: number; dist: number; centerX: number; centerY: number } | null>(null);

    // ========== Canvas State ==========
    const canvasState = useCanvasState();
    const {
        nodes, setNodes, connections, setConnections, transform, setTransform,
        canvasBg, setCanvasBg, deletedNodes, setDeletedNodes,
        selectedNodeIds, setSelectedNodeIds, selectedConnectionId, setSelectedConnectionId,
        selectionBox, setSelectionBox, dragMode, setDragMode, dragModeRef,
        viewportSize, setViewportSize, visibleNodes, visibleConnections,
        previewMedia, setPreviewMedia, contextMenu, setContextMenu,
        quickAddMenu, setQuickAddMenu, showNewWorkflowDialog, setShowNewWorkflowDialog,
        isSettingsOpen, setIsSettingsOpen, showMinimap,
        showColorPicker, setShowColorPicker, nextGroupColor, setNextGroupColor,
        desktopPlatform, setDesktopPlatform,
        tempConnection, setTempConnection, suggestedNodes, setSuggestedNodes,
        isDark, screenToWorld, updateNodeData,
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
    const { addNode, deleteNode, handleGenerate, handleMaximize, handleDownload, handleAlign, handleToolbarAction, generateId } = nodeOps;

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
            screenToWorld, updateNodeData,
        },
        ops: {
            addNode, generateId, createConnection,
        },
    });

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
        const handleGlobalMouseUp = () => {
            if (dragModeRef.current !== 'NONE') {
                setDragMode('NONE'); setTempConnection(null); connectionStartRef.current = null;
                dragStartRef.current = { x: 0, y: 0 }; setSuggestedNodes([]); setSelectionBox(null);
                draggingNodesRef.current.clear();
            }
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [dragModeRef, setDragMode, setTempConnection, setSuggestedNodes, setSelectionBox]);

    // ========== Render ==========
    return (
        <div className="w-full h-screen overflow-hidden flex relative font-sans text-gray-800">
            <ThemeSwitcher isDark={isDark} onToggle={handlers.toggleTheme} />
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} isDark={isDark} />

            <Sidebar
                onAddNode={addNode}
                onSaveWorkflow={handlers.handleSaveWorkflow}
                onLoadWorkflow={() => workflowInputRef.current?.click()}
                onNewWorkflow={() => setShowNewWorkflowDialog(true)}
                onImportAsset={() => assetInputRef.current?.click()}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onUpdateCanvasBg={setCanvasBg}
                desktopPlatform={desktopPlatform}
                onToggleDesktopPlatform={() => setDesktopPlatform(prev => prev === 'WIN' ? 'MAC' : 'WIN')}
                nodes={[...nodes, ...deletedNodes]}
                onPreviewMedia={handlers.handleHistoryPreview}
                isDark={isDark}
            />

            <input type="file" ref={workflowInputRef} hidden accept=".aistudio-flow,.json" onChange={handlers.handleLoadWorkflow} />
            <input type="file" ref={assetInputRef} hidden accept="image/*" onChange={handlers.handleImportAsset} />
            <input type="file" ref={replaceImageRef} hidden accept="image/*" onChange={handlers.handleReplaceImage} />

            <CanvasArea
                containerRef={containerRef}
                connectionStartRef={connectionStartRef}
                nodes={nodes}
                visibleNodes={visibleNodes}
                visibleConnections={visibleConnections}
                transform={transform}
                canvasBg={canvasBg}
                selectedNodeIds={selectedNodeIds}
                selectedConnectionId={selectedConnectionId}
                selectionBox={selectionBox}
                dragMode={dragMode}
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
        </div>
    );
};

export default App;
