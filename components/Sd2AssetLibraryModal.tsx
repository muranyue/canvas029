import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icons } from "./Icons";
import {
  createSd2AssetFromFile,
  getSd2AssetConfig,
  loadSd2AssetLibrary,
  querySd2Asset,
  saveSd2AssetLibrary,
  Sd2AssetItem,
  Sd2AssetType,
} from "../services/mode/video/sd2Assets";

interface Sd2AssetLibraryModalProps {
  isOpen: boolean;
  isDark: boolean;
  onClose: () => void;
}

const assetCategories: Array<{ label: string; type: Sd2AssetType; icon: any; accept: string }> = [
  { label: "Images", type: "Image", icon: Icons.Image, accept: "image/*" },
  { label: "Videos", type: "Video", icon: Icons.Video, accept: "video/*" },
  { label: "Audios", type: "Audio", icon: Icons.FileText, accept: "audio/*" },
];

const statusLabelMap: Record<string, string> = {
  ACTIVE: "Active",
  PROCESSING: "Processing",
  FAILED: "Failed",
  ERROR: "Error",
  UNKNOWN: "Unknown",
};

const normalizeAssetType = (value?: string): Sd2AssetType => {
  const text = String(value || "").toLowerCase();
  if (text.includes("video")) return "Video";
  if (text.includes("audio")) return "Audio";
  return "Image";
};

const formatStatus = (status?: string) => {
  const upper = String(status || "UNKNOWN").trim().toUpperCase();
  return statusLabelMap[upper] || upper;
};

const getAssetTypeByMime = (mime?: string): Sd2AssetType => {
  const value = String(mime || "").toLowerCase();
  if (value.startsWith("video/")) return "Video";
  if (value.startsWith("audio/")) return "Audio";
  return "Image";
};

const formatFileSize = (bytes?: number) => {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const revokeBlobIfNeeded = (url?: string) => {
  if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
};

export const Sd2AssetLibraryModal: React.FC<Sd2AssetLibraryModalProps> = ({
  isOpen,
  isDark,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedType, setSelectedType] = useState<Sd2AssetType>("Image");
  const [assetItems, setAssetItems] = useState<Sd2AssetItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState("");
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setAssetItems(loadSd2AssetLibrary());
    setFeedback("");
    setExpandedId(null);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      revokeBlobIfNeeded(selectedFilePreviewUrl);
      assetItems.forEach((item) => revokeBlobIfNeeded(item.localPreviewUrl));
    };
  }, [selectedFilePreviewUrl, assetItems]);

  const cfg = useMemo(() => getSd2AssetConfig(), [isOpen]);
  const hasKey = !!cfg.key;

  const setAndPersist = (next: Sd2AssetItem[]) => {
    setAssetItems(next);
    saveSd2AssetLibrary(next);
  };

  const selectedCategory = assetCategories.find((c) => c.type === selectedType) || assetCategories[0];

  const filteredItems = useMemo(
    () => assetItems.filter((item) => normalizeAssetType(item.assetType) === selectedType),
    [assetItems, selectedType]
  );

  const countByType = useMemo(() => {
    return assetItems.reduce<Record<Sd2AssetType, number>>(
      (acc, item) => {
        const t = normalizeAssetType(item.assetType);
        acc[t] += 1;
        return acc;
      },
      { Image: 0, Video: 0, Audio: 0 }
    );
  }, [assetItems]);

  const updateSelectedFile = (file: File | null) => {
    revokeBlobIfNeeded(selectedFilePreviewUrl);
    if (!file) {
      setSelectedFile(null);
      setSelectedFilePreviewUrl("");
      return;
    }
    const detectedType = getAssetTypeByMime(file.type);
    setSelectedType(detectedType);
    setSelectedFile(file);
    setSelectedFilePreviewUrl(URL.createObjectURL(file));
  };

  const handleSelectFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    updateSelectedFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    const file = e.dataTransfer?.files?.[0] || null;
    if (!file) return;
    const detectedType = getAssetTypeByMime(file.type);
    if (detectedType !== selectedType) {
      setFeedback(`Auto switched to ${detectedType} category.`);
    }
    updateSelectedFile(file);
  };

  const handleCreate = async () => {
    if (!selectedFile) {
      setFeedback("Select a local file first.");
      return;
    }
    setIsSubmitting(true);
    setFeedback("");
    try {
      const created = await createSd2AssetFromFile(selectedFile, selectedType);
      const createdItem: Sd2AssetItem = {
        assetId: created.assetId,
        status: created.status,
        assetType: selectedType,
        localFileName: selectedFile.name,
        localPreviewUrl: selectedFilePreviewUrl || undefined,
        sourceUrl: created.sourceUrl || selectedFile.name,
        createdLocallyAt: Date.now(),
      };
      const next = [createdItem, ...assetItems.filter((item) => item.assetId !== createdItem.assetId)];
      setAndPersist(next);
      setExpandedId(createdItem.assetId);
      setFeedback(`Upload task created: ${createdItem.assetId}`);
      setSelectedFile(null);
      setSelectedFilePreviewUrl("");
    } catch (err: any) {
      setFeedback(err?.message || "Create asset failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    if (assetItems.length === 0) {
      setFeedback("No assets yet.");
      return;
    }
    setIsRefreshing(true);
    setFeedback("");
    try {
      const refreshed = await Promise.all(
        assetItems.map(async (item) => {
          try {
            const latest = await querySd2Asset(item.assetId);
            return { ...item, ...latest, error: "" };
          } catch (err: any) {
            return { ...item, error: err?.message || "Query failed." };
          }
        })
      );
      setAndPersist(refreshed);
      setFeedback("Asset status updated.");
    } catch (err: any) {
      setFeedback(err?.message || "Refresh failed.");
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!isOpen) return null;

  const overlayBg = "fixed inset-0 z-[260] bg-black/65 backdrop-blur-md";
  const modalBg = isDark ? "bg-[#0d1117] border-zinc-700 text-gray-100" : "bg-white border-gray-200 text-gray-900";
  const sidebarBg = isDark ? "bg-[#0a0e14] border-zinc-800" : "bg-gray-50 border-gray-200";
  const panelBg = isDark ? "bg-[#141922] border-zinc-700" : "bg-white border-gray-200";
  const softText = isDark ? "text-zinc-400" : "text-gray-500";
  const cardBg = isDark ? "bg-[#10151e] border-zinc-700" : "bg-gray-50 border-gray-200";
  const uploadZoneClass = isDraggingFile
    ? isDark
      ? "border-cyan-400 bg-cyan-500/10"
      : "border-cyan-400 bg-cyan-50"
    : isDark
    ? "border-zinc-700 bg-black/20 hover:border-zinc-500"
    : "border-gray-300 bg-white hover:border-gray-400";

  return (
    <div
      className={overlayBg}
      onClick={onClose}
      onTouchEnd={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className={`absolute left-1/2 top-1/2 w-[min(1280px,97vw)] h-[min(820px,94vh)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border shadow-2xl flex flex-col ${modalBg}`}
        onClick={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <div className={`px-5 py-4 border-b flex items-center justify-between ${isDark ? "border-zinc-800" : "border-gray-200"}`}>
          <div className="flex items-center gap-2">
            <Icons.Album size={18} className="text-cyan-400" />
            <h2 className="text-sm font-bold tracking-wide">SD2.0 Asset Library</h2>
          </div>
          <button
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isDark ? "hover:bg-zinc-800 text-zinc-400 hover:text-white" : "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
            }`}
            onClick={onClose}
          >
            <Icons.X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden grid grid-cols-[240px_1fr]">
          <div className={`border-r p-4 ${sidebarBg}`}>
            <div className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${softText}`}>Categories</div>
            <div className="space-y-2">
              {assetCategories.map((category) => {
                const active = selectedType === category.type;
                return (
                  <button
                    key={category.type}
                    onClick={() => setSelectedType(category.type)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                      active
                        ? isDark
                          ? "bg-cyan-500/10 border-cyan-500/60 text-cyan-300"
                          : "bg-cyan-50 border-cyan-200 text-cyan-700"
                        : isDark
                        ? "bg-zinc-900 border-zinc-800 hover:border-zinc-600 text-zinc-200"
                        : "bg-white border-gray-200 hover:border-gray-300 text-gray-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <category.icon size={14} />
                        <span className="text-[13px] font-semibold">{category.label}</span>
                      </div>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full ${
                          active
                            ? isDark
                              ? "bg-cyan-500/20 text-cyan-200"
                              : "bg-cyan-100 text-cyan-700"
                            : isDark
                            ? "bg-zinc-800 text-zinc-400"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {countByType[category.type]}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4 overflow-hidden flex flex-col gap-4">
            <div className={`rounded-xl border p-4 ${panelBg}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-bold">
                    Upload {selectedType === "Image" ? "image" : selectedType === "Video" ? "video" : "audio"} asset
                  </div>
                  <div className={`text-[11px] mt-1 ${softText}`}>Select local file and upload it as SD2.0 resource</div>
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing || assetItems.length === 0}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${
                    isDark
                      ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:text-zinc-600"
                      : "border-gray-300 text-gray-700 hover:bg-gray-100 disabled:text-gray-400"
                  }`}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh Status"}
                </button>
              </div>

              <div
                className={`mt-3 rounded-xl border border-dashed p-4 transition-colors ${uploadZoneClass}`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingFile(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingFile(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingFile(false);
                }}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  accept={selectedCategory.accept}
                  onChange={handleFileInputChange}
                />
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold">
                      {selectedFile ? selectedFile.name : "Drag file here, or click to select local file"}
                    </div>
                    <div className={`text-[11px] mt-1 ${softText}`}>
                      {selectedFile
                        ? `${selectedFile.type || "unknown"} · ${formatFileSize(selectedFile.size)}`
                        : `Allowed for current category: ${selectedCategory.label}`}
                    </div>
                  </div>
                  <button
                    onClick={handleSelectFileClick}
                    className={`px-3 py-2 rounded-lg text-[12px] font-semibold border ${
                      isDark
                        ? "border-zinc-600 text-zinc-100 hover:bg-zinc-800"
                        : "border-gray-300 text-gray-800 hover:bg-gray-100"
                    }`}
                  >
                    Choose File
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!hasKey || !selectedFile || isSubmitting}
                  className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
                    !hasKey || !selectedFile || isSubmitting
                      ? isDark
                        ? "bg-zinc-700 text-zinc-500"
                        : "bg-gray-200 text-gray-400"
                      : "bg-cyan-500 text-white hover:bg-cyan-400"
                  }`}
                >
                  {isSubmitting ? "Uploading..." : "Upload Resource"}
                </button>
                {!hasKey && (
                  <div className={`text-[11px] ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                    Please configure SD 2.0 API key in Settings first.
                  </div>
                )}
              </div>

              {feedback && (
                <div
                  className={`mt-3 rounded-lg border px-3 py-2 text-[11px] ${
                    isDark ? "border-zinc-700 bg-zinc-900 text-zinc-200" : "border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  {feedback}
                </div>
              )}
            </div>

            <div className={`flex-1 min-h-0 rounded-xl border p-4 ${panelBg}`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold">
                  {selectedType === "Image" ? "Image Assets" : selectedType === "Video" ? "Video Assets" : "Audio Assets"}
                </div>
                <div className={`text-[11px] ${softText}`}>Total {filteredItems.length}</div>
              </div>

              <div className="mt-3 h-[calc(100%-28px)] overflow-y-auto custom-scrollbar pr-1">
                {filteredItems.length === 0 && (
                  <div className={`h-full flex items-center justify-center text-[12px] ${softText}`}>No assets in this category.</div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {filteredItems.map((item) => {
                    const normalizedType = normalizeAssetType(item.assetType);
                    const previewSrc = item.previewUrl || item.localPreviewUrl || "";
                    const expanded = expandedId === item.assetId;
                    const statusUpper = String(item.status || "").toUpperCase();
                    const statusClass =
                      statusUpper === "ACTIVE"
                        ? isDark
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : statusUpper === "PROCESSING"
                        ? isDark
                          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                        : isDark
                        ? "bg-zinc-800 text-zinc-300 border-zinc-700"
                        : "bg-gray-100 text-gray-700 border-gray-200";

                    return (
                      <div key={item.assetId} className={`rounded-xl border p-3 ${cardBg}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[12px] font-bold truncate">{item.assetId}</div>
                            <div className={`text-[11px] ${softText}`}>
                              {normalizedType} {item.localFileName ? `| ${item.localFileName}` : ""}
                            </div>
                          </div>
                          <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${statusClass}`}>
                            {formatStatus(item.status)}
                          </span>
                        </div>

                        <div className="mt-3 rounded-lg overflow-hidden border border-black/10 bg-black/20 min-h-[180px] flex items-center justify-center">
                          {!previewSrc && <div className={`text-[11px] ${softText}`}>No preview</div>}
                          {previewSrc && normalizedType === "Image" && (
                            <img src={previewSrc} className="w-full h-[220px] object-contain bg-black/30" loading="lazy" decoding="async" />
                          )}
                          {previewSrc && normalizedType === "Video" && (
                            <video src={previewSrc} className="w-full h-[220px] object-contain bg-black/30" controls preload="metadata" />
                          )}
                          {previewSrc && normalizedType === "Audio" && (
                            <div className="w-full px-4 py-6">
                              <audio src={previewSrc} className="w-full" controls preload="metadata" />
                            </div>
                          )}
                        </div>

                        <button
                          className={`mt-2 text-[11px] font-semibold ${
                            isDark ? "text-cyan-300 hover:text-cyan-200" : "text-cyan-700 hover:text-cyan-600"
                          }`}
                          onClick={() => setExpandedId(expanded ? null : item.assetId)}
                        >
                          {expanded ? "Hide Details" : "Show Details"}
                        </button>

                        {expanded && (
                          <div className={`mt-2 pt-2 border-t text-[10px] space-y-1 ${isDark ? "border-zinc-700 text-zinc-300" : "border-gray-200 text-gray-700"}`}>
                            {item.sourceUrl && (
                              <div className="break-all">
                                <span className="opacity-70">source:</span> {item.sourceUrl}
                              </div>
                            )}
                            {item.previewUrl && (
                              <div className="break-all">
                                <span className="opacity-70">previewUrl:</span> {item.previewUrl}
                              </div>
                            )}
                            {item.groupId && (
                              <div className="break-all">
                                <span className="opacity-70">groupId:</span> {item.groupId}
                              </div>
                            )}
                            {item.error && <div className="text-red-400">{item.error}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
