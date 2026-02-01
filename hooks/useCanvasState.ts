import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { NodeData, Connection, CanvasTransform, Point, DragMode } from '../types';

// Helper to load state safely
const loadState = <T,>(key: string, fallback: T): T => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : fallback;
    } catch (e) {
        console.warn(`Failed to load ${key} from storage`, e);
        return fallback;
    }
};

// Helper to load nodes and reset isLoading state
const loadNodes = (): NodeData[] => {
    const nodes = loadState<NodeData[]>('canvas_nodes', []);
    // Reset isLoading to false for all nodes on page load
    // Also clear blob URLs as they become invalid after page refresh
    return nodes.map(node => {
        const updates: Partial<NodeData> = { isLoading: false };
        
        // Check if imageSrc is a blob URL (invalid after refresh)
        if (node.imageSrc && node.imageSrc.startsWith('blob:')) {
            updates.imageSrc = undefined;
        }
        
        // Check if videoSrc is a blob URL (invalid after refresh)
        if (node.videoSrc && node.videoSrc.startsWith('blob:')) {
            updates.videoSrc = undefined;
        }
        
        // Filter out blob URLs from outputArtifacts
        if (node.outputArtifacts && node.outputArtifacts.length > 0) {
            const validArtifacts = node.outputArtifacts.filter(url => !url.startsWith('blob:'));
            updates.outputArtifacts = validArtifacts;
            
            // If current src was blob and we have valid artifacts, use the first one
            if (updates.imageSrc === undefined && validArtifacts.length > 0 && node.type !== 'TEXT_TO_VIDEO') {
                updates.imageSrc = validArtifacts[0];
            }
            if (updates.videoSrc === undefined && validArtifacts.length > 0 && node.type === 'TEXT_TO_VIDEO') {
                updates.videoSrc = validArtifacts[0];
            }
        }
        
        return { ...node, ...updates };
    });
};

export const useCanvasState = () => {
    // Core state from localStorage
    const [nodes, setNodes] = useState<NodeData[]>(() => loadNodes());
    const [connections, setConnections] = useState<Connection[]>(() => loadState('canvas_connections', []));
    const [transform, setTransform] = useState<CanvasTransform>(() => loadState('canvas_transform', { x: 0, y: 0, k: 1 }));
    const [canvasBg, setCanvasBg] = useState<string>(() => loadState('canvas_bg', '#0B0C0E'));
    const [deletedNodes, setDeletedNodes] = useState<NodeData[]>(() => loadState('canvas_deleted_nodes', []));

    // Selection state
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);

    // Drag state
    const [dragMode, setDragMode] = useState<DragMode | 'RESIZE_NODE' | 'SELECT'>('NONE');
    const dragModeRef = useRef(dragMode);

    // Viewport state
    const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight });

    // UI state
    const [previewMedia, setPreviewMedia] = useState<{ url: string, type: 'image' | 'video' } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ 
        type: 'CANVAS' | 'NODE', 
        nodeId?: string, 
        nodeType?: any, 
        x: number, 
        y: number, 
        worldX: number, 
        worldY: number 
    } | null>(null);
    const [quickAddMenu, setQuickAddMenu] = useState<{ sourceId: string, x: number, y: number, worldX: number, worldY: number } | null>(null);
    const [showNewWorkflowDialog, setShowNewWorkflowDialog] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [showMinimap, setShowMinimap] = useState(true);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [nextGroupColor, setNextGroupColor] = useState('#E0E2E8');

    // Temp connection state
    const [tempConnection, setTempConnection] = useState<Point | null>(null);
    const [suggestedNodes, setSuggestedNodes] = useState<NodeData[]>([]);

    const isDark = canvasBg === '#0B0C0E';

    // Sync dragModeRef
    useEffect(() => {
        dragModeRef.current = dragMode;
    }, [dragMode]);

    // Persistence Effect with Dynamic Debounce
    useEffect(() => {
        const isGenerating = nodes.some(n => n.isLoading);
        const delay = isGenerating ? 2000 : 1000;

        const handler = setTimeout(() => {
            localStorage.setItem('canvas_nodes', JSON.stringify(nodes));
            localStorage.setItem('canvas_connections', JSON.stringify(connections));
            localStorage.setItem('canvas_transform', JSON.stringify(transform));
            localStorage.setItem('canvas_bg', JSON.stringify(canvasBg));
            localStorage.setItem('canvas_deleted_nodes', JSON.stringify(deletedNodes));
        }, delay);

        return () => clearTimeout(handler);
    }, [nodes, connections, transform, canvasBg, deletedNodes]);

    // Viewport resize handler
    useEffect(() => {
        const handleResize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Reset color picker on selection change
    useEffect(() => {
        setShowColorPicker(false);
    }, [selectedNodeIds]);

    // Screen to world coordinate conversion
    const screenToWorld = useCallback((x: number, y: number) => ({
        x: (x - transform.x) / transform.k,
        y: (y - transform.y) / transform.k,
    }), [transform]);

    // Update node data
    const updateNodeData = useCallback((id: string, updates: Partial<NodeData>) => {
        setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
    }, []);

    // Calculate visible nodes with buffer zone
    const visibleNodes = useMemo(() => {
        if (viewportSize.width === 0 || viewportSize.height === 0) return nodes;
        
        const buffer = 200;
        const viewportLeft = -transform.x / transform.k - buffer / transform.k;
        const viewportTop = -transform.y / transform.k - buffer / transform.k;
        const viewportRight = (viewportSize.width - transform.x) / transform.k + buffer / transform.k;
        const viewportBottom = (viewportSize.height - transform.y) / transform.k + buffer / transform.k;
        
        return nodes.filter(node => {
            const nodeRight = node.x + node.width;
            const nodeBottom = node.y + node.height;
            return !(nodeRight < viewportLeft || 
                     node.x > viewportRight || 
                     nodeBottom < viewportTop || 
                     node.y > viewportBottom);
        });
    }, [nodes, transform, viewportSize]);

    const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes]);

    // Calculate visible connections
    const visibleConnections = useMemo(() => {
        if (viewportSize.width === 0 || viewportSize.height === 0) return connections;
        
        const buffer = 200;
        const viewportLeft = -transform.x / transform.k - buffer / transform.k;
        const viewportTop = -transform.y / transform.k - buffer / transform.k;
        const viewportRight = (viewportSize.width - transform.x) / transform.k + buffer / transform.k;
        const viewportBottom = (viewportSize.height - transform.y) / transform.k + buffer / transform.k;
        
        return connections.filter(conn => {
            const source = nodes.find(n => n.id === conn.sourceId);
            const target = nodes.find(n => n.id === conn.targetId);
            if (!source || !target) return false;
            
            const sx = source.x + source.width;
            const sy = source.y + source.height / 2;
            const tx = target.x;
            const ty = target.y + target.height / 2;
            
            const lineLeft = Math.min(sx, tx);
            const lineRight = Math.max(sx, tx);
            const lineTop = Math.min(sy, ty);
            const lineBottom = Math.max(sy, ty);
            
            return !(lineRight < viewportLeft || 
                     lineLeft > viewportRight || 
                     lineBottom < viewportTop || 
                     lineTop > viewportBottom);
        });
    }, [connections, nodes, transform, viewportSize]);

    return {
        // Core state
        nodes, setNodes,
        connections, setConnections,
        transform, setTransform,
        canvasBg, setCanvasBg,
        deletedNodes, setDeletedNodes,
        
        // Selection
        selectedNodeIds, setSelectedNodeIds,
        selectedConnectionId, setSelectedConnectionId,
        selectionBox, setSelectionBox,
        
        // Drag
        dragMode, setDragMode,
        dragModeRef,
        
        // Viewport
        viewportSize, setViewportSize,
        visibleNodes,
        visibleNodeIds,
        visibleConnections,
        
        // UI state
        previewMedia, setPreviewMedia,
        contextMenu, setContextMenu,
        quickAddMenu, setQuickAddMenu,
        showNewWorkflowDialog, setShowNewWorkflowDialog,
        isSettingsOpen, setIsSettingsOpen,
        showMinimap, setShowMinimap,
        showColorPicker, setShowColorPicker,
        nextGroupColor, setNextGroupColor,
        
        // Temp connection
        tempConnection, setTempConnection,
        suggestedNodes, setSuggestedNodes,
        
        // Computed
        isDark,
        
        // Utils
        screenToWorld,
        updateNodeData,
    };
};
