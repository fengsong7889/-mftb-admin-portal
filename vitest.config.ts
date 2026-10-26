import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import os from 'os'
import { buildMetaPlugin } from './vite-build-meta'

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
  // buildMetaPlugin 必须同时在测试侧注册：`virtual:build-meta` 无真实文件，
  // 任何间接引用 useVersionCheck 的组件测试都需要它能解析到同一套构建常量。
  plugins: [react(), buildMetaPlugin()],
  resolve: {
    alias: {
      // 与 vite.config.ts 保持一致：共享层已拆为 workspace 包，别名保留旧写法
      '@mftb/contracts': path.resolve(__dirname, './frontend/packages/contracts/src'),
      '@/api': path.resolve(__dirname, './frontend/packages/platform-client/src/api'),
      '@/contexts': path.resolve(__dirname, './frontend/packages/platform-client/src/contexts'),
      '@/utils': path.resolve(__dirname, './frontend/packages/platform-client/src/utils'),
      '@/components': path.resolve(__dirname, './frontend/packages/ui/src/components'),
      '@/hooks': path.resolve(__dirname, './frontend/packages/ui/src/hooks'),
      '@/styles': path.resolve(__dirname, './frontend/packages/ui/src/styles'),
      '@/constants': path.resolve(__dirname, './frontend/packages/contracts/src/constants'),
      '@/assets': path.resolve(__dirname, './frontend/packages/ui/src/assets'),
      '@/api': path.resolve(__dirname, './frontend/packages/platform-client/src/api'),
      '@/contexts': path.resolve(__dirname, './frontend/packages/platform-client/src/contexts'),
      '@/utils': path.resolve(__dirname, './frontend/packages/platform-client/src/utils'),
      '@/components': path.resolve(__dirname, './frontend/packages/ui/src/components'),
      '@/hooks': path.resolve(__dirname, './frontend/packages/ui/src/hooks'),
      '@/styles': path.resolve(__dirname, './frontend/packages/ui/src/styles'),
      '@/i18n': path.resolve(__dirname, './frontend/packages/i18n/src/i18n'),
      '@/constants': path.resolve(__dirname, './frontend/packages/contracts/src/constants'),
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
    // Vitest 4 已移除 poolOptions.forks，预算必须放到顶层才会生效。
    maxWorkers: maxForks,
    // scripts/**\*.test.mjs：影响域分析与依赖边界门禁的纯函数单测（node 环境，文件内已声明）。
    // 这些门禁直接决定「哪些代码需要被验证」，必须能在不跑真仓的情况下被固定住。
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'scripts/**/*.test.mjs',
      'frontend/packages/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'dist/', 'src/test/'],
    },
  },
})
