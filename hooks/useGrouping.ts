import { useCallback } from 'react';
import { NodeData, NodeType } from '../types';

const generateId = () => Math.random().toString(36).substr(2, 9);

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

interface UseGroupingProps {
    nodes: NodeData[];
    setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    selectedNodeIds: Set<string>;
    setSelectedNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    nextGroupColor: string;
    setNextGroupColor: React.Dispatch<React.SetStateAction<string>>;
    setShowColorPicker: React.Dispatch<React.SetStateAction<boolean>>;
}

export const useGrouping = ({
    nodes,
    setNodes,
    selectedNodeIds,
    setSelectedNodeIds,
    nextGroupColor,
    setNextGroupColor,
    setShowColorPicker,
}: UseGroupingProps) => {

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
            const selectedIds = new Set(selected.map(n => n.id));
            const others = prev.filter(n => !selectedIds.has(n.id));
            return [...others, groupNode, ...selected];
        });
        setSelectedNodeIds(new Set([groupNode.id]));
    }, [nodes, selectedNodeIds, nextGroupColor, setNodes, setSelectedNodeIds]);

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
        const selectedGroups = nodes.filter(n => selectedNodeIds.has(n.id) && n.type === NodeType.GROUP);
        
        if (selectedGroups.length > 0) {
            setNodes(prev => prev.map(n => {
                if (selectedNodeIds.has(n.id) && n.type === NodeType.GROUP) {
                    return { ...n, color };
                }
                return n;
            }));
        }
        
        setNextGroupColor(color);
        setShowColorPicker(false);
    }, [nodes, selectedNodeIds, setNodes, setNextGroupColor, setShowColorPicker]);

    // Calculate Selection Center for Group Toolbar
    const getSelectionCenter = useCallback((transform: { x: number, y: number, k: number }) => {
        const selected = nodes.filter(n => selectedNodeIds.has(n.id));
        if (selected.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity;
        selected.forEach(n => {
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x + n.width > maxX) maxX = n.x + n.width;
        });
        return {
            x: ((minX + maxX) / 2) * transform.k + transform.x,
            y: minY * transform.k + transform.y
        };
    }, [nodes, selectedNodeIds]);

    return {
        handleGroupSelection,
        handleUngroup,
        handleGroupColorChange,
        getSelectionCenter,
    };
};
