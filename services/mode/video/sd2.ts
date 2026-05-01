import { ModelConfig } from "../types";
import { fetchThirdParty, constructUrl } from "../network";
import { loadSd2AssetLibrary } from "./sd2Assets";

const SD2_DEFAULT_CREATE_ENDPOINT = "/v2/videos/generations";
const SD2_DEFAULT_QUERY_ENDPOINT = "/v2/videos/generations/{task_id}";

const convertAssetMentionsToUri = (prompt: string): string => {
    const library = loadSd2AssetLibrary();
    if (!library.length) return prompt;

    const assetMap = new Map<string, string>();
    for (const item of library) {
        const key = String(item?.assetId || "").trim().toLowerCase();
        if (!key) continue;
        if (!assetMap.has(key)) {
            assetMap.set(key, item.assetId.trim());
        }
    }
    if (!assetMap.size) return prompt;

    return prompt.replace(/(^|\s)@([^\s@,，。！？!?:;；]+)/g, (full, leadingSpace: string, mention: string) => {
        const matchedId = assetMap.get(String(mention || "").trim().toLowerCase());
        if (!matchedId) return full;
        return `${leadingSpace}asset://${matchedId}`;
    });
};

const sanitizePrompt = (prompt: string): string => {
    const cleaned = String(prompt || "")
        .replace(/@(?:Image|Video)(?:\s+)?(\d+)/gi, "Image $1")
        .trim();

    return convertAssetMentionsToUri(cleaned).trim();
};

const parseDuration = (duration: string): number => {
    const parsed = parseInt(String(duration || "").replace("s", ""), 10);
    if (!Number.isFinite(parsed)) return 5;
    return Math.min(15, Math.max(4, parsed));
};

const looksLikeVideo = (src: string): boolean => {
    const value = String(src || "").toLowerCase();
    if (value.startsWith("data:video/")) return true;
    return /\.(mp4|mov|webm|mkv|avi|m4v)(\?|#|$)/i.test(value);
};

const looksLikeAudio = (src: string): boolean => {
    const value = String(src || "").toLowerCase();
    if (value.startsWith("data:audio/")) return true;
    return /\.(mp3|wav|m4a|aac|ogg|flac)(\?|#|$)/i.test(value);
};

const splitMultimodalInputs = (
    inputs: Array<{ src: string; isVideo?: boolean }>
): { images: string[]; videos: string[]; audios: string[] } => {
    const images: string[] = [];
    const videos: string[] = [];
    const audios: string[] = [];

    for (const item of inputs || []) {
        const src = typeof item?.src === "string" ? item.src.trim() : "";
        if (!src) continue;

        if (item?.isVideo) {
            videos.push(src);
            continue;
        }

        if (looksLikeVideo(src)) {
            videos.push(src);
            continue;
        }
        if (looksLikeAudio(src)) {
            audios.push(src);
            continue;
        }
        images.push(src);
    }

    return { images, videos, audios };
};

const extractTaskId = (payload: any): string => {
    const candidates: any[] = [
        payload?.task_id,
        payload?.id,
        payload?.data?.task_id,
        payload?.data?.id
    ];

    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }
    return "";
};

const extractStatus = (payload: any): string => {
    const raw = payload?.status ?? payload?.state ?? payload?.task_status ?? payload?.data?.status ?? "";
    return String(raw).trim().toUpperCase();
};

const extractVideoUrl = (payload: any): string => {
    const candidates = [
        payload?.data?.output,
        payload?.output,
        payload?.url,
        payload?.video_url,
        payload?.data?.url,
        payload?.data?.video_url,
        payload?.data?.video?.url,
        payload?.result?.url,
        payload?.result?.video_url
    ];

    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }
    return "";
};

const extractError = (payload: any): string => {
    const candidates = [
        payload?.fail_reason,
        payload?.message,
        payload?.msg,
        payload?.error?.message,
        typeof payload?.error === "string" ? payload.error : "",
        payload?.data?.fail_reason,
        payload?.data?.message,
        payload?.data?.msg,
        payload?.data?.error?.message,
        typeof payload?.data?.error === "string" ? payload.data.error : ""
    ];

    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }
    return "Unknown error";
};

const resolveQueryUrl = (config: ModelConfig, taskId: string): string => {
    const endpoint = config.queryEndpoint || SD2_DEFAULT_QUERY_ENDPOINT;
    const resolvedEndpoint = endpoint
        .replace("{task_id}", taskId)
        .replace("{id}", taskId);

    const resolvedUrl = constructUrl(config.baseUrl, resolvedEndpoint);
    if (resolvedUrl.includes(taskId)) return resolvedUrl;
    return `${resolvedUrl.replace(/\/$/, "")}/${taskId}`;
};

export const generateSD2Video = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    duration: string,
    inputAssets: Array<{ src: string; isVideo?: boolean }>
): Promise<string> => {
    const createEndpoint = config.endpoint || SD2_DEFAULT_CREATE_ENDPOINT;
    const createUrl = constructUrl(config.baseUrl, createEndpoint);
    const cleanedPrompt = sanitizePrompt(prompt);
    const { images, videos, audios } = splitMultimodalInputs(inputAssets || []);

    const payload: Record<string, any> = {
        model: config.modelId,
        prompt: cleanedPrompt,
        ratio: aspectRatio || "16:9",
        resolution: resolution || "720p",
        duration: parseDuration(duration)
    };

    if (images.length > 0) payload.images = images;
    if (videos.length > 0) payload.videos = videos;
    if (audios.length > 0) payload.audios = audios;

    const createResponse = await fetchThirdParty(createUrl, "POST", payload, config, {
        timeout: 180000,
        retries: 1
    });

    const directUrl = extractVideoUrl(createResponse);
    if (directUrl) return directUrl;

    const taskId = extractTaskId(createResponse);
    if (!taskId) {
        throw new Error(`SD 2.0 did not return task_id: ${JSON.stringify(createResponse)}`);
    }

    const queryUrl = resolveQueryUrl(config, taskId);
    let attempts = 0;

    while (attempts < 240) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        try {
            const check = await fetchThirdParty(queryUrl, "GET", null, config, { timeout: 15000 });
            const status = extractStatus(check);

            if (["SUCCESS", "SUCCEEDED", "COMPLETED", "OK"].includes(status)) {
                const url = extractVideoUrl(check);
                if (url) return url;
                throw new Error(`SD 2.0 succeeded but output URL missing: ${JSON.stringify(check)}`);
            }

            if (["FAIL", "FAILED", "FAILURE", "ERROR", "CANCELLED", "CANCELED"].includes(status)) {
                throw new Error(`SD 2.0 failed: ${extractError(check)}`);
            }
        } catch (error: any) {
            if (error?.isNonRetryable || attempts > 220) {
                throw error;
            }
        }
        attempts++;
    }

    throw new Error("SD 2.0 generation timed out");
};
