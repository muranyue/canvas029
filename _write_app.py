#!/usr/bin/env python3
"""Writes the refactored App.tsx"""

content = r'''import React, { useRef, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import { NodeData, CanvasTransform, Point, NodeType } from './types';
import BaseNode from './components/Nodes/BaseNode';
import { NodeContent } from './components/Nodes/NodeContent';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { SettingsModal } from './components/Settings/SettingsModal';
import { ContextMenu } from './components/ContextMenu';
import { QuickAddMenu } from './components/QuickAddMenu';
import { NewWorkflowDialog } from './components/NewWorkflowDialog';
import { GroupToolbar } from './components/GroupToolbar';
import { PreviewModal } from './components/PreviewModal';
import { ConnectionsLayer } from './components/ConnectionsLayer';
import { ZoomControls } from './components/ZoomControls';
import { QuickConnectSuggestions } from './components/QuickConnectSuggestions';
import {
    useCanvasState,
    useNodeOperations,
    useConnectionManager,
    useClipboard,
    useKeyboardShortcuts,
    useGrouping,
    calculateImportDimensions,
} from './hooks';

const App: React.FC = () => {
    return <CanvasWithSidebar />;
};
'''

with open('App.tsx', 'w') as f:
    f.write(content)
print(f"Part 1 written ({len(content)} chars)")
