import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhTW from './locales/zh-TW.json'
import en from './locales/en.json'

/** 語言持久化 key（localStorage） */
export const LANGUAGE_STORAGE_KEY = 'app_language'

/** 支持的语言 */
export const SUPPORTED_LANGUAGES = ['zh-TW', 'en'] as const
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/** 國家 → 默認語言 映射：中國/港澳台默認中文，其餘默認英文 */
const COUNTRY_DEFAULT_LANGUAGE: Record<string, AppLanguage> = {
  china: 'zh-TW',
  hongkong: 'zh-TW',
  macau: 'zh-TW',
  taiwan: 'zh-TW',
}

/** 根據國家 code 獲取默認語言 */
export function getCountryLanguage(country: string): AppLanguage {
  return COUNTRY_DEFAULT_LANGUAGE[country] ?? 'en'
}

/** 讀取持久化的語言，無記錄時默認英文 */
export function getSavedLanguage(): AppLanguage {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(saved ?? '')
    ? (saved as AppLanguage)
    : 'en'
}

i18n.use(initReactI18next).init({
  resources: {
    'zh-TW': { translation: zhTW },
    en: { translation: en },
  },
  lng: getSavedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

/** 切換語言並持久化 */
export function changeAppLanguage(lang: AppLanguage) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)
  i18n.changeLanguage(lang)
}

/** 平鋪 key 轉嵌套結構（i18next 按 '.' 分層查找） */
function toNestedBundle(flat: Record<string, string>): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) {
        node[parts[i]] = {}
      }
      node = node[parts[i]] as Record<string, unknown>
    }
    node[parts[parts.length - 1]] = value
  }
  return root
}

/**
 * 注入後端數據庫語言包（多語言配置模塊）
 * deep 合併且不覆蓋靜態 JSON 已有的 UI 文案，僅補充業務字段/菜單名等動態翻譯
 * dontOverwrite=true：保護靜態 JSON 中已有的正確翻譯，避免後端回退鏈（目標→en→zh-TW→字段名）
 * 返回的英文值覆蓋已本地化的 UI 文案
 */
export function injectTranslationBundle(lang: string, flat: Record<string, string>) {
  if (!flat || Object.keys(flat).length === 0) return
  i18n.addResourceBundle(lang, 'translation', toNestedBundle(flat), true, true)
}

export default i18n
