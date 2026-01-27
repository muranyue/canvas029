
import React from 'react';
import { NodeData } from '../../types';
import { LocalEditableTitle } from './Shared/LocalNodeComponents';

interface GroupNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  selected?: boolean;
  isDark?: boolean;
}

export const GroupNode: React.FC<GroupNodeProps> = ({
    data, updateData, selected, isDark = true
}) => {
    // Background color is now handled by BaseNode to ensure correct z-index layering and immediate updates.
    // We only handle the border here for selection visualization.
    const borderColor = selected ? 'border-cyan-500/50' : 'border-transparent';

    return (
        <div 
            className={`w-full h-full rounded-2xl transition-colors duration-200 border-2 ${borderColor} flex flex-col`}
            style={{ backgroundColor: 'transparent' }} 
        >
            {/* Title moved outside and above */}
            <div className="absolute -top-8 left-0 w-full px-1">
               <LocalEditableTitle 
                   title={data.title} 
                   onUpdate={(t) => updateData(data.id, { title: t })} 
                   isDark={isDark} 
               />
            </div>
        </div>
    );
};
