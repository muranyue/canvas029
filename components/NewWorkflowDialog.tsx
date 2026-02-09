import React from 'react';
import { Icons } from './Icons';

interface NewWorkflowDialogProps {
    isDark: boolean;
    onClose: () => void;
    onConfirmNew: (shouldSave: boolean) => void;
}

export const NewWorkflowDialog: React.FC<NewWorkflowDialogProps> = ({ isDark, onClose, onConfirmNew }) => {
    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
            onTouchEnd={(e) => { e.preventDefault(); onClose(); }}
        >
            <div
                className={`w-[400px] max-w-[90vw] p-6 rounded-2xl shadow-2xl border flex flex-col gap-4 transform transition-all scale-100 ${isDark ? 'bg-[#1A1D21] border-zinc-700 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}
                onClick={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
            >
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Icons.FilePlus size={20} className="text-cyan-500" />Create New Workflow
                    </h3>
                    <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Do you want to save your current workflow before creating a new one? <br />Any unsaved changes will be permanently lost.
                    </p>
                </div>
                <div className={`flex flex-wrap justify-end gap-2 mt-2 pt-4 border-t ${isDark ? 'border-zinc-800' : 'border-gray-100'}`}>
                    <button
                        onClick={onClose}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
                        className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${isDark ? 'hover:bg-zinc-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}
                    >Cancel</button>
                    <button
                        onClick={() => onConfirmNew(false)}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onConfirmNew(false); }}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${isDark ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'}`}
                    >Don't Save</button>
                    <button
                        onClick={() => onConfirmNew(true)}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onConfirmNew(true); }}
                        className={`px-4 py-2 rounded-lg text-xs font-bold text-white transition-colors shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 ${isDark ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-cyan-500 hover:bg-cyan-400'}`}
                    ><Icons.Save size={14} />Save & New</button>
                </div>
            </div>
        </div>
    );
};
