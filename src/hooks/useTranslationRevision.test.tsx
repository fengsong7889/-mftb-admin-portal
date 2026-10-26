import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TRANSLATION_BUNDLE_EVENT } from '../i18n/bundleEvent'
import { useTranslationRevision } from './useTranslationRevision'

/**
 * 翻譯包版本號：數據庫語言包異步注入後必須觸發重算，
 * 否則側邊欄菜單名/頁簽名會停在上一次取值（表現為「刷新出兩套命名」）。
 */
describe('useTranslationRevision', () => {
  it('默認值為 0，不因無關事件自增', () => {
    const { result } = renderHook(() => useTranslationRevision())
    expect(result.current).toBe(0)
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(result.current).toBe(0)
  })

  it('語言包注入事件觸發版本號自增', () => {
    const { result } = renderHook(() => useTranslationRevision())
    act(() => { window.dispatchEvent(new Event(TRANSLATION_BUNDLE_EVENT)) })
    expect(result.current).toBe(1)
    act(() => { window.dispatchEvent(new Event(TRANSLATION_BUNDLE_EVENT)) })
    expect(result.current).toBe(2)
  })

  it('卸載後不再響應事件', () => {
    const { result, unmount } = renderHook(() => useTranslationRevision())
    unmount()
    expect(() => window.dispatchEvent(new Event(TRANSLATION_BUNDLE_EVENT))).not.toThrow()
    expect(result.current).toBe(0)
  })
})
