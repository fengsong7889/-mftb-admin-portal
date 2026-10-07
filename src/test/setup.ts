import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

/*
 * waitFor / findBy* 的默认超时是 1000ms。多文件并行时 antd + jsdom 在用例间抢 CPU，
 * 带防抖搜索 + 异步回填的用例（如交接人选取、瀑布流表单）偶发在 1s 内没等到，
 * 表现为“单独跑必过、全量跑随机红测”的假失败（且失败文件会轮换）。
 * 这里只抬高等待上限，不放宽任何断言：健康用例本来就在几十毫秒内命中。
 */
configure({ asyncUtilTimeout: 8000 })

// 每个测试后自动清理 DOM
afterEach(() => {
  cleanup()
})

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
