import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { NodeData, Connection, CanvasTransform, Point, DragMode } from '../types';

interface PersistedCanvasSnapshot {
    nodes: NodeData[];
    connections: Connection[];
    transform: CanvasTransform;
    canvasBg: string;
    deletedNodes: NodeData[];
    updatedAt: number;
}

const CANVAS_DB_NAME = 'canvas_state_db';
const CANVAS_DB_VERSION = 1;
const CANVAS_STORE_NAME = 'snapshots';
const CANVAS_SNAPSHOT_KEY = 'latest';
const CANVAS_UPDATED_AT_KEY = 'canvas_state_updated_at';

let canvasDbPromise: Promise<IDBDatabase | null> | null = null;

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

const getCanvasDb = (): Promise<IDBDatabase | null> => {
    if (typeof window === 'undefined' || !window.indexedDB) {
        return Promise.resolve(null);
    }

    if (!canvasDbPromise) {
        canvasDbPromise = new Promise((resolve, reject) => {
            const request = window.indexedDB.open(CANVAS_DB_NAME, CANVAS_DB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(CANVAS_STORE_NAME)) {
                    db.createObjectStore(CANVAS_STORE_NAME);
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Failed to open canvas IndexedDB'));
        }).catch((error) => {
            console.warn('IndexedDB unavailable, fallback to localStorage only.', error);
            return null;
        });
    }

    return canvasDbPromise;
};

const saveSnapshotToIndexedDb = async (snapshot: PersistedCanvasSnapshot): Promise<void> => {
    const db = await getCanvasDb();
    if (!db) return;

    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CANVAS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(CANVAS_STORE_NAME);
        store.put(snapshot, CANVAS_SNAPSHOT_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
};

const loadSnapshotFromIndexedDb = async (): Promise<PersistedCanvasSnapshot | null> => {
    const db = await getCanvasDb();
    if (!db) return null;

    return new Promise<PersistedCanvasSnapshot | null>((resolve, reject) => {
        const tx = db.transaction(CANVAS_STORE_NAME, 'readonly');
        const store = tx.objectStore(CANVAS_STORE_NAME);
        const request = store.get(CANVAS_SNAPSHOT_KEY);

        request.onsuccess = () => {
            const result = request.result;
            if (!result || typeof result !== 'object') {
                resolve(null);
                return;
            }
            resolve(result as PersistedCanvasSnapshot);
        };
        request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
    });
};

const normalizeNodesForLoad = (nodes: NodeData[]): NodeData[] => {
    // Reset isLoading to false for all nodes on page load
    // Also clear blob URLs as they become invalid after page refresh
    return nodes.map(node => {
        const updates: Partial<NodeData> = { isLoading: false };
        const hadBlobImageSrc = !!(node.imageSrc && node.imageSrc.startsWith('blob:'));
        const hadBlobVideoSrc = !!(node.videoSrc && node.videoSrc.startsWith('blob:'));
        
        // Check if imageSrc is a blob URL (invalid after refresh)
        if (hadBlobImageSrc) {
            updates.imageSrc = undefined;
        }
        
        // Check if videoSrc is a blob URL (invalid after refresh)
        if (hadBlobVideoSrc) {
            updates.videoSrc = undefined;
        }
        
        // Filter out blob URLs from outputArtifacts
        if (node.outputArtifacts && node.outputArtifacts.length > 0) {
            const validArtifacts = node.outputArtifacts.filter(url => !url.startsWith('blob:'));
            updates.outputArtifacts = validArtifacts;
            
            // If current src was blob and we have valid artifacts, use the first one
            if (hadBlobImageSrc && validArtifacts.length > 0 && node.type !== 'TEXT_TO_VIDEO') {
                updates.imageSrc = validArtifacts[0];
            }
            if (hadBlobVideoSrc && validArtifacts.length > 0 && node.type === 'TEXT_TO_VIDEO') {
                updates.videoSrc = validArtifacts[0];
            }
        }
        
        return { ...node, ...updates };
    });
};

const stripHeavyMediaForFallback = (nodes: NodeData[]): NodeData[] => {
    return nodes.map((node) => {
        const nextNode: NodeData = { ...node };

        if (nextNode.imageSrc && (nextNode.imageSrc.startsWith('data:') || nextNode.imageSrc.startsWith('blob:'))) {
            nextNode.imageSrc = undefined;
        }
        if (nextNode.videoSrc && (nextNode.videoSrc.startsWith('data:') || nextNode.videoSrc.startsWith('blob:'))) {
            nextNode.videoSrc = undefined;
        }
        if (nextNode.outputArtifacts && nextNode.outputArtifacts.length > 0) {
            nextNode.outputArtifacts = nextNode.outputArtifacts.filter((url) => !url.startsWith('data:') && !url.startsWith('blob:'));
        }

        return nextNode;
    });
};

const hasSameNodeIdSet = (a: NodeData[], b: NodeData[]): boolean => {
    if (a.length !== b.length) return false;
    const bIds = new Set(b.map((node) => node.id));
    for (const node of a) {
        if (!bIds.has(node.id)) return false;
    }
    return true;
};

const countMediaRefs = (nodes: NodeData[]): number => {
    let total = 0;
    for (const node of nodes) {
        if (node.imageSrc) total += 1;
        if (node.videoSrc) total += 1;
        if (node.outputArtifacts && node.outputArtifacts.length > 0) total += node.outputArtifacts.length;
    }
    return total;
};

const loadNodes = (): NodeData[] => normalizeNodesForLoad(loadState<NodeData[]>('canvas_nodes', []));

const loadDeletedNodes = (): NodeData[] => normalizeNodesForLoad(loadState<NodeData[]>('canvas_deleted_nodes', []));

export const useCanvasState = () => {
    // Core state from localStorage
    const [nodes, setNodes] = useState<NodeData[]>(() => loadNodes());
    const [connections, setConnections] = useState<Connection[]>(() => loadState('canvas_connections', []));
    const [transform, setTransform] = useState<CanvasTransform>(() => loadState('canvas_transform', { x: 0, y: 0, k: 1 }));
    const [canvasBg, setCanvasBg] = useState<string>(() => loadState('canvas_bg', '#0B0C0E'));
    const [deletedNodes, setDeletedNodes] = useState<NodeData[]>(() => loadDeletedNodes());
    const [isStorageHydrated, setIsStorageHydrated] = useState(false);
    const isStorageHydratedRef = useRef(false);
    const indexedDbSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

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
    const [nextGroupColor, setNextGroupColor] = useState('#F8C8DC');

    // Temp connection state
    const [tempConnection, setTempConnection] = useState<Point | null>(null);
    const [suggestedNodes, setSuggestedNodes] = useState<NodeData[]>([]);

    const isDark = canvasBg === '#0B0C0E';

    useEffect(() => {
        let isCancelled = false;

        const hydrateFromIndexedDb = async () => {
            try {
                const snapshot = await loadSnapshotFromIndexedDb();
                if (isCancelled) return;

                const localUpdatedAt = loadState<number>(CANVAS_UPDATED_AT_KEY, 0);
                const indexedUpdatedAt = snapshot?.updatedAt || 0;
                const localNodes = loadNodes();
                const normalizedIndexedNodes = normalizeNodesForLoad(Array.isArray(snapshot?.nodes) ? snapshot!.nodes : []);
                const sameNodeSet = hasSameNodeIdSet(localNodes, normalizedIndexedNodes);
                const indexedHasMoreMedia = sameNodeSet && countMediaRefs(normalizedIndexedNodes) > countMediaRefs(localNodes);
                const shouldUseIndexed = !!snapshot && (indexedUpdatedAt >= localUpdatedAt || indexedHasMoreMedia);

                if (shouldUseIndexed) {
                    setNodes(normalizedIndexedNodes);
                    setConnections(Array.isArray(snapshot!.connections) ? snapshot!.connections : []);
                    setTransform(snapshot!.transform || { x: 0, y: 0, k: 1 });
                    setCanvasBg(snapshot!.canvasBg || '#0B0C0E');
                    setDeletedNodes(normalizeNodesForLoad(Array.isArray(snapshot!.deletedNodes) ? snapshot!.deletedNodes : []));
                }
            } catch (e) {
                console.warn('Failed to hydrate canvas state from IndexedDB', e);
            } finally {
                if (!isCancelled) {
                    isStorageHydratedRef.current = true;
                    setIsStorageHydrated(true);
                }
            }
        };

        hydrateFromIndexedDb();

        return () => {
            isCancelled = true;
        };
    }, []);

    const persistCanvasState = useCallback((state?: {
        nodes?: NodeData[];
        connections?: Connection[];
        transform?: CanvasTransform;
        canvasBg?: string;
        deletedNodes?: NodeData[];
    }) => {
        if (!isStorageHydratedRef.current) return;

        const nextNodes = state?.nodes ?? nodes;
        const nextConnections = state?.connections ?? connections;
        const nextTransform = state?.transform ?? transform;
        const nextCanvasBg = state?.canvasBg ?? canvasBg;
        const nextDeletedNodes = state?.deletedNodes ?? deletedNodes;
        const snapshot: PersistedCanvasSnapshot = {
            nodes: nextNodes,
            connections: nextConnections,
            transform: nextTransform,
            canvasBg: nextCanvasBg,
            deletedNodes: nextDeletedNodes,
            updatedAt: Date.now(),
        };

        try {
            localStorage.setItem('canvas_nodes', JSON.stringify(snapshot.nodes));
            localStorage.setItem('canvas_connections', JSON.stringify(snapshot.connections));
            localStorage.setItem('canvas_transform', JSON.stringify(snapshot.transform));
            localStorage.setItem('canvas_bg', JSON.stringify(snapshot.canvasBg));
            localStorage.setItem('canvas_deleted_nodes', JSON.stringify(snapshot.deletedNodes));
            localStorage.setItem(CANVAS_UPDATED_AT_KEY, JSON.stringify(snapshot.updatedAt));
        } catch (e) {
            console.warn('Failed to persist canvas state', e);
            try {
                localStorage.setItem('canvas_nodes', JSON.stringify(stripHeavyMediaForFallback(snapshot.nodes)));
                localStorage.setItem('canvas_connections', JSON.stringify(snapshot.connections));
                localStorage.setItem('canvas_transform', JSON.stringify(snapshot.transform));
                localStorage.setItem('canvas_bg', JSON.stringify(snapshot.canvasBg));
                localStorage.setItem('canvas_deleted_nodes', JSON.stringify(stripHeavyMediaForFallback(snapshot.deletedNodes)));
                localStorage.setItem(CANVAS_UPDATED_AT_KEY, JSON.stringify(snapshot.updatedAt));
            } catch (fallbackError) {
                console.warn('Failed to persist lightweight canvas fallback', fallbackError);
            }
        }

        indexedDbSaveQueueRef.current = indexedDbSaveQueueRef.current
            .catch(() => undefined)
            .then(() => saveSnapshotToIndexedDb(snapshot))
            .catch((e) => {
                console.warn('Failed to persist canvas state to IndexedDB', e);
            });
    }, [nodes, connections, transform, canvasBg, deletedNodes]);

    // Sync dragModeRef
    useEffect(() => {
        dragModeRef.current = dragMode;
    }, [dragMode]);

    // Persistence Effect with Dynamic Debounce
    useEffect(() => {
        if (!isStorageHydrated) return;

        const isGenerating = nodes.some(n => n.isLoading);
        const hasInlineMedia = nodes.some((node) => {
            if ((node.imageSrc && node.imageSrc.startsWith('data:')) || (node.videoSrc && node.videoSrc.startsWith('data:'))) {
                return true;
            }
            if (node.outputArtifacts && node.outputArtifacts.some((url) => url.startsWith('data:'))) {
                return true;
            }
            return false;
        });
        const delay = hasInlineMedia ? 80 : (isGenerating ? 1200 : 400);

        const handler = setTimeout(() => {
            persistCanvasState();
        }, delay);

        return () => clearTimeout(handler);
    }, [nodes, connections, transform, canvasBg, deletedNodes, isStorageHydrated, persistCanvasState]);

    // Flush pending changes when tab is hidden or page is refreshed
    useEffect(() => {
        const flushNow = () => persistCanvasState();

        const handleBeforeUnload = () => {
            flushNow();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                flushNow();
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [persistCanvasState]);

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
