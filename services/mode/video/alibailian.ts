
import { ModelConfig } from "../types";
import { fetchThirdParty, constructUrl } from "../network";

export const generateAlibailianVideo = async (
    config: ModelConfig,
    prompt: string,
    resolution: string,
    duration: string,
    inputImages: string[]
): Promise<string> => {
    const targetUrl = constructUrl(config.baseUrl, config.endpoint);
    
    // Resolution: 720p -> 720P
    const resParam = (resolution || '720p').toUpperCase();
    // Duration: 5s -> 5
    const durParam = parseInt(duration.replace('s', '')) || 5;

    const payload: any = {
        model: config.modelId,
        input: {
            prompt: prompt
        },
        parameters: {
            resolution: resParam,
            prompt_extend: true,
            duration: durParam,
            audio: true
        }
    };

    if (inputImages.length > 0) {
        payload.input.img_url = inputImages[0];
    }

    const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 120000 });
    
    // Response usually { output: { task_id: "..." }, request_id: "..." }
    const taskId = res.output?.task_id || res.task_id;
    if (!taskId) throw new Error(`No Task ID returned from Alibailian: ${JSON.stringify(res)}`);

    const queryEndpoint = config.queryEndpoint || '/alibailian/api/v1/tasks/{id}';
    const pollUrlTemplate = constructUrl(config.baseUrl, queryEndpoint);

    let attempts = 0;
    while (attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));
        
        const pollUrl = pollUrlTemplate.replace('{id}', taskId).replace('{task_id}', taskId);
        
        try {
            const check = await fetchThirdParty(pollUrl, 'GET', null, config, { timeout: 10000 });
            const status = (check.output?.task_status || check.status || '').toUpperCase();

            if (status === 'SUCCEEDED') {
                if (check.output?.video_url) return check.output.video_url;
                throw new Error("Alibailian task succeeded but no video_url found.");
            } else if (status === 'FAILED') {
                throw new Error(`Alibailian failed: ${check.output?.message || check.message || 'Unknown error'}`);
            }
        } catch (e: any) {
            if (attempts > 110) throw e;
        }
        attempts++;
    }
    throw new Error("Alibailian generation timed out");
}
