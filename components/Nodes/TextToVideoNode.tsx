import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ContentEditable, { ContentEditableEvent } from 'react-contenteditable';
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
  inputs?: { src: string, isVideo: boolean }[];
  onMaximize?: (id: string) => void;
  onDownload?: (id: string) => void;
  onDelete?: (id: string) => void;
  onToolbarAction?: (nodeId: string, action: string) => void;
  isDark?: boolean;
  isSelecting?: boolean;
}

export interface PromptInputHandle {
    insertText: (text: string) => void;
}

// 使用 react-contenteditable 的 ContentEditablePromptInput - iOS 生产环境兼容性优化版本
const ContentEditablePromptInput = React.forwardRef<PromptInputHandle, { 
    value: string; 
    onChange: (val: string) => void; 
    placeholder?: string;
    isDark: boolean;
}>(({ value, onChange, placeholder, isDark }, ref) => {
    const contentEditableRef = useRef<HTMLElement>(null);
    const htmlRef = useRef<string>('');

    // 创建 chip HTML - 保留 chip 功能
    const createChipHtml = (text: string) => {
        return `<span class="inline-flex items-center justify-center h-5 px-1.5 mx-0.5 my-0.5 rounded-md bg-purple-500/20 text-purple-400 border border-purple-500/30 font-bold text-[10px] align-middle select-none chip transform translate-y-[-1px]" contenteditable="false" data-value="${text}">${text}</span>\u200B`;
    };

    // 从 HTML 提取纯文本 - 保留 chip 的 data-value
    const htmlToPlainText = (html: string): string => {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        
        const extractText = (node: Node): string => {
            let text = '';
            node.childNodes.forEach(child => {
                if (child.nodeType === Node.TEXT_NODE) {
                    text += child.textContent?.replace(/\u00A0/g, ' ').replace(/\u200B/g, '') || '';
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    const el = child as HTMLElement;
                    if (el.classList.contains('chip')) {
                        // 保留 chip 的值
                        text += el.dataset.value || el.textContent || '';
                    } else if (el.tagName === 'BR') {
                        text += '\n';
                    } else if (el.tagName === 'DIV') {
                        const divText = extractText(el);
                        text += (text && !text.endsWith('\n') ? '\n' : '') + divText;
                    } else {
                        text += extractText(el);
                    }
                }
            });
            return text;
        };
        
        return extractText(temp);
    };

    // 将纯文本转换为 HTML（包含 chip）
    const plainTextToHtml = (text: string): string => {
        if (!text) return '';
        const regex = /(@(?:image|video)\s+\d+)/gi;
        const escapeHtml = (str: string) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        return text.split(regex).map(part => {
            if (part.match(regex)) {
                return createChipHtml(part);
            }
            return escapeHtml(part);
        }).join('').replace(/\n/g, '<br>');
    };

    // 初始化和同步 HTML
    useEffect(() => {
        const newHtml = plainTextToHtml(value);
        if (htmlRef.current !== newHtml) {
            htmlRef.current = newHtml;
        }
    }, [value]);

    // iOS 兼容：组件挂载后强制配置属性（避免打包后属性丢失）
    useEffect(() => {
        const domNode = contentEditableRef.current;
        if (!domNode) return;
        
        // 强制开启可编辑（打包后可能被优化为 false）
        domNode.contentEditable = 'true';
        // 关闭 iOS 干扰项
        domNode.spellcheck = false;
        domNode.setAttribute('autocorrect', 'off');
        domNode.setAttribute('autocapitalize', 'off');
        // 强制设置渲染层级
        domNode.style.position = 'relative';
        domNode.style.zIndex = '1';
    }, []);

    // iOS 兼容：处理内容变化 + 强制重绘
    const handleChange = useCallback((evt: ContentEditableEvent) => {
        let newHtml = evt.target.value || '';
        
        // iOS 兼容：清理可能被 iOS 插入的隐藏样式标签（但保留 chip）
        // 仅清理非 chip 的 span 标签
        newHtml = newHtml
            .replace(/<span(?![^>]*class="[^"]*chip[^"]*")[^>]*>(.*?)<\/span>/gi, '$1')
            .replace(/&nbsp;/gi, ' ');
        
        htmlRef.current = newHtml;
        const plainText = htmlToPlainText(newHtml);
        onChange(plainText);
    }, [onChange]);

    // 插入文本到光标位置
    const insertAtCursor = useCallback((content: string, isHtml: boolean) => {
        const el = contentEditableRef.current;
        if (!el) return;
        
        el.focus();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        
        const range = sel.getRangeAt(0);
        range.deleteContents();
        
        if (isHtml) {
            const temp = document.createElement('div');
            temp.innerHTML = content;
            const frag = document.createDocumentFragment();
            let lastNode: Node | null = null;
            while (temp.firstChild) {
                lastNode = temp.firstChild;
                frag.appendChild(temp.firstChild);
            }
            range.insertNode(frag);
            if (lastNode) {
                range.setStartAfter(lastNode);
                range.setEndAfter(lastNode);
            }
        } else {
            const textNode = document.createTextNode(content);
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.setEndAfter(textNode);
        }
        
        sel.removeAllRanges();
        sel.addRange(range);
        
        // 触发更新
        const newHtml = el.innerHTML;
        htmlRef.current = newHtml;
        onChange(htmlToPlainText(newHtml));
    }, [onChange]);

    // 暴露 insertText 方法
    React.useImperativeHandle(ref, () => ({
        insertText: (text: string) => {
            setTimeout(() => {
                if (text.startsWith('@')) {
                    insertAtCursor(createChipHtml(text), true);
                } else {
                    insertAtCursor(text, false);
                }
            }, 0);
        }
    }), [insertAtCursor]);

    // 处理粘贴 - 只粘贴纯文本
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        insertAtCursor(text, false);
    }, [insertAtCursor]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        e.stopPropagation();
    }, []);

    // iOS 专用：触摸时强制获取焦点并弹出键盘
    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        const el = contentEditableRef.current;
        if (!el) return;
        
        // 先 blur 其他所有 contenteditable 元素
        const allEditables = document.querySelectorAll('[contenteditable="true"]');
        allEditables.forEach(editable => {
            if (editable !== el) {
                (editable as HTMLElement).blur();
            }
        });
        
        // 强制聚焦当前元素
        el.focus();
        
        // 设置光标到末尾
        const range = document.createRange();
        const sel = window.getSelection();
        if (sel && el.childNodes.length > 0) {
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }, []);

    const containerBg = isDark ? 'bg-zinc-900/50' : 'bg-gray-50';
    const borderColor = isDark ? 'border-zinc-700 focus:border-zinc-600' : 'border-gray-200 focus:border-gray-300';
    const textColor = isDark ? 'text-gray-200' : 'text-gray-900';

    return (
        <div 
            className={`editable-wrapper ${isDark ? 'dark' : 'light'} ${textColor} relative w-full min-h-[80px] group/input border rounded-xl flex flex-col ${containerBg} ${borderColor}`}
            style={{
                // iOS 兼容：父容器兜底样式
                overflow: 'visible',
                transform: 'none',
                WebkitTransform: 'none',
                height: 'auto',
                color: isDark ? '#e4e4e7' : '#18181b',
            }}
            onWheel={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            data-interactive="true"
        >
            <ContentEditable
                innerRef={contentEditableRef}
                html={htmlRef.current}
                onChange={handleChange}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                onTouchEnd={handleTouchEnd}
                className={`editable-input w-full flex-1 outline-none overflow-y-auto max-h-[120px] relative z-10 md:z-10 z-[80] ${isDark ? 'node-scroll-dark editable-input-dark' : 'node-scroll editable-input-light'}`}
                style={{ 
                    whiteSpace: 'pre-wrap', 
                    minHeight: '80px', 
                    cursor: 'text', 
                    WebkitUserSelect: 'text', 
                    userSelect: 'text',
                    fontSize: '16px',
                    lineHeight: '1.75',
                    padding: '12px',
                    WebkitTextSizeAdjust: '100%',
                    caretColor: 'auto',
                    color: isDark ? '#e4e4e7' : '#18181b',
                    WebkitTextFillColor: isDark ? '#e4e4e7' : '#18181b',
                } as React.CSSProperties}
                disabled={false}
                spellCheck={false}
            />
            {!value && (
                <div 
                    className={`absolute pointer-events-none text-xs font-sans ${isDark ? 'text-zinc-500' : 'text-gray-400'} z-0`}
                    style={{ top: '12px', left: '12px', fontSize: '16px', lineHeight: '1.75' }}
                >
                    {placeholder}
                </div>
            )}
        </div>
    );
});
ContentEditablePromptInput.displayName = 'ContentEditablePromptInput';

export const TextToVideoNode: React.FC<TextToVideoNodeProps> = ({
    data, updateData, onGenerate, selected, showControls, inputs = [], onMaximize, onDownload, onDelete, onToolbarAction, isDark = true, isSelecting
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
        const input = inputs[index];
        if (!input) return;
        
        // Calculate separate counts for images and videos
        let imageCount = 0;
        let videoCount = 0;
        for (let i = 0; i <= index; i++) {
            if (inputs[i].isVideo) videoCount++;
            else imageCount++;
        }
        
        const token = input.isVideo ? `@video ${videoCount}` : `@image ${imageCount}`;
        
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
        <div className="absolute bottom-full left-0 w-full mb-2 flex items-center justify-between pointer-events-auto" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} data-interactive="true">
           <div className="flex items-center gap-2 pl-1"><LocalEditableTitle title={data.title} onUpdate={(t) => updateData(data.id, { title: t })} isDark={isDark} /></div>
           <div className={`flex gap-1 backdrop-blur-md rounded-lg p-1 border ${overlayToolbarBg}`} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} data-interactive="true">
               <button title="Maximize" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); onMaximize?.(data.id); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onMaximize?.(data.id); }} data-interactive="true"><Icons.Maximize2 size={12} /></button>
               <button title="Download" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); onDownload?.(data.id); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onDownload?.(data.id); }} data-interactive="true"><Icons.Download size={12} /></button>
               <button title="Delete" className={`p-1 rounded transition-colors text-red-400 block md:hidden ${isDark ? 'hover:bg-zinc-800' : 'hover:bg-gray-200'}`} onClick={(e) => { e.stopPropagation(); onDelete?.(data.id); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onDelete?.(data.id); }} data-interactive="true"><Icons.Trash2 size={12} /></button>
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

                  <div className="flex flex-col" data-interactive="true">
                      <ContentEditablePromptInput 
                          ref={inputRef}
                          value={data.prompt || ''} 
                          onChange={(val) => updateData(data.id, { prompt: val })} 
                          isDark={isDark}
                          placeholder="Describe the video scene..."
                      />
                      
                      {/* Image/Video Token Insertion Buttons - Moved Below Input to Separate Line */}
                      {inputs.length > 0 && (
                          <div className="flex justify-end gap-1.5 mt-2" data-interactive="true" onTouchStart={(e) => e.stopPropagation()}>
                              {(() => {
                                  let imageCount = 0;
                                  let videoCount = 0;
                                  return inputs.map((input, i) => {
                                      let tokenText: string;
                                      if (input.isVideo) {
                                          videoCount++;
                                          tokenText = `@video ${videoCount}`;
                                      } else {
                                          imageCount++;
                                          tokenText = `@image ${imageCount}`;
                                      }
                                      return (
                                          <button 
                                              key={i}
                                              onClick={() => insertImageToken(i)}
                                              onTouchStart={(e) => e.stopPropagation()}
                                              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); insertImageToken(i); }}
                                              className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all shadow-sm ${
                                                  isDark 
                                                    ? 'bg-zinc-800 hover:bg-zinc-700 text-purple-400 border border-zinc-700 hover:border-zinc-600' 
                                                    : 'bg-gray-100 hover:bg-gray-200 text-purple-600 border border-gray-200 hover:border-gray-300'
                                              }`}
                                              title={input.isVideo ? "Insert video token" : "Insert image token"}
                                              data-interactive="true"
                                          >
                                              <span>{tokenText}</span>
                                              <Icons.ArrowRightLeft size={10} className="rotate-45 opacity-60"/>
                                          </button>
                                      );
                                  });
                              })()}
                          </div>
                      )}
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
