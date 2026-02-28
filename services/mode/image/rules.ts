
import { ImageModelRules } from "../types";

const DEFAULT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];

export const IMAGE_MODEL_CAPABILITIES: Record<string, ImageModelRules> = {
    'BananaPro': { resolutions: ['1k', '2k', '4k'], ratios: DEFAULT_RATIOS },
    'Banana Pro Edit': { resolutions: ['1k', '2k', '4k'], ratios: ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9', '9:21'], supportsEdit: true },
    'Banana 2': { resolutions: ['1k', '2k', '4k'], ratios: ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9', '9:21', '1:4', '4:1', '1:8', '8:1'], supportsEdit: true },
    'Banana': { resolutions: ['1k'], ratios: DEFAULT_RATIOS },
    'Flux2': { resolutions: ['1k', '2k'], ratios: DEFAULT_RATIOS },
    'Jmeng 4.5': { resolutions: ['2k', '4k'], ratios: DEFAULT_RATIOS },
    'Jmeng 4': { resolutions: ['2k', '4k'], ratios: DEFAULT_RATIOS },
    'Midjourney': { resolutions: ['1k'], ratios: DEFAULT_RATIOS },
    'Zimage': { resolutions: ['1k'], ratios: DEFAULT_RATIOS, hasPromptExtend: true },
    'Qwenedit': { resolutions: ['1k'], ratios: DEFAULT_RATIOS }
};

export const getImageModelRules = (modelName: string): ImageModelRules => {
    return IMAGE_MODEL_CAPABILITIES[modelName] || { resolutions: ['1k'], ratios: DEFAULT_RATIOS };
};

export const calculateImageSize = (aspectRatio: string, resolution: string, modelName: string): string => {
  if (modelName === 'Zimage' && resolution === '1k') {
      if (aspectRatio === '16:9') return '1280x720';
      if (aspectRatio === '9:16') return '720x1280';
  }

  if (modelName === 'Flux2') {
      const is2k = resolution === '2k';
      if (aspectRatio === '1:1') return is2k ? '2048x2048' : '1024x1024';
      if (aspectRatio === '16:9') return is2k ? '2048x1152' : '1920x1080';
      if (aspectRatio === '9:16') return is2k ? '1152x2048' : '1080x1920';
      if (aspectRatio === '4:3') return is2k ? '2048x1536' : '1600x1200';
      if (aspectRatio === '3:4') return is2k ? '1536x2048' : '1200x1600';
      return is2k ? '2048x2048' : '1024x1024';
  }

  if ((modelName === 'Banana' || modelName === 'BananaPro') && resolution === '1k') {
      if (aspectRatio === '1:1') return '1024x1024';
      if (aspectRatio === '4:3') return '1024x768';
      if (aspectRatio === '3:4') return '768x1024';
      if (aspectRatio === '16:9') return '1024x576';
      if (aspectRatio === '9:16') return '576x1024';
  }

  const [w, h] = aspectRatio.split(':').map(Number);
  
  let width = 1024;
  let height = 1024;

  const is1_1 = w === 1 && h === 1;
  const is4_3 = w === 4 && h === 3;
  const is3_4 = w === 3 && h === 4;
  const is16_9 = w === 16 && h === 9;
  const is9_16 = w === 9 && h === 16;
  const is21_9 = w === 21 && h === 9;
  const is9_21 = w === 9 && h === 21;

  if (is1_1) { width = 1024; height = 1024; }
  else if (is4_3) { width = 1024; height = 768; }
  else if (is3_4) { width = 768; height = 1024; }
  else if (is16_9) { width = 1024; height = 576; }
  else if (is9_16) { width = 576; height = 1024; }
  else if (is21_9) { width = 1536; height = 640; } 
  else if (is9_21) { width = 640; height = 1536; }
  else {
      if (!isNaN(w) && !isNaN(h)) {
          if (w > h) { width = 1024; height = Math.round(1024 * (h/w)); }
          else { height = 1024; width = Math.round(1024 * (w/h)); }
      }
  }

  const supportsHighRes = ['BananaPro', 'Banana Pro Edit', 'Jmeng 4.5', 'Jmeng 4'].includes(modelName);

  if (supportsHighRes) {
      // Special handling for Jmeng models
      if (modelName === 'Jmeng 4.5' || modelName === 'Jmeng 4') {
          let longEdge = 2560;
          if (resolution === '4k') longEdge = 4096;

          // Calculate dimensions based on aspect ratio with long edge constraint
          if (w >= h) {
              // Landscape or square
              width = longEdge;
              height = Math.round(longEdge * (h / w));
          } else {
              // Portrait
              height = longEdge;
              width = Math.round(longEdge * (w / h));
          }
      } else {
          // Original logic for BananaPro and Banana Pro Edit
          if (resolution === '2k') {
              width *= 2; height *= 2;
          } else if (resolution === '4k') {
              if (is16_9) { width = 4096; height = 2160; }
              else if (is9_16) { width = 2160; height = 4096; }
              else {
                width *= 4; height *= 4;
              }
          }
      }
  }

  width = Math.round(width);
  height = Math.round(height);

  return `${width}x${height}`;
};
