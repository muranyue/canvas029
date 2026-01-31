
import React, { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { NodeData } from '../../types';
import { Icons } from '../Icons';
import { getModelConfig, MODEL_REGISTRY } from '../../services/geminiService';
import { VIDEO_HANDLERS } from '../../services/mode/video/configurations';
import { getVideoConstraints, getAutoCorrectedVideoSettings } from '../../services/mode/video/rules';
import { LocalEditableTitle, LocalCustomDropdown, LocalInputThumbnails, LocalMediaStack, LoadingOverlay } from './Shared/LocalNodeComponents';

const videoToolbarItems = [{ id: 'plot', label: 'Plot', icon: Icons.BookOpen }, { id: 'start_end', label: 'Start/End', icon: Icons.ArrowRightLeft }, { id: 'region', label: 'Region', icon: Icons.Scan }, { id: 'camera', label: 'Camera', icon: Icons.Camera }, { id: 'role', label: 'Character', icon: Icons.User }];

interface TextToVideoNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string) => void;
  selected?: boolean;
  showControls?: boolean;
  inputs?: string[];
  onMaximize?: (id: string) => void;
  onDownload?: (id: string) => void;
  onToolbarAction?: (nodeId: string, action: string) => void;
  isDark?: boolean;
  isSelecting?: boolean;
}

export interface PromptInputHandle {
    insertText: (text: string) => void;
}

const ContentEditablePromptInput = forwardRef<PromptInputHandle, { 
    value: string; 
    onChange: (val: string) => void; 
    placeholder?: string;
    isDark: boolean;
}>(({ value, onChange, placeholder, isDark }, ref) => {
    const divRef = useRef<HTMLDivElement>(null);

    // Shared chip HTML generator
    const createChipHtml = (text: string) => {
        return `&nbsp;<span class="inline-flex items-center justify-center h-5 px-1.5 mx-0.5 my-0.5 rounded-md bg-purple-500/20 text-purple-400 border border-purple-500/30 font-bold text-[10px] align-middle select-none chip transform translate-y-[-1px]" contenteditable="false" data-value="${text}">${text}</span>&nbsp;`;
    };

    useImperativeHandle(ref, () => ({
        insertText: (text: string) => {
            if (divRef.current) {
                divRef.current.focus();
                
                // If it starts with @, treat it as a token insertion (Chip)
                if (text.startsWith('@')) {
                     const html = createChipHtml(text);
                     const success = document.execCommand('insertHTML', false, html);
                     if (!success) {
                        onChange(value + text);
                     }
                } else {
                     const success = document.execCommand('insertText', false, text);
                     if (!success) {
                        onChange(value + text);
                     }
                }
            }
        }
    }));

    // Convert Plain Text -> HTML with Chips
    const parseTextToHtml = (text: string) => {
        if (!text) return '';
        // Match @Image n, @Video n (English) or @图片n, @视频n (Legacy/Chinese)
        // Case insensitive, optional space for English
        const regex = /(@(?:Image|Video|图片|视频)(?:\s+)?\d+)/gi;
        // Basic HTML escaping for non-chip parts
        const escapeHtml = (str: string) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        return text.split(regex).map(part => {
            if (part.match(regex)) {
                return createChipHtml(part);
            }
            return escapeHtml(part);
        }).join('').replace(/\n/g, '<br>');
    };

    // Helper to get Plain Text from DOM
    const getPlainText = (node: Node): string => {
        let text = '';
        node.childNodes.forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
                // Replace non-breaking spaces with normal spaces for logic, or trim if needed.
                // Here we keep them as normal spaces to avoid concatenation issues.
                text += child.textContent?.replace(/\u00A0/g, ' ') || '';
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const el = child as HTMLElement;
                if (el.classList.contains('chip')) {
                    text += el.dataset.value || '';
                } else if (el.tagName === 'BR') {
                    text += '\n';
                } else if (el.tagName === 'DIV') {
                    // Chrome handles newlines with divs
                    text += '\n' + getPlainText(el);
                } else {
                    text += getPlainText(el);
                }
            }
        });
        // Collapse multiple spaces if necessary, but preserving user intent is better.
        return text;
    };

    // Sync Props -> DOM
    useEffect(() => {
        if (divRef.current) {
            const currentText = getPlainText(divRef.current);
            const normalizedValue = value.replace(/\s+/g, ' ');
            const normalizedCurrent = currentText.replace(/\s+/g, ' ');

            if (normalizedValue !== normalizedCurrent) {
                const newHtml = parseTextToHtml(value);
                divRef.current.innerHTML = newHtml;
                
                if (value.length > currentText.length) {
                     moveCaretToEnd(divRef.current);
                }
            }
        }
    }, [value]);

    const moveCaretToEnd = (el: HTMLElement) => {
        el.focus(); 
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
    };

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        const newText = getPlainText(e.currentTarget);
        onChange(newText);
    };

    const handleBeforeInput = (e: React.FormEvent<HTMLDivElement>) => {
        // 允许输入继续
        // 这个事件在移动端输入法中很重要
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    };

    // Stop propagation of delete keys to prevent Node deletion
    const handleKeyDown = (e: React.KeyboardEvent) => {
        e.stopPropagation(); // Stop bubbling to canvas/app
    };

    const handleCompositionEnd = (e: React.CompositionEvent<HTMLDivElement>) => {
        // 输入法结束时更新
        const newText = getPlainText(e.currentTarget);
        onChange(newText);
    };

    // Restored border color for dark mode (was border-transparent)
    const containerBg = isDark ? 'bg-zinc-900/50' : 'bg-gray-50';
    const borderColor = isDark ? 'border-zinc-700 focus:border-zinc-600' : 'border-gray-200 focus:border-gray-300';
    const textColor = isDark ? 'text-zinc-200' : 'text-gray-900';

    return (
        <div 
            className={`relative w-full min-h-[80px] group/input border rounded-xl overflow-hidden flex flex-col ${containerBg} ${borderColor}`}
            onWheel={(e) => e.stopPropagation()} // Prevent canvas zoom when scrolling inside input
            onMouseDown={(e) => e.stopPropagation()}
            data-interactive="true"
        >
            <div 
                ref={divRef}
                className={`w-full flex-1 p-3 text-xs font-sans leading-7 outline-none overflow-y-auto max-h-[120px] ${textColor} relative z-10 ${isDark ? 'node-scroll-dark' : 'node-scroll'}`}
                contentEditable
                onInput={handleInput}
                onBeforeInput={handleBeforeInput}
                onCompositionEnd={handleCompositionEnd}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onTouchStart={(e) => {
                    e.stopPropagation();
                    // 确保输入框获得焦点
                    if (divRef.current && document.activeElement !== divRef.current) {
                        divRef.current.focus();
                    }
                }}
                suppressContentEditableWarning
                spellCheck={false}
                style={{ whiteSpace: 'pre-wrap', minHeight: '80px', cursor: 'text' }}
            />
            {!value && (
                <div className={`absolute top-3 left-3 pointer-events-none text-xs font-sans leading-7 ${isDark ? 'text-zinc-500' : 'text-gray-400'} z-0`}>
                    {placeholder}
                </div>
            )}
        </div>
    );
});
ContentEditablePromptInput.displayName = 'ContentEditablePromptInput';

export const TextToVideoNode: React.FC<TextToVideoNodeProps> = ({
    data, updateData, onGenerate, selected, showControls, inputs = [], onMaximize, onDownload, onToolbarAction, isDark = true, isSelecting
}) => {
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [deferredInputs, setDeferredInputs] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isConfigured, setIsConfigured] = useState(true);
    const [videoModels, setVideoModels] = useState<string[]>([]);
    
    const inputRef = useRef<PromptInputHandle>(null);
    const isSelectedAndStable = selected && !isSelecting;

    const checkConfig = useCallback(() => {
         const mName = data.model || 'Sora 2';
         const cfg = getModelConfig(mName);
         setIsConfigured(!!cfg.key);
    }, [data.model]);

    const updateModels = useCallback(() => {
        const models = Object.keys(MODEL_REGISTRY).filter(k => MODEL_REGISTRY[k].category === 'VIDEO');
        setVideoModels(models);
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

    // Group models for split-pane/flyout dropdown
    const groupedVideoModels = useMemo(() => {
        const groups: Record<string, string[]> = {
            'Kling': [],
            'Hailuo': [],
            'Veo': [],
            'Wan': [],
            'Vidu': []
        };
        const ungrouped: string[] = [];
        
        videoModels.forEach(m => {
            const lower = m.toLowerCase();
            if (m.startsWith('Kling') || m.includes('可灵')) {
                 groups['Kling'].push(m);
            } else if (m.startsWith('海螺') || lower.includes('hailuo')) {
                 groups['Hailuo'].push(m);
            } else if (m.startsWith('Veo')) {
                 groups['Veo'].push(m);
            } else if (m.startsWith('Wan') || lower.includes('wan')) {
                 groups['Wan'].push(m);
            } else if (m.startsWith('Vidu')) {
                 groups['Vidu'].push(m);
            } else {
                 ungrouped.push(m);
            }
        });
        
        const result = Object.entries(groups)
            .filter(([_, items]) => items.length > 0)
            .map(([label, items]) => ({ label, items }));
            
        return [...result, ...ungrouped];
    }, [videoModels]);

    useEffect(() => { if (isSelectedAndStable && showControls) { const t = setTimeout(() => setDeferredInputs(true), 100); return () => clearTimeout(t); } else setDeferredInputs(false); }, [isSelectedAndStable, showControls]);
    useEffect(() => { let interval: any; if (data.isLoading) { setProgress(0); interval = setInterval(() => { setProgress(prev => (prev >= 95 ? 95 : prev + Math.max(0.5, (95 - prev) / 20))); }, 200); } else setProgress(0); return () => clearInterval(interval); }, [data.isLoading]);

    const handleRatioChange = (ratio: string) => {
        const currentShort = Math.min(data.width, data.height);
        const baseSize = Math.max(currentShort, 400); // Preserve current scale, min 400px

        const [wStr, hStr] = ratio.split(':');
        const wR = parseFloat(wStr);
        const hR = parseFloat(hStr);
        const r = wR / hR;

        let newW, newH;
        if (r >= 1) {
            newH = baseSize;
            newW = baseSize * r;
        } else {
            newW = baseSize;
            newH = baseSize / r;
        }
        updateData(data.id, { aspectRatio: ratio, width: Math.round(newW), height: Math.round(newH) });
    };
    
    const insertImageToken = (index: number) => {
        const url = inputs[index] || '';
        const isVideo = /\.(mp4|webm|mov|mkv)(\?|$)/i.test(url);
        const token = isVideo ? `@Video ${index + 1}` : `@Image ${index + 1}`;
        
        if (inputRef.current) {
            inputRef.current.insertText(token);
        } else {
            const currentPrompt = data.prompt || '';
            updateData(data.id, { prompt: currentPrompt + token });
        }
    };

    const isStartEndDisabled = inputs.length > 2;
    useEffect(() => { if (data.activeToolbarItem === 'start_end' && isStartEndDisabled) updateData(data.id, { activeToolbarItem: undefined }); }, [data.id, data.activeToolbarItem, isStartEndDisabled, updateData]);

    const currentModel = data.model || 'Sora 2';
    const handler = VIDEO_HANDLERS[currentModel] || VIDEO_HANDLERS['Sora 2'];
    const rules = handler.rules;

    const resOptions = rules.resolutions || ['720p'];
    const durOptions = rules.durations || ['5s'];
    const ratioOptions = rules.ratios || ['16:9'];
    const canOptimize = !!rules.hasPromptExtend;

    // Constraints & Auto-Correction
    const constraints = getVideoConstraints(currentModel, data.resolution, data.duration, inputs.length);
    const displayResValue = (data.model?.includes('海螺') && (data.resolution === '720p' || data.resolution === '768p')) ? '768p' : data.resolution;

    useEffect(() => {
        let updates: Partial<NodeData> = {};
        const corrections = getAutoCorrectedVideoSettings(currentModel, data.resolution, data.duration, inputs.length);
        if (corrections.resolution) updates.resolution = corrections.resolution;
        if (corrections.duration) updates.duration = corrections.duration;

        // Basic validation
        if (data.resolution && !resOptions.includes(data.resolution)) updates.resolution = resOptions[0];
        if (data.duration && !durOptions.includes(data.duration)) updates.duration = durOptions[0];
        if (data.aspectRatio && !ratioOptions.includes(data.aspectRatio)) updates.aspectRatio = ratioOptions[0];

        if (Object.keys(updates).length > 0) updateData(data.id, updates);
    }, [data.model, data.resolution, data.duration, data.aspectRatio, resOptions, durOptions, ratioOptions, currentModel, inputs.length, updateData, data.id]);

    const containerBg = isDark ? 'bg-[#18181B]' : 'bg-white';
    const containerBorder = selected ? 'border-cyan-500 shadow-[0_0_0_1px_rgba(6,182,212,1)]' : (isDark ? 'border-zinc-800' : 'border-gray-200');
    const overlayToolbarBg = isDark ? 'bg-black/50 border-white/5 text-gray-400' : 'bg-white/50 border-black/5 text-gray-600';
    const controlPanelBg = isDark ? 'bg-[#18181B] border-zinc-700/80' : 'bg-white border-gray-200';
    const dividerColor = isDark ? 'bg-zinc-800' : 'bg-gray-200';
    const emptyStateIconColor = isDark ? 'bg-zinc-900/50 border-zinc-800 text-zinc-600' : 'bg-gray-100 border-gray-200 text-gray-400';
    const emptyStateTextColor = isDark ? 'text-zinc-600' : 'text-gray-400';
    const toolbarBg = isDark ? 'bg-[#1A1D21] border-zinc-700/80' : 'bg-white border-gray-200';
    const activeToolbarItemClass = isDark ? 'bg-zinc-800 text-cyan-400 border-zinc-600' : 'bg-cyan-50 text-cyan-600 border-cyan-100';
    const inactiveToolbarItemClass = isDark ? 'text-zinc-400 hover:text-gray-200 hover:bg-zinc-800/50' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50';
    const hasResult = !!data.videoSrc && !data.isLoading;
    
    // Check for Start/End Mode active
    const isStartEndActive = data.activeToolbarItem === 'start_end';

    return (
      <>
        {isSelectedAndStable && showControls && (
            <div className="absolute bottom-full left-0 w-full mb-12 flex items-center px-1 pointer-events-auto animate-in slide-in-from-bottom-2 fade-in duration-200" data-interactive="true">
               <div className={`flex items-center gap-1 border rounded-lg p-1 shadow-xl backdrop-blur-md ${toolbarBg}`}>
                   {videoToolbarItems.map(item => {
                       const isDisabled = item.id === 'start_end' && isStartEndDisabled;
                       const itemBaseClass = `flex items-center gap-1.5 px-2 py-1 rounded-md transition-all border border-transparent`;
                       let itemStateClass = isDisabled ? (isDark ? 'text-zinc-600 cursor-not-allowed opacity-50' : 'text-gray-300 cursor-not-allowed opacity-50') : (data.activeToolbarItem === item.id ? activeToolbarItemClass + ' shadow-sm cursor-pointer' : inactiveToolbarItemClass + ' cursor-pointer');
                       return (
                           <div key={item.id} className={`${itemBaseClass} ${itemStateClass}`} onClick={(e) => { e.stopPropagation(); if (!isDisabled) onToolbarAction?.(data.id, item.id); }} onTouchEnd={(e) => { if (!isDisabled) { e.preventDefault(); e.stopPropagation(); onToolbarAction?.(data.id, item.id); } }} data-interactive="true">
                               <item.icon size={11} /><span className="text-[10px] font-bold">{item.label}</span>
                           </div>
                       );
                   })}
               </div>
            </div>
        )}
        <div className="absolute bottom-full left-0 w-full mb-2 flex items-center justify-between pointer-events-auto" onMouseDown={(e) => e.stopPropagation()} data-interactive="true">
           <div className="flex items-center gap-2 pl-1"><LocalEditableTitle title={data.title} onUpdate={(t) => updateData(data.id, { title: t })} isDark={isDark} /></div>
           <div className={`flex gap-1 backdrop-blur-md rounded-lg p-1 border ${overlayToolbarBg}`} onMouseDown={(e) => e.stopPropagation()} data-interactive="true">
               <button title="Maximize" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); onMaximize?.(data.id); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onMaximize?.(data.id); }} data-interactive="true"><Icons.Maximize2 size={12} /></button>
               <button title="Download" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); onDownload?.(data.id); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onDownload?.(data.id); }} data-interactive="true"><Icons.Download size={12} /></button>
           </div>
        </div>
        
        <div className={`w-full h-full relative rounded-xl border ${containerBorder} ${containerBg} ${data.isStackOpen ? 'overflow-visible' : 'overflow-hidden'} shadow-lg group`}>
            {hasResult ? (
                 <LocalMediaStack data={data} updateData={updateData} currentSrc={data.videoSrc} onMaximize={onMaximize} isDark={isDark} selected={selected} />
            ) : (
                <div className={`w-full h-full flex flex-col items-center justify-center ${emptyStateTextColor}`}>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 border ${emptyStateIconColor}`}><Icons.Film size={20} className="opacity-50"/></div>
                    <span className="text-[10px] uppercase tracking-wider font-bold opacity-40">TEXT TO VIDEO</span>
                </div>
            )}
            {data.isLoading && <LoadingOverlay />}
        </div>

        {isSelectedAndStable && showControls && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-full min-w-[450px] max-w-[calc(100vw-20px)] pt-3 z-[70] pointer-events-auto" onMouseDown={(e) => e.stopPropagation()} data-interactive="true">
               {inputs.length > 0 && <LocalInputThumbnails inputs={inputs} ready={deferredInputs} isDark={isDark} />}
              <div className={`${controlPanelBg} rounded-2xl p-3 shadow-2xl flex flex-col gap-2 border`}>
                  
                  {/* Start/End Mode Hint */}
                  {isStartEndActive && (
                      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-500 text-[10px] font-bold">
                          <span className="px-1.5 py-0.5 rounded bg-orange-500 text-white text-[9px]">Start/End</span>
                          <span>Ensure two images are input (Start + End frames)</span>
                      </div>
                  )}

                  <div className="relative group/input">
                      <textarea className={`w-full border rounded-xl p-3 text-xs leading-7 resize-none focus:outline-none min-h-[80px] no-scrollbar ${inputBg}`} placeholder="Describe the video scene..." value={data.prompt || ''} onChange={(e) => updateData(data.id, { prompt: e.target.value })} onWheel={(e) => e.stopPropagation()} data-interactive="true" />
                  </div>

                  <div className="h-px w-full my-1 opacity-50 bg-gradient-to-r from-transparent via-gray-500/20 to-transparent"></div>

                  <div className="flex items-center justify-between gap-2 h-7">
                       <LocalCustomDropdown options={groupedVideoModels} value={data.model || 'Sora 2'} onChange={(val: any) => updateData(data.id, { model: val })} isOpen={activeDropdown === 'model'} onToggle={() => setActiveDropdown(activeDropdown === 'model' ? null : 'model')} onClose={() => setActiveDropdown(null)} align="left" width="w-[130px]" isDark={isDark} />
                       <div className={`w-px h-3 ${dividerColor}`}></div>
                       <div className="flex items-center gap-1" data-interactive="true">
                          <LocalCustomDropdown icon={Icons.Crop} options={ratioOptions} value={data.aspectRatio || '16:9'} onChange={handleRatioChange} isOpen={activeDropdown === 'ratio'} onToggle={() => setActiveDropdown(activeDropdown === 'ratio' ? null : 'ratio')} onClose={() => setActiveDropdown(null)} disabledOptions={constraints.disabledRatios} isDark={isDark} />
                          <LocalCustomDropdown icon={Icons.Monitor} options={resOptions} value={displayResValue || '720p'} onChange={(val: any) => updateData(data.id, { resolution: val })} isOpen={activeDropdown === 'res'} onToggle={() => setActiveDropdown(activeDropdown === 'res' ? null : 'res')} onClose={() => setActiveDropdown(null)} disabledOptions={constraints.disabledRes} isDark={isDark} />
                          <LocalCustomDropdown icon={Icons.Clock} options={durOptions} value={data.duration || '5s'} onChange={(val: any) => updateData(data.id, { duration: val })} isOpen={activeDropdown === 'duration'} onToggle={() => setActiveDropdown(activeDropdown === 'duration' ? null : 'duration')} onClose={() => setActiveDropdown(null)} disabledOptions={constraints.disabledDurations} isDark={isDark} />
                          <LocalCustomDropdown icon={Icons.Layers} options={[1, 2, 3, 4]} value={data.count || 1} onChange={(val: any) => updateData(data.id, { count: val })} isOpen={activeDropdown === 'count'} onToggle={() => setActiveDropdown(activeDropdown === 'count' ? null : 'count')} onClose={() => setActiveDropdown(null)} isDark={isDark} />
                          
                          <button 
                              className={`h-full px-2 rounded flex items-center justify-center transition-colors ${canOptimize ? (data.promptOptimize ? (isDark ? 'text-cyan-400 bg-cyan-500/10' : 'text-cyan-600 bg-cyan-50') : (isDark ? 'text-zinc-500 hover:text-gray-300 hover:bg-white/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100')) : (isDark ? 'text-zinc-700 opacity-50 cursor-not-allowed' : 'text-gray-200 opacity-50 cursor-not-allowed')}`} 
                              onClick={() => canOptimize && updateData(data.id, { promptOptimize: !data.promptOptimize })}
                              onTouchEnd={(e) => { if (canOptimize) { e.preventDefault(); e.stopPropagation(); updateData(data.id, { promptOptimize: !data.promptOptimize }); } }}
                              title={canOptimize ? `Prompt Optimization: ${data.promptOptimize ? 'ON' : 'OFF'}` : 'Prompt Optimization not supported'}
                              disabled={!canOptimize}
                              data-interactive="true"
                          >
                              <Icons.Sparkles size={13} fill={data.promptOptimize && canOptimize ? "currentColor" : "none"} />
                          </button>
                       </div>
                       <button onClick={() => onGenerate(data.id)} onTouchEnd={(e) => { if (!data.isLoading && isConfigured) { e.preventDefault(); e.stopPropagation(); onGenerate(data.id); } }} className={`ml-auto relative h-7 px-4 text-[10px] font-extrabold rounded-full flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-cyan-500/20 overflow-hidden min-w-[90px] ${data.isLoading || !isConfigured ? 'opacity-50 cursor-not-allowed bg-zinc-500 text-white' : 'bg-cyan-500 hover:bg-cyan-400 hover:shadow-cyan-500/40 text-white'}`} disabled={data.isLoading || !isConfigured} title={!isConfigured ? 'Configure API Key in Settings' : 'Generate'} data-interactive="true">
                          {data.isLoading && <div className="absolute left-0 top-0 h-full bg-cyan-500/30 z-0 transition-all duration-300 ease-linear" style={{ width: `${progress}%` }}><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent w-[200%] animate-[shimmer_2s_infinite]"></div></div>}
                          <div className="relative z-10 flex items-center gap-1.5">{data.isLoading ? <span className="tabular-nums">{Math.floor(progress)}%</span> : <><Icons.Wand2 size={12} /><span>Generate</span></>}</div>
                      </button>
                  </div>
              </div>
          </div>
        )}
      </>
    );
};
