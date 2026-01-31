import { useCallback, useMemo } from 'react';
import { NodeData, Connection, NodeType, Point } from '../types';

const DEFAULT_NODE_WIDTH = 320;
const DEFAULT_NODE_HEIGHT = 240;
const EMPTY_ARRAY: { src: string; isVideo: boolean }[] = [];

// Helper for resizing imported media constraints
export const calculateImportDimensions = (naturalWidth: number, naturalHeight: number) => {
    const ratio = naturalWidth / naturalHeight;
    const maxSide = 750;
    let width = naturalWidth;
    let height = naturalHeight;

    if (width > height) {
        if (width > maxSide) {
            width = maxSide;
            height = width / ratio;
        }
    } else {
        if (height > maxSide) {
            height = maxSide;
            width = height * ratio;
        }
    }
    return { width, height, ratio };
};

export interface NodeOperationsProps {
    nodes: NodeData[];
    setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    connections: Connection[];
    setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
    selectedNodeIds: Set<string>;
    setSelectedNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    deletedNodes: NodeData[];
    setDeletedNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    transform: { x: number; y: number; k: number };
    containerRef: React.RefObject<HTMLDivElement>;
    screenToWorld: (x: number, y: number) => Point;
    generateId: () => string;
    updateNodeData: (id: string, updates: Partial<NodeData>) => void;
}

export interface NodeOperationsReturn {
    // Input Images Map
    inputsMap: Record<string, { src: string; isVideo: boolean }[]>;
    getInputImages: (nodeId: string) => { src: string; isVideo: boolean }[];
    
    // Node CRUD
    addNode: (type: NodeType, x?: number, y?: number, dataOverride?: Partial<NodeData>) => void;
    deleteNode: (id: string) => void;
    
    // Alignment
    handleAlign: (direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => void;
    
    // Toolbar Actions
    handleToolbarAction: (nodeId: string, actionId: string) => void;
}

export function useNodeOperations({
    nodes,
    setNodes,
    connections,
    setConnections,
    selectedNodeIds,
    setSelectedNodeIds,
    deletedNodes,
    setDeletedNodes,
    transform,
    containerRef,
    screenToWorld,
    generateId,
    updateNodeData,
}: NodeOperationsProps): NodeOperationsReturn {
    
    // Memoize inputs map to prevent array recreation on every render
    const inputsMap = useMemo(() => {
        const map: Record<string, { src: string; isVideo: boolean }[]> = {};
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

    const addNode = useCallback((type: NodeType, x?: number, y?: number, dataOverride?: Partial<NodeData>) => {
        if (x === undefined || y === undefined) {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const center = screenToWorld(rect.width / 2, rect.height / 2);
                x = center.x - DEFAULT_NODE_WIDTH / 2;
                y = center.y - DEFAULT_NODE_HEIGHT / 2;
            } else {
                x = 0; y = 0;
            }
        }

        let w = dataOverride?.width || DEFAULT_NODE_WIDTH;
        let h = dataOverride?.height || DEFAULT_NODE_HEIGHT;

        if (type === NodeType.ORIGINAL_IMAGE) {
            h = dataOverride?.height || 240;
        } else if (type === NodeType.TEXT_TO_VIDEO) {
            if (!dataOverride?.width) w = 400 * (16/9);
            if (!dataOverride?.height) h = 400;
        } else if (type === NodeType.TEXT_TO_IMAGE) {
            if (!dataOverride?.width) w = 400;
            if (!dataOverride?.height) h = 400;
        }

        const newNode: NodeData = {
            id: generateId(),
            type,
            x,
            y,
            width: w,
            height: h,
            title: dataOverride?.title || (type === NodeType.TEXT_TO_IMAGE ? 'Text to Image' :
                   type === NodeType.TEXT_TO_VIDEO ? 'Text to Video' :
                   type === NodeType.CREATIVE_DESC ? 'Creative Description' : `Original Image_${Date.now()}`),
            aspectRatio: dataOverride?.aspectRatio || (type === NodeType.TEXT_TO_VIDEO ? '16:9' : '1:1'),
            model: dataOverride?.model || (type === NodeType.TEXT_TO_IMAGE ? 'BananaPro' :
                   type === NodeType.TEXT_TO_VIDEO ? 'Sora2' : 'IMAGE'),
            resolution: dataOverride?.resolution || (type === NodeType.TEXT_TO_VIDEO ? '720p' : '1k'),
            duration: dataOverride?.duration || (type === NodeType.TEXT_TO_VIDEO ? '5s' : undefined),
            count: 1,
            prompt: dataOverride?.prompt || '',
            imageSrc: dataOverride?.imageSrc,
            videoSrc: dataOverride?.videoSrc,
            outputArtifacts: dataOverride?.outputArtifacts || (dataOverride?.imageSrc || dataOverride?.videoSrc ? [dataOverride.imageSrc || dataOverride.videoSrc!] : [])
        };

        setNodes(prev => [...prev, newNode]);
        setSelectedNodeIds(new Set([newNode.id]));
    }, [containerRef, screenToWorld, generateId, setNodes, setSelectedNodeIds]);

    const deleteNode = useCallback((id: string) => {
        const node = nodes.find(n => n.id === id);
        if (node && (node.imageSrc || node.videoSrc)) {
            setDeletedNodes(prev => [...prev, node]);
        }
        setNodes(prev => prev.filter(n => n.id !== id));
        setConnections(prev => prev.filter(c => c.sourceId !== id && c.targetId !== id));
    }, [nodes, setNodes, setConnections, setDeletedNodes]);

    const handleAlign = useCallback((direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {
        if (selectedNodeIds.size < 2) return;

        setNodes(prevNodes => {
            const selected = prevNodes.filter(n => selectedNodeIds.has(n.id));
            const unselected = prevNodes.filter(n => !selectedNodeIds.has(n.id));
            const updatedNodes = selected.map(n => ({ ...n }));

            const isVerticalAlign = direction === 'UP' || direction === 'DOWN';
            const OVERLAP_THRESHOLD = 10;
            
            const isOverlap = (a: NodeData, b: NodeData) => {
                if (isVerticalAlign) {
                    const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
                    return overlap > OVERLAP_THRESHOLD;
                } else {
                    const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
                    return overlap > OVERLAP_THRESHOLD;
                }
            };

            const clusters: NodeData[][] = [];
            const visited = new Set<string>();

            for (const node of updatedNodes) {
                if (visited.has(node.id)) continue;
                const cluster = [node];
                visited.add(node.id);
                const queue = [node];

                while (queue.length > 0) {
                    const current = queue.shift()!;
                    for (const other of updatedNodes) {
                        if (!visited.has(other.id) && isOverlap(current, other)) {
                            visited.add(other.id);
                            cluster.push(other);
                            queue.push(other);
                        }
                    }
                }
                clusters.push(cluster);
            }

            const minTop = Math.min(...updatedNodes.map(n => n.y));
            const maxBottom = Math.max(...updatedNodes.map(n => n.y + n.height));
            const minLeft = Math.min(...updatedNodes.map(n => n.x));
            const maxRight = Math.max(...updatedNodes.map(n => n.x + n.width));

            const HORIZONTAL_GAP = 20;
            const VERTICAL_GAP = 60;

            clusters.forEach(cluster => {
                if (direction === 'UP') {
                    cluster.sort((a, b) => (a.y - b.y) || a.id.localeCompare(b.id));
                    let currentY = minTop;
                    cluster.forEach((node) => {
                        node.y = currentY;
                        currentY += node.height + VERTICAL_GAP;
                    });
                } else if (direction === 'DOWN') {
                    cluster.sort((a, b) => (b.y - a.y) || a.id.localeCompare(b.id));
                    let currentBottom = maxBottom;
                    cluster.forEach((node) => {
                        node.y = currentBottom - node.height;
                        currentBottom -= (node.height + VERTICAL_GAP);
                    });
                } else if (direction === 'LEFT') {
                    cluster.sort((a, b) => (a.x - b.x) || a.id.localeCompare(b.id));
                    let currentX = minLeft;
                    cluster.forEach((node) => {
                        node.x = currentX;
                        currentX += node.width + HORIZONTAL_GAP;
                    });
                } else if (direction === 'RIGHT') {
                    cluster.sort((a, b) => (b.x - a.x) || a.id.localeCompare(b.id));
                    let currentRight = maxRight;
                    cluster.forEach((node) => {
                        node.x = currentRight - node.width;
                        currentRight -= (node.width + HORIZONTAL_GAP);
                    });
                }
            });

            return [...unselected, ...updatedNodes];
        });
    }, [selectedNodeIds, setNodes]);

    const handleToolbarAction = useCallback((nodeId: string, actionId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        const newActiveItem = node.activeToolbarItem === actionId ? undefined : actionId;
        updateNodeData(nodeId, { activeToolbarItem: newActiveItem });

        if (newActiveItem === 'start_end') {
            const videoNode = node;
            const inputCount = connections.filter(c => c.targetId === nodeId).length;
            if (inputCount === 0) {
                const startNodeId = generateId();
                const endNodeId = generateId();
                const xOffset = 380;
                const yOffset = 260;
                const nodeWidth = 320;
                const nodeHeight = 240;
                
                const startNode: NodeData = {
                    id: startNodeId,
                    type: NodeType.ORIGINAL_IMAGE,
                    x: videoNode.x - xOffset,
                    y: videoNode.y,
                    width: nodeWidth,
                    height: nodeHeight,
                    title: 'Start Frame',
                    imageSrc: '',
                    aspectRatio: '16:9',
                    outputArtifacts: []
                };
                const endNode: NodeData = {
                    id: endNodeId,
                    type: NodeType.ORIGINAL_IMAGE,
                    x: videoNode.x - xOffset,
                    y: videoNode.y + yOffset,
                    width: nodeWidth,
                    height: nodeHeight,
                    title: 'End Frame',
                    imageSrc: '',
                    aspectRatio: '16:9',
                    outputArtifacts: []
                };
                
                setNodes(prev => [...prev, startNode, endNode]);
                setConnections(prev => [
                    ...prev,
                    { id: generateId(), sourceId: startNodeId, targetId: nodeId },
                    { id: generateId(), sourceId: endNodeId, targetId: nodeId }
                ]);
            }
        }
    }, [nodes, connections, generateId, updateNodeData, setNodes, setConnections]);

    return {
        inputsMap,
        getInputImages,
        addNode,
        deleteNode,
        handleAlign,
        handleToolbarAction,
    };
}
