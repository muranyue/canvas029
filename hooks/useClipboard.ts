import React, { useState, useCallback, useEffect } from 'react';
import { NodeData, Connection, NodeType, Point } from '../types';
import { calculateImportDimensions } from './useNodeOperations';

export interface ClipboardProps {
    nodes: NodeData[];
    setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    connections: Connection[];
    setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
    selectedNodeIds: Set<string>;
    setSelectedNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    transform: { x: number; y: number; k: number };
    lastMousePosRef: React.MutableRefObject<Point>;
    screenToWorld: (x: number, y: number) => Point;
    generateId: () => string;
    addNode: (type: NodeType, x?: number, y?: number, dataOverride?: Partial<NodeData>) => void;
}

export interface ClipboardReturn {
    internalClipboard: { nodes: NodeData[]; connections: Connection[] } | null;
    performCopy: () => void;
    performPaste: (targetPos: Point) => void;
}

export function useClipboard({
    nodes,
    setNodes,
    connections,
    setConnections,
    selectedNodeIds,
    setSelectedNodeIds,
    transform,
    lastMousePosRef,
    screenToWorld,
    generateId,
    addNode,
}: ClipboardProps): ClipboardReturn {
    
    const [internalClipboard, setInternalClipboard] = useState<{ nodes: NodeData[]; connections: Connection[] } | null>(null);

    const performCopy = useCallback(() => {
        if (selectedNodeIds.size === 0) return;

        const selectedNodes = nodes.filter(n => selectedNodeIds.has(n.id));
        const selectedConnections = connections.filter(c =>
            selectedNodeIds.has(c.sourceId) && selectedNodeIds.has(c.targetId)
        );

        setInternalClipboard({ nodes: selectedNodes, connections: selectedConnections });
    }, [nodes, connections, selectedNodeIds]);

    const performPaste = useCallback((targetPos: Point) => {
        if (!internalClipboard || internalClipboard.nodes.length === 0) return;

        const { nodes: clipboardNodes, connections: clipboardConnections } = internalClipboard;

        let minX = Infinity, minY = Infinity;
        clipboardNodes.forEach(n => {
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
        });

        const idMap = new Map<string, string>();
        const newNodes: NodeData[] = [];

        clipboardNodes.forEach(node => {
            const newId = generateId();
            idMap.set(node.id, newId);
            const offsetX = node.x - minX;
            const offsetY = node.y - minY;
            newNodes.push({
                ...node,
                id: newId,
                x: targetPos.x + offsetX,
                y: targetPos.y + offsetY,
                title: node.title.endsWith('(Copy)') ? node.title : `${node.title} (Copy)`,
                isLoading: false,
            });
        });

        const newConnections: Connection[] = clipboardConnections.map(c => ({
            id: generateId(),
            sourceId: idMap.get(c.sourceId)!,
            targetId: idMap.get(c.targetId)!
        }));

        setNodes(prev => [...prev, ...newNodes]);
        setConnections(prev => [...prev, ...newConnections]);
        setSelectedNodeIds(new Set(newNodes.map(n => n.id)));
    }, [internalClipboard, generateId, setNodes, setConnections, setSelectedNodeIds]);

    // Handle system paste events
    const handlePaste = useCallback(async (e: ClipboardEvent) => {
        const activeElement = document.activeElement;
        const isInputFocused = activeElement instanceof HTMLInputElement ||
            activeElement instanceof HTMLTextAreaElement ||
            (activeElement as HTMLElement)?.isContentEditable;
        if (isInputFocused) return;

        const items = e.clipboardData?.items;
        let hasSystemMedia = false;
        const mousePos = lastMousePosRef.current;
        const worldPos = screenToWorld(mousePos.x, mousePos.y);

        if (items) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i] as DataTransferItem;
                if (item.type.indexOf('image') !== -1) {
                    hasSystemMedia = true;
                    const file = item.getAsFile();
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const img = new Image();
                            img.onload = () => {
                                const { width, height, ratio } = calculateImportDimensions(img.width, img.height);
                                const src = event.target?.result as string;
                                addNode(NodeType.ORIGINAL_IMAGE, worldPos.x, worldPos.y, {
                                    width, height, imageSrc: src, aspectRatio: `${ratio}:1`, outputArtifacts: [src]
                                });
                            };
                            img.src = event.target?.result as string;
                        };
                        reader.readAsDataURL(file);
                    }
                } else if (item.type.indexOf('video') !== -1) {
                    hasSystemMedia = true;
                    const file = item.getAsFile();
                    if (file) {
                        const url = URL.createObjectURL(file);
                        const video = document.createElement('video');
                        video.preload = 'metadata';
                        video.onloadedmetadata = () => {
                            const { width, height, ratio } = calculateImportDimensions(video.videoWidth, video.videoHeight);
                            addNode(NodeType.TEXT_TO_VIDEO, worldPos.x, worldPos.y, {
                                width, height, videoSrc: url, title: file.name, aspectRatio: `${ratio}:1`, outputArtifacts: [url]
                            });
                        };
                        video.src = url;
                    }
                }
            }
        }
        if (!hasSystemMedia && internalClipboard) performPaste(worldPos);
    }, [screenToWorld, lastMousePosRef, addNode, internalClipboard, performPaste]);

    useEffect(() => {
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [handlePaste]);

    return {
        internalClipboard,
        performCopy,
        performPaste,
    };
}
