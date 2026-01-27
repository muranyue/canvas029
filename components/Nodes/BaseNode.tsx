
import React from 'react';
import { NodeData, NodeType } from '../../types';

interface BaseNodeProps {
  data: NodeData;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onConnectStart: (e: React.MouseEvent, type: 'source' | 'target') => void;
  onPortMouseUp?: (e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => void;
  onResizeStart?: (e: React.MouseEvent, direction: string) => void;
  children: React.ReactNode;
  scale: number;
  isDark?: boolean;
}

// Helper to convert hex to rgba with alpha
const hexToRgba = (hex: string, alpha: number) => {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt("0x" + hex[1] + hex[1]);
        g = parseInt("0x" + hex[2] + hex[2]);
        b = parseInt("0x" + hex[3] + hex[3]);
    } else if (hex.length === 7) {
        r = parseInt("0x" + hex[1] + hex[2]);
        g = parseInt("0x" + hex[3] + hex[4]);
        b = parseInt("0x" + hex[5] + hex[6]);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const BaseNode: React.FC<BaseNodeProps> = ({ 
  data, selected, onMouseDown, onContextMenu, onConnectStart, onPortMouseUp, children, onResizeStart, isDark = true
}) => {
  
  const portBg = isDark ? 'bg-[#0B0C0E] border-zinc-500' : 'bg-white border-gray-400';
  const portText = isDark ? 'text-zinc-400' : 'text-gray-500';
  const isGroup = data.type === NodeType.GROUP;

  // Z-Index Logic
  let zIndex: number | undefined = undefined;
  
  if (data.isStackOpen) {
      zIndex = 1000; // Highest priority
  } else if (!isGroup && selected) {
      zIndex = 100; // Boost selected content nodes slightly
  } else {
      zIndex = 10; 
  }

  // Apply Group visual styles directly on BaseNode to ensure updates render immediately.
  // We use hexToRgba to make the user-selected solid color transparent (20% opacity).
  const groupStyle: React.CSSProperties = isGroup ? {
      backgroundColor: data.color ? hexToRgba(data.color, 0.2) : (isDark ? 'rgba(39, 39, 42, 0.5)' : 'rgba(228, 228, 231, 0.5)'),
  } : {};

  return (
    <div 
      className={`absolute flex flex-col group ${isGroup ? 'rounded-2xl transition-colors duration-200' : ''}`}
      style={{
        left: data.x,
        top: data.y,
        width: data.width,
        height: data.height,
        zIndex, 
        overflow: 'visible',
        pointerEvents: isGroup && !selected ? 'auto' : 'auto',
        ...groupStyle
      }}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
    >
      {/* Selection Border - Groups handle their own selection border in GroupNode to encompass header */}
      {selected && !isGroup && (
          <div className={`absolute inset-0 pointer-events-none rounded-xl border-2 border-cyan-500/50 z-40 ${data.isStackOpen ? 'opacity-0' : 'opacity-100'}`}></div> 
      )}

      {/* Main Content Area */}
      <div className="relative w-full h-full">
          {children}

          {/* Connection Ports - Groups don't have ports */}
          
          {/* INPUT PORT (Target) - Hidden for Original Image & Group */}
          {!isGroup && data.type !== NodeType.ORIGINAL_IMAGE && (
            <div 
              className={`absolute w-4 h-4 rounded-full border -left-2 top-1/2 -translate-y-1/2 flex items-center justify-center cursor-crosshair hover:scale-125 transition-transform z-50 shadow-sm ${portBg}`}
              onMouseDown={(e) => e.stopPropagation()} // Prevent node drag
              onMouseUp={(e) => onPortMouseUp && onPortMouseUp(e, data.id, 'target')} // Handle drop
            >
                <span className={`text-[10px] leading-none select-none relative -top-[0.5px] ${portText}`}>+</span>
                <div className="absolute -inset-4 rounded-full bg-transparent z-10"></div>
            </div>
          )}

          {/* OUTPUT PORT (Source) - Available for All Nodes except Group */}
          {!isGroup && (
            <div 
                className={`absolute w-4 h-4 rounded-full border -right-2 top-1/2 -translate-y-1/2 flex items-center justify-center cursor-crosshair hover:scale-125 transition-transform z-50 shadow-sm ${portBg}`}
                onMouseDown={(e) => onConnectStart(e, 'source')}
            >
                    <span className={`text-[10px] leading-none select-none relative -top-[0.5px] ${portText}`}>+</span>
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
