
import { EnvConfig } from "../env";
import { ModelDef, ModelConfig } from "./types";

export type { ModelConfig };

const CUSTOM_MODELS_KEY = 'CUSTOM_MODEL_REGISTRY';
const loadCustomModels = (): Record<string, ModelDef> => {
    if (typeof window === 'undefined') return {};
    try {
        const stored = localStorage.getItem(CUSTOM_MODELS_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch(e) { return {}; }
};

const customModels = loadCustomModels();

export const MODEL_REGISTRY: Record<string, ModelDef> = {
  // --- Image Models ---
  'BananaPro': { id: 'gemini-3-pro-image-preview', name: 'Banana Pro', type: 'CHAT', category: 'IMAGE', defaultEndpoint: '/v1/chat/completions' },
  'Banana Pro Edit': { 
      id: 'gemini-3-pro-image-preview', 
      name: 'Banana Pro Edit', 
      type: 'BANANA_EDIT_ASYNC', 
      category: 'IMAGE', 
      defaultEndpoint: '/api/gemini/nano-banana'
  },
  'Banana 2': {
      id: 'gemini-3.1-flash-image-preview',
      name: 'Banana 2',
      type: 'BANANA_EDIT_ASYNC',
      category: 'IMAGE',
      defaultEndpoint: '/api/gemini/nano-banana'
  },
  'Banana': { id: 'gemini-2.5-flash-image-preview', name: 'Banana', type: 'CHAT', category: 'IMAGE', defaultEndpoint: '/v1/chat/completions' },
  'Flux2': { id: 'flux-kontext-pro', name: 'Flux 2', type: 'IMAGE_GEN', category: 'IMAGE', defaultEndpoint: '/v1/images/generations' },
  
  'Jmeng 4.5': { id: 'doubao-seedream-4-5-251128', name: 'Jmeng 4.5', type: 'IMAGE_GEN', category: 'IMAGE', defaultEndpoint: '/v1/images/generations' },
  'Jmeng 4': { id: 'doubao-seedream-4-0-250828', name: 'Jmeng 4', type: 'IMAGE_GEN', category: 'IMAGE', defaultEndpoint: '/v1/images/generations' },
  
  'Midjourney': { id: 'mj_modal', name: 'Midjourney', type: 'MJ_MODAL', category: 'IMAGE', defaultEndpoint: '/mj/submit/modal' },
  'Zimage': { id: 'z-image-turbo', name: 'Qwen Zimage', type: 'IMAGE_GEN', category: 'IMAGE', defaultEndpoint: '/v1/images/generations' },
  'Qwenedit': { id: 'qwen-image-edit-2509', name: 'Qwen Edit', type: 'IMAGE_GEN', category: 'IMAGE', defaultEndpoint: '/v1/images/generations' },

  // --- Video Models ---
  'Sora 2': { id: 'sora-2-all', name: 'Sora 2', type: 'VIDEO_GEN_FORM', category: 'VIDEO', defaultEndpoint: '/v1/video/create', defaultQueryEndpoint: '/v1/video/query' },
  'Veo 3.1 Fast': { id: 'veo3.1', name: 'Veo 3.1 Fast', type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/v1/video/create', defaultQueryEndpoint: '/v1/video/query' },
  'Veo 3.1 Pro': { id: 'veo3.1-pro', name: 'Veo 3.1 Pro', type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/v1/video/create', defaultQueryEndpoint: '/v1/video/query' },
  'Hailuo 2.0': { 
      id: 'MiniMax-Hailuo-02', 
      name: 'Hailuo 2.0', 
      type: 'VIDEO_GEN_MINIMAX', 
      category: 'VIDEO', 
      defaultEndpoint: '/v1/video_generation',
      defaultQueryEndpoint: '/v1/query/video_generation',
      defaultDownloadEndpoint: '/v1/files/retrieve'
  },
  'Hailuo 2.3': { 
      id: 'MiniMax-Hailuo-2.3', 
      name: 'Hailuo 2.3', 
      type: 'VIDEO_GEN_MINIMAX', 
      category: 'VIDEO', 
      defaultEndpoint: '/v1/video_generation',
      defaultQueryEndpoint: '/v1/query/video_generation',
      defaultDownloadEndpoint: '/v1/files/retrieve'
  },
  
  // Kling O1 Split
  'Kling O1 Std': { id: 'kling-omni-video', name: 'Kling O1 Std', type: 'KLING_OMNI', category: 'VIDEO', defaultEndpoint: '/kling/v1/videos/omni-video' },
  'Kling O1 Pro': { id: 'kling-omni-video', name: 'Kling O1 Pro', type: 'KLING_OMNI', category: 'VIDEO', defaultEndpoint: '/kling/v1/videos/omni-video' },
  
  'Jmeng 3.5': { id: 'doubao-seedance-1-5-pro', name: 'Jmeng 3.5', type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/v1/videos' },
  
  // Kling 2.6
  'Kling 2.6 ProNS': { id: 'kling-v2-6', name: 'Kling 2.6 ProNS', type: 'KLING', category: 'VIDEO', defaultEndpoint: '/kling/v1/videos' },
  'Kling 2.6 ProYS': { id: 'kling-v2-6', name: 'Kling 2.6 ProYS', type: 'KLING', category: 'VIDEO', defaultEndpoint: '/kling/v1/videos' },
  
  // Kling 2.5
  'Kling 2.5 Std': { id: 'kling-v2-5-turbo', name: 'Kling 2.5 Std', type: 'KLING', category: 'VIDEO', defaultEndpoint: '/kling/v1/videos' },
  'Kling 2.5 Pro': { id: 'kling-v2-5-turbo', name: 'Kling 2.5 Pro', type: 'KLING', category: 'VIDEO', defaultEndpoint: '/kling/v1/videos' },

  'Wan2.6': { 
      id: 'wan2.6-i2v', 
      name: 'Qwen Wan 2.6', 
      type: 'VIDEO_GEN_STD', 
      category: 'VIDEO', 
      defaultEndpoint: '/alibailian/api/v1/services/aigc/video-generation/video-synthesis',
      defaultQueryEndpoint: '/alibailian/api/v1/tasks/{id}'
  },
  'Wan2.5': { 
      id: 'wan2.5-i2v-preview', 
      name: 'Qwen Wan 2.5', 
      type: 'VIDEO_GEN_STD', 
      category: 'VIDEO', 
      defaultEndpoint: '/alibailian/api/v1/services/aigc/video-generation/video-synthesis',
      defaultQueryEndpoint: '/alibailian/api/v1/tasks/{id}'
  },
  
  'Grok video 3': { id: 'grok-video-3', name: 'Grok Video', type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/v1/video/create', defaultQueryEndpoint: '/v1/video/query' },
  
  'Vidu Q2 Pro': { 
      id: 'q2-pro', 
      name: 'Vidu Q2 Pro', 
      type: 'VIDEO_GEN_VIDU', 
      category: 'VIDEO', 
      defaultEndpoint: '/tencent-vod/v1/aigc-video', 
      defaultQueryEndpoint: '/tencent-vod/v1/query/{task_id}' 
  },
  'Vidu Q2 Turbo': { 
      id: 'q2-turbo', 
      name: 'Vidu Q2 Turbo', 
      type: 'VIDEO_GEN_VIDU', 
      category: 'VIDEO', 
      defaultEndpoint: '/tencent-vod/v1/aigc-video', 
      defaultQueryEndpoint: '/tencent-vod/v1/query/{task_id}' 
  },
  
  ...customModels
};

const getStorageKey = (modelName: string) => `API_CONFIG_MODEL_${modelName}`;

export const getModelConfig = (modelName: string): ModelConfig => {
    const def = MODEL_REGISTRY[modelName];
    if (!def) {
        return {
            baseUrl: EnvConfig.DEFAULT_BASE_URL,
            key: '', 
            modelId: '',
            endpoint: '/v1/chat/completions'
        };
    }

    if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(getStorageKey(modelName));
        if (stored) {
            const parsed = JSON.parse(stored);
            return {
                baseUrl: parsed.baseUrl || EnvConfig.DEFAULT_BASE_URL,
                key: parsed.key || '', 
                modelId: parsed.modelId || def.id,
                endpoint: parsed.endpoint || def.defaultEndpoint,
                queryEndpoint: parsed.queryEndpoint || def.defaultQueryEndpoint || '',
                downloadEndpoint: parsed.downloadEndpoint || def.defaultDownloadEndpoint || ''
            };
        }
    }

    return {
        baseUrl: EnvConfig.DEFAULT_BASE_URL,
        key: '', 
        modelId: def.id,
        endpoint: def.defaultEndpoint,
        queryEndpoint: def.defaultQueryEndpoint || '',
        downloadEndpoint: def.defaultDownloadEndpoint || ''
    };
};

export const saveModelConfig = (modelName: string, config: ModelConfig) => {
    localStorage.setItem(getStorageKey(modelName), JSON.stringify(config));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('modelConfigUpdated', { detail: { modelName } }));
    }
};

export const registerCustomModel = (key: string, def: ModelDef) => {
    MODEL_REGISTRY[key] = def;
    const current = loadCustomModels();
    current[key] = def;
    localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(current));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('modelRegistryUpdated'));
    }
};
