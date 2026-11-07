/* eslint-disable react-refresh/only-export-components -- 本文件是入口装配模块（只被 main 引用），不处于 HMR 组件边界 */
import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhTW from 'antd/locale/zh_TW'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import jaJP from 'antd/locale/ja_JP'
import koKR from 'antd/locale/ko_KR'
import ruRU from 'antd/locale/ru_RU'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-tw'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/ja'
import 'dayjs/locale/ko'
import 'dayjs/locale/ru'
import App from './App'
import i18n, { registerRemoteBundleLoader } from '@/i18n'
import { antdLocaleKey, dayjsLocaleKey, htmlLangAttr } from '@/i18n/localeMapping'
import ThemeProvider from '@/theme/ThemeProvider'
import { useTheme } from '@/theme/ThemeContext'
import { buildThemeConfig } from '@/theme/themeTokens'

// i18n 包是叶子包，不反向依赖 api 层：远程语言包加载器在这里注入（方案 P2 包依赖方向）
registerRemoteBundleLoader((lang) =>
  import('@/api/translation').then((m) => m.fetchTranslationBundle(lang)),
)
import '@/styles/global.css'

// antd DatePicker 的星期表头取自 dayjs locale，未设置时会显示英文（Sun/Mon…）；
// 默认语言为繁中，这里同步把 dayjs locale 设为 zh-tw，语言切换时再跟随调整
dayjs.locale('zh-tw')

/**
 * 界面语言 → antd 内置文案 locale（分页/空数据/确认按钮等）。
 * 类型直接取 zhTW 的形状：antd 并不从 config-provider 导出 Locale（写了会 TS2614），
 * 拿现成的导入项做型比再猜导出路径更不容易碎。
 */
const ANTD_LOCALES: Record<ReturnType<typeof antdLocaleKey>, typeof zhTW> = {
  en_US: enUS,
  zh_CN: zhCN,
  zh_TW: zhTW,
  ja_JP: jaJP,
  ko_KR: koKR,
  ru_RU: ruRU,
}

/**
 * antd 主题配置已移到 `@/theme/themeTokens`（浅色/深色两套 + buildThemeConfig）。
 * 放在那里而不是留在这里，是因为它需要与 CSS 令牌层逐项对齐并由单测守住一致性；
 * 留在入口文件里会让「改一个颜色」同时涉及 CSS 与 TS 两处而无人校验。
 */

/** 根 Providers：antd 組件內置文案（分頁/空數據/日期選擇器）隨 i18n 語言動態切換；主题随深浅色切换 */
function AppProviders() {
  const [locale, setLocale] = useState(zhTW)
  const { theme } = useTheme()
  // 只在主题真的变了时重建配置：antd 会按 theme 对象重算组件样式，每次渲染新建对象都是开销
  const themeConfig = useMemo(() => buildThemeConfig(theme), [theme])

  useEffect(() => {
    const syncLocale = () => {
      // 旧实现只分「en 用英文、其余一律繁中」：简体中文会拿到繁体的 antd 内置文案与
      // dayjs 星期表头（週日/週一），跟已经是简体的正文同一屏两种字形；ja/ko/ru 同理。
      // 现在按当前语言选对应 locale，映射口径由 localeMapping 统一持有并由单测钉住。
      setLocale(ANTD_LOCALES[antdLocaleKey(i18n.language)])
      dayjs.locale(dayjsLocaleKey(i18n.language))
      // 读屏器与搜索引擎靠这个属性判断页面语种；它此前一直停在 index.html 的 zh-TW
      document.documentElement.lang = htmlLangAttr(i18n.language)
    }
    syncLocale()
    i18n.on('languageChanged', syncLocale)
    return () => {
      i18n.off('languageChanged', syncLocale)
    }
  }, [])

  return (
    <ConfigProvider locale={locale} theme={themeConfig}>
      <App />
    </ConfigProvider>
  )
}

/**
 * 挂载整站 React 树。
 *
 * 为什么单拆一层（方案 §4.1）：整站入口 `src/main.tsx` 与各应用入口
 * `frontend/apps/<app>/src/main.tsx` 复用同一套 Providers / 主题 / i18n 装配，
 * 应用差异只由构建期别名 `@/app-routes` 决定，不复制启动逻辑。
 *
 * ThemeProvider 必须在 ConfigProvider 之上：主题既决定 CSS 变量（`<html data-theme>`），
 * 也决定 antd 的 algorithm 与 token 取值，两处必须同源。也正因如此，
 * 子应用入口不得自己再套一层 ThemeProvider —— 那会产生两份互不同步的偏好状态。
 */
export function mountApp(): void {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ThemeProvider>
        <AppProviders />
      </ThemeProvider>
    </React.StrictMode>,
  )
}
