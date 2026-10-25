import { useState, useEffect, Suspense, lazy } from 'react'
import { Layout, Spin, Modal } from 'antd'
import { createHashRouter, RouterProvider, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ensureLanguageBundle, getSavedLanguage } from './i18n'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { MenuProvider } from './contexts/MenuContext'
import { CompanyBrandProvider } from './contexts/CompanyBrandContext'
import { UnsavedChangesProvider, UnsavedNavigationGuard } from './contexts/UnsavedChangesContext'
import Sidebar from './components/Sidebar'
import HeaderBar from './components/HeaderBar'
import MenuTabs from './components/MenuTabs'
import PortalTopBar from './components/PortalTopBar'
import PetMascot from './components/PetMascot'
import Login from './pages/Login'
import RouteErrorBoundary from './components/RouteErrorBoundary'
import MenuPermissionGuard from './components/MenuPermissionGuard'
import ForcePasswordChangeGate from './components/ForcePasswordChangeGate'
import VersionUpdateNotification from './components/VersionUpdateNotification'
import useVersionCheck from './hooks/useVersionCheck'
import './App.css'

/* 懶加载所有页面组件，避免启动时一次性加载所有模块 */
const Home = lazy(() => import('./pages/Home'))
const Portal = lazy(() => import('./pages/Portal'))
const AppPreview = lazy(() => import('./pages/AppPreview'))
// HCM 階段 B 界面預覽：十系統骨架，未接通後端，只能靠網址進入（不進菜單）
const HcmBlueprint = lazy(() => import('./pages/HcmBlueprint'))
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
const ConsumeRisk = lazy(() => import('./pages/ConsumeRisk'))
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
const EmployeeDetail = lazy(() => import('./pages/Permission/Employee/EmployeeDetail'))
const HcmOrgLegalEntityList = lazy(() => import('./pages/Hcm/Organization/LegalEntityList'))
const HcmOrgLegalEntityForm = lazy(() => import('./pages/Hcm/Organization/LegalEntityForm'))
const HcmOrgUnitList = lazy(() => import('./pages/Hcm/Organization/UnitList'))
const HcmOrgUnitForm = lazy(() => import('./pages/Hcm/Organization/UnitForm'))
const HcmOrgJobFamilyList = lazy(() => import('./pages/Hcm/Organization/JobFamilyList'))
const HcmOrgJobFamilyForm = lazy(() => import('./pages/Hcm/Organization/JobFamilyForm'))
const HcmOrgJobGradeList = lazy(() => import('./pages/Hcm/Organization/JobGradeList'))
const HcmOrgJobGradeForm = lazy(() => import('./pages/Hcm/Organization/JobGradeForm'))
const HcmOrgPositionList = lazy(() => import('./pages/Hcm/Organization/PositionList'))
const HcmOrgPositionForm = lazy(() => import('./pages/Hcm/Organization/PositionForm'))
// C3 人員主檔（hr 域，菜单 hcm-person）
const HcmPersonList = lazy(() => import('./pages/Hcm/Person/PersonList'))
const HcmPersonForm = lazy(() => import('./pages/Hcm/Person/PersonForm'))
const HcmEmploymentForm = lazy(() => import('./pages/Hcm/Person/EmploymentForm'))
const HcmAssignmentForm = lazy(() => import('./pages/Hcm/Person/AssignmentForm'))
const HcmProfileItemForm = lazy(() => import('./pages/Hcm/Person/ProfileItemForm'))
const OrganizationManagement = lazy(() => import('./pages/Permission/Organization'))
const PositionManagement = lazy(() => import('./pages/Permission/Position'))
const HrDictManagement = lazy(() => import('./pages/Permission/HrDict'))
const HrDictForm = lazy(() => import('./pages/Permission/HrDict/HrDictForm'))
// 入轉調離（入職/轉正/調動/離職）：列表+表單+詳情
const HrLifecycle = lazy(() => import('./pages/Permission/HrLifecycle'))
const LifecycleForm = lazy(() => import('./pages/Permission/HrLifecycle/LifecycleForm'))
const LifecycleDetail = lazy(() => import('./pages/Permission/HrLifecycle/LifecycleDetail'))
const HrFlowDetail = lazy(() => import('./pages/Permission/HrLifecycle/HrFlowDetail'))
// 請假管理 / 假期額度
const LeaveList = lazy(() => import('./pages/Permission/HrLeave/LeaveList'))
const LeaveForm = lazy(() => import('./pages/Permission/HrLeave/LeaveForm'))
const LeaveDetail = lazy(() => import('./pages/Permission/HrLeave/LeaveDetail'))
const LeaveQuotaList = lazy(() => import('./pages/Permission/HrLeave/LeaveQuotaList'))
// 員工自助（ESS）：复用请假组件（作用域注入）+ 自助专属只读页
const EssMyLeave = lazy(() => import('./pages/Ess/MyLeave'))
const EssLeaveForm = lazy(() => import('./pages/Ess/EssLeaveForm'))
const EssLeaveDetail = lazy(() => import('./pages/Ess/EssLeaveDetail'))
const EssCertificateList = lazy(() => import('./pages/Ess/CertificateList'))
const EssCertificateForm = lazy(() => import('./pages/Ess/CertificateForm'))
const EssCertificateDetail = lazy(() => import('./pages/Ess/CertificateDetail'))
// 證明開具·人事台账（跨员工查看 + 开具登记）
const CertLedger = lazy(() => import('./pages/Permission/HrCertificate/LedgerList'))
const CertIssueForm = lazy(() => import('./pages/Permission/HrCertificate/IssueForm'))
// 績效考核（P1）：周期與計劃 / 評分工作台 / 校準與確認 / 員工自助我的績效
const PerfCycleList = lazy(() => import('./pages/Performance/CycleList'))
const PerfPlanList = lazy(() => import('./pages/Performance/PlanList'))
const PerfTemplateList = lazy(() => import('./pages/Performance/TemplateList'))
const PerfPlanForm = lazy(() => import('./pages/Performance/PlanForm'))
const PerfPlanDetail = lazy(() => import('./pages/Performance/PlanDetail'))
const PerfWorkbench = lazy(() => import('./pages/Performance/Workbench'))
const PerfCalibration = lazy(() => import('./pages/Performance/Calibration'))
const EssMyPerformance = lazy(() => import('./pages/Ess/MyPerformance'))
const PerfLedger = lazy(() => import('./pages/PerfReport/Ledger'))
const PerfAuditTrail = lazy(() => import('./pages/PerfReport/AuditTrail'))
const PerfAppeals = lazy(() => import('./pages/PerfReport/Appeals'))
const EssMyRequests = lazy(() => import('./pages/Ess/MyRequests'))
const EssMyProfile = lazy(() => import('./pages/Ess/MyProfile'))
const LeaveQuotaForm = lazy(() => import('./pages/Permission/HrLeave/LeaveQuotaForm'))
const ContractLedger = lazy(() => import('./pages/Permission/ContractLedger'))
// 考勤假勤系统（独立门户入口，阶段一：前端界面 + 模块内 mock）
const AttendanceWorkbench = lazy(() => import('./pages/Attendance/Workbench'))
const AttendanceGroupList = lazy(() => import('./pages/Attendance/GroupList'))
const AttendanceGroupForm = lazy(() => import('./pages/Attendance/GroupForm'))
const AttendanceSchedule = lazy(() => import('./pages/Attendance/Schedule'))
const AttendancePunchList = lazy(() => import('./pages/Attendance/PunchList'))
const AttendanceExceptionList = lazy(() => import('./pages/Attendance/ExceptionList'))
const AttendanceExceptionHandle = lazy(() => import('./pages/Attendance/ExceptionHandle'))
const AttendanceShiftList = lazy(() => import('./pages/Attendance/ShiftList'))
const AttendanceShiftForm = lazy(() => import('./pages/Attendance/ShiftForm'))
const AttendanceHolidayList = lazy(() => import('./pages/Attendance/HolidayList'))
const AttendanceHolidayForm = lazy(() => import('./pages/Attendance/HolidayForm'))
const AttendanceDailyReport = lazy(() => import('./pages/Attendance/DailyReport'))
const AttendanceMonthlyReport = lazy(() => import('./pages/Attendance/MonthlyReport'))
const AttendanceSetting = lazy(() => import('./pages/Attendance/Setting'))
const LoginLog = lazy(() => import('./pages/LoginLog'))
const RoleManagement = lazy(() => import('./pages/Permission/RoleManagement'))
const AuthorizationCenter = lazy(() => import('./pages/Permission/AuthorizationCenter'))
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
// 流量沙盤
const WaterfallSimulation = lazy(() => import('./pages/TrafficSandbox/WaterfallSimulation'))
const AlgorithmSimulation = lazy(() => import('./pages/TrafficSandbox/AlgorithmSimulation'))
const MerchantScoreInsight = lazy(() => import('./pages/TrafficSandbox/MerchantScoreInsight'))
const MerchantPromotionDiagnose = lazy(() => import('./pages/TrafficSandbox/MerchantPromotionDiagnose'))
const PromotionOrderManageStandalone = lazy(() => import('./pages/PromotionOrderManageStandalone'))
const OrderDetail = lazy(() => import('./pages/OrderDetail'))
// 商戶集團管理
const GroupList = lazy(() => import('./pages/MerchantGroup/GroupList'))
const StoreList = lazy(() => import('./pages/MerchantGroup/StoreList'))
const StoreDataConfig = lazy(() => import('./pages/MerchantGroup/StoreDataConfig'))
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
const MenuAdvancedForm = lazy(() => import('./pages/MenuConfig/MenuAdvancedForm'))
const TranslationManage = lazy(() => import('./pages/TranslationManage'))
// 多语言管理（i18n-center 独立模块）
const I18nWorkbench = lazy(() => import('./pages/I18nCenter/Workbench'))
const I18nLanguageConfig = lazy(() => import('./pages/I18nCenter/LanguageConfig'))
const I18nImportExport = lazy(() => import('./pages/I18nCenter/ImportExport'))
const I18nMtEngineConfig = lazy(() => import('./pages/I18nCenter/MtEngineConfig'))
const I18nDashboard = lazy(() => import('./pages/I18nCenter/Dashboard'))
const RuleConfig = lazy(() => import('./pages/RuleConfig'))
const RuleGroupPage = lazy(() => import('./pages/RuleConfig/RuleGroupPage'))
const NotificationConfig = lazy(() => import('./pages/NotificationConfig'))
const NotificationChannelForm = lazy(() => import('./pages/NotificationChannelForm'))
const NotificationAppForm = lazy(() => import('./pages/NotificationConfig/EnterpriseAppConfig'))
const NotificationScenarioForm = lazy(() => import('./pages/NotificationConfig/NotificationScenarioForm'))
const VersionHistoryPage = lazy(() => import('./pages/VersionHistory'))
const VersionHistoryDetailPage = lazy(() => import('./pages/VersionHistory/VersionHistoryDetail'))
const VersionHistoryFormPage = lazy(() => import('./pages/VersionHistory/VersionHistoryForm'))
// AI 智能中心（拆分后）
const AiModelProvider = lazy(() => import('./pages/AiModelProvider'))
const AiModelList = lazy(() => import('./pages/AiModelList'))
const AiModelEdit = lazy(() => import('./pages/AiModelList/AiModelEdit'))
const AiModelDetail = lazy(() => import('./pages/AiModelList/AiModelDetail'))
// AI 配額与策略管理 - 子菜单（独立页面）
import AiDeptModelAuth from './pages/AiQuotaAuth/QuotaAndPolicy'
import AiEmployeeAuthControl from './pages/AiQuotaAuth/AiEmployeeAuthControl'
import EmpQuotaList from './pages/AiQuotaAuth/empQuota/EmpQuotaList'
const DeptAuthGroupEdit = lazy(() => import('./pages/AiQuotaAuth/DeptAuthGroupEdit'))
const DeptAuthGroupDetail = lazy(() => import('./pages/AiQuotaAuth/DeptAuthGroupDetail'))
// 部门额度 - 独立编辑页与详情页（列表 → 新增/编辑 → 详情，参考部门模型权控）
const DeptQuotaEdit = lazy(() => import('./pages/AiQuotaAuth/deptQuota/DeptQuotaEdit'))
const DeptQuotaDetail = lazy(() => import('./pages/AiQuotaAuth/deptQuota/DeptQuotaDetail'))
/** 部门额度列表：走真实 /api/ai/dept-quota，与上方 edit/detail 同一代实现 */
const AiDeptQuotaList = lazy(() => import('./pages/AiQuotaAuth/deptQuota/AiDeptQuotaList'))
// 员工模型权控 - 按职位/角色授权的独立编辑页与详情页
const EmpPosAuthEdit = lazy(() => import('./pages/AiQuotaAuth/empAuth/EmpPosAuthEdit'))
const EmpPosAuthDetail = lazy(() => import('./pages/AiQuotaAuth/empAuth/EmpPosAuthDetail'))
const EmpRoleAuthEdit = lazy(() => import('./pages/AiQuotaAuth/empAuth/EmpRoleAuthEdit'))
const EmpRoleAuthDetail = lazy(() => import('./pages/AiQuotaAuth/empAuth/EmpRoleAuthDetail'))
// 员工额度 - 独立编辑页与详情页（列表 → 新增/编辑 → 详情，参考部门额度）
const EmpQuotaEdit = lazy(() => import('./pages/AiQuotaAuth/empQuota/EmpQuotaEdit'))
/** 員工專屬額度（ai_quota_config，按人定向配額）新增/編輯頁 */
const DirectQuotaEdit = lazy(() => import('./pages/AiQuotaAuth/empQuota/DirectQuotaEdit'))
const EmpQuotaDetail = lazy(() => import('./pages/AiQuotaAuth/empQuota/EmpQuotaDetail'))
const RoleQuotaEdit = lazy(() => import('./pages/AiQuotaAuth/empQuota/RoleQuotaEdit'))
const RoleQuotaDetail = lazy(() => import('./pages/AiQuotaAuth/empQuota/RoleQuotaDetail'))
const AiOperationAuth = lazy(() => import('./pages/AiOperationAuth'))
const AiAssistantConfig = lazy(() => import('./pages/AiAssistantConfig'))
const AiAssistantOverview = lazy(() => import('./pages/AiAssistant/OverviewPage'))
const AiAssistantCapability = lazy(() => import('./pages/AiAssistant/CapabilityPage'))
const AiAssistantProfile = lazy(() => import('./pages/AiAssistant/ProfilePage'))
const AiAssistantGlossary = lazy(() => import('./pages/AiAssistant/GlossaryPage'))
const AiAssistantKnowledge = lazy(() => import('./pages/AiAssistant/KnowledgePage'))
const AiAssistantGuardrail = lazy(() => import('./pages/AiAssistant/GuardrailPage'))
const AiAssistantFeedback = lazy(() => import('./pages/AiAssistant/FeedbackPage'))
const AiAssistantAudit = lazy(() => import('./pages/AiAssistant/AuditPage'))
const AiAssistantQuickPrompt = lazy(() => import('./pages/AiAssistant/QuickPromptPage'))
const AiAssistantPushTemplate = lazy(() => import('./pages/AiAssistant/PushTemplatePage'))
const AiAssistantMemory = lazy(() => import('./pages/AiAssistant/MemoryPolicyPage'))
const AiOperationAuthEdit = lazy(() => import('./pages/AiOperationAuth/AiOperationAuthEdit'))
const AiOperationAuthLog = lazy(() => import('./pages/AiOperationAuth/AiOperationAuthLog'))
const AiUsageStats = lazy(() => import('./pages/AiUsageStats'))
const AiEnergyDetail = lazy(() => import('./pages/AiEnergyDetail'))
const AiConversationAudit = lazy(() => import('./pages/AiConversationAudit'))
const AiConversationAuditDetail = lazy(() => import('./pages/AiConversationAudit/Detail'))
// AI 使用申請
const AiAccessApply = lazy(() => import('./pages/AiAccessApply'))
const McpService = lazy(() => import('./pages/McpService'))
// 員工AI權額管理
const AiEmpPermission = lazy(() => import('./pages/AiEmpPermission'))
const AiEmpPermissionDetail = lazy(() => import('./pages/AiEmpPermission/AiEmpPermissionDetail'))
// OA中心
const OaRequests = lazy(() => import('./pages/OACenter/OaRequests'))
const ProcessCenter = lazy(() => import('./pages/OACenter/ProcessCenter'))
const OaPurchaseRequest = lazy(() => import('./pages/OACenter/OaPurchaseRequest'))
// 系統權限申請：門戶「我要申請」的落地頁。刻意不登記為受控菜單路由（不入
// ROUTE_MENU_KEY_MAP / CONTROLLED_MENU_KEYS）：使用者正是「對所申請系統沒有任何權限」的員工，
// 掛上菜單權限會讓門戶的「我要申請」變成 403 死鏈。補償控制在後端（申請人只取登錄態、
// 系統/菜單/憑證全部服務端校驗、提交只產生待審批單據而不改任何權限）。
const SystemAccessApply = lazy(() => import('./pages/OACenter/SystemAccessApply'))
// 物資管理（EAM 完整子菜單）
const AssetList = lazy(() => import('./pages/AssetManagement/AssetList'))
const AssetAdd = lazy(() => import('./pages/AssetManagement/AssetAdd'))
const AssetDetail = lazy(() => import('./pages/AssetManagement/AssetDetail'))
const AssetScrap = lazy(() => import('./pages/AssetManagement/AssetScrap'))
const AssetRepair = lazy(() => import('./pages/AssetManagement/AssetRepair'))
const AssetLoss = lazy(() => import('./pages/AssetManagement/AssetLoss'))
const AssetTransfer = lazy(() => import('./pages/AssetManagement/AssetTransfer'))
const TransferDetail = lazy(() => import('./pages/AssetManagement/AssetTransfer/TransferDetail'))
const TransferCancel = lazy(() => import('./pages/AssetManagement/AssetTransfer/TransferCancel'))
const AssetInventory = lazy(() => import('./pages/AssetManagement/AssetInventory'))
const AssetCompensation = lazy(() => import('./pages/AssetManagement/AssetCompensation'))
const AssetDashboard = lazy(() => import('./pages/AssetManagement/AssetDashboard'))
// EAM 基礎數據
const AssetCategory = lazy(() => import('./pages/AssetManagement/AssetCategory'))
const AssetModel = lazy(() => import('./pages/AssetManagement/AssetModel'))
const AssetLocation = lazy(() => import('./pages/AssetManagement/AssetLocation'))
const ParamLibrary = lazy(() => import('./pages/AssetManagement/ParamLibrary'))
const AssetSupplier = lazy(() => import('./pages/AssetManagement/AssetSupplier'))
const AssetTag = lazy(() => import('./pages/AssetManagement/AssetTag'))
const AssetTagPrint = lazy(() => import('./pages/AssetManagement/AssetTagPrint'))
// 耗材管理（消耗品/MRO）
const ConsumableDashboard = lazy(() => import('./pages/Consumable/Dashboard'))
const ConsumableItem = lazy(() => import('./pages/Consumable/Item'))
const ConsumableClaim = lazy(() => import('./pages/Consumable/Claim'))
const ConsumableStock = lazy(() => import('./pages/Consumable/Stock'))
const ConsumableStockTxn = lazy(() => import('./pages/Consumable/Stock/StockTxnDetail'))
const ConsumableStockTxnList = lazy(() => import('./pages/Consumable/Stock/StockTxnList'))
const ConsumableAlert = lazy(() => import('./pages/Consumable/Alert'))
const ConsumableInbound = lazy(() => import('./pages/Consumable/Inbound'))
const ConsumableReport = lazy(() => import('./pages/Consumable/Report'))
// EAM 採購入庫
const PurchaseOrder = lazy(() => import('./pages/AssetManagement/PurchaseOrder'))
const AssetInbound = lazy(() => import('./pages/AssetManagement/AssetInbound'))
// EAM 領用借用
const AssetClaim = lazy(() => import('./pages/AssetManagement/AssetClaim'))
const AssetBorrow = lazy(() => import('./pages/AssetManagement/AssetBorrow'))
const AssetReturn = lazy(() => import('./pages/AssetManagement/AssetReturn'))
// 員工個人資產入口
const MyAssets = lazy(() => import('./pages/MyAssets'))
const MyClaims = lazy(() => import('./pages/AssetManagement/AssetClaim/MyClaims'))
// EAM 調撥交接
const AssetTransferList = lazy(() => import('./pages/AssetManagement/AssetTransferList'))
const AssetHandover = lazy(() => import('./pages/AssetManagement/AssetHandover'))
// EAM 變更歷史
const AssetFlow = lazy(() => import('./pages/AssetManagement/AssetFlow'))
// 用車管理（階段 A 前端原型，歸屬 OA 系統，數據為記憶體演示）
const VehicleFiles = lazy(() => import('./pages/VehicleManagement/VehicleFiles'))
const MyVehicleUse = lazy(() => import('./pages/VehicleManagement/MyVehicleUse'))
const VehicleDispatch = lazy(() => import('./pages/VehicleManagement/VehicleDispatch'))
const VehicleLedger = lazy(() => import('./pages/VehicleManagement/VehicleLedger'))
const VehicleMasterData = lazy(() => import('./pages/VehicleManagement/VehicleMasterData'))
// 会议管理系统（meeting）：会议室档案 / 忙闲预约 / 我的会议 / 预约记录 / 会议详情
const MyMeeting = lazy(() => import('./pages/MeetingManagement/MyMeeting'))
const RoomBooking = lazy(() => import('./pages/MeetingManagement/RoomBooking'))
const RoomFiles = lazy(() => import('./pages/MeetingManagement/RoomFiles'))
const BookingRecords = lazy(() => import('./pages/MeetingManagement/BookingRecords'))
const MeetingDetail = lazy(() => import('./pages/MeetingManagement/MeetingDetail'))
const MeetingConfig = lazy(() => import('./pages/MeetingManagement/MeetingConfig'))
// 会议新增/编辑独立页（§9.1 禁止用弹窗承载表单）：不是菜单项，但必须显式注册，路由守卫按精确路径校验
const MeetingRoomForm = lazy(() => import('./pages/MeetingManagement/RoomFiles/MeetingRoomForm'))
const MeetingBookingForm = lazy(() => import('./pages/MeetingManagement/RoomBooking/MeetingBookingForm'))
const MeetingBlacklistForm = lazy(() => import('./pages/MeetingManagement/MeetingConfig/MeetingBlacklistForm'))
// 会议纪要：录入/编辑页与站内只读查看页都不是菜单项（从会议列表、详情页与钉钉卡片跳进来），
// 但必须显式注册：路由守卫按精确路径校验
const MeetingMinutesForm = lazy(() => import('./pages/MeetingManagement/MeetingMinutes/MinutesForm'))
const MeetingMinutesView = lazy(() => import('./pages/MeetingManagement/MeetingMinutes/MinutesView'))
// 免登签到页（扫码直达，公开路由，不套后台布局）
const MeetingCheckin = lazy(() => import('./pages/MeetingCheckin'))
// 纪要免登查看页（钉钉卡片直达，凭 HMAC 令牌鉴权，同样不套后台布局）
const MeetingMinutesPage = lazy(() => import('./pages/MeetingMinutesView'))
const MeetingMinutesAdmin = lazy(() => import('./pages/MeetingMinutesAdmin'))
const NotificationTemplateConfig = lazy(() => import('./pages/NotificationTemplate'))
const NotificationSwitchConfig = lazy(() => import('./pages/NotificationSwitch'))
// 資產標籤移動端 H5（公開頁面，掃碼直達，不含後台佈局）
const AssetTagView = lazy(() => import('./pages/AssetTagView'))
// 資產領用簽署頁（釘釘工作通知直達，令牌免登，不含後台佈局）
const AssetClaimSign = lazy(() => import('./pages/AssetClaimSign'))
// 審批流程配置
const WorkflowConfig = lazy(() => import('./pages/WorkflowConfig'))
const WorkflowEditor = lazy(() => import('./pages/WorkflowConfig/WorkflowEditor'))
const WorkflowDetail = lazy(() => import('./pages/WorkflowConfig/WorkflowDetail'))

// 產研交付（RDM）：需求全生命周期管理
const RdmWorkbench = lazy(() => import('./pages/Rdm/Workbench'))
const RdmRequirementSubmit = lazy(() => import('./pages/Rdm/RequirementSubmit'))
const RdmRequirementList = lazy(() => import('./pages/Rdm/RequirementList'))
const RdmRequirementPool = lazy(() => import('./pages/Rdm/RequirementPool'))
const RdmRequirementIntake = lazy(() => import('./pages/Rdm/RequirementIntake'))
const RdmRequirementDetail = lazy(() => import('./pages/Rdm/RequirementDetail'))
const RdmDeliveryBoard = lazy(() => import('./pages/Rdm/DeliveryBoard'))
const RdmTaskForm = lazy(() => import('./pages/Rdm/TaskForm'))
const RdmRequirementGantt = lazy(() => import('./pages/Rdm/RequirementGantt'))
const RdmAssignPm = lazy(() => import('./pages/Rdm/AssignPm'))
const RdmIterationPlan = lazy(() => import('./pages/Rdm/IterationPlan'))
const RdmIterationForm = lazy(() => import('./pages/Rdm/IterationForm'))
const RdmPrdForm = lazy(() => import('./pages/Rdm/PrdForm'))
const RdmReviewForm = lazy(() => import('./pages/Rdm/ReviewForm'))
const RdmChangeForm = lazy(() => import('./pages/Rdm/ChangeForm'))
/** 阶段 3：五节点计划与基线冻结（一屏要录 5×4 套时间，所以是独立页） */
const RdmMilestonePlan = lazy(() => import('./pages/Rdm/MilestonePlan'))
const RdmQualityBoard = lazy(() => import('./pages/Rdm/QualityBoard'))
const RdmVersionTrace = lazy(() => import('./pages/Rdm/VersionTrace'))
const RdmWeeklyReport = lazy(() => import('./pages/Rdm/WeeklyReport'))
const RdmScoreBoard = lazy(() => import('./pages/Rdm/ScoreBoard'))
const RdmScoreBudgetForm = lazy(() => import('./pages/Rdm/ScoreBudgetForm'))
const RdmMetricTrend = lazy(() => import('./pages/Rdm/MetricTrend'))
const RdmScoreRuleConfig = lazy(() => import('./pages/Rdm/Config/ScoreRuleConfig'))
const RdmAcceptanceList = lazy(() => import('./pages/Rdm/AcceptanceList'))
const RdmAcceptanceForm = lazy(() => import('./pages/Rdm/AcceptanceForm'))
const RdmDashboard = lazy(() => import('./pages/Rdm/Dashboard'))
const RdmRiskCenter = lazy(() => import('./pages/Rdm/RiskCenter'))
const RdmTeamOutput = lazy(() => import('./pages/Rdm/TeamOutput'))
const RdmResourceLoad = lazy(() => import('./pages/Rdm/ResourceLoad'))
const RdmConfigStatus = lazy(() => import('./pages/Rdm/Config/StatusConfig'))
const RdmTaskTypeConfig = lazy(() => import('./pages/Rdm/Config/TaskTypeConfig'))
const RdmTaskTypeConfigForm = lazy(() => import('./pages/Rdm/Config/TaskTypeConfigForm'))
const RdmConfigRouting = lazy(() => import('./pages/Rdm/Config/RoutingConfig'))
const RdmConfigRoutingForm = lazy(() => import('./pages/Rdm/Config/RoutingConfigForm'))
const RdmConfigSla = lazy(() => import('./pages/Rdm/Config/SlaConfig'))
// 進度日報（一级菜单）：推送配置 / 模板配置 / 发送记录 / 手动触发 四个二级页
const DailyReportRules = lazy(() => import('./pages/Rdm/DailyReport/Rules'))
const DailyReportRuleForm = lazy(() => import('./pages/Rdm/DailyReport/RuleForm'))
const DailyReportTemplates = lazy(() => import('./pages/Rdm/DailyReport/Templates'))
const DailyReportTemplateForm = lazy(() => import('./pages/Rdm/DailyReport/TemplateForm'))
const DailyReportBuiltinTemplate = lazy(() => import('./pages/Rdm/DailyReport/BuiltinTemplateDetail'))
const DailyReportRecords = lazy(() => import('./pages/Rdm/DailyReport/Records'))
const DailyReportTrigger = lazy(() => import('./pages/Rdm/DailyReport/Trigger'))
// 移動端日報頁：釘釘通知連結的落地頁，無獨立菜單
const RdmDailyReport = lazy(() => import('./pages/Rdm/DailyReport'))
// 进度日报看板（开放页）：推送链接的新落地页，凭 HMAC 令牌免登，不套后台布局
const RdmDailyReportView = lazy(() => import('./pages/RdmDailyReportView'))
// V3 分批交付：项目总览 / 提测工作台 / 发布中心
const RdmProjectOverview = lazy(() => import('./pages/Rdm/ProjectOverview'))
const RdmProjectDetail = lazy(() => import('./pages/Rdm/ProjectDetail'))
const RdmTestWorkbench = lazy(() => import('./pages/Rdm/TestWorkbench'))
const RdmTestBatchSubmit = lazy(() => import('./pages/Rdm/TestBatchSubmit'))
const RdmTestBatchDetail = lazy(() => import('./pages/Rdm/TestBatchDetail'))
const RdmReleaseCenter = lazy(() => import('./pages/Rdm/ReleaseCenter'))
const RdmReleaseBatchCreate = lazy(() => import('./pages/Rdm/ReleaseBatchCreate'))
const RdmReleaseBatchDetail = lazy(() => import('./pages/Rdm/ReleaseBatchDetail'))
const RdmDeliveryItemForm = lazy(() => import('./pages/Rdm/DeliveryItemForm'))
const RdmIssueDetail = lazy(() => import('./pages/Rdm/IssueDetail'))
// V3 存量安全遷移 / 灰度管理（接項目總覽的既有入口，不新增導航中心）
const RdmStockMigration = lazy(() => import('./pages/Rdm/StockMigration'))
const RdmGrayscaleConfig = lazy(() => import('./pages/Rdm/GrayscaleConfig'))

// 文檔中心（階段二：真實 /api/doc/**；菜單種子已由 DocSchemaMigrationInitializer 落庫）
const DocCenter = lazy(() => import('./pages/DocCenter'))
const DocSpaceManage = lazy(() => import('./pages/DocCenter/DocSpaceManage'))
const DocSpaceForm = lazy(() => import('./pages/DocCenter/DocSpaceForm'))
const DocStats = lazy(() => import('./pages/DocCenter/DocStats'))
const DocLearning = lazy(() => import('./pages/DocCenter/DocLearning'))
const DocLearningDetail = lazy(() => import('./pages/DocCenter/DocLearningDetail'))
const DocLearningForm = lazy(() => import('./pages/DocCenter/DocLearningForm'))

const { Content } = Layout

/** 页面加载中指示器 */
function PageLoading() {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 300 }}>
      <Spin size="large" tip={t('common.loading')}>
        <div style={{ width: 200, height: 80 }} />
      </Spin>
    </div>
  )
}

/** 需要认证的路由布局 */
function AuthenticatedLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const { updateAvailable, current: currentVersion, latest: latestVersion } = useVersionCheck()

  // 登錄態首次掛載（含刷新恢復）：按持久化語言拉取數據庫語言包，
  // 否則 ja/ko/ru 的動態翻譯（業務字段/菜單名）刷新後丟失回退英文
  useEffect(() => {
    void ensureLanguageBundle(getSavedLanguage())
  }, [])

  // HCM 階段 B 界面預覽：與 /app-preview 同級，走獨立全屏分支。
  // 為什麼不能掛進後台菜單：十系統此刻沒有 sys_system 行與 sys_menu 種子，
  // 進菜單會讓人誤以為已上線；本頁只做信息架構與原型評審。
  if (location.pathname === '/hcm-blueprint') {
    return (
      <RouteErrorBoundary key={location.pathname}>
        <Suspense fallback={<PageLoading />}>
          <HcmBlueprint />
        </Suspense>
      </RouteErrorBoundary>
    )
  }

  // 移动 APP 原型预览：/app-preview 全屏设备外壳，不注入 Sidebar / MenuTabs / PortalTopBar，
  // 与 /portal 同级；入口来自企业门户「移動 APP 體驗」。
  if (location.pathname === '/app-preview') {
    return (
      <RouteErrorBoundary key={location.pathname}>
        <Suspense fallback={<PageLoading />}>
          <AppPreview />
        </Suspense>
      </RouteErrorBoundary>
    )
  }

  // 统一门户 Round 2：/portal 作为应用入口，不注入 Sidebar / MenuTabs，
  // 避免默认业务菜单遮挡卡片；登录后默认落地。
  if (location.pathname === '/portal') {
    return (
      <Layout className="app-layout app-layout-portal">
        <Layout>
          <PortalTopBar />
          <Content className="app-content app-content-portal">
            <RouteErrorBoundary key={location.pathname}>
              <Suspense fallback={<PageLoading />}>
                <Portal />
              </Suspense>
            </RouteErrorBoundary>
          </Content>
        </Layout>
        <VersionUpdateNotification updateAvailable={updateAvailable} current={currentVersion} latest={latestVersion} />
      </Layout>
    )
  }

  return (
    <Layout className="app-layout">
      <Sidebar collapsed={collapsed} />
      <Layout>
        <HeaderBar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <MenuTabs />
        <Content className="app-content">
          <RouteErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageLoading />}>
              <MenuPermissionGuard>
              <Routes>
              <Route path="/" element={<Home />} />
              {/* 统一门户（阶段 B）：登录默认入口，无侧边栏不属任何业务系统；
                  实际渲染已提到 AuthenticatedLayout 分支内，此处仅保留占位避免旧链接 fallback 时落入 *“ → 首页”。 */}
              <Route path="/portal" element={<Portal />} />
              {/* 財務管理 */}
              <Route path="/account-balance" element={<AccountBalance />} />
              <Route path="/consume-risk" element={<ConsumeRisk />} />
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
              <Route path="/employee-detail" element={<EmployeeDetail />} />
              <Route path="/organization-management" element={<OrganizationManagement />} />
              {/* 組織編制系統（organization）：菜單真值由 HcmOrganizationMenuInitializer 寫入 sys_menu */}
              <Route path="/hcm-org-legal" element={<HcmOrgLegalEntityList />} />
              <Route path="/hcm-org-legal-form" element={<HcmOrgLegalEntityForm />} />
              <Route path="/hcm-org-legal-detail" element={<HcmOrgLegalEntityForm />} />
              <Route path="/hcm-org-unit" element={<HcmOrgUnitList />} />
              <Route path="/hcm-org-unit-form" element={<HcmOrgUnitForm />} />
              <Route path="/hcm-org-unit-detail" element={<HcmOrgUnitForm />} />
              <Route path="/hcm-org-job-family" element={<HcmOrgJobFamilyList />} />
              <Route path="/hcm-org-job-family-form" element={<HcmOrgJobFamilyForm />} />
              <Route path="/hcm-org-job-family-detail" element={<HcmOrgJobFamilyForm />} />
              <Route path="/hcm-org-job-grade" element={<HcmOrgJobGradeList />} />
              <Route path="/hcm-org-job-grade-form" element={<HcmOrgJobGradeForm />} />
              <Route path="/hcm-org-job-grade-detail" element={<HcmOrgJobGradeForm />} />
              <Route path="/hcm-org-position" element={<HcmOrgPositionList />} />
              <Route path="/hcm-org-position-form" element={<HcmOrgPositionForm />} />
              <Route path="/hcm-org-position-detail" element={<HcmOrgPositionForm />} />
              <Route path="/hcm-person" element={<HcmPersonList />} />
              <Route path="/hcm-person-form" element={<HcmPersonForm />} />
              <Route path="/hcm-person-detail" element={<HcmPersonForm />} />
              <Route path="/hcm-person-employment-form" element={<HcmEmploymentForm />} />
              <Route path="/hcm-person-assignment-form" element={<HcmAssignmentForm />} />
              <Route path="/hcm-person-profile-form" element={<HcmProfileItemForm />} />
              <Route path="/position-management" element={<PositionManagement />} />
              <Route path="/hr-dict" element={<HrDictManagement />} />
              <Route path="/hr-dict-edit" element={<HrDictForm />} />
              {/* 入轉調離：入職/轉正/調動/離職 */}
              <Route path="/hr-onboarding" element={<HrLifecycle type="onboard" />} />
              <Route path="/hr-onboarding-form" element={<LifecycleForm type="onboard" />} />
              <Route path="/hr-onboarding-detail" element={<LifecycleDetail />} />
              {/* 返聘单：不新增侧边栏菜单，路由挂在入職菜单的授权下（见 menuDataSource pathToKey） */}
              <Route path="/hr-rehire" element={<HrLifecycle type="rehire" />} />
              <Route path="/hr-rehire-form" element={<LifecycleForm type="rehire" />} />
              <Route path="/hr-rehire-detail" element={<LifecycleDetail />} />
              <Route path="/hr-regularization" element={<HrLifecycle type="regular" />} />
              <Route path="/hr-regularization-form" element={<LifecycleForm type="regular" />} />
              <Route path="/hr-regularization-detail" element={<LifecycleDetail />} />
              <Route path="/hr-transfer" element={<HrLifecycle type="transfer" />} />
              <Route path="/hr-transfer-form" element={<LifecycleForm type="transfer" />} />
              <Route path="/hr-transfer-detail" element={<LifecycleDetail />} />
              <Route path="/hr-dimission" element={<HrLifecycle type="dimission" />} />
              <Route path="/hr-dimission-form" element={<LifecycleForm type="dimission" />} />
              <Route path="/hr-dimission-detail" element={<LifecycleDetail />} />
              {/* HR 審批流程詳情（OA 引擎落地页，不綁菜单独权，由流程事項/单据详情进入） */}
              <Route path="/hr-flow-detail" element={<HrFlowDetail />} />
              {/* 請假管理與假期額度 */}
              <Route path="/hr-leave" element={<LeaveList />} />
              <Route path="/hr-leave-form" element={<LeaveForm />} />
              <Route path="/hr-leave-detail" element={<LeaveDetail />} />
              <Route path="/hr-leave-quota" element={<LeaveQuotaList />} />
              <Route path="/hr-leave-quota-form" element={<LeaveQuotaForm />} />
              {/* 員工自助：我的假期/我的申請單據/我的檔案（数据范围固定为登录人） */}
              <Route path="/ess-leave" element={<EssMyLeave />} />
              <Route path="/ess-leave-form" element={<EssLeaveForm />} />
              <Route path="/ess-leave-detail" element={<EssLeaveDetail />} />
              <Route path="/ess-requests" element={<EssMyRequests />} />
              <Route path="/ess-profile" element={<EssMyProfile />} />
              {/* 證明開具：员工自助申请，审批通过后由人事线下出具 */}
              <Route path="/ess-certificate" element={<EssCertificateList />} />
              <Route path="/ess-certificate-form" element={<EssCertificateForm />} />
              <Route path="/ess-certificate-detail" element={<EssCertificateDetail />} />
              {/* 證明開具台账（人事）：待开具队列与开具登记，需 hr-certificate 菜单 */}
              <Route path="/hr-certificate" element={<CertLedger />} />
              <Route path="/hr-certificate-issue" element={<CertIssueForm />} />
              <Route path="/hr-certificate-detail" element={<EssCertificateDetail ledgerMode />} />
              {/* 績效考核：週期與計劃同属 hr-perf-admin 菜单，计划表单/详情为其子页 */}
              <Route path="/hr-perf-cycle" element={<PerfCycleList />} />
              <Route path="/hr-perf-plan" element={<PerfPlanList />} />
              <Route path="/hr-perf-template" element={<PerfTemplateList />} />
              <Route path="/hr-perf-plan-form" element={<PerfPlanForm />} />
              <Route path="/hr-perf-plan-detail" element={<PerfPlanDetail />} />
              <Route path="/hr-perf-review" element={<PerfWorkbench />} />
              <Route path="/hr-perf-calibration" element={<PerfCalibration />} />
              <Route path="/ess-performance" element={<EssMyPerformance />} />
              {/* 績效台账（M2）：结果台账 / 改判留痕 / 申诉登记，各自独立授权 */}
              <Route path="/hr-perf-ledger" element={<PerfLedger />} />
              <Route path="/hr-perf-audit" element={<PerfAuditTrail />} />
              <Route path="/hr-perf-appeal" element={<PerfAppeals />} />
              {/* 合同續簽：复用入转调离引擎，授权归合同台账菜单 */}
              <Route path="/hr-contract-renew-form" element={<LifecycleForm type="renew" />} />
              <Route path="/hr-contract-renew-detail" element={<LifecycleDetail />} />
              <Route path="/contract-ledger" element={<ContractLedger />} />
              {/* 考勤假勤系统：考勤组/排班/打卡/异常，第二阶段会补 sys_menu 种子使其进入侧边栏 */}
              <Route path="/attendance-workbench" element={<AttendanceWorkbench />} />
              <Route path="/attendance-group" element={<AttendanceGroupList />} />
              <Route path="/attendance-group-form" element={<AttendanceGroupForm />} />
              <Route path="/attendance-group-detail" element={<AttendanceGroupForm />} />
              <Route path="/attendance-schedule" element={<AttendanceSchedule />} />
              <Route path="/attendance-punch" element={<AttendancePunchList />} />
              <Route path="/attendance-exception" element={<AttendanceExceptionList />} />
              <Route path="/attendance-exception-handle" element={<AttendanceExceptionHandle />} />
              {/* 假勤基础数据与报表：班次/节假日各自具详情与表单页，日报与月报为只读计算结果 */}
              <Route path="/attendance-shift" element={<AttendanceShiftList />} />
              <Route path="/attendance-shift-form" element={<AttendanceShiftForm />} />
              <Route path="/attendance-shift-detail" element={<AttendanceShiftForm />} />
              <Route path="/attendance-holiday" element={<AttendanceHolidayList />} />
              <Route path="/attendance-holiday-form" element={<AttendanceHolidayForm />} />
              <Route path="/attendance-holiday-detail" element={<AttendanceHolidayForm />} />
              <Route path="/attendance-daily" element={<AttendanceDailyReport />} />
              <Route path="/attendance-monthly" element={<AttendanceMonthlyReport />} />
              <Route path="/attendance-setting" element={<AttendanceSetting />} />
              <Route path="/login-log" element={<LoginLog />} />
              <Route path="/role-management" element={<RoleManagement />} />
              {/* 授權中心：合并旧「功能授權」/「系統授權」，旧路径重定向兼容存量入口 */}
              <Route path="/authorization-center" element={<AuthorizationCenter />} />
              <Route path="/function-permission" element={<Navigate to="/authorization-center" replace />} />
              <Route path="/system-authorization" element={<Navigate to="/authorization-center" replace />} />
              <Route path="/data-permission" element={<DataPermission />} />
              {/* 商戶集團管理 */}
              <Route path="/merchant-group-list" element={<GroupList />} />
              <Route path="/store-list" element={<StoreList />} />
              <Route path="/store-data-config" element={<StoreDataConfig />} />
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
              {/* 流量沙盤 */}
              <Route path="/waterfall-simulation" element={<WaterfallSimulation />} />
              <Route path="/algorithm-simulation" element={<AlgorithmSimulation />} />
              <Route path="/merchant-score-insight" element={<MerchantScoreInsight />} />
              <Route path="/merchant-promotion-diagnose" element={<MerchantPromotionDiagnose />} />
              <Route path="/promotion-order-manage" element={<PromotionOrderManageStandalone />} />
              <Route path="/order-detail" element={<OrderDetail />} />
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
              {/* 菜单结构变更（仅超管）：与日常的「改菜单名称」分离，避免误触改 Key 导致存量授权失效 */}
              <Route path="/menu-config/setting" element={<MenuAdvancedForm />} />
              <Route path="/translation-manage" element={<TranslationManage />} />
              {/* 多语言管理（i18n-center 独立模块） */}
              <Route path="/i18n-center/workbench" element={<I18nWorkbench />} />
              <Route path="/i18n-center/language" element={<I18nLanguageConfig />} />
              <Route path="/i18n-center/import-export" element={<I18nImportExport />} />
              <Route path="/i18n-center/mt-engine" element={<I18nMtEngineConfig />} />
              <Route path="/i18n-center/dashboard" element={<I18nDashboard />} />
              <Route path="/rule-config" element={<RuleConfig />} />
              {/* 規則中心 · 各版塊獨立維護頁 */}
              <Route path="/rule-center/ad-sales" element={<RuleGroupPage menuKey="rule-ad-sales" />} />
              <Route path="/rule-center/gift" element={<RuleGroupPage menuKey="rule-gift" />} />
              <Route path="/rule-center/security" element={<RuleGroupPage menuKey="rule-security" />} />
              <Route path="/rule-center/algorithm" element={<RuleGroupPage menuKey="rule-algorithm" />} />
              <Route path="/rule-center/seq" element={<RuleGroupPage menuKey="rule-seq" />} />
              <Route path="/notification-config" element={<NotificationConfig />} />
              <Route path="/notification-channel-form" element={<NotificationChannelForm />} />
              <Route path="/notification-app-form" element={<NotificationAppForm />} />
              <Route path="/notification-scenario-form" element={<NotificationScenarioForm />} />
              <Route path="/version-history" element={<VersionHistoryPage />} />
              <Route path="/version-history-add" element={<VersionHistoryFormPage />} />
              <Route path="/version-history-edit/:id" element={<VersionHistoryFormPage />} />
              <Route path="/version-history-detail/:id" element={<VersionHistoryDetailPage />} />
              // AI 智能中心（拆分后）
              <Route path="/ai-model-provider" element={<AiModelProvider />} />
              <Route path="/ai-model-list" element={<AiModelList />} />
                            <Route path="/ai-model-edit" element={<AiModelEdit />} />
                            <Route path="/ai-model-detail" element={<AiModelDetail />} />
              {/* AI 配額与策略管理 - 子菜单 */}
              <Route path="/ai-dept-model-auth" element={<AiDeptModelAuth />} />
              <Route path="/ai-emp-model-auth" element={<AiEmployeeAuthControl />} />
              {/* V0 §八 V0-6：旧职位权控列表页（基于 mock）已隐藏，历史链接重定向到员工模型权控真实页；
                  /ai-pos-auth-edit|-detail 仍由 AiEmployeeAuthControl 直接注入，保留不拆 */}
              <Route path="/ai-pos-auth" element={<Navigate to="/ai-emp-model-auth" replace />} />
              <Route path="/ai-dept-auth-edit" element={<DeptAuthGroupEdit />} />
              <Route path="/ai-dept-auth-detail" element={<DeptAuthGroupDetail />} />
              <Route path="/ai-pos-auth-edit" element={<EmpPosAuthEdit />} />
              <Route path="/ai-pos-auth-detail" element={<EmpPosAuthDetail />} />
              <Route path="/ai-role-auth-edit" element={<EmpRoleAuthEdit />} />
              <Route path="/ai-role-auth-detail" element={<EmpRoleAuthDetail />} />
              <Route path="/ai-dept-quota" element={<AiDeptQuotaList />} />
              <Route path="/ai-dept-quota-edit" element={<DeptQuotaEdit />} />
              <Route path="/ai-dept-quota-detail" element={<DeptQuotaDetail />} />
              <Route path="/ai-emp-quota" element={<EmpQuotaList />} />
                            <Route path="/ai-emp-quota-edit" element={<EmpQuotaEdit />} />
                            <Route path="/ai-emp-direct-quota-edit" element={<DirectQuotaEdit />} />
                            <Route path="/ai-emp-quota-detail" element={<EmpQuotaDetail />} />
                            <Route path="/ai-role-quota-edit" element={<RoleQuotaEdit />} />
                            <Route path="/ai-role-quota-detail" element={<RoleQuotaDetail />} />

              <Route path="/ai-operation-auth" element={<AiOperationAuth />} />
              <Route path="/ai-assistant" element={<AiAssistantOverview />} />
              <Route path="/ai-assistant/capability" element={<AiAssistantCapability />} />
              <Route path="/ai-assistant/profile" element={<AiAssistantProfile />} />
              <Route path="/ai-assistant/glossary" element={<AiAssistantGlossary />} />
              <Route path="/ai-assistant/knowledge" element={<AiAssistantKnowledge />} />
              <Route path="/ai-assistant/guardrail" element={<AiAssistantGuardrail />} />
              <Route path="/ai-assistant/feedback" element={<AiAssistantFeedback />} />
              <Route path="/ai-assistant/audit" element={<AiAssistantAudit />} />
              <Route path="/ai-assistant/quick-prompt" element={<AiAssistantQuickPrompt />} />
              <Route path="/ai-assistant/push-template" element={<AiAssistantPushTemplate />} />
              <Route path="/ai-assistant/memory" element={<AiAssistantMemory />} />
              {/* 旧入口保留重定向，避免历史收藏 404 */}
              <Route path="/ai-assistant-config" element={<AiAssistantConfig />} />
              <Route path="/ai-operation-auth-edit" element={<AiOperationAuthEdit />} />
              <Route path="/ai-operation-auth-log" element={<AiOperationAuthLog />} />
              <Route path="/ai-usage-stats" element={<AiUsageStats />} />
              <Route path="/ai-energy-detail" element={<AiEnergyDetail />} />
              {/* AI 使用申請 */}
              <Route path="/ai-access-apply" element={<AiAccessApply />} />
              <Route path="/ai-mcp-service" element={<McpService />} />
              <Route path="/ai-conversation-audit" element={<AiConversationAudit />} />
              <Route path="/ai-conversation-audit/:id" element={<AiConversationAuditDetail />} />
              {/* 員工AI權額管理 */}
              <Route path="/ai-emp-permission" element={<AiEmpPermission />} />
              <Route path="/ai-emp-permission-detail" element={<AiEmpPermissionDetail />} />
              {/* OA中心 */}
              <Route path="/oa-requests" element={<OaRequests />} />
              <Route path="/process-center" element={<ProcessCenter />} />
              <Route path="/oa-purchase-request" element={<OaPurchaseRequest />} />
              {/* 系統權限申請（門戶自助入口，僅需登錄態；見上方 lazy 聲明的例外說明） */}
              <Route path="/system-access-apply" element={<SystemAccessApply />} />
              {/* 產研交付（RDM）—— 需求全生命周期：提交→審批→分配→受理→研發→驗收→上線 */}
              <Route path="/rdm-workbench" element={<RdmWorkbench />} />
              <Route path="/rdm-submit" element={<RdmRequirementSubmit />} />
              <Route path="/rdm-requirement" element={<RdmRequirementList />} />
              {/* 需求池：分配与审批环节的总台（预选 pool 视角，带全量可见与分配权）；
                  产品需求处理/交付中需求已作为纯数据切片删除，旧地址保留重定向，
                  避免存量收藏、钉钉通知、已发出去的分享链接坏掉 */}
              <Route path="/rdm-intake" element={<RdmRequirementPool />} />
              {/* 提交需求（业务侧）：我的提交 + 待我審批；从需求池拆出，不携带分配权 */}
              <Route path="/rdm-intake-approval" element={<RdmRequirementIntake />} />
              {/* 需求查询已并回需求池（分配权必然蕴含可见权，不该拆成两个窄权限菜单） */}
              <Route path="/rdm-query" element={<Navigate to="/rdm-intake" replace />} />
              <Route path="/rdm-detail" element={<RdmRequirementDetail />} />
              <Route path="/rdm-product" element={<Navigate to="/rdm-requirement?scope=product" replace />} />
              <Route path="/rdm-delivery" element={<RdmDeliveryBoard />} />
              <Route path="/rdm-delivery-req" element={<Navigate to="/rdm-requirement?scope=delivery" replace />} />
              <Route path="/rdm-task" element={<RdmTaskForm />} />
              {/* 需求甘特图（阶段一预览）：不新增侧栏菜单，归属需求跟进清单，用 ?mode= 区分个人/单需求/全局 */}
              <Route path="/rdm-gantt" element={<RdmRequirementGantt />} />
              {/* 分配产品经理：独立页（取代需求池弹窗）。分配权现行锚点是 rdm-intake:edit，
                  菜单收敛后落到 rdm-requirement:dispatch（不是 :edit，那是需求侧受理权）；
                  过渡期两个锚点 OR 生效，口径以 RdmAccessGuard.canDispatch 为准 */}
              <Route path="/rdm-assign" element={<RdmAssignPm />} />
              <Route path="/rdm-iteration" element={<RdmIterationPlan />} />
              <Route path="/rdm-iteration-form" element={<RdmIterationForm />} />
              <Route path="/rdm-prd" element={<PrdRoute />} />
              <Route path="/rdm-review" element={<RdmReviewForm />} />
              <Route path="/rdm-change" element={<RdmChangeForm />} />
              {/* 节点计划：受理后的五节点承诺与基线冻结 */}
              <Route path="/rdm-milestone" element={<RdmMilestonePlan />} />
              <Route path="/rdm-acceptance" element={<RdmAcceptanceList />} />
              <Route path="/rdm-acceptance-form" element={<RdmAcceptanceForm />} />
              <Route path="/rdm-dashboard" element={<RdmDashboard />} />
              {/* 風險中心 / 部門與人員產出：从总看板拆出的两个独立菜单页 */}
              <Route path="/rdm-risk" element={<RdmRiskCenter />} />
              <Route path="/rdm-output" element={<RdmTeamOutput />} />
              {/* 团队负载：从研发工作台资源负载 Tab 升级为独立菜单（项目与计划分组下） */}
              <Route path="/rdm-resource-load" element={<RdmResourceLoad />} />
              <Route path="/rdm-quality" element={<RdmQualityBoard />} />
              <Route path="/rdm-version-trace" element={<RdmVersionTrace />} />
              <Route path="/rdm-weekly-report" element={<RdmWeeklyReport />} />
              <Route path="/rdm-score" element={<RdmScoreBoard />} />
              <Route path="/rdm-score-budget-form" element={<RdmScoreBudgetForm />} />
              <Route path="/rdm-metric-trend" element={<RdmMetricTrend />} />
              <Route path="/rdm-score-rule" element={<RdmScoreRuleConfig />} />
              <Route path="/rdm-config-status" element={<RdmConfigStatus />} />
                            <Route path="/rdm-task-type-config" element={<RdmTaskTypeConfig />} />
              <Route path="/rdm-task-type-config-form" element={<RdmTaskTypeConfigForm />} />
              <Route path="/rdm-config-routing" element={<RdmConfigRouting />} />
              <Route path="/rdm-config-routing-form" element={<RdmConfigRoutingForm />} />
              <Route path="/rdm-config-sla" element={<RdmConfigSla />} />
              {/* 進度日報：四个二级页 + 两个独立表单页（表单不得用 Modal 承载） */}
              <Route path="/rdm-daily-report-rules" element={<DailyReportRules />} />
              <Route path="/rdm-daily-report-rule-form" element={<DailyReportRuleForm />} />
              <Route path="/rdm-daily-report-templates" element={<DailyReportTemplates />} />
              <Route path="/rdm-daily-report-template-form" element={<DailyReportTemplateForm />} />
              <Route path="/rdm-daily-report-template-builtin" element={<DailyReportBuiltinTemplate />} />
              <Route path="/rdm-daily-report-records" element={<DailyReportRecords />} />
              <Route path="/rdm-daily-report-trigger" element={<DailyReportTrigger />} />
              {/* V3 分批交付：项目 / 提测 / 发布 / 交付项 / 问题 */}
              <Route path="/rdm-project" element={<RdmProjectOverview />} />
              <Route path="/rdm-project-detail" element={<RdmProjectDetail />} />
              {/* 存量遷移 / 灰度管理：無獨立菜單，入口在項目總覽操作區（僅有權限者可見）*/}
              <Route path="/rdm-stock-migration" element={<RdmStockMigration />} />
              <Route path="/rdm-grayscale" element={<RdmGrayscaleConfig />} />
              {/* 每日日報（釘釘通知連結落地頁）：無獨立菜單，守衛與側欄高亮錨到 rdm-daily-report-rule */}
              <Route path="/rdm-daily" element={<RdmDailyReport />} />
              <Route path="/rdm-test" element={<RdmTestWorkbench />} />
              {/* 发起提测 / 创建发布批次：独立页（§9.1 禁止用 Modal 承载新增表单） */}
              <Route path="/rdm-test-submit" element={<RdmTestBatchSubmit />} />
              <Route path="/rdm-test-detail" element={<RdmTestBatchDetail />} />
              <Route path="/rdm-release" element={<RdmReleaseCenter />} />
              <Route path="/rdm-release-create" element={<RdmReleaseBatchCreate />} />
              <Route path="/rdm-release-detail" element={<RdmReleaseBatchDetail />} />
              <Route path="/rdm-delivery-item" element={<RdmDeliveryItemForm />} />
              <Route path="/rdm-issue" element={<RdmIssueDetail />} />
              {/* 物資管理（EAM 完整路由）*/}
              <Route path="/asset-list"       element={<AssetList />} />
              <Route path="/asset-add"        element={<AssetAdd />} />
              <Route path="/asset-detail"     element={<AssetDetail />} />
              <Route path="/asset-scrap"      element={<AssetScrap />} />
              <Route path="/asset-repair"     element={<AssetRepair />} />
                            <Route path="/asset-loss"      element={<AssetLoss />} />
              <Route path="/asset-transfer"   element={<AssetTransfer />} />
              <Route path="/asset-transfer/detail" element={<TransferDetail />} />
              <Route path="/asset-transfer/cancel" element={<TransferCancel />} />
              <Route path="/asset-inventory"  element={<AssetInventory />} />
              <Route path="/asset-dashboard"  element={<AssetDashboard />} />
              {/* EAM 基礎數據 */}
              <Route path="/asset-category"   element={<AssetCategory />} />
              <Route path="/asset-model"      element={<AssetModel />} />
              <Route path="/asset-location"   element={<AssetLocation />} />
              <Route path="/param-library"    element={<ParamLibrary />} />
              <Route path="/asset-supplier"   element={<AssetSupplier />} />
              <Route path="/asset-tag"      element={<AssetTag />} />
              <Route path="/asset-tag-print" element={<AssetTagPrint />} />
              {/* 耗材管理（消耗品/MRO）；方案二：分類/品牌已并入分類庫/品牌產品庫 */}
              <Route path="/consumable-dashboard" element={<ConsumableDashboard />} />
              <Route path="/consumable-item"      element={<ConsumableItem />} />
              <Route path="/consumable-claim"     element={<ConsumableClaim />} />
              <Route path="/consumable-stock"     element={<ConsumableStock />} />
              <Route path="/consumable-stock/txn" element={<ConsumableStockTxn />} />
              <Route path="/consumable-stock-txn" element={<ConsumableStockTxnList />} />
              <Route path="/consumable-alert"     element={<ConsumableAlert />} />
              <Route path="/consumable-inbound"   element={<ConsumableInbound />} />
              <Route path="/consumable-report"    element={<ConsumableReport />} />
              {/* EAM 採購入庫 */}
              <Route path="/purchase-order"   element={<PurchaseOrder />} />
              <Route path="/asset-inbound"    element={<AssetInbound />} />
              {/* EAM 領用借用 */}
              <Route path="/asset-claim"      element={<AssetClaim />} />
              <Route path="/asset-claim/add"    element={<AssetClaim />} />
              <Route path="/asset-claim/detail" element={<AssetClaim />} />
              <Route path="/asset-claim/record" element={<AssetClaim />} />
              <Route path="/asset-borrow"     element={<AssetBorrow />} />
              <Route path="/asset-borrow/add"   element={<AssetBorrow />} />
              <Route path="/asset-borrow/detail" element={<AssetBorrow />} />
              <Route path="/asset-borrow/renew" element={<AssetBorrow />} />
              <Route path="/asset-return"     element={<AssetReturn />} />
              <Route path="/asset-return/add"   element={<AssetReturn />} />
              <Route path="/asset-return/detail" element={<AssetReturn />} />
              <Route path="/asset-return/dispose" element={<AssetReturn />} />
              <Route path="/asset-return/recover" element={<AssetReturn />} />
              <Route path="/asset-compensation" element={<AssetCompensation />} />
              <Route path="/asset-compensation/detail" element={<AssetCompensation />} />
              <Route path="/asset-compensation/liability" element={<AssetCompensation />} />
              <Route path="/asset-compensation/waive" element={<AssetCompensation />} />
              <Route path="/asset-compensation/payment" element={<AssetCompensation />} />
              <Route path="/asset-compensation/refund" element={<AssetCompensation />} />
              <Route path="/asset-compensation/review" element={<AssetCompensation />} />
              <Route path="/asset-compensation/add" element={<AssetCompensation />} />
              {/* 員工個人資產入口 */}
              <Route path="/my-assets"        element={<MyAssets />} />
              <Route path="/my-claims"        element={<MyClaims />} />
              {/* EAM 調撥交接 */}
              <Route path="/asset-transfer-list" element={<AssetTransferList />} />
              <Route path="/asset-handover"        element={<AssetHandover />} />
              <Route path="/asset-handover/add"    element={<AssetHandover />} />
              <Route path="/asset-handover/detail" element={<AssetHandover />} />
              {/* EAM 變更歷史 */}
              <Route path="/asset-flow"       element={<AssetFlow />} />
              {/* 用車管理（階段 B1）：子视图由模块内部按 pathname 片段切换，
                  但路由必须逐条显式注册——ROUTE_MENU_KEY_MAP 的门禁按精确路径前缀校验，
                  splat(/*）不被识别，而且与项目内 asset-claim 等现有约定不一致 */}
              <Route path="/vehicle-files" element={<VehicleFiles />} />
              <Route path="/vehicle-files/add" element={<VehicleFiles />} />
              <Route path="/vehicle-files/edit" element={<VehicleFiles />} />
              <Route path="/vehicle-files/detail" element={<VehicleFiles />} />
              <Route path="/vehicle-files/qualification" element={<VehicleFiles />} />
              {/* 会议管理：菜单真值由 MeetingSchemaMigrationInitializer 写入 sys_menu。
                  /meeting-detail 不是菜单项（从钉钉邀约卡片与日程单元格跳进来），
                  但仍需显式注册：路由守卫按精确路径校验 */}
              <Route path="/meeting-my" element={<MyMeeting />} />
              <Route path="/meeting-detail" element={<MeetingDetail />} />
              <Route path="/meeting-booking" element={<RoomBooking />} />
              <Route path="/meeting-booking-form" element={<MeetingBookingForm />} />
              <Route path="/meeting-room" element={<RoomFiles />} />
              <Route path="/meeting-room-form" element={<MeetingRoomForm />} />
              <Route path="/meeting-record" element={<BookingRecords />} />
              <Route path="/meeting-config" element={<MeetingConfig />} />
              <Route path="/meeting-blacklist-form" element={<MeetingBlacklistForm />} />
              {/* 会议纪要：表单页与只读查看页（菜单权限挂 meeting-my，同 meeting-detail） */}
              <Route path="/meeting-minutes-form" element={<MeetingMinutesForm />} />
              <Route path="/meeting-minutes" element={<MeetingMinutesView />} />
              {/* 行政侧纪要检索（會議治理 › 會議紀要）：菜单 key meeting-minutes-list */}
              <Route path="/meeting-minutes-list" element={<MeetingMinutesAdmin />} />
              {/* 通知模板 / 推送开关：紧邻「通知渠道配置」的两个独立菜单 */}
              <Route path="/notification-template" element={<NotificationTemplateConfig />} />
              <Route path="/notification-switch" element={<NotificationSwitchConfig />} />
              <Route path="/my-vehicle-use" element={<MyVehicleUse />} />
              <Route path="/my-vehicle-use/apply" element={<MyVehicleUse />} />
              <Route path="/my-vehicle-use/detail" element={<MyVehicleUse />} />
              <Route path="/vehicle-dispatch" element={<VehicleDispatch />} />
              <Route path="/vehicle-dispatch/assign" element={<VehicleDispatch />} />
              <Route path="/vehicle-dispatch/direct" element={<VehicleDispatch />} />
              <Route path="/vehicle-dispatch/depart" element={<VehicleDispatch />} />
              <Route path="/vehicle-dispatch/return" element={<VehicleDispatch />} />
              <Route path="/vehicle-dispatch/confirm" element={<VehicleDispatch />} />
              <Route path="/vehicle-dispatch/detail" element={<VehicleDispatch />} />
              <Route path="/vehicle-ledger" element={<VehicleLedger />} />
              <Route path="/vehicle-ledger/detail" element={<VehicleLedger />} />
              <Route path="/vehicle-ledger/correct" element={<VehicleLedger />} />
              <Route path="/vehicle-master-data" element={<VehicleMasterData />} />
              <Route path="/vehicle-master-data/add" element={<VehicleMasterData />} />
              <Route path="/vehicle-master-data/edit" element={<VehicleMasterData />} />
              <Route path="/vehicle-ledger/backfill" element={<VehicleLedger />} />
              {/* 審批流程配置 */}
              <Route path="/workflow-config" element={<WorkflowConfig />} />
              <Route path="/workflow-config/detail/:id" element={<WorkflowDetail />} />
              <Route path="/workflow-config/:id" element={<WorkflowEditor />} />
              {/* 页面说明编辑 */}
              <Route path="/page-description-editor" element={<PageDescriptionEditor />} />
              {/* PRD需求查看 */}
              <Route path="/page-prd-view" element={<PagePRDView />} />
              {/* 文檔中心：騰訊文檔為內容中台，本系統為索引與查閱入口；子視圖按 pathname 切換，
                  守衛按精確路徑校驗，三條路徑逐條顯式註冊 */}
              <Route path="/doc-center" element={<DocCenter />} />
              <Route path="/doc-center/detail" element={<DocCenter />} />
              <Route path="/doc-center/register" element={<DocCenter />} />
              <Route path="/doc-center/edit" element={<DocCenter />} />
              <Route path="/doc-space" element={<DocSpaceManage />} />
              <Route path="/doc-space/form" element={<DocSpaceForm />} />
              <Route path="/doc-stats" element={<DocStats />} />
              <Route path="/doc-learning" element={<DocLearning />} />
              <Route path="/doc-learning/detail" element={<DocLearningDetail />} />
              <Route path="/doc-learning/form" element={<DocLearningForm />} />
              {/* 默认回首页 */}
              <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </MenuPermissionGuard>
            </Suspense>
          </RouteErrorBoundary>
        </Content>
      </Layout>
      <PetMascot />
      <VersionUpdateNotification updateAvailable={updateAvailable} current={currentVersion} latest={latestVersion} />
    </Layout>
  )
}

/**
 * 未登錄兜底：跳登錄頁並帶上原始路徑，登錄後回跳。
 *
 * 為什麼要帶 redirect：釘釘日報等通知連結是發到手機上的，用戶點開時多半未登錄，
 * 舊行為直接跳 /login 會把原路徑丟掉——登錄完落到 /portal，用戶還得自己再找一次那個頁面，
 * 等於「連結白發」。帶上 redirect 後登錄即回到原本要看的頁面（回跳值由登錄頁白名單校驗）。
 *
 * HashRouter 下 location 已是 hash 內的部分，因此 pathname+search 就是站內路徑；
 * /login 自身不帶 redirect，避免自我循環。
 */
function RedirectToLogin() {
  const location = useLocation()
  const target = `${location.pathname}${location.search}`
  const to = target && target !== '/login'
    ? `/login?redirect=${encodeURIComponent(target)}`
    : '/login'
  return <Navigate to={to} replace />
}

/** 同 pathname 切换文档身份也重挂载，旧文档响应和草稿不能写入新文档。 */
function PrdRoute() {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  if (params.get('reqId') && !params.get('id') && !params.get('draftId')) {
    params.set('draftId', crypto.randomUUID())
    return <Navigate to={`/rdm-prd?${params}`} replace />
  }
  return <RdmPrdForm key={`${params.get('reqId')}:${params.get('id')}:${params.get('draftId')}`} />
}

/** 路由守衛 */
function AppRoutes() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  /*
   * 路由切换时关掉命令式确认框（Modal.confirm）。
   * 否则在旧页面发起、失败后保留的确认框会悬浮在新页面上（z-index 2000 + 全视口遮罩），
   * 把整个新页面遮住，用户只能刷新才能继续干活。
   */
  useEffect(() => {
    Modal.destroyAll()
    /*
     * 路由切换后回到顶部：.app-content 是实际滚动容器，
     * 从长列表点进详情时保留旧 scrollTop 会让标题/阶段条直接落在视口外。
     */
    document.querySelectorAll('.app-content').forEach(el => { el.scrollTop = 0 })
  }, [location.pathname])

  // 公開頁面（免登錄，不套後台佈局）：
  // - /m/... 掃碼查看資產標籤
  // - /asset-claim-sign 釘釘通知直達的領用簽署頁（憑 HMAC 令牌校驗身份）
  const isPublicMobilePath = location.pathname.startsWith('/m/')
  const isPublicSignPath = location.pathname.startsWith('/asset-claim-sign')
  // 会议签到页与签署页同构：凭 HMAC 令牌鉴权，页面本身不能要求后台登录态
  const isPublicMeetingCheckin = location.pathname.startsWith('/meeting-checkin')
  // 纪要免登查看页同源：凭签名令牌鉴权，钉钉里点开的人可能没有后台账号
  const isPublicMeetingMinutes = location.pathname.startsWith('/meeting-minutes-view')
  // 进度日报看板开放页：推送链接直接落地，未登录也要能看；令牌自带范围与有效期
  const isPublicRdmDailyView = location.pathname.startsWith('/rdm-daily-view')

  return (
    <Routes>
      {isPublicMobilePath || isPublicSignPath || isPublicMeetingCheckin || isPublicMeetingMinutes
        || isPublicRdmDailyView ? (
        <>
          <Route path="/m/asset-tag-view" element={
            <Suspense fallback={<PageLoading />}><AssetTagView /></Suspense>
          } />
          <Route path="/asset-claim-sign" element={
            <Suspense fallback={<PageLoading />}><AssetClaimSign /></Suspense>
          } />
          <Route path="/meeting-checkin" element={
            <Suspense fallback={<PageLoading />}><MeetingCheckin /></Suspense>
          } />
          <Route path="/meeting-minutes-view" element={
            <Suspense fallback={<PageLoading />}><MeetingMinutesPage /></Suspense>
          } />
          <Route path="/rdm-daily-view" element={
            <Suspense fallback={<PageLoading />}><RdmDailyReportView /></Suspense>
          } />
        </>
      ) : isAuthenticated ? (
        <Route path="/*" element={<AuthenticatedLayout />} />
      ) : (
        <>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<RedirectToLogin />} />
        </>
      )}
    </Routes>
  )
}

function EditorNavigationGuard() {
  const { isAuthenticated, user } = useAuth()
  /*
   * 只看「是否登录」与「是否被强制改密」：
   * 是否真有未保存内容由页面登记的 guard 决定（shouldBlock），
   * 再叠加菜单权限判定只会多一个让守卫静默失效的变量。
   * 鉴权失效/强制改密时必须立即放行，内容保护不能阻塞安全退出。
   */
  return <UnsavedNavigationGuard enabled={isAuthenticated && !user?.mustChangePassword} />
}

function AppProviders() {
  return (
      <AuthProvider>
        <MenuProvider>
          <CompanyBrandProvider>
            {/* 未保存内容保护：页签关闭/切换等导航入口统一询问；必须包住页签栏与页面 */}
            <UnsavedChangesProvider>
              <EditorNavigationGuard />
              <AppRoutes />
              {/* 首次登录/密码被重置：未完成改密前拦住整个后台（含企业门户） */}
              <ForcePasswordChangeGate />
            </UnsavedChangesProvider>
          </CompanyBrandProvider>
        </MenuProvider>
      </AuthProvider>
  )
}

// 保留所有既有 Hash 深链和业务 Routes，唯一稳定根路由提供官方 blocker 所需上下文。
const router = createHashRouter([{ path: '*', element: <AppProviders /> }])
function App() {
  return <RouterProvider router={router} />
}

export default App