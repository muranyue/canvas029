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
    const groupColor = data.color || (isDark ? '#27272a' : '#F8C8DC');
    
    return (
        <div className="w-full h-full flex flex-col relative">
            <div className="absolute bottom-full left-0 mb-2 flex items-center pointer-events-auto">
                <LocalEditableTitle 
                    title={data.title} 
                    onUpdate={(t) => updateData(data.id, { title: t })} 
                    isDark={isDark} 
                />
            </div>

            {selected && (
                <div className="absolute -inset-[3px] pointer-events-none rounded-xl border-2 border-cyan-500 z-40 opacity-100 animate-in fade-in duration-200 shadow-[0_0_15px_rgba(6,182,212,0.3)]"></div>
            )}

            <div 
                className={`w-full h-full rounded-xl border-2 transition-all duration-300 ${isDark ? 'border-zinc-700/30' : 'border-gray-300/50'}`}
                style={{ 
                    backgroundColor: groupColor,
                    opacity: isDark ? 0.15 : 0.4
                }}
            >
                <div className={`absolute top-3 right-3 opacity-20 ${isDark ? 'text-white' : 'text-black'}`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="3" y1="9" x2="21" y2="9"></line>
                        <line x1="9" y1="21" x2="9" y2="9"></line>
                    </svg>
                </div>
            </div>
        </div>
    );
};
