import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import os from 'os'

/**
 * 并行 fork 预算：antd + jsdom 单个 fork 常驻数百 MB，
 * 低配机器（如 8GB 笔记本）按 CPU 核数全开会把内存打满、
 * 触发 swap 抖动 → 用例集体变慢并出现"慢=超时"的假红。
 * 取 min(CPU-1, 内存GB/2)，并允许 VITEST_MAX_FORKS 覆盖（CI 可显式调高）。
 */
const cpus = os.cpus().length
const memGB = os.totalmem() / 1024 ** 3
const maxForks = Number(process.env.VITEST_MAX_FORKS) || Math.max(1, Math.min(cpus - 1, Math.floor(memGB / 2)))

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
    pool: 'forks',
    poolOptions: {
      forks: { maxForks, minForks: 1 },
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'dist/', 'src/test/'],
    },
  },
})
