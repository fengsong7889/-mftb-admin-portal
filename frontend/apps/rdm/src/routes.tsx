/**
 * RDM 应用的路由表（方案 §4.1：路由随应用走）。
 *
 * 由 scripts/split-app-routes.mjs 从 src/App.tsx 搬迁生成；路径、元素与包裹顺序与原壳逐字一致。
 * 门户壳只负责布局/会话/菜单与「装配这些路由」，不再持有本应用的具体页面。
 */
import { lazy, type ReactElement } from 'react'
import { Route } from 'react-router-dom'

const DailyReportBuiltinTemplate = lazy(() => import('./pages/Rdm/DailyReport/BuiltinTemplateDetail'))
const DailyReportRecords = lazy(() => import('./pages/Rdm/DailyReport/Records'))
const DailyReportRuleForm = lazy(() => import('./pages/Rdm/DailyReport/RuleForm'))
const DailyReportRules = lazy(() => import('./pages/Rdm/DailyReport/Rules'))
const DailyReportTemplateForm = lazy(() => import('./pages/Rdm/DailyReport/TemplateForm'))
const DailyReportTemplates = lazy(() => import('./pages/Rdm/DailyReport/Templates'))
const DailyReportTrigger = lazy(() => import('./pages/Rdm/DailyReport/Trigger'))
const PagePRDView = lazy(() => import('./pages/PagePRDView'))
const RdmAcceptanceForm = lazy(() => import('./pages/Rdm/AcceptanceForm'))
const RdmAcceptanceList = lazy(() => import('./pages/Rdm/AcceptanceList'))
const RdmAssignPm = lazy(() => import('./pages/Rdm/AssignPm'))
const RdmChangeForm = lazy(() => import('./pages/Rdm/ChangeForm'))
const RdmConfigRouting = lazy(() => import('./pages/Rdm/Config/RoutingConfig'))
const RdmConfigRoutingForm = lazy(() => import('./pages/Rdm/Config/RoutingConfigForm'))
const RdmConfigSla = lazy(() => import('./pages/Rdm/Config/SlaConfig'))
const RdmConfigStatus = lazy(() => import('./pages/Rdm/Config/StatusConfig'))
const RdmDailyReport = lazy(() => import('./pages/Rdm/DailyReport'))
const RdmDashboard = lazy(() => import('./pages/Rdm/Dashboard'))
const RdmDeliveryBoard = lazy(() => import('./pages/Rdm/DeliveryBoard'))
const RdmDeliveryItemForm = lazy(() => import('./pages/Rdm/DeliveryItemForm'))
const RdmGrayscaleConfig = lazy(() => import('./pages/Rdm/GrayscaleConfig'))
const RdmIssueDetail = lazy(() => import('./pages/Rdm/IssueDetail'))
const RdmIterationForm = lazy(() => import('./pages/Rdm/IterationForm'))
const RdmIterationPlan = lazy(() => import('./pages/Rdm/IterationPlan'))
const RdmMetricTrend = lazy(() => import('./pages/Rdm/MetricTrend'))
const RdmMilestonePlan = lazy(() => import('./pages/Rdm/MilestonePlan'))
const RdmProjectDetail = lazy(() => import('./pages/Rdm/ProjectDetail'))
const RdmProjectOverview = lazy(() => import('./pages/Rdm/ProjectOverview'))
const RdmQualityBoard = lazy(() => import('./pages/Rdm/QualityBoard'))
const RdmReleaseBatchCreate = lazy(() => import('./pages/Rdm/ReleaseBatchCreate'))
const RdmReleaseBatchDetail = lazy(() => import('./pages/Rdm/ReleaseBatchDetail'))
const RdmReleaseCenter = lazy(() => import('./pages/Rdm/ReleaseCenter'))
const RdmRequirementDetail = lazy(() => import('./pages/Rdm/RequirementDetail'))
const RdmRequirementGantt = lazy(() => import('./pages/Rdm/RequirementGantt'))
const RdmRequirementIntake = lazy(() => import('./pages/Rdm/RequirementIntake'))
const RdmRequirementList = lazy(() => import('./pages/Rdm/RequirementList'))
const RdmRequirementPool = lazy(() => import('./pages/Rdm/RequirementPool'))
const RdmRequirementSubmit = lazy(() => import('./pages/Rdm/RequirementSubmit'))
const RdmResourceLoad = lazy(() => import('./pages/Rdm/ResourceLoad'))
const RdmReviewForm = lazy(() => import('./pages/Rdm/ReviewForm'))
const RdmRiskCenter = lazy(() => import('./pages/Rdm/RiskCenter'))
const RdmScoreBoard = lazy(() => import('./pages/Rdm/ScoreBoard'))
const RdmScoreBudgetForm = lazy(() => import('./pages/Rdm/ScoreBudgetForm'))
const RdmScoreRuleConfig = lazy(() => import('./pages/Rdm/Config/ScoreRuleConfig'))
const RdmStockMigration = lazy(() => import('./pages/Rdm/StockMigration'))
const RdmTaskForm = lazy(() => import('./pages/Rdm/TaskForm'))
const RdmTaskTypeConfig = lazy(() => import('./pages/Rdm/Config/TaskTypeConfig'))
const RdmTaskTypeConfigForm = lazy(() => import('./pages/Rdm/Config/TaskTypeConfigForm'))
const RdmTeamOutput = lazy(() => import('./pages/Rdm/TeamOutput'))
const RdmTestBatchDetail = lazy(() => import('./pages/Rdm/TestBatchDetail'))
const RdmTestBatchSubmit = lazy(() => import('./pages/Rdm/TestBatchSubmit'))
const RdmTestWorkbench = lazy(() => import('./pages/Rdm/TestWorkbench'))
const RdmVersionTrace = lazy(() => import('./pages/Rdm/VersionTrace'))
const RdmWeeklyReport = lazy(() => import('./pages/Rdm/WeeklyReport'))
const RdmWorkbench = lazy(() => import('./pages/Rdm/Workbench'))

export const RDM_ROUTES: ReactElement[] = [
  <Route path="/rdm-workbench" element={<RdmWorkbench />} />,
  <Route path="/rdm-submit" element={<RdmRequirementSubmit />} />,
  <Route path="/rdm-requirement" element={<RdmRequirementList />} />,
  <Route path="/rdm-intake" element={<RdmRequirementPool />} />,
  <Route path="/rdm-intake-approval" element={<RdmRequirementIntake />} />,
  <Route path="/rdm-detail" element={<RdmRequirementDetail />} />,
  <Route path="/rdm-delivery" element={<RdmDeliveryBoard />} />,
  <Route path="/rdm-task" element={<RdmTaskForm />} />,
  <Route path="/rdm-gantt" element={<RdmRequirementGantt />} />,
  <Route path="/rdm-assign" element={<RdmAssignPm />} />,
  <Route path="/rdm-iteration" element={<RdmIterationPlan />} />,
  <Route path="/rdm-iteration-form" element={<RdmIterationForm />} />,
  <Route path="/rdm-review" element={<RdmReviewForm />} />,
  <Route path="/rdm-change" element={<RdmChangeForm />} />,
  <Route path="/rdm-milestone" element={<RdmMilestonePlan />} />,
  <Route path="/rdm-acceptance" element={<RdmAcceptanceList />} />,
  <Route path="/rdm-acceptance-form" element={<RdmAcceptanceForm />} />,
  <Route path="/rdm-dashboard" element={<RdmDashboard />} />,
  <Route path="/rdm-risk" element={<RdmRiskCenter />} />,
  <Route path="/rdm-output" element={<RdmTeamOutput />} />,
  <Route path="/rdm-resource-load" element={<RdmResourceLoad />} />,
  <Route path="/rdm-quality" element={<RdmQualityBoard />} />,
  <Route path="/rdm-version-trace" element={<RdmVersionTrace />} />,
  <Route path="/rdm-weekly-report" element={<RdmWeeklyReport />} />,
  <Route path="/rdm-score" element={<RdmScoreBoard />} />,
  <Route path="/rdm-score-budget-form" element={<RdmScoreBudgetForm />} />,
  <Route path="/rdm-metric-trend" element={<RdmMetricTrend />} />,
  <Route path="/rdm-score-rule" element={<RdmScoreRuleConfig />} />,
  <Route path="/rdm-config-status" element={<RdmConfigStatus />} />,
  <Route path="/rdm-task-type-config" element={<RdmTaskTypeConfig />} />,
  <Route path="/rdm-task-type-config-form" element={<RdmTaskTypeConfigForm />} />,
  <Route path="/rdm-config-routing" element={<RdmConfigRouting />} />,
  <Route path="/rdm-config-routing-form" element={<RdmConfigRoutingForm />} />,
  <Route path="/rdm-config-sla" element={<RdmConfigSla />} />,
  <Route path="/rdm-daily-report-rules" element={<DailyReportRules />} />,
  <Route path="/rdm-daily-report-rule-form" element={<DailyReportRuleForm />} />,
  <Route path="/rdm-daily-report-templates" element={<DailyReportTemplates />} />,
  <Route path="/rdm-daily-report-template-form" element={<DailyReportTemplateForm />} />,
  <Route path="/rdm-daily-report-template-builtin" element={<DailyReportBuiltinTemplate />} />,
  <Route path="/rdm-daily-report-records" element={<DailyReportRecords />} />,
  <Route path="/rdm-daily-report-trigger" element={<DailyReportTrigger />} />,
  <Route path="/rdm-project" element={<RdmProjectOverview />} />,
  <Route path="/rdm-project-detail" element={<RdmProjectDetail />} />,
  <Route path="/rdm-stock-migration" element={<RdmStockMigration />} />,
  <Route path="/rdm-grayscale" element={<RdmGrayscaleConfig />} />,
  <Route path="/rdm-daily" element={<RdmDailyReport />} />,
  <Route path="/rdm-test" element={<RdmTestWorkbench />} />,
  <Route path="/rdm-test-submit" element={<RdmTestBatchSubmit />} />,
  <Route path="/rdm-test-detail" element={<RdmTestBatchDetail />} />,
  <Route path="/rdm-release" element={<RdmReleaseCenter />} />,
  <Route path="/rdm-release-create" element={<RdmReleaseBatchCreate />} />,
  <Route path="/rdm-release-detail" element={<RdmReleaseBatchDetail />} />,
  <Route path="/rdm-delivery-item" element={<RdmDeliveryItemForm />} />,
  <Route path="/rdm-issue" element={<RdmIssueDetail />} />,
  <Route path="/page-prd-view" element={<PagePRDView />} />,
]
