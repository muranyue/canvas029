import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        // 开发/生产环境统一配置，避免打包后环境差异
        'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // 生成 sourcemap 便于 iOS 真机调试
        sourcemap: true,
        // 防止 CSS 分割导致移动端加载顺序问题
        cssCodeSplit: false,
        // 使用 terser 进行压缩（避免 esbuild 对 React 组件兼容不好）
        minify: 'terser',
        terserOptions: {
          compress: {
            // 禁止删除核心方法，避免 react-contenteditable 内部逻辑被破坏
            drop_console: false,
            drop_debugger: false,
            // 禁止优化「纯函数」，避免组件内部方法被删除
            pure_funcs: [],
            pure_getters: false,
            // 禁用可能改变执行顺序的优化
            sequences: false,
            // 保留函数名
            keep_fnames: true,
            // 保留类名
            keep_classnames: true,
          },
          mangle: {
            // 保留核心属性/方法，避免被混淆导致失效
            reserved: [
              'contentEditable',
              'innerHTML',
              'textContent',
              'onChange',
              'onBeforeInput',
              'ContentEditablePromptInput',
              'htmlToPlainText',
              'plainTextToHtml',
              'insertAtCursor',
              'handleChange',
              'handleFocus',
              'handlePaste',
              'handleKeyDown',
              'createChipHtml',
              'react-contenteditable',
              'ContentEditable',
            ],
          },
          format: {
            comments: false,
          },
        },
        // 关闭 chunk 分割，确保 react-contenteditable 组件完整打包
        rollupOptions: {
          output: {
            manualChunks: {}
          }
        }
      },
    };
});
