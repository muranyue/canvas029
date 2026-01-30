
import React, { useState, useEffect, useCallback } from 'react';
import { NodeData } from '../../types';
import { Icons } from '../Icons';
import { getModelConfig, MODEL_REGISTRY } from '../../services/geminiService';
import { IMAGE_HANDLERS } from '../../services/mode/image/configurations';
import { LocalEditableTitle, LocalCustomDropdown, LocalInputThumbnails, LocalMediaStack, LoadingOverlay } from './Shared/LocalNodeComponents';

interface TextToImageNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string) => void;
  selected?: boolean;
  showControls?: boolean;
  inputs?: string[];
  onMaximize?: (id: string) => void;
  onDownload?: (id: string) => void;
  isDark?: boolean;
  isSelecting?: boolean;
}

export const TextToImageNode: React.FC<TextToImageNodeProps> = ({
    data, updateData, onGenerate, selected, showControls, inputs = [], onMaximize, onDownload, isDark = true, isSelecting
}) => {
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [deferredInputs, setDeferredInputs] = useState(false);
    const [isConfigured, setIsConfigured] = useState(true);
    const [imageModels, setImageModels] = useState<string[]>([]);

    const isSelectedAndStable = selected && !isSelecting;

    const checkConfig = useCallback(() => {
         const mName = data.model || 'BananaPro';
         const cfg = getModelConfig(mName);
         setIsConfigured(!!cfg.key);
    }, [data.model]);

    const updateModels = useCallback(() => {
        const models = Object.keys(MODEL_REGISTRY).filter(k => MODEL_REGISTRY[k].category === 'IMAGE');
        setImageModels(models);
    }, []);

    useEffect(() => { 
        checkConfig(); 
        updateModels();
        window.addEventListener('modelConfigUpdated', checkConfig); 
        window.addEventListener('modelRegistryUpdated', updateModels);
        return () => {
            window.removeEventListener('modelConfigUpdated', checkConfig);
            window.removeEventListener('modelRegistryUpdated', updateModels);
        };
    }, [checkConfig, updateModels]);

    useEffect(() => { if (isSelectedAndStable && showControls) { const t = setTimeout(() => setDeferredInputs(true), 100); return () => clearTimeout(t); } else setDeferredInputs(false); }, [isSelectedAndStable, showControls]);

    // Get Rules for current model
    const currentModel = data.model || 'BananaPro';
    const handler = IMAGE_HANDLERS[currentModel] || IMAGE_HANDLERS['BananaPro']; // Fallback rules
    const rules = handler.rules;
    const supportedResolutions = rules.resolutions || ['1k'];
    const supportedRatios = rules.ratios || ['1:1', '16:9'];
    const canOptimize = !!rules.hasPromptExtend;

    const handleRatioChange = (ratio: string) => {
        const currentShort = Math.min(data.width, data.height);
        const baseSize = Math.max(currentShort, 400); // Preserve current scale, min 400px

        const [wStr, hStr] = ratio.split(':');
        const wR = parseFloat(wStr);
        const hR = parseFloat(hStr);
        const r = wR / hR;

        let newW, newH;
        if (r >= 1) {
            // Landscape or Square: Height is limiting factor
            newH = baseSize;
            newW = baseSize * r;
        } else {
            // Portrait: Width is limiting factor
            newW = baseSize;
            newH = baseSize / r;
        }
        updateData(data.id, { aspectRatio: ratio, width: Math.round(newW), height: Math.round(newH) });
    };

    const hasResult = !!data.imageSrc && !data.isLoading;
    
    // Auto-correct
    useEffect(() => { 
        if (data.aspectRatio && !supportedRatios.includes(data.aspectRatio)) updateData(data.id, { aspectRatio: '1:1' }); 
        if (data.resolution && !supportedResolutions.includes(data.resolution)) updateData(data.id, { resolution: supportedResolutions[0] });
    }, [data.model, data.aspectRatio, data.resolution, data.id, updateData, supportedRatios, supportedResolutions]);

    const containerBg = isDark ? 'bg-[#18181B]' : 'bg-white';
    const containerBorder = selected ? 'border-cyan-500 shadow-[0_0_0_1px_rgba(6,182,212,1)]' : (isDark ? 'border-zinc-800' : 'border-gray-200');
    const overlayToolbarBg = isDark ? 'bg-black/50 border-white/5 text-gray-400' : 'bg-white/50 border-black/5 text-gray-600';
    const controlPanelBg = isDark ? 'bg-[#18181B] border-zinc-700/80' : 'bg-white border-gray-200';
    const inputBg = isDark ? 'bg-zinc-900/50 hover:bg-zinc-900 border-transparent focus:border-zinc-700/50 text-zinc-200 placeholder-zinc-600' : 'bg-gray-50 hover:bg-gray-100 border-gray-200 focus:border-gray-300 text-gray-900 placeholder-gray-400';
    const dividerColor = isDark ? 'bg-zinc-800' : 'bg-gray-200';
    const emptyStateIconColor = isDark ? 'bg-zinc-900/50 border-zinc-800 text-zinc-600' : 'bg-gray-100 border-gray-200 text-gray-400';
    const emptyStateTextColor = isDark ? 'text-zinc-600' : 'text-gray-400';

    return (
      <>
        <div className="absolute bottom-full left-0 w-full mb-2 flex items-center justify-between pointer-events-auto" onTouchStart={(e) => e.stopPropagation()}>
           <div className="flex items-center gap-2 pl-1"><LocalEditableTitle title={data.title} onUpdate={(t) => updateData(data.id, { title: t })} isDark={isDark} /></div>
           <div className={`flex gap-1 backdrop-blur-md rounded-lg p-1 border ${overlayToolbarBg}`}>
               <button title="Maximize" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); onMaximize?.(data.id); }} onTouchStart={(e) => e.stopPropagation()}><Icons.Maximize2 size={12} /></button>
               <button title="Download" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); onDownload?.(data.id); }} onTouchStart={(e) => e.stopPropagation()}><Icons.Download size={12} /></button>
           </div>
        </div>
        
        <div className={`w-full h-full relative rounded-xl border ${containerBorder} ${containerBg} ${data.isStackOpen ? 'overflow-visible' : 'overflow-hidden'} shadow-lg group transition-colors duration-200`}>
             {hasResult ? (
                 <LocalMediaStack data={data} updateData={updateData} currentSrc={data.imageSrc} onMaximize={onMaximize} isDark={isDark} selected={selected} />
             ) : (
                 <div className={`w-full h-full flex flex-col items-center justify-center ${emptyStateTextColor}`}>
                     <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 border ${emptyStateIconColor}`}><Icons.Image size={20} className="opacity-50"/></div>
                     <span className="text-[10px] uppercase tracking-wider font-bold opacity-40">TEXT TO IMAGE</span>
                 </div>
             )}
             {data.isLoading && <LoadingOverlay />}
        </div>

        {isSelectedAndStable && showControls && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-full min-w-[400px] pt-3 z-[70] pointer-events-auto" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                 {inputs.length > 0 && <LocalInputThumbnails inputs={inputs} ready={deferredInputs} isDark={isDark} />}
                 <div className={`${controlPanelBg} rounded-2xl p-3 shadow-2xl flex flex-col gap-3 border`}>
                      <div className="relative group/input">
                          <textarea 
                              className={`w-full border rounded-xl p-3 text-[10px] leading-relaxed resize-none focus:outline-none min-h-[70px] no-scrollbar select-text cursor-text ${inputBg}`} 
                              placeholder="Enter image description..." 
                              value={data.prompt || ''} 
                              onChange={(e) => updateData(data.id, { prompt: e.target.value })} 
                              onWheel={(e) => e.stopPropagation()} 
                              onTouchStart={(e) => e.stopPropagation()}
                          />
                      </div>
                      <div className="flex items-center justify-between gap-2 h-7">
                          <LocalCustomDropdown options={imageModels} value={data.model || 'BananaPro'} onChange={(val: any) => updateData(data.id, { model: val })} isOpen={activeDropdown === 'model'} onToggle={() => setActiveDropdown(activeDropdown === 'model' ? null : 'model')} onClose={() => setActiveDropdown(null)} align="left" width="w-[120px]" isDark={isDark} />
                          <div className={`w-px h-3 ${dividerColor}`}></div>
                          <div className="flex items-center gap-1">
                              <LocalCustomDropdown icon={Icons.Crop} options={supportedRatios} value={data.aspectRatio || '1:1'} onChange={handleRatioChange} isOpen={activeDropdown === 'ratio'} onToggle={() => setActiveDropdown(activeDropdown === 'ratio' ? null : 'ratio')} onClose={() => setActiveDropdown(null)} isDark={isDark} />
                              <LocalCustomDropdown icon={Icons.Monitor} options={supportedResolutions} value={data.resolution || '1k'} onChange={(val: any) => updateData(data.id, { resolution: val })} isOpen={activeDropdown === 'res'} onToggle={() => setActiveDropdown(activeDropdown === 'res' ? null : 'res')} onClose={() => setActiveDropdown(null)} disabledOptions={['1k', '2k', '4k'].filter(r => !supportedResolutions.includes(r))} isDark={isDark} />
                              <LocalCustomDropdown icon={Icons.Layers} options={[1, 2, 3, 4]} value={data.count || 1} onChange={(val: any) => updateData(data.id, { count: val })} isOpen={activeDropdown === 'count'} onToggle={() => setActiveDropdown(activeDropdown === 'count' ? null : 'count')} onClose={() => setActiveDropdown(null)} isDark={isDark} />
                              
                              <button 
                                  className={`h-full px-2 rounded flex items-center justify-center transition-colors ${canOptimize ? (data.promptOptimize ? (isDark ? 'text-cyan-400 bg-cyan-500/10' : 'text-cyan-600 bg-cyan-50') : (isDark ? 'text-zinc-500 hover:text-gray-300 hover:bg-white/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100')) : (isDark ? 'text-zinc-700 opacity-50 cursor-not-allowed' : 'text-gray-200 opacity-50 cursor-not-allowed')}`} 
                                  onClick={() => canOptimize && updateData(data.id, { promptOptimize: !data.promptOptimize })}
                                  title={canOptimize ? `Prompt Optimization: ${data.promptOptimize ? 'ON' : 'OFF'}` : 'Prompt Optimization not supported'}
                                  disabled={!canOptimize}
                                  onTouchStart={(e) => e.stopPropagation()}
                              >
                                  <Icons.Sparkles size={13} fill={data.promptOptimize && canOptimize ? "currentColor" : "none"} />
                              </button>
                          </div>
                          <button onClick={() => onGenerate(data.id)} onTouchStart={(e) => e.stopPropagation()} className={`ml-auto h-7 px-4 text-[10px] font-extrabold rounded-full flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-cyan-500/20 whitespace-nowrap ${data.isLoading || !isConfigured ? 'opacity-50 cursor-not-allowed bg-zinc-500 text-white' : 'bg-cyan-500 hover:bg-cyan-400 hover:shadow-cyan-500/40 text-white'}`} disabled={data.isLoading || !isConfigured} title={!isConfigured ? 'Configure API Key in Settings' : 'Generate'}>
                              {data.isLoading ? <Icons.Loader2 className="animate-spin" size={12}/> : <Icons.Wand2 size={12} />}<span>Generate</span>
                          </button>
                      </div>
                 </div>
            </div>
        )}
      </>
    );
};
