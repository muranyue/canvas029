
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icons } from '../Icons';
import { MODEL_REGISTRY, getModelConfig, saveModelConfig, ModelConfig, registerCustomModel } from '../../services/geminiService';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    isDark: boolean;
}

// Helper to categorize models
const getProvider = (key: string, name: string): string => {
    if (key.startsWith('Custom: ')) return 'Custom Models';
    
    const lowerKey = key.toLowerCase();
    const lowerName = name.toLowerCase();
    
    // Google Gemini
    if (lowerKey.includes('banana') || lowerKey.includes('gemini') || lowerKey.includes('veo') || lowerName.includes('veo') || lowerName.includes('gemini')) return 'Google Gemini';
    
    // ByteDance (formerly Jmeng) - Jmeng 4.5, 3.5, 4
    if (lowerName.includes('jmeng') || lowerKey.includes('doubao') || lowerKey.includes('seedance') || lowerKey.includes('jimeng') || lowerKey.includes('即梦')) return 'ByteDance';
    
    // Vidu - Vidu Q2 Pro, Turbo
    if (lowerName.includes('vidu') || lowerKey.includes('vidu') || lowerKey.includes('q2-')) return 'Vidu';

    // MiniMax (Hailuo)
    if (lowerKey.includes('hailuo') || lowerKey.includes('minimax') || lowerKey.includes('海螺') || lowerName.includes('hailuo') || lowerName.includes('minimax')) return 'MiniMax';
    
    // Kling AI
    if (lowerKey.includes('kling') || lowerKey.includes('可灵') || lowerName.includes('kling')) return 'Kling AI';
    
    // OpenAI (Sora)
    if (lowerKey.includes('sora') || lowerName.includes('sora')) return 'OpenAI';
    
    // Midjourney
    if (lowerKey.includes('mj') || lowerName.includes('midjourney')) return 'Midjourney';
    
    // SiliconFlow (Flux)
    if (lowerKey.includes('flux') || lowerName.includes('flux')) return 'SiliconFlow';
    
    // Alibaba Cloud (Wan, Zimage, Qwen)
    if (lowerKey.includes('wan') || lowerKey.includes('zimage') || lowerKey.includes('qwen') || lowerName.includes('wan') || lowerName.includes('zimage') || lowerName.includes('qwen')) return 'Alibaba Cloud';
    
    // xAI
    if (lowerKey.includes('grok') || lowerName.includes('grok')) return 'xAI';
    
    return 'Other';
};

const PROVIDER_ICONS: Record<string, any> = {
    'Google Gemini': Icons.Cpu,
    'ByteDance': Icons.Zap,
    'Vidu': Icons.Clapperboard,
    'MiniMax': Icons.Globe,
    'Kling AI': Icons.Video,
    'OpenAI': Icons.Sparkles,
    'Midjourney': Icons.Image,
    'SiliconFlow': Icons.Layers,
    'Alibaba Cloud': Icons.Cpu,
    'xAI': Icons.Cpu,
    'Other': Icons.Database,
    'Custom Models': Icons.User
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, isDark }) => {
    const [selectedProvider, setSelectedProvider] = useState<string>('Google Gemini');
    const [editingModelKey, setEditingModelKey] = useState<string | null>(null);
    const [configs, setConfigs] = useState<Record<string, ModelConfig>>({});
    
    // Create Model State
    const [isCreating, setIsCreating] = useState(false);
    const [newModelName, setNewModelName] = useState('');
    const [newModelId, setNewModelId] = useState('');
    const [newModelType, setNewModelType] = useState<'IMAGE' | 'VIDEO' | null>(null);

    // Refresh trigger
    const [registryTick, setRegistryTick] = useState(0);

    // File Input Ref for Import
    const configInputRef = useRef<HTMLInputElement>(null);

    // Load configs when opening
    useEffect(() => {
        if (isOpen) {
            const newConfigs: Record<string, ModelConfig> = {};
            Object.keys(MODEL_REGISTRY).forEach(key => {
                newConfigs[key] = getModelConfig(key);
            });
            setConfigs(newConfigs);
        }
    }, [isOpen, registryTick]);

    // Group models
    const groupedModels = useMemo(() => {
        // Initialize Other explicitly so it remains even if empty
        const groups: Record<string, string[]> = { 'Other': [] };
        
        Object.keys(MODEL_REGISTRY).forEach(key => {
            const def = MODEL_REGISTRY[key];
            const provider = getProvider(key, def.name);
            if (!groups[provider]) groups[provider] = [];
            groups[provider].push(key);
        });
        return groups;
    }, [registryTick]);

    const providers = Object.keys(groupedModels).sort((a, b) => {
        if (a === 'Custom Models') return -1;
        if (b === 'Custom Models') return 1;
        if (a === 'Other') return 1; // Keep Other at bottom
        if (b === 'Other') return -1;
        return a.localeCompare(b);
    });

    const updateConfig = (modelName: string, field: keyof ModelConfig, value: string) => {
        setConfigs(prev => ({
            ...prev,
            [modelName]: { ...prev[modelName], [field]: value }
        }));
    };

    const handleSave = (modelName: string) => {
        if (configs[modelName]) {
            saveModelConfig(modelName, configs[modelName]);
        }
        setEditingModelKey(null);
    };

    const startCreation = (type: 'IMAGE' | 'VIDEO') => {
        setNewModelType(type);
        setNewModelName('');
        setNewModelId('');
        setIsCreating(true);
    };

    const confirmCreation = () => {
        if (!newModelName || !newModelId || !newModelType) return;
        
        const strategyType = newModelType === 'IMAGE' ? 'IMAGE_GEN' : 'VIDEO_GEN_FORM'; 
        
        registerCustomModel(newModelName, {
            id: newModelId,
            name: newModelName,
            type: strategyType,
            category: newModelType,
            defaultEndpoint: newModelType === 'IMAGE' ? '/v1/images/generations' : '/v1/videos'
        });

        setConfigs(prev => ({
            ...prev,
            [newModelName]: getModelConfig(newModelName)
        }));

        setRegistryTick(prev => prev + 1);
        setIsCreating(false);
        setNewModelType(null);
        setEditingModelKey(newModelName);
        setSelectedProvider('Custom Models');
    };

    // --- Import / Export Handlers ---
    const handleExportConfig = () => {
        const exportData: any = {
            version: 1,
            timestamp: new Date().toISOString(),
            configs: {},
            customModels: {}
        };

        // Export Custom Models
        try {
            const customModels = localStorage.getItem('CUSTOM_MODEL_REGISTRY');
            if (customModels) {
                exportData.customModels = JSON.parse(customModels);
            }
        } catch (e) { console.error("Error exporting custom models", e); }

        // Export Configurations
        Object.keys(MODEL_REGISTRY).forEach(key => {
            const config = getModelConfig(key);
            // Only export if customized (has key or modified endpoint)
            if (config.key || config.endpoint !== MODEL_REGISTRY[key].defaultEndpoint) {
                exportData.configs[key] = config;
            }
        });

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ai-studio-config-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                
                let importedCount = 0;

                // Import Custom Models
                if (data.customModels) {
                    Object.entries(data.customModels).forEach(([key, val]: [string, any]) => {
                         registerCustomModel(key, val);
                    });
                }

                // Import Configs
                if (data.configs) {
                    Object.entries(data.configs).forEach(([key, val]: [string, any]) => {
                        saveModelConfig(key, val as ModelConfig);
                        importedCount++;
                    });
                }
                
                // Force refresh
                setRegistryTick(prev => prev + 1);
                
                // Also update local state 'configs' to reflect changes immediately
                const newConfigs: Record<string, ModelConfig> = {};
                // We re-fetch from registry because custom models might have been added
                // Note: MODEL_REGISTRY is updated in memory by registerCustomModel
                Object.keys(MODEL_REGISTRY).forEach(key => {
                    newConfigs[key] = getModelConfig(key);
                });
                setConfigs(newConfigs);

                alert(`Configuration imported successfully! (${importedCount} settings updated)`);
            } catch (err) {
                console.error(err);
                alert('Failed to import configuration: Invalid file format.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // Styling
    const baseBg = isDark ? 'bg-[#18181b]' : 'bg-white';
    const textMain = isDark ? 'text-gray-100' : 'text-gray-900';
    const textSub = isDark ? 'text-gray-400' : 'text-gray-500';
    const borderMain = isDark ? 'border-zinc-800' : 'border-gray-100';
    
    const sidebarBg = isDark ? 'bg-[#18181b] border-zinc-800' : 'bg-white border-gray-100';
    const sidebarItemActive = isDark ? 'bg-zinc-800/80 text-white border-l-2 border-cyan-400' : 'bg-cyan-50/50 text-cyan-700 border-l-2 border-cyan-500 font-semibold';
    const sidebarItemInactive = isDark ? 'text-gray-400 hover:bg-zinc-800/50 hover:text-gray-200 border-l-2 border-transparent' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 border-l-2 border-transparent';

    const cardBg = isDark ? 'bg-[#1e1e20] border-zinc-700/50' : 'bg-white border-gray-100 shadow-sm';
    const badgeImage = isDark ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-purple-50 text-purple-600 border-purple-100';
    const badgeVideo = isDark ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-orange-50 text-orange-600 border-orange-100';

    const isProviderConnected = (provider: string) => {
        const models = groupedModels[provider] || [];
        return models.some(key => configs[key]?.key && configs[key].key.length > 0);
    };

    const hasKey = (key: string) => {
        return configs[key]?.key && configs[key].key.length > 0;
    };

    const renderConfigForm = () => {
        if (!editingModelKey) return null;
        const config = configs[editingModelKey];
        if (!config) return null;
        const def = MODEL_REGISTRY[editingModelKey];
        const isVideo = def.category === 'VIDEO';

        return (
            <div className="h-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
                 <div className="flex items-center gap-4 mb-6 pb-4 border-b border-dashed border-gray-500/20">
                    <button onClick={() => setEditingModelKey(null)} className={`p-2 rounded-full transition-colors ${isDark ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                        <Icons.ChevronLeft size={20} />
                    </button>
                    <div>
                        <h2 className={`text-lg font-bold ${textMain}`}>{def.name}</h2>
                        <p className={`text-xs font-mono ${textSub}`}>{def.id}</p>
                    </div>
                 </div>

                 <div className="flex-1 overflow-y-auto space-y-5 pr-2 custom-scrollbar">
                     <div className="space-y-1.5">
                        <label className={`text-[10px] font-bold uppercase tracking-wider ${textSub}`}>API Key</label>
                        <div className="relative">
                            <input 
                                type="password" 
                                className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none border transition-all ${isDark ? 'bg-black/30 border-zinc-700 focus:border-cyan-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-cyan-500 text-gray-900'}`}
                                value={config.key || ''} 
                                onChange={(e) => updateConfig(editingModelKey, 'key', e.target.value)}
                                placeholder="sk-..."
                            />
                        </div>
                     </div>

                     <div className="space-y-1.5">
                        <label className={`text-[10px] font-bold uppercase tracking-wider ${textSub}`}>Base URL</label>
                        <input 
                            type="text" 
                            className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none border transition-all ${isDark ? 'bg-black/30 border-zinc-700 focus:border-cyan-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-cyan-500 text-gray-900'}`}
                            value={config.baseUrl || ''} 
                            onChange={(e) => updateConfig(editingModelKey, 'baseUrl', e.target.value)}
                            placeholder="https://api.example.com"
                        />
                     </div>
                     
                     <div className="space-y-1.5">
                        <label className={`text-[10px] font-bold uppercase tracking-wider ${textSub}`}>Model ID</label>
                        <input 
                            type="text" 
                            className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none border transition-all ${isDark ? 'bg-black/30 border-zinc-700 focus:border-cyan-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-cyan-500 text-gray-900'}`}
                            value={config.modelId || ''} 
                            onChange={(e) => updateConfig(editingModelKey, 'modelId', e.target.value)}
                            placeholder={def.id}
                        />
                     </div>

                     <div className="space-y-1.5">
                        <label className={`text-[10px] font-bold uppercase tracking-wider ${textSub}`}>Endpoint</label>
                        <input 
                            type="text" 
                            className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none border transition-all ${isDark ? 'bg-black/30 border-zinc-700 focus:border-cyan-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-cyan-500 text-gray-900'}`}
                            value={config.endpoint || ''} 
                            onChange={(e) => updateConfig(editingModelKey, 'endpoint', e.target.value)}
                        />
                     </div>

                     {isVideo && (
                        <>
                            <div className="space-y-1.5">
                                <label className={`text-[10px] font-bold uppercase tracking-wider ${textSub}`}>Query Endpoint</label>
                                <input 
                                    type="text" 
                                    className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none border transition-all ${isDark ? 'bg-black/30 border-zinc-700 focus:border-cyan-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-cyan-500 text-gray-900'}`}
                                    value={config.queryEndpoint || ''} 
                                    onChange={(e) => updateConfig(editingModelKey, 'queryEndpoint', e.target.value)}
                                    placeholder="/v1/video/query"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className={`text-[10px] font-bold uppercase tracking-wider ${textSub}`}>Download Endpoint</label>
                                <input 
                                    type="text" 
                                    className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none border transition-all ${isDark ? 'bg-black/30 border-zinc-700 focus:border-cyan-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-cyan-500 text-gray-900'}`}
                                    value={config.downloadEndpoint || ''} 
                                    onChange={(e) => updateConfig(editingModelKey, 'downloadEndpoint', e.target.value)}
                                    placeholder="/v1/files/retrieve"
                                />
                            </div>
                        </>
                     )}
                 </div>

                 <div className="pt-4 flex justify-end gap-2">
                     <button onClick={() => setEditingModelKey(null)} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${isDark ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}>Cancel</button>
                     <button onClick={() => handleSave(editingModelKey)} className="px-6 py-2 rounded-lg text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-white shadow-lg shadow-cyan-500/20">Save Configuration</button>
                 </div>
            </div>
        );
    };

    const renderCreationDialog = () => (
        <div className="flex-1 p-10 flex items-center justify-center animate-in fade-in zoom-in-95 duration-200">
            <div className={`w-full max-w-md p-8 rounded-2xl border ${isDark ? 'bg-[#1e1e20] border-zinc-700' : 'bg-white border-gray-200'} shadow-2xl`}>
                <h3 className={`text-lg font-bold mb-6 ${textMain}`}>Add Custom Model</h3>
                <div className="space-y-4">
                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${textSub}`}>Name</label>
                        <input type="text" className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none border ${isDark ? 'bg-black/30 border-zinc-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`} placeholder="My Model" value={newModelName} onChange={(e) => setNewModelName(e.target.value)} autoFocus />
                    </div>
                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${textSub}`}>Model ID</label>
                        <input type="text" className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none border ${isDark ? 'bg-black/30 border-zinc-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`} placeholder="model-v1" value={newModelId} onChange={(e) => setNewModelId(e.target.value)} />
                    </div>
                </div>
                <div className="flex gap-3 mt-8">
                    <button onClick={() => { setIsCreating(false); setNewModelType(null); }} className={`flex-1 py-2.5 rounded-lg text-xs font-bold ${isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>Cancel</button>
                    <button onClick={confirmCreation} disabled={!newModelName || !newModelId} className="flex-1 py-2.5 rounded-lg text-xs font-bold bg-cyan-500 text-white">Create</button>
                </div>
            </div>
        </div>
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 md:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className={`w-full max-w-6xl h-[90vh] md:h-[85vh] rounded-2xl overflow-hidden flex flex-col md:flex-row shadow-2xl border ${isDark ? 'bg-[#0B0C0E] border-zinc-800' : 'bg-white border-gray-200'}`} onClick={(e) => e.stopPropagation()}>
                
                {/* Sidebar */}
                <div className={`w-full md:w-64 flex flex-col border-b md:border-b-0 md:border-r ${sidebarBg} max-h-[30vh] md:max-h-full`}>
                    <div className="p-4 md:p-6 pb-2 md:pb-4 border-b border-dashed border-gray-500/10 flex justify-between items-center">
                        <div className={`flex items-center gap-3`}>
                            <div className="p-2 bg-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20"><Icons.Settings size={18} className="text-white"/></div>
                            <h2 className={`font-bold text-base ${textMain}`}>API Manager</h2>
                        </div>
                        <button className="md:hidden" onClick={onClose}><Icons.X size={20} className={textSub} /></button>
                    </div>

                    <div className="flex-1 overflow-y-auto py-2 md:py-6 px-4 space-y-2 custom-scrollbar">
                        <div className={`px-2 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 hidden md:block`}>Service Providers <span className="ml-1 opacity-50">{providers.length}</span></div>
                        {providers.map(provider => {
                            const ProviderIcon = PROVIDER_ICONS[provider] || Icons.Database;
                            const isActive = selectedProvider === provider;
                            const isConnected = isProviderConnected(provider);
                            
                            return (
                                <button
                                    key={provider}
                                    onClick={() => { setSelectedProvider(provider); setEditingModelKey(null); setIsCreating(false); }}
                                    className={`w-full flex items-center justify-between px-3 py-3 rounded-lg text-xs transition-colors duration-200 group ${isActive ? sidebarItemActive : sidebarItemInactive}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <ProviderIcon size={14} className={isActive ? 'text-cyan-600 dark:text-cyan-400' : isDark ? 'text-zinc-500' : 'text-gray-400'} />
                                        <span className="font-medium">{provider}</span>
                                    </div>
                                    {isConnected && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Footer Actions */}
                    <div className={`p-4 border-t mt-auto ${isDark ? 'border-zinc-800' : 'border-gray-200'} hidden md:block`}>
                        <div className="grid grid-cols-2 gap-2">
                            <button 
                                onClick={() => configInputRef.current?.click()} 
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${isDark ? 'bg-zinc-800 text-gray-300 hover:bg-zinc-700 hover:text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'}`}
                            >
                                <Icons.Upload size={14} /> Import
                            </button>
                            <button 
                                onClick={handleExportConfig} 
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${isDark ? 'bg-zinc-800 text-gray-300 hover:bg-zinc-700 hover:text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'}`}
                            >
                                <Icons.Download size={14} /> Export
                            </button>
                        </div>
                        <input type="file" ref={configInputRef} hidden accept=".json" onChange={handleImportConfig} />
                    </div>
                </div>

                {/* Main Content */}
                <div className={`flex-1 flex flex-col min-w-0 ${baseBg}`}>
                    {isCreating ? renderCreationDialog() : editingModelKey ? (
                        <div className="flex-1 p-4 md:p-8 overflow-hidden">{renderConfigForm()}</div>
                    ) : (
                        <>
                            {/* Header */}
                            <div className={`px-4 md:px-8 py-4 md:py-6 border-b flex items-center justify-between ${borderMain}`}>
                                <div className="flex items-center gap-3">
                                    <h1 className={`text-lg md:text-xl font-bold ${textMain}`}>{selectedProvider}</h1>
                                    {isProviderConnected(selectedProvider) && (
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold border border-emerald-500/20">Connected</span>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                     <button onClick={() => startCreation('IMAGE')} className={`px-3 py-1.5 rounded-md text-[10px] font-bold border transition-colors flex items-center gap-1.5 ${isDark ? 'border-zinc-700 hover:border-zinc-500 text-gray-300' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                                        <Icons.Plus size={12}/> <span className="hidden md:inline">Custom Model</span><span className="md:hidden">Add</span>
                                     </button>
                                </div>
                            </div>

                            {/* Grid - Key added for animation reset on provider change */}
                            <div key={selectedProvider} className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar animate-in fade-in slide-in-from-bottom-4 duration-300">
                                {groupedModels[selectedProvider]?.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {groupedModels[selectedProvider]?.map(key => {
                                            const def = MODEL_REGISTRY[key];
                                            const isVideo = def.category === 'VIDEO';
                                            const active = hasKey(key);

                                            return (
                                                <div 
                                                    key={key} 
                                                    onClick={() => setEditingModelKey(key)}
                                                    className={`relative p-5 rounded-xl border cursor-pointer transition-all duration-200 hover:translate-y-[-2px] hover:shadow-md group flex flex-col justify-between min-h-[140px] ${cardBg} ${isDark ? 'hover:border-zinc-600' : 'hover:border-cyan-200'}`}
                                                >
                                                    <div className="flex justify-between items-start mb-3">
                                                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-wider ${isVideo ? badgeVideo : badgeImage}`}>
                                                            {def.category}
                                                        </span>
                                                    </div>
                                                    
                                                    <div>
                                                        <h3 className={`font-bold text-sm mb-1 ${textMain}`}>{def.name}</h3>
                                                        <p className={`text-[10px] font-mono ${textSub} opacity-70 truncate`}>{def.id}</p>
                                                    </div>

                                                    <div className="flex items-center gap-2 mt-4">
                                                        <div className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : (isDark ? 'bg-zinc-700' : 'bg-gray-300')}`}></div>
                                                        <span className={`text-[10px] font-medium ${active ? (isDark ? 'text-gray-300' : 'text-gray-600') : (isDark ? 'text-zinc-600' : 'text-gray-400')}`}>
                                                            {active ? 'Active' : 'Missing Key'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className={`w-full h-full flex items-center justify-center ${textSub} text-xs italic`}>
                                        No models in this group
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
