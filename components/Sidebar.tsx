
import React, { useState, useRef, useEffect, memo, useMemo } from 'react';
import { Icons } from './Icons';
import { NodeType, NodeData } from '../types';

interface SidebarProps {
  onAddNode: (type: NodeType) => void;
  onSaveWorkflow: () => void;
  onLoadWorkflow: () => void;
  onNewWorkflow: () => void;
  onImportAsset: () => void;
  onOpenSettings: (tab: string) => void;
  onUpdateCanvasBg: (color: string) => void;
  desktopPlatform: 'WIN' | 'MAC';
  onToggleDesktopPlatform: () => void;
  nodes: NodeData[];
  onPreviewMedia: (url: string, type: 'image' | 'video') => void;
  isDark?: boolean;
}

type MenuCategory = 'ADD' | 'WORKFLOW' | 'HISTORY' | 'ASSETS' | 'SETTINGS' | null;
type MenuAnchorCategory = Exclude<MenuCategory, null | 'SETTINGS'>;

interface HistoryNodeEntry {
    key: string;
    nodeId: string;
    primarySrc: string;
    sources: string[];
    type: 'image' | 'video';
    title: string;
    resolution?: string;
}

const collectHistorySources = (currentSrc?: string, artifacts?: string[]) => {
    const seen = new Set<string>();
    const ordered = [...(currentSrc ? [currentSrc] : []), ...(artifacts || [])];
    const result: string[] = [];

    ordered.forEach((src) => {
        if (!src || seen.has(src)) return;
        seen.add(src);
        result.push(src);
    });

    return result;
};

const HistoryItem = memo(({ entry, isExpanded, onClick }: { entry: HistoryNodeEntry, isExpanded: boolean, onClick: () => void }) => {
    const stackCount = entry.sources.length;

    return (
        <div 
           className="relative aspect-square rounded-lg overflow-hidden border border-zinc-800 cursor-pointer group bg-black"
           onClick={onClick}
           onTouchEnd={(e) => {
               e.preventDefault();
               e.stopPropagation();
               onClick();
           }}
        >
            {entry.type === 'image' ? (
                <img src={entry.primarySrc} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" decoding="async"/>
            ) : (
                <div className="w-full h-full relative bg-black">
                   <video src={entry.primarySrc} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" muted preload="metadata" />
                   <div className="absolute inset-0 flex items-center justify-center">
                       <Icons.Play size={16} className="text-white opacity-50 group-hover:opacity-100 drop-shadow-md"/>
                   </div>
                </div>
            )}
            
            {stackCount > 1 && (
                <div className="absolute top-1 right-1 bg-black/60 backdrop-blur-md text-white text-[8px] px-1.5 py-0.5 rounded-full flex items-center gap-1 border border-white/10 z-10 shadow-sm">
                    <Icons.Layers size={8} className="text-cyan-400" />
                    <span className="font-bold">{stackCount}</span>
                    <Icons.ChevronRight size={8} className={`transition-transform ${isExpanded ? 'rotate-90 text-white' : 'text-zinc-400'}`} />
                </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                <div className="text-[9px] text-white truncate font-medium">{entry.title}</div>
                <div className="text-[8px] text-zinc-400 truncate">{entry.resolution || '1024x1024'}</div>
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.entry.key === next.entry.key &&
           prev.entry.primarySrc === next.entry.primarySrc &&
           prev.entry.title === next.entry.title &&
           prev.entry.resolution === next.entry.resolution &&
           prev.entry.sources.length === next.entry.sources.length &&
           prev.isExpanded === next.isExpanded;
});

const WindowsLogoIcon = ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M2.8 4.2l8.2-1.1v8.7H2.8V4.2zm9.6-1.3L21.2 1.7v10.1h-8.8V2.9zM2.8 12.9H11v8.8l-8.2-1.1v-7.7zm9.6 0h8.8v10.1l-8.8-1.2v-8.9z" />
    </svg>
);

const AppleLogoIcon = ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.38 12.37c-.02-2.2 1.8-3.25 1.88-3.3-1.03-1.5-2.63-1.7-3.2-1.72-1.35-.14-2.65.8-3.33.8-.7 0-1.74-.78-2.86-.76-1.47.02-2.82.86-3.58 2.2-1.53 2.66-.39 6.58 1.1 8.72.73 1.05 1.6 2.23 2.74 2.19 1.09-.04 1.5-.7 2.82-.7 1.31 0 1.69.7 2.84.67 1.18-.02 1.92-1.06 2.64-2.12.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.26-.87-2.28-3.52z" />
        <path d="M14.72 6.3c.6-.73 1-1.74.89-2.75-.86.03-1.9.57-2.52 1.3-.55.64-1.03 1.67-.9 2.65.95.07 1.93-.48 2.53-1.2z" />
    </svg>
);

const Sidebar: React.FC<SidebarProps> = ({ 
  onAddNode, 
  onSaveWorkflow, 
  onLoadWorkflow, 
  onNewWorkflow,
  onImportAsset,
  onOpenSettings,
  onUpdateCanvasBg,
  desktopPlatform,
  onToggleDesktopPlatform,
  nodes,
  onPreviewMedia,
  isDark = true
}) => {
  const [activeMenu, setActiveMenu] = useState<MenuCategory>(null);
  const [historyTab, setHistoryTab] = useState<'IMAGES' | 'VIDEOS'>('IMAGES');
  const [expandedHistoryKey, setExpandedHistoryKey] = useState<string | null>(null);
  const [isDesktopView, setIsDesktopView] = useState(() => window.innerWidth >= 768);
  const [desktopSubMenuTop, setDesktopSubMenuTop] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const desktopSidebarRef = useRef<HTMLDivElement>(null);
  const menuItemRefs = useRef<Partial<Record<MenuAnchorCategory, HTMLDivElement | null>>>({});

  // Deduplicate nodes for history display
  const uniqueNodes = useMemo(() => {
      const map = new Map<string, NodeData>();
      nodes.forEach(n => {
          if (!map.has(n.id)) map.set(n.id, n);
      });
      return Array.from(map.values());
  }, [nodes]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktopView(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isDesktopView || !activeMenu || activeMenu === 'SETTINGS') return;
    const anchor = menuItemRefs.current[activeMenu];
    const sidebar = desktopSidebarRef.current;
    if (!anchor || !sidebar) return;

    const anchorRect = anchor.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    setDesktopSubMenuTop(anchorRect.top + anchorRect.height / 2 - sidebarRect.top);
  }, [activeMenu, isDesktopView]);

  useEffect(() => {
    if (activeMenu !== 'HISTORY') {
      setExpandedHistoryKey(null);
    }
  }, [activeMenu]);

  useEffect(() => {
    setExpandedHistoryKey(null);
  }, [historyTab]);

  const toggleMenu = (category: MenuCategory) => {
    if (category === 'SETTINGS') {
        setActiveMenu(null); // Close any open menu
        onOpenSettings('API'); // Directly open modal
    } else {
        setActiveMenu(prev => prev === category ? null : category);
    }
  };

  // Theme Classes
  const sidebarBg = isDark ? 'bg-[#1A1D21]/90 border-zinc-700/50' : 'bg-white/90 border-gray-200';
  const menuBg = isDark ? 'bg-[#1A1D21] border-zinc-700' : 'bg-white border-gray-200';
  const itemHover = isDark ? 'hover:bg-zinc-800' : 'hover:bg-gray-100';
  const itemText = isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-900';
  const itemActive = isDark ? 'bg-zinc-800 text-cyan-400' : 'bg-cyan-50 text-cyan-600';
  const dividerColor = isDark ? 'bg-zinc-800' : 'bg-gray-200';
  const titleColor = isDark ? 'text-gray-500 border-zinc-800' : 'text-gray-400 border-gray-100';
  
  const SidebarItem = ({ 
    icon: Icon, 
    category, 
    tooltip,
    trackAnchor = false,
  }: { 
    icon: any, 
    category: MenuCategory, 
    tooltip: string,
    trackAnchor?: boolean,
  }) => (
    <div 
        ref={(el) => {
          if (!trackAnchor || !category || category === 'SETTINGS') return;
          menuItemRefs.current[category as MenuAnchorCategory] = el;
        }}
        className={`relative flex items-center justify-center w-10 h-10 md:mb-3 rounded-xl cursor-pointer transition-all duration-200 group
          ${activeMenu === category ? itemActive : itemText + ' ' + itemHover}
        `}
        onClick={(e) => {
          e.stopPropagation();
          toggleMenu(category);
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleMenu(category);
        }}
    >
      <Icon size={20} />
      {/* Tooltip - Desktop Only */}
      {activeMenu !== category && (
        <div className={`hidden md:block absolute left-full ml-3 px-2 py-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 border shadow-xl text-xs ${isDark ? 'bg-zinc-900 text-gray-200 border-zinc-700' : 'bg-white text-gray-800 border-gray-200'}`}>
          {tooltip}
        </div>
      )}
    </div>
  );

  const SubMenuItem = ({ 
    icon: Icon, 
    label, 
    onClick, 
    desc,
    active
  }: { 
    icon: any, 
    label: string, 
    onClick: () => void, 
    desc?: string,
    active?: boolean
  }) => (
    <div 
      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors w-full group ${active ? (isDark ? 'bg-zinc-800/80' : 'bg-gray-100') : itemHover}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
        // Close menu on mobile after selection
        if (window.innerWidth < 768) setActiveMenu(null);
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
        // Close menu on mobile after selection
        setActiveMenu(null);
      }}
    >
      <div className={`w-8 h-8 flex items-center justify-center border rounded-lg shadow-sm shrink-0 transition-colors ${active ? 'text-cyan-400 border-cyan-500/30' : (isDark ? 'bg-zinc-800 border-zinc-700 text-gray-400 group-hover:text-cyan-400' : 'bg-gray-50 border-gray-200 text-gray-400 group-hover:text-cyan-600')}`}>
        <Icon size={16} />
      </div>
      <div className="flex flex-col min-w-[120px]">
        <span className={`text-sm font-medium ${active ? (isDark ? 'text-white' : 'text-black') : (isDark ? 'text-gray-300 group-hover:text-white' : 'text-gray-700 group-hover:text-black')}`}>{label}</span>
        {desc && <span className="text-[10px] text-gray-500 group-hover:text-gray-400">{desc}</span>}
      </div>
      {active && <Icons.ChevronRight size={14} className="ml-auto text-cyan-500" />}
    </div>
  );

  const renderHistoryContent = () => {
    const imageEntries: HistoryNodeEntry[] = uniqueNodes.flatMap((node) => {
        if (node.isLoading) return [];
        if (node.type !== NodeType.TEXT_TO_IMAGE && node.type !== NodeType.ORIGINAL_IMAGE) return [];

        const sources = collectHistorySources(node.imageSrc, node.outputArtifacts);
        if (sources.length === 0) return [];

        return [{
            key: `${node.id}-image`,
            nodeId: node.id,
            primarySrc: (node.imageSrc && sources.includes(node.imageSrc)) ? node.imageSrc : sources[0],
            sources,
            type: 'image' as const,
            title: node.title,
            resolution: node.resolution,
        }];
    });

    const videoEntries: HistoryNodeEntry[] = uniqueNodes.flatMap((node) => {
        if (node.isLoading) return [];
        if (node.type !== NodeType.TEXT_TO_VIDEO) return [];

        const sources = collectHistorySources(node.videoSrc, node.outputArtifacts);
        if (sources.length === 0) return [];

        return [{
            key: `${node.id}-video`,
            nodeId: node.id,
            primarySrc: (node.videoSrc && sources.includes(node.videoSrc)) ? node.videoSrc : sources[0],
            sources,
            type: 'video' as const,
            title: node.title,
            resolution: node.resolution,
        }];
    });

    const items = historyTab === 'IMAGES' ? imageEntries : videoEntries;
    const expandedItem = items.find((item) => item.key === expandedHistoryKey) || null;
    const tabActive = isDark ? 'bg-zinc-700 text-white' : 'bg-white text-gray-900 shadow-sm border border-gray-200';
    const tabInactive = isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-500 hover:text-gray-700';

    return (
        <div className="w-full flex flex-col gap-3">
             <div className={`flex rounded-lg p-1 border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-100 border-gray-200'}`}>
                 <button className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${historyTab === 'IMAGES' ? tabActive : tabInactive}`} onClick={() => setHistoryTab('IMAGES')} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setHistoryTab('IMAGES'); }}>IMAGES</button>
                 <button className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${historyTab === 'VIDEOS' ? tabActive : tabInactive}`} onClick={() => setHistoryTab('VIDEOS')} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setHistoryTab('VIDEOS'); }}>VIDEOS</button>
             </div>

             <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1 content-start">
                 {items.length === 0 && (
                     <div className="col-span-2 text-center py-6 text-[10px] text-zinc-600">
                         No generated {historyTab.toLowerCase()} yet.
                     </div>
                 )}
                 {items.map((entry) => (
                     <HistoryItem 
                        key={entry.key}
                        entry={entry}
                        isExpanded={expandedHistoryKey === entry.key}
                        onClick={() => {
                            if (entry.sources.length <= 1) {
                                onPreviewMedia(entry.primarySrc, entry.type);
                                return;
                            }
                            setExpandedHistoryKey(prev => prev === entry.key ? null : entry.key);
                        }}
                     />
                 ))}
             </div>

             {expandedItem && expandedItem.sources.length > 1 && (
                 <div className={`rounded-lg border p-2 ${isDark ? 'bg-zinc-900/80 border-zinc-700' : 'bg-gray-50 border-gray-200'}`}>
                     <div className={`text-[10px] font-bold mb-2 flex items-center justify-between ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                         <span className="truncate pr-2">{expandedItem.title}</span>
                         <span className={`${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>{expandedItem.sources.length} items</span>
                     </div>
                     <div className="grid grid-cols-2 gap-2 max-h-[220px] md:max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                         {expandedItem.sources.map((src, index) => {
                             const isCurrent = src === expandedItem.primarySrc;
                             return (
                                 <button
                                     key={`${expandedItem.key}-source-${index}`}
                                     type="button"
                                     className={`relative aspect-square rounded-md overflow-hidden border transition-colors ${isCurrent ? 'border-cyan-500' : (isDark ? 'border-zinc-700 hover:border-zinc-500' : 'border-gray-300 hover:border-gray-400')}`}
                                     onClick={(e) => {
                                         e.stopPropagation();
                                         onPreviewMedia(src, expandedItem.type);
                                     }}
                                     onTouchEnd={(e) => {
                                         e.preventDefault();
                                         e.stopPropagation();
                                         onPreviewMedia(src, expandedItem.type);
                                     }}
                                 >
                                     {expandedItem.type === 'image' ? (
                                         <img src={src} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                     ) : (
                                         <video src={src} className="w-full h-full object-cover" muted preload="metadata" />
                                     )}
                                     <div className="absolute bottom-1 left-1 text-[8px] px-1 py-0.5 rounded bg-black/70 text-white font-bold">#{index + 1}</div>
                                     {isCurrent && <div className="absolute top-1 right-1 text-[8px] px-1 py-0.5 rounded bg-cyan-500 text-white font-bold">Current</div>}
                                 </button>
                             );
                         })}
                     </div>
                 </div>
             )}
        </div>
    );
  };

  const renderSubMenu = () => {
    if (!activeMenu || activeMenu === 'SETTINGS') return null;

    let content = null;
    let title = "";

    switch (activeMenu) {
      case 'ADD':
        title = "Add Node";
        content = (
          <>
            <SubMenuItem icon={Icons.Video} label="Text to Video" desc="Veo 3, Sora 2" onClick={() => { onAddNode(NodeType.TEXT_TO_VIDEO); setActiveMenu(null); }} />
            <SubMenuItem icon={Icons.Image} label="Text to Image" desc="Gemini 3, Imagen 3" onClick={() => { onAddNode(NodeType.TEXT_TO_IMAGE); setActiveMenu(null); }} />
            <SubMenuItem icon={Icons.FileText} label="Creative Desc" desc="Prompt Assistant" onClick={() => { onAddNode(NodeType.CREATIVE_DESC); setActiveMenu(null); }} />
          </>
        );
        break;
      case 'WORKFLOW':
        title = "My Workflow";
        content = (
          <>
            <SubMenuItem icon={Icons.FilePlus} label="New Workflow" onClick={onNewWorkflow} />
            <SubMenuItem icon={Icons.FolderOpen} label="Open Workflow" onClick={onLoadWorkflow} />
            <SubMenuItem icon={Icons.Save} label="Save Workflow" onClick={onSaveWorkflow} />
          </>
        );
        break;
      case 'HISTORY':
        title = "History";
        content = renderHistoryContent();
        break;
      case 'ASSETS':
        title = "Assets";
        content = (
          <>
            <SubMenuItem icon={Icons.Album} label="My Assets" onClick={() => {}} />
            <SubMenuItem icon={Icons.Upload} label="Import Asset" onClick={() => { onImportAsset(); setActiveMenu(null); }} />
          </>
        );
        break;
    }

    const panel = (
      <div className={`${menuBg} rounded-2xl p-3 flex flex-col gap-1 w-full md:w-64 animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-left-2 shadow-2xl border max-h-[60vh] md:max-h-none overflow-y-auto`}>
        <div className={`px-2 py-1 mb-2 border-b text-[10px] font-bold uppercase tracking-wider ${titleColor}`}>
          {title}
        </div>
        {content}
      </div>
    );

    if (isDesktopView) {
      const shouldCenterAlign = activeMenu === 'WORKFLOW' || activeMenu === 'ASSETS';
      return (
        <div
          className="absolute z-40 left-3 w-64"
          style={shouldCenterAlign ? { top: desktopSubMenuTop, transform: 'translateY(-50%)' } : { top: 0 }}
        >
          {panel}
        </div>
      );
    }

    return (
      <div className="fixed z-40 bottom-20 left-4 right-4">
        {panel}
      </div>
    );
  };

  return (
    <div ref={menuRef}>
        {/* Desktop Sidebar */}
        <div ref={desktopSidebarRef} className="hidden md:flex fixed left-4 top-1/2 -translate-y-1/2 z-[200] items-start">
            {/* Main Bar */}
            <div className={`${sidebarBg} backdrop-blur-md shadow-2xl border rounded-2xl p-2 flex flex-col items-center`}>
                <div className={`w-8 h-1 rounded-full mb-4 ${isDark ? 'bg-zinc-700' : 'bg-gray-300'}`}></div>
                
                <SidebarItem icon={Icons.Plus} category="ADD" tooltip="Add Node" trackAnchor />
                <div className={`w-full h-px my-2 ${dividerColor}`} />
                <SidebarItem icon={Icons.Folder} category="WORKFLOW" tooltip="Workflow" trackAnchor />
                <SidebarItem icon={Icons.Clock} category="HISTORY" tooltip="History" trackAnchor />
                <SidebarItem icon={Icons.Image} category="ASSETS" tooltip="Assets" trackAnchor />
                <div className={`w-full h-px my-2 ${dividerColor}`} />
                <SidebarItem icon={Icons.Settings} category="SETTINGS" tooltip="Settings" />
                <div
                    className={`relative flex items-center justify-center w-10 h-10 md:mt-2 rounded-xl cursor-pointer transition-all duration-200 group ${itemText} ${itemHover} ${isDark ? 'border border-zinc-700/60' : 'border border-gray-200'}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleDesktopPlatform();
                    }}
                    onTouchEnd={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleDesktopPlatform();
                    }}
                >
                    {desktopPlatform === 'MAC' ? <AppleLogoIcon size={18} /> : <WindowsLogoIcon size={18} />}
                    <div className={`hidden md:block absolute left-full ml-3 px-2 py-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 border shadow-xl text-xs ${isDark ? 'bg-zinc-900 text-gray-200 border-zinc-700' : 'bg-white text-gray-800 border-gray-200'}`}>
                        {desktopPlatform === 'MAC' ? 'Mac Mode' : 'Win Mode'}
                    </div>
                </div>
            </div>

            <div className="relative">
                {renderSubMenu()}
            </div>
        </div>

        {/* Mobile Bottom Navigation Bar */}
        <div className="md:hidden fixed bottom-4 left-4 right-4 z-[200]">
             <div className={`${sidebarBg} backdrop-blur-md shadow-2xl border rounded-2xl p-2 flex items-center justify-around`}>
                <SidebarItem icon={Icons.Plus} category="ADD" tooltip="Add" />
                <div className={`h-8 w-px ${dividerColor}`} />
                <SidebarItem icon={Icons.Folder} category="WORKFLOW" tooltip="Workflow" />
                <SidebarItem icon={Icons.Clock} category="HISTORY" tooltip="History" />
                <SidebarItem icon={Icons.Image} category="ASSETS" tooltip="Assets" />
                <div className={`h-8 w-px ${dividerColor}`} />
                <SidebarItem icon={Icons.Settings} category="SETTINGS" tooltip="Settings" />
             </div>
             
             {/* Submenu Overlay for Mobile */}
             {activeMenu && activeMenu !== 'SETTINGS' && (
                 <>
                    <div className="fixed inset-0 bg-black/50 z-[-1]" onClick={() => setActiveMenu(null)} onTouchEnd={(e) => { e.preventDefault(); setActiveMenu(null); }}></div>
                    {renderSubMenu()}
                 </>
             )}
        </div>
    </div>
  );
};

export default Sidebar;
