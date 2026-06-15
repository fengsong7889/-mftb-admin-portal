import { useState, Suspense, lazy } from 'react'
import { Layout, Spin } from 'antd'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Sidebar from './components/Sidebar'
import HeaderBar from './components/HeaderBar'
import PetMascot from './components/PetMascot'
import Login from './pages/Login'
import './App.css'

/* 懒加载所有页面组件，避免启动时一次性加载所有模块 */
const Home = lazy(() => import('./pages/Home'))
const AccountBalance = lazy(() => import('./pages/AccountBalance'))
const BatchQuery = lazy(() => import('./pages/BatchQuery'))
const DetailQuery = lazy(() => import('./pages/DetailQuery'))
const WriteoffReconcile = lazy(() => import('./pages/WriteoffReconcile'))
const DebtReconcile = lazy(() => import('./pages/DebtReconcile'))
const DebtDetail = lazy(() => import('./pages/DebtDetail'))
const WordSegmentation = lazy(() => import('./pages/WordSegmentation'))
const HintConfig = lazy(() => import('./pages/HintConfig'))
const HintPreview = lazy(() => import('./pages/HintPreview'))
const HotSearchConfig = lazy(() => import('./pages/HotSearchConfig'))
const HotSearchPreview = lazy(() => import('./pages/HotSearchPreview'))
const HintReport = lazy(() => import('./pages/HintReport'))
const HotSearchReport = lazy(() => import('./pages/HotSearchReport'))
const SynonymConfig = lazy(() => import('./pages/SynonymConfig'))
const SearchWeightConfig = lazy(() => import('./pages/SearchWeightConfig'))
const HotSearchLibrary = lazy(() => import('./pages/HotSearchLibrary'))
const StopWords = lazy(() => import('./pages/StopWords'))
const ApprovalCenter = lazy(() => import('./pages/ApprovalCenter'))
const ApprovalDetail = lazy(() => import('./pages/ApprovalDetail'))
const SearchVerify = lazy(() => import('./pages/SearchVerify'))
const SearchVerifyDetail = lazy(() => import('./pages/SearchVerifyDetail'))
const HintVerify = lazy(() => import('./pages/HintVerify'))
const HotSearchVerify = lazy(() => import('./pages/HotSearchVerify'))
// 搜索配置管理(新系统)
const GlobalConfig = lazy(() => import('./pages/SearchConfigNew/GlobalConfig'))
const ChannelStrategy = lazy(() => import('./pages/SearchConfigNew/ChannelStrategy'))
const CommercialConfig = lazy(() => import('./pages/SearchConfigNew/CommercialConfig'))

const { Content } = Layout

/** 页面加载中指示器 */
function PageLoading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 300 }}>
      <Spin size="large" tip="加載中..." />
    </div>
  )
}

/** 需要认证的路由布局 */
function AuthenticatedLayout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <Layout className="app-layout">
      <Sidebar collapsed={collapsed} />
      <Layout>
        <HeaderBar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <Content className="app-content">
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<Home />} />
              {/* 財務管理 */}
              <Route path="/account-balance" element={<AccountBalance />} />
              <Route path="/batch-query" element={<BatchQuery />} />
              <Route path="/detail-query" element={<DetailQuery />} />
              <Route path="/writeoff-reconcile" element={<WriteoffReconcile />} />
              <Route path="/debt-reconcile" element={<DebtReconcile />} />
              <Route path="/debt-detail" element={<DebtDetail />} />
              {/* 审批管理 */}
              <Route path="/approval-center" element={<ApprovalCenter />} />
              <Route path="/approval-detail" element={<ApprovalDetail />} />
              {/* 搜索管理 */}
              <Route path="/word-segmentation" element={<WordSegmentation />} />
              <Route path="/synonym-config" element={<SynonymConfig />} />
              <Route path="/hint-config" element={<HintConfig />} />
              <Route path="/hint-preview" element={<HintPreview />} />
              <Route path="/hot-search-config" element={<HotSearchConfig />} />
              <Route path="/hot-search-preview" element={<HotSearchPreview />} />
              <Route path="/search-weight-config" element={<SearchWeightConfig />} />
              
              <Route path="/hot-search-library" element={<HotSearchLibrary />} />
              <Route path="/stop-words" element={<StopWords />} />
              <Route path="/hint-report" element={<HintReport />} />
              <Route path="/hot-search-report" element={<HotSearchReport />} />
              {/* 搜索配置校驗 */}
              <Route path="/search-verify" element={<SearchVerify />} />
              <Route path="/search-verify-detail/:id" element={<SearchVerifyDetail />} />
              <Route path="/hint-verify" element={<HintVerify />} />
              <Route path="/hot-search-verify" element={<HotSearchVerify />} />
              {/* 搜索配置管理(新系统) */}
              <Route path="/global-config" element={<GlobalConfig />} />
              <Route path="/channel-strategy" element={<ChannelStrategy />} />
              <Route path="/commercial-config" element={<CommercialConfig />} />
              {/* 默认回首页 */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Content>
      </Layout>
      <PetMascot />
    </Layout>
  )
}

/** 路由守卫 */
function AppRoutes() {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      {isAuthenticated ? (
        <Route path="/*" element={<AuthenticatedLayout />} />
      ) : (
        <>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </>
      )}
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App