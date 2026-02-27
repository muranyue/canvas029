
import { ModelConfig } from "./types";

export const constructUrl = (baseUrl: string, endpointPath: string) => {
    let base = baseUrl ? baseUrl.replace(/\/$/, '') : '';
    let path = endpointPath.replace(/^\//, '');

    if (base.endsWith('/v1') && path.startsWith('v1/')) {
        path = path.substring(3);
    }
    if (!base) return `/${path}`;
    return `${base}/${path}`;
};

export const fetchThirdParty = async (url: string, method: string, body: any, config: ModelConfig, options: { timeout?: number, retries?: number, isFormData?: boolean } = {}) => {
  const { timeout = 60000, retries = 0, isFormData = false } = options;
  
  if (!config.key) {
      throw new Error("API Key missing. Please configure it in settings.");
  }

  const headers: any = {
    'Authorization': `Bearer ${config.key}`
  };
  
  if (!isFormData && method.toUpperCase() !== 'GET') {
      headers['Content-Type'] = 'application/json';
  }
  
  let lastError: any = new Error("Request failed");

  for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const fetchOptions: any = {
        method,
        headers,
        signal: controller.signal,
        credentials: 'omit',
      };
      
      if (body) {
          fetchOptions.body = isFormData ? body : JSON.stringify(body);
      }

      try {
          const response = await fetch(url, fetchOptions);
          clearTimeout(timeoutId);

          if (!response.ok) {
            const errText = await response.text();
            let errMsg = errText;
            let errType = '';
            let errCode = '';
            try {
                const jsonErr = JSON.parse(errText);
                if (jsonErr.error && jsonErr.error.message) {
                    errMsg = jsonErr.error.message;
                    errType = jsonErr.error.type || jsonErr.error.error_type || '';
                    errCode = jsonErr.error.code || jsonErr.error.error_code || '';
                } else if (jsonErr.message) {
                    errMsg = jsonErr.message;
                } else if (jsonErr.fail_reason) {
                    errMsg = jsonErr.fail_reason;
                }
                if (!errType) errType = jsonErr.type || jsonErr.error_type || '';
                if (!errCode) errCode = jsonErr.code || jsonErr.error_code || '';
            } catch (e) {}
            const details: string[] = [];
            if (errType) details.push(`[${errType}]`);
            if (errCode) details.push(`(${errCode})`);
            details.push(errMsg);
            const error: any = new Error(`API Error ${response.status}: ${details.join(' ')}`);
            if (errType) error.name = String(errType);
            if (errCode) error.code = errCode;
            if (response.status >= 400 && response.status < 500 && response.status !== 429 && response.status !== 408) {
                error.isNonRetryable = true;
            }
            throw error;
          }

          const text = await response.text();
          try {
              if (!text) return {}; 
              return JSON.parse(text);
          } catch (e) {
              throw new Error("Received invalid JSON response from server.");
          }
      } catch (error: any) {
          clearTimeout(timeoutId);
          lastError = error;
          if (error.name === 'AbortError') lastError = new Error(`Request timed out after ${timeout/1000}s`);
          if (attempt === retries || error.isNonRetryable) throw lastError;
          await new Promise(res => setTimeout(res, 1000 * (attempt + 1)));
      }
  }
  throw lastError;
};

export const extractUrlFromContent = (content: string): string => {
    if (!content) return '';
    const mdMatch = content.match(/!\[.*?\]\((.*?)\)/);
    if (mdMatch && mdMatch[1]) return mdMatch[1];
    const dataUrlMatch = content.match(/data:image\/[a-zA-Z]+;base64,[^"'\s)]+/);
    if (dataUrlMatch) return dataUrlMatch[0];
    const httpMatch = content.match(/https?:\/\/[^\s)"]+/);
    if (httpMatch) return httpMatch[0];
    return content.trim();
};
