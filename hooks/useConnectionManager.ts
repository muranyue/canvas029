import { useState, useRef, useCallback } from 'react';
import { NodeData, Connection, NodeType, Point, DragMode } from '../types';

export interface ConnectionManagerProps {
    nodes: NodeData[];
    connections: Connection[];
    setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
    selectedConnectionId: string | null;
    setSelectedConnectionId: React.Dispatch<React.SetStateAction<string | null>>;
    setDragMode: React.Dispatch<React.SetStateAction<DragMode | 'RESIZE_NODE' | 'SELECT'>>;
    screenToWorld: (x: number, y: number) => Point;
    generateId: () => string;
}

export interface ConnectionManagerReturn {
    // Temp Connection State
    tempConnection: Point | null;
    setTempConnection: React.Dispatch<React.SetStateAction<Point | null>>;
    
    // Suggested Nodes
    suggestedNodes: NodeData[];
    setSuggestedNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    
    // Connection Start Ref
    connectionStartRef: React.MutableRefObject<{ nodeId: string; type: 'source' | 'target' } | null>;
    
    // Connection Operations
    createConnection: (sourceId: string, targetId: string) => void;
    removeConnection: (id: string) => void;
    
    // Event Handlers
    handleConnectStart: (e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => void;
    handleConnectTouchStart: (e: React.TouchEvent, nodeId: string, type: 'source' | 'target') => void;
    handlePortMouseUp: (e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => void;
    
    // Update Suggested Nodes
    updateSuggestedNodes: (worldPos: Point) => void;
}

export function useConnectionManager({
    nodes,
    connections,
    setConnections,
    selectedConnectionId,
    setSelectedConnectionId,
    setDragMode,
    screenToWorld,
    generateId,
}: ConnectionManagerProps): ConnectionManagerReturn {
    
    const [tempConnection, setTempConnection] = useState<Point | null>(null);
    const [suggestedNodes, setSuggestedNodes] = useState<NodeData[]>([]);
    const connectionStartRef = useRef<{ nodeId: string; type: 'source' | 'target' } | null>(null);

    const createConnection = useCallback((sourceId: string, targetId: string) => {
        if (!connections.some(c => c.sourceId === sourceId && c.targetId === targetId)) {
            setConnections(prev => [...prev, { id: generateId(), sourceId, targetId }]);
        }
        setDragMode('NONE');
        setTempConnection(null);
        connectionStartRef.current = null;
        setSuggestedNodes([]);
    }, [connections, setConnections, generateId, setDragMode]);

    const removeConnection = useCallback((id: string) => {
        setConnections(prev => prev.filter(c => c.id !== id));
        setSelectedConnectionId(null);
    }, [setConnections, setSelectedConnectionId]);

    const handleConnectStart = useCallback((e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => {
        e.stopPropagation();
        e.preventDefault();
        connectionStartRef.current = { nodeId, type };
        setDragMode('CONNECT');
        setTempConnection(screenToWorld(e.clientX, e.clientY));
    }, [setDragMode, screenToWorld]);

    const handleConnectTouchStart = useCallback((e: React.TouchEvent, nodeId: string, type: 'source' | 'target') => {
        e.stopPropagation();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            connectionStartRef.current = { nodeId, type };
            setDragMode('CONNECT');
            setTempConnection(screenToWorld(touch.clientX, touch.clientY));
        }
    }, [setDragMode, screenToWorld]);

    const handlePortMouseUp = useCallback((e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => {
        e.stopPropagation();
        e.preventDefault();
        if (connectionStartRef.current && 
            connectionStartRef.current.type === 'source' && 
            type === 'target' && 
            connectionStartRef.current.nodeId !== nodeId) {
            createConnection(connectionStartRef.current.nodeId, nodeId);
        }
    }, [createConnection]);

    const updateSuggestedNodes = useCallback((worldPos: Point) => {
        if (connectionStartRef.current?.type === 'source') {
            const candidates = nodes
                .filter(n => n.id !== connectionStartRef.current?.nodeId)
                .filter(n => n.type !== NodeType.ORIGINAL_IMAGE && n.type !== NodeType.GROUP)
                .map(n => ({
                    node: n,
                    dist: Math.sqrt(
                        Math.pow(worldPos.x - (n.x + n.width / 2), 2) +
                        Math.pow(worldPos.y - (n.y + n.height / 2), 2)
                    )
                }))
                .filter(item => item.dist < 500)
                .sort((a, b) => a.dist - b.dist)
                .slice(0, 3)
                .map(item => item.node);
            setSuggestedNodes(candidates);
        }
    }, [nodes]);

    return {
        tempConnection,
        setTempConnection,
        suggestedNodes,
        setSuggestedNodes,
        connectionStartRef,
        createConnection,
        removeConnection,
        handleConnectStart,
        handleConnectTouchStart,
        handlePortMouseUp,
        updateSuggestedNodes,
    };
}
