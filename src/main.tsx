import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhTW from 'antd/locale/zh_TW'
import enUS from 'antd/locale/en_US'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-tw'
import App from './App'
import i18n, { registerRemoteBundleLoader } from '@/i18n'

// i18n 包是叶子包，不反向依赖 api 层：远程语言包加载器在这里注入（方案 P2 包依赖方向）
registerRemoteBundleLoader((lang) =>
  import('@/api/translation').then((m) => m.fetchTranslationBundle(lang)),
)
import '@/styles/global.css'

// antd DatePicker 的星期表头取自 dayjs locale，未设置时会显示英文（Sun/Mon…）；
// 默认语言为繁中，这里同步把 dayjs locale 设为 zh-tw，语言切换时再跟随调整
dayjs.locale('zh-tw')

const themeConfig = {
  token: {
    colorPrimary: '#E8720C',
    colorPrimaryHover: '#F58A2E',
    colorPrimaryActive: '#CC6200',
    colorBgContainer: '#ffffff',
    colorBgLayout: '#F5F5F5',
    borderRadius: 4,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  components: {
    Menu: {
      itemBg: '#1E1E1E',
      itemColor: '#B0B0B0',
      itemHoverBg: '#2A2A2A',
      itemHoverColor: '#FFFFFF',
      itemSelectedBg: '#E8720C',
      itemSelectedColor: '#FFFFFF',
      subMenuItemBg: '#1E1E1E',
      itemActiveBg: '#333333',
      iconSize: 16,
      iconMarginInlineEnd: 10,
    },
    Button: {
      primaryShadow: 'none',
    },
    Table: {
      headerBg: '#FAFAFA',
      headerColor: '#333333',
      rowHoverBg: '#FFF7ED',
    },
  },
}

/** 根 Providers：antd 組件內置文案（分頁/空數據/日期選擇器）隨 i18n 語言動態切換 */
function AppProviders() {
  const [locale, setLocale] = useState(zhTW)

  useEffect(() => {
    const syncLocale = () => {
      const isEn = !!i18n.language?.startsWith('en')
      setLocale(isEn ? enUS : zhTW)
      dayjs.locale(isEn ? 'en' : 'zh-tw')
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders />
  </React.StrictMode>,
)
