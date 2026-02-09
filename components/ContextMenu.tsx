import React from 'react';
import { Icons } from './Icons';
import { NodeType } from '../types';

interface ContextMenuData {
    type: 'CANVAS' | 'NODE';
    nodeId?: string;
    nodeType?: any;
    x: number;
    y: number;
    worldX: number;
    worldY: number;
}

interface ContextMenuProps {
    contextMenu: ContextMenuData;
    isDark: boolean;
    onClose: () => void;
    onCopy: () => void;
    onPaste: (pos: { x: number; y: number }) => void;
    onDelete: (id: string) => void;
    onUngroup: () => void;
    onReplaceImage: (nodeId: string) => void;
    onCopyImageData: (nodeId: string) => void;
    onAddNode: (type: NodeType, x: number, y: number) => void;
    hasCopiedData: boolean;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
    contextMenu, isDark, onClose, onCopy, onPaste, onDelete,
    onUngroup, onReplaceImage, onCopyImageData, onAddNode, hasCopiedData,
}) => {
    const itemClass = isDark
        ? 'text-gray-300 hover:bg-zinc-800 hover:text-white'
        : 'text-gray-700 hover:bg-gray-100 hover:text-black';
    const divider = isDark ? 'bg-zinc-700' : 'bg-gray-200';

    return (
        <div
            className={`fixed z-50 border rounded-lg shadow-2xl py-1 min-w-[160px] flex flex-col ${isDark ? 'bg-[#1A1D21] border-zinc-700' : 'bg-white border-gray-200'}`}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {contextMenu.type === 'NODE' && contextMenu.nodeId && (
                <>
                    {contextMenu.nodeType === NodeType.GROUP ? (
                        <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${itemClass}`} onClick={() => { onUngroup(); onClose(); }}>
                            <Icons.LayoutGrid size={14} /> Ungroup
                        </button>
                    ) : (
                        <>
                            <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${itemClass}`} onClick={() => { onCopy(); onClose(); }}>
                                <Icons.Copy size={14} /> Copy
                            </button>
                            {contextMenu.nodeType === NodeType.ORIGINAL_IMAGE && (
                                <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${itemClass}`} onClick={() => { onReplaceImage(contextMenu.nodeId!); onClose(); }}>
                                    <Icons.Upload size={14} /> Replace Image
                                </button>
                            )}
                            <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${itemClass}`} onClick={() => { if (contextMenu.nodeId) onCopyImageData(contextMenu.nodeId); onClose(); }}>
                                <Icons.Image size={14} /> Copy Image Data
                            </button>
                        </>
                    )}
                    <div className={`h-px my-1 ${divider}`}></div>
                    <button
                        className={`text-left px-3 py-2 text-xs text-red-400 transition-colors flex items-center gap-2 ${isDark ? 'hover:bg-zinc-800 hover:text-red-300' : 'hover:bg-red-50 hover:text-red-600'}`}
                        onClick={() => { if (contextMenu.nodeId) onDelete(contextMenu.nodeId); onClose(); }}
                    >
                        <Icons.Trash2 size={14} /> Delete
                    </button>
                </>
            )}
            {contextMenu.type === 'CANVAS' && (
                <>
                    <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${itemClass}`} onClick={() => { onPaste({ x: contextMenu.worldX, y: contextMenu.worldY }); onClose(); }} disabled={!hasCopiedData}>
                        <Icons.Copy size={14} /> Paste
                    </button>
                    <div className={`h-px my-1 ${divider}`}></div>
                    <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${itemClass}`} onClick={() => { onAddNode(NodeType.TEXT_TO_IMAGE, contextMenu.worldX, contextMenu.worldY); onClose(); }}>
                        <Icons.Image size={14} /> Add Text to Image
                    </button>
                    <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${itemClass}`} onClick={() => { onAddNode(NodeType.TEXT_TO_VIDEO, contextMenu.worldX, contextMenu.worldY); onClose(); }}>
                        <Icons.Video size={14} /> Add Text to Video
                    </button>
                </>
            )}
        </div>
    );
};
