import { ModelConfig } from "../types";
import { fetchThirdParty, constructUrl } from "../network";

const VIDU_RESULT_QUERY_ENDPOINT = "/ent/v2/tasks/{id}/creations";

const sanitizePrompt = (prompt: string): string =>
    prompt.replace(/@(?:Image|Video|图片|视频)(?:\s+)?(\d+)/gi, "Image $1").trim();

const parseDuration = (duration: string): number => {
    const parsed = parseInt((duration || "").replace("s", ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
};

const isNewViduModel = (modelId: string): boolean => modelId.startsWith("viduq");

const sanitizeSubjectName = (name: string): string => {
    const trimmed = name.trim().toLowerCase();
    const safe = trimmed.replace(/[^a-z0-9_-]/g, "_");
    return safe || "subject";
};

const extractSubjectNamesFromPrompt = (prompt: string): string[] => {
    const matches = [...prompt.matchAll(/@([a-zA-Z0-9_-]+)/g)].map((m) => sanitizeSubjectName(m[1]));
    const unique = Array.from(new Set(matches));
    return unique.slice(0, 7);
};

const generateLegacyViduVideo = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    duration: string,
    inputImages: string[],
    promptOptimize: boolean
): Promise<string> => {
    const targetUrl = constructUrl(config.baseUrl, config.endpoint);
    const durationInt = parseDuration(duration);
    const processedPrompt = sanitizePrompt(prompt);

    const payload: any = {
        model_name: "Vidu",
        model_version: config.modelId,
        prompt: processedPrompt,
        enhance_prompt: promptOptimize ? "Enabled" : "Disabled",
        output_config: {
            resolution: (resolution || "720p").toUpperCase(),
            duration: durationInt,
            aspect_ratio: aspectRatio,
            audio_generation: "Enabled",
            input_compliance_check: "Enabled",
            output_compliance_check: "Enabled"
        }
    };

    if (inputImages.length > 0) {
        payload.file_infos = inputImages.map((url) => ({
            url,
            type: "Url"
        }));
    }

    const res = await fetchThirdParty(targetUrl, "POST", payload, config, { timeout: 120000 });

    if (res.Response && res.Response.Error) {
        throw new Error(`Vidu API Error: ${res.Response.Error.Message} (Code: ${res.Response.Error.Code})`);
    }

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

    const queryEndpoint = config.queryEndpoint || "/tencent-vod/v1/query/{task_id}";
    const queryBase = constructUrl(config.baseUrl, queryEndpoint);

    let attempts = 0;
    while (attempts < 120) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const pollUrl = queryBase.replace("{task_id}", taskId).replace("{id}", taskId);

        try {
            const check = await fetchThirdParty(pollUrl, "GET", null, config, { timeout: 10000 });

            if (check.Response && check.Response.Error) {
                throw new Error(`Vidu Query Error: ${check.Response.Error.Message}`);
            }

            const taskData = check.Response?.AigcVideoTask || check.data?.task_result || check;
            const rawStatus = (taskData.Status || taskData.status || check.Response?.Status || "").toString().toUpperCase();

            if (rawStatus === "FINISH" || rawStatus === "SUCCESS" || rawStatus === "COMPLETED") {
                if (taskData.Output?.FileInfos?.[0]?.FileUrl) {
                    return taskData.Output.FileInfos[0].FileUrl;
                }

                if (taskData.video_url) return taskData.video_url;
                if (taskData.url) return taskData.url;
                if (check.data?.video_url) return check.data.video_url;
                if (check.data?.url) return check.data.url;
                if (check.data?.video?.url) return check.data.video.url;
                if (check.data?.task_result?.videos?.[0]?.url) return check.data.task_result.videos[0].url;

                throw new Error("Vidu succeeded but no URL found.");
            }

            if (["FAIL", "FAILED", "FAILURE", "ERROR"].includes(rawStatus)) {
                throw new Error(`Vidu failed: ${taskData.Message || check.fail_reason || "Unknown error"}`);
            }
        } catch (error: any) {
            if (attempts > 20 && error?.isNonRetryable) throw error;
        }

        attempts++;
    }

    throw new Error("Vidu generation timed out");
};

const buildCreateEndpoint = (
    config: ModelConfig,
    inputImages: string[],
    isStartEndMode: boolean,
    isReferenceMode: boolean
): string => {
    if (config.endpoint && !config.endpoint.includes("/tencent-vod/")) {
        if (isReferenceMode && inputImages.length > 0) return "/ent/v2/reference2video";
        if (inputImages.length > 1 && isStartEndMode) return "/ent/v2/start-end2video";
        if (inputImages.length > 0) return "/ent/v2/img2video";
        return config.endpoint;
    }

    if (isReferenceMode && inputImages.length > 0) return "/ent/v2/reference2video";
    if (inputImages.length > 1 && isStartEndMode) return "/ent/v2/start-end2video";
    if (inputImages.length > 0) return "/ent/v2/img2video";
    return "/ent/v2/text2video";
};

const buildViduPayload = (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    duration: string,
    inputImages: string[],
    isStartEndMode: boolean,
    isReferenceMode: boolean,
    promptOptimize: boolean
) => {
    const cleanedPrompt = sanitizePrompt(prompt);
    const payload: Record<string, any> = {
        model: config.modelId,
        style: "general",
        prompt: cleanedPrompt,
        duration: parseDuration(duration),
        aspect_ratio: aspectRatio,
        resolution: resolution || "720p",
        movement_amplitude: "auto",
        watermark: false
    };

    if (isNewViduModel(config.modelId)) {
        payload.payload = "";
        payload.meta_data = "";
    }

    if (promptOptimize) {
        payload.enhance_prompt = true;
    }

    if (isReferenceMode && inputImages.length > 0) {
        const referencedNames = extractSubjectNamesFromPrompt(cleanedPrompt);
        payload.auto_subjects = false;
        payload.subjects = inputImages.slice(0, 7).map((url, index) => {
            const subjectName = referencedNames[index] || sanitizeSubjectName(`subject${index + 1}`);
            return {
                id: subjectName,
                name: subjectName,
                images: [url]
            };
        });
    } else if (inputImages.length > 1 && isStartEndMode) {
        payload.first_frame_image = inputImages[0];
        payload.last_frame_image = inputImages[inputImages.length - 1];
    } else if (inputImages.length > 0) {
        payload.images = [inputImages[0]];
    }

    return payload;
};

const extractTaskId = (response: any): string | undefined =>
    response?.task_id ||
    response?.id ||
    response?.data?.task_id ||
    response?.data?.id;

const extractViduResultUrl = (response: any): string | undefined => {
    const candidates = [
        response?.data?.creations?.[0]?.url,
        response?.data?.creations?.[0]?.uri,
        response?.creations?.[0]?.url,
        response?.creations?.[0]?.uri,
        response?.data?.videos?.[0]?.url,
        response?.videos?.[0]?.url,
        response?.data?.url,
        response?.url
    ];

    return candidates.find((value) => typeof value === "string" && value.length > 0);
};

const extractViduStatus = (response: any): string => {
    const raw =
        response?.state ??
        response?.status ??
        response?.data?.state ??
        response?.data?.status ??
        response?.task_status ??
        "";

    return String(raw).toLowerCase();
};

const extractErrorMessage = (response: any): string =>
    response?.error?.message ||
    response?.message ||
    response?.fail_reason ||
    response?.data?.message ||
    response?.data?.error?.message ||
    "Unknown error";

export const generateViduVideo = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    duration: string,
    inputImages: string[],
    isStartEndMode: boolean = false,
    isReferenceMode: boolean = false,
    promptOptimize: boolean = false
): Promise<string> => {
    const cleanedImages = Array.isArray(inputImages)
        ? inputImages.filter((src) => typeof src === "string" && src.trim().length > 0)
        : [];

    if (!isNewViduModel(config.modelId)) {
        return generateLegacyViduVideo(
            config,
            prompt,
            aspectRatio,
            resolution,
            duration,
            cleanedImages,
            promptOptimize
        );
    }

    const createEndpoint = buildCreateEndpoint(config, cleanedImages, isStartEndMode, isReferenceMode);
    const createUrl = constructUrl(config.baseUrl, createEndpoint);
    const payload = buildViduPayload(
        config,
        prompt,
        aspectRatio,
        resolution,
        duration,
        cleanedImages,
        isStartEndMode,
        isReferenceMode,
        promptOptimize
    );

    const createResponse = await fetchThirdParty(createUrl, "POST", payload, config, { timeout: 180000 });
    const taskId = extractTaskId(createResponse);

    if (!taskId) {
        throw new Error(`No Task ID returned from Vidu. Response: ${JSON.stringify(createResponse)}`);
    }

    const queryEndpoint = config.queryEndpoint || VIDU_RESULT_QUERY_ENDPOINT;
    const queryUrlTemplate = constructUrl(config.baseUrl, queryEndpoint);

    let attempts = 0;
    while (attempts < 180) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const pollUrl = queryUrlTemplate.replace("{id}", taskId).replace("{task_id}", taskId);

        try {
            const result = await fetchThirdParty(pollUrl, "GET", null, config, { timeout: 15000 });
            const status = extractViduStatus(result);

            if (["succeeded", "success", "completed", "finish", "finished"].includes(status)) {
                const url = extractViduResultUrl(result);
                if (url) return url;
                throw new Error(`Vidu succeeded but no output URL was found. Response: ${JSON.stringify(result)}`);
            }

            if (["failed", "failure", "error", "canceled", "cancelled"].includes(status)) {
                throw new Error(`Vidu failed: ${extractErrorMessage(result)}`);
            }
        } catch (error: any) {
            if (error?.isNonRetryable || attempts > 170) throw error;
        }

        attempts++;
    }

    throw new Error("Vidu generation timed out");
};
