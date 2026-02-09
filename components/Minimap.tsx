
import React, { useMemo, useRef, useEffect } from 'react';
import { NodeData, CanvasTransform } from '../types';

interface MinimapProps {
    nodes: NodeData[];
    transform: CanvasTransform;
    viewportSize: { width: number; height: number };
    isDark: boolean;
    className?: string;
    onNavigate: (x: number, y: number) => void;
}

export const Minimap: React.FC<MinimapProps> = ({ nodes, transform, viewportSize, isDark, className, onNavigate }) => {
    // Constants
    const MAP_WIDTH = 240;
    const MAP_HEIGHT = 160;
    const PADDING = 500; // Padding around nodes in world units

    // 1. Calculate World Viewport
    const viewWorld = useMemo(() => ({
        x: -transform.x / transform.k,
        y: -transform.y / transform.k,
        w: viewportSize.width / transform.k,
        h: viewportSize.height / transform.k
    }), [transform, viewportSize]);

    // 2. Calculate Layout Config (Scale & Offset)
    const layout = useMemo(() => {
        // A. Calculate Union Bounds (Nodes + Current Viewport)
        // This ensures the map covers where we are, even if far from nodes
        let minX = viewWorld.x;
        let minY = viewWorld.y;
        let maxX = viewWorld.x + viewWorld.w;
        let maxY = viewWorld.y + viewWorld.h;

        if (nodes.length > 0) {
            nodes.forEach(node => {
                if (node.x < minX) minX = node.x;
                if (node.y < minY) minY = node.y;
                if (node.x + node.width > maxX) maxX = node.x + node.width;
                if (node.y + node.height > maxY) maxY = node.y + node.height;
            });
        }

        // Apply padding to world bounds
        minX -= PADDING;
        minY -= PADDING;
        maxX += PADDING;
        maxY += PADDING;

        const boundsW = maxX - minX;
        const boundsH = maxY - minY;

        // B. Calculate Base Scale (Fit All)
        // Try to fit the entire union bounds into the map
        let scale = Math.min(MAP_WIDTH / boundsW, MAP_HEIGHT / boundsH);

        // C. Apply Constraints to Scale based on Viewport Frame Size
        // Requirement: Viewport frame longest side must be between 1/5 and 1/1 of Map longest side.
        const mapLongest = Math.max(MAP_WIDTH, MAP_HEIGHT);
        const viewLongest = Math.max(viewWorld.w, viewWorld.h);
        
        const minFramePx = mapLongest / 5; // 20%
        const maxFramePx = mapLongest;     // 100%

        // If "Fit All" makes the frame too small (tiny dot), zoom in
        if (viewLongest * scale < minFramePx) {
            scale = minFramePx / viewLongest;
        }
        // If "Fit All" makes the frame too big (larger than map), zoom out (limit max size)
        if (viewLongest * scale > maxFramePx) {
            scale = maxFramePx / viewLongest;
        }

        // D. Calculate Offset (Panning)
        // Start by attempting to center the union bounds
        let offsetX = (MAP_WIDTH - boundsW * scale) / 2 - minX * scale;
        let offsetY = (MAP_HEIGHT - boundsH * scale) / 2 - minY * scale;

        // E. Clamp Offset (Follow Logic)
        // Ensure the viewport frame is always visible inside the map
        const vpLeft = viewWorld.x * scale + offsetX;
        const vpTop = viewWorld.y * scale + offsetY;
        const vpRight = vpLeft + viewWorld.w * scale;
        const vpBottom = vpTop + viewWorld.h * scale;

        // Correction X
        if (vpLeft < 0) {
            offsetX += -vpLeft; // Shift right
        } else if (vpRight > MAP_WIDTH) {
            offsetX -= (vpRight - MAP_WIDTH); // Shift left
        }

        // Correction Y
        if (vpTop < 0) {
            offsetY += -vpTop; // Shift down
        } else if (vpBottom > MAP_HEIGHT) {
            offsetY -= (vpBottom - MAP_HEIGHT); // Shift up
        }

        return { scale, offsetX, offsetY };
    }, [nodes, viewWorld]);

    // Helpers for rendering
    const toMini = (val: number, type: 'x' | 'y') => {
        return val * layout.scale + (type === 'x' ? layout.offsetX : layout.offsetY);
    };
    const scaleSize = (val: number) => val * layout.scale;

    // Viewport Rect for CSS
    const vpRect = {
        left: toMini(viewWorld.x, 'x'),
        top: toMini(viewWorld.y, 'y'),
        width: scaleSize(viewWorld.w),
        height: scaleSize(viewWorld.h)
    };

    // Drag Logic (Mouse + Touch)
    const dragRef = useRef<{ startX: number, startY: number, startTx: number, startTy: number } | null>(null);

    const handleDragMove = (clientX: number, clientY: number) => {
        if (!dragRef.current) return;
        
        const dx = clientX - dragRef.current.startX;
        const dy = clientY - dragRef.current.startY;
        
        const worldDx = dx / layout.scale;
        const worldDy = dy / layout.scale;
        
        const newTx = dragRef.current.startTx - worldDx * transform.k;
        const newTy = dragRef.current.startTy - worldDy * transform.k;
        
        onNavigate(newTx, newTy);
    };

    const handleDragEnd = () => {
        dragRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startTx: transform.x,
            startTy: transform.y
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        handleDragMove(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
        handleDragEnd();
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const touch = e.touches[0];
        dragRef.current = {
            startX: touch.clientX,
            startY: touch.clientY,
            startTx: transform.x,
            startTy: transform.y
        };
        
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd);
    };

    const handleTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        const touch = e.touches[0];
        handleDragMove(touch.clientX, touch.clientY);
    };

    const handleTouchEnd = () => {
        handleDragEnd();
    };

    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, []);

    // Styles
    const bgClass = isDark ? 'bg-[#18181B] border-zinc-700' : 'bg-white border-gray-200';
    const nodeClass = isDark ? 'bg-zinc-600' : 'bg-gray-300';
    const viewportBorder = isDark ? 'border-cyan-500/80' : 'border-cyan-600/80';

    return (
        <div 
            className={`relative rounded-lg overflow-hidden border shadow-xl backdrop-blur-sm transition-opacity duration-300 ${bgClass} ${className}`}
            style={{ width: MAP_WIDTH, height: MAP_HEIGHT }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Render Nodes */}
            {nodes.map(node => {
                const mx = toMini(node.x, 'x');
                const my = toMini(node.y, 'y');
                const mw = scaleSize(node.width);
                const mh = scaleSize(node.height);
                
                // Simple culling optimization
                if (mx + mw < 0 || mx > MAP_WIDTH || my + mh < 0 || my > MAP_HEIGHT) return null;

                return (
                    <div
                        key={node.id}
                        className={`absolute rounded-sm ${nodeClass}`}
                        style={{
                            left: mx,
                            top: my,
                            width: mw,
                            height: mh,
                            opacity: 0.6
                        }}
                    />
                );
            })}

            {/* Render Viewport Frame */}
            <div
                className={`absolute border-2 z-10 cursor-grab active:cursor-grabbing ${viewportBorder}`}
                style={{
                    left: vpRect.left,
                    top: vpRect.top,
                    width: vpRect.width,
                    height: vpRect.height,
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)' // Dim outside area
                }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
            />
        </div>
    );
};
