
import { ModelConfig } from "../types";
import { fetchThirdParty, constructUrl, extractUrlFromContent } from "../network";

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
    const endpointSuffix = hasInput ? '-edit' : '';
    const targetUrl = constructUrl(config.baseUrl, `/api/gemini/nano-banana${endpointSuffix}`);
    
    const payload: any = {
        model: config.modelId,
        prompt: prompt,
        aspect_ratio: aspectRatio,
        image_size: resolution.toUpperCase() 
    };

    if (hasInput) {
        payload.image_urls = [inputImages[0]];
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
        const statusRaw = check.data?.state || check.state || check.data?.status || check.status || check.task_status;
        const status = (statusRaw || '').toString().toUpperCase();
        
        if (['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'OK', '3'].includes(status)) {
            const url = extractBananaUrl(check);
            if (url) return url;
        } else if (['FAIL', 'FAILED', 'FAILURE'].includes(status)) {
            throw new Error(`Banana Edit failed: ${check.fail_reason || check.error || 'Unknown error'}`);
        }
        attempts++;
    }
    throw new Error("Banana Edit timed out");
};
