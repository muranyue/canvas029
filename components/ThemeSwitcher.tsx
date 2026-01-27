
import React from 'react';
import { Icons } from './Icons';

interface ThemeSwitcherProps {
    isDark: boolean;
    onToggle: (isDark: boolean) => void;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ isDark, onToggle }) => {
    return (
        <div className="fixed top-6 right-6 z-50 flex items-center bg-black/20 backdrop-blur-md border border-white/10 rounded-full p-1 shadow-lg">
            <button
                onClick={() => onToggle(false)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${!isDark ? 'bg-white text-yellow-500 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                title="Light Mode"
            >
                <Icons.Sun size={16} fill={!isDark ? "currentColor" : "none"} />
            </button>
            <button
                onClick={() => onToggle(true)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isDark ? 'bg-zinc-800 text-cyan-400 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                title="Dark Mode"
            >
                <Icons.Moon size={16} fill={isDark ? "currentColor" : "none"} />
            </button>
        </div>
    );
};
