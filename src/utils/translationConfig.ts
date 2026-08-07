/**
 * 多语言配置校验工具（供 HeaderBar / Login 等顶部语言选择器共用）
 * 校验某语言是否已在「多语言配置」菜单完成配置：
 * 1. not_configured — 语言不在已配置列表或完成率为 0：阻断切换，提醒去配置
 * 2. partial       — 完成率 > 0 但低于阈值（如只配了 1 个字段）：警告后可强制切换
 * 3. ready         — 完成率达到阈值：直接切换
 */

/** 与 TranslationManage 页面共用的 localStorage key */
export const TRANSLATION_DATA_KEY = 'translation_data'
export const TRANSLATION_LANGS_KEY = 'translation_languages'

/** 完成率达标阈值（>= 60% 视为已配置） */
export const COVERAGE_READY_THRESHOLD = 0.6

/** 未进入过多语言配置页时的默认识别语言 */
const DEFAULT_LANG_CODES = ['zh-TW', 'en', 'ja', 'ko', 'ru']

/** 多语言配置中的语言条目（与页面 Language 结构一致） */
export interface ConfiguredLanguage {
  code: string
  name: string
  flag: string
  names?: Record<string, string>
}

interface TranslationRecord {
  id: string
  fieldKey: string
  category: string
  description: string
  translations: Record<string, string>
}

/** 读取已配置的语言列表（未配置过则返回默认 5 语言） */
export function getConfiguredLanguages(): ConfiguredLanguage[] {
  try {
    const saved = localStorage.getItem(TRANSLATION_LANGS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as ConfiguredLanguage[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    /* 隐私模式等异常降级 */
  }
  return DEFAULT_LANG_CODES.map(code => ({ code, name: code, flag: '🌐' }))
}

/** 读取翻译数据（未配置过返回 null） */
function getTranslationData(): TranslationRecord[] | null {
  try {
    const saved = localStorage.getItem(TRANSLATION_DATA_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as TranslationRecord[]
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    /* 降级 */
  }
  return null
}

export interface LanguageCoverage {
  total: number
  translated: number
  rate: number
}

/** 计算某语言的翻译完成率 */
export function getLanguageCoverage(langCode: string): LanguageCoverage {
  const data = getTranslationData()
  // 未进入过多语言配置页：系统内置语言视为完整，其它按待审核处理
  if (!data || data.length === 0) {
    if (langCode === 'zh-TW' || langCode === 'en') {
      return { total: 0, translated: 0, rate: 1 }
    }
    return { total: 0, translated: 0, rate: 0.5 }
  }
  const total = data.length
  const translated = data.filter(item => (item.translations[langCode] || '').trim()).length
  return { total, translated, rate: total > 0 ? translated / total : 0 }
}

export type LangConfigStatus = 'not_configured' | 'partial' | 'ready'

export interface LangValidationResult extends LanguageCoverage {
  status: LangConfigStatus
}

/** 校验某语言是否已完成配置 */
export function validateLanguageConfigured(langCode: string): LangValidationResult {
  const languages = getConfiguredLanguages()
  const exists = languages.some(l => l.code === langCode)
  const coverage = getLanguageCoverage(langCode)

  if (!exists || coverage.rate === 0) {
    return { ...coverage, status: 'not_configured' }
  }
  if (coverage.rate < COVERAGE_READY_THRESHOLD) {
    return { ...coverage, status: 'partial' }
  }
  return { ...coverage, status: 'ready' }
}

/**
 * 获取字段在指定语言下的翻译（全局回退链）：
 * 目标语言 → 英文 → 繁中 → 字段名称
 * 完成率 60%~100% 的语言切换后，未配置字段即按此规则用英文展示
 */
export function getFieldTranslation(fieldKey: string, langCode: string): string {
  const data = getTranslationData()
  const field = data?.find(item => item.fieldKey === fieldKey || item.description === fieldKey)
  if (!field) return fieldKey
  return (
    (field.translations[langCode] || '').trim() ||
    (field.translations['en'] || '').trim() ||
    (field.translations['zh-TW'] || '').trim() ||
    field.description
  )
}

/* ==== 语言信息库（供多语言配置页与顶部语言选择器共用） ==== */
/** 系统语言顺序（与 LANG_INFO 中 names 数组下标对应） */
export const SYS_LANG_ORDER = ['zh-TW', 'en', 'ja', 'ko', 'ru']

/**
 * 语言信息库：母语名称 + 默认国旗 + 各系统语言下的显示名
 * names 数组顺序：[zh-TW, en, ja, ko, ru]
 */
export const LANG_INFO: Record<string, { native: string; flag: string; names: string[] }> = {
  'zh-TW': { native: '繁體中文', flag: '🇨🇳', names: ['繁中', 'Chinese', '中国語', '중국어', 'Китайский'] },
  'zh-CN': { native: '简体中文', flag: '🇨🇳', names: ['簡中', 'Chinese (Simplified)', '簡体字中国語', '간체 중국어', 'Китайский (упрощ.)'] },
  en: { native: 'English', flag: '🇺🇸', names: ['英文', 'English', '英語', '영어', 'Английский'] },
  ja: { native: '日本語', flag: '🇯🇵', names: ['日文', 'Japanese', '日本語', '일본어', 'Японский'] },
  ko: { native: '한국어', flag: '🇰🇷', names: ['韓文', 'Korean', '韓国語', '한국어', 'Корейский'] },
  ru: { native: 'Русский', flag: '🇷🇺', names: ['俄文', 'Russian', 'ロシア語', '러시아어', 'Русский'] },
  th: { native: 'ภาษาไทย', flag: '🇹🇭', names: ['泰文', 'Thai', 'タイ語', '태국어', 'Тайский'] },
  vi: { native: 'Tiếng Việt', flag: '🇻🇳', names: ['越南文', 'Vietnamese', 'ベトナム語', '베트남어', 'Вьетнамский'] },
  id: { native: 'Bahasa Indonesia', flag: '🇮🇩', names: ['印尼文', 'Indonesian', 'インドネシア語', '인도네시아어', 'Индонезийский'] },
  ms: { native: 'Bahasa Melayu', flag: '🇲🇾', names: ['馬來文', 'Malay', 'マレー語', '말레이어', 'Малайский'] },
  fr: { native: 'Français', flag: '🇫🇷', names: ['法文', 'French', 'フランス語', '프랑스어', 'Французский'] },
  de: { native: 'Deutsch', flag: '🇩🇪', names: ['德文', 'German', 'ドイツ語', '독일어', 'Немецкий'] },
  es: { native: 'Español', flag: '🇪🇸', names: ['西班牙文', 'Spanish', 'スペイン語', '스페인어', 'Испанский'] },
  pt: { native: 'Português', flag: '🇵🇹', names: ['葡萄牙文', 'Portuguese', 'ポルトガル語', '포르투갈어', 'Португальский'] },
  it: { native: 'Italiano', flag: '🇮🇹', names: ['義大利文', 'Italian', 'イタリア語', '이탈리아어', 'Итальянский'] },
  ar: { native: 'العربية', flag: '🇸🇦', names: ['阿拉伯文', 'Arabic', 'アラビア語', '아랍어', 'Арабский'] },
  hi: { native: 'हिन्दी', flag: '🇮🇳', names: ['印地文', 'Hindi', 'ヒンディー語', '힌디어', 'Хинди'] },
  bn: { native: 'বাংলা', flag: '🇧🇩', names: ['孟加拉文', 'Bengali', 'ベンガル語', '벵골어', 'Бенгальский'] },
  tr: { native: 'Türkçe', flag: '🇹🇷', names: ['土耳其文', 'Turkish', 'トルコ語', '터키어', 'Турецкий'] },
  pl: { native: 'Polski', flag: '🇵🇱', names: ['波蘭文', 'Polish', 'ポーランド語', '폴란드어', 'Польский'] },
  nl: { native: 'Nederlands', flag: '🇳🇱', names: ['荷蘭文', 'Dutch', 'オランダ語', '네덜란드어', 'Нидерландский'] },
  sv: { native: 'Svenska', flag: '🇸🇪', names: ['瑞典文', 'Swedish', 'スウェーデン語', '스웨덴어', 'Шведский'] },
  da: { native: 'Dansk', flag: '🇩🇰', names: ['丹麥文', 'Danish', 'デンマーク語', '덴마크어', 'Датский'] },
  no: { native: 'Norsk', flag: '🇳🇴', names: ['挪威文', 'Norwegian', 'ノルウェー語', '노르웨이어', 'Норвежский'] },
  fi: { native: 'Suomi', flag: '🇫🇮', names: ['芬蘭文', 'Finnish', 'フィンランド語', '핀란드어', 'Финский'] },
  uk: { native: 'Українська', flag: '🇺🇦', names: ['烏克蘭文', 'Ukrainian', 'ウクライナ語', '우크라이나어', 'Украинский'] },
  ro: { native: 'Română', flag: '🇷🇴', names: ['羅馬尼亞文', 'Romanian', 'ルーマニア語', '루마니아어', 'Румынский'] },
  hu: { native: 'Magyar', flag: '🇭🇺', names: ['匈牙利文', 'Hungarian', 'ハンガリー語', '헝가리어', 'Венгерский'] },
  cs: { native: 'Čeština', flag: '🇨🇿', names: ['捷克文', 'Czech', 'チェコ語', '체코어', 'Чешский'] },
  el: { native: 'Ελληνικά', flag: '🇬🇷', names: ['希臘文', 'Greek', 'ギリシャ語', '그리스어', 'Греческий'] },
  he: { native: 'עברית', flag: '🇮🇱', names: ['希伯來文', 'Hebrew', 'ヘブライ語', '히브리어', 'Иврит'] },
  fa: { native: 'فارسی', flag: '🇮🇷', names: ['波斯文', 'Persian', 'ペルシャ語', '페르시아어', 'Персидский'] },
  ur: { native: 'اردو', flag: '🇵🇰', names: ['烏爾都文', 'Urdu', 'ウルドゥー語', '우르두어', 'Урду'] },
  ta: { native: 'தமிழ்', flag: '🇮🇳', names: ['泰米爾文', 'Tamil', 'タミル語', '타밀어', 'Тамильский'] },
  te: { native: 'తెలుగు', flag: '🇮🇳', names: ['泰盧固文', 'Telugu', 'テルグ語', '텔루구어', 'Телугу'] },
  my: { native: 'မြန်မာ', flag: '🇲🇲', names: ['緬甸文', 'Burmese', 'ミャンマー語', '미얀마어', 'Бирманский'] },
  km: { native: 'ភាសាខ្មែរ', flag: '🇰🇭', names: ['高棉文', 'Khmer', 'クメール語', '크메르어', 'Кхмерский'] },
  lo: { native: 'ລາວ', flag: '🇱🇦', names: ['寮國文', 'Lao', 'ラオス語', '라오스어', 'Лаосский'] },
  ne: { native: 'नेपाली', flag: '🇳🇵', names: ['尼泊爾文', 'Nepali', 'ネパール語', '네팔어', 'Непальский'] },
  si: { native: 'සිංහල', flag: '🇱🇰', names: ['僧伽羅文', 'Sinhala', 'シンハラ語', '싱할라어', 'Сингальский'] },
  sw: { native: 'Kiswahili', flag: '🇰🇪', names: ['斯瓦希里文', 'Swahili', 'スワヒリ語', '스와힐리어', 'Суахили'] },
  af: { native: 'Afrikaans', flag: '🇿🇦', names: ['南非荷蘭文', 'Afrikaans', 'アフリカーンス語', '아프리칸스어', 'Африкаанс'] },
  bg: { native: 'Български', flag: '🇧🇬', names: ['保加利亞文', 'Bulgarian', 'ブルガリア語', '불가리아어', 'Болгарский'] },
  hr: { native: 'Hrvatski', flag: '🇭🇷', names: ['克羅埃西亞文', 'Croatian', 'クロアチア語', '크로아티아어', 'Хорватский'] },
  sk: { native: 'Slovenčina', flag: '🇸🇰', names: ['斯洛伐克文', 'Slovak', 'スロバキア語', '슬로바키아어', 'Словацкий'] },
  sl: { native: 'Slovenščina', flag: '🇸🇮', names: ['斯洛維尼亞文', 'Slovenian', 'スロベニア語', '슬로베니아어', 'Словенский'] },
  sr: { native: 'Српски', flag: '🇷🇸', names: ['塞爾維亞文', 'Serbian', 'セルビア語', '세르비아어', 'Сербский'] },
  lt: { native: 'Lietuvių', flag: '🇱🇹', names: ['立陶宛文', 'Lithuanian', 'リトアニア語', '리투아니아어', 'Литовский'] },
  lv: { native: 'Latviešu', flag: '🇱🇻', names: ['拉脫維亞文', 'Latvian', 'ラトビア語', '라트비아어', 'Латышский'] },
  et: { native: 'Eesti', flag: '🇪🇪', names: ['愛沙尼亞文', 'Estonian', 'エストニア語', '에스토니아어', 'Эстонский'] },
  ka: { native: 'ქართული', flag: '🇬🇪', names: ['喬治亞文', 'Georgian', 'ジョージア語', '조지아어', 'Грузинский'] },
  is: { native: 'Íslenska', flag: '🇮🇸', names: ['冰島文', 'Icelandic', 'アイスランド語', '아이슬란드어', 'Исландский'] },
  mk: { native: 'Македонски', flag: '🇲🇰', names: ['馬其頓文', 'Macedonian', 'マケドニア語', '마케도니아어', 'Македонский'] },
  sq: { native: 'Shqip', flag: '🇦🇱', names: ['阿爾巴尼亞文', 'Albanian', 'アルバニア語', '알바니아어', 'Албанский'] },
  bs: { native: 'Bosanski', flag: '🇧🇦', names: ['波士尼亞文', 'Bosnian', 'ボスニア語', '보스니아어', 'Боснийский'] },
  ca: { native: 'Català', flag: '🇪🇸', names: ['加泰隆尼亞文', 'Catalan', 'カタルーニャ語', '카탈로니아어', 'Каталанский'] },
  eu: { native: 'Euskara', flag: '🇪🇸', names: ['巴斯克文', 'Basque', 'バスク語', '바스크어', 'Баскский'] },
  gl: { native: 'Galego', flag: '🇪🇸', names: ['加利西亞文', 'Galician', 'ガリシア語', '갈리시아어', 'Галисийский'] },
  mn: { native: 'Монгол', flag: '🇲🇳', names: ['蒙古文', 'Mongolian', 'モンゴル語', '몽골어', 'Монгольский'] },
  kk: { native: 'Қазақ', flag: '🇰🇿', names: ['哈薩克文', 'Kazakh', 'カザフ語', '카자흐어', 'Казахский'] },
  uz: { native: 'Oʻzbek', flag: '🇺🇿', names: ['烏茲別克文', 'Uzbek', 'ウズベク語', '우즈베크어', 'Узбекский'] },
  az: { native: 'Azərbaycan', flag: '🇦🇿', names: ['亞塞拜然文', 'Azerbaijani', 'アゼルバイジャン語', '아제르바이잔어', 'Азербайджанский'] },
  hy: { native: 'Հայերեն', flag: '🇦🇲', names: ['亞美尼亞文', 'Armenian', 'アルメニア語', '아르메니아어', 'Армянский'] },
}

/** 语言代码 → 各系统语言显示名 Record */
export function langNamesOf(code: string): Record<string, string> {
  const info = LANG_INFO[code]
  if (!info) return {}
  return Object.fromEntries(SYS_LANG_ORDER.map((k, i) => [k, info.names[i]]))
}

/** 语言在指定系统语言下的显示名（用于括号标注和列标题） */
export function langSysName(code: string, sysLang: string): string {
  const info = LANG_INFO[code]
  if (!info) return code
  const idx = SYS_LANG_ORDER.indexOf(sysLang)
  return idx >= 0 && info.names[idx] ? info.names[idx] : info.native
}
