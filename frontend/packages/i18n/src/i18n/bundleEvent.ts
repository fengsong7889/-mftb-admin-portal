/**
 * 翻譯包注入事件名。
 *
 * <p>單獨成檔而不是寫在 i18n/index.ts：訂閱方（hooks/元件）只需要事件名，
 * 不該為此把整個 i18n 實例（含 initReactI18next 初始化）載入進來 ——
 * 否則在 vi.mock('react-i18next') 的測試裡會被拖下水而整檔失敗。
 */
export const TRANSLATION_BUNDLE_EVENT = 'mftb:translation-bundle-injected'
