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
const PageDescriptionEditor = lazy(() => import('./pages/PageDescriptionEditor'))
// 搜索配置管理(新系统)
const GlobalConfig = lazy(() => import('./pages/SearchConfigNew/GlobalConfig'))
const DimensionStrategy = lazy(() => import('./pages/SearchConfigNew/ChannelStrategy'))
// 推荐管理
const RecommendDashboard = lazy(() => import('./pages/Recommend/Dashboard'))
const RecommendAlgorithm = lazy(() => import('./pages/Recommend/Algorithm'))
const RecommendAlgorithmMonitor = lazy(() => import('./pages/Recommend/AlgorithmMonitor'))
const RecommendSlot = lazy(() => import('./pages/Recommend/Slot'))
const RecommendPricing = lazy(() => import('./pages/Recommend/Pricing'))
const RecommendPackage = lazy(() => import('./pages/Recommend/Package'))
const RecommendOrder = lazy(() => import('./pages/Recommend/Order'))
const RecommendCalendar = lazy(() => import('./pages/Recommend/Calendar'))
const RecommendEffectReport = lazy(() => import('./pages/Recommend/EffectReport'))
const RecommendRevenueReport = lazy(() => import('./pages/Recommend/RevenueReport'))
// 推荐管理 - 新增模块
const RecommendRecallStrategy = lazy(() => import('./pages/Recommend/RecallStrategy'))
const RecommendRecallSource = lazy(() => import('./pages/Recommend/RecallSource'))
const RecommendRecallAnalysis = lazy(() => import('./pages/Recommend/RecallAnalysis'))
const RecommendRankingCoarse = lazy(() => import('./pages/Recommend/RankingCoarse'))
const RecommendRankingFine = lazy(() => import('./pages/Recommend/RankingFine'))
const RecommendRankingRerank = lazy(() => import('./pages/Recommend/RankingRerank'))
const RecommendStrategyAdType = lazy(() => import('./pages/Recommend/StrategyAdType'))
const RecommendStrategyOrchestration = lazy(() => import('./pages/Recommend/StrategyOrchestration'))
const RecommendStrategyTimeslot = lazy(() => import('./pages/Recommend/StrategyTimeslot'))
const RecommendABTest = lazy(() => import('./pages/Recommend/ABTest'))
const RecommendMerchantRule = lazy(() => import('./pages/Recommend/MerchantRule'))
const RecommendUserProfile = lazy(() => import('./pages/Recommend/UserProfile'))
// 權限管理
const FunctionPermission = lazy(() => import('./pages/Permission/FunctionPermission'))
const DataPermission = lazy(() => import('./pages/Permission/DataPermission'))
// 商家推广工具
const PromotionDashboard = lazy(() => import('./pages/Recommend/Dashboard'))
const PromotionAlgorithm = lazy(() => import('./pages/Recommend/Algorithm'))
const PromotionAlgorithmAdd = lazy(() => import('./pages/Recommend/AlgorithmAdd'))
const PromotionAlgorithmFlow = lazy(() => import('./pages/Recommend/AlgorithmFlow'))
const PromotionWaterfall = lazy(() => import('./pages/Recommend/Waterfall'))
const PromotionWaterfallAdd = lazy(() => import('./pages/Recommend/WaterfallAdd'))
const PromotionSlotConfig = lazy(() => import('./pages/PromotionSlotConfig'))
const PromotionSlotConfigAdd = lazy(() => import('./pages/PromotionSlotConfigAdd'))
const PromotionSalesConfig = lazy(() => import('./pages/PromotionSalesConfig'))
// 广告销售（独立页面，不复用店铺推广组件）
const AdSales = lazy(() => import('./pages/AdSales'))
const PromotionOrderManage = lazy(() => import('./pages/PromotionOrderManage'))
// 推广通 - 報表分析
const PromotionReportOverview = lazy(() => import('./pages/PromotionReport/Overview'))
const PromotionReportOrder = lazy(() => import('./pages/PromotionReport/OrderReport'))
const PromotionReportCompare = lazy(() => import('./pages/PromotionReport/Compare'))
// 地圖規劃
const MapPlanning = lazy(() => import('./pages/MapPlanning'))

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
              <Route path="/channel-strategy" element={<DimensionStrategy />} />
              {/* 推荐管理 */}
              <Route path="/recommend-dashboard" element={<RecommendDashboard />} />
              <Route path="/recommend-algorithm" element={<RecommendAlgorithm />} />
              <Route path="/recommend-algorithm-monitor" element={<RecommendAlgorithmMonitor />} />
              <Route path="/recommend-slot" element={<RecommendSlot />} />
              <Route path="/recommend-pricing" element={<RecommendPricing />} />
              <Route path="/recommend-package" element={<RecommendPackage />} />
              <Route path="/recommend-order" element={<RecommendOrder />} />
              <Route path="/recommend-calendar" element={<RecommendCalendar />} />
              <Route path="/recommend-effect-report" element={<RecommendEffectReport />} />
              <Route path="/recommend-revenue-report" element={<RecommendRevenueReport />} />
              {/* 推荐管理 - 新增路由 */}
              <Route path="/recommend-recall-strategy" element={<RecommendRecallStrategy />} />
              <Route path="/recommend-recall-source" element={<RecommendRecallSource />} />
              <Route path="/recommend-recall-analysis" element={<RecommendRecallAnalysis />} />
              <Route path="/recommend-ranking-coarse" element={<RecommendRankingCoarse />} />
              <Route path="/recommend-ranking-fine" element={<RecommendRankingFine />} />
              <Route path="/recommend-ranking-rerank" element={<RecommendRankingRerank />} />
              <Route path="/recommend-strategy-adtype" element={<RecommendStrategyAdType />} />
              <Route path="/recommend-strategy-orchestration" element={<RecommendStrategyOrchestration />} />
              <Route path="/recommend-strategy-timeslot" element={<RecommendStrategyTimeslot />} />
              <Route path="/recommend-ab-test" element={<RecommendABTest />} />
              <Route path="/recommend-merchant-rule" element={<RecommendMerchantRule />} />
              <Route path="/recommend-user-profile" element={<RecommendUserProfile />} />
              {/* 權限管理 */}
              <Route path="/function-permission" element={<FunctionPermission />} />
              <Route path="/data-permission" element={<DataPermission />} />
              {/* 商家推广工具 */}
              <Route path="/promotion-dashboard" element={<PromotionDashboard />} />
              <Route path="/promotion-algorithm" element={<PromotionAlgorithm />} />
              <Route path="/promotion-algorithm-add" element={<PromotionAlgorithmAdd />} />
              <Route path="/promotion-algorithm-flow" element={<PromotionAlgorithmFlow />} />
              <Route path="/promotion-slot-config" element={<PromotionSlotConfig />} />
              <Route path="/promotion-slot-config-add" element={<PromotionSlotConfigAdd />} />
              <Route path="/promotion-waterfall" element={<PromotionWaterfall />} />
              <Route path="/promotion-waterfall1" element={<PromotionWaterfall />} />
              <Route path="/promotion-waterfall-add" element={<PromotionWaterfallAdd />} />
              <Route path="/promotion-sales-config" element={<PromotionSalesConfig />} />
              <Route path="/ad-sales" element={<AdSales />} />
              <Route path="/promotion-order-manage" element={<PromotionOrderManage />} />
              <Route path="/merchant-order-manage" element={<PromotionOrderManage />} />
              {/* 推广通 - 報表分析 */}
              <Route path="/promotion-report-overview" element={<PromotionReportOverview />} />
              <Route path="/promotion-report-order" element={<PromotionReportOrder />} />
              <Route path="/promotion-report-compare" element={<PromotionReportCompare />} />
              {/* 地圖規劃 */}
              <Route path="/map-planning" element={<MapPlanning />} />
              {/* 页面说明编辑 */}
              <Route path="/page-description-editor" element={<PageDescriptionEditor />} />
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