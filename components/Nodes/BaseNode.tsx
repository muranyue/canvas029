
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

  let zIndex: number | undefined = undefined;
  
  if (data.isStackOpen) {
      zIndex = 1000; // Highest priority for open stacks
  } else if (selected) {
      zIndex = isGroup ? 5 : 1000; // Boost selected content nodes to ensure dropdowns are visible. Groups stay lower.
  } else {
      zIndex = isGroup ? 1 : 10; 
  }

  // Enhanced handlers to prevent dragging when interacting with UI controls
  const handleInteractionStart = (e: React.MouseEvent | React.TouchEvent, handler: (e: any) => void) => {
      const target = e.target as HTMLElement;
      
      // Expanded check for interactive elements including Tailwind classes and specific behaviors
      const isInteractive = 
          ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A', 'VIDEO'].includes(target.tagName) ||
          target.closest('button') || 
          target.closest('.interactive') ||
          target.closest('.nodrag') ||
          target.closest('.pointer-events-auto') || // Critical: catches explicit UI zones
          target.isContentEditable;

      if (isInteractive) {
          // Critical for mobile: stop propagation immediately if it's an interactive element.
          // This prevents the parent BaseNode from initiating a drag or capture.
          // We DO NOT call preventDefault() here to allow focus events (keyboard) and click events to fire.
          e.stopPropagation();
      } else {
          handler(e);
      }
  };

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
      onMouseDown={(e) => handleInteractionStart(e, onMouseDown)}
      onTouchStart={(e) => handleInteractionStart(e, onTouchStart || (() => {}))}
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
              onTouchStart={(e) => e.stopPropagation()}
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
              onTouchStart={(e) => { e.stopPropagation(); /* Mobile Resize TODO */ }}
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
