import { useCallback } from 'react';
import { NodeData, CanvasTransform, Point, NodeType, Connection } from '../types';
import { calculateImportDimensions } from './useNodeOperations';

// ========== Types ==========
interface CanvasRefs {
    containerRef: { current: HTMLDivElement | null };
    dragStartRef: { current: { x: number; y: number; w?: number; h?: number; nodeId?: string; initialNodeX?: number; direction?: string } };
    initialTransformRef: { current: CanvasTransform };
    initialNodePositionsRef: { current: { id: string; x: number; y: number }[] };
    connectionStartRef: { current: { nodeId: string; type: 'source' | 'target' } | null };
    lastMousePosRef: { current: Point };
    replaceImageRef: { current: HTMLInputElement | null };
    nodeToReplaceRef: { current: string | null };
    draggingNodesRef: { current: Set<string> };
    touchStartRef: { current: { x: number; y: number; dist: number; centerX: number; centerY: number } | null };
    spacePressed: { current: boolean };
}

interface CanvasStateSetters {
    nodes: NodeData[];
    connections: Connection[];
    transform: CanvasTransform;
    selectedNodeIds: Set<string>;
    selectedConnectionId: string | null;
    dragMode: string;
    contextMenu: any;
    quickAddMenu: any;
    showColorPicker: boolean;
    setNodes: (value: NodeData[] | ((prev: NodeData[]) => NodeData[])) => void;
    setConnections: (value: Connection[] | ((prev: Connection[]) => Connection[])) => void;
    setTransform: (value: CanvasTransform | ((prev: CanvasTransform) => CanvasTransform)) => void;
    setDeletedNodes: (value: NodeData[] | ((prev: NodeData[]) => NodeData[])) => void;
    setSelectedNodeIds: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    setSelectedConnectionId: (value: string | null | ((prev: string | null) => string | null)) => void;
    setSelectionBox: (value: { x: number; y: number; w: number; h: number } | null | ((prev: { x: number; y: number; w: number; h: number } | null) => { x: number; y: number; w: number; h: number } | null)) => void;
    setDragMode: (value: any) => void;
    setTempConnection: (value: Point | null | ((prev: Point | null) => Point | null)) => void;
    setSuggestedNodes: (value: NodeData[] | ((prev: NodeData[]) => NodeData[])) => void;
    setContextMenu: (value: any) => void;
    setQuickAddMenu: (value: any) => void;
    setShowNewWorkflowDialog: (value: boolean | ((prev: boolean) => boolean)) => void;
    setPreviewMedia: (value: { url: string; type: 'image' | 'video' } | null | ((prev: { url: string; type: 'image' | 'video' } | null) => { url: string; type: 'image' | 'video' } | null)) => void;
    setCanvasBg: (value: string | ((prev: string) => string)) => void;
    setShowColorPicker: (value: boolean | ((prev: boolean) => boolean)) => void;
    setNextGroupColor: (value: string | ((prev: string) => string)) => void;
    screenToWorld: (x: number, y: number) => Point;
    updateNodeData: (id: string, updates: Partial<NodeData>) => void;
}

interface CanvasOperations {
    addNode: (type: NodeType, x: number, y: number, overrides?: Partial<NodeData>) => NodeData;
    generateId: () => string;
    createConnection: (sourceId: string, targetId: string) => void;
}

export interface UseCanvasHandlersProps {
    refs: CanvasRefs;
    state: CanvasStateSetters;
    ops: CanvasOperations;
}

export const useCanvasHandlers = ({ refs, state, ops }: UseCanvasHandlersProps) => {
    const {
        containerRef, dragStartRef, initialTransformRef, initialNodePositionsRef,
        connectionStartRef, lastMousePosRef,
        replaceImageRef, nodeToReplaceRef, draggingNodesRef, touchStartRef, spacePressed,
    } = refs;

    const {
        nodes, connections, transform, selectedNodeIds, selectedConnectionId, dragMode,
        contextMenu, quickAddMenu, showColorPicker,
        setNodes, setConnections, setTransform, setDeletedNodes,
        setSelectedNodeIds, setSelectedConnectionId, setSelectionBox, setDragMode,
        setTempConnection, setSuggestedNodes, setContextMenu, setQuickAddMenu,
        setShowNewWorkflowDialog, setPreviewMedia, setCanvasBg, setShowColorPicker, setNextGroupColor,
        screenToWorld, updateNodeData,
    } = state;

    const {
        addNode, generateId, createConnection,
    } = ops;

    // ========== Quick Add Node ==========
    const handleQuickAddNode = useCallback((type: NodeType) => {
        const menu = quickAddMenu;
        if (!menu) return;
        const newNode = addNode(type, menu.worldX, menu.worldY - 200);
        setConnections(prev => [...prev, { id: generateId(), sourceId: menu.sourceId, targetId: newNode.id }]);
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

    const handleLoadWorkflow = useCallback((e: any) => {
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

    // ========== Asset Import ==========
    const handleImportAsset = useCallback((e: any) => {
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
                    addNode(NodeType.ORIGINAL_IMAGE, center.x - width / 2, center.y - height / 2, {
                        width, height, imageSrc: src, aspectRatio: `${ratio}:1`, outputArtifacts: [src]
                    });
                }
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }, [screenToWorld, addNode, containerRef]);

    const handleReplaceImage = useCallback((e: any) => {
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
                        updateNodeData(nodeId, {
                            imageSrc: src, width, height,
                            aspectRatio: `${ratio}:1`,
                            outputArtifacts: [src, ...currentArtifacts]
                        });
                    }
                };
                img.src = event.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
        if (replaceImageRef.current) replaceImageRef.current.value = '';
        nodeToReplaceRef.current = null;
    }, [nodes, updateNodeData, nodeToReplaceRef, replaceImageRef]);

    // ========== Drag & Drop ==========
    const handleDragOver = useCallback((e: any) => { e.preventDefault(); e.stopPropagation(); }, []);

    const handleDrop = useCallback((e: any) => {
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
                        addNode(NodeType.ORIGINAL_IMAGE, worldPos.x - width / 2 + offsetX, worldPos.y - height / 2 + offsetY, {
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
                    addNode(NodeType.TEXT_TO_VIDEO, worldPos.x - width / 2 + offsetX, worldPos.y - height / 2 + offsetY, {
                        width, height, videoSrc: url, title: file.name, aspectRatio: `${ratio}:1`, outputArtifacts: [url]
                    });
                };
                video.src = url;
            }
        });
    }, [screenToWorld, addNode]);

    // ========== Zoom ==========
    const handleZoom = useCallback((e: any) => {
        const newK = parseFloat(e.target.value);
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mouseX = rect.width / 2;
        const mouseY = rect.height / 2;
        const worldX = (mouseX - transform.x) / transform.k;
        const worldY = (mouseY - transform.y) / transform.k;
        setTransform({ x: mouseX - worldX * newK, y: mouseY - worldY * newK, k: newK });
    }, [transform, setTransform, containerRef]);

    const handleResetZoom = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mouseX = rect.width / 2;
        const mouseY = rect.height / 2;
        const worldX = (mouseX - transform.x) / transform.k;
        const worldY = (mouseY - transform.y) / transform.k;
        setTransform({ x: mouseX - worldX, y: mouseY - worldY, k: 1 });
    }, [transform, setTransform, containerRef]);

    const handleWheel = useCallback((e: any) => {
        if (e.ctrlKey || e.metaKey) e.preventDefault();
        const zoomIntensity = 0.1;
        const direction = e.deltaY > 0 ? -1 : 1;
        let newK = transform.k + direction * zoomIntensity;
        newK = Math.min(Math.max(0.4, newK), 2);
        const rect = containerRef.current!.getBoundingClientRect();
        const worldX = (e.clientX - rect.left - transform.x) / transform.k;
        const worldY = (e.clientY - rect.top - transform.y) / transform.k;
        setTransform({ x: (e.clientX - rect.left) - worldX * newK, y: (e.clientY - rect.top) - worldY * newK, k: newK });
    }, [transform, setTransform, containerRef]);

    const handleNavigate = useCallback((x: number, y: number) => {
        setTransform(prev => ({ ...prev, x, y }));
    }, [setTransform]);

    const handleHistoryPreview = useCallback((url: string, type: 'image' | 'video') => setPreviewMedia({ url, type }), [setPreviewMedia]);

    const toggleTheme = useCallback((dark: boolean) => {
        setCanvasBg(dark ? '#0B0C0E' : '#F5F7FA');
    }, [setCanvasBg]);

    // ========== Touch Events ==========
    const handleTouchStart = useCallback((e: any) => {
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
    }, [transform, setDragMode, dragStartRef, initialTransformRef, touchStartRef]);

    const handleTouchMove = useCallback((e: any) => {
        if (e.touches.length === 1) {
            if (dragMode === 'PAN') {
                const touch = e.touches[0];
                const dx = touch.clientX - dragStartRef.current.x;
                const dy = touch.clientY - dragStartRef.current.y;
                setTransform({ ...initialTransformRef.current, x: initialTransformRef.current.x + dx, y: initialTransformRef.current.y + dy });
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
                setTempConnection(screenToWorld(touch.clientX, touch.clientY));
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
                setTransform({ x: cx - worldX * newK, y: cy - worldY * newK, k: newK });
            }
        }
    }, [dragMode, transform, screenToWorld, setTransform, setNodes, setTempConnection, containerRef, dragStartRef, initialTransformRef, initialNodePositionsRef, draggingNodesRef, touchStartRef]);

    const handleTouchEnd = useCallback((e: any) => {
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
                    x: touch.clientX, y: touch.clientY,
                    worldX: worldPos.x, worldY: worldPos.y
                });
            }
        }
        setDragMode('NONE');
        touchStartRef.current = null;
        setTempConnection(null);
        connectionStartRef.current = null;
        setSuggestedNodes([]);
        draggingNodesRef.current.clear();
    }, [dragMode, nodes, screenToWorld, createConnection, setQuickAddMenu, setDragMode, setTempConnection, setSuggestedNodes, connectionStartRef, touchStartRef, draggingNodesRef]);

    // ========== Mouse Events ==========
    const handleMouseDown = useCallback((e: any) => {
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
    }, [contextMenu, quickAddMenu, selectedConnectionId, showColorPicker, transform, spacePressed, setContextMenu, setQuickAddMenu, setSelectedConnectionId, setShowColorPicker, setDragMode, setSelectionBox, setSelectedNodeIds, containerRef, dragStartRef, initialTransformRef]);

    const handleMouseMove = useCallback((e: any) => {
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
            const rect = containerRef.current!.getBoundingClientRect();
            setSelectionBox({ x: x - rect.left, y: y - rect.top, w, h });
            const worldStartX = (x - rect.left - transform.x) / transform.k;
            const worldStartY = (y - rect.top - transform.y) / transform.k;
            const worldWidth = w / transform.k; const worldHeight = h / transform.k;
            const newSelection = new Set<string>();
            nodes.forEach(n => { if (n.x < worldStartX + worldWidth && n.x + n.width > worldStartX && n.y < worldStartY + worldHeight && n.y + n.height > worldStartY) newSelection.add(n.id); });
            setSelectedNodeIds(newSelection);
        } else if (dragMode === 'CONNECT') {
            setTempConnection(worldPos);
            if (connectionStartRef.current?.type === 'source') {
                const candidates = nodes.filter(n => n.id !== connectionStartRef.current?.nodeId).filter(n => n.type !== NodeType.ORIGINAL_IMAGE && n.type !== NodeType.GROUP)
                    .map(n => ({ node: n, dist: Math.sqrt(Math.pow(worldPos.x - (n.x + n.width / 2), 2) + Math.pow(worldPos.y - (n.y + n.height / 2), 2)) }))
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
                    if (direction === 'SE') { newW = Math.max(100, newW + dx); newH = Math.max(100, newH + dy); }
                    else if (direction === 'E') { newW = Math.max(100, newW + dx); }
                    else if (direction === 'W') { const potentialW = Math.max(100, (dragStartRef.current.w || 0) - dx); newW = potentialW; newX = (dragStartRef.current.initialNodeX || 0) + ((dragStartRef.current.w || 0) - newW); }
                    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, width: newW, height: newH, x: newX } : n));
                } else {
                    let ratio = 1.33;
                    if (node.aspectRatio) { const [w, h] = node.aspectRatio.split(':').map(Number); if (!isNaN(w) && !isNaN(h) && h !== 0) ratio = w / h; }
                    else if (node.type === NodeType.ORIGINAL_IMAGE) { ratio = (dragStartRef.current.w || 1) / (dragStartRef.current.h || 1); }
                    let minWidth = 150;
                    if (node.type !== NodeType.CREATIVE_DESC) { const limit1 = ratio >= 1 ? 400 * ratio : 400; minWidth = Math.max(limit1, 400); } else minWidth = 280;
                    let newWidth = Math.max(minWidth, (dragStartRef.current.w || 0) + dx);
                    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, width: newWidth, height: newWidth / ratio } : n));
                }
            }
        }
    }, [dragMode, transform, nodes, screenToWorld, setDragMode, setTransform, setNodes, setSelectionBox, setSelectedNodeIds, setTempConnection, setSuggestedNodes, containerRef, dragStartRef, initialTransformRef, initialNodePositionsRef, draggingNodesRef, connectionStartRef, lastMousePosRef]);

    const handleMouseUp = useCallback((e: any) => {
        if (dragMode === 'CONNECT' && connectionStartRef.current?.type === 'source') {
            setQuickAddMenu({ sourceId: connectionStartRef.current.nodeId, x: e.clientX, y: e.clientY, worldX: screenToWorld(e.clientX, e.clientY).x, worldY: screenToWorld(e.clientX, e.clientY).y });
        }
        if (dragMode !== 'NONE') {
            setDragMode('NONE'); setTempConnection(null); connectionStartRef.current = null;
            setSuggestedNodes([]); setSelectionBox(null); draggingNodesRef.current.clear();
        }
    }, [dragMode, screenToWorld, setQuickAddMenu, setDragMode, setTempConnection, setSuggestedNodes, setSelectionBox, connectionStartRef, draggingNodesRef]);

    // ========== Node Events ==========
    const isExcludedTarget = (target: HTMLElement) => {
        return target.closest('[data-interactive="true"]') ||
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
    };

    const clearMenus = () => {
        if (contextMenu) setContextMenu(null);
        if (quickAddMenu) setQuickAddMenu(null);
        if (selectedConnectionId) setSelectedConnectionId(null);
        if (showColorPicker) setShowColorPicker(false);
    };

    const startNodeDrag = (id: string, clientX: number, clientY: number, isShift: boolean) => {
        setDragMode('DRAG_NODE');
        dragStartRef.current = { x: clientX, y: clientY };

        const isAlreadySelected = selectedNodeIds.has(id);
        let newSelection = new Set(selectedNodeIds);

        if (isShift) {
            isAlreadySelected ? newSelection.delete(id) : newSelection.add(id);
        } else {
            if (!isAlreadySelected) { newSelection.clear(); newSelection.add(id); }
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
                        if (isInside && nodeIdx > groupIdx) { nodesToDrag.add(n.id); break; }
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
    };

    const handleNodeMouseDown = useCallback((e: any, id: string) => {
        const target = e.target as HTMLElement;
        if (isExcludedTarget(target)) return;
        if (!target.closest('[data-drag-handle="true"]')) return;
        e.stopPropagation();
        clearMenus();
        if (e.button === 0) startNodeDrag(id, e.clientX, e.clientY, e.shiftKey);
    }, [nodes, selectedNodeIds, contextMenu, quickAddMenu, selectedConnectionId, showColorPicker, setContextMenu, setQuickAddMenu, setSelectedConnectionId, setShowColorPicker, setDragMode, setSelectedNodeIds, setNodes, setNextGroupColor, dragStartRef, initialNodePositionsRef, draggingNodesRef]);

    const handleNodeTouchStart = useCallback((e: any, id: string) => {
        const target = e.target as HTMLElement;
        if (isExcludedTarget(target)) return;
        if (!target.closest('[data-drag-handle="true"]')) return;
        e.stopPropagation();
        clearMenus();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            startNodeDrag(id, touch.clientX, touch.clientY, false);
        }
    }, [nodes, selectedNodeIds, contextMenu, quickAddMenu, selectedConnectionId, showColorPicker, setContextMenu, setQuickAddMenu, setSelectedConnectionId, setShowColorPicker, setDragMode, setSelectedNodeIds, setNodes, setNextGroupColor, dragStartRef, initialNodePositionsRef, draggingNodesRef]);

    const handleNodeTouchEnd = useCallback((e: any, id: string) => {
        if (dragMode === 'NONE') {
            const target = e.target as HTMLElement;
            const isExcluded = target.closest('[data-interactive="true"]') ||
                target.closest('.absolute.top-full') || target.closest('.absolute.bottom-full') ||
                target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON' ||
                target.closest('button') || target.closest('input') || target.closest('textarea');
            if (!isExcluded && target.closest('[data-drag-handle="true"]')) {
                if (!selectedNodeIds.has(id)) setSelectedNodeIds(new Set([id]));
            }
        }
    }, [dragMode, selectedNodeIds, setSelectedNodeIds]);

    const handleNodeClick = useCallback((e: any, id: string) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-interactive="true"]') || target.closest('.absolute.top-full') || target.closest('.absolute.bottom-full')) return;
        if (!selectedNodeIds.has(id) && dragMode === 'NONE') setSelectedNodeIds(new Set([id]));
    }, [selectedNodeIds, dragMode, setSelectedNodeIds]);

    const handleNodeContextMenu = useCallback((e: any, id: string, type: NodeType) => {
        e.stopPropagation(); e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        setContextMenu({ type: 'NODE', nodeId: id, nodeType: type, x: e.clientX, y: e.clientY, worldX: worldPos.x, worldY: worldPos.y });
        if (!selectedNodeIds.has(id)) setSelectedNodeIds(new Set([id]));
    }, [screenToWorld, selectedNodeIds, setContextMenu, setSelectedNodeIds]);

    const handleCanvasContextMenu = useCallback((e: any) => {
        e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        setContextMenu({ type: 'CANVAS', x: e.clientX, y: e.clientY, worldX: worldPos.x, worldY: worldPos.y });
    }, [screenToWorld, setContextMenu]);

    // ========== Connection Events ==========
    const handleResizeStart = useCallback((e: any, nodeId: string, direction: string = 'SE') => {
        e.stopPropagation(); e.preventDefault();
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        setDragMode('RESIZE_NODE');
        dragStartRef.current = { x: e.clientX, y: e.clientY, w: node.width, h: node.height, nodeId, initialNodeX: node.x, direction };
        setSelectedNodeIds(new Set([nodeId]));
    }, [nodes, setDragMode, setSelectedNodeIds, dragStartRef]);

    const handleConnectStart = useCallback((e: any, nodeId: string, type: 'source' | 'target') => {
        e.stopPropagation(); e.preventDefault();
        connectionStartRef.current = { nodeId, type };
        setDragMode('CONNECT');
        setTempConnection(screenToWorld(e.clientX, e.clientY));
    }, [screenToWorld, setDragMode, setTempConnection, connectionStartRef]);

    const handleConnectTouchStart = useCallback((e: any, nodeId: string, type: 'source' | 'target') => {
        e.stopPropagation();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            connectionStartRef.current = { nodeId, type };
            setDragMode('CONNECT');
            setTempConnection(screenToWorld(touch.clientX, touch.clientY));
        }
    }, [screenToWorld, setDragMode, setTempConnection, connectionStartRef]);

    const handlePortMouseUp = useCallback((e: any, nodeId: string, type: 'source' | 'target') => {
        e.stopPropagation(); e.preventDefault();
        if (dragMode === 'CONNECT' && connectionStartRef.current && connectionStartRef.current.type === 'source' && type === 'target' && connectionStartRef.current.nodeId !== nodeId) {
            createConnection(connectionStartRef.current.nodeId, nodeId);
        }
    }, [dragMode, createConnection, connectionStartRef]);

    return {
        // Workflow
        handleSaveWorkflow, handleConfirmNew, handleLoadWorkflow,
        // Asset
        handleImportAsset, handleReplaceImage,
        // Drag & Drop
        handleDragOver, handleDrop,
        // Zoom
        handleZoom, handleResetZoom, handleWheel, handleNavigate,
        // Theme
        toggleTheme, handleHistoryPreview,
        // Touch
        handleTouchStart, handleTouchMove, handleTouchEnd,
        // Mouse
        handleMouseDown, handleMouseMove, handleMouseUp,
        // Node
        handleNodeMouseDown, handleNodeTouchStart, handleNodeTouchEnd, handleNodeClick,
        handleNodeContextMenu, handleCanvasContextMenu,
        // Connection
        handleResizeStart, handleConnectStart, handleConnectTouchStart, handlePortMouseUp,
        // Quick Add
        handleQuickAddNode,
    };
};
