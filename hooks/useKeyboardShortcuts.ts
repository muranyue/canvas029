import React, { useEffect, useCallback } from 'react';
import { NodeData, Connection } from '../types';

export interface KeyboardShortcutsProps {
    // State
    nodes: NodeData[];
    setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    connections: Connection[];
    setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
    selectedNodeIds: Set<string>;
    setSelectedNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    selectedConnectionId: string | null;
    setSelectedConnectionId: React.Dispatch<React.SetStateAction<string | null>>;
    deletedNodes: NodeData[];
    setDeletedNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    
    // UI State
    previewMedia: { url: string; type: 'image' | 'video' } | null;
    setPreviewMedia: React.Dispatch<React.SetStateAction<{ url: string; type: 'image' | 'video' } | null>>;
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
    
    // Refs
    spacePressed: React.MutableRefObject<boolean>;
    
    // Actions
    performCopy: () => void;
    handleAlign: (direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => void;
    handleGroupSelection: () => void;
}

export function useKeyboardShortcuts({
    nodes,
    setNodes,
    connections,
    setConnections,
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
    spacePressed,
    performCopy,
    handleAlign,
    handleGroupSelection,
}: KeyboardShortcutsProps): void {
    
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isInput = target.tagName === 'INPUT' || 
                           target.tagName === 'TEXTAREA' || 
                           target.isContentEditable;

            if (!isInput) {
                // Delete/Backspace - Delete selected nodes or connection
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    if (selectedNodeIds.size > 0) {
                        const nodesToDelete = nodes.filter(n => selectedNodeIds.has(n.id));
                        const withContent = nodesToDelete.filter(n => n.imageSrc || n.videoSrc);
                        if (withContent.length > 0) {
                            setDeletedNodes(prev => [...prev, ...withContent]);
                        }
                        setNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)));
                        setConnections(prev => prev.filter(c => 
                            !selectedNodeIds.has(c.sourceId) && !selectedNodeIds.has(c.targetId)
                        ));
                        setSelectedNodeIds(new Set());
                    }
                    if (selectedConnectionId) {
                        setConnections(prev => prev.filter(c => c.id !== selectedConnectionId));
                        setSelectedConnectionId(null);
                    }
                }

                // Ctrl/Cmd + C - Copy
                if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                    e.preventDefault();
                    performCopy();
                }

                // Ctrl/Cmd + Arrow Keys - Align
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
                    if (e.key === 'ArrowUp') { e.preventDefault(); handleAlign('UP'); }
                    if (e.key === 'ArrowDown') { e.preventDefault(); handleAlign('DOWN'); }
                    if (e.key === 'ArrowLeft') { e.preventDefault(); handleAlign('LEFT'); }
                    if (e.key === 'ArrowRight') { e.preventDefault(); handleAlign('RIGHT'); }
                }

                // Ctrl/Cmd + G - Group
                if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
                    e.preventDefault();
                    handleGroupSelection();
                }
            }

            // Escape - Close modals/menus
            if (e.key === 'Escape') {
                if (previewMedia) setPreviewMedia(null);
                if (contextMenu) setContextMenu(null);
                if (quickAddMenu) setQuickAddMenu(null);
                if (showNewWorkflowDialog) setShowNewWorkflowDialog(false);
                if (isSettingsOpen) setIsSettingsOpen(false);
                setShowColorPicker(false);
            }

            // Space - Track for pan mode
            if (e.code === 'Space') spacePressed.current = true;
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') spacePressed.current = false;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [
        nodes,
        connections,
        selectedNodeIds,
        selectedConnectionId,
        previewMedia,
        contextMenu,
        quickAddMenu,
        showNewWorkflowDialog,
        isSettingsOpen,
        showColorPicker,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDeletedNodes,
        setPreviewMedia,
        setContextMenu,
        setQuickAddMenu,
        setShowNewWorkflowDialog,
        setIsSettingsOpen,
        setShowColorPicker,
        spacePressed,
        performCopy,
        handleAlign,
        handleGroupSelection,
    ]);
}
