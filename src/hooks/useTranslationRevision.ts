import { useEffect, useState } from 'react'
import { TRANSLATION_BUNDLE_EVENT } from '../i18n/bundleEvent'

/**
 * 翻譯包版本號。
 *
 * <p>數據庫語言包（ensureLanguageBundle）是異步注入的：注入完成後 i18next 資源變了，
 * 但以 {@code i18n.language} 為依賴的 useMemo 不會重算 —— 側邊欄菜單名、頁簽標題
 * 會停留在注入前的取值，刷新時表現為「兩套菜單名」。
 * <p>把本 hook 的返回值放進 useMemo / useEffect 依賴即可在注入後重算。
 * <p>為什麼不直接 emit languageChanged：語言字符串沒變，依賴項不變，memo 仍命中緩存。
 */
export function useTranslationRevision(): number {
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const bump = () => setRevision(value => value + 1)
    window.addEventListener(TRANSLATION_BUNDLE_EVENT, bump)
    return () => window.removeEventListener(TRANSLATION_BUNDLE_EVENT, bump)
  }, [])
  return revision
}
