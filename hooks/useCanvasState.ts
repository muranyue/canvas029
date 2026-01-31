import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { NodeData, Connection, CanvasTransform, Point, DragMode } from '../types';

// Helper to load state safely from localStorage
const loadState = <T,>(key: string, fallback: T): T => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : fallback;
    } catch (e) {
        console.warn(`Failed to load ${key} from storage`, e);
        return fallback;
    }
};

// Helper to save state safely to localStorage
const saveState = (key: string, value: any): boolean => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.warn(`Failed to save ${key} to storage`, e);
        // If storage is full, try to clear old data
        if (e instanceof DOMException && e.name === 'QuotaExceededError') {
            try {
                localStorage.removeItem('canvas_deleted_nodes');
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch {
                return false;
            }
        }
        return false;
    }
};

export interface CanvasStateReturn {
    // Core State
    nodes: NodeData[];
    setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    connections: Connection[];
    setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
    transform: CanvasTransform;
    setTransform: React.Dispatch<React.SetStateAction<CanvasTransform>>;
    canvasBg: string;
    setCanvasBg: React.Dispatch<React.SetStateAction<string>>;
    deletedNodes: NodeData[];
    setDeletedNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    
    // Selection State
    selectedNodeIds: Set<string>;
    setSelectedNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    selectedConnectionId: string | null;
    setSelectedConnectionId: React.Dispatch<React.SetStateAction<string | null>>;
    
    // Drag State
    dragMode: DragMode | 'RESIZE_NODE' | 'SELECT';
    setDragMode: React.Dispatch<React.SetStateAction<DragMode | 'RESIZE_NODE' | 'SELECT'>>;
    dragModeRef: React.MutableRefObject<DragMode | 'RESIZE_NODE' | 'SELECT'>;
    
    // UI State
    isDark: boolean;
    viewportSize: { width: number; height: number };
    setViewportSize: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
    
    // Computed Values
    visibleNodes: NodeData[];
    visibleNodeIds: Set<string>;
    visibleConnections: Connection[];
    
    // Refs
    containerRef: React.RefObject<HTMLDivElement>;
    dragStartRef: React.MutableRefObject<{ x: number; y: number; w?: number; h?: number; nodeId?: string; initialNodeX?: number; direction?: string }>;
    initialTransformRef: React.MutableRefObject<CanvasTransform>;
    initialNodePositionsRef: React.MutableRefObject<{ id: string; x: number; y: number }[]>;
    draggingNodesRef: React.MutableRefObject<Set<string>>;
    lastMousePosRef: React.MutableRefObject<Point>;
    spacePressed: React.MutableRefObject<boolean>;
    
    // Utility Functions
    screenToWorld: (x: number, y: number) => Point;
    generateId: () => string;
    updateNodeData: (id: string, updates: Partial<NodeData>) => void;
}

export function useCanvasState(): CanvasStateReturn {
    // Core State - Initialize from localStorage
    const [nodes, setNodes] = useState<NodeData[]>(() => loadState('canvas_nodes', []));
    const [connections, setConnections] = useState<Connection[]>(() => loadState('canvas_connections', []));
    const [transform, setTransform] = useState<CanvasTransform>(() => loadState('canvas_transform', { x: 0, y: 0, k: 1 }));
    const [canvasBg, setCanvasBg] = useState<string>(() => loadState('canvas_bg', '#0B0C0E'));
    const [deletedNodes, setDeletedNodes] = useState<NodeData[]>(() => loadState('canvas_deleted_nodes', []));
    
    // Selection State
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    
    // Drag State
    const [dragMode, setDragMode] = useState<DragMode | 'RESIZE_NODE' | 'SELECT'>('NONE');
    const dragModeRef = useRef(dragMode);
    
    // Viewport State
    const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight });
    
    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ x: number; y: number; w?: number; h?: number; nodeId?: string; initialNodeX?: number; direction?: string }>({ x: 0, y: 0 });
    const initialTransformRef = useRef<CanvasTransform>({ x: 0, y: 0, k: 1 });
    const initialNodePositionsRef = useRef<{ id: string; x: number; y: number }[]>([]);
    const draggingNodesRef = useRef<Set<string>>(new Set());
    const lastMousePosRef = useRef<Point>({ x: 0, y: 0 });
    const spacePressed = useRef(false);
    
    // Derived State
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
            saveState('canvas_nodes', nodes);
            saveState('canvas_connections', connections);
            saveState('canvas_transform', transform);
            saveState('canvas_bg', canvasBg);
            saveState('canvas_deleted_nodes', deletedNodes);
        }, delay);

        return () => clearTimeout(handler);
    }, [nodes, connections, transform, canvasBg, deletedNodes]);
    
    // Viewport resize handler
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
    }, []);
    
    // Utility Functions
    const screenToWorld = useCallback((x: number, y: number): Point => ({
        x: (x - transform.x) / transform.k,
        y: (y - transform.y) / transform.k,
    }), [transform]);
    
    const generateId = useCallback(() => Math.random().toString(36).substr(2, 9), []);
    
    const updateNodeData = useCallback((id: string, updates: Partial<NodeData>) => {
        setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
    }, []);

    
    // Calculate visible nodes with buffer zone for smooth scrolling
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
        // Core State
        nodes,
        setNodes,
        connections,
        setConnections,
        transform,
        setTransform,
        canvasBg,
        setCanvasBg,
        deletedNodes,
        setDeletedNodes,
        
        // Selection State
        selectedNodeIds,
        setSelectedNodeIds,
        selectedConnectionId,
        setSelectedConnectionId,
        
        // Drag State
        dragMode,
        setDragMode,
        dragModeRef,
        
        // UI State
        isDark,
        viewportSize,
        setViewportSize,
        
        // Computed Values
        visibleNodes,
        visibleNodeIds,
        visibleConnections,
        
        // Refs
        containerRef,
        dragStartRef,
        initialTransformRef,
        initialNodePositionsRef,
        draggingNodesRef,
        lastMousePosRef,
        spacePressed,
        
        // Utility Functions
        screenToWorld,
        generateId,
        updateNodeData,
    };
}
