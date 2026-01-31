
import React, { useState, useEffect, useRef, memo, useMemo } from 'react';
import { Icons } from '../../Icons';
import { NodeData } from '../../../types';

// --- 缩略图缓存 ---
export const thumbnailCache = new Map<string, string>();

// 生成缩略图的函数
// maxSize: 1024 (1k) - 大于1k的图片缩放到1k，小于1k的保持原尺寸
export const generateThumbnail = (src: string, maxSize: number = 1024): Promise<string> => {
    return new Promise((resolve) => {
        // 检查缓存
        const cacheKey = `${src}_${maxSize}`;
        if (thumbnailCache.has(cacheKey)) {
            resolve(thumbnailCache.get(cacheKey)!);
            return;
        }
        
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;
            
            // 如果图片小于等于maxSize，直接返回原图
            if (width <= maxSize && height <= maxSize) {
                resolve(src);
                return;
            }
            
            // 计算缩放比例，保持1k清晰度
            const scale = Math.min(maxSize / width, maxSize / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
            
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);
                
                // 使用更高质量的压缩
                const thumbnail = canvas.toDataURL('image/jpeg', 0.85);
                thumbnailCache.set(cacheKey, thumbnail);
                resolve(thumbnail);
            } else {
                resolve(src);
            }
        };
        img.onerror = () => resolve(src);
        img.src = src;
    });
};

// 缩略图 Hook
// 默认maxSize为1024 (1k)
export const useThumbnail = (src: string | undefined, maxSize: number = 1024) => {
    const [thumbnail, setThumbnail] = useState<string | undefined>(src);
    
    useEffect(() => {
        if (!src) {
            setThumbnail(undefined);
            return;
        }
        
        // 视频不生成缩略图
        if (/\.(mp4|webm|mov|mkv)(\?|$)/i.test(src)) {
            setThumbnail(src);
            return;
        }
        
        // 检查缓存
        const cacheKey = `${src}_${maxSize}`;
        if (thumbnailCache.has(cacheKey)) {
            setThumbnail(thumbnailCache.get(cacheKey)!);
            return;
        }
        
        // 生成缩略图
        generateThumbnail(src, maxSize).then(setThumbnail);
    }, [src, maxSize]);
    
    return thumbnail;
};

// --- Local Components (Extracted) ---

export const LocalEditableTitle: React.FC<{ title: string; onUpdate: (newTitle: string) => void, isDark?: boolean }> = ({ title, onUpdate, isDark = true }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(title);
    const inputRef = useRef<HTMLInputElement>(null);
    const lastTapRef = useRef<number>(0);
    
    useEffect(() => { if (isEditing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [isEditing]);
    useEffect(() => { if (!isEditing) setEditValue(title); }, [title, isEditing]);
    const handleBlur = () => { setIsEditing(false); if (editValue.trim() && editValue !== title) onUpdate(editValue.trim().slice(0, 20)); else setEditValue(title); };
    
    // 处理移动端双击
    const handleTap = (e: React.TouchEvent) => {
        e.stopPropagation();
        const now = Date.now();
        const timeSinceLastTap = now - lastTapRef.current;
        
        if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
            // 双击
            e.preventDefault();
            setIsEditing(true);
            setEditValue(title);
        }
        lastTapRef.current = now;
    };
    
    const inputBg = isDark ? 'bg-zinc-800 text-white border-zinc-600' : 'bg-white text-gray-900 border-gray-300 shadow-sm';
    const displayBg = isDark ? 'text-gray-300 hover:border-zinc-700 bg-[#1A1D21]/50' : 'text-gray-700 hover:border-gray-300 bg-white/50';

    return isEditing ? (
        <input ref={inputRef} type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleBlur} onKeyDown={(e) => { if (e.key === 'Enter') handleBlur(); if (e.key === 'Escape') { setEditValue(title); setIsEditing(false); } }} className={`${inputBg} border rounded px-2 py-0.5 outline-none w-[140px] text-xs font-bold`} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} data-interactive="true" />
    ) : (
        <div className={`${displayBg} font-bold text-xs px-2 py-0.5 rounded cursor-text border border-transparent truncate max-w-[140px]`} onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); setEditValue(title); }} onMouseDown={(e) => e.stopPropagation()} onTouchStart={handleTap} title={title} data-interactive="true">{title}</div>
    );
};

// Helper for Aspect Ratio Visualization
const AspectRatioIcon = ({ ratio, isDark, className }: { ratio: string, isDark: boolean, className?: string }) => {
    let w = 12, h = 12;
    const [rw, rh] = ratio.split(':').map(Number);
    if (!isNaN(rw) && !isNaN(rh)) {
        if (rw > rh) { w = 14; h = 14 * (rh/rw); }
        else { h = 14; w = 14 * (rw/rh); }
    }
    
    // Default fallback if no class provided
    const defaultClass = isDark ? 'border-gray-400' : 'border-gray-600';
    
    return (
        <div className={`flex items-center justify-center w-4 h-4`}>
            <div 
                style={{ width: w, height: h }} 
                className={`border-[1.5px] rounded-sm transition-colors ${className || defaultClass}`}
            ></div>
        </div>
    );
};

export const LocalCustomDropdown = ({ options, value, onChange, isOpen, onToggle, onClose, icon: Icon, width = "w-max", align = "center", disabledOptions = [], isDark = true }: any) => {
    const ref = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
    const [flyoutTop, setFlyoutTop] = useState<number>(0);
    const hoverTimeout = useRef<any>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) onClose(); };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside, true);
        return () => document.removeEventListener('mousedown', handleClickOutside, true);
    }, [isOpen, onClose]);

    useEffect(() => { if (!isOpen) { setHoveredGroup(null); } }, [isOpen]);

    const handleMouseEnterGroup = (label: string, e: React.MouseEvent) => {
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        if (listRef.current) {
            const listRect = listRef.current.getBoundingClientRect();
            const itemRect = e.currentTarget.getBoundingClientRect();
            setFlyoutTop(itemRect.top - listRect.top);
        }
        setHoveredGroup(label);
    };

    const handleMouseLeave = () => {
        hoverTimeout.current = setTimeout(() => {
            setHoveredGroup(null);
        }, 200);
    };

    const handleMouseEnterFlyout = () => {
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    };

    const bgClass = isDark ? 'bg-[#18181B] border-zinc-700' : 'bg-white border-gray-200';
    const hoverClass = isDark ? 'hover:bg-white/5' : 'hover:bg-gray-100';
    const iconColor = isDark ? 'text-zinc-500 group-hover:text-zinc-300' : 'text-gray-400 group-hover:text-gray-600';
    const optionHover = isDark ? 'hover:bg-zinc-800 hover:text-gray-200' : 'hover:bg-gray-100 hover:text-gray-900';
    const activeItem = isDark ? 'bg-cyan-500/10 text-cyan-400' : 'bg-cyan-50 text-cyan-600';
    const flyoutBg = isDark ? 'bg-[#1A1D21] border-zinc-700' : 'bg-white border-gray-200';
    const activeGroupItems = hoveredGroup ? (options.find((o: any) => typeof o === 'object' && o.label === hoveredGroup)?.items || []) : [];

    // Detect if this is likely an aspect ratio dropdown (options look like "16:9")
    const isRatioDropdown = options.length > 0 && typeof options[0] === 'string' && options[0].includes(':');
    // Detect if this is current value is a ratio
    const isRatioValue = typeof value === 'string' && value.includes(':');

    // Calculate dynamic class for AspectRatioIcon in Trigger to match other icons
    const ratioIconClass = isOpen 
        ? 'border-cyan-400' 
        : (isDark ? 'border-zinc-500 group-hover:border-zinc-300' : 'border-gray-400 group-hover:border-gray-600');

    return (
        <div className="relative h-full flex items-center" ref={ref} data-interactive="true">
            <div className={`flex items-center gap-1.5 cursor-pointer group h-full px-1.5 rounded transition-colors ${isOpen ? (isDark ? 'bg-white/5' : 'bg-gray-100') : ''} ${hoverClass}`} onClick={(e) => { e.stopPropagation(); onToggle(); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }} data-interactive="true">
                {isRatioValue ? (
                    <AspectRatioIcon ratio={value} isDark={isDark} className={ratioIconClass} />
                ) : (
                    Icon && <Icon size={13} className={`transition-colors ${isOpen ? 'text-cyan-400' : iconColor}`} />
                )}
                <span className={`text-[10px] font-medium transition-colors select-none ${isOpen ? (isDark ? 'text-gray-200' : 'text-gray-900') : (isDark ? 'text-zinc-400 group-hover:text-zinc-200' : 'text-gray-500 group-hover:text-gray-700')} ${Icon || isRatioValue ? 'min-w-[16px] text-center' : 'max-w-[70px] truncate'}`}>{value}</span>
                {!Icon && !isRatioValue && <Icons.ChevronRight size={10} className={`transition-all duration-200 ${isOpen ? 'rotate-[-90deg] text-cyan-400' : `rotate-90 ${isDark ? 'text-zinc-600 group-hover:text-zinc-400' : 'text-gray-400 group-hover:text-gray-600'}`}`} />}
            </div>

            {isOpen && (
                <div className={`absolute bottom-full mb-2 ${align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'} ${width} min-w-[120px] ${bgClass} border rounded-lg shadow-2xl py-1 z-[100] animate-in fade-in slide-in-from-bottom-2 duration-150 overflow-visible`} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} data-interactive="true">
                    <div ref={listRef} className="max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                        {options.map((opt: any) => {
                            const isGroup = typeof opt === 'object';
                            const label = isGroup ? opt.label : opt;
                            const isDisabled = !isGroup && disabledOptions.includes(label);
                            const isSelected = !isGroup && label === value;
                            const isGroupHovered = isGroup && hoveredGroup === label;
                            const containsSelection = isGroup && opt.items.includes(value);
                            
                            // Dynamic class for list item AspectRatioIcon
                            let itemRatioClass = '';
                            if (isSelected || (isGroup && isGroupHovered) || containsSelection) {
                                itemRatioClass = isDark ? 'border-cyan-400' : 'border-cyan-600';
                            } else {
                                itemRatioClass = isDark ? 'border-zinc-500 group-hover/item:border-zinc-300' : 'border-gray-400 group-hover/item:border-gray-600';
                            }

                            return (
                                <div 
                                    key={label}
                                    className={`relative px-3 py-1.5 text-[10px] font-medium rounded-md transition-colors flex items-center justify-between group/item cursor-pointer
                                        ${isDisabled 
                                            ? 'text-zinc-600 cursor-not-allowed opacity-50' 
                                            : (isSelected || (isGroup && isGroupHovered)
                                                ? activeItem 
                                                : (containsSelection 
                                                    ? (isDark ? 'text-cyan-400' : 'text-cyan-600') + ` ${optionHover}`
                                                    : (isDark ? 'text-zinc-400' : 'text-gray-500') + ` ${optionHover}`
                                                  )
                                            )
                                        }
                                    `}
                                    onMouseEnter={(e) => isGroup ? handleMouseEnterGroup(label, e) : setHoveredGroup(null)}
                                    onMouseLeave={handleMouseLeave}
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        if (!isGroup && !isDisabled) { onChange(label); onClose(); }
                                        // 移动端：点击分组项时显示二级菜单
                                        if (isGroup) { setHoveredGroup(hoveredGroup === label ? null : label); }
                                    }}
                                    onTouchEnd={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (!isGroup && !isDisabled) { onChange(label); onClose(); }
                                        // 移动端：点击分组项时显示二级菜单
                                        if (isGroup) { 
                                            if (listRef.current) {
                                                const listRect = listRef.current.getBoundingClientRect();
                                                const itemRect = e.currentTarget.getBoundingClientRect();
                                                setFlyoutTop(itemRect.top - listRect.top);
                                            }
                                            setHoveredGroup(hoveredGroup === label ? null : label); 
                                        }
                                    }}
                                >
                                    <div className="flex items-center gap-2">
                                        {isRatioDropdown && <AspectRatioIcon ratio={label} isDark={isDark} className={itemRatioClass} />}
                                        <span className="whitespace-nowrap pr-2">{label}</span>
                                    </div>
                                    {isSelected && <Icons.Check size={10} className="text-cyan-400 shrink-0 ml-2" />}
                                    {isGroup && <Icons.ChevronRight size={10} className={`shrink-0 ml-2 ${isGroupHovered ? 'text-cyan-400' : (isDark ? 'text-zinc-600' : 'text-gray-300')}`} />}
                                </div>
                            );
                        })}
                    </div>
                    {hoveredGroup && activeGroupItems.length > 0 && (
                        <div 
                            className={`absolute left-full ml-1.5 w-[130px] ${flyoutBg} border rounded-lg shadow-2xl py-1 z-[110] animate-in fade-in slide-in-from-left-2 duration-150 before:absolute before:-left-4 before:top-0 before:h-full before:w-4 before:bg-transparent`}
                            style={{ top: flyoutTop }}
                            onMouseEnter={handleMouseEnterFlyout}
                            onMouseLeave={handleMouseLeave}
                            data-interactive="true"
                        >
                            <div className="max-h-[250px] overflow-y-auto custom-scrollbar p-1">
                                {activeGroupItems.map((subItem: string) => {
                                    const isSubSelected = subItem === value;
                                    return (
                                        <div 
                                            key={subItem}
                                            className={`px-3 py-1.5 text-[10px] font-medium rounded-md transition-colors flex items-center justify-between cursor-pointer mb-0.5
                                                ${isSubSelected ? activeItem : optionHover}
                                                ${!isSubSelected && isDark ? 'text-gray-300' : ''} 
                                            `}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onChange(subItem);
                                                onClose();
                                            }}
                                            onTouchEnd={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onChange(subItem);
                                                onClose();
                                            }}
                                        >
                                            <span className="truncate">{subItem}</span>
                                            {isSubSelected && <Icons.Check size={10} className="text-cyan-400 shrink-0 ml-2" />}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const LocalThumbnailItem = memo(({ src, index, isDark }: { src: string, index: number, isDark: boolean }) => {
    const [loaded, setLoaded] = useState(false);
    return (
        <div className={`relative w-[48px] h-[48px] flex-shrink-0 border rounded-lg overflow-hidden shadow-sm group/thumb cursor-pointer hover:border-cyan-500/50 transition-colors ${isDark ? 'border-zinc-700 bg-black/40' : 'border-gray-300 bg-gray-100'}`}>
            <div className={`absolute inset-0 ${isDark ? 'bg-zinc-800/50' : 'bg-gray-200'}`} />
            <img src={src} className="absolute inset-0 w-full h-full object-cover will-change-[clip-path]" draggable={false} decoding="async" loading="lazy" onLoad={() => setLoaded(true)} style={{ clipPath: loaded ? 'inset(0 0 0% 0)' : 'inset(0 0 100% 0)', opacity: loaded ? 1 : 0, transition: 'clip-path 0.8s ease-out, opacity 0.3s ease-in' }} />
            <div className="absolute top-0 right-0 bg-black/60 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 rounded-bl z-10">{index + 1}</div>
        </div>
    );
});

export const LocalInputThumbnails = memo(({ inputs, ready, isDark }: { inputs: { src: string, isVideo: boolean }[], ready: boolean, isDark: boolean }) => {
    if (!inputs || inputs.length === 0) return null;
    return (
       <div className="flex justify-center gap-2 pb-2 overflow-x-auto no-scrollbar min-h-[56px]">
           {inputs.slice(0, 8).map((input, i) => (
               ready ? <LocalThumbnailItem key={input.src + i} src={input.src} index={i} isDark={isDark} /> : <div key={i} className={`relative w-[48px] h-[48px] flex-shrink-0 border rounded-lg overflow-hidden shadow-sm ${isDark ? 'border-zinc-700 bg-black/40' : 'border-gray-300 bg-gray-100'}`}><div className={`absolute inset-0 ${isDark ? 'bg-zinc-800/50' : 'bg-gray-200'}`} /></div>
           ))}
       </div>
    );
});

export const VideoPreview = ({ src, isDark }: { src: string, isDark: boolean }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(true);
    const togglePlay = (e: React.MouseEvent) => { e.stopPropagation(); const v = videoRef.current; if (v) { if (v.paused) { v.play(); setIsPlaying(true); } else { v.pause(); setIsPlaying(false); } } };
    return (
        <div className="relative w-full h-full group/video">
            <video ref={videoRef} src={src} className="w-full h-full object-cover pointer-events-none" loop muted autoPlay playsInline draggable={false} />
            <div className="absolute bottom-3 left-3 z-30 pointer-events-auto opacity-0 group-hover/video:opacity-100 transition-opacity">
                <button onClick={togglePlay} className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md border transition-all shadow-sm ${isDark ? 'bg-black/60 border-white/10 text-white hover:bg-black/80 hover:scale-110' : 'bg-white/60 border-black/10 text-black hover:bg-white/80 hover:scale-110'}`} data-interactive="true">
                    {isPlaying ? <Icons.Pause size={14} fill="currentColor" /> : <Icons.Play size={14} fill="currentColor" className="ml-0.5" />}
                </button>
            </div>
        </div>
    );
};

export const safeDownload = async (src: string) => {
    try {
      const isVideo = /\.(mp4|webm|mov|mkv)(\?|$)/i.test(src);
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); 
      link.href = url; 
      link.download = `download_${Date.now()}.${isVideo ? 'mp4' : 'png'}`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    } catch (e) {
      const link = document.createElement('a'); link.href = src; link.download = `download_${Date.now()}`; link.target = "_blank"; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
};

export const LocalMediaStack: React.FC<{ data: NodeData, updateData: any, currentSrc: string | undefined, onMaximize?: any, isDark?: boolean, selected?: boolean }> = ({ 
    data, updateData, currentSrc, onMaximize, isDark = true, selected
}) => {
    const stackRef = useRef<HTMLDivElement>(null);
    const artifacts = data.outputArtifacts || [];
    const sortedArtifacts = currentSrc ? [currentSrc, ...artifacts.filter(a => a !== currentSrc)] : artifacts;
    const showBadge = !data.isStackOpen && artifacts.length > 1;
    
    // 使用缩略图 - 节点内显示缩略图（1k清晰度），放大时显示原图
    const thumbnail = useThumbnail(currentSrc, 1024);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { if (data.isStackOpen && stackRef.current && !stackRef.current.contains(event.target as Node)) updateData(data.id, { isStackOpen: false }); };
        if (data.isStackOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [data.isStackOpen, data.id, updateData]);

    useEffect(() => { if (!selected && data.isStackOpen) updateData(data.id, { isStackOpen: false }); }, [selected, data.isStackOpen, data.id, updateData]);

    if (data.isStackOpen) {
        return (
            <div ref={stackRef} className="absolute top-0 left-0 h-full flex gap-4 z-[100] animate-in fade-in zoom-in-95 duration-200" onTouchStart={(e) => e.stopPropagation()} data-interactive="true">
                {sortedArtifacts.map((src, index) => {
                    const isMain = index === 0;
                    const isVideo = /\.(mp4|webm|mov|mkv)(\?|$)/i.test(src) || data.type === 'TEXT_TO_VIDEO';
                    return (
                      <div key={src + index} className={`relative h-full rounded-xl border ${isDark ? 'border-zinc-800 bg-black' : 'border-gray-200 bg-white'} overflow-hidden shadow-2xl flex-shrink-0 group/card ${isMain ? 'ring-2 ring-cyan-500/50' : ''}`} style={{ width: data.width }}>
                           {isVideo ? (
                               <video src={src} className="w-full h-full object-cover" controls={isMain} muted loop autoPlay playsInline />
                           ) : (
                               <img src={src} className={`w-full h-full object-contain ${isDark ? 'bg-[#09090b]' : 'bg-gray-50'}`} draggable={false} onMouseDown={(e) => e.preventDefault()} />
                           )}
                           <div className="absolute bottom-2 right-2 flex items-center gap-1.5 z-20 pointer-events-auto">
                               {!isMain && <button className="h-6 px-2 bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 rounded-md text-[9px] font-bold text-white transition-colors flex items-center gap-1 shadow-sm" onClick={(e) => { e.stopPropagation(); updateData(data.id, { [isVideo ? 'videoSrc' : 'imageSrc']: src, isStackOpen: false }); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); updateData(data.id, { [isVideo ? 'videoSrc' : 'imageSrc']: src, isStackOpen: false }); }} data-interactive="true"><Icons.Check size={10} className="text-cyan-400" /><span>Main</span></button>}
                               <button className="w-6 h-6 flex items-center justify-center bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 rounded-md text-white transition-colors shadow-sm" onClick={(e) => { e.stopPropagation(); onMaximize?.(data.id); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onMaximize?.(data.id); }} data-interactive="true"><Icons.Maximize2 size={12}/></button>
                               <button className="w-6 h-6 flex items-center justify-center bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 rounded-md text-white transition-colors shadow-sm" onClick={(e) => { e.stopPropagation(); e.preventDefault(); safeDownload(src); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); safeDownload(src); }} data-interactive="true"><Icons.Download size={12}/></button>
                           </div>
                           <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[9px] text-white font-mono border border-white/10 select-none">#{index + 1}</div>
                      </div>
                    );
                })}
                <div className="flex flex-col justify-center h-full pl-2 pr-6"><button className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all shadow-lg ${isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`} onClick={(e) => { e.stopPropagation(); updateData(data.id, { isStackOpen: false }); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); updateData(data.id, { isStackOpen: false }); }} data-interactive="true"><Icons.X size={20} /></button></div>
            </div>
        );
    }
    
    const isVideo = data.type === 'TEXT_TO_VIDEO' || (currentSrc && /\.(mp4|webm|mov|mkv)(\?|$)/i.test(currentSrc));

    return (
        <>
           {isVideo ? (
               currentSrc && <VideoPreview src={currentSrc} isDark={isDark || false} />
           ) : (
               thumbnail && <img src={thumbnail} className={`w-full h-full object-contain pointer-events-none ${isDark ? 'bg-[#09090b]' : 'bg-gray-50'}`} alt="Generated" draggable={false} />
           )}
           {showBadge && <div className="absolute top-2 right-2 bg-black/30 backdrop-blur-md hover:bg-black/50 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1 border border-white/10 z-30 pointer-events-auto cursor-pointer select-none shadow-lg transition-colors group/badge" onClick={(e) => { e.stopPropagation(); updateData(data.id, { isStackOpen: true }); }} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); updateData(data.id, { isStackOpen: true }); }} data-interactive="true"><Icons.Layers size={10} className="text-cyan-400"/><span className="font-bold tabular-nums">{artifacts.length}</span><Icons.ChevronRight size={10} className="text-zinc-400 group-hover/badge:text-white" /></div>}
        </>
    );
};

export const LoadingOverlay = () => {
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl overflow-hidden pointer-events-none border border-white/10 shadow-inner">
             
             {/* Liquid Pigment Background Base */}
             <div className="absolute inset-0 bg-[#1A1A2E] z-0" />

             {/* Organic Moving Blobs - Low Saturation Creamy Colors */}
             <div className="absolute inset-0 z-0 overflow-hidden opacity-60 mix-blend-screen filter blur-[80px]">
                 {/* Blob 1: Misty Purple */}
                 <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-[rgba(160,150,220,0.6)] rounded-full animate-blob-1" />
                 
                 {/* Blob 2: Dusty Cyan */}
                 <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-[rgba(130,180,200,0.6)] rounded-full animate-blob-2" />
                 
                 {/* Blob 3: Muted Pink */}
                 <div className="absolute top-[30%] left-[30%] w-[60%] h-[60%] bg-[rgba(220,160,180,0.5)] rounded-full animate-blob-3" />
             </div>

             {/* Frosted Glass Overlay - Top Layer */}
             <div className="absolute inset-0 bg-white/5 backdrop-blur-sm z-10" />
            
            {/* Center Loader UI */}
            <div className="relative z-20 flex flex-col items-center gap-2">
                <div className="p-3 bg-white/10 rounded-full border border-white/20 backdrop-blur-xl shadow-2xl relative overflow-hidden ring-1 ring-white/30">
                    <div className="absolute inset-0 bg-white/20 blur-xl rounded-full animate-pulse" />
                    <Icons.Loader2 size={24} className="text-white drop-shadow-md animate-spin relative z-10" />
                </div>
            </div>
        </div>
    );
};
