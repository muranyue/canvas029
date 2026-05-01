import { getModelConfig } from "../config";
import { constructUrl, fetchThirdParty } from "../network";
import { ModelConfig } from "../types";

export type Sd2AssetType = "Image" | "Video" | "Audio";

export interface Sd2AssetItem {
    assetId: string;
    status: string;
    assetType?: string;
    groupId?: string;
    previewUrl?: string;
    sourceUrl?: string;
    localPreviewUrl?: string;
    localFileName?: string;
    createTime?: string;
    updateTime?: string;
    createdLocallyAt: number;
    error?: string;
}

const SD2_ASSET_CREATE_ENDPOINT = "/seedance/v3/assets/create";
const SD2_ASSET_QUERY_ENDPOINT = "/seedance/v3/assets/query";
const SD2_ASSET_BASE_URL = "https://ai.t8star.cn";
const SD2_ASSET_LIBRARY_KEY = "SD2_ASSET_LIBRARY_V1";
const IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload";
const IMGBB_API_KEY = "3fcc8e95dc5395ae49bfedcb59302ca1";
const IMGBB_EXPIRATION_SECONDS = 3600;

const createAssetResult = (response: any): { assetId: string; status: string } => {
    const data = parseResponseData(response);
    const assetId = data.assetId || data.id;
    if (!assetId) throw new Error("SD2 asset create did not return assetId");
    return {
        assetId,
        status: data.status || "Processing"
    };
};

const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const value = typeof reader.result === "string" ? reader.result : "";
            if (!value) {
                reject(new Error("Failed to encode file as data URL"));
                return;
            }
            resolve(value);
        };
        reader.onerror = () => reject(new Error("Failed to read local file"));
        reader.readAsDataURL(file);
    });

const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result;
            if (typeof result !== "string") {
                reject(new Error("Failed to read blob image"));
                return;
            }
            try {
                resolve(dataUrlToBase64(result));
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error("Failed to read blob image"));
        reader.readAsDataURL(blob);
    });

const dataUrlToBase64 = (dataUrl: string): string => {
    const parts = dataUrl.split(",");
    if (parts.length < 2 || !parts[1]) {
        throw new Error("Invalid data URL image");
    }
    return parts[1];
};

const uploadImageFileToImgbb = async (file: File): Promise<string> => {
    const dataUrl = await readFileAsDataUrl(file);
    const imageBase64 = dataUrlToBase64(dataUrl);

    const form = new FormData();
    form.append("key", IMGBB_API_KEY);
    form.append("image", imageBase64);
    form.append("name", file.name.replace(/\.[^.]+$/, ""));
    form.append("expiration", String(IMGBB_EXPIRATION_SECONDS));

    const res = await fetch(IMGBB_UPLOAD_URL, { method: "POST", body: form });
    const rawText = await res.text();
    if (!res.ok) {
        throw new Error(`Image bed upload failed (${res.status}): ${rawText.slice(0, 300)}`);
    }

    let json: any = {};
    try {
        json = rawText ? JSON.parse(rawText) : {};
    } catch (_err) {
        throw new Error("Image bed upload returned invalid JSON");
    }

    if (!json?.success || !json?.data?.url) {
        const msg = json?.error?.message || json?.status_txt || "Unknown upload error";
        throw new Error(`Image bed upload failed: ${msg}`);
    }

    return json.data.url as string;
};

const isLikelyPrivateOrLocalHttpUrl = (value: string): boolean => {
    try {
        const url = new URL(value);
        const host = (url.hostname || "").toLowerCase();
        if (!host) return true;
        if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".local")) return true;
        if (/^10\./.test(host)) return true;
        if (/^192\.168\./.test(host)) return true;
        if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
        return false;
    } catch (_err) {
        return true;
    }
};

const toImgbbImageParamFromSource = async (source: string): Promise<string> => {
    const input = String(source || "").trim();
    if (!input) throw new Error("Empty image source");

    if (input.startsWith("data:image/")) {
        return dataUrlToBase64(input);
    }

    if (input.startsWith("blob:")) {
        const res = await fetch(input);
        if (!res.ok) {
            throw new Error(`Failed to resolve local blob image (${res.status})`);
        }
        const blob = await res.blob();
        return blobToBase64(blob);
    }

    if (/^https?:\/\//i.test(input) && !isLikelyPrivateOrLocalHttpUrl(input)) {
        // ImgBB can fetch public URL directly.
        return input;
    }

    if (/^https?:\/\//i.test(input)) {
        const res = await fetch(input);
        if (!res.ok) {
            throw new Error(`Failed to fetch image source (${res.status})`);
        }
        const blob = await res.blob();
        return blobToBase64(blob);
    }

    throw new Error("Unsupported image source format");
};

const uploadImageSourceToImgbb = async (source: string): Promise<string> => {
    const imageParam = await toImgbbImageParamFromSource(source);
    const form = new FormData();
    form.append("key", IMGBB_API_KEY);
    form.append("image", imageParam);
    form.append("expiration", String(IMGBB_EXPIRATION_SECONDS));

    const res = await fetch(IMGBB_UPLOAD_URL, { method: "POST", body: form });
    const rawText = await res.text();
    if (!res.ok) {
        throw new Error(`Image bed upload failed (${res.status}): ${rawText.slice(0, 300)}`);
    }

    let json: any = {};
    try {
        json = rawText ? JSON.parse(rawText) : {};
    } catch (_err) {
        throw new Error("Image bed upload returned invalid JSON");
    }

    if (!json?.success || !json?.data?.url) {
        const msg = json?.error?.message || json?.status_txt || "Unknown upload error";
        throw new Error(`Image bed upload failed: ${msg}`);
    }

    return json.data.url as string;
};

const parseResponseData = (response: any): any => {
    if (response && typeof response === "object") {
        if (response.code !== undefined && response.code !== 0) {
            throw new Error(response.msg || response.message || "SD2 asset API error");
        }
        return response.data || response;
    }
    throw new Error("SD2 asset API returned invalid response");
};

const resolveConfig = (): ModelConfig => {
    const pro = getModelConfig("SD 2.0 Pro");
    const fast = getModelConfig("SD 2.0 Fast");
    const chosen = pro.key ? pro : fast;

    return {
        ...chosen,
        baseUrl: chosen.baseUrl || SD2_ASSET_BASE_URL
    };
};

export const getSd2AssetConfig = resolveConfig;

export const createSd2Asset = async (
    url: string,
    assetType: Sd2AssetType
): Promise<{ assetId: string; status: string }> => {
    const config = resolveConfig();
    const targetUrl = constructUrl(config.baseUrl, SD2_ASSET_CREATE_ENDPOINT);
    const payload = { url, URL: url, assetType, AssetType: assetType };
    const response = await fetchThirdParty(targetUrl, "POST", payload, config, { timeout: 120000, retries: 1 });
    return createAssetResult(response);
};

export const createSd2AssetFromFile = async (
    file: File,
    assetType: Sd2AssetType
): Promise<{ assetId: string; status: string; sourceUrl?: string }> => {
    if (assetType === "Image") {
        const hostedImageUrl = await uploadImageFileToImgbb(file);
        const created = await createSd2Asset(hostedImageUrl, "Image");
        return {
            ...created,
            sourceUrl: hostedImageUrl
        };
    }

    const config = resolveConfig();
    const targetUrl = constructUrl(config.baseUrl, SD2_ASSET_CREATE_ENDPOINT);

    const form = new FormData();
    form.append("file", file, file.name);
    form.append("Name", file.name);
    form.append("name", file.name);
    form.append("AssetType", assetType);
    form.append("assetType", assetType);

    try {
        const response = await fetchThirdParty(targetUrl, "POST", form, config, {
            timeout: 240000,
            retries: 1,
            isFormData: true
        });
        return {
            ...createAssetResult(response),
            sourceUrl: file.name
        };
    } catch (error: any) {
        // Fallback to JSON + data URL for providers that do not accept multipart.
        if ([400, 404, 405, 415, 422].includes(error?.status)) {
            const dataUrl = await readFileAsDataUrl(file);
            const payload = {
                URL: dataUrl,
                url: dataUrl,
                Name: file.name,
                name: file.name,
                AssetType: assetType,
                assetType
            };
            const fallback = await fetchThirdParty(targetUrl, "POST", payload, config, {
                timeout: 240000,
                retries: 0
            });
            return {
                ...createAssetResult(fallback),
                sourceUrl: file.name
            };
        }
        throw error;
    }
};

export const createSd2AssetFromMediaSource = async (
    source: string,
    assetType: Sd2AssetType
): Promise<{ assetId: string; status: string; sourceUrl?: string }> => {
    const input = String(source || "").trim();
    if (!input) throw new Error("Asset source is empty");

    if (assetType === "Image") {
        // Requirement: image must go through image bed first.
        const hostedImageUrl = await uploadImageSourceToImgbb(input);
        const created = await createSd2Asset(hostedImageUrl, "Image");
        return {
            ...created,
            sourceUrl: hostedImageUrl
        };
    }

    if (/^https?:\/\//i.test(input)) {
        const created = await createSd2Asset(input, assetType);
        return {
            ...created,
            sourceUrl: input
        };
    }

    throw new Error("Current media is local preview URL. Please upload from local file in asset library.");
};

export const querySd2Asset = async (assetId: string): Promise<Partial<Sd2AssetItem>> => {
    const config = resolveConfig();
    const queryUrl = constructUrl(config.baseUrl, SD2_ASSET_QUERY_ENDPOINT);

    let response: any;
    try {
        response = await fetchThirdParty(queryUrl, "POST", { assetId }, config, { timeout: 30000, retries: 1 });
    } catch (error: any) {
        if (error?.status === 404 || error?.status === 405) {
            const fallbackUrl = `${queryUrl}?assetId=${encodeURIComponent(assetId)}`;
            response = await fetchThirdParty(fallbackUrl, "GET", null, config, { timeout: 30000, retries: 1 });
        } else {
            throw error;
        }
    }

    const data = parseResponseData(response);
    return {
        assetId: data.assetId || assetId,
        groupId: data.groupId,
        status: data.status || "Unknown",
        assetType: data.assetType,
        previewUrl: data.previewUrl,
        sourceUrl: data.sourceUrl,
        createTime: data.createTime,
        updateTime: data.updateTime
    };
};

const safeReadStorage = (): Sd2AssetItem[] => {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(SD2_ASSET_LIBRARY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item) => item && typeof item.assetId === "string");
    } catch (_err) {
        return [];
    }
};

export const loadSd2AssetLibrary = (): Sd2AssetItem[] => {
    const list = safeReadStorage();
    return list.sort((a, b) => (b.createdLocallyAt || 0) - (a.createdLocallyAt || 0));
};

export const saveSd2AssetLibrary = (list: Sd2AssetItem[]) => {
    if (typeof window === "undefined") return;
    const persisted = list.map((item) => {
        const clone = { ...item };
        if (clone.localPreviewUrl && clone.localPreviewUrl.startsWith("blob:")) {
            delete clone.localPreviewUrl;
        }
        return clone;
    });
    localStorage.setItem(SD2_ASSET_LIBRARY_KEY, JSON.stringify(persisted));
};
