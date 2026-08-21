import { useState, Suspense, lazy } from 'react'
import { Layout, Spin } from 'antd'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Sidebar from './components/Sidebar'
import HeaderBar from './components/HeaderBar'
import PetMascot from './components/PetMascot'
import Login from './pages/Login'
import RouteErrorBoundary from './components/RouteErrorBoundary'
import MenuPermissionGuard from './components/MenuPermissionGuard'
import './App.css'

/* 懒加载所有页面组件，避免启动时一次性加载所有模块 */
const Home = lazy(() => import('./pages/Home'))
const AccountBalance = lazy(() => import('./pages/AccountBalance'))
const RechargeAdd = lazy(() => import('./pages/AccountBalance/RechargeAdd'))
const TransferAdd = lazy(() => import('./pages/AccountBalance/TransferAdd'))
const DeductAdd = lazy(() => import('./pages/AccountBalance/DeductAdd'))
const MergeAdd = lazy(() => import('./pages/AccountBalance/MergeAdd'))
const BatchQuery = lazy(() => import('./pages/BatchQuery'))
const BatchDetail = lazy(() => import('./pages/BatchQuery/BatchDetail'))
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
const PagePRDView = lazy(() => import('./pages/PagePRDView'))
// 搜索配置管理(新系统)
const GlobalConfig = lazy(() => import('./pages/SearchConfigNew/GlobalConfig'))
const DimensionStrategy = lazy(() => import('./pages/SearchConfigNew/ChannelStrategy'))

// 集團人事
const EmployeeManagement = lazy(() => import('./pages/Permission/Employee'))
const OrganizationManagement = lazy(() => import('./pages/Permission/Organization'))
const PositionManagement = lazy(() => import('./pages/Permission/Position'))
const LoginLog = lazy(() => import('./pages/LoginLog'))
const RoleManagement = lazy(() => import('./pages/Permission/RoleManagement'))
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
const PromotionSlotConfigSlots = lazy(() => import('./pages/PromotionSlotConfigSlots'))
const PromotionSalesConfig = lazy(() => import('./pages/PromotionSalesConfig'))
const AdSales = lazy(() => import('./pages/AdSales'))
const PromotionWordLibrary = lazy(() => import('./pages/PromotionWordLibrary'))
const PromotionOrderManage = lazy(() => import('./pages/PromotionOrderManage'))
const PromotionOrderManageStandalone = lazy(() => import('./pages/PromotionOrderManageStandalone'))
const OrderDetail = lazy(() => import('./pages/OrderDetail'))
// 商戶集團管理
const GroupList = lazy(() => import('./pages/MerchantGroup/GroupList'))
const StoreList = lazy(() => import('./pages/MerchantGroup/StoreList'))
// 赠送管理
const GiftDetail = lazy(() => import('./pages/GiftManage/GiftDetail'))
const GiftAdd = lazy(() => import('./pages/GiftManage/GiftAdd'))
const GiftDetailView = lazy(() => import('./pages/GiftManage/GiftDetailView'))
const GiftConsumeDetail = lazy(() => import('./pages/GiftManage/GiftConsumeDetail'))
// 推广通 - 報表分析
const PromotionReportOverview = lazy(() => import('./pages/PromotionReport/Overview'))
const PromotionReportOrder = lazy(() => import('./pages/PromotionReport/OrderReport'))
const PromotionReportCompare = lazy(() => import('./pages/PromotionReport/Compare'))
// 地圖規劃
const MapPlanning = lazy(() => import('./pages/MapPlanning'))
// 團購管理
const GroupPurchaseDashboard = lazy(() => import('./pages/GroupPurchase/Dashboard'))
const FlashSaleRegister = lazy(() => import('./pages/GroupPurchase/FlashSaleRegister'))
const FlashSaleStats = lazy(() => import('./pages/GroupPurchase/FlashSaleStats'))
const FlashSalePrice = lazy(() => import('./pages/GroupPurchase/FlashSalePrice'))
// 系統配置
const MenuConfig = lazy(() => import('./pages/MenuConfig'))
const TranslationManage = lazy(() => import('./pages/TranslationManage'))
const RuleConfig = lazy(() => import('./pages/RuleConfig'))
// 審批流程配置
const WorkflowConfig = lazy(() => import('./pages/WorkflowConfig'))
const WorkflowEditor = lazy(() => import('./pages/WorkflowConfig/WorkflowEditor'))
const WorkflowDetail = lazy(() => import('./pages/WorkflowConfig/WorkflowDetail'))

const { Content } = Layout

/** 页面加载中指示器 */
function PageLoading() {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 300 }}>
      <Spin size="large" tip={t('common.loading')} />
    </div>
  )
}

/** 需要认证的路由布局 */
function AuthenticatedLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  return (
    <Layout className="app-layout">
      <Sidebar collapsed={collapsed} />
      <Layout>
        <HeaderBar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <Content className="app-content">
          <RouteErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageLoading />}>
              <MenuPermissionGuard>
              <Routes>
              <Route path="/" element={<Home />} />
              {/* 財務管理 */}
              <Route path="/account-balance" element={<AccountBalance />} />
              <Route path="/recharge-add" element={<RechargeAdd />} />
              <Route path="/transfer-add" element={<TransferAdd />} />
              <Route path="/deduct-add" element={<DeductAdd />} />
              <Route path="/merge-add" element={<MergeAdd />} />
              <Route path="/batch-query" element={<BatchQuery />} />
              <Route path="/batch-detail" element={<BatchDetail />} />
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

              {/* 集團人事 */}
              <Route path="/employee-management" element={<EmployeeManagement />} />
              <Route path="/organization-management" element={<OrganizationManagement />} />
              <Route path="/position-management" element={<PositionManagement />} />
              <Route path="/login-log" element={<LoginLog />} />
              <Route path="/role-management" element={<RoleManagement />} />
              <Route path="/function-permission" element={<FunctionPermission />} />
              <Route path="/data-permission" element={<DataPermission />} />
              {/* 商戶集團管理 */}
              <Route path="/merchant-group-list" element={<GroupList />} />
              <Route path="/store-list" element={<StoreList />} />
              {/* 商家推广工具 */}
              <Route path="/promotion-dashboard" element={<PromotionDashboard />} />
              <Route path="/promotion-algorithm" element={<PromotionAlgorithm />} />
              <Route path="/promotion-algorithm-add" element={<PromotionAlgorithmAdd />} />
              <Route path="/promotion-algorithm-flow" element={<PromotionAlgorithmFlow />} />
              <Route path="/promotion-slot-config" element={<PromotionSlotConfig />} />
              <Route path="/promotion-slot-config-add" element={<PromotionSlotConfigAdd />} />
              <Route path="/promotion-slot-config-slots" element={<PromotionSlotConfigSlots />} />
              <Route path="/promotion-waterfall" element={<PromotionWaterfall />} />
              <Route path="/promotion-waterfall1" element={<PromotionWaterfall />} />
              <Route path="/promotion-waterfall-add" element={<PromotionWaterfallAdd />} />
              <Route path="/promotion-sales-config" element={<PromotionSalesConfig />} />
              <Route path="/ad-sales" element={<AdSales />} />
              <Route path="/promotion-word-library" element={<PromotionWordLibrary />} />
              <Route path="/promotion-order-manage" element={<PromotionOrderManageStandalone />} />
              <Route path="/order-detail" element={<OrderDetail />} />
              <Route path="/merchant-order-manage" element={<PromotionOrderManage />} />
              {/* 赠送管理 */}
              <Route path="/gift-detail" element={<GiftDetail />} />
              <Route path="/gift-add" element={<GiftAdd />} />
              <Route path="/gift-detail-view" element={<GiftDetailView />} />
              <Route path="/gift-consume-detail" element={<GiftConsumeDetail />} />
              {/* 推广通 - 報表分析 */}
              <Route path="/promotion-report-overview" element={<PromotionReportOverview />} />
              <Route path="/promotion-report-order" element={<PromotionReportOrder />} />
              <Route path="/promotion-report-compare" element={<PromotionReportCompare />} />
              {/* 團購管理 */}
              <Route path="/group-purchase-dashboard" element={<GroupPurchaseDashboard />} />
              <Route path="/flash-sale-register" element={<FlashSaleRegister />} />
              <Route path="/flash-sale-stats" element={<FlashSaleStats />} />
              <Route path="/flash-sale-price" element={<FlashSalePrice />} />
              {/* 地圖規劃 */}
              <Route path="/map-planning" element={<MapPlanning />} />
              {/* 系統配置 */}
              <Route path="/menu-config" element={<MenuConfig />} />
              <Route path="/translation-manage" element={<TranslationManage />} />
              <Route path="/rule-config" element={<RuleConfig />} />
              {/* 審批流程配置 */}
              <Route path="/workflow-config" element={<WorkflowConfig />} />
              <Route path="/workflow-config/detail/:id" element={<WorkflowDetail />} />
              <Route path="/workflow-config/:id" element={<WorkflowEditor />} />
              {/* 页面说明编辑 */}
              <Route path="/page-description-editor" element={<PageDescriptionEditor />} />
              {/* PRD需求查看 */}
              <Route path="/page-prd-view" element={<PagePRDView />} />
              {/* 默认回首页 */}
              <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </MenuPermissionGuard>
            </Suspense>
          </RouteErrorBoundary>
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
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  )
}

export default App