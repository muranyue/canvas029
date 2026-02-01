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
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
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
        // 使用 terser 进行压缩，并配置 iOS 兼容选项
        minify: 'terser',
        terserOptions: {
          // 保留关键函数名，防止 contentEditable 相关逻辑被破坏
          mangle: {
            reserved: [
              'ContentEditablePromptInput',
              'getPlainText',
              'insertAtCursor',
              'saveCursorPosition',
              'restoreCursorPosition',
              'handleInput',
              'handleCompositionStart',
              'handleCompositionEnd',
              'handleBlur',
              'handleFocus',
              'handlePaste',
              'handleKeyDown',
              'createChipHtml',
              'parseTextToHtml',
            ],
          },
          compress: {
            // 禁用可能影响 DOM 操作的优化
            drop_console: false, // 保留 console 便于调试
            drop_debugger: false,
            // 禁用可能改变执行顺序的优化
            sequences: false,
            // 保留函数名
            keep_fnames: true,
            // 保留类名
            keep_classnames: true,
          },
          format: {
            // 保留注释中的重要信息
            comments: false,
          },
        },
      },
    };
});
