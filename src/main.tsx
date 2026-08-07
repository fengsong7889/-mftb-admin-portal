import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhTW from 'antd/locale/zh_TW'
import enUS from 'antd/locale/en_US'
import App from './App'
import i18n from './i18n'
import './styles/global.css'

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
      setLocale(i18n.language?.startsWith('en') ? enUS : zhTW)
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
