import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    /**
     * 页面级渲染用例在 CI 冷启动下常接近 5s，放宽超时避免门禁误报。
     * 本机/CI 多文件并行时 antd + jsdom 用例互相抢 CPU，20s 会偶发超时红测：
     * 超时是上限而非耗时，健康用例不受影响，只消除"慢=失败"的假红。
     */
    testTimeout: 60000,
    hookTimeout: 30000,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'dist/', 'src/test/'],
    },
  },
})
