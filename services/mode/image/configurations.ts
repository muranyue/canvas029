
import { ImageModelRules, ModelConfig } from "../types";
import { generateBananaChatImage, generateBananaEdit } from "./banana";
import { generateStandardImage, generateMjModal } from "./flux";
import { calculateImageSize } from "./rules";

// --- Base Rules ---
const BASE_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];
const EXTENDED_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9', '9:21'];

// --- Model Specific Implementations ---

export const BananaProHandler = {
    rules: { resolutions: ['1k', '2k', '4k'], ratios: BASE_RATIOS },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        const size = calculateImageSize(params.aspectRatio, params.resolution, 'BananaPro');
        return await generateBananaChatImage(cfg, prompt, params.aspectRatio, params.resolution, size, params.inputImages);
    }
};

export const BananaProEditHandler = {
    rules: { resolutions: ['1k', '2k', '4k'], ratios: EXTENDED_RATIOS, supportsEdit: true },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateBananaEdit(cfg, prompt, params.aspectRatio, params.resolution, params.inputImages);
    }
};

export const BananaHandler = {
    rules: { resolutions: ['1k'], ratios: BASE_RATIOS },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        const size = calculateImageSize(params.aspectRatio, '1k', 'Banana');
        return await generateBananaChatImage(cfg, prompt, params.aspectRatio, '1k', size, params.inputImages);
    }
};

export const Flux2Handler = {
    rules: { resolutions: ['1k', '2k'], ratios: BASE_RATIOS },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        const size = calculateImageSize(params.aspectRatio, params.resolution, 'Flux2');
        return await generateStandardImage(cfg, { id: 'flux', name: 'Flux', type: 'IMAGE_GEN' } as any, prompt, params.aspectRatio, params.resolution, size, params.inputImages, params.count, params.promptOptimize);
    }
};

export const Jimeng45Handler = {
    rules: { resolutions: ['1k', '2k', '4k'], ratios: BASE_RATIOS },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        // Updated to Jmeng 4.5
        const size = calculateImageSize(params.aspectRatio, params.resolution, 'Jmeng 4.5');
        return await generateStandardImage(cfg, { id: 'doubao', name: 'Doubao', type: 'IMAGE_GEN' } as any, prompt, params.aspectRatio, params.resolution, size, params.inputImages, params.count, params.promptOptimize);
    }
};

export const Jimeng4Handler = {
    rules: { resolutions: ['1k'], ratios: BASE_RATIOS },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        // Updated to Jmeng 4
        const size = calculateImageSize(params.aspectRatio, '1k', 'Jmeng 4');
        return await generateStandardImage(cfg, { id: 'doubao', name: 'Doubao', type: 'IMAGE_GEN' } as any, prompt, params.aspectRatio, '1k', size, params.inputImages, params.count, params.promptOptimize);
    }
};

export const MJHandler = {
    rules: { resolutions: ['1k'], ratios: BASE_RATIOS },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateMjModal(cfg, prompt, params.aspectRatio);
    }
};

export const ZimageHandler = {
    rules: { resolutions: ['1k'], ratios: BASE_RATIOS },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        const size = calculateImageSize(params.aspectRatio, '1k', 'Zimage');
        return await generateStandardImage(cfg, { id: 'z-image', name: 'Zimage', type: 'IMAGE_GEN' } as any, prompt, params.aspectRatio, '1k', size, params.inputImages, params.count, params.promptOptimize);
    }
};

export const QwenEditHandler = {
    rules: { resolutions: ['1k'], ratios: BASE_RATIOS },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        const size = calculateImageSize(params.aspectRatio, '1k', 'Qwen');
        return await generateStandardImage(cfg, { id: 'qwen', name: 'Qwen', type: 'IMAGE_GEN' } as any, prompt, params.aspectRatio, '1k', size, params.inputImages, params.count, params.promptOptimize);
    }
};

export const IMAGE_HANDLERS: Record<string, any> = {
    'BananaPro': BananaProHandler,
    'Banana Pro Edit': BananaProEditHandler,
    'Banana 2': BananaProEditHandler,
    'Banana': BananaHandler,
    'Flux2': Flux2Handler,
    'Jmeng 4.5': Jimeng45Handler,
    'Jmeng 4': Jimeng4Handler,
    'Midjourney': MJHandler,
    'Zimage': ZimageHandler,
    'Qwenedit': QwenEditHandler
};
