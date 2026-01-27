
import { VideoModelRules, VideoConstraints } from "../types";

export const videoModels = ['Sora 2', 'Veo 3.1 Fast', 'Veo 3.1 Pro', 'Hailuo 2.0', 'Hailuo 2.3', 'Kling O1 Std', 'Kling O1 Pro', 'Jmeng 3.5', 'Kling 2.6 ProNS', 'Kling 2.6 ProYS', 'Kling 2.5 Std', 'Kling 2.5 Pro', 'Wan2.6', 'Wan2.5', 'Doubao Video', 'Grok video 3', 'Vidu Q2 Pro', 'Vidu Q2 Turbo'];
export const videoDurations = ['3s', '4s', '5s', '6s', '7s', '8s', '10s', '15s', '25s'];

export const getVideoConstraints = (modelName: string, resolution: string | undefined, duration: string | undefined, inputCount: number): VideoConstraints => {
    const isDoubaoVideo = modelName === 'Doubao Video';
    const isHailuo = modelName === 'Hailuo 2.0' || modelName === 'Hailuo 2.3';
    const isVeo = modelName === 'Veo 3.1 Fast' || modelName === 'Veo 3.1 Pro';
    const isSeedance = modelName === 'Jmeng 3.5';
    const isKlingO1 = modelName === 'Kling O1 Std' || modelName === 'Kling O1 Pro';
    const isKlingStd = modelName.includes('Kling 2.');
    const isGrok = modelName === 'Grok Video' || modelName === 'Grok video 3';
    const isSora = modelName === 'Sora 2';
    const isWan = modelName.includes('Wan');
    const isVidu = modelName.startsWith('Vidu');

    let resOptions = ['480p', '720p', '1080p'];
    let disabledRes: string[] = [];
    let disabledRatios: string[] = [];
    let disabledDurations: string[] = [];

    if (isDoubaoVideo) {
        disabledRes = ['480p', ...(inputCount > 0 ? ['1080p'] : [])];
        disabledRatios = ['3:4', '4:3'];
        disabledDurations = videoDurations.filter(d => !['4s', '6s', '8s'].includes(d));
    } else if (isHailuo) {
        resOptions = ['768p', '1080p'];
        disabledRes = ['480p', '720p']; 
        disabledRatios = ['3:4', '4:3'];
        const allowed = ['6s', '10s'];
        disabledDurations = videoDurations.filter(d => !allowed.includes(d));
        if (resolution === '1080p' && inputCount > 0) {
             disabledDurations = videoDurations.filter(d => d !== '6s');
        }
    } else if (isVeo) {
        // Veo: disable 480p, disable 1:1/3:4/4:3 (keep only 16:9, 9:16), duration 8s only
        disabledRes = ['480p']; 
        disabledRatios = ['1:1', '3:4', '4:3'];
        disabledDurations = videoDurations.filter(d => d !== '8s');
    } else if (isSeedance) {
        disabledRes = []; 
        const allowed = ['5s', '7s', '10s']; 
        disabledDurations = videoDurations.filter(d => !allowed.includes(d));
    } else if (isKlingO1) {
        // Kling O1: 1080p only. Ratios 16:9, 9:16, 1:1. Duration 5s, 10s.
        resOptions = ['1080p'];
        disabledRes = ['480p', '720p'];
        disabledRatios = ['3:4', '4:3'];
        const allowed = ['5s', '10s'];
        disabledDurations = videoDurations.filter(d => !allowed.includes(d));
    } else if (isKlingStd) {
        // Kling 2.5 / 2.6
        resOptions = ['720p', '1080p'];
        disabledRes = ['480p'];
        disabledRatios = ['1:1', '3:4', '4:3']; // Only 16:9, 9:16
        const allowed = ['5s', '10s'];
        disabledDurations = videoDurations.filter(d => !allowed.includes(d));
    } else if (isGrok) {
        resOptions = ['720p'];
        disabledRes = ['480p', '1080p'];
        disabledRatios = [];
        const allowed = ['6s'];
        disabledDurations = videoDurations.filter(d => !allowed.includes(d));
    } else if (isSora) {
        // Sora 2: 720p (small), 1080p (large). Ratios 16:9, 9:16. Duration 10s, 15s.
        resOptions = ['720p', '1080p'];
        disabledRes = ['480p'];
        disabledRatios = ['1:1', '3:4', '4:3'];
        const allowed = ['10s', '15s'];
        disabledDurations = videoDurations.filter(d => !allowed.includes(d));
    } else if (isWan) {
        // Wan: 720p, 1080p. Duration 5s, 10s.
        resOptions = ['720p', '1080p'];
        disabledRes = ['480p'];
        const allowed = ['5s', '10s'];
        disabledDurations = videoDurations.filter(d => !allowed.includes(d));
    } else if (isVidu) {
        // Vidu: 720p, 1080p. Durations: 3, 4, 5, 6, 8, 10
        resOptions = ['720p', '1080p'];
        disabledRes = ['480p'];
        disabledRatios = ['3:4', '4:3'];
        const allowed = ['3s', '4s', '5s', '6s', '8s', '10s'];
        disabledDurations = videoDurations.filter(d => !allowed.includes(d));
    }

    return { resOptions, disabledRes, disabledRatios, disabledDurations };
};

export const getAutoCorrectedVideoSettings = (modelName: string, resolution: string | undefined, duration: string | undefined, inputCount: number): { resolution?: string, duration?: string, aspectRatio?: string } => {
    const isHailuo = modelName === 'Hailuo 2.0' || modelName === 'Hailuo 2.3';
    const isVeo = modelName === 'Veo 3.1 Fast' || modelName === 'Veo 3.1 Pro';
    const isSeedance = modelName === 'Jmeng 3.5';
    const isKlingO1 = modelName === 'Kling O1 Std' || modelName === 'Kling O1 Pro';
    const isKlingStd = modelName.includes('Kling 2.');
    const isGrok = modelName === 'Grok Video' || modelName === 'Grok video 3';
    const isSora = modelName === 'Sora 2';
    const isWan = modelName.includes('Wan');
    const isVidu = modelName.startsWith('Vidu');
    
    let updates: { resolution?: string, duration?: string, aspectRatio?: string } = {};

    if (isHailuo) {
         if (resolution === '480p' || resolution === '720p') {
             updates.resolution = '768p';
         }
         const currentDur = duration || '5s';
         if (resolution === '1080p' && inputCount > 0) {
             if (currentDur !== '6s') updates.duration = '6s';
         } else {
             if (!['6s', '10s'].includes(currentDur)) updates.duration = '6s';
         }
    } else if (isVeo) {
        if (resolution === '480p') updates.resolution = '720p';
        if (duration !== '8s') updates.duration = '8s';
    } else if (isSeedance) {
        if (!['5s', '7s', '10s'].includes(duration || '')) updates.duration = '5s';
    } else if (isKlingO1) {
        if (resolution !== '1080p') updates.resolution = '1080p';
        if (!['5s', '10s'].includes(duration || '')) updates.duration = '5s';
    } else if (isKlingStd) {
        if (!['5s', '10s'].includes(duration || '')) updates.duration = '5s';
        if (resolution === '480p') updates.resolution = '720p';
    } else if (isGrok) {
        if (resolution !== '720p') updates.resolution = '720p';
        if (duration !== '6s') updates.duration = '6s';
    } else if (isSora) {
        if (!['10s', '15s'].includes(duration || '')) updates.duration = '10s';
        if (resolution === '480p') updates.resolution = '720p';
    } else if (isWan) {
        if (resolution === '480p') updates.resolution = '720p';
        if (!['5s', '10s'].includes(duration || '')) updates.duration = '5s';
    } else if (isVidu) {
        if (resolution === '480p') updates.resolution = '720p';
        if (!['3s', '4s', '5s', '6s', '8s', '10s'].includes(duration || '')) updates.duration = '4s';
    }
    return updates;
};
