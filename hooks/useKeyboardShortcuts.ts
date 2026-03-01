import { useEffect, useRef } from 'react';
import { NodeData, Connection, CanvasTransform } from '../types';

interface UseKeyboardShortcutsProps {
    nodes: NodeData[];
    setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    connections: Connection[];
    setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
    viewportSize: { width: number; height: number };
    setTransform: React.Dispatch<React.SetStateAction<CanvasTransform>>;
    selectedNodeIds: Set<string>;
    setSelectedNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    selectedConnectionId: string | null;
    setSelectedConnectionId: React.Dispatch<React.SetStateAction<string | null>>;
    deletedNodes: NodeData[];
    setDeletedNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    previewMedia: any;
    setPreviewMedia: React.Dispatch<React.SetStateAction<any>>;
    contextMenu: any;
    setContextMenu: React.Dispatch<React.SetStateAction<any>>;
    quickAddMenu: any;
    setQuickAddMenu: React.Dispatch<React.SetStateAction<any>>;
    showNewWorkflowDialog: boolean;
    setShowNewWorkflowDialog: React.Dispatch<React.SetStateAction<boolean>>;
    isSettingsOpen: boolean;
    setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
    showColorPicker: boolean;
    setShowColorPicker: React.Dispatch<React.SetStateAction<boolean>>;
    performCopy: () => void;
    handleAlign: (direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => void;
    handleGroupSelection: () => void;
}

export const useKeyboardShortcuts = ({
    nodes,
    setNodes,
    connections,
    setConnections,
    viewportSize,
    setTransform,
    selectedNodeIds,
    setSelectedNodeIds,
    selectedConnectionId,
    setSelectedConnectionId,
    deletedNodes,
    setDeletedNodes,
    previewMedia,
    setPreviewMedia,
    contextMenu,
    setContextMenu,
    quickAddMenu,
    setQuickAddMenu,
    showNewWorkflowDialog,
    setShowNewWorkflowDialog,
    isSettingsOpen,
    setIsSettingsOpen,
    showColorPicker,
    setShowColorPicker,
    performCopy,
    handleAlign,
    handleGroupSelection,
}: UseKeyboardShortcutsProps) => {
    const spacePressed = useRef(false);
    const spaceKeyDownAtRef = useRef(0);
    const spaceDragUsedRef = useRef(false);

    useEffect(() => {
        const focusOnSelection = () => {
            const selectedNodes = nodes.filter(n => selectedNodeIds.has(n.id));
            if (selectedNodes.length === 0) return;

            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;

            selectedNodes.forEach((node) => {
                if (node.x < minX) minX = node.x;
                if (node.y < minY) minY = node.y;
                if (node.x + node.width > maxX) maxX = node.x + node.width;
                if (node.y + node.height > maxY) maxY = node.y + node.height;
            });

            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const viewWidth = viewportSize.width > 0 ? viewportSize.width : window.innerWidth;
            const viewHeight = viewportSize.height > 0 ? viewportSize.height : window.innerHeight;
            const targetScale = 1;

            setTransform({
                x: viewWidth / 2 - centerX * targetScale,
                y: viewHeight / 2 - centerY * targetScale,
                k: targetScale,
            });
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
            
            if (!isInput) {
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    if (selectedNodeIds.size > 0) {
                        const nodesToDelete = nodes.filter(n => selectedNodeIds.has(n.id));
                        const withContent = nodesToDelete.filter(n => n.imageSrc || n.videoSrc);
                        if (withContent.length > 0) {
                            setDeletedNodes(prev => [...prev, ...withContent]);
                        }
                        setNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)));
                        setConnections(prev => prev.filter(c => !selectedNodeIds.has(c.sourceId) && !selectedNodeIds.has(c.targetId)));
                        setSelectedNodeIds(new Set());
                    }
                    if (selectedConnectionId) {
                        setConnections(prev => prev.filter(c => c.id !== selectedConnectionId));
                        setSelectedConnectionId(null);
                    }
                }
                if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                    e.preventDefault();
                    performCopy();
                }
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
                    if (e.key === 'ArrowUp') { e.preventDefault(); handleAlign('UP'); }
                    if (e.key === 'ArrowDown') { e.preventDefault(); handleAlign('DOWN'); }
                    if (e.key === 'ArrowLeft') { e.preventDefault(); handleAlign('LEFT'); }
                    if (e.key === 'ArrowRight') { e.preventDefault(); handleAlign('RIGHT'); }
                }
                if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
                    e.preventDefault();
                    handleGroupSelection();
                }
            }
            
            if (e.key === 'Escape') {
                if (previewMedia) setPreviewMedia(null);
                if (contextMenu) setContextMenu(null);
                if (quickAddMenu) setQuickAddMenu(null);
                if (showNewWorkflowDialog) setShowNewWorkflowDialog(false);
                if (isSettingsOpen) setIsSettingsOpen(false);
                setShowColorPicker(false);
            }

            if (e.code === 'Space' && !isInput) {
                if (!e.repeat) {
                    spaceKeyDownAtRef.current = Date.now();
                    spaceDragUsedRef.current = false;
                }
                spacePressed.current = true;
                e.preventDefault();
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

            if (e.code === 'Space') {
                if (!isInput) {
                    const pressDuration = Date.now() - spaceKeyDownAtRef.current;
                    const shouldFocus = selectedNodeIds.size > 0 && !spaceDragUsedRef.current && pressDuration < 300;
                    if (shouldFocus) {
                        focusOnSelection();
                    }
                    e.preventDefault();
                }
                spacePressed.current = false;
            }
        };

        const handleMouseDown = (e: MouseEvent) => {
            if (spacePressed.current && e.button === 0) {
                spaceDragUsedRef.current = true;
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (spacePressed.current && e.buttons !== 0) {
                spaceDragUsedRef.current = true;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, [
        selectedNodeIds, selectedConnectionId, previewMedia, contextMenu, 
        nodes, connections, quickAddMenu, showNewWorkflowDialog, isSettingsOpen, 
        handleAlign, performCopy, handleGroupSelection,
        viewportSize, setTransform,
        setNodes, setConnections, setSelectedNodeIds, setSelectedConnectionId,
        setDeletedNodes, setPreviewMedia, setContextMenu, setQuickAddMenu,
        setShowNewWorkflowDialog, setIsSettingsOpen, setShowColorPicker
    ]);

    return { spacePressed };
};
