type LocalLogPayload = Record<string, unknown>;

const isLocalHost = (): boolean => {
    if (typeof window === 'undefined') return false;
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
};

const safeSerialize = (value: unknown): unknown => {
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack,
            code: (value as any).code,
            status: (value as any).status,
        };
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_err) {
        return String(value);
    }
};

export const reportLocalDevFailure = (payload: LocalLogPayload) => {
    if (!import.meta.env.DEV || !isLocalHost()) return;

    const data = {
        ...payload,
        timestamp: new Date().toISOString(),
    };

    void fetch('/__local_test_log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        keepalive: true,
    }).catch(() => {
        // Ignore local logging transport failures.
    });
};

export const normalizeErrorForLocalLog = (error: unknown) => safeSerialize(error);
