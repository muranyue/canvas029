
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import { NodeData, Connection, CanvasTransform, Point, DragMode, NodeType } from './types';
import BaseNode from './components/Nodes/BaseNode';
import { NodeContent } from './components/Nodes/NodeContent';
import { Icons } from './components/Icons';
import { generateCreativeDescription, generateImage, generateVideo } from './services/geminiService';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { SettingsModal } from './components/Settings/SettingsModal';
import { Minimap } from './components/Minimap';

const DEFAULT_NODE_WIDTH = 320;
const DEFAULT_NODE_HEIGHT = 240; 
const EMPTY_ARRAY: string[] = [];

// Morandi-ish Colored Grays
const GROUP_COLORS = [
    '#E2E5E8',
    '#E8E5E2',
    '#D9D5D0',
    '#C8C5C1',
    '#E0E2E8',
    '#E6E3DD',
    '#E3E8E6',
];

// Helper for resizing imported media constraints
const calculateImportDimensions = (naturalWidth: number, naturalHeight: number) => {
    const ratio = naturalWidth / naturalHeight;
    const maxSide = 750;
    let width = naturalWidth;
    let height = naturalHeight;

    if (width > height) {
        if (width > maxSide) {
            width = maxSide;
            height = width / ratio;
        }
    } else {
        if (height > maxSide) {
            height = maxSide;
            width = height * ratio;
        }
    }
    return { width, height, ratio };
};

const App: React.FC = () => {
  return (
      <CanvasWithSidebar />
  );
};

// Helper to load state safely
const loadState = <T,>(key: string, fallback: T): T => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : fallback;
    } catch (e) {
        console.warn(`Failed to load ${key} from storage`, e);
        return fallback;
    }
};

const CanvasWithSidebar: React.FC = () => {
  // Initialize state from localStorage
  const [nodes, setNodes] = useState<NodeData[]>(() => loadState('canvas_nodes', []));
  const [connections, setConnections] = useState<Connection[]>(() => loadState('canvas_connections', []));
  const [transform, setTransform] = useState<CanvasTransform>(() => loadState('canvas_transform', { x: 0, y: 0, k: 1 }));
  const [canvasBg, setCanvasBg] = useState<string>(() => loadState('canvas_bg', '#0B0C0E'));
  const [deletedNodes, setDeletedNodes] = useState<NodeData[]>(() => loadState('canvas_deleted_nodes', []));

  // Persistence Effect with Dynamic Debounce
  useEffect(() => {
      const isGenerating = nodes.some(n => n.isLoading);
      // 2s debounce if executing (to allow "interrupt" by refresh before 2s), 1s otherwise
      const delay = isGenerating ? 2000 : 1000;

      const handler = setTimeout(() => {
          localStorage.setItem('canvas_nodes', JSON.stringify(nodes));
          localStorage.setItem('canvas_connections', JSON.stringify(connections));
          localStorage.setItem('canvas_transform', JSON.stringify(transform));
          localStorage.setItem('canvas_bg', JSON.stringify(canvasBg));
          localStorage.setItem('canvas_deleted_nodes', JSON.stringify(deletedNodes));
      }, delay);

      return () => clearTimeout(handler);
  }, [nodes, connections, transform, canvasBg, deletedNodes]);

  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [dragMode, setDragMode] = useState<DragMode | 'RESIZE_NODE' | 'SELECT'>('NONE');
  const dragModeRef = useRef(dragMode);
  
  // Group Color State
  const [nextGroupColor, setNextGroupColor] = useState('#E0E2E8');
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Minimap State
  const [showMinimap, setShowMinimap] = useState(true);
  
  // Viewport tracking for Minimap
  const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  // New Workflow Dialog State
  const [showNewWorkflowDialog, setShowNewWorkflowDialog] = useState(false);
  
  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Dragging State Refs
  const draggingNodesRef = useRef<Set<string>>(new Set());
  
  // Touch Handling Refs
  const touchStartRef = useRef<{ x: number, y: number, dist: number, centerX: number, centerY: number } | null>(null);

  useEffect(() => {
      dragModeRef.current = dragMode;
  }, [dragMode]);

  useEffect(() => {
      const handleResize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isDark = canvasBg === '#0B0C0E';

  const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [suggestedNodes, setSuggestedNodes] = useState<NodeData[]>([]);
  const [previewMedia, setPreviewMedia] = useState<{ url: string, type: 'image' | 'video' } | null>(null);
  
  // Quick Add Menu State
  const [quickAddMenu, setQuickAddMenu] = useState<{ sourceId: string, x: number, y: number, worldX: number, worldY: number } | null>(null);

  const [contextMenu, setContextMenu] = useState<{ 
      type: 'CANVAS' | 'NODE', 
      nodeId?: string, 
      nodeType?: NodeType, 
      x: number, 
      y: number, 
      worldX: number, 
      worldY: number 
  } | null>(null);

  const [internalClipboard, setInternalClipboard] = useState<{ nodes: NodeData[], connections: Connection[] } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number, y: number, w?: number, h?: number, nodeId?: string, initialNodeX?: number, direction?: string }>({ x: 0, y: 0 });
  const initialTransformRef = useRef<CanvasTransform>({ x: 0, y: 0, k: 1 });
  const initialNodePositionsRef = useRef<{id: string, x: number, y: number}[]>([]);
  const connectionStartRef = useRef<{ nodeId: string, type: 'source' | 'target' } | null>(null);
  const [tempConnection, setTempConnection] = useState<Point | null>(null);
  const lastMousePosRef = useRef<Point>({ x: 0, y: 0 }); 
  
  const workflowInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const replaceImageRef = useRef<HTMLInputElement>(null);
  const nodeToReplaceRef = useRef<string | null>(null);

  const spacePressed = useRef(false);

  const screenToWorld = (x: number, y: number) => ({
    x: (x - transform.x) / transform.k,
    y: (y - transform.y) / transform.k,
  });

  const generateId = () => Math.random().toString(36).substr(2, 9);

  // Memoize inputs map to prevent array recreation on every render
  const inputsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    nodes.forEach(node => {
        map[node.id] = connections
            .filter(c => c.targetId === node.id)
            .map(c => nodes.find(n => n.id === c.sourceId))
            .filter(n => n && (n.imageSrc || n.videoSrc))
            .map(n => n!.imageSrc || n!.videoSrc || '');
    });
    return map;
  }, [nodes, connections]);

  const getInputImages = useCallback((nodeId: string) => {
    return inputsMap[nodeId] || EMPTY_ARRAY;
  }, [inputsMap]);
  
  const performCopy = () => {
      if (selectedNodeIds.size === 0) return;
      
      const selectedNodes = nodes.filter(n => selectedNodeIds.has(n.id));
      const selectedConnections = connections.filter(c => 
          selectedNodeIds.has(c.sourceId) && selectedNodeIds.has(c.targetId)
      );
      
      setInternalClipboard({ nodes: selectedNodes, connections: selectedConnections });
  };

  const performPaste = (targetPos: Point) => {
      if (!internalClipboard || internalClipboard.nodes.length === 0) return;

      const { nodes: clipboardNodes, connections: clipboardConnections } = internalClipboard;
      
      let minX = Infinity, minY = Infinity;
      clipboardNodes.forEach(n => {
          if (n.x < minX) minX = n.x;
          if (n.y < minY) minY = n.y;
      });

      const idMap = new Map<string, string>();
      const newNodes: NodeData[] = [];

      clipboardNodes.forEach(node => {
          const newId = generateId();
          idMap.set(node.id, newId);
          const offsetX = node.x - minX;
          const offsetY = node.y - minY;
          newNodes.push({
              ...node,
              id: newId,
              x: targetPos.x + offsetX,
              y: targetPos.y + offsetY,
              title: node.title.endsWith('(Copy)') ? node.title : `${node.title} (Copy)`,
              isLoading: false,
          });
      });

      const newConnections: Connection[] = clipboardConnections.map(c => ({
          id: generateId(),
          sourceId: idMap.get(c.sourceId)!,
          targetId: idMap.get(c.targetId)!
      }));

      setNodes(prev => [...prev, ...newNodes]);
      setConnections(prev => [...prev, ...newConnections]);
      setSelectedNodeIds(new Set(newNodes.map(n => n.id)));
  };

  const handleAlign = useCallback((direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {
      if (selectedNodeIds.size < 2) return;

      setNodes(prevNodes => {
          const selected = prevNodes.filter(n => selectedNodeIds.has(n.id));
          const unselected = prevNodes.filter(n => !selectedNodeIds.has(n.id));
          const updatedNodes = selected.map(n => ({ ...n })); 

          const isVerticalAlign = direction === 'UP' || direction === 'DOWN';
          
          const OVERLAP_THRESHOLD = 10;
          const isOverlap = (a: NodeData, b: NodeData) => {
              if (isVerticalAlign) {
                  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
                  return overlap > OVERLAP_THRESHOLD;
              } else {
                  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
                  return overlap > OVERLAP_THRESHOLD;
              }
          };

          const clusters: NodeData[][] = [];
          const visited = new Set<string>();

          for (const node of updatedNodes) {
              if (visited.has(node.id)) continue;
              const cluster = [node];
              visited.add(node.id);
              const queue = [node];

              while (queue.length > 0) {
                  const current = queue.shift()!;
                  for (const other of updatedNodes) {
                      if (!visited.has(other.id) && isOverlap(current, other)) {
                          visited.add(other.id);
                          cluster.push(other);
                          queue.push(other);
                      }
                  }
              }
              clusters.push(cluster);
          }

          const minTop = Math.min(...updatedNodes.map(n => n.y));
          const maxBottom = Math.max(...updatedNodes.map(n => n.y + n.height));
          const minLeft = Math.min(...updatedNodes.map(n => n.x));
          const maxRight = Math.max(...updatedNodes.map(n => n.x + n.width));

          const HORIZONTAL_GAP = 20; 
          const VERTICAL_GAP = 60;   

          clusters.forEach(cluster => {
              if (direction === 'UP') {
                  cluster.sort((a, b) => (a.y - b.y) || a.id.localeCompare(b.id));
                  let currentY = minTop;
                  cluster.forEach((node) => {
                      node.y = currentY;
                      currentY += node.height + VERTICAL_GAP;
                  });
              } else if (direction === 'DOWN') {
                  cluster.sort((a, b) => (b.y - a.y) || a.id.localeCompare(b.id)); 
                  let currentBottom = maxBottom;
                  cluster.forEach((node) => {
                      node.y = currentBottom - node.height;
                      currentBottom -= (node.height + VERTICAL_GAP);
                  });
              } else if (direction === 'LEFT') {
                  cluster.sort((a, b) => (a.x - b.x) || a.id.localeCompare(b.id));
                  let currentX = minLeft;
                  cluster.forEach((node) => {
                      node.x = currentX;
                      currentX += node.width + HORIZONTAL_GAP;
                  });
              } else if (direction === 'RIGHT') {
                  cluster.sort((a, b) => (b.x - a.x) || a.id.localeCompare(b.id)); 
                  let currentRight = maxRight;
                  cluster.forEach((node) => {
                      node.x = currentRight - node.width;
                      currentRight -= (node.width + HORIZONTAL_GAP);
                  });
              }
          });

          return [...unselected, ...updatedNodes];
      });
  }, [selectedNodeIds]);

  const addNode = (type: NodeType, x?: number, y?: number, dataOverride?: Partial<NodeData>) => {
    if (x === undefined || y === undefined) {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const center = screenToWorld(rect.width / 2, rect.height / 2);
        x = center.x - DEFAULT_NODE_WIDTH / 2;
        y = center.y - DEFAULT_NODE_HEIGHT / 2;
      } else {
        x = 0; y = 0;
      }
    }

    let w = dataOverride?.width || DEFAULT_NODE_WIDTH;
    let h = dataOverride?.height || DEFAULT_NODE_HEIGHT;

    if (type === NodeType.ORIGINAL_IMAGE) {
        h = dataOverride?.height || 240;
    } else if (type === NodeType.TEXT_TO_VIDEO) {
        if (!dataOverride?.width) w = 400 * (16/9); 
        if (!dataOverride?.height) h = 400;
    } else if (type === NodeType.TEXT_TO_IMAGE) {
        if (!dataOverride?.width) w = 400;
        if (!dataOverride?.height) h = 400;
    }
    
    const newNode: NodeData = {
      id: generateId(),
      type,
      x,
      y,
      width: w,
      height: h, 
      title: dataOverride?.title || (type === NodeType.TEXT_TO_IMAGE ? 'Text to Image' :
             type === NodeType.TEXT_TO_VIDEO ? 'Text to Video' :
             type === NodeType.CREATIVE_DESC ? 'Creative Description' : `Original Image_${Date.now()}`),
      aspectRatio: dataOverride?.aspectRatio || (type === NodeType.TEXT_TO_VIDEO ? '16:9' : '1:1'),
      model: dataOverride?.model || (type === NodeType.TEXT_TO_IMAGE ? 'BananaPro' : 
             type === NodeType.TEXT_TO_VIDEO ? 'Sora2' : 'IMAGE'),
      resolution: dataOverride?.resolution || (type === NodeType.TEXT_TO_VIDEO ? '720p' : '1k'),
      duration: dataOverride?.duration || (type === NodeType.TEXT_TO_VIDEO ? '5s' : undefined),
      count: 1,
      prompt: dataOverride?.prompt || '',
      imageSrc: dataOverride?.imageSrc,
      videoSrc: dataOverride?.videoSrc,
      outputArtifacts: dataOverride?.outputArtifacts || (dataOverride?.imageSrc || dataOverride?.videoSrc ? [dataOverride.imageSrc || dataOverride.videoSrc!] : [])
    };
    
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeIds(new Set([newNode.id]));
  };

  const handleQuickAddNode = (type: NodeType) => {
      if (!quickAddMenu) return;

      const newId = generateId();
      let w = DEFAULT_NODE_WIDTH;
      let h = DEFAULT_NODE_HEIGHT;

      if (type === NodeType.ORIGINAL_IMAGE) {
          h = 240;
      } else if (type === NodeType.TEXT_TO_VIDEO) {
          w = 400 * (16/9); h = 400;
      } else if (type === NodeType.TEXT_TO_IMAGE) {
          w = 400; h = 400;
      }

      const newNode: NodeData = {
          id: newId,
          type,
          x: quickAddMenu.worldX,
          y: quickAddMenu.worldY - h / 2,
          width: w,
          height: h,
          title: type === NodeType.TEXT_TO_IMAGE ? 'Text to Image' :
                 type === NodeType.TEXT_TO_VIDEO ? 'Text to Video' :
                 type === NodeType.CREATIVE_DESC ? 'Creative Description' : `Original Image_${Date.now()}`,
          aspectRatio: type === NodeType.TEXT_TO_VIDEO ? '16:9' : '1:1',
          model: type === NodeType.TEXT_TO_IMAGE ? 'BananaPro' : 
                 type === NodeType.TEXT_TO_VIDEO ? 'Sora2' : 'IMAGE',
          resolution: type === NodeType.TEXT_TO_VIDEO ? '720p' : '1k',
          duration: type === NodeType.TEXT_TO_VIDEO ? '5s' : undefined,
          count: 1,
          prompt: '',
          outputArtifacts: []
      };

      setNodes(prev => [...prev, newNode]);
      setConnections(prev => [...prev, { id: generateId(), sourceId: quickAddMenu.sourceId, targetId: newId }]);
      setQuickAddMenu(null);
  };

  const handleToolbarAction = (nodeId: string, actionId: string) => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      const newActiveItem = node.activeToolbarItem === actionId ? undefined : actionId;
      updateNodeData(nodeId, { activeToolbarItem: newActiveItem });

      if (newActiveItem === 'start_end') {
          const videoNode = node;
          const inputCount = connections.filter(c => c.targetId === nodeId).length;
          if (inputCount === 0) {
              const startNodeId = generateId();
              const endNodeId = generateId();
              const xOffset = 380;
              const yOffset = 260;
              const nodeWidth = 320;
              const nodeHeight = 240; 
              const startNode: NodeData = {
                  id: startNodeId, type: NodeType.ORIGINAL_IMAGE, x: videoNode.x - xOffset, y: videoNode.y, width: nodeWidth, height: nodeHeight, 
                  title: 'Start Frame', imageSrc: '', aspectRatio: '16:9', outputArtifacts: []
              };
              const endNode: NodeData = {
                  id: endNodeId, type: NodeType.ORIGINAL_IMAGE, x: videoNode.x - xOffset, y: videoNode.y + yOffset, width: nodeWidth, height: nodeHeight,
                  title: 'End Frame', imageSrc: '', aspectRatio: '16:9', outputArtifacts: []
              };
              setNodes(prev => [...prev, startNode, endNode]);
              setConnections(prev => [...prev, { id: generateId(), sourceId: startNodeId, targetId: nodeId }, { id: generateId(), sourceId: endNodeId, targetId: nodeId }]);
          }
      }
  };

  // Grouping Logic
  const handleGroupSelection = () => {
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
  };

  const handleUngroup = () => {
      if (selectedNodeIds.size !== 1) return;
      const groupId = Array.from(selectedNodeIds)[0];
      const groupNode = nodes.find(n => n.id === groupId);
      if (groupNode && groupNode.type === NodeType.GROUP) {
          setNodes(prev => prev.filter(n => n.id !== groupId));
          setSelectedNodeIds(new Set());
      }
  };

  const handleGroupColorChange = (color: string) => {
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
  };

  // Reset color picker visibility when selection changes
  useEffect(() => {
      setShowColorPicker(false);
  }, [selectedNodeIds]);

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || (activeElement as HTMLElement)?.isContentEditable;
    if (isInputFocused) return;

    const items = e.clipboardData?.items;
    let hasSystemMedia = false;
    const mousePos = lastMousePosRef.current;
    const worldPos = screenToWorld(mousePos.x, mousePos.y);

    if (items) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i] as DataTransferItem;
            if (item.type.indexOf('image') !== -1) {
                hasSystemMedia = true;
                const file = item.getAsFile();
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const img = new Image();
                        img.onload = () => {
                            const { width, height, ratio } = calculateImportDimensions(img.width, img.height);
                            const src = event.target?.result as string;
                            addNode(NodeType.ORIGINAL_IMAGE, worldPos.x, worldPos.y, {
                                width, height, imageSrc: src, aspectRatio: `${ratio}:1`, outputArtifacts: [src]
                            });
                        };
                        img.src = event.target?.result as string;
                    };
                    reader.readAsDataURL(file);
                }
            } else if (item.type.indexOf('video') !== -1) {
                hasSystemMedia = true;
                const file = item.getAsFile();
                if (file) {
                    const url = URL.createObjectURL(file);
                    const video = document.createElement('video');
                    video.preload = 'metadata';
                    video.onloadedmetadata = () => {
                         const { width, height, ratio } = calculateImportDimensions(video.videoWidth, video.videoHeight);
                         addNode(NodeType.ORIGINAL_IMAGE, worldPos.x, worldPos.y, {
                             width, height, videoSrc: url, title: file.name, aspectRatio: `${ratio}:1`, outputArtifacts: [url]
                         });
                    };
                    video.src = url;
                }
            }
        }
    }
    if (!hasSystemMedia && internalClipboard) performPaste(worldPos);
  }, [transform, internalClipboard]); 

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  useEffect(() => {
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
        if (e.code === 'Space') spacePressed.current = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') spacePressed.current = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedNodeIds, selectedConnectionId, previewMedia, contextMenu, nodes, connections, quickAddMenu, showNewWorkflowDialog, isSettingsOpen, handleAlign, nextGroupColor]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
        if (dragModeRef.current !== 'NONE') {
            setDragMode('NONE');
            setTempConnection(null);
            connectionStartRef.current = null;
            dragStartRef.current = { x: 0, y: 0 };
            setSuggestedNodes([]);
            setSelectionBox(null);
            // Clear dragging nodes ref on mouse up
            draggingNodesRef.current.clear();
        }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const updateNodeData = useCallback((id: string, updates: Partial<NodeData>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  }, []);

  const handleGenerate = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    updateNodeData(nodeId, { isLoading: true });
    
    const inputs = getInputImages(node.id);

    try {
      if (node.type === NodeType.CREATIVE_DESC) {
        const res = await generateCreativeDescription(node.prompt || '', node.model === 'TEXT_TO_VIDEO' ? 'VIDEO' : 'IMAGE');
        updateNodeData(nodeId, { optimizedPrompt: res, isLoading: false });
      } else {
          let results: string[] = [];
          if (node.type === NodeType.TEXT_TO_IMAGE) {
            results = await generateImage(
                node.prompt || '', node.aspectRatio, node.model, node.resolution, node.count || 1, inputs 
            );
          } else if (node.type === NodeType.TEXT_TO_VIDEO) {
            let effectiveModel = node.model;
            if (node.activeToolbarItem === 'start_end') {
                effectiveModel = (effectiveModel || '') + '_FL';
            }
            results = await generateVideo(
                node.prompt || '', inputs, node.aspectRatio, effectiveModel, node.resolution, node.duration, node.count || 1
            );
          }

          if (results.length > 0) {
              const currentArtifacts = node.outputArtifacts || [];
              if (node.imageSrc && !currentArtifacts.includes(node.imageSrc)) currentArtifacts.push(node.imageSrc);
              if (node.videoSrc && !currentArtifacts.includes(node.videoSrc)) currentArtifacts.push(node.videoSrc);
              const newArtifacts = [...results, ...currentArtifacts];
              
              const updates: Partial<NodeData> = { isLoading: false, outputArtifacts: newArtifacts };
              if (node.type === NodeType.TEXT_TO_IMAGE) updates.imageSrc = results[0];
              else if (node.type === NodeType.TEXT_TO_VIDEO) updates.videoSrc = results[0];
              updateNodeData(nodeId, updates);
          } else {
              throw new Error("No results returned");
          }
      }
    } catch (e) {
      console.error(e);
      alert(`Generation Failed: ${(e as Error).message}`);
      updateNodeData(nodeId, { isLoading: false });
    }
  };

  const handleMaximize = (nodeId: string) => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;
      if (node.videoSrc) setPreviewMedia({ url: node.videoSrc, type: 'video' });
      else if (node.imageSrc) setPreviewMedia({ url: node.imageSrc, type: 'image' });
      else alert("No content to preview.");
  };
  
  const handleHistoryPreview = (url: string, type: 'image' | 'video') => setPreviewMedia({ url, type });

  const copyImageToClipboard = async (nodeId: string) => {
      const node = nodes.find(n => n.id === nodeId);
      if (node && node.imageSrc) {
          try {
              const res = await fetch(node.imageSrc);
              const blob = await res.blob();
              await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob as Blob })]);
              alert("Image copied to clipboard");
          } catch (e) { console.error(e); alert("Failed to copy image"); }
      }
  };

  const triggerReplaceImage = (nodeId: string) => {
      nodeToReplaceRef.current = nodeId;
      replaceImageRef.current?.click();
  };

  const handleReplaceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const nodeId = nodeToReplaceRef.current;
      if (file && nodeId) {
           const reader = new FileReader();
           reader.onload = (event) => {
               const img = new Image();
               img.onload = () => {
                   const node = nodes.find(n => n.id === nodeId);
                   if (node) {
                        const { width, height, ratio } = calculateImportDimensions(img.width, img.height);
                        const src = event.target?.result as string;
                        const currentArtifacts = node.outputArtifacts || [];
                        const newArtifacts = [src, ...currentArtifacts];
                        updateNodeData(nodeId, { 
                            imageSrc: src, 
                            width, height,
                            aspectRatio: `${ratio}:1`, 
                            outputArtifacts: newArtifacts
                        });
                   }
               };
               img.src = event.target?.result as string;
           };
           reader.readAsDataURL(file);
      }
      if (replaceImageRef.current) replaceImageRef.current.value = '';
      nodeToReplaceRef.current = null;
  };

  const handleSaveWorkflow = () => {
    const workflowData = { nodes, connections, transform, version: "1.0" };
    const blob = new Blob([JSON.stringify(workflowData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `workflow-${Date.now()}.aistudio-flow`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleNewWorkflow = () => setShowNewWorkflowDialog(false); 
  
  const handleConfirmNew = (shouldSave: boolean) => {
    if (shouldSave) handleSaveWorkflow();
    const withContent = nodes.filter(n => n.imageSrc || n.videoSrc);
    if (withContent.length > 0) setDeletedNodes(prev => [...prev, ...withContent]);
    setNodes([]);
    setConnections([]);
    setTransform({ x: 0, y: 0, k: 1 });
    setShowNewWorkflowDialog(false);
    setSelectedNodeIds(new Set());
    setSelectionBox(null);
  };

  const handleLoadWorkflow = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target?.result as string);
            if (data.nodes && data.connections) {
                setNodes(data.nodes);
                setConnections(data.connections);
                if (data.transform) setTransform(data.transform);
            }
        } catch (err) { console.error(err); alert("Invalid workflow file"); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownload = async (nodeId: string) => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;
      const url = node.videoSrc || node.imageSrc;
      if (!url) { alert("No content to download."); return; }
      
      const ext = node.videoSrc ? 'mp4' : 'png';
      const filename = `${node.title.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;

      try {
          const response = await fetch(url);
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob as Blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
      } catch (e) {
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          link.target = "_blank"; 
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      }
  };

  const handleImportAsset = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
             const { width, height, ratio } = calculateImportDimensions(img.width, img.height);
             const src = event.target?.result as string;
             const rect = containerRef.current?.getBoundingClientRect();
             if (rect) {
                 const center = screenToWorld(rect.width / 2, rect.height / 2);
                 addNode(NodeType.ORIGINAL_IMAGE, center.x - width/2, center.y - height/2, {
                     width, height, imageSrc: src, aspectRatio: `${ratio}:1`, outputArtifacts: [src]
                 });
             }
        };
        img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      const files: File[] = Array.from(e.dataTransfer.files); 
      if (files.length === 0) return;
      const worldPos = screenToWorld(e.clientX, e.clientY);
      files.forEach((file, index) => {
          const offsetX = index * 20; const offsetY = index * 20;
          if (file.type.startsWith('image/')) {
              const reader = new FileReader();
              reader.onload = (event) => {
                  const src = event.target?.result as string;
                  const img = new Image();
                  img.onload = () => {
                       const { width, height, ratio } = calculateImportDimensions(img.width, img.height);
                       addNode(NodeType.ORIGINAL_IMAGE, worldPos.x - width/2 + offsetX, worldPos.y - height/2 + offsetY, {
                           width, height, imageSrc: src, aspectRatio: `${ratio}:1`, outputArtifacts: [src]
                       });
                  };
                  img.src = src;
              };
              reader.readAsDataURL(file);
          } else if (file.type.startsWith('video/')) {
              const url = URL.createObjectURL(file);
              const video = document.createElement('video');
              video.preload = 'metadata';
              video.onloadedmetadata = () => {
                  const { width, height, ratio } = calculateImportDimensions(video.videoWidth, video.videoHeight);
                  addNode(NodeType.ORIGINAL_IMAGE, worldPos.x - width/2 + offsetX, worldPos.y - height/2 + offsetY, {
                       width, height, videoSrc: url, title: file.name, aspectRatio: `${ratio}:1`, outputArtifacts: [url]
                   });
              };
              video.src = url;
          }
      });
  };

  const handleZoom = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newK = parseFloat(e.target.value);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = rect.width / 2;
      const mouseY = rect.height / 2;
      const worldX = (mouseX - transform.x) / transform.k;
      const worldY = (mouseY - transform.y) / transform.k;
      const newX = mouseX - worldX * newK;
      const newY = mouseY - worldY * newK;
      setTransform({ x: newX, y: newY, k: newK });
  };

  const handleResetZoom = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = rect.width / 2;
      const mouseY = rect.height / 2;
      const worldX = (mouseX - transform.x) / transform.k;
      const worldY = (mouseY - transform.y) / transform.k;
      const newX = mouseX - worldX * 1;
      const newY = mouseY - worldY * 1;
      setTransform({ x: newX, y: newY, k: 1 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
    const zoomIntensity = 0.1;
    const direction = e.deltaY > 0 ? -1 : 1;
    let newK = transform.k + direction * zoomIntensity;
    newK = Math.min(Math.max(0.4, newK), 2); 
    const rect = containerRef.current!.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - transform.x) / transform.k;
    const worldY = (e.clientY - rect.top - transform.y) / transform.k;
    setTransform({ x: (e.clientX - rect.left) - worldX * newK, y: (e.clientY - rect.top) - worldY * newK, k: newK });
  };

  // --- Touch Event Handlers for Mobile Pan/Zoom ---
  const handleTouchStart = (e: React.TouchEvent) => {
      // Don't interfere if touching a UI element that should handle its own events
      if ((e.target as HTMLElement).closest('button, input, .node-content')) return;

      if (e.touches.length === 1) {
          const touch = e.touches[0];
          dragStartRef.current = { x: touch.clientX, y: touch.clientY };
          initialTransformRef.current = { ...transform };
          setDragMode('PAN');
      } else if (e.touches.length === 2) {
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
          const centerX = (t1.clientX + t2.clientX) / 2;
          const centerY = (t1.clientY + t2.clientY) / 2;
          
          touchStartRef.current = { x: centerX, y: centerY, dist, centerX, centerY };
          initialTransformRef.current = { ...transform };
          setDragMode('NONE'); // Pinch isn't a drag mode in the traditional sense here
      }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (e.touches.length === 1) {
          if (dragMode === 'PAN') {
              const touch = e.touches[0];
              const dx = touch.clientX - dragStartRef.current.x;
              const dy = touch.clientY - dragStartRef.current.y;
              setTransform({
                  ...initialTransformRef.current,
                  x: initialTransformRef.current.x + dx,
                  y: initialTransformRef.current.y + dy
              });
          } else if (dragMode === 'DRAG_NODE') {
              const touch = e.touches[0];
              const dx = (touch.clientX - dragStartRef.current.x) / transform.k;
              const dy = (touch.clientY - dragStartRef.current.y) / transform.k;
              const movingNodeIds = draggingNodesRef.current;

              setNodes(prev => prev.map(n => { 
                  if (movingNodeIds.has(n.id)) { 
                      const initial = initialNodePositionsRef.current.find(init => init.id === n.id); 
                      if (initial) return { ...n, x: initial.x + dx, y: initial.y + dy }; 
                  } 
                  return n; 
              }));
          } else if (dragMode === 'CONNECT') {
               const touch = e.touches[0];
               const worldPos = screenToWorld(touch.clientX, touch.clientY);
               setTempConnection(worldPos);
          }
      } else if (e.touches.length === 2 && touchStartRef.current) {
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
          
          if (touchStartRef.current.dist > 0) {
              const scale = dist / touchStartRef.current.dist;
              let newK = initialTransformRef.current.k * scale;
              newK = Math.min(Math.max(0.4, newK), 2.5);

              const rect = containerRef.current!.getBoundingClientRect();
              const cx = touchStartRef.current.centerX - rect.left;
              const cy = touchStartRef.current.centerY - rect.top;

              const worldX = (cx - initialTransformRef.current.x) / initialTransformRef.current.k;
              const worldY = (cy - initialTransformRef.current.y) / initialTransformRef.current.k;

              const newX = cx - worldX * newK;
              const newY = cy - worldY * newK;

              setTransform({ x: newX, y: newY, k: newK });
          }
      }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      if (dragMode === 'CONNECT') {
          // Attempt to find drop target for connection
          const touch = e.changedTouches[0];
          const worldPos = screenToWorld(touch.clientX, touch.clientY);
          
          // Find target node geometrically
          const targetNode = nodes.find(n => 
              n.id !== connectionStartRef.current?.nodeId && 
              n.type !== NodeType.GROUP && 
              n.type !== NodeType.ORIGINAL_IMAGE && // Cannot connect TO original image usually (it is source)
              worldPos.x >= n.x && worldPos.x <= n.x + n.width &&
              worldPos.y >= n.y && worldPos.y <= n.y + n.height
          );
          
          if (targetNode) {
              createConnection(connectionStartRef.current!.nodeId, targetNode.id);
          } else if (connectionStartRef.current?.type === 'source') {
               setQuickAddMenu({ 
                   sourceId: connectionStartRef.current.nodeId, 
                   x: touch.clientX, 
                   y: touch.clientY, 
                   worldX: worldPos.x, 
                   worldY: worldPos.y 
               });
          }
      }

      setDragMode('NONE');
      touchStartRef.current = null;
      setTempConnection(null);
      connectionStartRef.current = null;
      setSuggestedNodes([]);
      draggingNodesRef.current.clear();
  };

  const handleNavigate = useCallback((x: number, y: number) => {
      setTransform(prev => ({ ...prev, x, y }));
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (contextMenu) setContextMenu(null);
    if (quickAddMenu) setQuickAddMenu(null);
    if (selectedConnectionId) setSelectedConnectionId(null);
    if (showColorPicker) setShowColorPicker(false);
    
    if (e.button === 1 || (e.button === 0 && spacePressed.current)) {
      setDragMode('PAN');
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      initialTransformRef.current = { ...transform };
      e.preventDefault(); return;
    }
    if (e.target === containerRef.current && e.button === 0) {
        setDragMode('SELECT');
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        setSelectionBox({ x: 0, y: 0, w: 0, h: 0 }); 
        if (!e.shiftKey) setSelectedNodeIds(new Set());
    }
  };

  const handleNodeTouchStart = (e: React.TouchEvent, id: string) => {
    // Check if touch target is in an excluded area (control panel, title, or interactive elements)
    const target = e.target as HTMLElement;
    
    // Exclude control panels (below node), titles (above node), and interactive elements
    const isExcluded = target.closest('[data-interactive="true"]') ||
                       target.closest('.absolute.top-full') ||  // Control panel below
                       target.closest('.absolute.bottom-full') || // Title/toolbar above
                       target.tagName === 'INPUT' || 
                       target.tagName === 'TEXTAREA' || 
                       target.tagName === 'BUTTON' ||
                       target.tagName === 'SELECT' ||
                       target.isContentEditable ||
                       target.closest('button') ||
                       target.closest('input') ||
                       target.closest('textarea') ||
                       target.closest('[contenteditable="true"]');
    
    // If touching an excluded area, don't start dragging - let the event pass through
    if (isExcluded) {
      // Don't call e.stopPropagation() here - let the event reach the interactive element
      return;
    }

    // Check if we're touching the main node content area (drag handle)
    const isDragHandle = target.closest('[data-drag-handle="true"]');
    
    // Only proceed if touching the drag handle (main node area)
    if (!isDragHandle) {
      return;
    }

    // Now we know we're starting a drag operation, stop propagation
    e.stopPropagation();
    if (contextMenu) setContextMenu(null);
    if (quickAddMenu) setQuickAddMenu(null);
    if (selectedConnectionId) setSelectedConnectionId(null);
    if (showColorPicker) setShowColorPicker(false);

    if (e.touches.length === 1) {
        setDragMode('DRAG_NODE');
        const touch = e.touches[0];
        dragStartRef.current = { x: touch.clientX, y: touch.clientY };
        
        // 1. Calculate Selection
        const isAlreadySelected = selectedNodeIds.has(id);
        let newSelection = new Set(selectedNodeIds);
        
        // Mobile: tap selects, tap another deselects previous (single select mostly, or additive?)
        // Let's mimic single select default, unless multiselect mode (future). 
        // For simplicity: tap always selects.
        if (!isAlreadySelected) { 
            newSelection.clear(); 
            newSelection.add(id); 
        }
        setSelectedNodeIds(newSelection);
        
        // 2. Determine Nodes to Drag (Same logic as Mouse)
        const nodesToDrag = new Set(newSelection);
        const groupIds = Array.from(newSelection).filter(nid => nodes.find(n => n.id === nid)?.type === NodeType.GROUP);
        
        if (groupIds.length > 0) {
            const idToIndex = new Map(nodes.map((n, i) => [n.id, i]));
            nodes.forEach(n => {
                if (nodesToDrag.has(n.id) || n.type === NodeType.GROUP) return; 
                for (const gid of groupIds) {
                    const group = nodes.find(g => g.id === gid);
                    if (group) {
                        const isInside = n.x >= group.x && n.x + n.width <= group.x + group.width && 
                                         n.y >= group.y && n.y + n.height <= group.y + group.height;
                        const groupIdx = idToIndex.get(gid)!;
                        const nodeIdx = idToIndex.get(n.id)!;
                        const isOnTop = nodeIdx > groupIdx;
                        if (isInside && isOnTop) {
                            nodesToDrag.add(n.id);
                            break;
                        }
                    }
                }
            });
        }
        draggingNodesRef.current = nodesToDrag;

        // 3. Reorder DOM
        setNodes(prev => {
            const movingNodes = prev.filter(n => nodesToDrag.has(n.id));
            const others = prev.filter(n => !nodesToDrag.has(n.id));
            movingNodes.sort((a, b) => {
                if (a.type === NodeType.GROUP && b.type !== NodeType.GROUP) return -1;
                if (a.type !== NodeType.GROUP && b.type === NodeType.GROUP) return 1;
                return 0;
            });
            return [...others, ...movingNodes];
        });

        if (newSelection.size === 1) {
            const node = nodes.find(n => n.id === id);
            if (node && node.type === NodeType.GROUP && node.color) {
                setNextGroupColor(node.color);
            }
        }

        initialNodePositionsRef.current = nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
    }
  };

  const handleConnectTouchStart = (e: React.TouchEvent, nodeId: string, type: 'source' | 'target') => {
    e.stopPropagation();
    if (e.touches.length === 1) {
        const touch = e.touches[0];
        connectionStartRef.current = { nodeId, type };
        setDragMode('CONNECT');
        setTempConnection(screenToWorld(touch.clientX, touch.clientY));
    }
  };

  const handleNodeTouchEnd = (e: React.TouchEvent, id: string) => {
    // Only handle selection if we didn't drag
    if (dragMode === 'NONE') {
      const target = e.target as HTMLElement;
      
      // Check if tap is on excluded area
      const isExcluded = target.closest('[data-interactive="true"]') ||
                         target.closest('.absolute.top-full') ||
                         target.closest('.absolute.bottom-full') ||
                         target.tagName === 'INPUT' || 
                         target.tagName === 'TEXTAREA' || 
                         target.tagName === 'BUTTON' ||
                         target.closest('button') ||
                         target.closest('input') ||
                         target.closest('textarea');
      
      if (!isExcluded) {
        // Check if we're on the drag handle (main node area)
        const isDragHandle = target.closest('[data-drag-handle="true"]');
        
        if (isDragHandle) {
          // Simple tap to select
          const isAlreadySelected = selectedNodeIds.has(id);
          if (!isAlreadySelected) {
            const newSelection = new Set<string>();
            newSelection.add(id);
            setSelectedNodeIds(newSelection);
          }
        }
      }
    }
  };

  const handleNodeClick = (e: React.MouseEvent, id: string) => {
    // Handle simple click to select (when not dragging)
    const target = e.target as HTMLElement;
    
    const isExcluded = target.closest('[data-interactive="true"]') ||
                       target.closest('.absolute.top-full') ||
                       target.closest('.absolute.bottom-full');
    
    if (!isExcluded) {
      const isAlreadySelected = selectedNodeIds.has(id);
      if (!isAlreadySelected && dragMode === 'NONE') {
        const newSelection = new Set<string>();
        newSelection.add(id);
        setSelectedNodeIds(newSelection);
      }
    }
  };

  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
    // Check if mouse target is in an excluded area
    const target = e.target as HTMLElement;
    
    // Exclude control panels, titles, and interactive elements
    const isExcluded = target.closest('[data-interactive="true"]') ||
                       target.closest('.absolute.top-full') ||
                       target.closest('.absolute.bottom-full') ||
                       target.tagName === 'INPUT' || 
                       target.tagName === 'TEXTAREA' || 
                       target.tagName === 'BUTTON' ||
                       target.tagName === 'SELECT' ||
                       target.isContentEditable ||
                       target.closest('button') ||
                       target.closest('input') ||
                       target.closest('textarea') ||
                       target.closest('[contenteditable="true"]');
    
    if (isExcluded) {
      return;
    }

    // Check if we're clicking the main node content area
    const isDragHandle = target.closest('[data-drag-handle="true"]');
    
    if (!isDragHandle) {
      return;
    }

    e.stopPropagation();
    if (contextMenu) setContextMenu(null);
    if (quickAddMenu) setQuickAddMenu(null);
    if (selectedConnectionId) setSelectedConnectionId(null);
    if (showColorPicker) setShowColorPicker(false);

    if (e.button === 0) {
        setDragMode('DRAG_NODE');
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        
        // 1. Calculate Selection
        const isAlreadySelected = selectedNodeIds.has(id);
        let newSelection = new Set(selectedNodeIds);
        
        if (e.shiftKey) { 
            isAlreadySelected ? newSelection.delete(id) : newSelection.add(id); 
        } else { 
            if (!isAlreadySelected) { 
                newSelection.clear(); 
                newSelection.add(id); 
            } 
        }
        setSelectedNodeIds(newSelection);
        
        // 2. Determine Nodes to Drag (Improved Logical Containment)
        // A node is dragged by a group ONLY if it is visually "on top" of that group (higher index).
        const nodesToDrag = new Set(newSelection);
        const groupIds = Array.from(newSelection).filter(nid => nodes.find(n => n.id === nid)?.type === NodeType.GROUP);
        
        if (groupIds.length > 0) {
            // Get mapping of ID to index for fast comparison
            const idToIndex = new Map(nodes.map((n, i) => [n.id, i]));
            
            nodes.forEach(n => {
                if (nodesToDrag.has(n.id) || n.type === NodeType.GROUP) return; 
                for (const gid of groupIds) {
                    const group = nodes.find(g => g.id === gid);
                    if (group) {
                        const isInside = n.x >= group.x && n.x + n.width <= group.x + group.width && 
                                         n.y >= group.y && n.y + n.height <= group.y + group.height;
                        
                        // Check if node is ON TOP of the group (index of node > index of group)
                        const groupIdx = idToIndex.get(gid)!;
                        const nodeIdx = idToIndex.get(n.id)!;
                        const isOnTop = nodeIdx > groupIdx;

                        if (isInside && isOnTop) {
                            nodesToDrag.add(n.id);
                            break;
                        }
                    }
                }
            });
        }
        draggingNodesRef.current = nodesToDrag;

        // 3. Reorder DOM (Bring Group + Children to top)
        setNodes(prev => {
            const movingNodes = prev.filter(n => nodesToDrag.has(n.id));
            const others = prev.filter(n => !nodesToDrag.has(n.id));
            
            movingNodes.sort((a, b) => {
                if (a.type === NodeType.GROUP && b.type !== NodeType.GROUP) return -1;
                if (a.type !== NodeType.GROUP && b.type === NodeType.GROUP) return 1;
                return 0;
            });

            return [...others, ...movingNodes];
        });

        if (newSelection.size === 1) {
            const node = nodes.find(n => n.id === id);
            if (node && node.type === NodeType.GROUP && node.color) {
                setNextGroupColor(node.color);
            }
        }

        initialNodePositionsRef.current = nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
    }
  };

  const handleNodeContextMenu = (e: React.MouseEvent, id: string, type: NodeType) => {
      e.stopPropagation(); e.preventDefault();
      const worldPos = screenToWorld(e.clientX, e.clientY);
      setContextMenu({ type: 'NODE', nodeId: id, nodeType: type, x: e.clientX, y: e.clientY, worldX: worldPos.x, worldY: worldPos.y });
      if (!selectedNodeIds.has(id)) setSelectedNodeIds(new Set([id]));
  };

  const handleCanvasContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      const worldPos = screenToWorld(e.clientX, e.clientY);
      setContextMenu({ type: 'CANVAS', x: e.clientX, y: e.clientY, worldX: worldPos.x, worldY: worldPos.y });
  };

  const handleResizeStart = (e: React.MouseEvent, nodeId: string, direction: string = 'SE') => {
      e.stopPropagation(); e.preventDefault();
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;
      setDragMode('RESIZE_NODE');
      dragStartRef.current = { 
          x: e.clientX, 
          y: e.clientY, 
          w: node.width, 
          h: node.height, 
          nodeId: nodeId, 
          initialNodeX: node.x,
          direction
      };
      setSelectedNodeIds(new Set([nodeId]));
  };

  const handleConnectStart = (e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => {
    e.stopPropagation(); e.preventDefault();
    connectionStartRef.current = { nodeId, type };
    setDragMode('CONNECT');
    setTempConnection(screenToWorld(e.clientX, e.clientY));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    const worldPos = screenToWorld(e.clientX, e.clientY);
    if (dragMode !== 'NONE' && e.buttons === 0) { setDragMode('NONE'); dragStartRef.current = { x: 0, y: 0 }; return; }
    if (dragMode === 'PAN') {
      setTransform({ ...initialTransformRef.current, x: initialTransformRef.current.x + (e.clientX - dragStartRef.current.x), y: initialTransformRef.current.y + (e.clientY - dragStartRef.current.y) });
    } else if (dragMode === 'DRAG_NODE') {
      const dx = (e.clientX - dragStartRef.current.x) / transform.k;
      const dy = (e.clientY - dragStartRef.current.y) / transform.k;
      const movingNodeIds = draggingNodesRef.current;

      setNodes(prev => prev.map(n => { 
          if (movingNodeIds.has(n.id)) { 
              const initial = initialNodePositionsRef.current.find(init => init.id === n.id); 
              if (initial) return { ...n, x: initial.x + dx, y: initial.y + dy }; 
          } 
          return n; 
      }));
    } else if (dragMode === 'SELECT') {
        const x = Math.min(dragStartRef.current.x, e.clientX);
        const y = Math.min(dragStartRef.current.y, e.clientY);
        const w = Math.abs(e.clientX - dragStartRef.current.x);
        const h = Math.abs(e.clientY - dragStartRef.current.y);
        setSelectionBox({ x: x - containerRef.current!.getBoundingClientRect().left, y: y - containerRef.current!.getBoundingClientRect().top, w, h });
        const worldStartX = (x - containerRef.current!.getBoundingClientRect().left - transform.x) / transform.k;
        const worldStartY = (y - containerRef.current!.getBoundingClientRect().top - transform.y) / transform.k;
        const worldWidth = w / transform.k; const worldHeight = h / transform.k;
        const newSelection = new Set<string>();
        nodes.forEach(n => { if (n.x < worldStartX + worldWidth && n.x + n.width > worldStartX && n.y < worldStartY + worldHeight && n.y + n.height > worldStartY) newSelection.add(n.id); });
        setSelectedNodeIds(newSelection);
    } else if (dragMode === 'CONNECT') {
        setTempConnection(worldPos);
        if (connectionStartRef.current?.type === 'source') {
            const candidates = nodes.filter(n => n.id !== connectionStartRef.current?.nodeId).filter(n => n.type !== NodeType.ORIGINAL_IMAGE && n.type !== NodeType.GROUP)
                .map(n => ({ node: n, dist: Math.sqrt(Math.pow(worldPos.x - (n.x + n.width/2), 2) + Math.pow(worldPos.y - (n.y + n.height/2), 2)) }))
                .filter(item => item.dist < 500).sort((a, b) => a.dist - b.dist).slice(0, 3).map(item => item.node);
            setSuggestedNodes(candidates);
        }
    } else if (dragMode === 'RESIZE_NODE') {
        const nodeId = dragStartRef.current.nodeId;
        const node = nodes.find(n => n.id === nodeId);
        const direction = dragStartRef.current.direction || 'SE';

        if (node) {
            const dx = (e.clientX - dragStartRef.current.x) / transform.k;
            const dy = (e.clientY - dragStartRef.current.y) / transform.k; 

            if (node.type === NodeType.GROUP) {
                let newW = (dragStartRef.current.w || 0);
                let newH = (dragStartRef.current.h || 0);
                let newX = node.x;

                if (direction === 'SE') {
                    newW = Math.max(100, newW + dx);
                    newH = Math.max(100, newH + dy);
                } else if (direction === 'E') {
                    newW = Math.max(100, newW + dx);
                } else if (direction === 'W') {
                    const potentialW = Math.max(100, (dragStartRef.current.w || 0) - dx);
                    newW = potentialW;
                    newX = (dragStartRef.current.initialNodeX || 0) + ((dragStartRef.current.w || 0) - newW);
                }

                setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, width: newW, height: newH, x: newX } : n));
            } else {
                let ratio = 1.33; 
                if (node.aspectRatio) { const [w, h] = node.aspectRatio.split(':').map(Number); if (!isNaN(w) && !isNaN(h) && h !== 0) ratio = w / h; } 
                else if (node.type === NodeType.ORIGINAL_IMAGE) { ratio = (dragStartRef.current.w || 1) / (dragStartRef.current.h || 1); }
                let minWidth = 150;
                if (node.type !== NodeType.CREATIVE_DESC) {
                    const limit1 = ratio >= 1 ? 400 * ratio : 400;
                    minWidth = Math.max(limit1, 400); 
                } else minWidth = 280;
                let newWidth = Math.max(minWidth, (dragStartRef.current.w || 0) + dx);
                setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, width: newWidth, height: newWidth / ratio } : n));
            }
        }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (dragMode === 'CONNECT' && connectionStartRef.current?.type === 'source') {
         setQuickAddMenu({ sourceId: connectionStartRef.current.nodeId, x: e.clientX, y: e.clientY, worldX: screenToWorld(e.clientX, e.clientY).x, worldY: screenToWorld(e.clientX, e.clientY).y });
    }
    if (dragMode !== 'NONE') { 
        setDragMode('NONE'); 
        setTempConnection(null); 
        connectionStartRef.current = null; 
        setSuggestedNodes([]); 
        setSelectionBox(null);
        draggingNodesRef.current.clear();
    }
  };

  const createConnection = (sourceId: string, targetId: string) => {
      if (!connections.some(c => c.sourceId === sourceId && c.targetId === targetId)) setConnections(prev => [...prev, { id: generateId(), sourceId, targetId }]);
      setDragMode('NONE'); setTempConnection(null); connectionStartRef.current = null; setSuggestedNodes([]);
  };

  const handlePortMouseUp = (e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => {
      e.stopPropagation(); e.preventDefault();
      if (dragMode === 'CONNECT' && connectionStartRef.current && connectionStartRef.current.type === 'source' && type === 'target' && connectionStartRef.current.nodeId !== nodeId) createConnection(connectionStartRef.current.nodeId, nodeId);
  };

  const deleteNode = (id: string) => {
      const node = nodes.find(n => n.id === id);
      if (node && (node.imageSrc || node.videoSrc)) setDeletedNodes(prev => [...prev, node]);
      setNodes(prev => prev.filter(n => n.id !== id));
      setConnections(prev => prev.filter(c => c.sourceId !== id && c.targetId !== id));
  };

  const removeConnection = (id: string) => { setConnections(prev => prev.filter(c => c.id !== id)); setSelectedConnectionId(null); };

  // Calculate Selection Center for Group Toolbar
  const getSelectionCenter = () => {
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
  };

  const renderGroupToolbar = () => {
      const isMultiSelect = selectedNodeIds.size > 1;
      const singleGroupSelected = selectedNodeIds.size === 1 && nodes.find(n => n.id === Array.from(selectedNodeIds)[0])?.type === NodeType.GROUP;
      
      if (!isMultiSelect && !singleGroupSelected) return null;

      const pos = getSelectionCenter();
      if (!pos) return null;

      const currentColor = nextGroupColor;

      // Centered toolbar logic using translateX
      return (
          <div className="absolute z-[150] flex flex-col items-center pointer-events-none" style={{ left: pos.x, top: pos.y - 60, transform: 'translateX(-50%)' }}>
              <div className={`pointer-events-auto flex items-center p-1.5 rounded-xl shadow-xl backdrop-blur-md border animate-in fade-in zoom-in-95 duration-200 relative ${isDark ? 'bg-[#1A1D21]/90 border-zinc-700' : 'bg-white/90 border-gray-200'}`}>
                  
                  <div className="relative border-r border-gray-500/20 pr-1.5 mr-1.5">
                      <button 
                          className={`w-6 h-6 rounded-md border flex items-center justify-center transition-transform hover:scale-105 ${isDark ? 'border-white/10' : 'border-black/5'}`}
                          style={{ backgroundColor: currentColor }}
                          onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }}
                          title="Select Color"
                      >
                          {showColorPicker ? <Icons.ChevronLeft size={12} className="text-black/50 rotate-90"/> : null}
                      </button>

                      {showColorPicker && (
                          <div className={`absolute top-full left-0 mt-2 p-2 rounded-xl shadow-2xl border grid grid-cols-4 gap-1.5 z-50 min-w-[120px] ${isDark ? 'bg-[#1A1D21] border-zinc-700' : 'bg-white border-gray-200'}`}>
                              {GROUP_COLORS.map(color => (
                                  <button
                                      key={color}
                                      className={`w-5 h-5 rounded-full border transition-transform hover:scale-125 ${isDark ? 'border-white/10' : 'border-black/5'} ${color === currentColor ? 'ring-2 ring-cyan-500 ring-offset-1 ring-offset-black/20' : ''}`}
                                      style={{ backgroundColor: color }}
                                      onClick={(e) => { e.stopPropagation(); handleGroupColorChange(color); }}
                                  />
                              ))}
                          </div>
                      )}
                  </div>

                  {singleGroupSelected ? (
                      <button onClick={handleUngroup} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                          <Icons.LayoutGrid size={14}/> Ungroup
                      </button>
                  ) : (
                      <button onClick={handleGroupSelection} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${isDark ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-cyan-500 hover:bg-cyan-400 text-white'}`}>
                          <Icons.LayoutGrid size={14}/> Group
                      </button>
                  )}
              </div>
          </div>
      );
  };

  const renderNewWorkflowDialog = () => {
      if (!showNewWorkflowDialog) return null;
      return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowNewWorkflowDialog(false)}>
            <div className={`w-[400px] p-6 rounded-2xl shadow-2xl border flex flex-col gap-4 transform transition-all scale-100 ${isDark ? 'bg-[#1A1D21] border-zinc-700 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`} onClick={(e) => e.stopPropagation()}>
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2"><Icons.FilePlus size={20} className="text-cyan-500"/>Create New Workflow</h3>
                    <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Do you want to save your current workflow before creating a new one? <br/>Any unsaved changes will be permanently lost.</p>
                </div>
                <div className={`flex justify-end gap-2 mt-2 pt-4 border-t ${isDark ? 'border-zinc-800' : 'border-gray-100'}`}>
                    <button onClick={() => setShowNewWorkflowDialog(false)} className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${isDark ? 'hover:bg-zinc-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}>Cancel</button>
                    <button onClick={() => handleConfirmNew(false)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${isDark ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'}`}>Don't Save</button>
                    <button onClick={() => handleConfirmNew(true)} className={`px-4 py-2 rounded-lg text-xs font-bold text-white transition-colors shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 ${isDark ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-cyan-500 hover:bg-cyan-400'}`}><Icons.Save size={14}/>Save & New</button>
                </div>
            </div>
        </div>
      );
  };

  const renderContextMenu = () => {
    if (!contextMenu) return null;
    return (
        <div className={`fixed z-50 border rounded-lg shadow-2xl py-1 min-w-[160px] flex flex-col ${isDark ? 'bg-[#1A1D21] border-zinc-700' : 'bg-white border-gray-200'}`} style={{ left: contextMenu.x, top: contextMenu.y }} onMouseDown={(e) => e.stopPropagation()}>
            {contextMenu.type === 'NODE' && contextMenu.nodeId && (
                <>
                    {contextMenu.nodeType === NodeType.GROUP ? (
                        <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => { handleUngroup(); setContextMenu(null); }}><Icons.LayoutGrid size={14}/> Ungroup</button>
                    ) : (
                        <>
                            <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => { performCopy(); setContextMenu(null); }}><Icons.Copy size={14}/> Copy</button>
                            {contextMenu.nodeType === NodeType.ORIGINAL_IMAGE && <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => { triggerReplaceImage(contextMenu.nodeId!); setContextMenu(null); }}><Icons.Upload size={14}/> Replace Image</button>}
                            <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => { if (contextMenu.nodeId) copyImageToClipboard(contextMenu.nodeId); setContextMenu(null); }}><Icons.Image size={14}/> Copy Image Data</button>
                        </>
                    )}
                    <div className={`h-px my-1 ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`}></div>
                    <button className={`text-left px-3 py-2 text-xs text-red-400 transition-colors flex items-center gap-2 ${isDark ? 'hover:bg-zinc-800 hover:text-red-300' : 'hover:bg-red-50 hover:text-red-600'}`} onClick={() => { if (contextMenu.nodeId) deleteNode(contextMenu.nodeId); setContextMenu(null); }}><Icons.Trash2 size={14}/> Delete</button>
                </>
            )}
            {contextMenu.type === 'CANVAS' && (
                <>
                     <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => { performPaste({ x: contextMenu.worldX, y: contextMenu.worldY }); setContextMenu(null); }} disabled={!internalClipboard}><Icons.Copy size={14}/> Paste</button>
                    <div className={`h-px my-1 ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`}></div>
                    <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => { addNode(NodeType.TEXT_TO_IMAGE, contextMenu.worldX, contextMenu.worldY); setContextMenu(null); }}><Icons.Image size={14}/> Add Text to Image</button>
                    <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => { addNode(NodeType.TEXT_TO_VIDEO, contextMenu.worldX, contextMenu.worldY); setContextMenu(null); }}><Icons.Video size={14}/> Add Text to Video</button>
                </>
            )}
        </div>
    );
  };

  const renderQuickAddMenu = () => {
    if (!quickAddMenu) return null;
    return (
        <div className={`fixed z-50 border rounded-lg shadow-2xl py-1 min-w-[160px] flex flex-col animate-in fade-in zoom-in-95 duration-100 ${isDark ? 'bg-[#1A1D21] border-zinc-700' : 'bg-white border-gray-200'}`} style={{ left: quickAddMenu.x, top: quickAddMenu.y }} onMouseDown={(e) => e.stopPropagation()}>
            <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b mb-1 ${isDark ? 'text-gray-500 border-zinc-800' : 'text-gray-400 border-gray-100'}`}>Add Node</div>
            <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => handleQuickAddNode(NodeType.TEXT_TO_IMAGE)}><Icons.Image size={14} className="text-cyan-400"/> Text to Image</button>
            <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => handleQuickAddNode(NodeType.TEXT_TO_VIDEO)}><Icons.Video size={14} className="text-cyan-400"/> Text to Video</button>
            <button className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${isDark ? 'text-gray-300 hover:bg-zinc-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`} onClick={() => handleQuickAddNode(NodeType.CREATIVE_DESC)}><Icons.FileText size={14} className="text-cyan-400"/> Creative Desc</button>
        </div>
    );
  };

  const toggleTheme = (dark: boolean) => {
      setCanvasBg(dark ? '#0B0C0E' : '#F5F7FA');
  };

  return (
    <div className="w-full h-screen overflow-hidden flex relative font-sans text-gray-800">
        <ThemeSwitcher isDark={isDark} onToggle={toggleTheme} />
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} isDark={isDark} />

        <Sidebar 
          onAddNode={addNode} 
          onSaveWorkflow={handleSaveWorkflow}
          onLoadWorkflow={() => workflowInputRef.current?.click()}
          onNewWorkflow={() => setShowNewWorkflowDialog(true)}
          onImportAsset={() => assetInputRef.current?.click()}
          onOpenSettings={() => setIsSettingsOpen(true)} 
          onUpdateCanvasBg={setCanvasBg}
          nodes={[...nodes, ...deletedNodes]}
          onPreviewMedia={handleHistoryPreview}
          isDark={isDark}
        />
        <input type="file" ref={workflowInputRef} hidden accept=".aistudio-flow,.json" onChange={handleLoadWorkflow} />
        <input type="file" ref={assetInputRef} hidden accept="image/*" onChange={handleImportAsset} />
        <input type="file" ref={replaceImageRef} hidden accept="image/*" onChange={handleReplaceImage} />
        <div 
            ref={containerRef}
            className={`flex-1 w-full h-full relative grid-pattern select-none ${dragMode === 'PAN' ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ 
                backgroundColor: canvasBg,
                '--grid-color': isDark ? '#27272a' : '#E4E4E7'
            } as React.CSSProperties}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            // Touch Events
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onContextMenu={handleCanvasContextMenu}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-0">
                <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
                    {connections.map(conn => {
                        const source = nodes.find(n => n.id === conn.sourceId);
                        const target = nodes.find(n => n.id === conn.targetId);
                        if (!source || !target) return null;
                        const sx = source.x + source.width;
                        const sy = source.y + source.height / 2;
                        const tx = target.x;
                        const ty = target.y + target.height / 2;
                        const dist = Math.abs(tx - sx);
                        const cp = Math.min(80, Math.max(24, dist / 2));
                        const d = `M ${sx} ${sy} C ${sx + cp} ${sy}, ${tx - cp} ${ty}, ${tx} ${ty}`;
                        const isSelected = selectedConnectionId === conn.id;
                        return (
                            <g key={conn.id} className="pointer-events-auto cursor-pointer group" onClick={(e) => { e.stopPropagation(); setSelectedConnectionId(conn.id); }}>
                                <path d={d} stroke={isSelected ? (isDark ? "#ffffff" : "#000000") : (isDark ? "#52525b" : "#a1a1aa")} strokeWidth={2} fill="none" className="transition-colors duration-200 group-hover:stroke-cyan-500" />
                                <path d={d} stroke="transparent" strokeWidth={20} fill="none" />
                                <foreignObject x={(sx+tx)/2 - 12} y={(sy+ty)/2 - 12} width={24} height={24} className={`overflow-visible pointer-events-auto transition-opacity duration-200 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                    <button className={`w-6 h-6 flex items-center justify-center border rounded-full transition-all shadow-md focus:outline-none ${isDark ? 'bg-[#1A1D21] border-zinc-600 text-zinc-400 hover:text-red-500 hover:border-red-500' : 'bg-white border-gray-300 text-gray-400 hover:text-red-600 hover:border-red-600'}`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); removeConnection(conn.id); }} title="Disconnect"><Icons.Scissors size={14}/></button>
                                </foreignObject>
                            </g>
                        );
                    })}
                    {dragMode === 'CONNECT' && connectionStartRef.current && tempConnection && (
                        <path d={`M ${nodes.find(n => n.id === connectionStartRef.current?.nodeId)!.x + nodes.find(n => n.id === connectionStartRef.current?.nodeId)!.width} ${nodes.find(n => n.id === connectionStartRef.current?.nodeId)!.y + nodes.find(n => n.id === connectionStartRef.current?.nodeId)!.height/2} L ${tempConnection.x} ${tempConnection.y}`} stroke={isDark ? "#52525b" : "#a1a1aa"} strokeWidth={2} strokeDasharray="5,5" fill="none"/>
                    )}
                </g>
            </svg>

            <div className="absolute origin-top-left will-change-transform" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}>
                {nodes.map(node => (
                    <BaseNode
                        key={node.id}
                        data={node}
                        selected={selectedNodeIds.has(node.id)}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        onClick={(e) => handleNodeClick(e, node.id)}
                        onTouchStart={(e) => handleNodeTouchStart(e, node.id)}
                        onTouchEnd={(e) => handleNodeTouchEnd(e, node.id)}
                        onContextMenu={(e) => handleNodeContextMenu(e, node.id, node.type)}
                        onConnectStart={(e, type) => handleConnectStart(e, node.id, type)}
                        onConnectTouchStart={(e, type) => handleConnectTouchStart(e, node.id, type)}
                        onPortMouseUp={handlePortMouseUp}
                        onResizeStart={(e, direction) => handleResizeStart(e, node.id, direction)}
                        scale={transform.k}
                        isDark={isDark}
                    >
                        <NodeContent 
                            data={node} 
                            updateData={updateNodeData} 
                            onGenerate={handleGenerate} 
                            selected={selectedNodeIds.has(node.id)}
                            showControls={selectedNodeIds.size === 1}
                            inputs={getInputImages(node.id)}
                            onMaximize={handleMaximize}
                            onDownload={handleDownload}
                            onToolbarAction={handleToolbarAction}
                            onUpload={triggerReplaceImage}
                            isSelecting={dragMode === 'SELECT'}
                            onDelete={deleteNode}
                            isDark={isDark}
                        />
                    </BaseNode>
                ))}
            </div>

            {renderGroupToolbar()}

            {dragMode === 'CONNECT' && suggestedNodes.length > 0 && lastMousePosRef.current && (
                <div className={`fixed z-50 border rounded-xl shadow-2xl p-2 flex flex-col gap-1 w-48 pointer-events-auto ${isDark ? 'bg-[#1A1D21] border-zinc-700' : 'bg-white border-gray-200'}`} style={{ left: lastMousePosRef.current.x + 20, top: lastMousePosRef.current.y }}>
                    <div className={`text-[10px] uppercase font-bold px-2 py-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Quick Connect</div>
                    {suggestedNodes.map(node => (
                        <button key={node.id} className={`flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${isDark ? 'hover:bg-zinc-800 text-gray-300 hover:text-cyan-400' : 'hover:bg-gray-100 text-gray-700 hover:text-cyan-600'}`} onClick={(e) => { e.stopPropagation(); createConnection(connectionStartRef.current!.nodeId, node.id); }}>
                            {node.type === NodeType.TEXT_TO_VIDEO ? <Icons.Video size={12} /> : <Icons.Image size={12} />}<span className="truncate">{node.title}</span>
                        </button>
                    ))}
                </div>
            )}
            {dragMode === 'SELECT' && selectionBox && (
                <div className="fixed border border-cyan-500/50 bg-cyan-500/10 pointer-events-none z-50" style={{ left: containerRef.current!.getBoundingClientRect().left + selectionBox.x, top: containerRef.current!.getBoundingClientRect().top + selectionBox.y, width: selectionBox.w, height: selectionBox.h }}/>
            )}
            
            <div className="absolute bottom-24 right-6 md:bottom-6 flex flex-col items-end gap-3 z-[100] pointer-events-none transition-all duration-300">
                {showMinimap && (
                    <div className="pointer-events-auto hidden md:block">
                        <Minimap nodes={nodes} transform={transform} viewportSize={viewportSize} isDark={isDark} onNavigate={handleNavigate} />
                    </div>
                )}

                <div className={`flex items-center gap-3 px-3 py-1.5 rounded-full shadow-lg pointer-events-auto border backdrop-blur-md ${isDark ? 'bg-[#1A1D21]/90 border-zinc-700 text-gray-300' : 'bg-white/90 border-gray-200 text-gray-600'}`}>
                    <button 
                        onClick={() => setShowMinimap(!showMinimap)}
                        className={`hidden md:block p-1 rounded-full transition-colors ${isDark ? 'hover:bg-zinc-700 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-black'} ${showMinimap ? (isDark ? 'text-cyan-400' : 'text-cyan-600') : ''}`}
                        title={showMinimap ? "Hide Minimap" : "Show Minimap"}
                    >
                        <Icons.Map size={16} />
                    </button>
                    
                    <div className={`hidden md:block w-px h-4 ${isDark ? 'bg-zinc-700' : 'bg-gray-300'}`}></div>

                    <input 
                        type="range" 
                        min="0.4" 
                        max="2.0" 
                        step="0.1" 
                        value={transform.k} 
                        onChange={handleZoom} 
                        className="w-24 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <div className="flex items-center gap-2 border-l pl-3 border-gray-500/20">
                        <span className="text-xs font-mono min-w-[36px]">{Math.round(transform.k * 100)}%</span>
                        <button 
                            onClick={handleResetZoom} 
                            className={`p-1 rounded-full transition-colors ${isDark ? 'hover:bg-zinc-700 hover:text-white' : 'hover:bg-gray-100 hover:text-black'}`}
                            title="Reset Zoom"
                        >
                            <Icons.Maximize2 size={12} />
                        </button>
                    </div>
                </div>
            </div>

            {renderContextMenu()}
            {renderQuickAddMenu()}
            {renderNewWorkflowDialog()}
            {previewMedia && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setPreviewMedia(null)}>
                    <div className="relative max-w-[90vw] max-h-[90vh] bg-black rounded-lg shadow-2xl overflow-hidden border border-zinc-700" onClick={(e) => e.stopPropagation()}>
                         <button className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full hover:bg-red-500 transition-colors z-10" onClick={() => setPreviewMedia(null)}><Icons.X size={20} /></button>
                         {previewMedia.type === 'video' ? <video src={previewMedia.url} controls autoPlay className="max-w-full max-h-[90vh]" /> : <img src={previewMedia.url} alt="Preview" className="max-w-full max-h-[90vh] object-contain" />}
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

export default App;
