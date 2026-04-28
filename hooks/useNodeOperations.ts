import { useCallback, useRef } from 'react';
import { NodeData, Connection, NodeType } from '../types';
import { generateCreativeDescription, generateImage, generateVideo } from '../services/geminiService';
import { reportLocalDevFailure, normalizeErrorForLocalLog } from '../services/localDevLogger';

const DEFAULT_NODE_WIDTH = 320;
const DEFAULT_NODE_HEIGHT = 240;
const MAX_DISPLAY_IMAGE_SIDE = 720;

const generateId = () => Math.random().toString(36).substr(2, 9);

const formatErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
        return error;
    }

    if (error && typeof error === 'object') {
        const e = error as any;
        const type = e.type || e.error?.type || e.name;
        const code = e.code || e.error?.code || e.status;
        const message = e.message || e.error?.message || e.fail_reason || e.detail || e.msg;

        const parts: string[] = [];
        if (type) parts.push(`[${type}]`);
        if (code) parts.push(`(${code})`);
        if (message) parts.push(String(message));

        if (parts.length > 0) {
            return parts.join(' ');
        }

        try {
            return JSON.stringify(error);
        } catch (_err) {
            // no-op
        }
    }

    return 'Unknown error';
};

const mergeArtifacts = (newResults: string[], existingArtifacts: string[], currentPrimary?: string): string[] => {
    const merged: string[] = [];
    const seen = new Set<string>();
    const append = (value?: string) => {
        if (!value || seen.has(value)) return;
        seen.add(value);
        merged.push(value);
    };

    newResults.forEach(append);
    append(currentPrimary);
    existingArtifacts.forEach(append);

    return merged;
};

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

export const createDisplayImageSrc = async (source: string, maxSide: number = MAX_DISPLAY_IMAGE_SIDE): Promise<string> => {
    if (!source) return source;

    return new Promise((resolve) => {
        const img = new Image();

        if (/^https?:\/\//i.test(source)) {
            img.crossOrigin = 'anonymous';
        }

        img.onload = () => {
            const naturalWidth = img.naturalWidth || img.width || 0;
            const naturalHeight = img.naturalHeight || img.height || 0;

            if (naturalWidth <= 0 || naturalHeight <= 0) {
                resolve(source);
                return;
            }

            const longestSide = Math.max(naturalWidth, naturalHeight);
            if (longestSide <= maxSide) {
                resolve(source);
                return;
            }

            const scale = maxSide / longestSide;
            const width = Math.max(1, Math.round(naturalWidth * scale));
            const height = Math.max(1, Math.round(naturalHeight * scale));

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(source);
                return;
            }

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);

            try {
                let preview = canvas.toDataURL('image/webp', 0.82);
                if (!preview || preview === 'data:,') {
                    preview = canvas.toDataURL('image/jpeg', 0.85);
                }
                if (!preview || preview === 'data:,') {
                    preview = canvas.toDataURL('image/png');
                }
                resolve(preview && preview !== 'data:,' ? preview : source);
            } catch (_err) {
                resolve(source);
            }
        };

        img.onerror = () => resolve(source);
        img.src = source;
    });
};

interface UseNodeOperationsProps {
    nodes: NodeData[];
    setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    connections: Connection[];
    setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
    deletedNodes: NodeData[];
    setDeletedNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    selectedNodeIds: Set<string>;
    setSelectedNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    updateNodeData: (id: string, updates: Partial<NodeData>) => void;
    screenToWorld: (x: number, y: number) => { x: number, y: number };
    getInputImages: (nodeId: string) => { src: string, isVideo: boolean }[];
    containerRef: React.RefObject<HTMLDivElement>;
}

export const useNodeOperations = ({
    nodes,
    setNodes,
    connections,
    setConnections,
    deletedNodes,
    setDeletedNodes,
    selectedNodeIds,
    setSelectedNodeIds,
    updateNodeData,
    screenToWorld,
    getInputImages,
    containerRef,
}: UseNodeOperationsProps) => {
    const generatingNodeIdsRef = useRef<Set<string>>(new Set());

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
        
        const fallbackDisplayImage = dataOverride?.imageSrc || dataOverride?.originalImageSrc;
        const fallbackOriginalImage = dataOverride?.originalImageSrc || dataOverride?.imageSrc;

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
            imageSrc: fallbackDisplayImage,
            originalImageSrc: fallbackOriginalImage,
            videoSrc: dataOverride?.videoSrc,
            outputArtifacts: dataOverride?.outputArtifacts || (fallbackDisplayImage || dataOverride?.videoSrc ? [fallbackDisplayImage || dataOverride.videoSrc!] : []),
            outputOriginalArtifacts: dataOverride?.outputOriginalArtifacts || (fallbackOriginalImage ? [fallbackOriginalImage] : undefined),
        };
        
        setNodes(prev => [...prev, newNode]);
        setSelectedNodeIds(new Set([newNode.id]));
        return newNode;
    }, [containerRef, screenToWorld, setNodes, setSelectedNodeIds]);

    const deleteNode = useCallback((id: string) => {
        const node = nodes.find(n => n.id === id);
        if (node && (node.imageSrc || node.originalImageSrc || node.videoSrc)) {
            setDeletedNodes(prev => [...prev, node]);
        }
        setNodes(prev => prev.filter(n => n.id !== id));
        setConnections(prev => prev.filter(c => c.sourceId !== id && c.targetId !== id));
    }, [nodes, setNodes, setConnections, setDeletedNodes]);

    const handleGenerate = useCallback(async (nodeId: string) => {
        if (generatingNodeIdsRef.current.has(nodeId)) return;

        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        generatingNodeIdsRef.current.add(nodeId);
        updateNodeData(nodeId, { isLoading: true });
        
        const inputs = getInputImages(node.id);
        const inputSrcs = inputs.map(i => i.src);

        try {
            if (node.type === NodeType.CREATIVE_DESC) {
                const res = await generateCreativeDescription(node.prompt || '', node.model === 'TEXT_TO_VIDEO' ? 'VIDEO' : 'IMAGE');
                updateNodeData(nodeId, { optimizedPrompt: res, isLoading: false });
            } else {
                let results: string[] = [];
                if (node.type === NodeType.TEXT_TO_IMAGE) {
                    results = await generateImage(
                        node.prompt || '', node.aspectRatio, node.model, node.resolution, node.count || 1, inputSrcs 
                    );
                } else if (node.type === NodeType.TEXT_TO_VIDEO) {
                    results = await generateVideo(
                        node.prompt || '',
                        inputSrcs,
                        node.aspectRatio,
                        node.model,
                        node.resolution,
                        node.duration,
                        node.count || 1,
                        false,
                        node.activeToolbarItem === 'start_end'
                    );
                }

                if (results.length > 0) {
                    if (node.type === NodeType.TEXT_TO_IMAGE) {
                        const originalResults = results;
                        const displayResults = await Promise.all(
                            originalResults.map((src) => createDisplayImageSrc(src))
                        );
                        const normalizedDisplayResults = displayResults.map((src, idx) => src || originalResults[idx]);
                        const nextDisplayPrimary = normalizedDisplayResults[0];
                        const nextOriginalPrimary = originalResults[0];

                        setNodes(prev => prev.map(existingNode => {
                            if (existingNode.id !== nodeId) return existingNode;

                            const currentDisplayPrimary = existingNode.imageSrc;
                            const currentOriginalPrimary = existingNode.originalImageSrc || existingNode.imageSrc;
                            const existingOriginalArtifacts = existingNode.outputOriginalArtifacts || existingNode.outputArtifacts || [];

                            const updates: Partial<NodeData> = {
                                isLoading: false,
                                imageSrc: nextDisplayPrimary,
                                originalImageSrc: nextOriginalPrimary,
                                outputArtifacts: mergeArtifacts(normalizedDisplayResults, existingNode.outputArtifacts || [], currentDisplayPrimary),
                                outputOriginalArtifacts: mergeArtifacts(originalResults, existingOriginalArtifacts, currentOriginalPrimary),
                            };

                            return { ...existingNode, ...updates };
                        }));
                    } else {
                        const nextPrimary = results[0];
                        setNodes(prev => prev.map(existingNode => {
                            if (existingNode.id !== nodeId) return existingNode;

                            const currentPrimary = existingNode.videoSrc;
                            const updates: Partial<NodeData> = {
                                isLoading: false,
                                outputArtifacts: mergeArtifacts(results, existingNode.outputArtifacts || [], currentPrimary),
                            };

                            updates.videoSrc = nextPrimary;
                            return { ...existingNode, ...updates };
                        }));
                    }
                } else {
                    throw new Error("No results returned");
                }
            }
        } catch (e) {
            console.error(e);
            const errorMessage = formatErrorMessage(e);
            reportLocalDevFailure({
                event: 'generation_failed',
                nodeId,
                nodeType: node.type,
                model: node.model,
                aspectRatio: node.aspectRatio,
                resolution: node.resolution,
                duration: node.duration,
                activeToolbarItem: node.activeToolbarItem,
                inputCount: inputSrcs.length,
                inputKinds: inputs.map(input => (input.isVideo ? 'video' : 'image')),
                errorMessage,
                error: normalizeErrorForLocalLog(e),
            });
            alert(`Generation Failed: ${errorMessage}`);
            updateNodeData(nodeId, { isLoading: false });
        } finally {
            generatingNodeIdsRef.current.delete(nodeId);
        }
    }, [nodes, updateNodeData, getInputImages, setNodes]);

    const handleMaximize = useCallback((nodeId: string, setPreviewMedia: (media: { url: string, type: 'image' | 'video' } | null) => void) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        if (node.videoSrc) setPreviewMedia({ url: node.videoSrc, type: 'video' });
        else if (node.originalImageSrc || node.imageSrc) setPreviewMedia({ url: node.originalImageSrc || node.imageSrc || '', type: 'image' });
        else alert("No content to preview.");
    }, [nodes]);

    const handleDownload = useCallback(async (nodeId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        const url = node.videoSrc || node.originalImageSrc || node.imageSrc;
        if (!url) { alert("No content to download."); return; }
        
        const ext = node.videoSrc ? 'mp4' : 'png';
        const filename = `${node.title.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;

        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob as Blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        } catch (e) {
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.target = "_blank"; 
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }, [nodes]);

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
                    id: startNodeId, type: NodeType.ORIGINAL_IMAGE, x: videoNode.x - xOffset, y: videoNode.y, width: nodeWidth, height: nodeHeight, 
                    title: 'Start Frame', imageSrc: '', aspectRatio: '16:9', outputArtifacts: []
                };
                const endNode: NodeData = {
                    id: endNodeId, type: NodeType.ORIGINAL_IMAGE, x: videoNode.x - xOffset, y: videoNode.y + yOffset, width: nodeWidth, height: nodeHeight,
                    title: 'End Frame', imageSrc: '', aspectRatio: '16:9', outputArtifacts: []
                };
                setNodes(prev => [...prev, startNode, endNode]);
                setConnections(prev => [...prev, { id: generateId(), sourceId: startNodeId, targetId: nodeId }, { id: generateId(), sourceId: endNodeId, targetId: nodeId }]);
            }
        }
    }, [nodes, connections, updateNodeData, setNodes, setConnections]);

    return {
        addNode,
        deleteNode,
        handleGenerate,
        handleMaximize,
        handleDownload,
        handleAlign,
        handleToolbarAction,
        generateId,
    };
};
