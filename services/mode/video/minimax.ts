
import { ModelConfig } from "../types";
import { fetchThirdParty, constructUrl } from "../network";

const retrieveMinimaxFile = async (fileId: string, taskId: string, config: ModelConfig): Promise<string> => {
    const downloadPath = config.downloadEndpoint || '/v1/files/retrieve';
    const finalPath = `${downloadPath}?file_id=${fileId}&task_id=${taskId}`;
    const url = constructUrl(config.baseUrl, finalPath);
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${config.key}` }
        });
        
        if (!response.ok) throw new Error(`Failed to download file: ${response.status}`);
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            const downloadUrl = data.download_url || data.file_url || data.url || data.data?.download_url || data.data?.file_url || data.file?.download_url;
            if (downloadUrl) return downloadUrl;
        }

        if (!contentType || !contentType.includes('application/json')) {
             const blob = await response.blob();
             return URL.createObjectURL(blob);
        }

        throw new Error("Could not retrieve file URL from JSON response");

    } catch (e) {
        console.error("Error retrieving Minimax file", e);
        throw new Error("File retrieval failed");
    }
};

export const generateMinimaxVideo = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string,
    inputImages: string[],
    isStartEndMode: boolean,
    promptOptimize?: boolean
): Promise<string> => {
     const targetUrl = constructUrl(config.baseUrl, config.endpoint);
     const payload: any = {
        model: config.modelId,
        prompt: prompt,
        aspect_ratio: aspectRatio,
        prompt_optimizer: !!promptOptimize
     };
     
     if (inputImages.length > 0) {
         payload.first_frame_image = inputImages[0];
         if (isStartEndMode && inputImages.length > 1) {
             payload.last_frame_image = inputImages[inputImages.length - 1];
         }
     }
     
     const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 900000, retries: 3 });
     const taskId = res.task_id || res.id || res.data?.task_id || res.data?.id; 
     if (!taskId) throw new Error("No Task ID returned from Minimax");
     
     // Polling
     const qUrl = config.queryEndpoint 
        ? constructUrl(config.baseUrl, config.queryEndpoint)
        : `${targetUrl}/${taskId}`;
        
     let attempts = 0;
     while (attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));
        try {
            const check = await fetchThirdParty(qUrl.includes(taskId) || (config.queryEndpoint && config.queryEndpoint.includes('{id}')) ? qUrl : `${qUrl}?task_id=${taskId}`, 'GET', null, config, { timeout: 10000 });
            
            const rootData = check.data;
            if (rootData && typeof rootData === 'object') {
                const status = (rootData.status || '').toString().toUpperCase();
                if (status === 'SUCCESS' || status === 'OK') {
                    if (rootData.data?.file?.download_url) return rootData.data.file.download_url;
                    const fileId = rootData.data?.file_id || rootData.file_id;
                    if (fileId) return await retrieveMinimaxFile(fileId, taskId, config);
                } else if (status === 'FAIL' || status === 'FAILED') {
                    throw new Error(`Minimax failed: ${rootData.fail_reason || 'Unknown'}`);
                }
            }

            const flatStatus = (check.status || '').toString().toUpperCase();
            if ((flatStatus === 'SUCCESS' || flatStatus === 'OK') && check.file_id) {
                return await retrieveMinimaxFile(check.file_id, taskId, config);
            } else if (flatStatus === 'FAIL' || flatStatus === 'FAILED') {
                throw new Error(`Minimax failed: ${check.base_resp?.status_msg || 'Unknown'}`);
            }
        } catch (e: any) {
             if (attempts > 10 && e.isNonRetryable) throw e;
        }
        attempts++;
     }
     throw new Error("Minimax timeout");
};
