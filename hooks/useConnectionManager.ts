import { useCallback, useMemo, useRef } from 'react';
import { NodeData, Connection } from '../types';

const EMPTY_ARRAY: { src: string, isVideo: boolean }[] = [];
type InputEntry = { src: string; isVideo: boolean };

const generateId = () => Math.random().toString(36).substr(2, 9);

interface UseConnectionManagerProps {
    nodes: NodeData[];
    connections: Connection[];
    setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
    setDragMode: React.Dispatch<React.SetStateAction<any>>;
    setTempConnection: React.Dispatch<React.SetStateAction<any>>;
    setSuggestedNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    setSelectedConnectionId: React.Dispatch<React.SetStateAction<string | null>>;
}

export const useConnectionManager = ({
    nodes,
    connections,
    setConnections,
    setDragMode,
    setTempConnection,
    setSuggestedNodes,
    setSelectedConnectionId,
}: UseConnectionManagerProps) => {
    const sourceMediaById = useMemo(() => {
        const map = new Map<string, InputEntry>();
        for (const node of nodes) {
            const src = node.videoSrc || node.originalImageSrc || node.imageSrc;
            if (!src) continue;
            map.set(node.id, { src, isVideo: !!node.videoSrc });
        }
        return map;
    }, [nodes]);

    const previousInputsMapRef = useRef<Record<string, InputEntry[]>>({});

    const isSameInputList = (a: InputEntry[] | undefined, b: InputEntry[]): boolean => {
        if (!a || a.length !== b.length) return false;
        for (let i = 0; i < b.length; i++) {
            if (a[i].src !== b[i].src || a[i].isVideo !== b[i].isVideo) {
                return false;
            }
        }
        return true;
    };

    // Build once per source-media/connections change while preserving stable array references
    // for unchanged target nodes.
    const inputsMap = useMemo(() => {
        const nextMap: Record<string, InputEntry[]> = {};
        const prevMap = previousInputsMapRef.current;

        for (const conn of connections) {
            const source = sourceMediaById.get(conn.sourceId);
            if (!source) continue;
            const targetList = nextMap[conn.targetId] || (nextMap[conn.targetId] = []);
            targetList.push({
                src: source.src,
                isVideo: source.isVideo,
            });
        }

        const stableMap: Record<string, InputEntry[]> = {};
        for (const targetId of Object.keys(nextMap)) {
            const nextList = nextMap[targetId];
            const prevList = prevMap[targetId];
            stableMap[targetId] = isSameInputList(prevList, nextList) ? prevList : nextList;
        }

        previousInputsMapRef.current = stableMap;
        return stableMap;
    }, [connections, sourceMediaById]);

    const getInputImages = useCallback((nodeId: string) => {
        return inputsMap[nodeId] || EMPTY_ARRAY;
    }, [inputsMap]);

    const createConnection = useCallback((sourceId: string, targetId: string) => {
        if (!connections.some(c => c.sourceId === sourceId && c.targetId === targetId)) {
            setConnections(prev => [...prev, { id: generateId(), sourceId, targetId }]);
        }
        setDragMode('NONE');
        setTempConnection(null);
        setSuggestedNodes([]);
    }, [connections, setConnections, setDragMode, setTempConnection, setSuggestedNodes]);

    const removeConnection = useCallback((id: string) => {
        setConnections(prev => prev.filter(c => c.id !== id));
        setSelectedConnectionId(null);
    }, [setConnections, setSelectedConnectionId]);

    return {
        inputsMap,
        getInputImages,
        createConnection,
        removeConnection,
    };
};
