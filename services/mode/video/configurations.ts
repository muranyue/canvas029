
import { VideoModelRules, ModelConfig } from "../types";
import { generateGenericVideo, generateVeo3Video, generateGrokVideo, generateSoraVideo } from "./veo";
import { generateMinimaxVideo } from "./minimax";
import { generateSeedanceVideo } from "./seedance";
import { generateKlingO1Video, generateKlingStandardVideo } from "./kling";
import { generateAlibailianVideo } from "./alibailian";
import { generateViduVideo } from "./vidu";
import { fetchThirdParty, constructUrl } from "../network";

// --- Base Rules ---
const BASE_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];
const EXTENDED_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9', '9:21'];
const DURATIONS_STD = ['5s', '10s'];
const RESOLUTIONS_STD = ['720p', '1080p'];

// --- Helper for Chat-based Video (Doubao/KlingO1) ---
const generateChatVideo = async (config: ModelConfig, prompt: string) => {
    const messages = [{ role: 'user', content: `Generate a video: ${prompt}` }];
    const payload = { model: config.modelId, messages, stream: false };
    const url = constructUrl(config.baseUrl, config.endpoint);
    const res = await fetchThirdParty(url, 'POST', payload, config, { timeout: 600000 });
    return res.choices?.[0]?.message?.content;
};

// --- Model Specific Implementations ---

export const Sora2Handler = {
    rules: { resolutions: ['720p', '1080p'], durations: ['10s', '15s'], ratios: ['16:9', '9:16'], maxInputImages: 2 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateSoraVideo(cfg, prompt, params.aspectRatio, params.resolution, params.duration, params.inputImages);
    }
};

export const VeoFastHandler = {
    rules: { resolutions: ['720p', '1080p'], durations: ['8s'], ratios: ['16:9', '9:16'], maxInputImages: 3 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        let modelId = 'veo3.1'; // Default Text-to-Video (Fast Mode)
        let images = params.inputImages || [];

        // Logic for Veo 3.1 Fast:
        // Text-to-Video -> veo3.1
        // Image-to-Video -> veo3.1-fast-components
        
        if (images.length > 0) {
             modelId = 'veo3.1-fast-components';
        }

        // Enforce max 3 images
        if (images.length > 3) {
            images = images.slice(0, 3);
        }

        const newCfg = { ...cfg, modelId, endpoint: '/v1/video/create' };
        return await generateVeo3Video(newCfg, prompt, params.aspectRatio, images, params.promptOptimize);
    }
};

export const VeoProHandler = {
    rules: { resolutions: ['720p', '1080p'], durations: ['8s'], ratios: ['16:9', '9:16'], maxInputImages: 1 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        let modelId = 'veo3.1-pro'; // Default Text-to-Video (Pro Mode)
        let images = params.inputImages || [];

        // Logic for Veo 3.1 Pro:
        // Text-to-Video -> veo3.1-pro
        // Image-to-Video -> veo3.1-components
        
        if (images.length > 0) {
            modelId = 'veo3.1-components';
            // Enforce max 1 image
            if (images.length > 1) {
                images = [images[0]];
            }
        }

        const newCfg = { ...cfg, modelId, endpoint: '/v1/video/create' };
        return await generateVeo3Video(newCfg, prompt, params.aspectRatio, images, params.promptOptimize);
    }
};

export const HailuoHandler = {
    rules: { resolutions: ['768p', '1080p'], durations: ['6s'], ratios: ['16:9', '9:16', '1:1'], maxInputImages: 2, hasPromptExtend: true },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateMinimaxVideo(cfg, prompt, params.aspectRatio, params.inputImages, params.isStartEndMode, params.promptOptimize);
    }
};

export const KlingO1Handler = {
    rules: { resolutions: ['1080p'], durations: ['5s', '10s'], ratios: ['16:9', '9:16', '1:1'], maxInputImages: 2, hasPromptExtend: true },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateKlingO1Video(cfg, params.modelName || 'Kling O1 Std', prompt, params.aspectRatio, params.resolution, params.duration, params.inputImages, params.isStartEndMode, params.promptOptimize);
    }
};

export const KlingO1StdHandler = {
     ...KlingO1Handler,
     generate: async (cfg: ModelConfig, prompt: string, params: any) => {
         return await generateKlingO1Video(cfg, 'Kling O1 Std', prompt, params.aspectRatio, params.resolution, params.duration, params.inputImages, params.isStartEndMode, params.promptOptimize);
     }
};

export const KlingO1ProHandler = {
     ...KlingO1Handler,
     generate: async (cfg: ModelConfig, prompt: string, params: any) => {
         return await generateKlingO1Video(cfg, 'Kling O1 Pro', prompt, params.aspectRatio, params.resolution, params.duration, params.inputImages, params.isStartEndMode, params.promptOptimize);
     }
};

export const KlingStandardHandler = {
    rules: { resolutions: ['720p', '1080p'], durations: ['5s', '10s'], ratios: ['16:9', '9:16'], maxInputImages: 2, hasPromptExtend: true },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
         // Fallback default
         return await generateKlingStandardVideo(cfg, 'Kling 2.5 Std', prompt, params.aspectRatio, params.duration, params.inputImages, params.isStartEndMode, params.promptOptimize);
    }
};

export const Kling25StdHandler = {
    ...KlingStandardHandler,
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateKlingStandardVideo(cfg, 'Kling 2.5 Std', prompt, params.aspectRatio, params.duration, params.inputImages, params.isStartEndMode, params.promptOptimize);
    }
};

export const Kling25ProHandler = {
    ...KlingStandardHandler,
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateKlingStandardVideo(cfg, 'Kling 2.5 Pro', prompt, params.aspectRatio, params.duration, params.inputImages, params.isStartEndMode, params.promptOptimize);
    }
};

export const Kling26ProNSHandler = {
    ...KlingStandardHandler,
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateKlingStandardVideo(cfg, 'Kling 2.6 ProNS', prompt, params.aspectRatio, params.duration, params.inputImages, params.isStartEndMode, params.promptOptimize);
    }
};

export const Kling26ProYSHandler = {
    ...KlingStandardHandler,
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateKlingStandardVideo(cfg, 'Kling 2.6 ProYS', prompt, params.aspectRatio, params.duration, params.inputImages, params.isStartEndMode, params.promptOptimize);
    }
};


export const SeedanceHandler = {
    rules: { resolutions: ['480p', '720p', '1080p'], durations: ['5s', '7s', '10s'], ratios: EXTENDED_RATIOS, maxInputImages: 2 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateSeedanceVideo(cfg, prompt, params.aspectRatio, params.resolution, params.duration, params.inputImages, params.isStartEndMode);
    }
};

export const WanHandler = {
    rules: { resolutions: ['720p', '1080p'], durations: ['5s', '10s'], ratios: BASE_RATIOS, maxInputImages: 1 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateAlibailianVideo(cfg, prompt, params.resolution, params.duration, params.inputImages);
    }
};

export const Grok3Handler = {
    rules: { resolutions: ['720p'], durations: ['6s'], ratios: ['1:1', '3:2', '2:3'], maxInputImages: 1 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateGrokVideo(cfg, prompt, params.aspectRatio, params.resolution, params.inputImages);
    }
};

export const ViduHandler = {
    rules: { resolutions: ['720p', '1080p'], durations: ['3s', '4s', '5s', '6s', '8s', '10s'], ratios: ['1:1', '16:9', '9:16'], maxInputImages: 1, hasPromptExtend: true },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateViduVideo(cfg, prompt, params.aspectRatio, params.resolution, params.duration, params.inputImages, params.promptOptimize);
    }
};

export const VIDEO_HANDLERS: Record<string, any> = {
    'Sora 2': Sora2Handler,
    'Veo 3.1 Fast': VeoFastHandler,
    'Veo 3.1 Pro': VeoProHandler,
    'Hailuo 2.0': HailuoHandler,
    'Hailuo 2.3': HailuoHandler,
    
    // Kling O1
    'Kling O1 Std': KlingO1StdHandler,
    'Kling O1 Pro': KlingO1ProHandler,
    
    // Kling 2.5
    'Kling 2.5 Std': Kling25StdHandler,
    'Kling 2.5 Pro': Kling25ProHandler,
    
    // Kling 2.6
    'Kling 2.6 ProNS': Kling26ProNSHandler,
    'Kling 2.6 ProYS': Kling26ProYSHandler,
    
    'Jmeng 3.5': SeedanceHandler,

    'Wan2.6': WanHandler,
    'Wan2.5': WanHandler,
    
    'Grok video 3': Grok3Handler,
    
    'Vidu Q2 Pro': ViduHandler,
    'Vidu Q2 Turbo': ViduHandler
};
