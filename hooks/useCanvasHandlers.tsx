import { useCallback, useEffect, useRef } from 'react';
import { NodeData, CanvasTransform, Point, NodeType, Connection } from '../types';
import { calculateImportDimensions, createDisplayImageSrc } from './useNodeOperations';

// ========== Types ==========
interface CanvasRefs {
    containerRef: { current: HTMLDivElement | null };
    dragStartRef: { current: { x: number; y: number; w?: number; h?: number; nodeId?: string; initialNodeX?: number; direction?: string } };
    initialTransformRef: { current: CanvasTransform };
    initialNodePositionsRef: { current: Map<string, { x: number; y: number }> };
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
    desktopPlatform: 'WIN' | 'MAC';
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
    setDraggingNodeIds: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    getNodesIntersectingBounds: (left: number, top: number, right: number, bottom: number) => NodeData[];
    screenToWorld: (x: number, y: number) => Point;
    updateNodeData: (id: string, updates: Partial<NodeData>) => void;
    markInteractionActivity: () => void;
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
        contextMenu, quickAddMenu, showColorPicker, desktopPlatform,
        setNodes, setConnections, setTransform, setDeletedNodes,
        setSelectedNodeIds, setSelectedConnectionId, setSelectionBox, setDragMode,
        setTempConnection, setSuggestedNodes, setContextMenu, setQuickAddMenu,
        setShowNewWorkflowDialog, setPreviewMedia, setCanvasBg, setShowColorPicker, setNextGroupColor, setDraggingNodeIds,
        getNodesIntersectingBounds, screenToWorld, updateNodeData, markInteractionActivity,
    } = state;

    const {
        addNode, generateId, createConnection,
    } = ops;

    const transformLiveRef = useRef(transform);
    const pendingTransformRef = useRef<CanvasTransform | null>(null);
    const transformRafRef = useRef<number | null>(null);
    const pendingNodeDragRef = useRef<{ id: string; clientX: number; clientY: number; selection: Set<string> } | null>(null);
    const pendingNodeDragDeltaRef = useRef<{ dx: number; dy: number } | null>(null);
    const nodeDragRafRef = useRef<number | null>(null);
    const dragNodeIndexRef = useRef<Map<string, number> | null>(null);
    const dragShouldReorderRef = useRef(false);
    const pendingSingleNodeGroupJoinRef = useRef<string | null>(null);

    useEffect(() => {
        transformLiveRef.current = transform;
    }, [transform]);

    // Snap zoom ratio to stable steps to reduce text/icon blur at problematic fractional scales.
    const snapZoomScale = useCallback((value: number): number => {
        const clamped = Math.min(Math.max(0.2, value), 2.5);
        return Math.round(clamped * 20) / 20; // 0.05 step
    }, []);

    const flushScheduledTransform = useCallback(() => {
        transformRafRef.current = null;
        const next = pendingTransformRef.current;
        if (!next) return;
        pendingTransformRef.current = null;
        setTransform(next);
    }, [setTransform]);

    const scheduleTransform = useCallback((next: CanvasTransform) => {
        transformLiveRef.current = next;
        pendingTransformRef.current = next;
        if (transformRafRef.current !== null) return;
        transformRafRef.current = window.requestAnimationFrame(flushScheduledTransform);
    }, [flushScheduledTransform]);

    const flushScheduledNodeDrag = useCallback(() => {
        nodeDragRafRef.current = null;
        const delta = pendingNodeDragDeltaRef.current;
        pendingNodeDragDeltaRef.current = null;
        if (!delta) return;

        const movingNodeIds = draggingNodesRef.current;
        if (movingNodeIds.size === 0) return;

        setNodes(prev => {
            let idToIndex = dragNodeIndexRef.current;
            if (!idToIndex || idToIndex.size !== prev.length) {
                idToIndex = new Map(prev.map((node, idx) => [node.id, idx]));
                dragNodeIndexRef.current = idToIndex;
            }

            let missingIndex = false;
            for (const id of movingNodeIds) {
                if (!idToIndex.has(id)) {
                    missingIndex = true;
                    break;
                }
            }
            if (missingIndex) {
                idToIndex = new Map(prev.map((node, idx) => [node.id, idx]));
                dragNodeIndexRef.current = idToIndex;
            }

            let next: NodeData[] | null = null;
            for (const id of movingNodeIds) {
                const idx = idToIndex.get(id);
                if (idx === undefined) continue;

                const currentNode = prev[idx];
                const initial = initialNodePositionsRef.current.get(id);
                if (!currentNode || !initial) continue;

                const nextX = initial.x + delta.dx;
                const nextY = initial.y + delta.dy;
                if (currentNode.x === nextX && currentNode.y === nextY) continue;

                if (!next) next = prev.slice();
                next[idx] = { ...currentNode, x: nextX, y: nextY };
            }

            return next ?? prev;
        });
    }, [draggingNodesRef, initialNodePositionsRef, setNodes]);

    const scheduleNodeDrag = useCallback((dx: number, dy: number) => {
        pendingNodeDragDeltaRef.current = { dx, dy };
        if (nodeDragRafRef.current !== null) return;
        nodeDragRafRef.current = window.requestAnimationFrame(flushScheduledNodeDrag);
    }, [flushScheduledNodeDrag]);

    const cancelScheduledNodeDrag = useCallback(() => {
        pendingNodeDragDeltaRef.current = null;
        dragNodeIndexRef.current = null;
        if (nodeDragRafRef.current !== null) {
            window.cancelAnimationFrame(nodeDragRafRef.current);
            nodeDragRafRef.current = null;
        }
    }, []);

    const flushNodeDragNow = useCallback(() => {
        if (nodeDragRafRef.current !== null) {
            window.cancelAnimationFrame(nodeDragRafRef.current);
            nodeDragRafRef.current = null;
        }
        if (pendingNodeDragDeltaRef.current) {
            flushScheduledNodeDrag();
        }
    }, [flushScheduledNodeDrag]);

    const commitSingleNodeGroupJoin = useCallback(() => {
        const draggedNodeId = pendingSingleNodeGroupJoinRef.current;
        pendingSingleNodeGroupJoinRef.current = null;
        if (!draggedNodeId) return;

        setNodes(prev => {
            const draggedIndex = prev.findIndex(node => node.id === draggedNodeId);
            if (draggedIndex === -1) return prev;

            const draggedNode = prev[draggedIndex];
            if (draggedNode.type === NodeType.GROUP) return prev;

            const containingGroups = prev
                .map((node, index) => ({ node, index }))
                .filter(({ node }) => node.type === NodeType.GROUP && node.id !== draggedNodeId)
                .filter(({ node }) =>
                    draggedNode.x >= node.x &&
                    draggedNode.x + draggedNode.width <= node.x + node.width &&
                    draggedNode.y >= node.y &&
                    draggedNode.y + draggedNode.height <= node.y + node.height
                );

            if (containingGroups.length === 0) return prev;

            containingGroups.sort((a, b) => {
                if (a.index !== b.index) return b.index - a.index;
                return (a.node.width * a.node.height) - (b.node.width * b.node.height);
            });

            const targetGroup = containingGroups[0].node;
            const targetGroupIndex = containingGroups[0].index;
            let insertAfter = targetGroupIndex;

            for (let i = targetGroupIndex + 1; i < prev.length; i++) {
                const node = prev[i];
                if (node.id === draggedNodeId) continue;
                const isInsideTargetGroup =
                    node.x >= targetGroup.x &&
                    node.x + node.width <= targetGroup.x + targetGroup.width &&
                    node.y >= targetGroup.y &&
                    node.y + node.height <= targetGroup.y + targetGroup.height;

                if (isInsideTargetGroup) {
                    insertAfter = i;
                }
            }

            const next = prev.slice();
            const [movedNode] = next.splice(draggedIndex, 1);
            let insertIndex = insertAfter + 1;
            if (draggedIndex < insertIndex) insertIndex -= 1;

            if (insertIndex === draggedIndex) return prev;

            next.splice(insertIndex, 0, movedNode);
            return next;
        });
    }, [setNodes]);

    const commitDraggedNodeReorder = useCallback(() => {
        const shouldReorder = dragShouldReorderRef.current;
        dragShouldReorderRef.current = false;
        if (!shouldReorder) return;

        const nodesToDrag = draggingNodesRef.current;
        if (nodesToDrag.size === 0) return;

        setNodes(prev => {
            const movingNodes = prev.filter(node => nodesToDrag.has(node.id));
            if (movingNodes.length === 0) return prev;

            const others = prev.filter(node => !nodesToDrag.has(node.id));
            movingNodes.sort((a, b) => {
                if (a.type === NodeType.GROUP && b.type !== NodeType.GROUP) return -1;
                if (a.type !== NodeType.GROUP && b.type === NodeType.GROUP) return 1;
                return 0;
            });

            const next = [...others, ...movingNodes];
            for (let i = 0; i < prev.length; i++) {
                if (prev[i] !== next[i]) return next;
            }
            return prev;
        });
    }, [draggingNodesRef, setNodes]);

    useEffect(() => {
        return () => {
            if (transformRafRef.current !== null) {
                window.cancelAnimationFrame(transformRafRef.current);
            }
            if (nodeDragRafRef.current !== null) {
                window.cancelAnimationFrame(nodeDragRafRef.current);
            }
        };
    }, []);

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
        const withContent = nodes.filter(n => n.imageSrc || n.originalImageSrc || n.videoSrc);
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
            img.onload = async () => {
                const { width, height, ratio } = calculateImportDimensions(img.width, img.height);
                const src = event.target?.result as string;
                const displaySrc = await createDisplayImageSrc(src);
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect) {
                    const center = screenToWorld(rect.width / 2, rect.height / 2);
                    addNode(NodeType.ORIGINAL_IMAGE, center.x - width / 2, center.y - height / 2, {
                        width, height, imageSrc: displaySrc, originalImageSrc: src, aspectRatio: `${ratio}:1`,
                        outputArtifacts: [displaySrc], outputOriginalArtifacts: [src]
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
                img.onload = async () => {
                    const node = nodes.find(n => n.id === nodeId);
                    if (node) {
                        const { width, height, ratio } = calculateImportDimensions(img.width, img.height);
                        const src = event.target?.result as string;
                        const displaySrc = await createDisplayImageSrc(src);
                        const currentArtifacts = node.outputArtifacts || [];
                        const currentOriginalArtifacts = node.outputOriginalArtifacts || node.outputArtifacts || [];
                        updateNodeData(nodeId, {
                            imageSrc: displaySrc, originalImageSrc: src, width, height,
                            aspectRatio: `${ratio}:1`,
                            outputArtifacts: [displaySrc, ...currentArtifacts],
                            outputOriginalArtifacts: [src, ...currentOriginalArtifacts],
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
                    img.onload = async () => {
                        const { width, height, ratio } = calculateImportDimensions(img.width, img.height);
                        const displaySrc = await createDisplayImageSrc(src);
                        addNode(NodeType.ORIGINAL_IMAGE, worldPos.x - width / 2 + offsetX, worldPos.y - height / 2 + offsetY, {
                            width, height, imageSrc: displaySrc, originalImageSrc: src, aspectRatio: `${ratio}:1`,
                            outputArtifacts: [displaySrc], outputOriginalArtifacts: [src]
                        });
                    };
                    img.src = src;
                };
                reader.readAsDataURL(file);
            } else if (file.type.startsWith('video/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const src = event.target?.result as string;
                    const video = document.createElement('video');
                    video.preload = 'metadata';
                    video.onloadedmetadata = () => {
                        const { width, height, ratio } = calculateImportDimensions(video.videoWidth, video.videoHeight);
                        addNode(NodeType.TEXT_TO_VIDEO, worldPos.x - width / 2 + offsetX, worldPos.y - height / 2 + offsetY, {
                            width, height, videoSrc: src, title: file.name, aspectRatio: `${ratio}:1`, outputArtifacts: [src]
                        });
                    };
                    video.src = src;
                };
                reader.readAsDataURL(file);
            }
        });
    }, [screenToWorld, addNode]);

    // ========== Zoom ==========
    const handleZoom = useCallback((e: any) => {
        const baseTransform = transformLiveRef.current;
        const newK = snapZoomScale(parseFloat(e.target.value));
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mouseX = rect.width / 2;
        const mouseY = rect.height / 2;
        const worldX = (mouseX - baseTransform.x) / baseTransform.k;
        const worldY = (mouseY - baseTransform.y) / baseTransform.k;
        scheduleTransform({ x: mouseX - worldX * newK, y: mouseY - worldY * newK, k: newK });
    }, [scheduleTransform, containerRef, snapZoomScale]);

    const handleResetZoom = useCallback(() => {
        const baseTransform = transformLiveRef.current;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mouseX = rect.width / 2;
        const mouseY = rect.height / 2;
        const worldX = (mouseX - baseTransform.x) / baseTransform.k;
        const worldY = (mouseY - baseTransform.y) / baseTransform.k;
        scheduleTransform({ x: mouseX - worldX, y: mouseY - worldY, k: 1 });
    }, [scheduleTransform, containerRef]);

    const handleWheel = useCallback((e: any) => {
        markInteractionActivity();
        const baseTransform = transformLiveRef.current;
        if (e.ctrlKey || e.metaKey) e.preventDefault();
        const zoomIntensity = 0.1;
        const direction = e.deltaY > 0 ? -1 : 1;
        const newK = snapZoomScale(baseTransform.k + direction * zoomIntensity);
        const rect = containerRef.current!.getBoundingClientRect();
        const worldX = (e.clientX - rect.left - baseTransform.x) / baseTransform.k;
        const worldY = (e.clientY - rect.top - baseTransform.y) / baseTransform.k;
        scheduleTransform({ x: (e.clientX - rect.left) - worldX * newK, y: (e.clientY - rect.top) - worldY * newK, k: newK });
    }, [scheduleTransform, containerRef, snapZoomScale, markInteractionActivity]);

    const handleNavigate = useCallback((x: number, y: number) => {
        const baseTransform = transformLiveRef.current;
        scheduleTransform({ ...baseTransform, x, y });
    }, [scheduleTransform]);

    const handleHistoryPreview = useCallback((url: string, type: 'image' | 'video') => setPreviewMedia({ url, type }), [setPreviewMedia]);

    const toggleTheme = useCallback((dark: boolean) => {
        setCanvasBg(dark ? '#0B0C0E' : '#F5F7FA');
    }, [setCanvasBg]);

    // ========== Touch Events ==========
    const handleTouchStart = useCallback((e: any) => {
        markInteractionActivity();
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
    }, [transform, setDragMode, dragStartRef, initialTransformRef, touchStartRef, markInteractionActivity]);

    const handleTouchMove = useCallback((e: any) => {
        markInteractionActivity();
        if (e.touches.length === 1) {
            if (pendingNodeDragRef.current && dragMode === 'NONE') {
                const touch = e.touches[0];
                const pending = pendingNodeDragRef.current;
                const dx = touch.clientX - pending.clientX;
                const dy = touch.clientY - pending.clientY;
                if ((dx * dx) + (dy * dy) >= 16) {
                    pendingNodeDragRef.current = null;
                    startNodeDrag(pending.id, pending.clientX, pending.clientY, pending.selection);
                    return;
                }
            }
            if (dragMode === 'PAN') {
                const touch = e.touches[0];
                const dx = touch.clientX - dragStartRef.current.x;
                const dy = touch.clientY - dragStartRef.current.y;
                scheduleTransform({ ...initialTransformRef.current, x: initialTransformRef.current.x + dx, y: initialTransformRef.current.y + dy });
            } else if (dragMode === 'DRAG_NODE') {
                const touch = e.touches[0];
                const dx = (touch.clientX - dragStartRef.current.x) / transform.k;
                const dy = (touch.clientY - dragStartRef.current.y) / transform.k;
                scheduleNodeDrag(dx, dy);
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
                const newK = snapZoomScale(initialTransformRef.current.k * scale);
                const rect = containerRef.current!.getBoundingClientRect();
                const cx = touchStartRef.current.centerX - rect.left;
                const cy = touchStartRef.current.centerY - rect.top;
                const worldX = (cx - initialTransformRef.current.x) / initialTransformRef.current.k;
                const worldY = (cy - initialTransformRef.current.y) / initialTransformRef.current.k;
                scheduleTransform({ x: cx - worldX * newK, y: cy - worldY * newK, k: newK });
            }
        }
    }, [dragMode, transform, screenToWorld, scheduleTransform, scheduleNodeDrag, setTempConnection, containerRef, dragStartRef, initialTransformRef, touchStartRef, nodes, snapZoomScale, markInteractionActivity]);

    const handleTouchEnd = useCallback((e: any) => {
        markInteractionActivity();
        pendingNodeDragRef.current = null;
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
        flushNodeDragNow();
        commitDraggedNodeReorder();
        setDragMode('NONE');
        cancelScheduledNodeDrag();
        touchStartRef.current = null;
        setTempConnection(null);
        connectionStartRef.current = null;
        setSuggestedNodes([]);
        commitSingleNodeGroupJoin();
        draggingNodesRef.current.clear();
        setDraggingNodeIds(new Set());
    }, [dragMode, nodes, screenToWorld, createConnection, setQuickAddMenu, setDragMode, setTempConnection, setSuggestedNodes, flushNodeDragNow, commitDraggedNodeReorder, cancelScheduledNodeDrag, commitSingleNodeGroupJoin, connectionStartRef, touchStartRef, draggingNodesRef, setDraggingNodeIds, markInteractionActivity]);

    // ========== Mouse Events ==========
    const handleMouseDown = useCallback((e: any) => {
        markInteractionActivity();
        if (contextMenu) setContextMenu(null);
        if (quickAddMenu) setQuickAddMenu(null);
        if (selectedConnectionId) setSelectedConnectionId(null);
        if (showColorPicker) setShowColorPicker(false);

        if (desktopPlatform === 'MAC' && e.button === 2 && e.target === containerRef.current) {
            setDragMode('PAN');
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            initialTransformRef.current = { ...transform };
            e.preventDefault(); return;
        }

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
    }, [contextMenu, quickAddMenu, selectedConnectionId, showColorPicker, desktopPlatform, transform, spacePressed, setContextMenu, setQuickAddMenu, setSelectedConnectionId, setShowColorPicker, setDragMode, setSelectionBox, setSelectedNodeIds, containerRef, dragStartRef, initialTransformRef, markInteractionActivity]);

    const handleMouseMove = useCallback((e: any) => {
        if (dragMode !== 'NONE' || pendingNodeDragRef.current) {
            markInteractionActivity();
        }
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        const worldPos = screenToWorld(e.clientX, e.clientY);
        if (dragMode !== 'NONE' && e.buttons === 0) {
            flushNodeDragNow();
            commitDraggedNodeReorder();
            commitSingleNodeGroupJoin();
            setDragMode('NONE');
            dragStartRef.current = { x: 0, y: 0 };
            cancelScheduledNodeDrag();
            draggingNodesRef.current.clear();
            dragShouldReorderRef.current = false;
            setDraggingNodeIds(new Set());
            return;
        }

        if (pendingNodeDragRef.current && dragMode === 'NONE' && (e.buttons & 1) === 1) {
            const pending = pendingNodeDragRef.current;
            const dx = e.clientX - pending.clientX;
            const dy = e.clientY - pending.clientY;
            if ((dx * dx) + (dy * dy) >= 16) {
                pendingNodeDragRef.current = null;
                startNodeDrag(pending.id, pending.clientX, pending.clientY, pending.selection);
                return;
            }
        }

        if (dragMode === 'PAN') {
            scheduleTransform({ ...initialTransformRef.current, x: initialTransformRef.current.x + (e.clientX - dragStartRef.current.x), y: initialTransformRef.current.y + (e.clientY - dragStartRef.current.y) });
        } else if (dragMode === 'DRAG_NODE') {
            const dx = (e.clientX - dragStartRef.current.x) / transform.k;
            const dy = (e.clientY - dragStartRef.current.y) / transform.k;
            scheduleNodeDrag(dx, dy);
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
    }, [dragMode, transform, nodes, screenToWorld, setDragMode, scheduleTransform, scheduleNodeDrag, setNodes, setSelectionBox, setSelectedNodeIds, setTempConnection, setSuggestedNodes, flushNodeDragNow, commitDraggedNodeReorder, commitSingleNodeGroupJoin, cancelScheduledNodeDrag, containerRef, dragStartRef, initialTransformRef, connectionStartRef, lastMousePosRef, draggingNodesRef, setDraggingNodeIds, markInteractionActivity]);

    const handleMouseUp = useCallback((e: any) => {
        markInteractionActivity();
        pendingNodeDragRef.current = null;
        if (dragMode === 'CONNECT' && connectionStartRef.current?.type === 'source') {
            setQuickAddMenu({ sourceId: connectionStartRef.current.nodeId, x: e.clientX, y: e.clientY, worldX: screenToWorld(e.clientX, e.clientY).x, worldY: screenToWorld(e.clientX, e.clientY).y });
        }
        if (dragMode !== 'NONE') {
            flushNodeDragNow();
            commitDraggedNodeReorder();
            cancelScheduledNodeDrag();
            setDragMode('NONE'); setTempConnection(null); connectionStartRef.current = null;
            setSuggestedNodes([]); setSelectionBox(null); commitSingleNodeGroupJoin(); draggingNodesRef.current.clear();
            setDraggingNodeIds(new Set());
        }
    }, [dragMode, screenToWorld, setQuickAddMenu, setDragMode, setTempConnection, setSuggestedNodes, setSelectionBox, flushNodeDragNow, commitDraggedNodeReorder, cancelScheduledNodeDrag, commitSingleNodeGroupJoin, connectionStartRef, draggingNodesRef, setDraggingNodeIds, markInteractionActivity]);

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

    const updateSelectionForPointerDown = (id: string, isShift: boolean) => {
        const isAlreadySelected = selectedNodeIds.has(id);

        // Keep the same Set reference when selection does not actually change.
        if (!isShift && isAlreadySelected && selectedNodeIds.size === 1) {
            return selectedNodeIds;
        }

        if (!isShift && isAlreadySelected) {
            return selectedNodeIds;
        }

        const nextSelection = new Set(selectedNodeIds);
        if (isShift) {
            if (isAlreadySelected) {
                nextSelection.delete(id);
            } else {
                nextSelection.add(id);
            }
        } else {
            nextSelection.clear();
            nextSelection.add(id);
        }

        setSelectedNodeIds(nextSelection);
        return nextSelection;
    };

    const startNodeDrag = (id: string, clientX: number, clientY: number, selection: Set<string>) => {
        setDragMode('DRAG_NODE');
        dragStartRef.current = { x: clientX, y: clientY };
        const newSelection = selection;
        cancelScheduledNodeDrag();

        const nodesToDrag = new Set(newSelection);
        const primaryNode = nodes.find(n => n.id === id);
        const nodeById = new Map(nodes.map(n => [n.id, n]));
        const groupIds = Array.from(newSelection).filter(nid => nodeById.get(nid)?.type === NodeType.GROUP);

        if (groupIds.length > 0) {
            const idToIndex = new Map(nodes.map((n, i) => [n.id, i]));
            const groups = groupIds
                .map(gid => {
                    const group = nodeById.get(gid);
                    if (!group) return null;
                    return {
                        x: group.x,
                        y: group.y,
                        right: group.x + group.width,
                        bottom: group.y + group.height,
                        index: idToIndex.get(gid) ?? -1,
                    };
                })
                .filter((group): group is { x: number; y: number; right: number; bottom: number; index: number } => group !== null);

            for (const group of groups) {
                const candidates = getNodesIntersectingBounds(group.x, group.y, group.right, group.bottom);
                for (const n of candidates) {
                    if (nodesToDrag.has(n.id) || n.type === NodeType.GROUP) continue;
                    const nodeIdx = idToIndex.get(n.id) ?? -1;
                    const isInside = n.x >= group.x && n.x + n.width <= group.right &&
                        n.y >= group.y && n.y + n.height <= group.bottom;
                    if (isInside && nodeIdx > group.index) {
                        nodesToDrag.add(n.id);
                    }
                }
            }
        }
        draggingNodesRef.current = nodesToDrag;
        setDraggingNodeIds(new Set(nodesToDrag));

        const shouldReorder =
            newSelection.size > 1 ||
            groupIds.length > 0 ||
            primaryNode?.type === NodeType.GROUP;
        dragShouldReorderRef.current = shouldReorder;
        pendingSingleNodeGroupJoinRef.current =
            newSelection.size === 1 && primaryNode?.type !== NodeType.GROUP
                ? id
                : null;

        if (newSelection.size === 1) {
            const node = nodes.find(n => n.id === id);
            if (node && node.type === NodeType.GROUP && node.color) {
                setNextGroupColor(node.color);
            }
        }

        initialNodePositionsRef.current = new Map(
            nodes
                .filter(n => nodesToDrag.has(n.id))
                .map(n => [n.id, { x: n.x, y: n.y }])
        );
    };

    const handleNodeMouseDown = useCallback((e: any, id: string) => {
        markInteractionActivity();
        const target = e.target as HTMLElement;
        if (isExcludedTarget(target)) return;
        if (!target.closest('[data-drag-handle="true"]')) return;
        e.stopPropagation();
        clearMenus();
        if (e.button === 0) {
            const selection = updateSelectionForPointerDown(id, e.shiftKey);
            pendingNodeDragRef.current = { id, clientX: e.clientX, clientY: e.clientY, selection };
        }
    }, [nodes, selectedNodeIds, contextMenu, quickAddMenu, selectedConnectionId, showColorPicker, setContextMenu, setQuickAddMenu, setSelectedConnectionId, setShowColorPicker, setDragMode, setSelectedNodeIds, setNodes, setNextGroupColor, getNodesIntersectingBounds, dragStartRef, initialNodePositionsRef, draggingNodesRef, markInteractionActivity]);

    const handleNodeTouchStart = useCallback((e: any, id: string) => {
        markInteractionActivity();
        const target = e.target as HTMLElement;
        if (isExcludedTarget(target)) return;
        if (!target.closest('[data-drag-handle="true"]')) return;
        e.stopPropagation();
        clearMenus();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const selection = updateSelectionForPointerDown(id, false);
            pendingNodeDragRef.current = { id, clientX: touch.clientX, clientY: touch.clientY, selection };
        }
    }, [nodes, selectedNodeIds, contextMenu, quickAddMenu, selectedConnectionId, showColorPicker, setContextMenu, setQuickAddMenu, setSelectedConnectionId, setShowColorPicker, setDragMode, setSelectedNodeIds, setNodes, setNextGroupColor, dragStartRef, initialNodePositionsRef, draggingNodesRef, markInteractionActivity]);

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
        // Selection is handled on pointer down to avoid redundant click-time state updates.
    }, []);

    const handleNodeContextMenu = useCallback((e: any, id: string, type: NodeType) => {
        e.stopPropagation(); e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        setContextMenu({ type: 'NODE', nodeId: id, nodeType: type, x: e.clientX, y: e.clientY, worldX: worldPos.x, worldY: worldPos.y });
        if (!selectedNodeIds.has(id)) setSelectedNodeIds(new Set([id]));
    }, [screenToWorld, selectedNodeIds, setContextMenu, setSelectedNodeIds]);

    const handleCanvasContextMenu = useCallback((e: any) => {
        e.preventDefault();
        if (desktopPlatform === 'MAC') return;
        const worldPos = screenToWorld(e.clientX, e.clientY);
        setContextMenu({ type: 'CANVAS', x: e.clientX, y: e.clientY, worldX: worldPos.x, worldY: worldPos.y });
    }, [desktopPlatform, screenToWorld, setContextMenu]);

    const handleCanvasDoubleClick = useCallback((e: any) => {
        if (desktopPlatform !== 'MAC') return;
        if (e.target !== containerRef.current) return;
        e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        setContextMenu({ type: 'CANVAS', x: e.clientX, y: e.clientY, worldX: worldPos.x, worldY: worldPos.y });
    }, [desktopPlatform, screenToWorld, setContextMenu, containerRef]);

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
        handleMouseDown, handleMouseMove, handleMouseUp, commitDraggedNodeReorder,
        // Node
        handleNodeMouseDown, handleNodeTouchStart, handleNodeTouchEnd, handleNodeClick,
        handleNodeContextMenu, handleCanvasContextMenu, handleCanvasDoubleClick,
        // Connection
        handleResizeStart, handleConnectStart, handleConnectTouchStart, handlePortMouseUp,
        // Quick Add
        handleQuickAddNode,
    };
};
