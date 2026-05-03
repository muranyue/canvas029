import { ModelConfig } from "../types";
import { fetchThirdParty, constructUrl } from "../network";
import {
    loadSd2AssetLibrary,
    uploadImageSourceToImgbb,
    type Sd2AssetItem
} from "./sd2Assets";

const SD2_DEFAULT_CREATE_ENDPOINT = "/v2/videos/generations";
const SD2_DEFAULT_QUERY_ENDPOINT = "/v2/videos/generations/{task_id}";

type MediaReferenceBuckets = {
    images: string[];
    videos: string[];
    audios: string[];
};

type PromptAssetExtraction = MediaReferenceBuckets & {
    promptWithAssetIds: string;
};

const normalizePromptText = (prompt: string): string =>
    String(prompt || "")
        .replace(/\u200B/g, "")
        .replace(/\u00A0/g, " ");

const convertAssetMentionsToUri = (prompt: string, library: Sd2AssetItem[]): string => {
    if (!library.length) return prompt;

    const assetMap = new Map<string, string>();
    for (const item of library) {
        const assetId = String(item?.assetId || "").trim();
        if (!assetId) continue;

        const keys = [
            assetId,
            String(item?.localFileName || "").trim()
        ].filter(Boolean);

        for (const key of keys) {
            const normalized = key.toLowerCase();
            if (!normalized || assetMap.has(normalized)) continue;
            assetMap.set(normalized, assetId);
        }
    }
    if (!assetMap.size) return prompt;

    return prompt.replace(/(^|\s)@([^\s@,锛屻€傦紒锛??:;锛沒+)/g, (full, leadingSpace: string, mention: string) => {
        const rawMention = String(mention || "").trim();
        if (!rawMention) return full;
        if (/^(image|video|audio)\d*$/i.test(rawMention)) {
            return full;
        }

        const matchedId = assetMap.get(rawMention.toLowerCase());
        if (!matchedId) return full;
        return `${leadingSpace}asset://${matchedId}`;
    });
};

const sanitizeConnectedInputPrompt = (prompt: string): string =>
    normalizePromptText(prompt)
        .replace(/@(?:Image|Video)(?:\s+)?(\d+)/gi, "Image $1")
        .trim();

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
): MediaReferenceBuckets => {
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

const resolveLibraryAssetBucket = (asset: Sd2AssetItem): keyof MediaReferenceBuckets => {
    const type = String(asset.assetType || "").trim().toLowerCase();
    if (type.includes("video")) return "videos";
    if (type.includes("audio")) return "audios";
    if (type.includes("image")) return "images";

    const hints = [asset.sourceUrl, asset.previewUrl, asset.localPreviewUrl];
    for (const hint of hints) {
        const value = String(hint || "").trim();
        if (!value) continue;
        if (looksLikeVideo(value)) return "videos";
        if (looksLikeAudio(value)) return "audios";
    }

    return "images";
};

const pushUnique = (list: string[], seen: Set<string>, value: string) => {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    list.push(normalized);
};

const mergeUnique = (...lists: string[][]): string[] => {
    const merged: string[] = [];
    const seen = new Set<string>();

    for (const list of lists) {
        for (const item of list) {
            const normalized = String(item || "").trim();
            if (!normalized || seen.has(normalized)) continue;
            seen.add(normalized);
            merged.push(normalized);
        }
    }

    return merged;
};

const extractPromptAssetReferences = (prompt: string): PromptAssetExtraction => {
    const library = loadSd2AssetLibrary();
    const libraryById = new Map<string, Sd2AssetItem>();

    for (const item of library) {
        const assetId = String(item?.assetId || "").trim();
        if (!assetId || libraryById.has(assetId.toLowerCase())) continue;
        libraryById.set(assetId.toLowerCase(), item);
    }

    const promptWithAssetIds = convertAssetMentionsToUri(
        sanitizeConnectedInputPrompt(prompt),
        library
    );

    const promptAssets: MediaReferenceBuckets = {
        images: [],
        videos: [],
        audios: []
    };
    const seenAssetUris = new Set<string>();

    promptWithAssetIds.replace(/asset:\/\/([^\s,锛屻€傦紒锛??:;锛沒+)/gi, (_full, rawAssetId: string) => {
        const assetId = String(rawAssetId || "").trim();
        if (!assetId) return "";

        const asset = libraryById.get(assetId.toLowerCase());
        if (!asset) return "";

        const bucket = resolveLibraryAssetBucket(asset);
        pushUnique(promptAssets[bucket], seenAssetUris, `asset://${assetId}`);
        return "";
    });

    return {
        promptWithAssetIds,
        ...promptAssets
    };
};

const convertConnectedImagesToHostedUrls = async (images: string[]): Promise<string[]> => {
    const hostedImages: string[] = [];

    for (const image of images) {
        hostedImages.push(await uploadImageSourceToImgbb(image));
    }

    return hostedImages;
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
    const connectedInputs = splitMultimodalInputs(inputAssets || []);
    const promptAssets = extractPromptAssetReferences(prompt);
    const hostedImages = await convertConnectedImagesToHostedUrls(connectedInputs.images);

    const cleanedPrompt = promptAssets.promptWithAssetIds;
    const images = mergeUnique(hostedImages, promptAssets.images);
    const videos = mergeUnique(connectedInputs.videos, promptAssets.videos);
    const audios = mergeUnique(connectedInputs.audios, promptAssets.audios);

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
