import { useCallback, useMemo } from 'react';
import { NodeData, Connection } from '../types';

const EMPTY_ARRAY: { src: string, isVideo: boolean }[] = [];

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

    // Memoize inputs map to prevent array recreation on every render
    const inputsMap = useMemo(() => {
        const map: Record<string, { src: string, isVideo: boolean }[]> = {};
        nodes.forEach(node => {
            map[node.id] = connections
                .filter(c => c.targetId === node.id)
                .map(c => nodes.find(n => n.id === c.sourceId))
                .filter(n => n && (n.imageSrc || n.videoSrc))
                .map(n => ({
                    src: n!.videoSrc || n!.imageSrc || '',
                    isVideo: !!n!.videoSrc
                }));
        });
        return map;
    }, [nodes, connections]);

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
