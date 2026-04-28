
import { ModelConfig, ModelDef } from "../types";
import { fetchThirdParty, constructUrl } from "../network";

const GPT_IMAGE_2_BASE_URL = import.meta.env.DEV ? '/__duomi_proxy' : 'https://duomiapi.com';
const GPT_IMAGE_2_CREATE_URL = `${GPT_IMAGE_2_BASE_URL}/v1/images/generations?async=true`;
const GPT_IMAGE_2_QUERY_URL_BASE = `${GPT_IMAGE_2_BASE_URL}/v1/tasks`;
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';
const IMGBB_API_KEY = '3fcc8e95dc5395ae49bfedcb59302ca1';
const IMGBB_EXPIRATION_SECONDS = 3600;

const extractGptImage2Urls = (payload: any): string[] => {
    const urls: string[] = [];

    const append = (candidate?: string) => {
        if (!candidate || typeof candidate !== 'string') return;
        const trimmed = candidate.trim();
        if (!trimmed || urls.includes(trimmed)) return;
        urls.push(trimmed);
    };

    if (Array.isArray(payload?.data?.images)) {
        payload.data.images.forEach((item: any) => append(item?.url || item?.image_url));
    }
    if (Array.isArray(payload?.data?.data?.images)) {
        payload.data.data.images.forEach((item: any) => append(item?.url || item?.image_url));
    }
    if (Array.isArray(payload?.output?.images)) {
        payload.output.images.forEach((item: any) => append(item?.url || item?.image_url));
    }
    if (Array.isArray(payload?.result?.images)) {
        payload.result.images.forEach((item: any) => append(item?.url || item?.image_url));
    }

    if (Array.isArray(payload?.images)) {
        payload.images.forEach((item: any) => append(item?.url || item?.image_url));
    }

    append(payload?.url);
    append(payload?.image_url);
    append(payload?.data?.url);
    append(payload?.data?.image_url);
    append(payload?.data?.data?.url);
    append(payload?.result?.url);
    append(payload?.output?.url);

    return urls;
};

const extractGptImage2TaskId = (payload: any): string => {
    const candidates: any[] = [
        payload?.id,
        payload?.task_id,
        payload?.data?.id,
        payload?.data?.task_id,
        payload?.data?.data?.id,
        payload?.data?.data?.task_id,
        payload?.result?.id,
        payload?.result?.task_id,
        typeof payload?.data === 'string' ? payload.data : '',
        typeof payload?.result === 'string' ? payload.result : '',
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }

    const textCandidates = [
        typeof payload?.message === 'string' ? payload.message : '',
        typeof payload?.msg === 'string' ? payload.msg : '',
        typeof payload?.detail === 'string' ? payload.detail : '',
    ];
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    for (const text of textCandidates) {
        const match = text.match(uuidRegex);
        if (match?.[0]) return match[0];
    }

    return '';
};

const normalizeGptImage2State = (value: any): string => {
    if (value === undefined || value === null) return '';
    return String(value).trim().toLowerCase();
};

const isGptImage2SuccessState = (state: string): boolean => {
    return ['succeeded', 'success', 'completed', 'done', 'ok', 'finished'].includes(state);
};

const isGptImage2FailureState = (state: string): boolean => {
    return ['failed', 'failure', 'error', 'cancelled', 'canceled', 'rejected', 'aborted'].includes(state);
};

const extractGptImage2Error = (payload: any): string => {
    const candidates = [
        payload?.error?.message,
        typeof payload?.error === 'string' ? payload.error : '',
        payload?.message,
        payload?.msg,
        payload?.detail,
        payload?.data?.message,
        payload?.data?.msg,
        payload?.data?.detail,
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }

    return '';
};

const fetchGptImage2Json = async (url: string, options: RequestInit): Promise<any> => {
    const response = await fetch(url, { ...options, credentials: 'omit' });
    const rawText = await response.text();
    let parsed: any = {};
    try {
        parsed = rawText ? JSON.parse(rawText) : {};
    } catch (_err) {
        parsed = null;
    }

    if (!response.ok) {
        const err: any = new Error(`GPT Image 2 API Error ${response.status}: ${rawText.slice(0, 300)}`);
        err.status = response.status;
        err.payload = parsed;
        throw err;
    }

    if (parsed === null) {
        throw new Error("GPT Image 2 returned invalid JSON response.");
    }

    return parsed;
};

const isFailToSubmitTaskError = (error: any): boolean => {
    const payloadMessage = error?.payload?.error?.message || error?.payload?.message || '';
    const msg = `${error?.message || ''} ${payloadMessage}`;
    return String(msg).includes('fail_to_submit_task');
};

const dataUrlToBase64 = (dataUrl: string): string => {
    const parts = dataUrl.split(',');
    if (parts.length < 2 || !parts[1]) {
        throw new Error('Invalid data URL image');
    }
    return parts[1];
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result;
            if (typeof result !== 'string') {
                reject(new Error('Failed to read blob image'));
                return;
            }
            try {
                resolve(dataUrlToBase64(result));
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read blob image'));
        reader.readAsDataURL(blob);
    });
};

const isLikelyPrivateOrLocalHttpUrl = (value: string): boolean => {
    try {
        const url = new URL(value);
        const host = (url.hostname || '').toLowerCase();
        if (!host) return true;
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) return true;
        if (/^10\./.test(host)) return true;
        if (/^192\.168\./.test(host)) return true;
        if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
        return false;
    } catch (_err) {
        return true;
    }
};

const toImgbbImageParam = async (inputImage: string): Promise<string> => {
    if (!inputImage) {
        throw new Error('Empty input image');
    }

    if (inputImage.startsWith('data:image/')) {
        return dataUrlToBase64(inputImage);
    }

    if (inputImage.startsWith('blob:')) {
        const res = await fetch(inputImage);
        if (!res.ok) {
            throw new Error(`Failed to resolve blob image (${res.status})`);
        }
        const blob = await res.blob();
        return blobToBase64(blob);
    }

    // ImgBB supports URL input directly. Keep remote public URLs as-is.
    if (/^https?:\/\//i.test(inputImage) && !isLikelyPrivateOrLocalHttpUrl(inputImage)) {
        return inputImage;
    }

    // For local/private URLs, fetch and upload as base64.
    if (/^https?:\/\//i.test(inputImage)) {
        const res = await fetch(inputImage);
        if (!res.ok) {
            throw new Error(`Failed to fetch local/private image (${res.status})`);
        }
        const blob = await res.blob();
        return blobToBase64(blob);
    }

    throw new Error('Unsupported input image format');
};

const uploadToImgbb = async (inputImage: string): Promise<string> => {
    const imageParam = await toImgbbImageParam(inputImage);
    const form = new FormData();
    form.append('key', IMGBB_API_KEY);
    form.append('image', imageParam);
    form.append('expiration', String(IMGBB_EXPIRATION_SECONDS));

    const res = await fetch(IMGBB_UPLOAD_URL, {
        method: 'POST',
        body: form,
    });

    const rawText = await res.text();
    if (!res.ok) {
        throw new Error(`ImgBB upload failed (${res.status}): ${rawText.slice(0, 300)}`);
    }

    let json: any;
    try {
        json = rawText ? JSON.parse(rawText) : {};
    } catch (_err) {
        throw new Error('ImgBB upload returned invalid JSON');
    }

    if (!json?.success || !json?.data?.url) {
        const msg = json?.error?.message || json?.status_txt || 'Unknown upload error';
        throw new Error(`ImgBB upload failed: ${msg}`);
    }

    return json.data.url;
};

const normalizeGptImage2InputImages = (inputImages: string[]): string[] => {
    if (!Array.isArray(inputImages)) return [];
    return inputImages
        .map((src) => (typeof src === 'string' ? src.trim() : ''))
        .filter((src) => !!src);
};

const resolveGptImage2InputImages = async (inputImages: string[]): Promise<string[]> => {
    const normalized = normalizeGptImage2InputImages(inputImages);
    if (normalized.length === 0) return [];

    const resolved = await Promise.all(normalized.map(async (src) => {
        if (/^https?:\/\//i.test(src) && !isLikelyPrivateOrLocalHttpUrl(src)) {
            return src;
        }
        return uploadToImgbb(src);
    }));

    return resolved.filter((src) => !!src && /^https?:\/\//i.test(src));
};

const pollGptImage2Task = async (taskId: string, config: ModelConfig): Promise<string[]> => {
    const queryUrl = `${GPT_IMAGE_2_QUERY_URL_BASE}/${encodeURIComponent(taskId)}`;

    for (let attempts = 0; attempts < 120; attempts++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const payload = await fetchGptImage2Json(queryUrl, {
            method: 'GET',
            headers: { Authorization: config.key }
        });

        const urls = extractGptImage2Urls(payload);
        if (urls.length > 0) return urls;

        const state = normalizeGptImage2State(payload?.state || payload?.status || payload?.task_status || payload?.data?.state);
        if (isGptImage2SuccessState(state)) {
            continue;
        }

        if (isGptImage2FailureState(state)) {
            const err = extractGptImage2Error(payload);
            throw new Error(`GPT Image 2 task failed: ${err || state}`);
        }
    }

    throw new Error("GPT Image 2 generation timed out.");
};

export const generateGptImage2 = async (
    config: ModelConfig,
    prompt: string,
    size: string,
    inputImages: string[],
    count: number = 1
): Promise<string[]> => {
    if (!config.key) {
        throw new Error("API Key missing. Please configure it in settings.");
    }

    const normalizedCount = Number.isFinite(count) ? Math.max(1, count) : 1;

    const runOne = async (): Promise<string[]> => {
        const normalizedInputImages = await resolveGptImage2InputImages(inputImages);
        const hadInputIntent = Array.isArray(inputImages) && inputImages.some((src) => typeof src === 'string' && src.trim().length > 0);
        if (hadInputIntent && normalizedInputImages.length === 0) {
            throw new Error("GPT Image 2 input image failed to preprocess. Please retry or use a public image URL.");
        }

        const payload: any = {
            model: config.modelId || 'gpt-image-2',
            prompt,
            size: size || '1:1',
        };

        if (normalizedInputImages.length > 0) {
            payload.image = normalizedInputImages;
        }

        const payloadCandidates: any[] = [];
        const appendCandidate = (candidate: any) => {
            const snapshot = JSON.stringify(candidate);
            if (!payloadCandidates.some((item) => JSON.stringify(item) === snapshot)) {
                payloadCandidates.push(candidate);
            }
        };
        appendCandidate(payload);
        // IMPORTANT: if input images exist, do not silently fall back to image-less payloads.
        // This avoids "image-to-image" requests degrading into plain text-to-image.

        let createPayload: any = null;
        let lastCreateError: any = null;
        for (const candidate of payloadCandidates) {
            try {
                createPayload = await fetchGptImage2Json(GPT_IMAGE_2_CREATE_URL, {
                    method: 'POST',
                    headers: {
                        Authorization: config.key,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(candidate),
                });
                lastCreateError = null;
                break;
            } catch (error: any) {
                lastCreateError = error;
                if (!isFailToSubmitTaskError(error)) {
                    throw error;
                }
            }
        }

        if (!createPayload) {
            throw lastCreateError || new Error('GPT Image 2 create task failed.');
        }

        const directUrls = extractGptImage2Urls(createPayload);
        if (directUrls.length > 0) {
            return directUrls;
        }

        const state = normalizeGptImage2State(createPayload?.state || createPayload?.status || createPayload?.task_status);
        if (isGptImage2FailureState(state)) {
            const err = extractGptImage2Error(createPayload);
            throw new Error(`GPT Image 2 task failed: ${err || state}`);
        }

        const taskId = extractGptImage2TaskId(createPayload);
        if (!taskId) {
            const serverMsg = extractGptImage2Error(createPayload);
            throw new Error(`GPT Image 2 did not return task id.${serverMsg ? ` ${serverMsg}` : ''}`);
        }

        return pollGptImage2Task(taskId, config);
    };

    const resultList = await Promise.all(Array.from({ length: normalizedCount }, () => runOne()));
    return resultList.flat().filter((url) => !!url);
};

export const generateStandardImage = async (
    config: ModelConfig,
    modelDef: ModelDef,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    calculatedSize: string,
    inputImages: string[],
    n: number,
    promptOptimize?: boolean
): Promise<string[]> => {
   const targetUrl = constructUrl(config.baseUrl, config.endpoint);
   const normalizedModelId = (config.modelId || '').toLowerCase();
   const normalizedCount = Number.isFinite(n) ? Math.max(1, n) : 1;
   const isFlux = modelDef.id.includes('flux'); 
   const isJimeng = modelDef.id.includes('jimeng') || normalizedModelId.includes('doubao-seedream-4-');
   const isDoubao = modelDef.id.includes('doubao') || normalizedModelId.includes('doubao');
   const isZimage = modelDef.id.includes('z-image');

   if ((isFlux || isZimage) && n > 1) {
      const promises = Array(n).fill(null).map(async () => {
         const payload: any = {
            model: config.modelId, 
            prompt, 
            size: calculatedSize, 
            n: 1 
         };
         if (isFlux) {
             if (resolution !== '1k') payload.quality = 'hd';
         } else if (isZimage) {
             payload.response_format = "b64_json";
             payload.watermark = false;
             // Use promptOptimize if provided, default to false (or true if desired, assuming false for manual control)
             // Existing legacy code forced it to true. Now we use the toggle.
             // If undefined, we can default to true for backward compatibility or false. Let's strictly follow toggle.
             payload.prompt_extend = !!promptOptimize;
             if (inputImages.length > 0) payload.image = inputImages[0].split(',')[1];
         }
         const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });
         const data = (res.data && Array.isArray(res.data)) ? res.data : (res.data ? [res.data] : [res]);
         return data.map((item: any) => {
             if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
             if (item.url) return item.url;
             if (item.image_url) return item.image_url;
             return '';
         }).filter((url: string) => !!url)[0]; 
      });
      const results = await Promise.all(promises);
      return results.filter(r => !!r);
   }

   const payload: any = {
      model: config.modelId, prompt, n: normalizedCount, response_format: "b64_json" 
   };

   if (isFlux) {
       payload.size = calculatedSize;
       if (resolution !== '1k') payload.quality = 'hd';
       delete payload.response_format; 
   } else if (isJimeng) {
       payload.size = calculatedSize;
       payload.response_format = "url";
   } else {
       payload.size = calculatedSize;
   }

   if (isDoubao) {
       payload.watermark = false;
       if (!isJimeng && (resolution === '2k' || resolution === '4k')) payload.response_format = 'url';
   }
   if (isJimeng) {
       payload.sequential_image_generation = normalizedCount > 1 ? 'auto' : 'disabled';
       payload.sequential_image_generation_options = { max_images: normalizedCount };
       if (inputImages.length > 0) payload.image = inputImages;
   }
   if (isZimage) {
       payload.watermark = false;
       payload.prompt_extend = !!promptOptimize;
       if (inputImages.length > 0) payload.image = inputImages[0].split(',')[1];
   }

   const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });
   const data = (res.data && Array.isArray(res.data)) ? res.data : (res.data ? [res.data] : [res]);
   
   return data.map((item: any) => {
       if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
       if (item.url) return item.url;
       if (item.image_url) return item.image_url;
       return '';
   }).filter((url: string) => !!url);
};

export const generateMjModal = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string
): Promise<string> => {
   const targetUrl = constructUrl(config.baseUrl, config.endpoint);
   const payload = { prompt: `${prompt} --ar ${aspectRatio}`, botType: "MID_JOURNEY" };
   const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });
   return res.imageUrl || res.url;
};
