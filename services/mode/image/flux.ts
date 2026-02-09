
import { ModelConfig, ModelDef } from "../types";
import { fetchThirdParty, constructUrl } from "../network";

export const generateStandardImage = async (
    config: ModelConfig,
    modelDef: ModelDef,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    calculatedSize: string,
    inputImages: string[],
    n: number,
    promptOptimize?: boolean
): Promise<string[]> => {
   const targetUrl = constructUrl(config.baseUrl, config.endpoint);
   const isFlux = modelDef.id.includes('flux'); 
   const isJimeng = modelDef.id.includes('jimeng');
   const isDoubao = modelDef.id.includes('doubao');
   const isZimage = modelDef.id.includes('z-image');

   if ((isFlux || isZimage) && n > 1) {
      const promises = Array(n).fill(null).map(async () => {
         const payload: any = {
            model: config.modelId, 
            prompt, 
            size: calculatedSize, 
            n: 1 
         };
         if (isFlux) {
             if (resolution !== '1k') payload.quality = 'hd';
         } else if (isZimage) {
             payload.response_format = "b64_json";
             payload.watermark = false;
             // Use promptOptimize if provided, default to false (or true if desired, assuming false for manual control)
             // Existing legacy code forced it to true. Now we use the toggle.
             // If undefined, we can default to true for backward compatibility or false. Let's strictly follow toggle.
             payload.prompt_extend = !!promptOptimize;
             if (inputImages.length > 0) payload.image = inputImages[0].split(',')[1];
         }
         const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });
         const data = (res.data && Array.isArray(res.data)) ? res.data : (res.data ? [res.data] : [res]);
         return data.map((item: any) => {
             if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
             if (item.url) return item.url;
             if (item.image_url) return item.image_url;
             return '';
         }).filter((url: string) => !!url)[0]; 
      });
      const results = await Promise.all(promises);
      return results.filter(r => !!r);
   }

   const payload: any = {
      model: config.modelId, prompt, n: n, response_format: "b64_json" 
   };

   if (isFlux) {
       payload.size = calculatedSize;
       if (resolution !== '1k') payload.quality = 'hd';
       delete payload.response_format; 
   } else if (isJimeng) {
       payload.size = calculatedSize;
       payload.response_format = "url";
   } else {
       payload.size = calculatedSize;
   }

   if (isDoubao) {
       payload.watermark = false;
       if (resolution === '2k' || resolution === '4k') payload.response_format = 'url';
   }
   if (isZimage) {
       payload.watermark = false;
       payload.prompt_extend = !!promptOptimize;
       if (inputImages.length > 0) payload.image = inputImages[0].split(',')[1];
   }

   const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });
   const data = (res.data && Array.isArray(res.data)) ? res.data : (res.data ? [res.data] : [res]);
   
   return data.map((item: any) => {
       if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
       if (item.url) return item.url;
       if (item.image_url) return item.image_url;
       return '';
   }).filter((url: string) => !!url);
};

export const generateMjModal = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string
): Promise<string> => {
   const targetUrl = constructUrl(config.baseUrl, config.endpoint);
   const payload = { prompt: `${prompt} --ar ${aspectRatio}`, botType: "MID_JOURNEY" };
   const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });
   return res.imageUrl || res.url;
};
