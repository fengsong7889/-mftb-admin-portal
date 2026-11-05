import i18n from 'i18next'
import type { Resource, ResourceLanguage } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { TRANSLATION_BUNDLE_EVENT } from './bundleEvent'
import zhTW from './locales/zh-TW.json'
import zhCN from './locales/zh-CN.json'
import en from './locales/en.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'
import ru from './locales/ru.json'

/** 語言持久化 key（localStorage） */
export const LANGUAGE_STORAGE_KEY = 'app_language'

/**
 * 翻譯包注入事件：數據庫語言包（ensureLanguageBundle）是異步合併的，
 * 合併後同一個 key 的取值會變（zh-CN 尤其明顯：注入前回退菜單原名，注入後返回語言包值）。
 * 以 i18n.language 為依賴的 memo 不會因此重算，所以用事件通知視圖刷新。
 * <p>事件名定義在 ./bundleEvent，避免訂閱方為了取常量而載入整個 i18n 實例。
 */
export { TRANSLATION_BUNDLE_EVENT } from './bundleEvent'

/**
 * 支持的语言。
 * <p>zh-TW/en/zh-CN 有静态 JSON 兜底，ja/ko/ru 的门户文案有静态 JSON、其余由数据库语言包注入。
 * <p>zh-CN 的静态包由 `npm run i18n:gen-zhcn`（ICU4J 繁→简，与后端同算法）生成：
 * 没有它时简体中文的唯一文案来源是后端 `/translations/bundle`，于是
 * 库里缺的 key 一律按 fallbackLng 回退英文，且登录页（取不到 bundle，因为需要登录）整页英文。
 * 2026-11-05 实测库里只覆盖 8504/16540 个 key，即简中界面约一半是英文兜底。
 */
export const SUPPORTED_LANGUAGES = ['zh-TW', 'en', 'ja', 'ko', 'ru', 'zh-CN'] as const
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/** 國家 → 默認語言 映射：中國/港澳台默認中文，其餘默認英文 */
const COUNTRY_DEFAULT_LANGUAGE: Record<string, AppLanguage> = {
  china: 'zh-TW',
  hongkong: 'zh-TW',
  macau: 'zh-TW',
  taiwan: 'zh-TW',
  japan: 'ja',
  south_korea: 'ko',
  russia: 'ru',
}

/** 根據國家 code 獲取默認語言 */
export function getCountryLanguage(country: string): AppLanguage {
  return COUNTRY_DEFAULT_LANGUAGE[country] ?? 'en'
}

/** 讀取持久化的語言，無記錄時默認英文 */
export function getSavedLanguage(): string {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  // 后端允许动态注册语言；这里只校验代码格式，是否启用由顶栏接口校准。
  return saved && /^[a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?$/.test(saved) ? saved : 'en'
}

/**
 * 構建 resources：整個 JSON 註冊為 translation ns（點號寫法 t('section.key')），
 * 同時每個頂層段額外註冊為獨立 ns（冒號寫法 t('section:key')）
 * 兼容全系統兩種 t() 調用方式，避免冒號被 i18next 當作 ns 分隔符而查不到翻譯
 */
function buildResources(json: Record<string, unknown>): Resource {
  const resources: Resource = { translation: json as ResourceLanguage }
  for (const [section, value] of Object.entries(json)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      resources[section] = value as ResourceLanguage
    }
  }
  return resources
}

i18n.use(initReactI18next).init({
  resources: {
    'zh-TW': buildResources(zhTW),
    'zh-CN': buildResources(zhCN),
    en: buildResources(en),
    // 门户五语文案离线可用；系统内其余文案继续由后端语言包补齐。
    ja: buildResources(ja),
    ko: buildResources(ko),
    ru: buildResources(ru),
  },
  lng: getSavedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

/** 切換語言並持久化 */
export function changeAppLanguage(lang: string) {
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
 * deep 合併且不覆蓋靜態 JSON 已有的 UI 文案（overwrite=false），僅補充業務字段/菜單名等動態翻譯
 * 避免後端回退鏈（目標→en→zh-TW→字段名）產生的英文/字段名值覆蓋已本地化的 UI 文案
 */
export function injectTranslationBundle(lang: string, flat: Record<string, string>) {
  if (!flat || Object.keys(flat).length === 0) return
  const nested = toNestedBundle(flat)
  i18n.addResourceBundle(lang, 'translation', nested, true, false)
  // 同步按頂層段注入獨立 ns，兼容 t('section:key') 冒號寫法
  for (const [section, value] of Object.entries(nested)) {
    if (value && typeof value === 'object') {
      i18n.addResourceBundle(lang, section, value as Record<string, unknown>, true, false)
    }
  }
  // 菜單名/頁簽名等動態文案在注入前後取值不同，已掛載的視圖必須重算，
  // 否則同一次刷新內會先渲染菜單原名、再顯示語言包譯名（表現為「兩套菜單」）
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TRANSLATION_BUNDLE_EVENT))
  }
}

/** 已注入过数据库语言包的语言（会话内去重，避免刷新/切换重复请求） */
let bundleEnsuredLang: string | null = null

/**
 * 远程语言包加载器：由应用 bootstrap 注入（见 src/main.tsx）。
 * i18n 包必须保持叶子：若在这里直接 import api 层，会形成 i18n → platform-client → i18n 的包环
 * （scripts/check-boundary.mjs 的包依赖白名单会拦截）。
 */
export type RemoteBundleLoader = (lang: string) => Promise<Record<string, string> | null>
let remoteBundleLoader: RemoteBundleLoader | null = null
export function registerRemoteBundleLoader(loader: RemoteBundleLoader | null): void {
  remoteBundleLoader = loader
}

/**
 * 確保指定語言的數據庫語言包已注入（登錄後/刷新後恢復動態翻譯）：
 * 靜態 JSON 已覆蓋 zh-TW/zh-CN/en 的 UI 文案，但業務字段/菜單名等動態翻譯存於後端
 * sys_translation；刷新後 i18next 重建資源需重新拉取注入，否則 ja/ko/ru 回退英文。
 * 同一語言會話內只拉取一次；**沒拿到內容（抛異常或返回 null）都要清標誌**，
 * 否則後端重啟窗口內切一次語言就會把這個語言永久標成「已處理」，本次會話再也不會重試，
 * 用戶看到的是「怎麼切都還是英文」而不是「等後端起來就好」。
 */
export async function ensureLanguageBundle(lang: string) {
  if (!lang || bundleEnsuredLang === lang) return
  bundleEnsuredLang = lang
  try {
    const bundle = remoteBundleLoader ? await remoteBundleLoader(lang) : null
    if (!bundle) {
      bundleEnsuredLang = null
      return
    }
    injectTranslationBundle(lang, bundle)
  } catch {
    /* 拉取失敗（未登錄/網絡異常）靜默降級：UI 文案仍由靜態 JSON 兜底 */
    bundleEnsuredLang = null
  }
}

export default i18n
