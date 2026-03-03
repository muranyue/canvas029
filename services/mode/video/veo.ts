
import { ModelConfig, ModelDef } from "../types";
import { fetchThirdParty, constructUrl } from "../network";

// Helper to clean prompt tags (generic fallback)
const cleanPrompt = (prompt: string): string => {
    return prompt.replace(/@(?:Image|Video|图片|视频)(?:\s+)?(\d+)/gi, 'Image $1');
};

export const generateGenericVideo = async (
    config: ModelConfig,
    modelDef: ModelDef,
    modelName: string,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    duration: string,
    inputImages: string[],
    isStartEndMode: boolean
): Promise<string> => {
     const targetUrl = constructUrl(config.baseUrl, config.endpoint);
     const processedPrompt = cleanPrompt(prompt);

     const payload: any = {
         model: config.modelId,
         prompt: processedPrompt,
         aspect_ratio: aspectRatio,
         resolution: resolution,
         duration: duration,
     };
     
     if (inputImages.length > 0) {
         if (isStartEndMode) {
              payload.image_url = inputImages[0];
              if (inputImages.length > 1) {
                 payload.last_frame_image = inputImages[inputImages.length - 1];
                 payload.tail_image = inputImages[inputImages.length - 1];
              }
         } else {
              payload.image_url = inputImages[0];
         }
         
         payload.image_urls = inputImages; 

         if (modelDef.type === 'KLING') {
             payload.src_image = inputImages[0];
             if (isStartEndMode && inputImages.length > 1) {
                payload.tail_image = inputImages[inputImages.length - 1]; 
             }
         }
     }

     if (modelName.includes('Veo') || modelName.includes('Sora')) {
          payload.quality = resolution;
          if (duration) payload.seconds = parseInt(duration);
     }

     const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 900000, retries: 3 });
     
     if (res.url || res.data?.[0]?.url || res.data?.url) {
         return res.url || res.data?.[0]?.url || res.data?.url;
     }

     const taskId = res.id || res.task_id || res.data?.id || res.data?.task_id;
     if (!taskId) throw new Error("No Task ID returned");
     
     const qUrl = config.queryEndpoint 
        ? constructUrl(config.baseUrl, config.queryEndpoint)
        : `${targetUrl}/${taskId}`;

     let attempts = 0;
     while (attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));
        try {
            const check = await fetchThirdParty(qUrl.includes(taskId) || (config.queryEndpoint && config.queryEndpoint.includes('{id}')) ? qUrl : `${qUrl}?task_id=${taskId}`, 'GET', null, config, { timeout: 10000 });
            const status = (check.status || check.task_status || check.state || '').toString().toUpperCase();
            
            if (['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'OK'].includes(status)) {
                 if (check.url) return check.url;
                 if (check.output?.url) return check.output.url;
                 if (check.result?.url) return check.result.url;
                 if (check.data?.url) return check.data.url;
                 if (check.data?.video?.url) return check.data.video.url;
                 if (check.video?.url) return check.video.url;
                 if (Array.isArray(check.data) && check.data[0]?.url) return check.data[0].url;
                 if (check.data?.video?.url) return check.data.video.url;
            } else if (['FAIL', 'FAILED', 'FAILURE', 'ERROR'].includes(status)) {
                 throw new Error(`Video Gen failed: ${check.fail_reason || check.error || 'Unknown error'}`);
            }
        } catch (e: any) {
            if (attempts > 10 && e.isNonRetryable) throw e;
        }
        attempts++;
     }
     throw new Error("Video generation timed out");
};

const inferImageExtension = (source: string, mimeType: string = ''): string => {
    const normalizedMime = mimeType.toLowerCase();
    if (normalizedMime.includes('png')) return 'png';
    if (normalizedMime.includes('webp')) return 'webp';
    if (normalizedMime.includes('gif')) return 'gif';
    if (normalizedMime.includes('bmp')) return 'bmp';
    if (normalizedMime.includes('svg')) return 'svg';
    if (normalizedMime.includes('jpeg') || normalizedMime.includes('jpg')) return 'jpg';

    try {
        const rawPath = source.startsWith('http') ? new URL(source).pathname : source;
        const path = rawPath.split('?')[0];
        const match = path.match(/\.([a-zA-Z0-9]+)$/);
        if (match && match[1]) {
            return match[1].toLowerCase();
        }
    } catch (e) {
        // Ignore parse failure and use fallback extension
    }

    return 'jpg';
};

const dataUrlToFile = (dataUrl: string, index: number): File => {
    const [header, base64Data] = dataUrl.split(',');
    if (!header || !base64Data) {
        throw new Error(`Reference image ${index + 1} is not a valid data URL`);
    }

    const mimeMatch = header.match(/data:([^;]+);base64/i);
    const mimeType = mimeMatch?.[1] || 'image/jpeg';
    const binary = atob(base64Data);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        buffer[i] = binary.charCodeAt(i);
    }
    const ext = inferImageExtension(`image.${mimeType.split('/')[1] || 'jpg'}`, mimeType);
    return new File([buffer], `input_reference_${index + 1}.${ext}`, { type: mimeType });
};

const toInputReferenceFile = async (source: string, index: number): Promise<File> => {
    if (source.startsWith('data:')) {
        return dataUrlToFile(source, index);
    }

    const response = await fetch(source);
    if (!response.ok) {
        throw new Error(`Reference image ${index + 1} fetch failed (${response.status})`);
    }

    const blob = await response.blob();
    const ext = inferImageExtension(source, blob.type);
    const mimeType = blob.type || (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`);
    return new File([blob], `input_reference_${index + 1}.${ext}`, { type: mimeType });
};

const toVeoVideoSize = (aspectRatio: string): string => {
    const [w, h] = aspectRatio.split(':').map(Number);
    if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0) {
        return '720x1280';
    }
    return w > h ? '1280x720' : '720x1280';
};

const extractVeoVideoUrl = (data: any): string => {
    const candidates = [
        data?.url,
        data?.video_url,
        data?.output,
        data?.video?.url,
        data?.data?.url,
        data?.data?.video_url,
        data?.data?.output,
        data?.data?.video?.url,
        data?.result?.url,
        data?.result?.video_url,
        data?.detail?.video_url,
        data?.detail?.upsample_video_url
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }

    return '';
};

const extractVeoStatus = (data: any): string => {
    const candidates = [
        data?.status,
        data?.state,
        data?.task_status,
        data?.data?.status,
        data?.data?.state,
        data?.data?.task_status
    ];

    for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
            return String(candidate).trim().toLowerCase();
        }
    }

    return '';
};

const extractVeoError = (data: any): string => {
    const candidates = [
        data?.fail_reason,
        data?.error?.message,
        typeof data?.error === 'string' ? data.error : '',
        data?.message,
        data?.msg,
        data?.data?.fail_reason,
        data?.data?.error?.message,
        typeof data?.data?.error === 'string' ? data.data.error : '',
        data?.data?.message,
        data?.data?.msg
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }

    return 'Unknown error';
};

const buildVeoQueryUrl = (config: ModelConfig, targetUrl: string, taskId: string): string => {
    const queryEndpoint = config.queryEndpoint;
    if (!queryEndpoint) {
        return `${targetUrl.replace(/\/$/, '')}/${taskId}`;
    }

    const queryBase = constructUrl(config.baseUrl, queryEndpoint);
    if (queryBase.includes('{id}')) {
        return queryBase.replace('{id}', taskId);
    }
    if (queryBase.includes('{task_id}')) {
        return queryBase.replace('{task_id}', taskId);
    }
    return `${queryBase.replace(/\/$/, '')}/${taskId}`;
};

export const generateVeo3Video = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string,
    duration: string,
    inputImages: string[],
    watermark: boolean = false,
    isStartEndMode: boolean = false,
    allowLastFrame: boolean = true
): Promise<string> => {
    const targetUrl = constructUrl(config.baseUrl, config.endpoint || '/v1/videos');
    const processedPrompt = cleanPrompt(prompt);
    const seconds = parseInt(String(duration || '').replace('s', ''), 10) || 8;
    const size = toVeoVideoSize(aspectRatio);
    const enableUpsample = size === '1280x720';

    const payload = new FormData();
    payload.append('model', config.modelId);
    payload.append('prompt', processedPrompt);
    payload.append('size', size);
    payload.append('seconds', String(seconds));
    payload.append('watermark', String(watermark));
    payload.append('enable_upsample', String(enableUpsample));

    const appendInputReference = async (source: string, index: number) => {
        if (!source) return;
        try {
            const file = await toInputReferenceFile(source, index);
            payload.append('input_reference', file, file.name);
        } catch (e: any) {
            if (/^https?:\/\//i.test(source)) {
                console.warn(`Fallback to URL input_reference for image ${index + 1}`, e);
                payload.append('input_reference', source);
            } else {
                throw new Error(`Unable to read frame image ${index + 1}: ${e?.message || e}`);
            }
        }
    };

    const filteredImages = inputImages.filter(Boolean);
    if (filteredImages.length > 0) {
        const imagesToUpload = isStartEndMode && allowLastFrame && filteredImages.length > 1
            ? [filteredImages[0], filteredImages[filteredImages.length - 1]]
            : [filteredImages[0]];
        for (let i = 0; i < imagesToUpload.length; i++) {
            await appendInputReference(imagesToUpload[i], i);
        }
    }

    const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 120000, retries: 1, isFormData: true });
    const directUrl = extractVeoVideoUrl(res);
    if (directUrl) {
        return directUrl;
    }

    const taskId = res.id || res.task_id || res.data?.id || res.data?.task_id;
    if (!taskId) {
        const status = extractVeoStatus(res);
        if (['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(status)) {
            throw new Error(`Veo3 failed: ${extractVeoError(res)}`);
        }
        throw new Error(`No Task ID returned from Veo3: ${JSON.stringify(res)}`);
    }

    const queryUrl = buildVeoQueryUrl(config, targetUrl, taskId);
    let attempts = 0;
    while (attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));

        let check: any;
        try {
            check = await fetchThirdParty(queryUrl, 'GET', null, config, { timeout: 10000 });
        } catch (e: any) {
            if (e?.status === 404) {
                attempts++;
                continue;
            }
            if (attempts > 20 || e.isNonRetryable) throw e;
            attempts++;
            continue;
        }

        const status = extractVeoStatus(check);
        if (['completed', 'success', 'succeeded', 'ok', 'finish', 'finished'].includes(status)) {
            const videoUrl = extractVeoVideoUrl(check);
            if (videoUrl) return videoUrl;
            throw new Error(`Veo3 completed but no video url found: ${JSON.stringify(check)}`);
        }
        if (['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(status)) {
            throw new Error(`Veo3 failed: ${extractVeoError(check)}`);
        }

        attempts++;
    }
    throw new Error("Veo3 generation timed out");
};

export const generateGrokVideo = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    inputImages: string[]
): Promise<string> => {
     const targetUrl = constructUrl(config.baseUrl, config.endpoint);
     const processedPrompt = cleanPrompt(prompt);
     
     const size = (resolution || '720p').toUpperCase();
     const payload: any = {
         model: config.modelId,
         prompt: processedPrompt,
         aspect_ratio: aspectRatio,
         size: size,
     };
     
     if (inputImages.length > 0) {
         payload.images = inputImages;
     }

     const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 120000 });
     
     if (res.url || res.data?.url) {
         return res.url || res.data?.url;
     }

     const taskId = res.id || res.task_id || res.data?.id;
     if (!taskId) throw new Error("No Task ID returned from Grok");
     
     const queryEndpoint = config.queryEndpoint || '/v1/video/query';
     const qUrl = constructUrl(config.baseUrl, queryEndpoint);

     let attempts = 0;
     while (attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));
        try {
            const finalUrl = `${qUrl}?id=${taskId}`;
            const check = await fetchThirdParty(finalUrl, 'GET', null, config, { timeout: 10000 });
            const status = (check.status || check.data?.status || '').toString().toLowerCase();
            
            if (['success', 'succeeded', 'completed', 'ok'].includes(status)) {
                 if (check.url) return check.url;
                 if (check.data?.url) return check.data.url;
                 if (check.data?.video_url) return check.data.video_url;
                 if (check.video_url) return check.video_url;
            } else if (['failed', 'failure', 'error'].includes(status)) {
                 throw new Error(`Grok failed: ${check.fail_reason || check.error || 'Unknown error'}`);
            }
        } catch (e: any) {
            if (attempts > 20 && e.isNonRetryable) throw e;
        }
        attempts++;
     }
     throw new Error("Grok generation timed out");
};

export const generateSoraVideo = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    duration: string,
    inputImages: string[]
): Promise<string> => {
     const targetUrl = constructUrl(config.baseUrl, config.endpoint);
     const processedPrompt = cleanPrompt(prompt);
     
     const orientation = aspectRatio === '9:16' ? 'portrait' : 'landscape';
     const size = resolution === '1080p' ? 'large' : 'small'; 
     const durationInt = parseInt(duration.replace('s', '')) || 10;

     const payload: any = {
         model: config.modelId,
         prompt: processedPrompt,
         orientation: orientation,
         size: size,
         duration: durationInt,
         watermark: false,
         private: true,
         images: inputImages
     };

     const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 120000 });
     
     if (res.url || res.data?.url) {
         return res.url || res.data?.url;
     }

     const taskId = res.id || res.task_id || res.data?.id;
     if (!taskId) throw new Error("No Task ID returned from Sora");
     
     const queryEndpoint = config.queryEndpoint || '/v1/video/query';
     const qUrl = constructUrl(config.baseUrl, queryEndpoint);

     let attempts = 0;
     while (attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));
        try {
            const finalUrl = `${qUrl}?id=${taskId}`;
            const check = await fetchThirdParty(finalUrl, 'GET', null, config, { timeout: 10000 });
            const status = (check.status || check.data?.status || check.state || '').toString().toLowerCase();
            
            if (['success', 'succeeded', 'completed', 'ok'].includes(status)) {
                 if (check.url) return check.url;
                 if (check.data?.url) return check.data.url;
                 if (check.data?.video_url) return check.data.video_url;
                 if (check.video_url) return check.video_url;
            } else if (['failed', 'failure', 'error'].includes(status)) {
                 throw new Error(`Sora failed: ${check.fail_reason || check.error || 'Unknown error'}`);
            }
        } catch (e: any) {
            if (attempts > 20 && e.isNonRetryable) throw e;
        }
        attempts++;
     }
     throw new Error("Sora generation timed out");
};
