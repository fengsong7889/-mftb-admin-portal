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
    // ⚡ 强制设置 admin 登录状态（仅用于快速验证）
    if (window.location.pathname !== '/login') {
      const mockUser = {
        id: 1,
        username: 'MF00001',
        name: 'Bee',
        empId: 'MF00001',
        avatar: 'pikachu-wink',
        role: 'admin' as const,
        department: '董事长兼首席执行官办公室',
        departmentEn: 'Office of the Chairman and Chief Executive Officer',
        position: '首席执行官',
        positionEn: 'CEO',
        jobLevel: 'M12',
      }
      
      // 如果还没有 user_info，就设置为 mock 用户
      if (!localStorage.getItem('user_info')) {
        localStorage.setItem('user_info', JSON.stringify(mockUser))
        localStorage.setItem('is_authenticated', 'true')
        localStorage.setItem('mftb_token', 'test_token_for_admin')
        console.log('✅ 已自动设置 admin 登录态:', mockUser.username, '(' + mockUser.role + ')')
      } else {
        const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}')
        console.log('当前用户 info:', userInfo)
        if (userInfo.role === 'admin') {
          console.log('✅ 当前用户角色是 admin')
        } else {
          console.warn('⚠️ 当前用户角色不是 admin，而是:', userInfo.role || '(unknown)')
        }
      }
    }

    // ⭐ 自動登錄邏輯：檢查是否已設置用戶信息，否則使用 Mock 數據
    if (!localStorage.getItem('user_info') && window.location.pathname !== '/login') {
      const mockUser = {
        id: 1,
        username: 'MF00001',
        name: 'Bee',
        empId: 'MF00001',
        avatar: 'pikachu-wink',
        role: 'admin',
        department: '董事長兼首席執行官辦公室',
        departmentEn: 'Office of the Chairman and Chief Executive Officer',
        position: '首席執行官',
        positionEn: 'CEO',
        jobLevel: 'M12',
      }
      localStorage.setItem('user_info', JSON.stringify(mockUser))
      localStorage.setItem('is_authenticated', 'true')
      localStorage.setItem('mftb_token', 'auto_login_token')
      console.log('✅ 自動登錄成功，使用 Mock 數據')
    }

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
