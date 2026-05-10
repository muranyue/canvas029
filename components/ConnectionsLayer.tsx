import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icons } from './Icons';
import { NodeData, Connection, CanvasTransform, Point } from '../types';

type ConnectionControlPoint = { connectionId: string; x: number; y: number };

const getBezierPoint = (
    p0: Point,
    p1: Point,
    p2: Point,
    p3: Point,
    t: number
): Point => {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    return {
        x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
        y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
    };
};

const getClosestBezierPoint = (
    p0: Point,
    p1: Point,
    p2: Point,
    p3: Point,
    target: Point
): Point => {
    let bestT = 0.5;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const point = getBezierPoint(p0, p1, p2, p3, t);
        const dx = point.x - target.x;
        const dy = point.y - target.y;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
            bestDistance = distance;
            bestT = t;
        }
    }

    const step = 1 / 24;
    const start = Math.max(0, bestT - step);
    const end = Math.min(1, bestT + step);
    for (let i = 0; i <= 8; i++) {
        const t = start + ((end - start) * i) / 8;
        const point = getBezierPoint(p0, p1, p2, p3, t);
        const dx = point.x - target.x;
        const dy = point.y - target.y;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
            bestDistance = distance;
            bestT = t;
        }
    }

    return getBezierPoint(p0, p1, p2, p3, bestT);
};

interface ConnectionsLayerProps {
    connections: Connection[];
    nodeById: Map<string, NodeData>;
    transform: CanvasTransform;
    selectedConnectionId: string | null;
    isDark: boolean;
    dragMode: string;
    connectionStartNodeId: string | null;
    tempConnection: Point | null;
    onSelectConnection: (id: string) => void;
    onRemoveConnection: (id: string) => void;
}

export const ConnectionsLayer: React.FC<ConnectionsLayerProps> = ({
    connections, nodeById, transform, selectedConnectionId, isDark,
    dragMode, connectionStartNodeId, tempConnection,
    onSelectConnection, onRemoveConnection,
}) => {
    const [connectionControlPoint, setConnectionControlPoint] = useState<ConnectionControlPoint | null>(null);
    const hoveredConnectionIdRef = useRef<string | null>(null);
    const pendingControlPointRef = useRef<ConnectionControlPoint | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const flushControlPoint = useCallback(() => {
        animationFrameRef.current = null;
        const next = pendingControlPointRef.current;
        setConnectionControlPoint(prev => {
            if (!prev && !next) return prev;
            if (
                prev &&
                next &&
                prev.connectionId === next.connectionId &&
                Math.abs(prev.x - next.x) < 0.5 &&
                Math.abs(prev.y - next.y) < 0.5
            ) {
                return prev;
            }
            return next;
        });
    }, []);

    const scheduleControlPoint = useCallback((next: ConnectionControlPoint | null) => {
        pendingControlPointRef.current = next;
        if (animationFrameRef.current !== null) return;
        animationFrameRef.current = window.requestAnimationFrame(flushControlPoint);
    }, [flushControlPoint]);

    useEffect(() => {
        return () => {
            if (animationFrameRef.current !== null) {
                window.cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const hoveredId = hoveredConnectionIdRef.current;
        if (!selectedConnectionId && !hoveredId) {
            scheduleControlPoint(null);
            return;
        }
        if (selectedConnectionId && hoveredId !== selectedConnectionId && connectionControlPoint?.connectionId !== selectedConnectionId) {
            scheduleControlPoint(null);
        }
    }, [connectionControlPoint, scheduleControlPoint, selectedConnectionId]);

    const updateConnectionControlPoint = useCallback((connId: string, clientX: number, clientY: number) => {
        hoveredConnectionIdRef.current = connId;

        const worldPointer = {
            x: (clientX - transform.x) / transform.k,
            y: (clientY - transform.y) / transform.k,
        };
        const conn = connections.find(item => item.id === connId);
        if (!conn) return;
        const source = nodeById.get(conn.sourceId);
        const target = nodeById.get(conn.targetId);
        if (!source || !target) return;

        const sx = source.x + source.width;
        const sy = source.y + source.height / 2;
        const tx = target.x;
        const ty = target.y + target.height / 2;
        const dist = Math.abs(tx - sx);
        const cp = Math.min(80, Math.max(24, dist / 2));
        const point = getClosestBezierPoint(
            { x: sx, y: sy },
            { x: sx + cp, y: sy },
            { x: tx - cp, y: ty },
            { x: tx, y: ty },
            worldPointer
        );

        scheduleControlPoint({ connectionId: connId, x: point.x, y: point.y });
    }, [connections, nodeById, scheduleControlPoint, transform.k, transform.x, transform.y]);

    const clearConnectionControlPoint = useCallback((connId: string) => {
        if (hoveredConnectionIdRef.current === connId) {
            hoveredConnectionIdRef.current = null;
        }
        if (selectedConnectionId === connId) {
            return;
        }
        scheduleControlPoint(null);
    }, [scheduleControlPoint, selectedConnectionId]);

    return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-0">
            <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
                {connections.map(conn => {
                    const source = nodeById.get(conn.sourceId);
                    const target = nodeById.get(conn.targetId);
                    if (!source || !target) return null;
                    const sx = source.x + source.width;
                    const sy = source.y + source.height / 2;
                    const tx = target.x;
                    const ty = target.y + target.height / 2;
                    const dist = Math.abs(tx - sx);
                    const cp = Math.min(80, Math.max(24, dist / 2));
                    const d = `M ${sx} ${sy} C ${sx + cp} ${sy}, ${tx - cp} ${ty}, ${tx} ${ty}`;
                    const isSelected = selectedConnectionId === conn.id;
                    const isHoverControlVisible = connectionControlPoint?.connectionId === conn.id;
                    const showConnectionControl = isSelected || isHoverControlVisible;
                    const controlPoint = isHoverControlVisible
                        ? connectionControlPoint
                        : { x: (sx + tx) / 2, y: (sy + ty) / 2 };
                    return (
                        <g
                            key={conn.id}
                            className="pointer-events-auto cursor-pointer group"
                            onClick={(e) => { e.stopPropagation(); onSelectConnection(conn.id); }}
                            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onSelectConnection(conn.id); }}
                            onMouseMove={(e) => updateConnectionControlPoint(conn.id, e.clientX, e.clientY)}
                            onMouseEnter={(e) => updateConnectionControlPoint(conn.id, e.clientX, e.clientY)}
                            onMouseLeave={() => clearConnectionControlPoint(conn.id)}
                        >
                            <path d={d} stroke={isSelected ? (isDark ? "#ffffff" : "#000000") : (isDark ? "#52525b" : "#a1a1aa")} strokeWidth={2} fill="none" className="transition-colors duration-200 group-hover:stroke-cyan-500" />
                            <path d={d} stroke="transparent" strokeWidth={20} fill="none" />
                            <foreignObject
                                x={controlPoint.x - 16}
                                y={controlPoint.y - 16}
                                width={32}
                                height={32}
                                className={`overflow-visible transition-opacity duration-150 ${showConnectionControl ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                            >
                                <button className={`w-8 h-8 flex items-center justify-center border rounded-full transition-all shadow-md focus:outline-none ${isDark ? 'bg-[#1A1D21] border-zinc-600 text-zinc-400 hover:text-red-500 hover:border-red-500' : 'bg-white border-gray-300 text-gray-400 hover:text-red-600 hover:border-red-600'}`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemoveConnection(conn.id); }} onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onRemoveConnection(conn.id); }} title="Disconnect">
                                    <Icons.Scissors size={17} />
                                </button>
                            </foreignObject>
                        </g>
                    );
                })}
                {dragMode === 'CONNECT' && connectionStartNodeId && tempConnection && (() => {
                    const startNode = nodeById.get(connectionStartNodeId);
                    if (!startNode) return null;
                    return (
                        <path d={`M ${startNode.x + startNode.width} ${startNode.y + startNode.height / 2} L ${tempConnection.x} ${tempConnection.y}`} stroke={isDark ? "#52525b" : "#a1a1aa"} strokeWidth={2} strokeDasharray="5,5" fill="none" />
                    );
                })()}
            </g>
        </svg>
    );
};
