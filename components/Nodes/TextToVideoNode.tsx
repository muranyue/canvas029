
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NodeData } from '../../types';
import { Icons } from '../Icons';
import { getModelConfig, MODEL_REGISTRY } from '../../services/geminiService';
import { VIDEO_HANDLERS } from '../../services/mode/video/configurations';
import { getVideoConstraints, getAutoCorrectedVideoSettings } from '../../services/mode/video/rules';
import { loadSd2AssetLibrary, type Sd2AssetItem } from '../../services/mode/video/sd2Assets';
import { LocalEditableTitle, LocalCustomDropdown, LocalInputThumbnails, LocalMediaStack, LoadingOverlay } from './Shared/LocalNodeComponents';

const videoToolbarItems = [
    { id: 'plot', label: 'Plot', icon: Icons.BookOpen },
    { id: 'start_end', label: 'Start/End', icon: Icons.ArrowRightLeft },
    { id: 'all_reference', label: 'All Ref', icon: Icons.Layers },
    { id: 'region', label: 'Region', icon: Icons.Scan },
    { id: 'camera', label: 'Camera', icon: Icons.Camera }
];

const SD2_MODEL_SET = new Set(['SD 2.0 Fast', 'SD 2.0 Pro']);

const extractAssetMentionAtCursor = (prompt: string, cursorIndex?: number | null): { query: string; start: number; end: number } | null => {
    const text = String(prompt || '')
        .replace(/\u200B/g, '')
        .replace(/\u00A0/g, ' ');
    const rawCursor = typeof cursorIndex === 'number' ? cursorIndex : text.length;
    const safeCursor = Math.max(0, Math.min(rawCursor, text.length));

    let start = safeCursor;
    while (start > 0) {
        const prev = text[start - 1];
        if (prev === '@') {
            start -= 1;
            break;
        }
        if (/\s/.test(prev)) {
            return null;
        }
        start -= 1;
    }

    if (start < 0 || text[start] !== '@') return null;
    const query = text.slice(start + 1, safeCursor);
    // Only replace what the user has typed up to the caret so trailing prose
    // (especially CJK text without spaces) is preserved.
    return { query, start, end: safeCursor };
};

const replaceAssetMentionWithAssetUri = (prompt: string, assetId: string, cursorIndex?: number | null): string => {
    const text = String(prompt || '');
    const mention = extractAssetMentionAtCursor(text, cursorIndex);
    const replacement = `asset://${assetId}`;

    if (!mention) {
        if (!text.trim()) return `${replacement} `;
        return `${text}${text.endsWith(' ') ? '' : ' '}${replacement} `;
    }

    return `${text.slice(0, mention.start)}${replacement} ${text.slice(mention.end)}`;
};

const normalizePromptInput = (value: string): string =>
    String(value || '')
        .replace(/\u200B/g, '')
        .replace(/\u00A0/g, ' ');

const getSdAssetPreviewUrl = (asset: Sd2AssetItem): string => {
    const type = String(asset.assetType || '').toLowerCase();
    const candidates =
        type === 'image'
            ? [asset.localPreviewUrl, asset.previewUrl, asset.sourceUrl]
            : [asset.localPreviewUrl, asset.previewUrl];
    for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (value) return value;
    }
    return '';
};

interface TextToVideoNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string) => void;
  selected?: boolean;
  showControls?: boolean;
  inputs?: { src: string, isVideo: boolean }[];
  onMaximize?: (id: string) => void;
  onDownload?: (id: string) => void;
  onUploadToAssetLibrary?: (id: string) => void;
  onDelete?: (id: string) => void;
  onToolbarAction?: (nodeId: string, action: string) => void;
  isDark?: boolean;
  isSelecting?: boolean;
}

export interface PromptInputHandle {
    insertText: (text: string) => void;
    getCursorIndex: () => number | null;
}

// ContentEditable prompt input implemented with Selection/Range APIs (no execCommand).
const ContentEditablePromptInput = React.forwardRef<PromptInputHandle, { 
    value: string; 
    onChange: (val: string) => void; 
    onBlur?: (val: string) => void;
    placeholder?: string;
    isDark: boolean;
    assetLibrary?: Sd2AssetItem[];
}>(({ value, onChange, onBlur, placeholder, isDark, assetLibrary = [] }, ref) => {
    const divRef = useRef<HTMLDivElement>(null);
    const isComposingRef = useRef(false);
    const isFocusingRef = useRef(false);
    const [showPlaceholder, setShowPlaceholder] = useState(true);
    const [draftValue, setDraftValue] = useState(() => normalizePromptInput(value));
    const [hoverPreview, setHoverPreview] = useState<{ url: string; x: number; y: number } | null>(null);
    const draftValueRef = useRef(draftValue);

    const escapeHtml = useCallback((str: string) =>
        str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    , []);

    const assetLookup = useMemo(() => {
        const map = new Map<string, Sd2AssetItem>();
        for (const item of assetLibrary) {
            const key = String(item.assetId || '').trim().toLowerCase();
            if (!key) continue;
            if (!map.has(key)) {
                map.set(key, item);
            }
        }
        return map;
    }, [assetLibrary]);

    const createTokenChipHtml = useCallback((text: string) => {
        const safe = escapeHtml(text);
        return `<span class="inline-flex items-center justify-center h-5 px-1.5 mx-0.5 my-0.5 rounded-md bg-purple-500/20 text-purple-400 border border-purple-500/30 font-bold text-[10px] align-middle select-none chip transform translate-y-[-1px]" contenteditable="false" data-value="${safe}">${safe}</span>\u200B`;
    }, [escapeHtml]);

    const createAssetChipHtml = useCallback((text: string) => {
        const safeToken = escapeHtml(text);
        const assetId = String(text || '').replace(/^asset:\/\//i, '').trim();
        const lookupKey = assetId.toLowerCase();
        const asset = assetLookup.get(lookupKey);
        const previewUrl = asset ? getSdAssetPreviewUrl(asset) : '';
        const safeAssetId = escapeHtml(assetId);
        const safePreviewUrl = previewUrl ? escapeHtml(previewUrl) : '';
        const thumbHtml = previewUrl
            ? `<img src="${safePreviewUrl}" alt="" draggable="false" class="w-full h-full object-cover" />`
            : '<span class="text-[8px] font-bold text-zinc-400">ASSET</span>';

        return `<span class="inline-flex items-center h-6 px-1.5 mx-0.5 my-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 align-middle select-none chip cursor-zoom-in" contenteditable="false" data-value="${safeToken}" data-asset-id="${safeAssetId}" data-preview-url="${safePreviewUrl}"><span class="w-4 h-4 rounded overflow-hidden shrink-0 bg-zinc-800 border border-zinc-700 flex items-center justify-center">${thumbHtml}</span></span>\u200B`;
    }, [assetLookup, escapeHtml]);

    const createChipHtml = useCallback((text: string) => {
        if (text.toLowerCase().startsWith('asset://')) {
            return createAssetChipHtml(text);
        }
        return createTokenChipHtml(text);
    }, [createAssetChipHtml, createTokenChipHtml]);

    useEffect(() => {
        draftValueRef.current = draftValue;
        setShowPlaceholder(!draftValue || draftValue.trim().length === 0);
    }, [draftValue]);

    const getPlainText = (node: Node): string => {
        let text = '';
        node.childNodes.forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
                text += child.textContent?.replace(/\u00A0/g, ' ').replace(/\u200B/g, '') || '';
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const el = child as HTMLElement;
                if (el.classList.contains('chip')) {
                    text += el.dataset.value || '';
                } else if (el.tagName === 'BR') {
                    text += '\n';
                } else if (el.tagName === 'DIV') {
                    text += '\n' + getPlainText(el);
                } else {
                    text += getPlainText(el);
                }
            }
        });
        return text;
    };

    const getCursorIndex = useCallback((): number | null => {
        const div = divRef.current;
        const sel = window.getSelection();
        if (!div || !sel || sel.rangeCount === 0) return null;

        const range = sel.getRangeAt(0);
        if (!div.contains(range.startContainer)) return null;

        const preRange = range.cloneRange();
        preRange.selectNodeContents(div);
        preRange.setEnd(range.startContainer, range.startOffset);
        return getPlainText(preRange.cloneContents()).length;
    }, []);

    // Insert text/html using the Selection/Range APIs.
    const insertAtCursor = (content: string, isHtml: boolean) => {
        const div = divRef.current;
        if (!div) return;
        
        const sel = window.getSelection();
        if (!sel) return;
        
        // Ensure there is an active range.
        let range: Range;
        if (sel.rangeCount > 0) {
            range = sel.getRangeAt(0);
            // Ensure the range is inside the current editable div.
            if (!div.contains(range.commonAncestorContainer)) {
                range = document.createRange();
                range.selectNodeContents(div);
                range.collapse(false);
            }
        } else {
            range = document.createRange();
            range.selectNodeContents(div);
            range.collapse(false);
        }
        
        range.deleteContents();
        
        if (isHtml) {
            const temp = document.createElement('div');
            temp.innerHTML = content;
            const frag = document.createDocumentFragment();
            let lastNode: Node | null = null;
            while (temp.firstChild) {
                lastNode = temp.firstChild;
                frag.appendChild(temp.firstChild);
            }
            range.insertNode(frag);
            if (lastNode) {
                range.setStartAfter(lastNode);
                range.setEndAfter(lastNode);
            }
        } else {
            const textNode = document.createTextNode(content);
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.setEndAfter(textNode);
        }
        
        sel.removeAllRanges();
        sel.addRange(range);
        
        // Trigger value sync via onChange.
        const newText = getPlainText(div);
        setDraftValue(newText);
        onChange(newText);
    };

    React.useImperativeHandle(ref, () => ({
        insertText: (text: string) => {
            if (divRef.current) {
                divRef.current.focus();
                // Delay insertion until focus is applied.
                setTimeout(() => {
                    if (text.startsWith('@') || text.toLowerCase().startsWith('asset://')) {
                        insertAtCursor(createChipHtml(text), true);
                    } else {
                        insertAtCursor(text, false);
                    }
                }, 0);
            }
        },
        getCursorIndex,
    }), [createChipHtml, getCursorIndex]);

    const parseTextToHtml = useCallback((text: string) => {
        if (!text) return '';
        const regex = /(asset:\/\/[^\s]+|@(?:image|video)\s+\d+)/gi;

        return text.split(regex).map(part => {
            if (/^asset:\/\/[^\s]+$/i.test(part) || /^@(?:image|video)\s+\d+$/i.test(part)) {
                return createChipHtml(part);
            }
            return escapeHtml(part);
        }).join('').replace(/\n/g, '<br>');
    }, [createChipHtml, escapeHtml]);

    const syncDomToValue = useCallback((nextValue: string, preserveSelection = false) => {
        const div = divRef.current;
        if (!div) {
            setShowPlaceholder(!nextValue || nextValue.trim().length === 0);
            return;
        }

        const normalizedValue = normalizePromptInput(nextValue);
        const currentText = normalizePromptInput(getPlainText(div));
        const normalizedCurrent = currentText.replace(/\s+/g, ' ').trim();
        const comparableValue = normalizedValue.replace(/\s+/g, ' ').trim();
        const shouldRewriteDom = normalizedCurrent !== comparableValue || (!normalizedValue && div.innerHTML !== '');

        if (shouldRewriteDom) {
            div.innerHTML = normalizedValue ? parseTextToHtml(normalizedValue) : '';
        }

        if (preserveSelection && document.activeElement === div) {
            const sel = window.getSelection();
            if (sel) {
                const range = document.createRange();
                range.selectNodeContents(div);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }

        setShowPlaceholder(!normalizedValue || normalizedValue.trim().length === 0);
    }, [parseTextToHtml]);

    useEffect(() => {
        const normalizedValue = normalizePromptInput(value);
        if (normalizedValue !== draftValueRef.current) {
            setDraftValue(normalizedValue);
            draftValueRef.current = normalizedValue;
        }

        const div = divRef.current;
        if (!div) {
            setShowPlaceholder(!normalizedValue || normalizedValue.trim().length === 0);
            return;
        }

        const currentText = normalizePromptInput(getPlainText(div));
        const isFocused = document.activeElement === div;
        const hasRenderableTokens = /(asset:\/\/[^\s]+|@(?:image|video)\s+\d+)/i.test(normalizedValue);
        const domLooksEmpty = currentText.length === 0;
        const normalizedCurrent = currentText.replace(/\s+/g, ' ').trim();
        const comparableValue = normalizedValue.replace(/\s+/g, ' ').trim();

        if (normalizedCurrent !== comparableValue && (!isFocused || hasRenderableTokens || domLooksEmpty)) {
            syncDomToValue(normalizedValue, isFocused);
            return;
        }

        setShowPlaceholder(!normalizedValue || normalizedValue.trim().length === 0);
    }, [value, syncDomToValue]);


    const updatePlaceholderVisibility = useCallback(() => {
        if (divRef.current) {
            const text = getPlainText(divRef.current).trim();
            setShowPlaceholder(text.length === 0);
        }
    }, []);

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        if (isComposingRef.current) return;
        const newText = getPlainText(e.currentTarget);
        setDraftValue(newText);
        onChange(newText);
        updatePlaceholderVisibility();
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        insertAtCursor(text, false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        e.stopPropagation();
        
        // iOS cursor fix when deleting chips.
        if (e.key === 'Backspace' || e.key === 'Delete') {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                const container = range.startContainer;
                
                // Check whether cursor is next to a chip spacer.
                if (container.nodeType === Node.TEXT_NODE && container.textContent === '\u200B') {
                    const prev = container.previousSibling as HTMLElement;
                    if (prev && prev.classList?.contains('chip')) {
                        e.preventDefault();
                        prev.parentNode?.removeChild(prev);
                        container.parentNode?.removeChild(container);
                        const newText = getPlainText(divRef.current!);
                        setDraftValue(newText);
                        onChange(newText);
                        updatePlaceholderVisibility();
                        
                        // Restore cursor position on the next tick.
                        setTimeout(() => {
                            if (divRef.current) {
                                const newRange = document.createRange();
                                newRange.selectNodeContents(divRef.current);
                                newRange.collapse(false);
                                sel.removeAllRanges();
                                sel.addRange(newRange);
                            }
                        }, 0);
                        return;
                    }
                }
            }
            // Delay placeholder refresh after deletion.
            setTimeout(updatePlaceholderVisibility, 0);
        }
    };

    const handleCompositionStart = () => {
        isComposingRef.current = true;
    };

    const handleCompositionEnd = (e: React.CompositionEvent<HTMLDivElement>) => {
        isComposingRef.current = false;
        const newText = getPlainText(e.currentTarget);
        setDraftValue(newText);
        onChange(newText);
    };

    // iOS-specific: avoid blur bounce after keyboard opens.
    const handleFocus = () => {
        isFocusingRef.current = true;
        setTimeout(() => {
            isFocusingRef.current = false;
        }, 300);
    };

    const handleBlur = () => {
        // Prevent blur while focus handoff is in progress.
        if (isFocusingRef.current) {
            divRef.current?.focus();
            return;
        }
        setHoverPreview(null);
        const normalizedValue = normalizePromptInput(divRef.current ? getPlainText(divRef.current) : draftValueRef.current);
        setDraftValue(normalizedValue);
        draftValueRef.current = normalizedValue;
        syncDomToValue(normalizedValue, false);
        onBlur?.(normalizedValue);
    };

    const updateHoverPreview = useCallback((target: EventTarget | null, clientX: number, clientY: number) => {
        const element = target instanceof HTMLElement ? target.closest('.chip[data-asset-id]') as HTMLElement | null : null;
        if (!element) {
            setHoverPreview(null);
            return;
        }

        const previewUrl = String(element.dataset.previewUrl || '').trim();
        if (!previewUrl) {
            setHoverPreview(null);
            return;
        }

        const offset = 18;
        const maxBox = 272;
        const nextX = clientX + offset + maxBox > window.innerWidth
            ? Math.max(8, clientX - maxBox)
            : clientX + offset;
        const nextY = clientY + offset + maxBox > window.innerHeight
            ? Math.max(8, clientY - maxBox)
            : clientY + offset;

        setHoverPreview((prev) => (
            prev && prev.url === previewUrl && prev.x === nextX && prev.y === nextY
                ? prev
                : { url: previewUrl, x: nextX, y: nextY }
        ));
    }, []);

    useEffect(() => {
        const div = divRef.current;
        if (!div) return;

        const handleMouseMove = (event: MouseEvent) => {
            updateHoverPreview(event.target, event.clientX, event.clientY);
        };

        const handleMouseLeave = () => {
            setHoverPreview(null);
        };

        div.addEventListener('mousemove', handleMouseMove);
        div.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            div.removeEventListener('mousemove', handleMouseMove);
            div.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [updateHoverPreview]);

    const containerBg = isDark ? 'bg-zinc-900/50' : 'bg-gray-50';
    const borderColor = isDark ? 'border-zinc-700 focus:border-zinc-600' : 'border-gray-200 focus:border-gray-300';
    const textColor = isDark ? 'text-zinc-200' : 'text-gray-900';

    return (
        <div 
            className={`relative w-full min-h-[80px] group/input border rounded-xl overflow-hidden flex flex-col ${containerBg} ${borderColor}`}
            onWheel={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
                e.stopPropagation();
            }}
            data-interactive="true"
        >
            <div 
                ref={divRef}
                className={`w-full flex-1 p-3 text-xs font-sans leading-7 outline-none overflow-y-auto max-h-[120px] ${textColor} relative z-10 ${isDark ? 'node-scroll-dark' : 'node-scroll'} editable-input ${isDark ? 'editable-input-dark' : 'editable-input-light'}`}
                contentEditable
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onTouchEnd={(e) => {
                    e.stopPropagation();
                    // iOS: delay focus to avoid keyboard collapsing.
                    setTimeout(() => {
                        if (divRef.current && document.activeElement !== divRef.current) {
                            divRef.current.focus();
                        }
                    }, 10);
                }}
                suppressContentEditableWarning
                spellCheck={false}
                style={{ whiteSpace: 'pre-wrap', minHeight: '80px', cursor: 'text', WebkitUserSelect: 'text', userSelect: 'text' }}
            />
            {hoverPreview && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed z-[140] pointer-events-none"
                    style={{ left: hoverPreview.x, top: hoverPreview.y }}
                >
                    <div className={`rounded-xl overflow-hidden border shadow-2xl backdrop-blur-sm ${isDark ? 'bg-zinc-950/95 border-zinc-700' : 'bg-white/95 border-gray-200'}`}>
                        <img
                            src={hoverPreview.url}
                            alt="Asset preview"
                            className="block max-w-64 max-h-64 w-auto h-auto object-contain"
                            draggable={false}
                        />
                    </div>
                </div>,
                document.body
            )}
            {showPlaceholder && (
                <div className={`absolute top-3 left-3 pointer-events-none text-xs font-sans leading-7 ${isDark ? 'text-zinc-500' : 'text-gray-400'} z-0`}>
                    {placeholder}
                </div>
            )}
        </div>
    );
});
ContentEditablePromptInput.displayName = 'ContentEditablePromptInput';

export const TextToVideoNode: React.FC<TextToVideoNodeProps> = ({
    data, updateData, onGenerate, selected, showControls, inputs = [], onMaximize, onDownload, onUploadToAssetLibrary, onDelete, onToolbarAction, isDark = true, isSelecting
}) => {
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [deferredInputs, setDeferredInputs] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isConfigured, setIsConfigured] = useState(true);
    const [videoModels, setVideoModels] = useState<string[]>([]);
    const [assetMentionQuery, setAssetMentionQuery] = useState<string | null>(null);
    const [sdAssetLibrary, setSdAssetLibrary] = useState<Sd2AssetItem[]>([]);
    const [sdAssetSuggestions, setSdAssetSuggestions] = useState<Sd2AssetItem[]>([]);
    const [promptDraft, setPromptDraft] = useState(() => normalizePromptInput(data.prompt || ''));
    
    const inputRef = useRef<PromptInputHandle>(null);
    const promptDraftRef = useRef(promptDraft);
    const assetMentionCursorRef = useRef<number | null>(null);
    const isSelectedAndStable = selected && !isSelecting;
    const isSd2Model = SD2_MODEL_SET.has(data.model || 'Sora 2');

    const checkConfig = useCallback(() => {
         const mName = data.model || 'Sora 2';
         const cfg = getModelConfig(mName);
         setIsConfigured(!!cfg.key);
    }, [data.model]);

    const updateModels = useCallback(() => {
        const models = Object.keys(MODEL_REGISTRY).filter(k => MODEL_REGISTRY[k].category === 'VIDEO');
        setVideoModels(models);
    }, []);

    useEffect(() => { 
        checkConfig(); 
        updateModels();
        window.addEventListener('modelConfigUpdated', checkConfig); 
        window.addEventListener('modelRegistryUpdated', updateModels);
        return () => {
            window.removeEventListener('modelConfigUpdated', checkConfig);
            window.removeEventListener('modelRegistryUpdated', updateModels);
        };
    }, [checkConfig, updateModels]);

    // Group models for split-pane/flyout dropdown
    const groupedVideoModels = useMemo(() => {
        const groups: Record<string, string[]> = {
            'Kling': [],
            'Hailuo': [],
            'Veo': [],
            'Wan': [],
            'Vidu': [],
            'SD 2.0': []
        };
        const ungrouped: string[] = [];
        
        videoModels.forEach(m => {
            const lower = m.toLowerCase();
            if (m.startsWith('Kling') || m.includes('可灵')) {
                 groups['Kling'].push(m);
            } else if (m.startsWith('海螺') || lower.includes('hailuo')) {
                 groups['Hailuo'].push(m);
            } else if (m.startsWith('Veo')) {
                 groups['Veo'].push(m);
            } else if (m.startsWith('Wan') || lower.includes('wan')) {
                 groups['Wan'].push(m);
            } else if (m.startsWith('Vidu')) {
                 groups['Vidu'].push(m);
            } else if (m.startsWith('SD 2.0')) {
                 groups['SD 2.0'].push(m);
            } else {
                 ungrouped.push(m);
            }
        });
        
        const result = Object.entries(groups)
            .filter(([_, items]) => items.length > 0)
            .map(([label, items]) => ({ label, items }));
            
        return [...result, ...ungrouped];
    }, [videoModels]);

    useEffect(() => { if (isSelectedAndStable && showControls) { const t = setTimeout(() => setDeferredInputs(true), 100); return () => clearTimeout(t); } else setDeferredInputs(false); }, [isSelectedAndStable, showControls]);
    useEffect(() => { let interval: any; if (data.isLoading) { setProgress(0); interval = setInterval(() => { setProgress(prev => (prev >= 95 ? 95 : prev + Math.max(0.5, (95 - prev) / 20))); }, 200); } else setProgress(0); return () => clearInterval(interval); }, [data.isLoading]);
    useEffect(() => {
        if (!isSd2Model) {
            setAssetMentionQuery(null);
            setSdAssetLibrary([]);
            setSdAssetSuggestions([]);
            return;
        }
        setSdAssetLibrary(loadSd2AssetLibrary());
    }, [isSd2Model]);

    useEffect(() => {
        if (!isSd2Model) return;

        const handleAssetLibraryUpdated = () => {
            const nextLibrary = loadSd2AssetLibrary();
            setSdAssetLibrary(nextLibrary);
        };

        window.addEventListener('sd2AssetLibraryUpdated', handleAssetLibraryUpdated);
        return () => {
            window.removeEventListener('sd2AssetLibraryUpdated', handleAssetLibraryUpdated);
        };
    }, [isSd2Model]);

    const commitPromptToNode = useCallback((nextPrompt?: string) => {
        const normalizedValue = normalizePromptInput(nextPrompt ?? promptDraftRef.current);
        promptDraftRef.current = normalizedValue;
        setPromptDraft(prev => (prev === normalizedValue ? prev : normalizedValue));
        updateData(data.id, { prompt: normalizedValue });
        return normalizedValue;
    }, [data.id, updateData]);

    useEffect(() => {
        promptDraftRef.current = promptDraft;
    }, [promptDraft]);

    const updateSdAssetMentionState = useCallback((normalizedValue: string) => {
        if (!isSd2Model) {
            setAssetMentionQuery(null);
            setSdAssetSuggestions([]);
            return;
        }

        const mention = extractAssetMentionAtCursor(normalizedValue, assetMentionCursorRef.current);
        if (!mention) {
            setAssetMentionQuery(null);
            setSdAssetSuggestions([]);
            return;
        }

        const query = mention.query.trim().toLowerCase();
        const library = sdAssetLibrary.length > 0 ? sdAssetLibrary : loadSd2AssetLibrary();
        if (sdAssetLibrary.length === 0 && library.length > 0) {
            setSdAssetLibrary(library);
        }
        const filtered = query
            ? library.filter((item) => {
                const searchPool = [
                    item.assetId,
                    item.localFileName,
                    item.sourceUrl,
                    item.previewUrl,
                    item.assetType,
                    item.status
                ]
                    .map((value) => String(value || '').toLowerCase())
                    .filter(Boolean);
                return searchPool.some((value) => value.includes(query));
            })
            : library;

        setAssetMentionQuery(mention.query);
        setSdAssetSuggestions(filtered);
    }, [isSd2Model, sdAssetLibrary]);

    useEffect(() => {
        const normalizedExternalPrompt = normalizePromptInput(data.prompt || '');
        if (normalizedExternalPrompt === promptDraftRef.current) {
            return;
        }

        setPromptDraft(normalizedExternalPrompt);
        promptDraftRef.current = normalizedExternalPrompt;
        updateSdAssetMentionState(normalizedExternalPrompt);
    }, [data.prompt, updateSdAssetMentionState]);

    useEffect(() => {
        if (!isSd2Model || assetMentionQuery === null) return;
        updateSdAssetMentionState(promptDraftRef.current);
    }, [assetMentionQuery, isSd2Model, sdAssetLibrary, updateSdAssetMentionState]);

    const handlePromptChange = useCallback((value: string) => {
        const normalizedValue = normalizePromptInput(value);
        setPromptDraft(normalizedValue);
        promptDraftRef.current = normalizedValue;
        assetMentionCursorRef.current = inputRef.current?.getCursorIndex() ?? normalizedValue.length;
        updateSdAssetMentionState(normalizedValue);
    }, [updateSdAssetMentionState]);

    const handleAssetSuggestionSelect = useCallback((assetId: string) => {
        const nextPrompt = normalizePromptInput(replaceAssetMentionWithAssetUri(promptDraftRef.current, assetId, assetMentionCursorRef.current));
        setPromptDraft(nextPrompt);
        promptDraftRef.current = nextPrompt;
        assetMentionCursorRef.current = nextPrompt.length;
        commitPromptToNode(nextPrompt);
        setAssetMentionQuery(null);
        setSdAssetSuggestions([]);
    }, [commitPromptToNode]);

    const triggerGenerate = useCallback(() => {
        if (data.isLoading || !isConfigured) return;
        commitPromptToNode();
        window.setTimeout(() => onGenerate(data.id), 0);
    }, [commitPromptToNode, data.id, data.isLoading, isConfigured, onGenerate]);

    const handleRatioChange = (ratio: string) => {
        if (!ratio.includes(':')) {
            updateData(data.id, { aspectRatio: ratio });
            return;
        }

        const currentShort = Math.min(data.width, data.height);
        const baseSize = Math.max(currentShort, 400); // Preserve current scale, min 400px

        const [wStr, hStr] = ratio.split(':');
        const wR = parseFloat(wStr);
        const hR = parseFloat(hStr);
        if (!Number.isFinite(wR) || !Number.isFinite(hR) || hR <= 0) {
            updateData(data.id, { aspectRatio: ratio });
            return;
        }
        const r = wR / hR;

        let newW, newH;
        if (r >= 1) {
            newH = baseSize;
            newW = baseSize * r;
        } else {
            newW = baseSize;
            newH = baseSize / r;
        }
        updateData(data.id, { aspectRatio: ratio, width: Math.round(newW), height: Math.round(newH) });
    };
    
    const insertImageToken = (index: number) => {
        const input = inputs[index];
        if (!input) return;
        
        // Calculate separate counts for images and videos
        let imageCount = 0;
        let videoCount = 0;
        for (let i = 0; i <= index; i++) {
            if (inputs[i].isVideo) videoCount++;
            else imageCount++;
        }
        
        const token = input.isVideo ? `@video ${videoCount}` : `@image ${imageCount}`;
        
        if (inputRef.current) {
            inputRef.current.insertText(token);
        } else {
            const nextPrompt = normalizePromptInput(`${promptDraftRef.current}${token}`);
            setPromptDraft(nextPrompt);
            promptDraftRef.current = nextPrompt;
            assetMentionCursorRef.current = nextPrompt.length;
            updateSdAssetMentionState(nextPrompt);
            commitPromptToNode(nextPrompt);
        }
    };

    const isStartEndDisabled = inputs.length > 2;
    useEffect(() => { if (data.activeToolbarItem === 'start_end' && isStartEndDisabled) updateData(data.id, { activeToolbarItem: undefined }); }, [data.id, data.activeToolbarItem, isStartEndDisabled, updateData]);
    useEffect(() => {
        if (!isSelectedAndStable || !showControls) {
            commitPromptToNode();
        }
    }, [commitPromptToNode, isSelectedAndStable, showControls]);

    const currentModel = data.model || 'Sora 2';
    const handler = VIDEO_HANDLERS[currentModel] || VIDEO_HANDLERS['Sora 2'];
    const rules = handler.rules;

    const resOptions = rules.resolutions || ['720p'];
    const durOptions = rules.durations || ['5s'];
    const ratioOptions = rules.ratios || ['16:9'];
    const canOptimize = !!rules.hasPromptExtend;

    // Constraints & Auto-Correction
    const constraints = getVideoConstraints(currentModel, data.resolution, data.duration, inputs.length);
    const displayResValue = (data.model?.includes('海螺') && (data.resolution === '720p' || data.resolution === '768p')) ? '768p' : data.resolution;

    useEffect(() => {
        let updates: Partial<NodeData> = {};
        const corrections = getAutoCorrectedVideoSettings(currentModel, data.resolution, data.duration, inputs.length);
        if (corrections.resolution) updates.resolution = corrections.resolution;
        if (corrections.duration) updates.duration = corrections.duration;

        // Basic validation
        if (data.resolution && !resOptions.includes(data.resolution)) updates.resolution = resOptions[0];
        if (data.duration && !durOptions.includes(data.duration)) updates.duration = durOptions[0];
        if (data.aspectRatio && !ratioOptions.includes(data.aspectRatio)) updates.aspectRatio = ratioOptions[0];

        if (Object.keys(updates).length > 0) updateData(data.id, updates);
    }, [data.model, data.resolution, data.duration, data.aspectRatio, resOptions, durOptions, ratioOptions, currentModel, inputs.length, updateData, data.id]);

    const containerBg = isDark ? 'bg-[#18181B]' : 'bg-white';
    const containerBorder = selected ? 'border-cyan-500 shadow-[0_0_0_1px_rgba(6,182,212,1)]' : (isDark ? 'border-zinc-800' : 'border-gray-200');
    const overlayToolbarBg = isDark ? 'bg-black/50 border-white/5 text-gray-400' : 'bg-white/50 border-black/5 text-gray-600';
    const controlPanelBg = isDark ? 'bg-[#18181B] border-zinc-700/80' : 'bg-white border-gray-200';
    const dividerColor = isDark ? 'bg-zinc-800' : 'bg-gray-200';
    const emptyStateIconColor = isDark ? 'bg-zinc-900/50 border-zinc-800 text-zinc-600' : 'bg-gray-100 border-gray-200 text-gray-400';
    const emptyStateTextColor = isDark ? 'text-zinc-600' : 'text-gray-400';
    const toolbarBg = isDark ? 'bg-[#1A1D21] border-zinc-700/80' : 'bg-white border-gray-200';
    const activeToolbarItemClass = isDark ? 'bg-zinc-800 text-cyan-400 border-zinc-600' : 'bg-cyan-50 text-cyan-600 border-cyan-100';
    const inactiveToolbarItemClass = isDark ? 'text-zinc-400 hover:text-gray-200 hover:bg-zinc-800/50' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50';
    const hasResult = !!data.videoSrc && !data.isLoading;
    const canUploadToAssetLibrary = !!data.videoSrc;
    const isUploadingAsset = !!data.isUploadingAsset;
    const shouldShowSdAssetSuggestions = isSd2Model && assetMentionQuery !== null;
    
    // Check active special modes
    const isStartEndActive = data.activeToolbarItem === 'start_end';
    const isAllReferenceActive = data.activeToolbarItem === 'all_reference';

    return (
      <>
        {isSelectedAndStable && showControls && (
            <div className="absolute bottom-full left-0 w-full mb-12 flex items-center px-1 pointer-events-auto animate-in slide-in-from-bottom-2 fade-in duration-200" data-interactive="true">
               <div className={`flex items-center gap-1 border rounded-lg p-1 shadow-xl backdrop-blur-md ${toolbarBg}`}>
                   {videoToolbarItems.map(item => {
                       const isDisabled = item.id === 'start_end' && isStartEndDisabled;
                       const itemBaseClass = `flex items-center gap-1.5 px-2 py-1 rounded-md transition-all border border-transparent`;
                       let itemStateClass = isDisabled ? (isDark ? 'text-zinc-600 cursor-not-allowed opacity-50' : 'text-gray-300 cursor-not-allowed opacity-50') : (data.activeToolbarItem === item.id ? activeToolbarItemClass + ' shadow-sm cursor-pointer' : inactiveToolbarItemClass + ' cursor-pointer');
                       return (
                           <div key={item.id} className={`${itemBaseClass} ${itemStateClass}`} onClick={(e) => { e.stopPropagation(); if (!isDisabled) onToolbarAction?.(data.id, item.id); }} onTouchEnd={(e) => { if (!isDisabled) { e.preventDefault(); e.stopPropagation(); onToolbarAction?.(data.id, item.id); } }} data-interactive="true">
                               <item.icon size={11} /><span className="text-[10px] font-bold">{item.label}</span>
                           </div>
                       );
                   })}
               </div>
            </div>
        )}
        <div className="absolute bottom-full left-0 w-full mb-2 flex items-center justify-between pointer-events-auto" onMouseDown={(e) => e.stopPropagation()} data-interactive="true">
           <div className="flex items-center gap-2 pl-1"><LocalEditableTitle title={data.title} onUpdate={(t) => updateData(data.id, { title: t })} isDark={isDark} /></div>
           <div className={`flex gap-1 backdrop-blur-md rounded-lg p-1 border ${overlayToolbarBg}`} onMouseDown={(e) => e.stopPropagation()} data-interactive="true">
               <button title="Maximize" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); onMaximize?.(data.id); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onMaximize?.(data.id); }} data-interactive="true"><Icons.Maximize2 size={12} /></button>
               <button title="Download" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); onDownload?.(data.id); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onDownload?.(data.id); }} data-interactive="true"><Icons.Download size={12} /></button>
               <button title={isUploadingAsset ? "Uploading..." : "Upload Asset"} className={`p-1 rounded transition-colors ${(isUploadingAsset || !canUploadToAssetLibrary) ? (isDark ? 'text-zinc-600 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed') : (isDark ? 'hover:bg-zinc-800 hover:text-cyan-300 text-zinc-300' : 'hover:bg-gray-200 hover:text-cyan-600 text-gray-500')}`} onClick={(e) => { e.stopPropagation(); if (!isUploadingAsset && canUploadToAssetLibrary) onUploadToAssetLibrary?.(data.id); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); if (!isUploadingAsset && canUploadToAssetLibrary) onUploadToAssetLibrary?.(data.id); }} disabled={isUploadingAsset || !canUploadToAssetLibrary} data-interactive="true">{isUploadingAsset ? <Icons.Loader2 size={12} className="animate-spin" /> : <Icons.Album size={12} />}</button>
               <button title="Delete" className={`p-1 rounded transition-colors text-red-400 xl:hidden ${isDark ? 'hover:bg-zinc-800' : 'hover:bg-gray-200'}`} onClick={(e) => { e.stopPropagation(); onDelete?.(data.id); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onDelete?.(data.id); }} data-interactive="true"><Icons.Trash2 size={12} /></button>
           </div>
        </div>
        
        <div className={`w-full h-full relative rounded-xl border ${containerBorder} ${containerBg} ${data.isStackOpen ? 'overflow-visible' : 'overflow-hidden'} shadow-lg group`}>
            {hasResult ? (
                 <LocalMediaStack data={data} updateData={updateData} currentSrc={data.videoSrc} onMaximize={onMaximize} isDark={isDark} selected={selected} />
            ) : (
                <div className={`w-full h-full flex flex-col items-center justify-center ${emptyStateTextColor}`}>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 border ${emptyStateIconColor}`}><Icons.Film size={20} className="opacity-50"/></div>
                    <span className="text-[10px] uppercase tracking-wider font-bold opacity-40">TEXT TO VIDEO</span>
                </div>
            )}
            {data.isLoading && <LoadingOverlay />}
        </div>

        {isSelectedAndStable && showControls && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-full min-w-[480px] max-w-[calc(100vw-20px)] pt-3 z-[70] pointer-events-auto" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} data-interactive="true">
               {inputs.length > 0 && <LocalInputThumbnails inputs={inputs} ready={deferredInputs} isDark={isDark} />}
              <div className={`${controlPanelBg} rounded-2xl p-3 shadow-2xl flex flex-col gap-2 border`}>
                  
                  {/* Start/End Mode Hint */}
                  {isStartEndActive && (
                      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-500 text-[10px] font-bold">
                          <span className="px-1.5 py-0.5 rounded bg-orange-500 text-white text-[9px]">Start/End</span>
                          <span>Ensure two images are input (Start + End frames)</span>
                      </div>
                  )}
                  {isAllReferenceActive && (
                      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 text-[10px] font-bold">
                          <span className="px-1.5 py-0.5 rounded bg-cyan-500 text-white text-[9px]">All Ref</span>
                          <span>Use connected images as subjects and reference them with @name in prompt</span>
                      </div>
                  )}

                  <div className="flex flex-col" data-interactive="true">
                      <ContentEditablePromptInput 
                          ref={inputRef}
                          value={promptDraft}
                          onChange={handlePromptChange}
                          onBlur={(value) => commitPromptToNode(value)}
                          isDark={isDark}
                          placeholder="Describe the video scene..."
                          assetLibrary={sdAssetLibrary}
                      />
                      {shouldShowSdAssetSuggestions && (
                          <div
                              className={`mt-2 rounded-lg border overflow-hidden ${isDark ? 'bg-zinc-900/90 border-zinc-700' : 'bg-white border-gray-200'}`}
                              onMouseDown={(e) => e.stopPropagation()}
                              onTouchStart={(e) => e.stopPropagation()}
                              data-interactive="true"
                          >
                              <div className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${isDark ? 'text-zinc-400 border-b border-zinc-800' : 'text-gray-500 border-b border-gray-100'}`}>
                                  SD 2.0 Assets
                              </div>
                              {sdAssetSuggestions.length > 0 ? (
                                  <div
                                      className="max-h-44 overflow-y-auto p-2"
                                      onWheel={(e) => {
                                          e.stopPropagation();
                                          const el = e.currentTarget;
                                          const canScroll = el.scrollHeight > el.clientHeight;
                                          if (canScroll) e.preventDefault();
                                      }}
                                  >
                                      <div className="grid grid-cols-4 gap-2">
                                          {sdAssetSuggestions.map((asset) => (
                                            <button
                                                key={asset.assetId}
                                                type="button"
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                }}
                                                onClick={() => handleAssetSuggestionSelect(asset.assetId)}
                                                onTouchStart={(e) => {
                                                    e.stopPropagation();
                                                }}
                                                onTouchEnd={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleAssetSuggestionSelect(asset.assetId);
                                                }}
                                                className={`relative aspect-square rounded-lg overflow-hidden border transition-all group ${isDark ? 'bg-zinc-800 border-zinc-700 hover:border-cyan-500/60 hover:shadow-[0_0_0_1px_rgba(6,182,212,0.35)]' : 'bg-gray-100 border-gray-200 hover:border-cyan-300 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.35)]'}`}
                                                data-interactive="true"
                                                title={asset.assetId}
                                              >
                                                  {getSdAssetPreviewUrl(asset) ? (
                                                      <img
                                                          src={getSdAssetPreviewUrl(asset)}
                                                          alt="asset preview"
                                                          className="w-full h-full object-cover"
                                                          loading="lazy"
                                                      />
                                                  ) : (
                                                      <div className={`w-full h-full flex items-center justify-center ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                                                          <Icons.Image size={16} />
                                                      </div>
                                                  )}
                                                  <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                              </button>
                                          ))}
                                      </div>
                                  </div>
                              ) : (
                                  <div className={`px-2 py-2 text-[10px] ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                      No matching assets
                                  </div>
                              )}
                          </div>
                      )}
                      
                      {/* Image/Video Token Insertion Buttons - Moved Below Input to Separate Line */}
                      {inputs.length > 0 && (
                          <div className="flex justify-end gap-1.5 mt-2" data-interactive="true" onTouchStart={(e) => e.stopPropagation()}>
                              {(() => {
                                  let imageCount = 0;
                                  let videoCount = 0;
                                  return inputs.map((input, i) => {
                                      let tokenText: string;
                                      if (input.isVideo) {
                                          videoCount++;
                                          tokenText = `@video ${videoCount}`;
                                      } else {
                                          imageCount++;
                                          tokenText = `@image ${imageCount}`;
                                      }
                                      return (
                                          <button 
                                              key={i}
                                              onClick={() => insertImageToken(i)}
                                              onTouchStart={(e) => e.stopPropagation()}
                                              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); insertImageToken(i); }}
                                              className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all shadow-sm ${
                                                  isDark 
                                                    ? 'bg-zinc-800 hover:bg-zinc-700 text-purple-400 border border-zinc-700 hover:border-zinc-600' 
                                                    : 'bg-gray-100 hover:bg-gray-200 text-purple-600 border border-gray-200 hover:border-gray-300'
                                              }`}
                                              title={input.isVideo ? "Insert video token" : "Insert image token"}
                                              data-interactive="true"
                                          >
                                              <span>{tokenText}</span>
                                              <Icons.ArrowRightLeft size={10} className="rotate-45 opacity-60"/>
                                          </button>
                                      );
                                  });
                              })()}
                          </div>
                      )}
                  </div>

                  <div className="h-px w-full my-1 opacity-50 bg-gradient-to-r from-transparent via-gray-500/20 to-transparent"></div>

                  <div className="flex items-center justify-between gap-2 h-7">
                       <LocalCustomDropdown options={groupedVideoModels} value={data.model || 'Sora 2'} onChange={(val: any) => updateData(data.id, { model: val })} isOpen={activeDropdown === 'model'} onToggle={() => setActiveDropdown(activeDropdown === 'model' ? null : 'model')} onClose={() => setActiveDropdown(null)} align="left" width="w-[130px]" isDark={isDark} />
                       <div className={`w-px h-3 ${dividerColor}`}></div>
                       <div className="flex items-center gap-1" data-interactive="true">
                          <LocalCustomDropdown icon={Icons.Crop} options={ratioOptions} value={data.aspectRatio || '16:9'} onChange={handleRatioChange} isOpen={activeDropdown === 'ratio'} onToggle={() => setActiveDropdown(activeDropdown === 'ratio' ? null : 'ratio')} onClose={() => setActiveDropdown(null)} disabledOptions={constraints.disabledRatios} isDark={isDark} />
                          <LocalCustomDropdown icon={Icons.Monitor} options={resOptions} value={displayResValue || '720p'} onChange={(val: any) => updateData(data.id, { resolution: val })} isOpen={activeDropdown === 'res'} onToggle={() => setActiveDropdown(activeDropdown === 'res' ? null : 'res')} onClose={() => setActiveDropdown(null)} disabledOptions={constraints.disabledRes} isDark={isDark} />
                          <LocalCustomDropdown icon={Icons.Clock} options={durOptions} value={data.duration || '5s'} onChange={(val: any) => updateData(data.id, { duration: val })} isOpen={activeDropdown === 'duration'} onToggle={() => setActiveDropdown(activeDropdown === 'duration' ? null : 'duration')} onClose={() => setActiveDropdown(null)} disabledOptions={constraints.disabledDurations} isDark={isDark} />
                          <LocalCustomDropdown icon={Icons.Layers} options={[1, 2, 3, 4]} value={data.count || 1} onChange={(val: any) => updateData(data.id, { count: val })} isOpen={activeDropdown === 'count'} onToggle={() => setActiveDropdown(activeDropdown === 'count' ? null : 'count')} onClose={() => setActiveDropdown(null)} isDark={isDark} />
                          
                          <button 
                              className={`h-full px-2 rounded flex items-center justify-center transition-colors ${canOptimize ? (data.promptOptimize ? (isDark ? 'text-cyan-400 bg-cyan-500/10' : 'text-cyan-600 bg-cyan-50') : (isDark ? 'text-zinc-500 hover:text-gray-300 hover:bg-white/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100')) : (isDark ? 'text-zinc-700 opacity-50 cursor-not-allowed' : 'text-gray-200 opacity-50 cursor-not-allowed')}`} 
                              onClick={() => canOptimize && updateData(data.id, { promptOptimize: !data.promptOptimize })}
                              onTouchEnd={(e) => { if (canOptimize) { e.preventDefault(); e.stopPropagation(); updateData(data.id, { promptOptimize: !data.promptOptimize }); } }}
                              title={canOptimize ? `Prompt Optimization: ${data.promptOptimize ? 'ON' : 'OFF'}` : 'Prompt Optimization not supported'}
                              disabled={!canOptimize}
                              data-interactive="true"
                          >
                              <Icons.Sparkles size={13} fill={data.promptOptimize && canOptimize ? "currentColor" : "none"} />
                          </button>
                       </div>
                       <button 
                           onClick={(e) => { 
                               // Prevent duplicate trigger from click + touchend on iOS.
                               if ((e as any).nativeEvent?.pointerType === 'touch') return;
                               triggerGenerate();
                           }} 
                           onTouchEnd={(e) => { 
                               e.preventDefault(); 
                               e.stopPropagation(); 
                               triggerGenerate();
                           }} 
                           className={`ml-auto relative h-7 px-4 text-[10px] font-extrabold rounded-full flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-cyan-500/20 overflow-hidden min-w-[90px] ${data.isLoading || !isConfigured ? 'opacity-50 cursor-not-allowed bg-zinc-500 text-white' : 'bg-cyan-500 hover:bg-cyan-400 hover:shadow-cyan-500/40 text-white'}`} 
                           disabled={data.isLoading || !isConfigured} 
                           title={!isConfigured ? 'Configure API Key in Settings' : 'Generate'} 
                           data-interactive="true"
                       >
                          {data.isLoading && <div className="absolute left-0 top-0 h-full bg-cyan-500/30 z-0 transition-all duration-300 ease-linear" style={{ width: `${progress}%` }}><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent w-[200%] animate-[shimmer_2s_infinite]"></div></div>}
                          <div className="relative z-10 flex items-center gap-1.5">{data.isLoading ? <span className="tabular-nums">{Math.floor(progress)}%</span> : <><Icons.Wand2 size={12} /><span>Generate</span></>}</div>
                      </button>
                  </div>
              </div>
          </div>
        )}
      </>
    );
};
