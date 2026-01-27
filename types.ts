
export enum NodeType {
  TEXT_TO_IMAGE = 'TEXT_TO_IMAGE',
  TEXT_TO_VIDEO = 'TEXT_TO_VIDEO',
  CREATIVE_DESC = 'CREATIVE_DESC',
  ORIGINAL_IMAGE = 'ORIGINAL_IMAGE',
  GROUP = 'GROUP',
}

export interface NodeData {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  
  // State
  prompt?: string;
  imageSrc?: string; // Result or Input (Active Selection)
  videoSrc?: string; // Result (Active Selection)
  outputArtifacts?: string[]; // History/Batch results
  isLoading?: boolean;
  isStackOpen?: boolean; // UI State for expanded gallery
  
  // Configs
  aspectRatio?: string;
  resolution?: string;
  duration?: string; // Video duration (5s, 10s, 15s)
  count?: number;
  model?: string;
  promptOptimize?: boolean; // Prompt Extension/Optimization switch
  
  // Creative Desc specific
  optimizedPrompt?: string;

  // UI State
  activeToolbarItem?: string;
  
  // Group Styling
  color?: string;
}

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface CanvasTransform {
  x: number;
  y: number;
  k: number; // Scale
}

export type DragMode = 'NONE' | 'PAN' | 'DRAG_NODE' | 'SELECT' | 'CONNECT' | 'RESIZE_NODE';

export interface Point {
  x: number;
  y: number;
}
