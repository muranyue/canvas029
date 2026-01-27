
import { ModelConfig } from "../types";
import { fetchThirdParty, constructUrl } from "../network";

export const generateKlingO1Video = async (
    config: ModelConfig,
    modelName: string, // "Kling O1 Std" or "Kling O1 Pro"
    prompt: string,
    aspectRatio: string,
    resolution: string,
    duration: string,
    inputImages: string[],
    isStartEndMode: boolean,
    promptOptimize: boolean = false
): Promise<string> => {
    const targetUrl = constructUrl(config.baseUrl, config.endpoint);
    
    const mode = modelName.includes('Pro') ? 'pro' : 'std';
    const durationInt = parseInt(duration.replace('s', '')) || 5;

    // Transform prompt tags: @Image n / @Video n -> <<<image_n>>>
    // Kling treats reference inputs generically as indices
    // Matches @Image 1, @Video1, @图片1, @视频 1 etc.
    const processedPrompt = prompt.replace(/@(?:Image|Video|图片|视频)(?:\s+)?(\d+)/gi, (match, p1) => {
        return `<<<image_${p1}>>>`;
    });

    const payload: any = {
        model: config.modelId, // 'kling-omni-video'
        prompt: processedPrompt,
        aspect_ratio: aspectRatio,
        mode: mode,
        duration: durationInt,
        enhance_prompt: promptOptimize
    };

    // Handle Input Images
    if (inputImages.length > 0) {
        if (isStartEndMode && inputImages.length > 1) {
             // Start/End Frame Mode
             payload.image_list = [
                 { image_url: inputImages[0], type: "first_frame" },
                 { image_url: inputImages[inputImages.length - 1], type: "end_frame" }
             ];
        } else {
             // Reference Image Mode (do not pass type)
             payload.image_list = inputImages.map(url => ({ image_url: url }));
             // Enforce max 1 for reference mode if needed, usually just takes the first
             if (payload.image_list.length > 1) {
                 payload.image_list = [payload.image_list[0]];
             }
        }
    }

    const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 120000 });

    const taskId = res.task_id || res.id || res.data?.task_id || res.data?.id;
    if (!taskId) {
        throw new Error(`No Task ID returned from Kling O1: ${JSON.stringify(res)}`);
    }

    // Polling
    const qUrl = config.queryEndpoint 
        ? constructUrl(config.baseUrl, config.queryEndpoint)
        : `${targetUrl}/${taskId}`;

    let attempts = 0;
    while (attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));
        
        // Handle {id} replacement if present in queryEndpoint
        const finalUrl = qUrl.replace('{id}', taskId);

        try {
            const check = await fetchThirdParty(finalUrl, 'GET', null, config, { timeout: 10000 });
            
            // Prioritize inner task_status if available (common in proxies where root status is API status)
            // Structure might be check.data.data.task_status or check.data.task_status
            const innerStatus = check.data?.data?.task_status || check.data?.task_status || check.task_result?.task_status;
            const rootStatus = check.task_status || check.status;
            const status = (innerStatus || rootStatus || '').toString().toLowerCase();

            if (['succeed', 'success', 'completed'].includes(status)) {
                // Return result
                
                // 1. Try Deepest Nesting (Wrapper -> Data -> TaskResult)
                // matches user provided format: data.data.task_result.videos[0].url
                const videos = check.data?.data?.task_result?.videos || check.data?.task_result?.videos || check.task_result?.videos;
                if (videos && videos[0]?.url) return videos[0].url;

                const images = check.data?.data?.task_result?.images || check.data?.task_result?.images || check.task_result?.images;
                if (images && images[0]?.url) return images[0].url;
                
                // 2. Fallbacks for other structures
                if (check.data?.url) return check.data.url;
                if (check.url) return check.url;
                
                throw new Error("Kling O1 succeeded but no URL found in response.");
            } else if (['failed', 'failure'].includes(status)) {
                 const msg = check.data?.data?.task_status_msg || check.task_status_msg || check.fail_reason || 'Unknown error';
                 throw new Error(`Kling O1 failed: ${msg}`);
            }
        } catch (e: any) {
            if (attempts > 110) throw e;
        }
        attempts++;
    }
    throw new Error("Kling O1 timed out");
};

export const generateKlingStandardVideo = async (
    config: ModelConfig,
    modelName: string, // "Kling 2.5 Std", "Kling 2.6 ProNS", "Kling 2.6 ProYS"
    prompt: string,
    aspectRatio: string,
    duration: string,
    inputImages: string[],
    isStartEndMode: boolean,
    promptOptimize: boolean = false
): Promise<string> => {
    const isImage2Video = inputImages.length > 0;
    const endpointSuffix = isImage2Video ? '/image2video' : '/text2video';
    const baseEndpoint = config.endpoint.replace(/\/$/, '');
    const targetUrl = constructUrl(config.baseUrl, baseEndpoint + endpointSuffix);
    const isV2_6 = config.modelId.includes('v2-6');
    let mode = modelName.includes('Pro') ? 'pro' : 'std';
    if (isV2_6) mode = 'pro';
    const durationInt = parseInt(duration.replace('s', '')) || 5;

    // Clean prompt for standard models (convert @Image n / @Video n to plain text or remove)
    const processedPrompt = prompt.replace(/@(?:Image|Video|图片|视频)(?:\s+)?(\d+)/gi, 'Image $1');
    
    const payload: any = {
        model_name: config.modelId,
        prompt: processedPrompt || '',
        mode: mode,
        duration: durationInt,
        cfg_scale: 0.5,
        aspect_ratio: aspectRatio,
        enhance_prompt: promptOptimize
    };

    if (isV2_6) {
        if (modelName.includes('ProYS')) payload.sound = 'on';
        else if (modelName.includes('ProNS')) payload.sound = 'off';
        else payload.sound = 'off';
    }

    if (isImage2Video) {
        payload.image = inputImages[0];
        if (isStartEndMode && inputImages.length > 1) {
             payload.image_tail = inputImages[inputImages.length - 1];
        }
    }

    const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 120000 });
    const taskId = res.data?.data?.task_id || res.data?.task_id || res.task_id || res.id;
    if (!taskId) throw new Error(`No Task ID returned from Kling: ${JSON.stringify(res)}`);

    let relativePollPath: string;
    if (config.queryEndpoint) relativePollPath = config.queryEndpoint;
    else relativePollPath = `${baseEndpoint}${endpointSuffix}/${taskId}`;
    const finalPollUrlTemplate = constructUrl(config.baseUrl, relativePollPath);

    let attempts = 0;
    while (attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));
        const currentUrl = finalPollUrlTemplate.replace('{id}', taskId);

        try {
            const check = await fetchThirdParty(currentUrl, 'GET', null, config, { timeout: 10000 });
            const innerStatus = check.data?.data?.task_status || check.data?.task_status || check.task_result?.task_status;
            const rootStatus = check.task_status || check.status;
            const status = (innerStatus || rootStatus || '').toString().toLowerCase();

            if (['succeed', 'success', 'completed'].includes(status)) {
                const videos = check.data?.data?.task_result?.videos || check.data?.task_result?.videos || check.task_result?.videos;
                if (videos && videos[0]?.url) return videos[0].url;
                if (check.data?.url) return check.data.url;
                if (check.url) return check.url;
                throw new Error("Kling succeeded but no URL found.");
            } else if (['failed', 'failure'].includes(status)) {
                 const msg = check.data?.data?.task_status_msg || check.task_status_msg || check.fail_reason || 'Unknown error';
                 throw new Error(`Kling failed: ${msg}`);
            }
        } catch (e: any) {
            if (attempts > 110) throw e;
        }
        attempts++;
    }
    throw new Error("Kling timed out");
};
