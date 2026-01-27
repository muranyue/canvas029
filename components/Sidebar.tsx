
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
  nodes: NodeData[];
  onPreviewMedia: (url: string, type: 'image' | 'video') => void;
  isDark?: boolean;
}

type MenuCategory = 'ADD' | 'WORKFLOW' | 'HISTORY' | 'ASSETS' | 'SETTINGS' | null;

const HistoryItem = memo(({ node, type, onClick }: { node: NodeData, type: 'image' | 'video', onClick: () => void }) => {
    const stackCount = node.outputArtifacts?.length || 0;
    
    return (
        <div 
           className="relative aspect-square rounded-lg overflow-hidden border border-zinc-800 cursor-pointer group bg-black"
           onClick={onClick}
        >
            {type === 'image' ? (
                <img src={node.imageSrc} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" decoding="async"/>
            ) : (
                <div className="w-full h-full relative bg-black">
                   <video src={node.videoSrc} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" muted preload="metadata" />
                   <div className="absolute inset-0 flex items-center justify-center">
                       <Icons.Play size={16} className="text-white opacity-50 group-hover:opacity-100 drop-shadow-md"/>
                   </div>
                </div>
            )}
            
            {stackCount > 1 && (
                <div className="absolute top-1 right-1 bg-black/60 backdrop-blur-md text-white text-[8px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 border border-white/10 z-10 shadow-sm">
                    <Icons.Layers size={8} className="text-cyan-400" />
                    <span className="font-bold">{stackCount}</span>
                </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                <div className="text-[9px] text-white truncate font-medium">{node.title}</div>
                <div className="text-[8px] text-zinc-400 truncate">{node.resolution || '1024x1024'}</div>
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.type === next.type && 
           prev.node.id === next.node.id && 
           prev.node.imageSrc === next.node.imageSrc && 
           prev.node.videoSrc === next.node.videoSrc &&
           prev.node.title === next.node.title &&
           (prev.node.outputArtifacts?.length || 0) === (next.node.outputArtifacts?.length || 0);
});

const Sidebar: React.FC<SidebarProps> = ({ 
  onAddNode, 
  onSaveWorkflow, 
  onLoadWorkflow, 
  onNewWorkflow,
  onImportAsset,
  onOpenSettings,
  onUpdateCanvasBg,
  nodes,
  onPreviewMedia,
  isDark = true
}) => {
  const [activeMenu, setActiveMenu] = useState<MenuCategory>(null);
  const [historyTab, setHistoryTab] = useState<'IMAGES' | 'VIDEOS'>('IMAGES');
  const menuRef = useRef<HTMLDivElement>(null);

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
    tooltip 
  }: { 
    icon: any, 
    category: MenuCategory, 
    tooltip: string 
  }) => (
    <div 
        className={`relative flex items-center justify-center w-10 h-10 md:mb-3 rounded-xl cursor-pointer transition-all duration-200 group
          ${activeMenu === category ? itemActive : itemText + ' ' + itemHover}
        `}
        onClick={(e) => {
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
    const imageNodes = uniqueNodes.filter(n => n.imageSrc && !n.isLoading && (n.type === NodeType.TEXT_TO_IMAGE || n.type === NodeType.ORIGINAL_IMAGE));
    const videoNodes = uniqueNodes.filter(n => n.videoSrc && !n.isLoading && n.type === NodeType.TEXT_TO_VIDEO);

    const items = historyTab === 'IMAGES' ? imageNodes : videoNodes;
    const tabActive = isDark ? 'bg-zinc-700 text-white' : 'bg-white text-gray-900 shadow-sm border border-gray-200';
    const tabInactive = isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-500 hover:text-gray-700';

    return (
        <div className="w-full flex flex-col gap-3">
             <div className={`flex rounded-lg p-1 border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-100 border-gray-200'}`}>
                 <button className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${historyTab === 'IMAGES' ? tabActive : tabInactive}`} onClick={() => setHistoryTab('IMAGES')}>IMAGES</button>
                 <button className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${historyTab === 'VIDEOS' ? tabActive : tabInactive}`} onClick={() => setHistoryTab('VIDEOS')}>VIDEOS</button>
             </div>

             <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1 content-start">
                 {items.length === 0 && (
                     <div className="col-span-2 text-center py-6 text-[10px] text-zinc-600">
                         No generated {historyTab.toLowerCase()} yet.
                     </div>
                 )}
                 {items.map(node => (
                     <HistoryItem 
                        key={node.id} 
                        node={node} 
                        type={historyTab === 'IMAGES' ? 'image' : 'video'} 
                        onClick={() => onPreviewMedia((historyTab === 'IMAGES' ? node.imageSrc : node.videoSrc) || '', historyTab === 'IMAGES' ? 'image' : 'video')}
                     />
                 ))}
             </div>
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
            <SubMenuItem icon={Icons.Video} label="Text to Video" desc="Veo 3, Sora 2" onClick={() => onAddNode(NodeType.TEXT_TO_VIDEO)} />
            <SubMenuItem icon={Icons.Image} label="Text to Image" desc="Gemini 3, Imagen 3" onClick={() => onAddNode(NodeType.TEXT_TO_IMAGE)} />
            <SubMenuItem icon={Icons.FileText} label="Creative Desc" desc="Prompt Assistant" onClick={() => onAddNode(NodeType.CREATIVE_DESC)} />
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
            <SubMenuItem icon={Icons.Upload} label="Import Asset" onClick={onImportAsset} />
          </>
        );
        break;
    }

    return (
      <div className={`absolute z-40 flex items-start 
          md:left-3 md:top-0 md:bottom-auto md:w-auto 
          fixed bottom-20 left-4 right-4 md:static`}>
          <div className={`${menuBg} rounded-2xl p-3 flex flex-col gap-1 w-full md:w-64 animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-left-2 shadow-2xl border max-h-[60vh] md:max-h-none overflow-y-auto`}>
            <div className={`px-2 py-1 mb-2 border-b text-[10px] font-bold uppercase tracking-wider ${titleColor}`}>
              {title}
            </div>
            {content}
          </div>
      </div>
    );
  };

  return (
    <div ref={menuRef}>
        {/* Desktop Sidebar */}
        <div className="hidden md:flex fixed left-4 top-1/2 -translate-y-1/2 z-[200] items-start">
            {/* Main Bar */}
            <div className={`${sidebarBg} backdrop-blur-md shadow-2xl border rounded-2xl p-2 flex flex-col items-center`}>
                <div className={`w-8 h-1 rounded-full mb-4 ${isDark ? 'bg-zinc-700' : 'bg-gray-300'}`}></div>
                
                <SidebarItem icon={Icons.Plus} category="ADD" tooltip="Add Node" />
                <div className={`w-full h-px my-2 ${dividerColor}`} />
                <SidebarItem icon={Icons.Folder} category="WORKFLOW" tooltip="Workflow" />
                <SidebarItem icon={Icons.Clock} category="HISTORY" tooltip="History" />
                <SidebarItem icon={Icons.Image} category="ASSETS" tooltip="Assets" />
                <div className={`w-full h-px my-2 ${dividerColor}`} />
                <SidebarItem icon={Icons.Settings} category="SETTINGS" tooltip="Settings" />
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
                    <div className="fixed inset-0 bg-black/50 z-[-1]" onClick={() => setActiveMenu(null)}></div>
                    {renderSubMenu()}
                 </>
             )}
        </div>
    </div>
  );
};

export default Sidebar;
