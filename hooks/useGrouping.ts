import React, { useState, useCallback, useEffect } from 'react';
import { NodeData, NodeType } from '../types';

// Morandi-ish Colored Grays
export const GROUP_COLORS = [
    '#E2E5E8',
    '#E8E5E2',
    '#D9D5D0',
    '#C8C5C1',
    '#E0E2E8',
    '#E6E3DD',
    '#E3E8E6',
];

export interface GroupingProps {
    nodes: NodeData[];
    setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    selectedNodeIds: Set<string>;
    setSelectedNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    generateId: () => string;
}

export interface GroupingReturn {
    nextGroupColor: string;
    setNextGroupColor: React.Dispatch<React.SetStateAction<string>>;
    showColorPicker: boolean;
    setShowColorPicker: React.Dispatch<React.SetStateAction<boolean>>;
    handleGroupSelection: () => void;
    handleUngroup: () => void;
    handleGroupColorChange: (color: string) => void;
}

export function useGrouping({
    nodes,
    setNodes,
    selectedNodeIds,
    setSelectedNodeIds,
    generateId,
}: GroupingProps): GroupingReturn {
    
    const [nextGroupColor, setNextGroupColor] = useState('#E0E2E8');
    const [showColorPicker, setShowColorPicker] = useState(false);

    // Reset color picker visibility when selection changes
    useEffect(() => {
        setShowColorPicker(false);
    }, [selectedNodeIds]);

    const handleGroupSelection = useCallback(() => {
        const selected = nodes.filter(n => selectedNodeIds.has(n.id));
        if (selected.length < 1) return;

        const padding = 40;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        selected.forEach(n => {
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x + n.width > maxX) maxX = n.x + n.width;
            if (n.y + n.height > maxY) maxY = n.y + n.height;
        });

        const groupNode: NodeData = {
            id: generateId(),
            type: NodeType.GROUP,
            x: minX - padding,
            y: minY - padding,
            width: (maxX - minX) + padding * 2,
            height: (maxY - minY) + padding * 2,
            title: 'Group',
            color: nextGroupColor,
        };

        setNodes(prev => {
            // IMPORTANT: When creating a group, we must order it BEHIND the selected nodes.
            const selectedIds = new Set(selected.map(n => n.id));
            const others = prev.filter(n => !selectedIds.has(n.id));
            return [...others, groupNode, ...selected];
        });
        setSelectedNodeIds(new Set([groupNode.id]));
    }, [nodes, selectedNodeIds, nextGroupColor, generateId, setNodes, setSelectedNodeIds]);

    const handleUngroup = useCallback(() => {
        if (selectedNodeIds.size !== 1) return;
        const groupId = Array.from(selectedNodeIds)[0];
        const groupNode = nodes.find(n => n.id === groupId);
        if (groupNode && groupNode.type === NodeType.GROUP) {
            setNodes(prev => prev.filter(n => n.id !== groupId));
            setSelectedNodeIds(new Set());
        }
    }, [nodes, selectedNodeIds, setNodes, setSelectedNodeIds]);

    const handleGroupColorChange = useCallback((color: string) => {
        // Update ALL selected groups (or just one if single select)
        const selectedGroups = nodes.filter(n => selectedNodeIds.has(n.id) && n.type === NodeType.GROUP);

        if (selectedGroups.length > 0) {
            setNodes(prev => prev.map(n => {
                if (selectedNodeIds.has(n.id) && n.type === NodeType.GROUP) {
                    return { ...n, color };
                }
                return n;
            }));
        }

        // Always update global nextGroupColor state
        setNextGroupColor(color);
        setShowColorPicker(false);
    }, [nodes, selectedNodeIds, setNodes]);

    return {
        nextGroupColor,
        setNextGroupColor,
        showColorPicker,
        setShowColorPicker,
        handleGroupSelection,
        handleUngroup,
        handleGroupColorChange,
    };
}
