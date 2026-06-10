import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhTW from 'antd/locale/zh_TW'
import App from './App'
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhTW} theme={themeConfig}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)
