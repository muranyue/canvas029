import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import { NodeData, Connection, CanvasTransform, Point, DragMode, NodeType } from './types';
import BaseNode from './components/Nodes/BaseNode';
import { NodeContent } from './components/Nodes/NodeContent';
import { Icons } from './components/Icons';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { SettingsModal } from './components/Settings/SettingsModal';
import { Minimap } from './components/Minimap';
import {
    useCanvasState,
    useNodeOperations,
    useConnectionManager,
    useClipboard,
    useKeyboardShortcuts,
    useGrouping,
    GROUP_COLORS,
    calculateImportDimensions,
} from './hooks';

const App: React.FC = () => {
    return <CanvasWithSidebar />;
};

const CanvasWithSidebar: React.FC = () => {
    // ========== Refs ==========
    const containerRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ x: number, y: number, w?: number, h?: number, nodeId?: string, initialNodeX?: number, direction?: string }>({ x: 0, y: 0 });
    const initialTransformRef = useRef<CanvasTransform>({ x: 0, y: 0, k: 1 });
    const initialNodePositionsRef = useRef<{id: string, x: number, y: number}[]>([]);
    const connectionStartRef = useRef<{ nodeId: string, type: 'source' | 'target' } | null>(null);
    const lastMousePosRef = useRef<Point>({ x: 0, y: 0 });
    const workflowInputRef = useRef<HTMLInputElement>(null);
    const assetInputRef = useRef<HTMLInputElement>(null);
    const replaceImageRef = useRef<HTMLInputElement>(null);
    const nodeToReplaceRef = useRef<string | null>(null);
    const draggingNodesRef = useRef<Set<string>>(new Set());
    const touchStartRef = useRef<{ x: number, y: number, dist: number, centerX: number, centerY: number } | null>(null);

    // ========== Canvas State Hook ==========
    const canvasState = useCanvasState();
    const {
        nodes, setNodes,
        connections, setConnections,
        transform, setTransform,
        canvasBg, setCanvasBg,
        deletedNodes, setDeletedNodes,
        selectedNodeIds, setSelectedNodeIds,
        selectedConnectionId, setSelectedConnectionId,
        selectionBox, setSelectionBox,
        dragMode, setDragMode,
        dragModeRef,
        viewportSize, setViewportSize,
        visibleNodes,
        visibleConnections,
        previewMedia, setPreviewMedia,
        contextMenu, setContextMenu,
        quickAddMenu, setQuickAddMenu,
        showNewWorkflowDialog, setShowNewWorkflowDialog,
        isSettingsOpen, setIsSettingsOpen,
        showMinimap,
        showColorPicker, setShowColorPicker,
        nextGroupColor, setNextGroupColor,
        tempConnection, setTempConnection,
        suggestedNodes, setSuggestedNodes,
        isDark,
        screenToWorld,
        updateNodeData,
    } = canvasState;

    // ========== Connection Manager Hook ==========
    const connectionManager = useConnectionManager({
        nodes,
        connections,
        setConnections,
        setDragMode,
        setTempConnection,
        setSuggestedNodes,
        setSelectedConnectionId,
    });
    const { inputsMap, getInputImages, createConnection, removeConnection } = connectionManager;

    // ========== Node Operations Hook ==========
    const nodeOps = useNodeOperations({
        nodes,
        setNodes,
        connections,
        setConnections,
        deletedNodes,
        setDeletedNodes,
        selectedNodeIds,
        setSelectedNodeIds,
        updateNodeData,
        screenToWorld,
        getInputImages,
        containerRef,
    });
    const { addNode, deleteNode, handleGenerate, handleMaximize, handleDownload, handleAlign, handleToolbarAction, generateId } = nodeOps;

    // ========== Grouping Hook ==========
    const grouping = useGrouping({
        nodes,
        setNodes,
        selectedNodeIds,
        setSelectedNodeIds,
        nextGroupColor,
        setNextGroupColor,
        setShowColorPicker,
    });
    const { handleGroupSelection, handleUngroup, handleGroupColorChange, getSelectionCenter } = grouping;

    // ========== Clipboard Hook ==========
    const clipboard = useClipboard({
        nodes,
        setNodes,
        connections,
        setConnections,
        selectedNodeIds,
        setSelectedNodeIds,
        screenToWorld,
        addNode,
        lastMousePosRef,
    });
    const { internalClipboard, performCopy, performPaste, copyImageToClipboard } = clipboard;

    // ========== Keyboard Shortcuts Hook ==========
    const { spacePressed } = useKeyboardShortcuts({
        nodes,
        setNodes,
        connections,
        setConnections,
        selectedNodeIds,
        setSelectedNodeIds,
        selectedConnectionId,
        setSelectedConnectionId,
        deletedNodes,
        setDeletedNodes,
        previewMedia,
        setPreviewMedia,
        contextMenu,
        setContextMenu,
        quickAddMenu,
        setQuickAddMenu,
        showNewWorkflowDialog,
        setShowNewWorkflowDialog,
        isSettingsOpen,
        setIsSettingsOpen,
        showColorPicker,
        setShowColorPicker,
        performCopy,
        handleAlign,
        handleGroupSelection,
    });

    // ========== Viewport Size Effect ==========
    useEffect(() => {
        const updateViewportSize = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setViewportSize({ width: rect.width, height: rect.height });
            }
        };
        const timer = setTimeout(updateViewportSize, 0);
        window.addEventListener('resize', updateViewportSize);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateViewportSize);
        };
    }, [setViewportSize]);

    // ========== Global Mouse Up Effect ==========
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (dragModeRef.current !== 'NONE') {
                setDragMode('NONE');
                setTempConnection(null);
                connectionStartRef.current = null;
                dragStartRef.current = { x: 0, y: 0 };
                setSuggestedNodes([]);
                setSelectionBox(null);
                draggingNodesRef.current.clear();
            }
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [dragModeRef, setDragMode, setTempConnection, setSuggestedNodes, setSelectionBox]);

    // ========== Quick Add Node Handler ==========
    const handleQuickAddNode = useCallback((type: NodeType) => {
        if (!quickAddMenu) return;

        const newNode = addNode(type, quickAddMenu.worldX, quickAddMenu.worldY - 200);
        setConnections(prev => [...prev, { id: generateId(), sourceId: quickAddMenu.sourceId, targetId: newNode.id }]);
        setQuickAddMenu(null);
    }, [quickAddMenu, addNode, setConnections, generateId, setQuickAddMenu]);

    // ========== Workflow Handlers ==========
    const handleSaveWorkflow = useCallback(() => {
        const workflowData = { nodes, connections, transform, version: "1.0" };
        const blob = new Blob([JSON.stringify(workflowData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `workflow-${Date.now()}.aistudio-flow`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [nodes, connections, transform]);

    const handleConfirmNew = useCallback((shouldSave: boolean) => {
        if (shouldSave) handleSaveWorkflow();
        const withContent = nodes.filter(n => n.imageSrc || n.videoSrc);
        if (withContent.length > 0) setDeletedNodes(prev => [...prev, ...withContent]);
        setNodes([]);
        setConnections([]);
        setTransform({ x: 0, y: 0, k: 1 });
        setShowNewWorkflowDialog(false);
        setSelectedNodeIds(new Set());
        setSelectionBox(null);
    }, [handleSaveWorkflow, nodes, setDeletedNodes, setNodes, setConnections, setTransform, setShowNewWorkflowDialog, setSelectedNodeIds, setSelectionBox]);

    const handleLoadWorkflow = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                if (data.nodes && data.connections) {
                    setNodes(data.nodes);
                    setConnections(data.connections);
                    if (data.transform) setTransform(data.transform);
                }
            } catch (err) { console.error(err); alert("Invalid workflow file"); }
        };
        reader.readAsText(file);
        e.target.value = '';
    }, [setNodes, setConnections, setTransform]);

    // ========== Asset Import Handlers ==========
    const handleImportAsset = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const { width, height, ratio } = calculateImportDimensions(img.width, img.height);
                const src = event.target?.result as string;
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect) {
                    const center = screenToWorld(rect.width / 2, rect.height / 2);
                    addNode(NodeType.ORIGINAL_IMAGE, center.x - width/2, center.y - height/2, {
                        width, height, imageSrc: src, aspectRatio: `${ratio}:1`, outputArtifacts: [src]
                    });
                }
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }, [screenToWorld, addNode]);

    const triggerReplaceImage = useCallback((nodeId: string) => {
        nodeToReplaceRef.current = nodeId;
        replaceImageRef.current?.click();
    }, []);

    const handleReplaceImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const nodeId = nodeToReplaceRef.current;
        if (file && nodeId) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const node = nodes.find(n => n.id === nodeId);
                    if (node) {
                        const { width, height, ratio } = calculateImportDimensions(img.width, img.height);
                        const src = event.target?.result as string;
                        const currentArtifacts = node.outputArtifacts || [];
                        const newArtifacts = [src, ...currentArtifacts];
                        updateNodeData(nodeId, { 
                            imageSrc: src, 
                            width, height,
                            aspectRatio: `${ratio}:1`, 
                            outputArtifacts: newArtifacts
                        });
                    }
                };
                img.src = event.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
        if (replaceImageRef.current) replaceImageRef.current.value = '';
        nodeToReplaceRef.current = null;
    }, [nodes, updateNodeData]);

    // ========== Drag & Drop Handlers ==========
    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        const files: File[] = Array.from(e.dataTransfer.files); 
        if (files.length === 0) return;
        const worldPos = screenToWorld(e.clientX, e.clientY);
        files.forEach((file, index) => {
            const offsetX = index * 20; const offsetY = index * 20;
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const src = event.target?.result as string;
                    const img = new Image();
                    img.onload = () => {
                        const { width, height, ratio } = calculateImportDimensions(img.width, img.height);
                        addNode(NodeType.ORIGINAL_IMAGE, worldPos.x - width/2 + offsetX, worldPos.y - height/2 + offsetY, {
                            width, height, imageSrc: src, aspectRatio: `${ratio}:1`, outputArtifacts: [src]
                        });
                    };
                    img.src = src;
                };
                reader.readAsDataURL(file);
            } else if (file.type.startsWith('video/')) {
                const url = URL.createObjectURL(file);
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.onloadedmetadata = () => {
                    const { width, height, ratio } = calculateImportDimensions(video.videoWidth, video.videoHeight);
                    addNode(NodeType.TEXT_TO_VIDEO, worldPos.x - width/2 + offsetX, worldPos.y - height/2 + offsetY, {
                        width, height, videoSrc: url, title: file.name, aspectRatio: `${ratio}:1`, outputArtifacts: [url]
                    });
                };
                video.src = url;
            }
        });
    }, [screenToWorld, addNode]);

    // ========== Zoom Handlers ==========
    const handleZoom = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newK = parseFloat(e.target.value);
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mouseX = rect.width / 2;
        const mouseY = rect.height / 2;
        const worldX = (mouseX - transform.x) / transform.k;
        const worldY = (mouseY - transform.y) / transform.k;
        const newX = mouseX - worldX * newK;
        const newY = mouseY - worldY * newK;
        setTransform({ x: newX, y: newY, k: newK });
    }, [transform, setTransform]);

    const handleResetZoom = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mouseX = rect.width / 2;
        const mouseY = rect.height / 2;
        const worldX = (mouseX - transform.x) / transform.k;
        const worldY = (mouseY - transform.y) / transform.k;
        const newX = mouseX - worldX * 1;
        const newY = mouseY - worldY * 1;
        setTransform({ x: newX, y: newY, k: 1 });
    }, [transform, setTransform]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) e.preventDefault();
        const zoomIntensity = 0.1;
        const direction = e.deltaY > 0 ? -1 : 1;
        let newK = transform.k + direction * zoomIntensity;
        newK = Math.min(Math.max(0.4, newK), 2); 
        const rect = containerRef.current!.getBoundingClientRect();
        const worldX = (e.clientX - rect.left - transform.x) / transform.k;
        const worldY = (e.clientY - rect.top - transform.y) / transform.k;
        setTransform({ x: (e.clientX - rect.left) - worldX * newK, y: (e.clientY - rect.top) - worldY * newK, k: newK });
    }, [transform, setTransform]);

    const handleNavigate = useCallback((x: number, y: number) => {
        setTransform(prev => ({ ...prev, x, y }));
    }, [setTransform]);

    const handleHistoryPreview = useCallback((url: string, type: 'image' | 'video') => setPreviewMedia({ url, type }), [setPreviewMedia]);

    const toggleTheme = useCallback((dark: boolean) => {
        setCanvasBg(dark ? '#0B0C0E' : '#F5F7FA');
    }, [setCanvasBg]);


    // ========== Touch Event Handlers ==========
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, input, textarea, [contenteditable="true"], [data-interactive="true"], .node-content')) return;

        if (e.touches.length === 1) {
            const touch = e.touches[0];
            dragStartRef.current = { x: touch.clientX, y: touch.clientY };
            initialTransformRef.current = { ...transform };
            setDragMode('PAN');
        } else if (e.touches.length === 2) {
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            const centerX = (t1.clientX + t2.clientX) / 2;
            const centerY = (t1.clientY + t2.clientY) / 2;
            
            touchStartRef.current = { x: centerX, y: centerY, dist, centerX, centerY };
            initialTransformRef.current = { ...transform };
            setDragMode('NONE');
        }
    }, [transform, setDragMode]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            if (dragMode === 'PAN') {
                const touch = e.touches[0];
                const dx = touch.clientX - dragStartRef.current.x;
                const dy = touch.clientY - dragStartRef.current.y;
                setTransform({
                    ...initialTransformRef.current,
                    x: initialTransformRef.current.x + dx,
                    y: initialTransformRef.current.y + dy
                });
            } else if (dragMode === 'DRAG_NODE') {
                const touch = e.touches[0];
                const dx = (touch.clientX - dragStartRef.current.x) / transform.k;
                const dy = (touch.clientY - dragStartRef.current.y) / transform.k;
                const movingNodeIds = draggingNodesRef.current;

                setNodes(prev => prev.map(n => { 
                    if (movingNodeIds.has(n.id)) { 
                        const initial = initialNodePositionsRef.current.find(init => init.id === n.id); 
                        if (initial) return { ...n, x: initial.x + dx, y: initial.y + dy }; 
                    } 
                    return n; 
                }));
            } else if (dragMode === 'CONNECT') {
                const touch = e.touches[0];
                const worldPos = screenToWorld(touch.clientX, touch.clientY);
                setTempConnection(worldPos);
            }
        } else if (e.touches.length === 2 && touchStartRef.current) {
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            
            if (touchStartRef.current.dist > 0) {
                const scale = dist / touchStartRef.current.dist;
                let newK = initialTransformRef.current.k * scale;
                newK = Math.min(Math.max(0.4, newK), 2.5);

                const rect = containerRef.current!.getBoundingClientRect();
                const cx = touchStartRef.current.centerX - rect.left;
                const cy = touchStartRef.current.centerY - rect.top;

                const worldX = (cx - initialTransformRef.current.x) / initialTransformRef.current.k;
                const worldY = (cy - initialTransformRef.current.y) / initialTransformRef.current.k;

                const newX = cx - worldX * newK;
                const newY = cy - worldY * newK;

                setTransform({ x: newX, y: newY, k: newK });
            }
        }
    }, [dragMode, transform, screenToWorld, setTransform, setNodes, setTempConnection]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        if (dragMode === 'CONNECT') {
            const touch = e.changedTouches[0];
            const worldPos = screenToWorld(touch.clientX, touch.clientY);
            
            const targetNode = nodes.find(n => 
                n.id !== connectionStartRef.current?.nodeId && 
                n.type !== NodeType.GROUP && 
                n.type !== NodeType.ORIGINAL_IMAGE &&
                worldPos.x >= n.x && worldPos.x <= n.x + n.width &&
                worldPos.y >= n.y && worldPos.y <= n.y + n.height
            );
            
            if (targetNode) {
                createConnection(connectionStartRef.current!.nodeId, targetNode.id);
            } else if (connectionStartRef.current?.type === 'source') {
                setQuickAddMenu({ 
                    sourceId: connectionStartRef.current.nodeId, 
                    x: touch.clientX, 
                    y: touch.clientY, 
                    worldX: worldPos.x, 
                    worldY: worldPos.y 
                });
            }
        }

        setDragMode('NONE');
        touchStartRef.current = null;
        setTempConnection(null);
        connectionStartRef.current = null;
        setSuggestedNodes([]);
        draggingNodesRef.current.clear();
    }, [dragMode, nodes, screenToWorld, createConnection, setQuickAddMenu, setDragMode, setTempConnection, setSuggestedNodes]);

    // ========== Mouse Event Handlers ==========
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (contextMenu) setContextMenu(null);
        if (quickAddMenu) setQuickAddMenu(null);
        if (selectedConnectionId) setSelectedConnectionId(null);
        if (showColorPicker) setShowColorPicker(false);
        
        if (e.button === 1 || (e.button === 0 && spacePressed.current)) {
            setDragMode('PAN');
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            initialTransformRef.current = { ...transform };
            e.preventDefault(); return;
        }
        if (e.target === containerRef.current && e.button === 0) {
            setDragMode('SELECT');
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            setSelectionBox({ x: 0, y: 0, w: 0, h: 0 }); 
            if (!e.shiftKey) setSelectedNodeIds(new Set());
        }
    }, [contextMenu, quickAddMenu, selectedConnectionId, showColorPicker, transform, spacePressed, setContextMenu, setQuickAddMenu, setSelectedConnectionId, setShowColorPicker, setDragMode, setSelectionBox, setSelectedNodeIds]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        const worldPos = screenToWorld(e.clientX, e.clientY);
        if (dragMode !== 'NONE' && e.buttons === 0) { setDragMode('NONE'); dragStartRef.current = { x: 0, y: 0 }; return; }
        
        if (dragMode === 'PAN') {
            setTransform({ ...initialTransformRef.current, x: initialTransformRef.current.x + (e.clientX - dragStartRef.current.x), y: initialTransformRef.current.y + (e.clientY - dragStartRef.current.y) });
        } else if (dragMode === 'DRAG_NODE') {
            const dx = (e.clientX - dragStartRef.current.x) / transform.k;
            const dy = (e.clientY - dragStartRef.current.y) / transform.k;
            const movingNodeIds = draggingNodesRef.current;

            setNodes(prev => prev.map(n => { 
                if (movingNodeIds.has(n.id)) { 
                    const initial = initialNodePositionsRef.current.find(init => init.id === n.id); 
                    if (initial) return { ...n, x: initial.x + dx, y: initial.y + dy }; 
                } 
                return n; 
            }));
        } else if (dragMode === 'SELECT') {
            const x = Math.min(dragStartRef.current.x, e.clientX);
            const y = Math.min(dragStartRef.current.y, e.clientY);
            const w = Math.abs(e.clientX - dragStartRef.current.x);
            const h = Math.abs(e.clientY - dragStartRef.current.y);
            setSelectionBox({ x: x - containerRef.current!.getBoundingClientRect().left, y: y - containerRef.current!.getBoundingClientRect().top, w, h });
            const worldStartX = (x - containerRef.current!.getBoundingClientRect().left - transform.x) / transform.k;
            const worldStartY = (y - containerRef.current!.getBoundingClientRect().top - transform.y) / transform.k;
            const worldWidth = w / transform.k; const worldHeight = h / transform.k;
            const newSelection = new Set<string>();
            nodes.forEach(n => { if (n.x < worldStartX + worldWidth && n.x + n.width > worldStartX && n.y < worldStartY + worldHeight && n.y + n.height > worldStartY) newSelection.add(n.id); });
            setSelectedNodeIds(newSelection);
        } else if (dragMode === 'CONNECT') {
            setTempConnection(worldPos);
            if (connectionStartRef.current?.type === 'source') {
                const candidates = nodes.filter(n => n.id !== connectionStartRef.current?.nodeId).filter(n => n.type !== NodeType.ORIGINAL_IMAGE && n.type !== NodeType.GROUP)
                    .map(n => ({ node: n, dist: Math.sqrt(Math.pow(worldPos.x - (n.x + n.width/2), 2) + Math.pow(worldPos.y - (n.y + n.height/2), 2)) }))
                    .filter(item => item.dist < 500).sort((a, b) => a.dist - b.dist).slice(0, 3).map(item => item.node);
                setSuggestedNodes(candidates);
            }
        } else if (dragMode === 'RESIZE_NODE') {
            const nodeId = dragStartRef.current.nodeId;
            const node = nodes.find(n => n.id === nodeId);
            const direction = dragStartRef.current.direction || 'SE';

            if (node) {
                const dx = (e.clientX - dragStartRef.current.x) / transform.k;
                const dy = (e.clientY - dragStartRef.current.y) / transform.k; 

                if (node.type === NodeType.GROUP) {
                    let newW = (dragStartRef.current.w || 0);
                    let newH = (dragStartRef.current.h || 0);
                    let newX = node.x;

                    if (direction === 'SE') {
                        newW = Math.max(100, newW + dx);
                        newH = Math.max(100, newH + dy);
                    } else if (direction === 'E') {
                        newW = Math.max(100, newW + dx);
                    } else if (direction === 'W') {
                        const potentialW = Math.max(100, (dragStartRef.current.w || 0) - dx);
                        newW = potentialW;
                        newX = (dragStartRef.current.initialNodeX || 0) + ((dragStartRef.current.w || 0) - newW);
                    }

                    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, width: newW, height: newH, x: newX } : n));
                } else {
                    let ratio = 1.33; 
                    if (node.aspectRatio) { const [w, h] = node.aspectRatio.split(':').map(Number); if (!isNaN(w) && !isNaN(h) && h !== 0) ratio = w / h; } 
                    else if (node.type === NodeType.ORIGINAL_IMAGE) { ratio = (dragStartRef.current.w || 1) / (dragStartRef.current.h || 1); }
                    let minWidth = 150;
                    if (node.type !== NodeType.CREATIVE_DESC) {
                        const limit1 = ratio >= 1 ? 400 * ratio : 400;
                        minWidth = Math.max(limit1, 400); 
                    } else minWidth = 280;
                    let newWidth = Math.max(minWidth, (dragStartRef.current.w || 0) + dx);
                    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, width: newWidth, height: newWidth / ratio } : n));
                }
            }
        }
    }, [dragMode, transform, nodes, screenToWorld, setDragMode, setTransform, setNodes, setSelectionBox, setSelectedNodeIds, setTempConnection, setSuggestedNodes]);

    const handleMouseUp = useCallback((e: React.MouseEvent) => {
        if (dragMode === 'CONNECT' && connectionStartRef.current?.type === 'source') {
            setQuickAddMenu({ sourceId: connectionStartRef.current.nodeId, x: e.clientX, y: e.clientY, worldX: screenToWorld(e.clientX, e.clientY).x, worldY: screenToWorld(e.clientX, e.clientY).y });
        }
        if (dragMode !== 'NONE') { 
            setDragMode('NONE'); 
            setTempConnection(null); 
            connectionStartRef.current = null; 
            setSuggestedNodes([]); 
            setSelectionBox(null);
            draggingNodesRef.current.clear();
        }
    }, [dragMode, screenToWorld, setQuickAddMenu, setDragMode, setTempConnection, setSuggestedNodes, setSelectionBox]);


    // ========== Node Event Handlers ==========
    const handleNodeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
        const target = e.target as HTMLElement;
        const isExcluded = target.closest('[data-interactive="true"]') ||
                           target.closest('.absolute.top-full') ||
                           target.closest('.absolute.bottom-full') ||
                           target.tagName === 'INPUT' || 
                           target.tagName === 'TEXTAREA' || 
                           target.tagName === 'BUTTON' ||
                           target.tagName === 'SELECT' ||
                           target.isContentEditable ||
                           target.closest('button') ||
                           target.closest('input') ||
                           target.closest('textarea') ||
                           target.closest('[contenteditable="true"]');
        
        if (isExcluded) return;
        const isDragHandle = target.closest('[data-drag-handle="true"]');
        if (!isDragHandle) return;

        e.stopPropagation();
        if (contextMenu) setContextMenu(null);
        if (quickAddMenu) setQuickAddMenu(null);
        if (selectedConnectionId) setSelectedConnectionId(null);
        if (showColorPicker) setShowColorPicker(false);

        if (e.button === 0) {
            setDragMode('DRAG_NODE');
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            
            const isAlreadySelected = selectedNodeIds.has(id);
            let newSelection = new Set(selectedNodeIds);
            
            if (e.shiftKey) { 
                isAlreadySelected ? newSelection.delete(id) : newSelection.add(id); 
            } else { 
                if (!isAlreadySelected) { 
                    newSelection.clear(); 
                    newSelection.add(id); 
                } 
            }
            setSelectedNodeIds(newSelection);
            
            const nodesToDrag = new Set(newSelection);
            const groupIds = Array.from(newSelection).filter(nid => nodes.find(n => n.id === nid)?.type === NodeType.GROUP);
            
            if (groupIds.length > 0) {
                const idToIndex = new Map(nodes.map((n, i) => [n.id, i]));
                
                nodes.forEach(n => {
                    if (nodesToDrag.has(n.id) || n.type === NodeType.GROUP) return; 
                    for (const gid of groupIds) {
                        const group = nodes.find(g => g.id === gid);
                        if (group) {
                            const isInside = n.x >= group.x && n.x + n.width <= group.x + group.width && 
                                             n.y >= group.y && n.y + n.height <= group.y + group.height;
                            const groupIdx = idToIndex.get(gid)!;
                            const nodeIdx = idToIndex.get(n.id)!;
                            const isOnTop = nodeIdx > groupIdx;

                            if (isInside && isOnTop) {
                                nodesToDrag.add(n.id);
                                break;
                            }
                        }
                    }
                });
            }
            draggingNodesRef.current = nodesToDrag;

            setNodes(prev => {
                const movingNodes = prev.filter(n => nodesToDrag.has(n.id));
                const others = prev.filter(n => !nodesToDrag.has(n.id));
                movingNodes.sort((a, b) => {
                    if (a.type === NodeType.GROUP && b.type !== NodeType.GROUP) return -1;
                    if (a.type !== NodeType.GROUP && b.type === NodeType.GROUP) return 1;
                    return 0;
                });
                return [...others, ...movingNodes];
            });

            if (newSelection.size === 1) {
                const node = nodes.find(n => n.id === id);
                if (node && node.type === NodeType.GROUP && node.color) {
                    setNextGroupColor(node.color);
                }
            }

            initialNodePositionsRef.current = nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
        }
    }, [nodes, selectedNodeIds, contextMenu, quickAddMenu, selectedConnectionId, showColorPicker, setContextMenu, setQuickAddMenu, setSelectedConnectionId, setShowColorPicker, setDragMode, setSelectedNodeIds, setNodes, setNextGroupColor]);

    const handleNodeTouchStart = useCallback((e: React.TouchEvent, id: string) => {
        const target = e.target as HTMLElement;
        const isExcluded = target.closest('[data-interactive="true"]') ||
                           target.closest('.absolute.top-full') ||
                           target.closest('.absolute.bottom-full') ||
                           target.tagName === 'INPUT' || 
                           target.tagName === 'TEXTAREA' || 
                           target.tagName === 'BUTTON' ||
                           target.tagName === 'SELECT' ||
                           target.isContentEditable ||
                           target.closest('button') ||
                           target.closest('input') ||
                           target.closest('textarea') ||
                           target.closest('[contenteditable="true"]');
        
        if (isExcluded) return;
        const isDragHandle = target.closest('[data-drag-handle="true"]');
        if (!isDragHandle) return;

        e.stopPropagation();
        if (contextMenu) setContextMenu(null);
        if (quickAddMenu) setQuickAddMenu(null);
        if (selectedConnectionId) setSelectedConnectionId(null);
        if (showColorPicker) setShowColorPicker(false);

        if (e.touches.length === 1) {
            setDragMode('DRAG_NODE');
            const touch = e.touches[0];
            dragStartRef.current = { x: touch.clientX, y: touch.clientY };
            
            const isAlreadySelected = selectedNodeIds.has(id);
            let newSelection = new Set(selectedNodeIds);
            
            if (!isAlreadySelected) { 
                newSelection.clear(); 
                newSelection.add(id); 
            }
            setSelectedNodeIds(newSelection);
            
            const nodesToDrag = new Set(newSelection);
            const groupIds = Array.from(newSelection).filter(nid => nodes.find(n => n.id === nid)?.type === NodeType.GROUP);
            
            if (groupIds.length > 0) {
                const idToIndex = new Map(nodes.map((n, i) => [n.id, i]));
                nodes.forEach(n => {
                    if (nodesToDrag.has(n.id) || n.type === NodeType.GROUP) return; 
                    for (const gid of groupIds) {
                        const group = nodes.find(g => g.id === gid);
                        if (group) {
                            const isInside = n.x >= group.x && n.x + n.width <= group.x + group.width && 
                                             n.y >= group.y && n.y + n.height <= group.y + group.height;
                            const groupIdx = idToIndex.get(gid)!;
                            const nodeIdx = idToIndex.get(n.id)!;
                            const isOnTop = nodeIdx > groupIdx;
                            if (isInside && isOnTop) {
                                nodesToDrag.add(n.id);
                                break;
                            }
                        }
                    }
                });
            }
            draggingNodesRef.current = nodesToDrag;

            setNodes(prev => {
                const movingNodes = prev.filter(n => nodesToDrag.has(n.id));
                const others = prev.filter(n => !nodesToDrag.has(n.id));
                movingNodes.sort((a, b) => {
                    if (a.type === NodeType.GROUP && b.type !== NodeType.GROUP) return -1;
                    if (a.type !== NodeType.GROUP && b.type === NodeType.GROUP) return 1;
                    return 0;
                });
                return [...others, ...movingNodes];
            });

            if (newSelection.size === 1) {
                const node = nodes.find(n => n.id === id);
                if (node && node.type === NodeType.GROUP && node.color) {
                    setNextGroupColor(node.color);
                }
            }

            initialNodePositionsRef.current = nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
        }
    }, [nodes, selectedNodeIds, contextMenu, quickAddMenu, selectedConnectionId, showColorPicker, setContextMenu, setQuickAddMenu, setSelectedConnectionId, setShowColorPicker, setDragMode, setSelectedNodeIds, setNodes, setNextGroupColor]);

    const handleNodeTouchEnd = useCallback((e: React.TouchEvent, id: string) => {
        if (dragMode === 'NONE') {
            const target = e.target as HTMLElement;
            const isExcluded = target.closest('[data-interactive="true"]') ||
                               target.closest('.absolute.top-full') ||
                               target.closest('.absolute.bottom-full') ||
                               target.tagName === 'INPUT' || 
                               target.tagName === 'TEXTAREA' || 
                               target.tagName === 'BUTTON' ||
                               target.closest('button') ||
                               target.closest('input') ||
                               target.closest('textarea');
            
            if (!isExcluded) {
                const isDragHandle = target.closest('[data-drag-handle="true"]');
                if (isDragHandle) {
                    const isAlreadySelected = selectedNodeIds.has(id);
                    if (!isAlreadySelected) {
                        const newSelection = new Set<string>();
                        newSelection.add(id);
                        setSelectedNodeIds(newSelection);
                    }
                }
            }
        }
    }, [dragMode, selectedNodeIds, setSelectedNodeIds]);

    const handleNodeClick = useCallback((e: React.MouseEvent, id: string) => {
        const target = e.target as HTMLElement;
        const isExcluded = target.closest('[data-interactive="true"]') ||
                           target.closest('.absolute.top-full') ||
                           target.closest('.absolute.bottom-full');
        
        if (!isExcluded) {
            const isAlreadySelected = selectedNodeIds.has(id);
            if (!isAlreadySelected && dragMode === 'NONE') {
                const newSelection = new Set<string>();
                newSelection.add(id);
                setSelectedNodeIds(newSelection);
            }
        }
    }, [selectedNodeIds, dragMode, setSelectedNodeIds]);

    const handleNodeContextMenu = useCallback((e: React.MouseEvent, id: string, type: NodeType) => {
        e.stopPropagation(); e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        setContextMenu({ type: 'NODE', nodeId: id, nodeType: type, x: e.clientX, y: e.clientY, worldX: worldPos.x, worldY: worldPos.y });
        if (!selectedNodeIds.has(id)) setSelectedNodeIds(new Set([id]));
    }, [screenToWorld, selectedNodeIds, setContextMenu, setSelectedNodeIds]);

    const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        setContextMenu({ type: 'CANVAS', x: e.clientX, y: e.clientY, worldX: worldPos.x, worldY: worldPos.y });
    }, [screenToWorld, setContextMenu]);

    // ========== Connection Event Handlers ==========
    const handleResizeStart = useCallback((e: React.MouseEvent, nodeId: string, direction: string = 'SE') => {
        e.stopPropagation(); e.preventDefault();
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        setDragMode('RESIZE_NODE');
        dragStartRef.current = { 
            x: e.clientX, 
            y: e.clientY, 
            w: node.width, 
            h: node.height, 
            nodeId: nodeId, 
            initialNodeX: node.x,
            direction
        };
        setSelectedNodeIds(new Set([nodeId]));
    }, [nodes, setDragMode, setSelectedNodeIds]);

    const handleConnectStart = useCallback((e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => {
        e.stopPropagation(); e.preventDefault();
        connectionStartRef.current = { nodeId, type };
        setDragMode('CONNECT');
        setTempConnection(screenToWorld(e.clientX, e.clientY));
    }, [screenToWorld, setDragMode, setTempConnection]);

    const handleConnectTouchStart = useCallback((e: React.TouchEvent, nodeId: string, type: 'source' | 'target') => {
        e.stopPropagation();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            connectionStartRef.current = { nodeId, type };
            setDragMode('CONNECT');
            setTempConnection(screenToWorld(touch.clientX, touch.clientY));
        }
    }, [screenToWorld, setDragMode, setTempConnection]);

    const handlePortMouseUp = useCallback((e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => {
        e.stopPropagation(); e.preventDefault();
        if (dragMode === 'CONNECT' && connectionStartRef.current && connectionStartRef.current.type === 'source' && type === 'target' && connectionStartRef.current.nodeId !== nodeId) {
            createConnection(connectionStartRef.current.nodeId, nodeId);
        }
    }, [dragMode, createConnection]);


    // ========== Render Functions ==========
    const renderGroupToolbar = () => {
        const isMultiSelect = selectedNodeIds.size > 1;
        const singleGroupSelected = selectedNodeIds.size === 1 && nodes.find(n => n.id === Array.from(selectedNodeIds)[0])?.type === NodeType.GROUP;
        
        if (!isMultiSelect && !singleGroupSelected) return null;

        const pos = getSelectionCenter(transform);
        if (!pos) return null;

        const currentColor = nextGroupColor;

        return (
            <div className="absolute z-[150] flex flex-col items-center pointer-events-none" style={{ left: pos.x, top: pos.y - 60, transform: 'translateX(-50%)' }}>
                <div className={`pointer-events-auto flex items-center p-1.5 rounded-xl shadow-xl backdrop-blur-md border animate-in fade-in zoom-in-95 duration-200 relative ${isDark ? 'bg-[#1A1D21]/90 border-zinc-700' : 'bg-white/90 border-gray-200'}`}>
                    
                    <div className="relative border-r border-gray-500/20 pr-1.5 mr-1.5">
                        <button 
                            className={`w-6 h-6 rounded-md border flex items-center justify-center transition-transform hover:scale-105 ${isDark ? 'border-white/10' : 'border-black/5'}`}
                            style={{ backgroundColor: currentColor }}
                            onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }}
                            title="Select Color"
                        >
                            {showColorPicker ? <Icons.ChevronLeft size={12} className="text-black/50 rotate-90"/> : null}
                        </button>

                        {showColorPicker && (
                            <div className={`absolute top-full left-0 mt-2 p-2 rounded-xl shadow-2xl border grid grid-cols-4 gap-1.5 z-50 min-w-[120px] ${isDark ? 'bg-[#1A1D21] border-zinc-700' : 'bg-white border-gray-200'}`}>
                                {GROUP_COLORS.map(color => (
                                    <button
                                        key={color}
                                        className={`w-5 h-5 rounded-full border transition-transform hover:scale-125 ${isDark ? 'border-white/10' : 'border-black/5'} ${color === currentColor ? 'ring-2 ring-cyan-500 ring-offset-1 ring-offset-black/20' : ''}`}
                                        style={{ backgroundColor: color }}
                                        onClick={(e) => { e.stopPropagation(); handleGroupColorChange(color); }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {singleGroupSelected ? (
                        <button onClick={handleUngroup} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                            <Icons.LayoutGrid size={14}/> Ungroup
                        </button>
                    ) : (
                        <button onClick={handleGroupSelection} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${isDark ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-cyan-500 hover:bg-cyan-400 text-white'}`}>
                            <Icons.LayoutGrid size={14}/> Group
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const renderNewWorkflowDialog = () => {
        if (!showNewWorkflowDialog) return null;
        return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowNewWorkflowDialog(false)} onTouchEnd={(e) => { e.preventDefault(); setShowNewWorkflowDialog(false); }}>
                <div className={`w-[400px] max-w-[90vw] p-6 rounded-2xl shadow-2xl border flex flex-col gap-4 transform transition-all scale-100 ${isDark ? 'bg-[#1A1D21] border-zinc-700 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`} onClick={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
                    <div>
                        <h3 className="text-lg font-bold flex items-center gap-2"><Icons.FilePlus size={20} className="text-cyan-500"/>Create New Workflow</h3>
                        <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Do you want to save your current workflow before creating a new one? <br/>Any unsaved changes will be permanently lost.</p>
                    </div>
                    <div className={`flex flex-wrap justify-end gap-2 mt-2 pt-4 border-t ${isDark ? 'border-zinc-800' : 'border-gray-100'}`}>
                        <button onClick={() => setShowNewWorkflowDialog(false)} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setShowNewWorkflowDialog(false); }} className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${isDark ? 'hover:bg-zinc-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}>Cancel</button>
                        <button onClick={() => handleConfirmNew(false)} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleConfirmNew(false); }} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${isDark ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'}`}>Don't Save</button>
                        <button onClick={() => handleConfirmNew(true)} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleConfirmNew(true); }} className={`px-4 py-2 rounded-lg text-xs font-bold text-white transition-colors shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 ${isDark ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-cyan-500 hover:bg-cyan-400'}`}><Icons.Save size={14}/>Save & New</button>
                    </div>
                </div>
            </div>
        );
    };

    const renderContextMenu = () => {
        if (!contextMenu) return null;
        return (
            <div className={`fixed z-50 border rounded-lg shadow-2xl py-1 min-w-[160px] flex flex-col ${isDark ? 'bg-[#1A1D21] border-zinc-700' : 'bg-white border-gray-200'}`} style={{ left: contextMenu.x, top: contextMenu.y }} onMouseDown={(e) => e.stopPropagation()}>
                {contextMenu.type === 'NODE' && contextMenu.nodeId && (
                    <>
                        {contextMenu.nodeType === NodeType.GROUP ? (
                            <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => { handleUngroup(); setContextMenu(null); }}><Icons.LayoutGrid size={14}/> Ungroup</button>
                        ) : (
                            <>
                                <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => { performCopy(); setContextMenu(null); }}><Icons.Copy size={14}/> Copy</button>
                                {contextMenu.nodeType === NodeType.ORIGINAL_IMAGE && <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => { triggerReplaceImage(contextMenu.nodeId!); setContextMenu(null); }}><Icons.Upload size={14}/> Replace Image</button>}
                                <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => { if (contextMenu.nodeId) copyImageToClipboard(contextMenu.nodeId); setContextMenu(null); }}><Icons.Image size={14}/> Copy Image Data</button>
                            </>
                        )}
                        <div className={`h-px my-1 ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`}></div>
                        <button className={`text-left px-3 py-2 text-xs text-red-400 transition-colors flex items-center gap-2 ${isDark ? 'hover:bg-zinc-800 hover:text-red-300' : 'hover:bg-red-50 hover:text-red-600'}`} onClick={() => { if (contextMenu.nodeId) deleteNode(contextMenu.nodeId); setContextMenu(null); }}><Icons.Trash2 size={14}/> Delete</button>
                    </>
                )}
                {contextMenu.type === 'CANVAS' && (
                    <>
                        <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => { performPaste({ x: contextMenu.worldX, y: contextMenu.worldY }); setContextMenu(null); }} disabled={!internalClipboard}><Icons.Copy size={14}/> Paste</button>
                        <div className={`h-px my-1 ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`}></div>
                        <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => { addNode(NodeType.TEXT_TO_IMAGE, contextMenu.worldX, contextMenu.worldY); setContextMenu(null); }}><Icons.Image size={14}/> Add Text to Image</button>
                        <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => { addNode(NodeType.TEXT_TO_VIDEO, contextMenu.worldX, contextMenu.worldY); setContextMenu(null); }}><Icons.Video size={14}/> Add Text to Video</button>
                    </>
                )}
            </div>
        );
    };

    const renderQuickAddMenu = () => {
        if (!quickAddMenu) return null;
        return (
            <div className={`fixed z-50 border rounded-lg shadow-2xl py-1 min-w-[160px] flex flex-col animate-in fade-in zoom-in-95 duration-100 ${isDark ? 'bg-[#1A1D21] border-zinc-700' : 'bg-white border-gray-200'}`} style={{ left: quickAddMenu.x, top: quickAddMenu.y }} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} data-interactive="true">
                <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b mb-1 ${isDark ? 'text-gray-500 border-zinc-800' : 'text-gray-400 border-gray-100'}`}>Add Node</div>
                <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => handleQuickAddNode(NodeType.TEXT_TO_IMAGE)} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleQuickAddNode(NodeType.TEXT_TO_IMAGE); }} data-interactive="true"><Icons.Image size={14} className="text-cyan-400"/> Text to Image</button>
                <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => handleQuickAddNode(NodeType.TEXT_TO_VIDEO)} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleQuickAddNode(NodeType.TEXT_TO_VIDEO); }} data-interactive="true"><Icons.Video size={14} className="text-cyan-400"/> Text to Video</button>
                <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => handleQuickAddNode(NodeType.CREATIVE_DESC)} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleQuickAddNode(NodeType.CREATIVE_DESC); }} data-interactive="true"><Icons.FileText size={14} className="text-cyan-400"/> Creative Desc</button>
            </div>
        );
    };


    // ========== Main Render ==========
    return (
        <div className="w-full h-screen overflow-hidden flex relative font-sans text-gray-800">
            <ThemeSwitcher isDark={isDark} onToggle={toggleTheme} />
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} isDark={isDark} />

            <Sidebar 
                onAddNode={addNode} 
                onSaveWorkflow={handleSaveWorkflow}
                onLoadWorkflow={() => workflowInputRef.current?.click()}
                onNewWorkflow={() => setShowNewWorkflowDialog(true)}
                onImportAsset={() => assetInputRef.current?.click()}
                onOpenSettings={() => setIsSettingsOpen(true)} 
                onUpdateCanvasBg={setCanvasBg}
                nodes={[...nodes, ...deletedNodes]}
                onPreviewMedia={handleHistoryPreview}
                isDark={isDark}
            />
            <input type="file" ref={workflowInputRef} hidden accept=".aistudio-flow,.json" onChange={handleLoadWorkflow} />
            <input type="file" ref={assetInputRef} hidden accept="image/*" onChange={handleImportAsset} />
            <input type="file" ref={replaceImageRef} hidden accept="image/*" onChange={handleReplaceImage} />
            
            <div 
                ref={containerRef}
                className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing"
                style={{ backgroundColor: canvasBg }}
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
                {/* Canvas Content */}
                <div 
                    className="absolute origin-top-left"
                    style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}
                >
                    {/* Connections SVG */}
                    <svg className="absolute top-0 left-0 w-full h-full overflow-visible pointer-events-none" style={{ zIndex: 0 }}>
                        {visibleConnections.map(conn => {
                            const source = nodes.find(n => n.id === conn.sourceId);
                            const target = nodes.find(n => n.id === conn.targetId);
                            if (!source || !target) return null;
                            
                            const sx = source.x + source.width;
                            const sy = source.y + source.height / 2;
                            const tx = target.x;
                            const ty = target.y + target.height / 2;
                            const midX = (sx + tx) / 2;
                            
                            return (
                                <g key={conn.id}>
                                    <path
                                        d={`M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`}
                                        fill="none"
                                        stroke={selectedConnectionId === conn.id ? '#06B6D4' : (isDark ? '#3f3f46' : '#d1d5db')}
                                        strokeWidth={selectedConnectionId === conn.id ? 3 : 2}
                                        className="pointer-events-auto cursor-pointer"
                                        onClick={(e) => { e.stopPropagation(); setSelectedConnectionId(conn.id); }}
                                    />
                                </g>
                            );
                        })}
                        
                        {/* Temp Connection */}
                        {tempConnection && connectionStartRef.current && (() => {
                            const startNode = nodes.find(n => n.id === connectionStartRef.current?.nodeId);
                            if (!startNode) return null;
                            const sx = connectionStartRef.current.type === 'source' ? startNode.x + startNode.width : startNode.x;
                            const sy = startNode.y + startNode.height / 2;
                            const midX = (sx + tempConnection.x) / 2;
                            return (
                                <path
                                    d={`M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${tempConnection.y}, ${tempConnection.x} ${tempConnection.y}`}
                                    fill="none"
                                    stroke="#06B6D4"
                                    strokeWidth={2}
                                    strokeDasharray="5,5"
                                />
                            );
                        })()}
                    </svg>

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
                            onPortMouseUp={(e, type) => handlePortMouseUp(e, node.id, type)}
                            isDark={isDark}
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

                {/* Zoom Controls */}
                <div className={`absolute bottom-4 right-4 flex items-center gap-2 p-2 rounded-xl backdrop-blur-md border ${isDark ? 'bg-[#1A1D21]/80 border-zinc-700' : 'bg-white/80 border-gray-200'}`}>
                    <button onClick={handleResetZoom} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-zinc-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`} title="Reset Zoom">
                        <Icons.Maximize2 size={14} />
                    </button>
                    <input
                        type="range"
                        min="0.4"
                        max="2"
                        step="0.1"
                        value={transform.k}
                        onChange={handleZoom}
                        className="w-24 accent-cyan-500"
                    />
                    <span className={`text-xs font-mono w-10 text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {Math.round(transform.k * 100)}%
                    </span>
                </div>

                {/* Minimap */}
                {showMinimap && (
                    <Minimap
                        nodes={nodes}
                        connections={connections}
                        transform={transform}
                        viewportSize={viewportSize}
                        onNavigate={handleNavigate}
                        isDark={isDark}
                    />
                )}

                {/* Group Toolbar */}
                {renderGroupToolbar()}
            </div>

            {/* Overlays */}
            {renderContextMenu()}
            {renderQuickAddMenu()}
            {renderNewWorkflowDialog()}

            {/* Preview Modal */}
            {previewMedia && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
                    onClick={() => setPreviewMedia(null)}
                    onTouchEnd={(e) => { e.preventDefault(); setPreviewMedia(null); }}
                >
                    <button 
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                        onClick={() => setPreviewMedia(null)}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setPreviewMedia(null); }}
                    >
                        <Icons.X size={24} />
                    </button>
                    {previewMedia.type === 'image' ? (
                        <img src={previewMedia.url} alt="Preview" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
                    ) : (
                        <video src={previewMedia.url} controls autoPlay className="max-w-[90vw] max-h-[90vh] rounded-lg" onClick={(e) => e.stopPropagation()} />
                    )}
                </div>
            )}
        </div>
    );
};

export default App;
