import i18n from 'i18next'
import type { Resource, ResourceLanguage, TFunction } from 'i18next'
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

/**
 * 读取语言包里的「数组型」文案（日历星期表头、励志语清单这类）。
 *
 * <p>为什么必须走本函数而不是直接 `t(key, { returnObjects: true }) as string[]`：
 * 数组型文案的真源只能是前端静态语言包，而链路上有两个会把它们压成字符串的来源 ——
 * ① `scripts/gen-zh-cn-locale.mjs` 旧实现把数组当叶子做 `String()`（2026-11-06 实测
 * zh-CN 的 meeting.calendarWeekdays 变成 `"周日,周一,…"`）；
 * ② 后端 sys_translation 是扁平 key→字符串表，结构上装不下数组，镜像同步旧实现把
 * List `toString()` 灌成 `"[周日, 周一, …]"`，ja/ko/ru 还在这串上跑了机翻。
 * 只要拿到字符串，`.map()` 就抛 TypeError，把整页打成错误边界 —— 而这条崩溃只在特定
 * 语言下发生，繁中开发路径永远碰不到。`useMotivationQuote` 早已按此约定做类型校验，
 * 本函数把这个约定收口成一处，不再依赖每个调用点自觉。
 *
 * <p>兜底不写死任何语言的文案，而是回落到**繁中真源**的同一路径：繁中本来就是全站源
 * 语言（也是机翻的源），回到真值比在代码里钉一份中文更对，也不会踩 check:i18n 的硬编码棘轮。
 *
 * @param key    当前语境下的取值键（可以是 `useTranslation('adSales')` 里的短键）
 * @param sourcePath 繁中真源里的点分全路径；不传则用 key（跨 ns 调用必须显式传）
 */
export function readTextArray(
  translate: TFunction,
  key: string,
  sourcePath: string = key,
): string[] {
  const source = sourceTextArray(sourcePath)
  const raw = translate(key, { returnObjects: true }) as unknown
  // 只有结构型数组（真源非空）才拆历史串：星期表头这类短词列表拆回来是无损的；
  // 真源里没这个键时不拆，宁可返回空让调用方按「无数据」处理。
  const items = Array.isArray(raw) ? raw : (source.length > 0 ? splitLegacyArrayText(raw, key) : [])
  const cleaned = items.map(item => String(item ?? '').trim()).filter(Boolean)
  if (source.length === 0) return cleaned
  // 条数必须与真源一致：缺一格就是整行错位，宁可整组回到真源也不拿残缺值凑数
  return cleaned.length === source.length ? cleaned : source
}

/** 从繁中真源（全站源语言）按点分路径取数组型文案；取不到返回空数组 */
function sourceTextArray(path: string): string[] {
  let node: unknown = zhTW
  for (const seg of path.split('.')) {
    if (node === null || typeof node !== 'object') return []
    node = (node as Record<string, unknown>)[seg]
  }
  return Array.isArray(node) ? node.map(item => String(item ?? '').trim()).filter(Boolean) : []
}

/**
 * 把历史腐化值拆回数组：兼容 `a,b,c` 与 `[a, b, c]` 两种形态。
 * <p>拿不到 key（i18next 查不到时原样返回 key 字符串）必须返回空，
 * 否则会把 `"meeting.calendarWeekdays"` 按点号拆成看似合法的垃圾值。
 */
function splitLegacyArrayText(raw: unknown, key: string): unknown[] {
  if (typeof raw !== 'string' || raw === key || raw === '') return []
  return raw
    .replace(/^\[|\]$/g, '')
    .split(/[,，、]/)
    .map(part => part.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
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
