
import { ModelConfig } from "../types";
import { fetchThirdParty, constructUrl } from "../network";

export const generateSeedanceVideo = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    duration: string,
    inputImages: string[],
    isStartEndMode: boolean
): Promise<string> => {
    // 1. Construct Endpoint
    const targetUrl = constructUrl(config.baseUrl, config.endpoint);
    
    // 2. Determine Model ID (Strict suffix requirement based on documentation)
    // Examples: doubao-seedance-1-5-pro_480p, doubao-seedance-1-5-pro_720p
    let suffix = '_720p'; // Default
    if (resolution === '1080p') suffix = '_1080p';
    else if (resolution === '480p') suffix = '_480p';
    
    // Base ID usually configured as 'doubao-seedance-1-5-pro', ensure we don't double append if config already has it
    const baseId = config.modelId.replace(/_\d+p$/, ''); 
    const modelId = `${baseId}${suffix}`;

    // 3. Parse Duration (must be integer >= 4 and < 12)
    const secondsInt = parseInt(duration.replace('s', '')) || 5;
    const seconds = secondsInt.toString();

    // 4. Construct Payload as FormData (Strictly following documentation)
    const payload = new FormData();
    payload.append('model', modelId);
    payload.append('prompt', prompt);
    payload.append('size', aspectRatio); // "16:9", "4:3", etc.
    payload.append('seconds', seconds); // Must be string

    if (inputImages.length > 0) {
        // first_frame_image expects string (url or base64)
        payload.append('first_frame_image', inputImages[0]);
        
        if (isStartEndMode && inputImages.length > 1) {
             payload.append('last_frame_image', inputImages[inputImages.length - 1]);
        }
    }

    // 5. Send POST Request with isFormData: true
    // This ensures Content-Type is set to multipart/form-data with correct boundary by the browser
    const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 120000, isFormData: true });

    // 6. Handle POST Response
    // Expecting: { id: "task_id", status: "queued", ... } or { data: { id: "..." } }
    const taskId = res.id || res.data?.id || res.task_id; 
    if (!taskId) {
        throw new Error(`No Task ID returned: ${JSON.stringify(res)}`);
    }

    // 7. Poll for Status
    // Endpoint: /v1/videos/{task_id}
    const qUrl = `${targetUrl}/${taskId}`;
    
    let attempts = 0;
    while (attempts < 120) { // Poll for up to 6 minutes (120 * 3s)
        await new Promise(r => setTimeout(r, 3000));
        
        try {
            const check = await fetchThirdParty(qUrl, 'GET', null, config, { timeout: 10000 });
            
            // Normalize status extraction (check root and data)
            const statusRaw = check.status || check.data?.status;
            const status = (statusRaw || '').toString().toLowerCase();

            if (['completed', 'succeeded', 'success'].includes(status)) {
                // Robust extraction of video_url
                if (check.video_url) return check.video_url;
                if (check.data?.video_url) return check.data.video_url;
                
                // Fallbacks
                if (check.url) return check.url;
                if (check.data?.url) return check.data.url;
                if (check.data?.video?.url) return check.data.video.url;
                if (check.output?.url) return check.output.url;
                if (check.result?.url) return check.result.url;

                // Log full response if URL is missing to help debugging
                console.error("Doubao video generation succeeded but URL is missing. Response:", check);
                throw new Error("Video generation completed but no video_url found in response");
            } else if (['failed', 'failure'].includes(status)) {
                const errorDetail = check.error?.message || check.error || check.data?.error?.message || check.data?.error || 'Unknown error';
                throw new Error(`Generation failed: ${errorDetail}`);
            } else if (status === 'cancelled') {
                throw new Error("Generation was cancelled");
            }
        } catch (e: any) {
            // Ignore transient network errors during polling unless max attempts reached
            if (attempts > 110) throw e;
            console.warn("Polling error (retrying):", e);
        }
        
        attempts++;
    }
    throw new Error("Video generation timed out");
};
