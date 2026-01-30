
import React from 'react';
import { NodeData, NodeType } from '../../types';
import { Icons } from '../Icons';

interface BaseNodeProps {
  data: NodeData;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onConnectStart: (e: React.MouseEvent, type: 'source' | 'target') => void;
  onPortMouseUp?: (e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => void;
  onResizeStart?: (e: React.MouseEvent, direction: string) => void;
  // Touch Events
  onTouchStart?: (e: React.TouchEvent) => void;
  onConnectTouchStart?: (e: React.TouchEvent, type: 'source' | 'target') => void;
  children: React.ReactNode;
  scale: number;
  isDark?: boolean;
}

const BaseNode: React.FC<BaseNodeProps> = ({ 
  data, selected, onMouseDown, onContextMenu, onConnectStart, onPortMouseUp, children, onResizeStart, 
  onTouchStart, onConnectTouchStart, isDark = true
}) => {
  
  const portBg = isDark ? 'bg-[#0B0C0E] border-zinc-500' : 'bg-white border-gray-400';
  const portText = isDark ? 'text-zinc-400' : 'text-gray-500';
  const isGroup = data.type === NodeType.GROUP;

  // Z-Index Logic:
  // We rely strictly on DOM order (array order) for layering Groups vs Groups vs Nodes.
  // We do NOT boost Z-index for selected Groups, as that would make them cover their own children (if children have lower/auto z-index).
  // We only boost Z-index for selected Content Nodes or Stack Open to ensure they pop over peers if needed, 
  // but since we reorder on click, even this might be redundant, but safe for Content Nodes.
  
  let zIndex: number | undefined = undefined;
  
  if (data.isStackOpen) {
      zIndex = 1000; // Highest priority
  } else if (!isGroup && selected) {
      zIndex = 100; // Boost selected content nodes slightly
  } else {
      // Default level for Groups and Unselected Nodes.
      // They will stack based on DOM order.
      // We set a base z-index to ensure they sit above the background/grid/lines if those are lower.
      zIndex = 10; 
  }

  return (
    <div 
      className={`absolute flex flex-col group`}
      style={{
        left: data.x,
        top: data.y,
        width: data.width,
        height: data.height,
        zIndex, 
        overflow: 'visible',
        pointerEvents: isGroup && !selected ? 'auto' : 'auto'
      }}
      onContextMenu={onContextMenu}
    >
      {/* Selection Border - Groups handle their own selection border in GroupNode to encompass header */}
      {selected && !isGroup && (
          <div className={`absolute inset-0 pointer-events-none rounded-xl border-2 border-cyan-500/50 z-40 ${data.isStackOpen ? 'opacity-0' : 'opacity-100'}`}></div> 
      )}

      {/* Drag Handle Area - Only this area triggers drag */}
      <div 
        className="absolute top-0 left-0 right-0 h-8 cursor-move z-50"
        data-drag-handle="true"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      />

      {/* Main Content Area */}
      <div className="relative w-full h-full pointer-events-auto">
          {children}

          {/* Connection Ports - Groups don't have ports */}
          
          {/* INPUT PORT (Target) - Hidden for Original Image & Group */}
          {!isGroup && data.type !== NodeType.ORIGINAL_IMAGE && (
            <div 
              className={`absolute w-4 h-4 rounded-full border -left-2 top-1/2 -translate-y-1/2 flex items-center justify-center cursor-crosshair hover:scale-125 transition-transform z-50 shadow-sm ${portBg}`}
              onMouseDown={(e) => e.stopPropagation()} // Prevent node drag
              onMouseUp={(e) => onPortMouseUp && onPortMouseUp(e, data.id, 'target')} // Handle drop
              // Mobile: No separate touchstart needed for input port usually, drop is handled by element detection or geometry
            >
                <Icons.Plus size={10} strokeWidth={3} className={portText} />
                <div className="absolute -inset-4 rounded-full bg-transparent z-10"></div>
            </div>
          )}

          {/* OUTPUT PORT (Source) - Available for All Nodes except Group */}
          {!isGroup && (
            <div 
                className={`absolute w-4 h-4 rounded-full border -right-2 top-1/2 -translate-y-1/2 flex items-center justify-center cursor-crosshair hover:scale-125 transition-transform z-50 shadow-sm ${portBg}`}
                onMouseDown={(e) => onConnectStart(e, 'source')}
                onTouchStart={(e) => onConnectTouchStart && onConnectTouchStart(e, 'source')} // Mobile Connect
            >
                    <Icons.Plus size={10} strokeWidth={3} className={portText} />
                    <div className="absolute -inset-4 rounded-full bg-transparent z-10"></div>
            </div>
          )}

          {/* Resize Handles */}
          {/* Bottom Right - For Everyone */}
          <div 
              className="absolute -right-1 -bottom-1 w-6 h-6 cursor-se-resize z-50 flex items-end justify-end p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              onMouseDown={(e) => onResizeStart && onResizeStart(e, 'SE')}
          >
              <div className={`w-2 h-2 border-r-2 border-b-2 ${isDark ? (isGroup ? 'border-zinc-500' : 'border-zinc-400') : (isGroup ? 'border-gray-500' : 'border-gray-400')}`}></div>
          </div>

          {/* Group Specific Handles (Left and Right edges) */}
          {isGroup && (
              <>
                  {/* Left Edge */}
                  <div 
                      className="absolute left-0 top-0 h-full w-2 cursor-ew-resize z-50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-start -ml-1"
                      onMouseDown={(e) => onResizeStart && onResizeStart(e, 'W')}
                  >
                      <div className="w-1 h-8 bg-zinc-400/50 rounded-full"></div>
                  </div>
                  {/* Right Edge */}
                  <div 
                      className="absolute right-0 top-0 h-full w-2 cursor-ew-resize z-50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-end -mr-1"
                      onMouseDown={(e) => onResizeStart && onResizeStart(e, 'E')}
                  >
                      <div className="w-1 h-8 bg-zinc-400/50 rounded-full"></div>
                  </div>
              </>
          )}
      </div>
    </div>
  );
};

export default BaseNode;
