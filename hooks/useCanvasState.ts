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
// Keep at least one off-screen node range preloaded, regardless of zoom level.
const VIEWPORT_CULL_BUFFER_PX = 240;
const MIN_PRELOAD_NODE_BUFFER_WORLD = 900;
const SPATIAL_HASH_CELL_SIZE = 1200;
const MAX_INDEXED_CELLS_PER_NODE = 128;
const MAX_INDEXED_CELLS_PER_CONNECTION = 128;

interface SpatialBounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

interface NodeSpatialIndexData {
    cellMap: Map<string, string[]>;
    boundsById: Map<string, SpatialBounds & { node: NodeData }>;
    overflowIds: string[];
    geometryById: Map<string, SpatialBounds>;
}

interface ConnectionSpatialIndexData {
    cellMap: Map<string, string[]>;
    boundsById: Map<string, SpatialBounds & { conn: Connection }>;
    overflowIds: string[];
    geometryById: Map<string, SpatialBounds>;
}

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

const isBlobUrl = (url?: string): boolean => !!url && url.startsWith('blob:');
const isInlineMediaUrl = (url?: string): boolean => !!url && (url.startsWith('data:') || url.startsWith('blob:'));
const toCellKey = (x: number, y: number) => `${x},${y}`;
const matchesNodeBounds = (bounds: SpatialBounds | undefined, node: NodeData) =>
    !!bounds &&
    bounds.left === node.x &&
    bounds.top === node.y &&
    bounds.right === node.x + node.width &&
    bounds.bottom === node.y + node.height;

const cloneCellMap = (cellMap: Map<string, string[]>) => {
    const next = new Map<string, string[]>();
    for (const [key, value] of cellMap) {
        next.set(key, [...value]);
    }
    return next;
};

const matchesConnectionBounds = (bounds: SpatialBounds | undefined, source: NodeData, target: NodeData) => {
    if (!bounds) return false;

    const sx = source.x + source.width;
    const sy = source.y + source.height / 2;
    const tx = target.x;
    const ty = target.y + target.height / 2;

    return bounds.left === Math.min(sx, tx) &&
        bounds.right === Math.max(sx, tx) &&
        bounds.top === Math.min(sy, ty) &&
        bounds.bottom === Math.max(sy, ty);
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
        const hadBlobImageSrc = isBlobUrl(node.imageSrc);
        const hadBlobOriginalImageSrc = isBlobUrl(node.originalImageSrc);
        const hadBlobVideoSrc = isBlobUrl(node.videoSrc);
        const isVideoNode = node.type === 'TEXT_TO_VIDEO';
        
        // Check if imageSrc is a blob URL (invalid after refresh)
        if (hadBlobImageSrc) {
            updates.imageSrc = undefined;
        }
        if (hadBlobOriginalImageSrc) {
            updates.originalImageSrc = undefined;
        }
        
        // Check if videoSrc is a blob URL (invalid after refresh)
        if (hadBlobVideoSrc) {
            updates.videoSrc = undefined;
        }
        
        // Keep display/original artifact arrays aligned and remove invalid blob URLs
        const displayArtifacts = node.outputArtifacts || [];
        const originalArtifacts = node.outputOriginalArtifacts || displayArtifacts;
        if (displayArtifacts.length > 0 || originalArtifacts.length > 0) {
            const normalizedPairs: { display: string; original: string }[] = [];
            const total = Math.max(displayArtifacts.length, originalArtifacts.length);
            for (let i = 0; i < total; i++) {
                const displayCandidate = displayArtifacts[i] || originalArtifacts[i];
                const originalCandidate = originalArtifacts[i] || displayArtifacts[i];
                if (!displayCandidate && !originalCandidate) continue;
                const validDisplay = displayCandidate && !isBlobUrl(displayCandidate) ? displayCandidate : undefined;
                const validOriginal = originalCandidate && !isBlobUrl(originalCandidate) ? originalCandidate : undefined;
                if (!validDisplay && !validOriginal) continue;
                normalizedPairs.push({
                    display: validDisplay || validOriginal || '',
                    original: validOriginal || validDisplay || '',
                });
            }

            updates.outputArtifacts = normalizedPairs.map((pair) => pair.display);
            if (!isVideoNode || (node.outputOriginalArtifacts && node.outputOriginalArtifacts.length > 0)) {
                updates.outputOriginalArtifacts = normalizedPairs.map((pair) => pair.original);
            }

            // Recover primary src when blob got invalidated or legacy data is missing fields
            if (normalizedPairs.length > 0) {
                if (isVideoNode) {
                    if (hadBlobVideoSrc || !node.videoSrc) {
                        updates.videoSrc = normalizedPairs[0].display;
                    }
                } else {
                    if (hadBlobImageSrc || hadBlobOriginalImageSrc || !node.imageSrc || !node.originalImageSrc) {
                        updates.imageSrc = normalizedPairs[0].display;
                        updates.originalImageSrc = normalizedPairs[0].original;
                    }
                }
            }
        }

        // Legacy compatibility for image nodes: keep both display/original available
        if (!isVideoNode) {
            const resolvedImageSrc = hadBlobImageSrc ? updates.imageSrc : (updates.imageSrc ?? node.imageSrc);
            const resolvedOriginalSrc = hadBlobOriginalImageSrc
                ? updates.originalImageSrc
                : (updates.originalImageSrc ?? node.originalImageSrc ?? node.imageSrc);

            if (!resolvedOriginalSrc && resolvedImageSrc) {
                updates.originalImageSrc = resolvedImageSrc;
            }
            if (!resolvedImageSrc && resolvedOriginalSrc) {
                updates.imageSrc = resolvedOriginalSrc;
            }
        }
        
        return { ...node, ...updates };
    });
};

const stripHeavyMediaForFallback = (nodes: NodeData[]): NodeData[] => {
    return nodes.map((node) => {
        const nextNode: NodeData = { ...node };
        const isVideoNode = nextNode.type === 'TEXT_TO_VIDEO';

        if (isInlineMediaUrl(nextNode.imageSrc)) {
            nextNode.imageSrc = undefined;
        }
        if (isInlineMediaUrl(nextNode.originalImageSrc)) {
            nextNode.originalImageSrc = undefined;
        }
        if (isInlineMediaUrl(nextNode.videoSrc)) {
            nextNode.videoSrc = undefined;
        }

        const displayArtifacts = nextNode.outputArtifacts || [];
        const originalArtifacts = nextNode.outputOriginalArtifacts || displayArtifacts;
        if (displayArtifacts.length > 0 || originalArtifacts.length > 0) {
            const pairs: { display: string; original: string }[] = [];
            const total = Math.max(displayArtifacts.length, originalArtifacts.length);
            for (let i = 0; i < total; i++) {
                const displayCandidate = displayArtifacts[i] || originalArtifacts[i];
                const originalCandidate = originalArtifacts[i] || displayArtifacts[i];
                if (!displayCandidate && !originalCandidate) continue;
                const validDisplay = displayCandidate && !isInlineMediaUrl(displayCandidate) ? displayCandidate : undefined;
                const validOriginal = originalCandidate && !isInlineMediaUrl(originalCandidate) ? originalCandidate : undefined;
                if (!validDisplay && !validOriginal) continue;
                pairs.push({
                    display: validDisplay || validOriginal || '',
                    original: validOriginal || validDisplay || '',
                });
            }
            nextNode.outputArtifacts = pairs.map((pair) => pair.display);
            if (!isVideoNode || (nextNode.outputOriginalArtifacts && nextNode.outputOriginalArtifacts.length > 0)) {
                nextNode.outputOriginalArtifacts = pairs.map((pair) => pair.original);
            }

            if (pairs.length > 0) {
                if (isVideoNode) {
                    if (!nextNode.videoSrc) nextNode.videoSrc = pairs[0].display;
                } else {
                    if (!nextNode.imageSrc) nextNode.imageSrc = pairs[0].display;
                    if (!nextNode.originalImageSrc) nextNode.originalImageSrc = pairs[0].original;
                }
            }
        }

        if (!isVideoNode) {
            if (!nextNode.originalImageSrc && nextNode.imageSrc) {
                nextNode.originalImageSrc = nextNode.imageSrc;
            }
            if (!nextNode.imageSrc && nextNode.originalImageSrc) {
                nextNode.imageSrc = nextNode.originalImageSrc;
            }
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
        if (node.originalImageSrc) total += 1;
        if (node.videoSrc) total += 1;
        if (node.outputArtifacts && node.outputArtifacts.length > 0) total += node.outputArtifacts.length;
        if (node.outputOriginalArtifacts && node.outputOriginalArtifacts.length > 0) total += node.outputOriginalArtifacts.length;
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
    const [desktopPlatform, setDesktopPlatform] = useState<'WIN' | 'MAC'>(() => {
        const stored = loadState<'WIN' | 'MAC'>('canvas_desktop_platform', 'WIN');
        return stored === 'MAC' ? 'MAC' : 'WIN';
    });

    // Temp connection state
    const [tempConnection, setTempConnection] = useState<Point | null>(null);
    const [suggestedNodes, setSuggestedNodes] = useState<NodeData[]>([]);

    const isDark = canvasBg === '#0B0C0E';
    const nodeSpatialIndexCacheRef = useRef<NodeSpatialIndexData | null>(null);
    const connectionSpatialIndexCacheRef = useRef<ConnectionSpatialIndexData | null>(null);
    const heavyPersistTimeoutRef = useRef<number | null>(null);
    const heavyPersistIdleHandleRef = useRef<number | null>(null);
    const pendingHeavyPersistRef = useRef(false);
    const latestCanvasSnapshotRef = useRef<{
        nodes: NodeData[];
        connections: Connection[];
        transform: CanvasTransform;
        canvasBg: string;
        deletedNodes: NodeData[];
    }>({
        nodes,
        connections,
        transform,
        canvasBg,
        deletedNodes,
    });
    const lastHeavyPersistRef = useRef<{
        nodes: NodeData[];
        connections: Connection[];
        canvasBg: string;
        deletedNodes: NodeData[];
    }>({
        nodes,
        connections,
        canvasBg,
        deletedNodes,
    });
    const lastInteractionAtRef = useRef(0);

    latestCanvasSnapshotRef.current = {
        nodes,
        connections,
        transform,
        canvasBg,
        deletedNodes,
    };

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

    const persistTransformOnly = useCallback((nextTransform?: CanvasTransform) => {
        if (!isStorageHydratedRef.current) return;
        const value = nextTransform ?? transform;
        try {
            localStorage.setItem('canvas_transform', JSON.stringify(value));
        } catch (e) {
            console.warn('Failed to persist canvas transform', e);
        }
    }, [transform]);

    const clearScheduledHeavyPersist = useCallback(() => {
        if (heavyPersistTimeoutRef.current !== null) {
            window.clearTimeout(heavyPersistTimeoutRef.current);
            heavyPersistTimeoutRef.current = null;
        }

        if (heavyPersistIdleHandleRef.current !== null) {
            const cancelIdle = (window as any).cancelIdleCallback as
                ((id: number) => void) | undefined;
            if (cancelIdle) {
                cancelIdle(heavyPersistIdleHandleRef.current);
            }
            heavyPersistIdleHandleRef.current = null;
        }
    }, []);

    const getHeavyPersistDelay = useCallback((nextNodes: NodeData[]) => {
        const isGenerating = nextNodes.some(n => n.isLoading);
        const hasInlineMedia = nextNodes.some((node) => {
            if (isInlineMediaUrl(node.imageSrc) || isInlineMediaUrl(node.originalImageSrc) || isInlineMediaUrl(node.videoSrc)) {
                return true;
            }
            if (node.outputArtifacts && node.outputArtifacts.some((url) => isInlineMediaUrl(url))) {
                return true;
            }
            if (node.outputOriginalArtifacts && node.outputOriginalArtifacts.some((url) => isInlineMediaUrl(url))) {
                return true;
            }
            return false;
        });
        const baseDelay = hasInlineMedia ? 240 : (isGenerating ? 1200 : 500);
        const timeSinceInteraction = Date.now() - lastInteractionAtRef.current;
        return timeSinceInteraction < 900
            ? Math.max(baseDelay, 900)
            : baseDelay;
    }, []);

    const scheduleHeavyPersist = useCallback((state?: {
        nodes?: NodeData[];
        connections?: Connection[];
        transform?: CanvasTransform;
        canvasBg?: string;
        deletedNodes?: NodeData[];
    }) => {
        if (!isStorageHydratedRef.current) return;
        if (dragModeRef.current !== 'NONE') return;

        const snapshot = {
            nodes: state?.nodes ?? latestCanvasSnapshotRef.current.nodes,
            connections: state?.connections ?? latestCanvasSnapshotRef.current.connections,
            transform: state?.transform ?? latestCanvasSnapshotRef.current.transform,
            canvasBg: state?.canvasBg ?? latestCanvasSnapshotRef.current.canvasBg,
            deletedNodes: state?.deletedNodes ?? latestCanvasSnapshotRef.current.deletedNodes,
        };

        pendingHeavyPersistRef.current = true;
        clearScheduledHeavyPersist();

        const delay = getHeavyPersistDelay(snapshot.nodes);
        heavyPersistTimeoutRef.current = window.setTimeout(() => {
            heavyPersistTimeoutRef.current = null;
            const requestIdle = (window as any).requestIdleCallback as
                ((cb: () => void, opts?: { timeout?: number }) => number) | undefined;

            const runPersist = () => {
                heavyPersistIdleHandleRef.current = null;
                pendingHeavyPersistRef.current = false;
                persistCanvasState(snapshot);
            };

            if (requestIdle) {
                heavyPersistIdleHandleRef.current = requestIdle(runPersist, { timeout: 1600 });
            } else {
                runPersist();
            }
        }, delay);
    }, [clearScheduledHeavyPersist, getHeavyPersistDelay, persistCanvasState]);

    const markInteractionActivity = useCallback(() => {
        lastInteractionAtRef.current = Date.now();
        if (!pendingHeavyPersistRef.current) return;

        clearScheduledHeavyPersist();
        if (dragModeRef.current === 'NONE') {
            scheduleHeavyPersist();
        }
    }, [clearScheduledHeavyPersist, scheduleHeavyPersist]);

    // Sync dragModeRef
    useEffect(() => {
        dragModeRef.current = dragMode;
        if (dragMode !== 'NONE') {
            lastInteractionAtRef.current = Date.now();
            clearScheduledHeavyPersist();
        } else if (pendingHeavyPersistRef.current) {
            scheduleHeavyPersist();
        }
    }, [clearScheduledHeavyPersist, dragMode, scheduleHeavyPersist]);

    // Heavy persistence effect (nodes/connections/media/config)
    useEffect(() => {
        if (!isStorageHydrated) return;
        if (dragMode !== 'NONE') return;

        const hasHeavyChanges =
            lastHeavyPersistRef.current.nodes !== nodes ||
            lastHeavyPersistRef.current.connections !== connections ||
            lastHeavyPersistRef.current.canvasBg !== canvasBg ||
            lastHeavyPersistRef.current.deletedNodes !== deletedNodes;

        if (!hasHeavyChanges) return;

        lastHeavyPersistRef.current = { nodes, connections, canvasBg, deletedNodes };
        scheduleHeavyPersist({ nodes, connections, transform, canvasBg, deletedNodes });

        return () => {
            clearScheduledHeavyPersist();
        };
    }, [nodes, connections, transform, canvasBg, deletedNodes, isStorageHydrated, dragMode, clearScheduledHeavyPersist, scheduleHeavyPersist]);

    // Lightweight transform persistence effect (pan/zoom only)
    useEffect(() => {
        if (!isStorageHydrated) return;
        if (dragMode !== 'NONE') return;

        const handler = setTimeout(() => {
            persistTransformOnly(transform);
        }, 160);

        return () => clearTimeout(handler);
    }, [transform, isStorageHydrated, dragMode, persistTransformOnly]);

    // Flush pending changes when tab is hidden or page is refreshed
    useEffect(() => {
        const flushNow = () => {
            persistTransformOnly(transform);
            persistCanvasState();
        };

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
    }, [persistCanvasState, persistTransformOnly, transform]);

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

    useEffect(() => {
        try {
            localStorage.setItem('canvas_desktop_platform', JSON.stringify(desktopPlatform));
        } catch (e) {
            console.warn('Failed to persist desktop platform setting', e);
        }
    }, [desktopPlatform]);

    // Screen to world coordinate conversion
    const screenToWorld = useCallback((x: number, y: number) => ({
        x: (x - transform.x) / transform.k,
        y: (y - transform.y) / transform.k,
    }), [transform]);

    // Update node data
    const updateNodeData = useCallback((id: string, updates: Partial<NodeData>) => {
        if (!updates || Object.keys(updates).length === 0) return;
        markInteractionActivity();
        setNodes(prev => {
            let changed = false;
            const next = prev.map(n => {
                if (n.id !== id) return n;

                let hasDiff = false;
                for (const key of Object.keys(updates) as (keyof NodeData)[]) {
                    if (n[key] !== updates[key]) {
                        hasDiff = true;
                        break;
                    }
                }

                if (!hasDiff) return n;
                changed = true;
                return { ...n, ...updates };
            });
            return changed ? next : prev;
        });
    }, [markInteractionActivity]);

    const nodeById = useMemo(() => {
        const map = new Map<string, NodeData>();
        for (const node of nodes) map.set(node.id, node);
        return map;
    }, [nodes]);

    const nodeOrderById = useMemo(() => {
        const map = new Map<string, number>();
        for (let i = 0; i < nodes.length; i++) {
            map.set(nodes[i].id, i);
        }
        return map;
    }, [nodes]);

    const connectionOrderById = useMemo(() => {
        const map = new Map<string, number>();
        for (let i = 0; i < connections.length; i++) {
            map.set(connections[i].id, i);
        }
        return map;
    }, [connections]);

    const nodeSpatialIndex = useMemo(() => {
        const prevIndex = nodeSpatialIndexCacheRef.current;
        if (prevIndex && nodes.length === prevIndex.geometryById.size + 1) {
            let appendedNode: NodeData | null = null;
            let canAppendIncrementally = true;

            for (const node of nodes) {
                const prevBounds = prevIndex.geometryById.get(node.id);
                if (!prevBounds) {
                    if (appendedNode) {
                        canAppendIncrementally = false;
                        break;
                    }
                    appendedNode = node;
                    continue;
                }

                if (!matchesNodeBounds(prevBounds, node)) {
                    canAppendIncrementally = false;
                    break;
                }
            }

            if (canAppendIncrementally && appendedNode) {
                const left = appendedNode.x;
                const top = appendedNode.y;
                const right = appendedNode.x + appendedNode.width;
                const bottom = appendedNode.y + appendedNode.height;
                const nextCellMap = cloneCellMap(prevIndex.cellMap);
                const nextBoundsById = new Map(prevIndex.boundsById);
                const nextGeometryById = new Map(prevIndex.geometryById);
                const nextOverflowIds = [...prevIndex.overflowIds];

                nextBoundsById.set(appendedNode.id, { left, top, right, bottom, node: appendedNode });
                nextGeometryById.set(appendedNode.id, { left, top, right, bottom });

                const minCellX = Math.floor(left / SPATIAL_HASH_CELL_SIZE);
                const maxCellX = Math.floor(right / SPATIAL_HASH_CELL_SIZE);
                const minCellY = Math.floor(top / SPATIAL_HASH_CELL_SIZE);
                const maxCellY = Math.floor(bottom / SPATIAL_HASH_CELL_SIZE);
                const cells = (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1);

                if (cells > MAX_INDEXED_CELLS_PER_NODE) {
                    nextOverflowIds.push(appendedNode.id);
                } else {
                    for (let cx = minCellX; cx <= maxCellX; cx++) {
                        for (let cy = minCellY; cy <= maxCellY; cy++) {
                            const key = toCellKey(cx, cy);
                            const list = nextCellMap.get(key);
                            if (list) {
                                list.push(appendedNode.id);
                            } else {
                                nextCellMap.set(key, [appendedNode.id]);
                            }
                        }
                    }
                }

                const appendedIndex: NodeSpatialIndexData = {
                    cellMap: nextCellMap,
                    boundsById: nextBoundsById,
                    overflowIds: nextOverflowIds,
                    geometryById: nextGeometryById,
                };
                nodeSpatialIndexCacheRef.current = appendedIndex;
                return appendedIndex;
            }
        }

        if (prevIndex && prevIndex.geometryById.size === nodes.length) {
            let geometryUnchanged = true;
            const changedRefs: NodeData[] = [];

            for (const node of nodes) {
                if (!matchesNodeBounds(prevIndex.geometryById.get(node.id), node)) {
                    geometryUnchanged = false;
                    break;
                }

                if (prevIndex.boundsById.get(node.id)?.node !== node) {
                    changedRefs.push(node);
                }
            }

            if (geometryUnchanged) {
                if (changedRefs.length === 0) {
                    return prevIndex;
                }

                const refreshedBoundsById = new Map(prevIndex.boundsById);
                for (const node of changedRefs) {
                    const prevBounds = refreshedBoundsById.get(node.id);
                    if (!prevBounds) continue;
                    refreshedBoundsById.set(node.id, { ...prevBounds, node });
                }

                const refreshedIndex: NodeSpatialIndexData = {
                    cellMap: prevIndex.cellMap,
                    boundsById: refreshedBoundsById,
                    overflowIds: prevIndex.overflowIds,
                    geometryById: prevIndex.geometryById,
                };
                nodeSpatialIndexCacheRef.current = refreshedIndex;
                return refreshedIndex;
            }
        }

        const cellMap = new Map<string, string[]>();
        const boundsById = new Map<string, { left: number; top: number; right: number; bottom: number; node: NodeData }>();
        const overflowIds: string[] = [];
        const geometryById = new Map<string, SpatialBounds>();

        for (const node of nodes) {
            const left = node.x;
            const top = node.y;
            const right = node.x + node.width;
            const bottom = node.y + node.height;
            boundsById.set(node.id, { left, top, right, bottom, node });
            geometryById.set(node.id, { left, top, right, bottom });

            const minCellX = Math.floor(left / SPATIAL_HASH_CELL_SIZE);
            const maxCellX = Math.floor(right / SPATIAL_HASH_CELL_SIZE);
            const minCellY = Math.floor(top / SPATIAL_HASH_CELL_SIZE);
            const maxCellY = Math.floor(bottom / SPATIAL_HASH_CELL_SIZE);
            const cells = (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1);

            if (cells > MAX_INDEXED_CELLS_PER_NODE) {
                overflowIds.push(node.id);
                continue;
            }

            for (let cx = minCellX; cx <= maxCellX; cx++) {
                for (let cy = minCellY; cy <= maxCellY; cy++) {
                    const key = toCellKey(cx, cy);
                    const list = cellMap.get(key);
                    if (list) {
                        list.push(node.id);
                    } else {
                        cellMap.set(key, [node.id]);
                    }
                }
            }
        }

        const nextIndex: NodeSpatialIndexData = { cellMap, boundsById, overflowIds, geometryById };
        nodeSpatialIndexCacheRef.current = nextIndex;
        return nextIndex;
    }, [nodes]);

    const connectionSpatialIndex = useMemo(() => {
        const prevIndex = connectionSpatialIndexCacheRef.current;
        if (prevIndex) {
            let geometryUnchanged = true;
            let refsUnchanged = true;
            let validConnectionCount = 0;

            for (const conn of connections) {
                const source = nodeById.get(conn.sourceId);
                const target = nodeById.get(conn.targetId);
                if (!source || !target) {
                    geometryUnchanged = false;
                    break;
                }

                validConnectionCount += 1;
                if (!matchesConnectionBounds(prevIndex.geometryById.get(conn.id), source, target)) {
                    geometryUnchanged = false;
                    break;
                }

                if (refsUnchanged && prevIndex.boundsById.get(conn.id)?.conn !== conn) {
                    refsUnchanged = false;
                }
            }

            if (geometryUnchanged && prevIndex.geometryById.size === validConnectionCount) {
                if (refsUnchanged) {
                    return prevIndex;
                }

                const refreshedBoundsById = new Map<string, SpatialBounds & { conn: Connection }>();
                for (const conn of connections) {
                    const prevBounds = prevIndex.boundsById.get(conn.id);
                    if (!prevBounds) continue;
                    refreshedBoundsById.set(conn.id, {
                        left: prevBounds.left,
                        top: prevBounds.top,
                        right: prevBounds.right,
                        bottom: prevBounds.bottom,
                        conn,
                    });
                }

                const refreshedIndex: ConnectionSpatialIndexData = {
                    cellMap: prevIndex.cellMap,
                    boundsById: refreshedBoundsById,
                    overflowIds: prevIndex.overflowIds,
                    geometryById: prevIndex.geometryById,
                };
                connectionSpatialIndexCacheRef.current = refreshedIndex;
                return refreshedIndex;
            }
        }

        const cellMap = new Map<string, string[]>();
        const boundsById = new Map<string, { left: number; top: number; right: number; bottom: number; conn: Connection }>();
        const overflowIds: string[] = [];
        const geometryById = new Map<string, SpatialBounds>();

        for (const conn of connections) {
            const source = nodeById.get(conn.sourceId);
            const target = nodeById.get(conn.targetId);
            if (!source || !target) continue;

            const sx = source.x + source.width;
            const sy = source.y + source.height / 2;
            const tx = target.x;
            const ty = target.y + target.height / 2;

            const left = Math.min(sx, tx);
            const right = Math.max(sx, tx);
            const top = Math.min(sy, ty);
            const bottom = Math.max(sy, ty);
            boundsById.set(conn.id, { left, top, right, bottom, conn });
            geometryById.set(conn.id, { left, top, right, bottom });

            const minCellX = Math.floor(left / SPATIAL_HASH_CELL_SIZE);
            const maxCellX = Math.floor(right / SPATIAL_HASH_CELL_SIZE);
            const minCellY = Math.floor(top / SPATIAL_HASH_CELL_SIZE);
            const maxCellY = Math.floor(bottom / SPATIAL_HASH_CELL_SIZE);
            const cells = (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1);

            if (cells > MAX_INDEXED_CELLS_PER_CONNECTION) {
                overflowIds.push(conn.id);
                continue;
            }

            for (let cx = minCellX; cx <= maxCellX; cx++) {
                for (let cy = minCellY; cy <= maxCellY; cy++) {
                    const key = toCellKey(cx, cy);
                    const list = cellMap.get(key);
                    if (list) {
                        list.push(conn.id);
                    } else {
                        cellMap.set(key, [conn.id]);
                    }
                }
            }
        }

        const nextIndex: ConnectionSpatialIndexData = { cellMap, boundsById, overflowIds, geometryById };
        connectionSpatialIndexCacheRef.current = nextIndex;
        return nextIndex;
    }, [connections, nodeById]);

    const getNodesIntersectingBounds = useCallback((left: number, top: number, right: number, bottom: number) => {
        const minCellX = Math.floor(left / SPATIAL_HASH_CELL_SIZE);
        const maxCellX = Math.floor(right / SPATIAL_HASH_CELL_SIZE);
        const minCellY = Math.floor(top / SPATIAL_HASH_CELL_SIZE);
        const maxCellY = Math.floor(bottom / SPATIAL_HASH_CELL_SIZE);

        const seen = new Set<string>();
        const result: NodeData[] = [];

        const tryPush = (nodeId: string) => {
            if (seen.has(nodeId)) return;
            seen.add(nodeId);
            const bounds = nodeSpatialIndex.boundsById.get(nodeId);
            if (!bounds) return;
            if (bounds.right < left ||
                bounds.left > right ||
                bounds.bottom < top ||
                bounds.top > bottom) {
                return;
            }
            result.push(bounds.node);
        };

        for (let cx = minCellX; cx <= maxCellX; cx++) {
            for (let cy = minCellY; cy <= maxCellY; cy++) {
                const ids = nodeSpatialIndex.cellMap.get(toCellKey(cx, cy));
                if (!ids) continue;
                for (const id of ids) tryPush(id);
            }
        }

        for (const id of nodeSpatialIndex.overflowIds) tryPush(id);

        result.sort((a, b) => (nodeOrderById.get(a.id) || 0) - (nodeOrderById.get(b.id) || 0));
        return result;
    }, [nodeSpatialIndex, nodeOrderById]);

    // Calculate visible nodes with spatial hash query
    const visibleNodes = useMemo(() => {
        if (viewportSize.width === 0 || viewportSize.height === 0) return nodes;

        const cullBufferWorld = Math.max(
            MIN_PRELOAD_NODE_BUFFER_WORLD,
            VIEWPORT_CULL_BUFFER_PX / Math.max(transform.k, 0.001)
        );
        const viewportLeft = -transform.x / transform.k - cullBufferWorld;
        const viewportTop = -transform.y / transform.k - cullBufferWorld;
        const viewportRight = (viewportSize.width - transform.x) / transform.k + cullBufferWorld;
        const viewportBottom = (viewportSize.height - transform.y) / transform.k + cullBufferWorld;

        const minCellX = Math.floor(viewportLeft / SPATIAL_HASH_CELL_SIZE);
        const maxCellX = Math.floor(viewportRight / SPATIAL_HASH_CELL_SIZE);
        const minCellY = Math.floor(viewportTop / SPATIAL_HASH_CELL_SIZE);
        const maxCellY = Math.floor(viewportBottom / SPATIAL_HASH_CELL_SIZE);

        const seen = new Set<string>();
        const result: NodeData[] = [];

        const tryPush = (nodeId: string) => {
            if (seen.has(nodeId)) return;
            seen.add(nodeId);
            const bounds = nodeSpatialIndex.boundsById.get(nodeId);
            if (!bounds) return;
            if (bounds.right < viewportLeft ||
                bounds.left > viewportRight ||
                bounds.bottom < viewportTop ||
                bounds.top > viewportBottom) {
                return;
            }
            result.push(bounds.node);
        };

        for (let cx = minCellX; cx <= maxCellX; cx++) {
            for (let cy = minCellY; cy <= maxCellY; cy++) {
                const ids = nodeSpatialIndex.cellMap.get(toCellKey(cx, cy));
                if (!ids) continue;
                for (const id of ids) tryPush(id);
            }
        }

        for (const id of nodeSpatialIndex.overflowIds) tryPush(id);

        result.sort((a, b) => (nodeOrderById.get(a.id) || 0) - (nodeOrderById.get(b.id) || 0));
        return result;
    }, [nodeSpatialIndex, nodeOrderById, transform, viewportSize]);

    const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes]);

    // Calculate visible connections
    const visibleConnections = useMemo(() => {
        if (viewportSize.width === 0 || viewportSize.height === 0) return connections;

        const cullBufferWorld = Math.max(
            MIN_PRELOAD_NODE_BUFFER_WORLD,
            VIEWPORT_CULL_BUFFER_PX / Math.max(transform.k, 0.001)
        );
        const viewportLeft = -transform.x / transform.k - cullBufferWorld;
        const viewportTop = -transform.y / transform.k - cullBufferWorld;
        const viewportRight = (viewportSize.width - transform.x) / transform.k + cullBufferWorld;
        const viewportBottom = (viewportSize.height - transform.y) / transform.k + cullBufferWorld;

        const minCellX = Math.floor(viewportLeft / SPATIAL_HASH_CELL_SIZE);
        const maxCellX = Math.floor(viewportRight / SPATIAL_HASH_CELL_SIZE);
        const minCellY = Math.floor(viewportTop / SPATIAL_HASH_CELL_SIZE);
        const maxCellY = Math.floor(viewportBottom / SPATIAL_HASH_CELL_SIZE);

        const seen = new Set<string>();
        const result: Connection[] = [];

        const tryPush = (connectionId: string) => {
            if (seen.has(connectionId)) return;
            seen.add(connectionId);
            const bounds = connectionSpatialIndex.boundsById.get(connectionId);
            if (!bounds) return;
            if (bounds.right < viewportLeft ||
                bounds.left > viewportRight ||
                bounds.bottom < viewportTop ||
                bounds.top > viewportBottom) {
                return;
            }
            result.push(bounds.conn);
        };

        for (let cx = minCellX; cx <= maxCellX; cx++) {
            for (let cy = minCellY; cy <= maxCellY; cy++) {
                const ids = connectionSpatialIndex.cellMap.get(toCellKey(cx, cy));
                if (!ids) continue;
                for (const id of ids) tryPush(id);
            }
        }

        for (const id of connectionSpatialIndex.overflowIds) tryPush(id);

        result.sort((a, b) => (connectionOrderById.get(a.id) || 0) - (connectionOrderById.get(b.id) || 0));
        return result;
    }, [connectionSpatialIndex, connectionOrderById, transform, viewportSize]);

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
        nodeById,
        getNodesIntersectingBounds,
        
        // UI state
        previewMedia, setPreviewMedia,
        contextMenu, setContextMenu,
        quickAddMenu, setQuickAddMenu,
        showNewWorkflowDialog, setShowNewWorkflowDialog,
        isSettingsOpen, setIsSettingsOpen,
        showMinimap, setShowMinimap,
        showColorPicker, setShowColorPicker,
        nextGroupColor, setNextGroupColor,
        desktopPlatform, setDesktopPlatform,
        
        // Temp connection
        tempConnection, setTempConnection,
        suggestedNodes, setSuggestedNodes,
        
        // Computed
        isDark,
        
        // Utils
        screenToWorld,
        updateNodeData,
        markInteractionActivity,
    };
};
