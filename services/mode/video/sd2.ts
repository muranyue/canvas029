import { ModelConfig } from "../types";
import { fetchThirdParty, constructUrl } from "../network";
import {
    loadSd2AssetLibrary,
    uploadImageSourceToImgbb,
    type Sd2AssetItem
} from "./sd2Assets";

const SD2_DEFAULT_CREATE_ENDPOINT = "/v2/videos/generations";
const SD2_DEFAULT_QUERY_ENDPOINT = "/v2/videos/generations/{task_id}";
const SD2_CONTENTS_CREATE_ENDPOINT = "/seedance/v3/contents/generations/tasks";
const SD2_CONTENTS_QUERY_ENDPOINT = "/seedance/v3/contents/generations/tasks/{task_id}";

type MediaReferenceBuckets = {
    images: string[];
    videos: string[];
    audios: string[];
};

type PromptAssetExtraction = MediaReferenceBuckets & {
    promptWithAssetIds: string;
};

type Sd2GenerationMode = "text_to_video" | "image_to_video" | "start_end" | "reference";
type Sd2ContentItem =
    | { type: "text"; text: string }
    | {
        type: "image_url";
        image_url: { url: string };
        role?: "first_frame" | "last_frame" | "reference_image";
    }
    | { type: "video_url"; video_url: { url: string } }
    | { type: "audio_url"; audio_url: { url: string } };

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

    return prompt.replace(/(^|\s)@([^\s@,，。！？!?:;；]+)/g, (full, leadingSpace: string, mention: string) => {
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

const hasPromptAssetReferences = (promptAssets: MediaReferenceBuckets): boolean =>
    promptAssets.images.length > 0 || promptAssets.videos.length > 0 || promptAssets.audios.length > 0;

const buildSd2MultimodalContent = (
    mode: Sd2GenerationMode,
    text: string,
    images: string[],
    videos: string[],
    audios: string[]
): Sd2ContentItem[] => {
    const content: Sd2ContentItem[] = [];
    const normalizedText = normalizePromptText(text).trim();

    if (normalizedText) {
        content.push({ type: "text", text: normalizedText });
    }

    images.forEach((url, index) => {
        if (mode === "start_end") {
            const role = index === 0 ? "first_frame" : "last_frame";
            content.push({ type: "image_url", image_url: { url }, role });
            return;
        }

        if (mode === "reference") {
            content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
            return;
        }

        content.push({ type: "image_url", image_url: { url } });
    });
    videos.forEach((url) => {
        content.push({ type: "video_url", video_url: { url } });
    });
    audios.forEach((url) => {
        content.push({ type: "audio_url", audio_url: { url } });
    });

    return content;
};

const resolveSd2Mode = (
    inputAssets: Array<{ src: string; isVideo?: boolean }>,
    isStartEndMode: boolean,
    isReferenceMode: boolean,
    promptAssets: MediaReferenceBuckets
): Sd2GenerationMode => {
    if (isReferenceMode || hasPromptAssetReferences(promptAssets)) return "reference";

    const connectedInputs = splitMultimodalInputs(inputAssets || []);
    if (isStartEndMode && connectedInputs.images.length > 0) {
        return "start_end";
    }
    if (connectedInputs.images.length > 0) {
        return "image_to_video";
    }
    return "text_to_video";
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

    promptWithAssetIds.replace(/asset:\/\/([^\s,，。！？!?:;；]+)/gi, (_full, rawAssetId: string) => {
        const assetId = String(rawAssetId || "").trim();
        if (!assetId) return "";

        const asset = libraryById.get(assetId.toLowerCase());
        if (!asset) {
            throw new Error(`SD 2.0 asset ${assetId} was not found in the local asset library. Please reselect it from the SD 2.0 asset panel.`);
        }

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
        payload?.content?.video_url,
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

const hasTerminalSd2Error = (payload: any): boolean => {
    const message = extractError(payload);
    if (message && message !== "Unknown error") {
        return true;
    }

    const codeCandidates = [
        payload?.code,
        payload?.error?.code,
        payload?.data?.code,
        payload?.data?.error?.code
    ];

    return codeCandidates.some((candidate) => {
        if (candidate === undefined || candidate === null) return false;
        if (typeof candidate === "number") return candidate !== 0;
        const normalized = String(candidate).trim().toLowerCase();
        return normalized.length > 0 && normalized !== "0" && normalized !== "success" && normalized !== "ok";
    });
};

const resolveSd2CreateEndpoint = (config: ModelConfig): string => {
    const endpoint = String(config.endpoint || "").trim();
    if (!endpoint) return SD2_CONTENTS_CREATE_ENDPOINT;
    if (endpoint === "/seedance/v3/contents/generations") {
        return SD2_CONTENTS_CREATE_ENDPOINT;
    }
    return endpoint;
};

const resolveSd2QueryEndpoint = (config: ModelConfig): string => {
    const endpoint = String(config.queryEndpoint || "").trim();
    if (!endpoint) return SD2_CONTENTS_QUERY_ENDPOINT;
    if (endpoint === "/seedance/v3/contents/generations/{task_id}" || endpoint === "/seedance/v3/contents/generations/{id}") {
        return SD2_CONTENTS_QUERY_ENDPOINT;
    }
    return endpoint;
};

const resolveQueryUrl = (config: ModelConfig, taskId: string): string => {
    const endpoint = resolveSd2QueryEndpoint(config) || SD2_DEFAULT_QUERY_ENDPOINT;
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
    inputAssets: Array<{ src: string; isVideo?: boolean }>,
    isStartEndMode: boolean = false,
    isReferenceMode: boolean = false
): Promise<string> => {
    const createEndpoint = resolveSd2CreateEndpoint(config) || SD2_DEFAULT_CREATE_ENDPOINT;
    const createUrl = constructUrl(config.baseUrl, createEndpoint);
    const connectedInputs = splitMultimodalInputs(inputAssets || []);
    const promptAssets = extractPromptAssetReferences(prompt);
    const mode = resolveSd2Mode(inputAssets, isStartEndMode, isReferenceMode, promptAssets);
    const hostedImages = await convertConnectedImagesToHostedUrls(connectedInputs.images);
    const payloadPromptBase = sanitizeConnectedInputPrompt(prompt);

    let cleanedPrompt = payloadPromptBase;
    let images: string[] = [];
    let videos: string[] = [];
    let audios: string[] = [];

    if (mode === "reference") {
        cleanedPrompt = promptAssets.promptWithAssetIds;
        images = mergeUnique(hostedImages, promptAssets.images);
        videos = mergeUnique(connectedInputs.videos, promptAssets.videos);
        audios = mergeUnique(connectedInputs.audios, promptAssets.audios);
    } else if (mode === "start_end") {
        images = hostedImages.length > 1
            ? [hostedImages[0], hostedImages[hostedImages.length - 1]]
            : hostedImages.slice(0, 1);
    } else if (mode === "image_to_video") {
        images = hostedImages.slice(0, 1);
    }

    const content = buildSd2MultimodalContent(mode, cleanedPrompt, images, videos, audios);
    if (content.length === 0) {
        throw new Error("SD 2.0 content is empty. Please add a prompt or connect at least one valid reference asset.");
    }

    const normalizedRatio = aspectRatio || "16:9";
    const normalizedResolution = resolution || "720p";
    const normalizedDuration = parseDuration(duration);

    // Match the known-good request shape as closely as possible.
    const payload: Record<string, any> = {
        content,
        duration: normalizedDuration,
        generate_audio: true,
        model: config.modelId,
        ratio: normalizedRatio,
        resolution: normalizedResolution,
        watermark: false
    };
    console.debug("SD2 request payload", payload);
    let createResponse: any;
    try {
        createResponse = await fetchThirdParty(createUrl, "POST", payload, config, {
            timeout: 180000,
            retries: 1
        });
    } catch (error: any) {
        if (error && typeof error === "object") {
            error.sd2Payload = payload;
            error.sd2CreateUrl = createUrl;
        }
        throw error;
    }

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

            if (hasTerminalSd2Error(check) && !["SUCCESS", "SUCCEEDED", "COMPLETED", "OK"].includes(status)) {
                throw new Error(`SD 2.0 failed: ${extractError(check)}`);
            }

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
