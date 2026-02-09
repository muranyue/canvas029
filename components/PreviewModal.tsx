import React from 'react';
import { Icons } from './Icons';

interface PreviewModalProps {
    previewMedia: { url: string; type: 'image' | 'video' };
    onClose: () => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({ previewMedia, onClose }) => {
    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={onClose}
            onTouchEnd={(e) => { e.preventDefault(); onClose(); }}
        >
            <button
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                onClick={onClose}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
            >
                <Icons.X size={24} />
            </button>
            {previewMedia.type === 'image' ? (
                <img src={previewMedia.url} alt="Preview" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
            ) : (
                <video src={previewMedia.url} controls autoPlay className="max-w-[90vw] max-h-[90vh] rounded-lg" onClick={(e) => e.stopPropagation()} />
            )}
        </div>
    );
};
