
import { ModelConfig } from "../types";
import { fetchThirdParty, constructUrl } from "../network";

export const generateViduVideo = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    duration: string,
    inputImages: string[],
    promptOptimize: boolean = false
): Promise<string> => {
    const targetUrl = constructUrl(config.baseUrl, config.endpoint);
    const durationInt = parseInt(duration.replace('s', '')) || 4;

    const processedPrompt = prompt.replace(/@(?:Image|Video|图片|视频)(?:\s+)?(\d+)/gi, 'Image $1');

    const payload: any = {
        model_name: "Vidu",
        model_version: config.modelId, // 'q2-pro' or 'q2-turbo'
        prompt: processedPrompt,
        enhance_prompt: promptOptimize ? "Enabled" : "Disabled",
        output_config: {
            resolution: resolution.toUpperCase(), // 720P, 1080P
            duration: durationInt,
            aspect_ratio: aspectRatio,
            audio_generation: "Enabled",
            input_compliance_check: "Enabled",
            output_compliance_check: "Enabled"
        }
    };

    if (inputImages.length > 0) {
        payload.file_infos = inputImages.map(url => ({
            url: url,
            type: "Url"
        }));
    }

    const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 120000 });
    
    // Handle Tencent Response Wrapper Error
    if (res.Response && res.Response.Error) {
        throw new Error(`Vidu API Error: ${res.Response.Error.Message} (Code: ${res.Response.Error.Code})`);
    }

    // Extract Task ID - Check Tencent structure first, then flat proxy structure
    const taskId = 
        res.Response?.AigcVideoTask?.TaskId || 
        res.Response?.TaskId || 
        res.id || 
        res.task_id || 
        res.data?.id || 
        res.data?.task_id;

    if (!taskId) {
        throw new Error(`No Task ID returned from Vidu. Response: ${JSON.stringify(res)}`);
    }

    // Use queryEndpoint if configured (should be /tencent-vod/v1/query/{task_id})
    // Or construct manually if needed
    const queryEndpoint = config.queryEndpoint || '/tencent-vod/v1/query/{task_id}';
    const queryBase = constructUrl(config.baseUrl, queryEndpoint);

    let attempts = 0;
    while (attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));
        
        // Handle {task_id} replacement
        const pollUrl = queryBase.replace('{task_id}', taskId).replace('{id}', taskId);
        
        try {
            const check = await fetchThirdParty(pollUrl, 'GET', null, config, { timeout: 10000 });
            
            // Handle Tencent Response Wrapper for Query
            if (check.Response && check.Response.Error) {
                 throw new Error(`Vidu Query Error: ${check.Response.Error.Message}`);
            }

            // Extract Task Status and Output
            // Supports both wrapped (Tencent) and unwrapped (Proxy) structures
            // Tencent: Response.AigcVideoTask
            const taskData = check.Response?.AigcVideoTask || check.data?.task_result || check;
            
            // Tencent Status: FINISH (Success). Proxy might use SUCCESS/COMPLETED.
            const rawStatus = (taskData.Status || taskData.status || check.Response?.Status || '').toString().toUpperCase();

            if (rawStatus === 'FINISH' || rawStatus === 'SUCCESS' || rawStatus === 'COMPLETED') {
                // 1. Check Tencent Structure: Response.AigcVideoTask.Output.FileInfos[0].FileUrl
                if (taskData.Output?.FileInfos?.[0]?.FileUrl) {
                    return taskData.Output.FileInfos[0].FileUrl;
                }
                
                // 2. Check Proxy/Alternative Structures
                if (taskData.video_url) return taskData.video_url;
                if (taskData.url) return taskData.url;
                if (check.data?.video_url) return check.data.video_url;
                if (check.data?.url) return check.data.url;
                if (check.data?.video?.url) return check.data.video.url;
                if (check.data?.task_result?.videos?.[0]?.url) return check.data.task_result.videos[0].url;
                
                throw new Error("Vidu succeeded but no URL found.");
            } else if (['FAIL', 'FAILED', 'FAILURE', 'ERROR'].includes(rawStatus)) {
                throw new Error(`Vidu failed: ${taskData.Message || check.fail_reason || 'Unknown error'}`);
            }
        } catch (e: any) {
            if (attempts > 20 && e.isNonRetryable) throw e;
        }
        attempts++;
    }
    throw new Error("Vidu generation timed out");
};
