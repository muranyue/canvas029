
export type StrategyType = 
  | 'CHAT' 
  | 'IMAGE_GEN' 
  | 'BANANA_EDIT_ASYNC' 
  | 'VIDEO_GEN_MINIMAX' 
  | 'VIDEO_GEN_STD' 
  | 'VIDEO_GEN_FORM' 
  | 'VIDEO_GEN_VIDU'
  | 'KLING' 
  | 'KLING_OMNI'
  | 'MJ_MODAL' 
  | 'MJ_ACTION';

export interface ModelDef {
  id: string; 
  name: string; 
  type: StrategyType;
  category: 'IMAGE' | 'VIDEO';
  defaultEndpoint: string;
  defaultQueryEndpoint?: string; 
  defaultDownloadEndpoint?: string; 
}

export interface ModelConfig {
    baseUrl: string;
    key: string;
    modelId: string;
    endpoint: string;
    queryEndpoint?: string;
    downloadEndpoint?: string;
}

export interface ImageModelRules {
    resolutions: string[];
    ratios: string[];
    supportsEdit?: boolean;
    hasPromptExtend?: boolean;
}

export interface VideoModelRules {
    resolutions: string[];
    durations: string[];
    ratios: string[];
    maxInputImages: number;
    hasPromptExtend?: boolean;
}

export interface VideoConstraints {
    resOptions: string[];
    disabledRes: string[];
    disabledRatios: string[];
    disabledDurations: string[];
}

export interface IModelHandler<R> {
    rules: R;
    generate: (config: ModelConfig, prompt: string, params: any) => Promise<string | string[]>;
}
