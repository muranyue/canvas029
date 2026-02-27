
import { ModelConfig } from "../types";
import { fetchThirdParty, constructUrl, extractUrlFromContent } from "../network";

const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';
const IMGBB_API_KEY = '3fcc8e95dc5395ae49bfedcb59302ca1';
const IMGBB_EXPIRATION_SECONDS = 3600;

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

    return inputImage;
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
        json = JSON.parse(rawText);
    } catch (e) {
        throw new Error('ImgBB upload returned invalid JSON');
    }

    if (!json?.success || !json?.data?.url) {
        const msg = json?.error?.message || json?.status_txt || 'Unknown upload error';
        throw new Error(`ImgBB upload failed: ${msg}`);
    }

    return json.data.url;
};

const normalizeStatus = (raw: any): string => {
    if (raw === undefined || raw === null) return '';
    return String(raw).trim().toUpperCase();
};

const extractBananaStatus = (data: any): string => {
    const candidates = [
        data?.data?.data?.state,
        data?.data?.data?.status,
        data?.data?.state,
        data?.data?.status,
        data?.data?.task_status,
        data?.state,
        data?.status,
        data?.task_status,
        data?.result?.status,
        data?.output?.status,
    ];

    for (const candidate of candidates) {
        const status = normalizeStatus(candidate);
        if (status) return status;
    }
    return '';
};

const extractBananaErrorMessage = (data: any): string => {
    const candidates = [
        data?.fail_reason,
        data?.error?.message,
        typeof data?.error === 'string' ? data.error : undefined,
        data?.message,
        data?.msg,
        data?.detail,
        data?.data?.fail_reason,
        data?.data?.error?.message,
        typeof data?.data?.error === 'string' ? data.data.error : undefined,
        data?.data?.message,
        data?.data?.msg,
        data?.data?.detail,
        data?.data?.data?.fail_reason,
        data?.data?.data?.message,
        data?.data?.data?.msg,
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }
    return '';
};

const isSuccessStatus = (status: string): boolean => {
    return ['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'OK', 'DONE', 'FINISHED', '3'].includes(status);
};

const isFailureStatus = (status: string): boolean => {
    if (['FAIL', 'FAILED', 'FAILURE', 'ERROR', 'CANCELLED', 'CANCELED', 'REJECTED', 'ABORTED', '-1', '4'].includes(status)) {
        return true;
    }

    if (/^\d+$/.test(status)) {
        const code = Number(status);
        if (code >= 400) return true;
    }

    return false;
};

const normalizeMessage = (message: string): string => {
    return message.trim().toUpperCase().replace(/[\s-]+/g, '_');
};

const isPositiveOrNeutralMessage = (message: string): boolean => {
    if (!message || !message.trim()) return false;
    const normalized = normalizeMessage(message);
    return [
        'SUCCESS',
        'SUCCEEDED',
        'OK',
        'COMPLETED',
        'DONE',
        'FINISHED',
        'PENDING',
        'PROCESSING',
        'RUNNING',
        'IN_PROGRESS',
        'QUEUED',
    ].includes(normalized);
};

const hasErrorHintInMessage = (message: string): boolean => {
    if (!message || !message.trim()) return false;
    return /(fail|error|invalid|forbidden|denied|unauthorized|timeout|expired|exception|not found|bad request|rate limit)/i.test(message);
};

export const generateBananaChatImage = async (
    config: ModelConfig,
    prompt: string, 
    aspectRatio: string,
    resolution: string,
    calculatedSize: string,
    inputImages: string[] = []
): Promise<string> => {
    const targetUrl = constructUrl(config.baseUrl, config.endpoint);
    const enhancedPrompt = `Strictly generate an image with aspect ratio ${aspectRatio} and ${resolution} resolution details. \n\nUser Request: ${prompt}`;
    const messages: any[] = [{ role: 'user', content: enhancedPrompt }];
    if (inputImages.length > 0) {
        const content: any[] = [{ type: 'text', text: enhancedPrompt }];
        inputImages.forEach(img => { if (img) content.push({ type: 'image_url', image_url: { url: img } }); });
        messages[0].content = content;
    }
    
    // Check if the model is Pro (Gemini 3) or Flash (Banana/Gemini 2.5)
    // Banana ID: gemini-2.5-flash-image-preview
    // Banana Pro ID: gemini-3-pro-image-preview
    const isPro = config.modelId.toLowerCase().includes('pro');

    const payload: any = {
        model: config.modelId, 
        messages, 
        aspect_ratio: aspectRatio, 
    };

    // Only Pro models support explicit size/resolution configuration
    if (isPro) {
        payload.resolution = resolution;
        payload.size = calculatedSize;
    }
    
    const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });
    const content = res.choices?.[0]?.message?.content;
    return extractUrlFromContent(content);
};

export const generateBananaEdit = async (
    config: ModelConfig,
    prompt: string, 
    aspectRatio: string,
    resolution: string,
    inputImages: string[]
): Promise<string> => {
    const hasInput = inputImages.length > 0;
    const uploadedInputImages = hasInput
        ? await Promise.all(inputImages.map(img => uploadToImgbb(img)))
        : [];
    const endpointSuffix = hasInput ? '-edit' : '';
    const targetUrl = constructUrl(config.baseUrl, `/api/gemini/nano-banana${endpointSuffix}`);
    
    const payload: any = {
        model: config.modelId,
        prompt: prompt,
        aspect_ratio: aspectRatio,
        image_size: resolution.toUpperCase() 
    };

    if (hasInput) {
        payload.image_urls = uploadedInputImages;
    }

    const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });
    
    const extractBananaUrl = (data: any) => {
        if (!data) return null;
        
        // Handle deep nesting: data.data.data.images (From User Log)
        const deepImages = data?.data?.data?.images;
        if (Array.isArray(deepImages) && deepImages[0]?.url) {
            return deepImages[0].url;
        }

        // Handle standard nesting: data.data.images
        const midImages = data?.data?.images;
        if (Array.isArray(midImages) && midImages[0]?.url) {
             return midImages[0].url;
        }

        // Handle root nesting: images
        const rootImages = data?.images;
        if (Array.isArray(rootImages) && rootImages[0]?.url) {
             return rootImages[0].url;
        }

        // Handle direct URLs
        if (data?.url) return data.url;
        if (data?.data?.url) return data.data.url;
        if (data?.output?.url) return data.output.url;
        if (data?.result?.url) return data.result.url;
        
        return null;
    };

    const immediateUrl = extractBananaUrl(res);
    if (immediateUrl) return immediateUrl;

    const initialStatus = extractBananaStatus(res);
    if (isFailureStatus(initialStatus)) {
        const errMsg = extractBananaErrorMessage(res) || initialStatus;
        throw new Error(`Banana Edit failed: ${errMsg}`);
    }

    const taskId = res.id || res.task_id || res.data?.id || res.data?.task_id || (typeof res.data === 'string' ? res.data : undefined);

    if (!taskId) {
        if (res.url) return res.url;
        if (res.data && res.data.url) return res.data.url;
        throw new Error("No Task ID returned from Banana Pro Edit");
    }

    const queryUrl = constructUrl(config.baseUrl, `/api/gemini/nano-banana/${taskId}`);

    let attempts = 0;
    while (attempts < 120) {
        await new Promise(r => setTimeout(r, 3000));
        const check = await fetchThirdParty(queryUrl, 'GET', null, config, { timeout: 10000 });

        const url = extractBananaUrl(check);
        if (url) return url;

        const status = extractBananaStatus(check);
        const errMsg = extractBananaErrorMessage(check);
        const explicitFailure = check?.success === false || check?.data?.success === false;
        const explicitFailureWithError = explicitFailure && (
            isFailureStatus(status) ||
            hasErrorHintInMessage(errMsg) ||
            (errMsg && !isPositiveOrNeutralMessage(errMsg))
        );

        if (isSuccessStatus(status)) {
            // Some providers mark success before URL propagation; keep polling.
        } else if (isFailureStatus(status) || explicitFailureWithError) {
            const finalError = errMsg && !isPositiveOrNeutralMessage(errMsg)
                ? errMsg
                : (status || 'Unknown error');
            throw new Error(`Banana Edit failed: ${finalError}`);
        }
        attempts++;
    }
    throw new Error("Banana Edit timed out");
};
