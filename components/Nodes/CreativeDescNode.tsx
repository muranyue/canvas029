import React from 'react';
import { NodeData } from '../../types';
import { Icons } from '../Icons';
import { EditableTitle } from './Shared/NodeComponents';

interface CreativeDescNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string) => void;
  selected?: boolean;
  showControls?: boolean;
  isDark?: boolean;
}

export const CreativeDescNode: React.FC<CreativeDescNodeProps> = ({
    data, updateData, onGenerate, selected, showControls, isDark = true
}) => {
    const isSelectedAndStable = selected;

    const containerBg = isDark ? 'bg-[#18181B]' : 'bg-white';
    const containerBorder = selected 
        ? 'border-cyan-500 shadow-[0_0_0_1px_rgba(6,182,212,1)]' 
        : (isDark ? 'border-zinc-800' : 'border-gray-200');
    const controlPanelBg = isDark ? 'bg-[#18181B] border-zinc-700/80' : 'bg-white border-gray-200';
    const inputBg = isDark ? 'bg-zinc-900/50 hover:bg-zinc-900 border-transparent focus:border-zinc-700/50 text-zinc-200 placeholder-zinc-600' : 'bg-gray-50 hover:bg-gray-100 border-gray-200 focus:border-gray-300 text-gray-900 placeholder-gray-400';

    return (
        <>
          <div className="absolute bottom-full left-0 w-full mb-2 flex items-center justify-between"><EditableTitle title={data.title} onUpdate={(t) => updateData(data.id, { title: t })} isDark={isDark} /></div>
          <div className={`w-full h-full border rounded-xl p-4 flex flex-col shadow-xl ${containerBg} ${containerBorder}`}>
              <div className={`flex items-center gap-2 text-xs mb-3 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}><div className="p-1.5 bg-cyan-500/10 rounded-md"><Icons.Wand2 size={14} className="text-cyan-400"/></div><span className="uppercase font-bold tracking-wider text-[10px]">Creative Assistant</span></div>
              <textarea className={`w-full flex-1 border rounded-lg p-3 text-[10px] leading-relaxed resize-none focus:outline-none transition-colors no-scrollbar ${inputBg}`} placeholder="Enter your initial idea here..." value={data.prompt || ''} onChange={(e) => updateData(data.id, { prompt: e.target.value })} onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} onTouchEnd={(e) => { e.stopPropagation(); (e.target as HTMLTextAreaElement).focus(); }} data-interactive="true" />
              <button onClick={() => onGenerate(data.id)} className="mt-3 w-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-2 border border-cyan-500/20 transition-all" data-interactive="true">
                  {data.isLoading ? <Icons.Loader2 className="animate-spin" size={12}/> : 'Optimize Prompt'}
              </button>
              {data.optimizedPrompt && isSelectedAndStable && showControls && (
                  <div className={`absolute top-full left-0 w-full mt-3 border rounded-xl p-4 text-xs z-[70] shadow-2xl animate-in slide-in-from-top-2 duration-200 ${controlPanelBg} ${isDark ? 'text-gray-300' : 'text-gray-700'}`} onTouchStart={(e) => e.stopPropagation()} data-interactive="true">
                      <div className="text-[10px] text-gray-500 uppercase font-bold mb-2">Optimized Result</div>
                      <div className="leading-relaxed">{data.optimizedPrompt}</div>
                  </div>
              )}
          </div>
        </>
    );
};
