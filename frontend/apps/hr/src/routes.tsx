/**
 * HR 应用的路由表（方案 §4.1：路由随应用走）。
 *
 * 由 scripts/split-app-routes.mjs 从 src/App.tsx 搬迁生成；路径、元素与包裹顺序与原壳逐字一致。
 * 门户壳只负责布局/会话/菜单与「装配这些路由」，不再持有本应用的具体页面。
 */
import { lazy, type ReactElement } from 'react'
import { Route } from 'react-router-dom'

const CertIssueForm = lazy(() => import('./pages/HrCertificate/IssueForm'))
const CertLedger = lazy(() => import('./pages/HrCertificate/LedgerList'))
const ContractLedger = lazy(() => import('./pages/ContractLedger'))
const EssCertificateDetail = lazy(() => import('./pages/Ess/CertificateDetail'))
const EssCertificateForm = lazy(() => import('./pages/Ess/CertificateForm'))
const EssCertificateList = lazy(() => import('./pages/Ess/CertificateList'))
const EssLeaveDetail = lazy(() => import('./pages/Ess/EssLeaveDetail'))
const EssLeaveForm = lazy(() => import('./pages/Ess/EssLeaveForm'))
const EssMyLeave = lazy(() => import('./pages/Ess/MyLeave'))
const EssMyPerformance = lazy(() => import('./pages/Ess/MyPerformance'))
const EssMyProfile = lazy(() => import('./pages/Ess/MyProfile'))
const EssMyRequests = lazy(() => import('./pages/Ess/MyRequests'))
const HcmAssignmentForm = lazy(() => import('./pages/Hcm/Person/AssignmentForm'))
const HcmEmploymentForm = lazy(() => import('./pages/Hcm/Person/EmploymentForm'))
const HcmOrgJobFamilyForm = lazy(() => import('./pages/Hcm/Organization/JobFamilyForm'))
const HcmOrgJobFamilyList = lazy(() => import('./pages/Hcm/Organization/JobFamilyList'))
const HcmOrgJobGradeForm = lazy(() => import('./pages/Hcm/Organization/JobGradeForm'))
const HcmOrgJobGradeList = lazy(() => import('./pages/Hcm/Organization/JobGradeList'))
const HcmOrgLegalEntityForm = lazy(() => import('./pages/Hcm/Organization/LegalEntityForm'))
const HcmOrgLegalEntityList = lazy(() => import('./pages/Hcm/Organization/LegalEntityList'))
const HcmOrgPositionForm = lazy(() => import('./pages/Hcm/Organization/PositionForm'))
const HcmOrgPositionList = lazy(() => import('./pages/Hcm/Organization/PositionList'))
const HcmOrgUnitForm = lazy(() => import('./pages/Hcm/Organization/UnitForm'))
const HcmOrgUnitList = lazy(() => import('./pages/Hcm/Organization/UnitList'))
const HcmPayrollBenefitList = lazy(() => import('./pages/Hcm/Payroll/BenefitList'))
const HcmPayrollBenefitPlanForm = lazy(() => import('./pages/Hcm/Payroll/BenefitPlanForm'))
const HcmPayrollComponentForm = lazy(() => import('./pages/Hcm/Payroll/ComponentForm'))
const HcmPayrollComponentList = lazy(() => import('./pages/Hcm/Payroll/ComponentList'))
const HcmPayrollEnrollmentForm = lazy(() => import('./pages/Hcm/Payroll/EnrollmentForm'))
const HcmPayrollRuleList = lazy(() => import('./pages/Hcm/Payroll/RuleSetList'))
const HcmPayrollRuleSetForm = lazy(() => import('./pages/Hcm/Payroll/RuleSetForm'))
const HcmPayrollRunDetail = lazy(() => import('./pages/Hcm/Payroll/RunDetail'))
const HcmPayrollRunList = lazy(() => import('./pages/Hcm/Payroll/RunList'))
const HcmPayrollStandardForm = lazy(() => import('./pages/Hcm/Payroll/StandardForm'))
const HcmPayrollStandardList = lazy(() => import('./pages/Hcm/Payroll/StandardList'))
const HcmPersonForm = lazy(() => import('./pages/Hcm/Person/PersonForm'))
const HcmPersonList = lazy(() => import('./pages/Hcm/Person/PersonList'))
const HcmProfileItemForm = lazy(() => import('./pages/Hcm/Person/ProfileItemForm'))
const HrDictForm = lazy(() => import('./pages/HrDict/HrDictForm'))
const HrDictManagement = lazy(() => import('./pages/HrDict'))
const HrFlowDetail = lazy(() => import('./pages/HrLifecycle/HrFlowDetail'))
const HrLifecycle = lazy(() => import('./pages/HrLifecycle'))
const LeaveDetail = lazy(() => import('./pages/HrLeave/LeaveDetail'))
const LeaveForm = lazy(() => import('./pages/HrLeave/LeaveForm'))
const LeaveList = lazy(() => import('./pages/HrLeave/LeaveList'))
const LeaveQuotaForm = lazy(() => import('./pages/HrLeave/LeaveQuotaForm'))
const LeaveQuotaList = lazy(() => import('./pages/HrLeave/LeaveQuotaList'))
const LifecycleDetail = lazy(() => import('./pages/HrLifecycle/LifecycleDetail'))
const LifecycleForm = lazy(() => import('./pages/HrLifecycle/LifecycleForm'))
const PerfAppeals = lazy(() => import('./pages/PerfReport/Appeals'))
const PerfAuditTrail = lazy(() => import('./pages/PerfReport/AuditTrail'))
const PerfCalibration = lazy(() => import('./pages/Performance/Calibration'))
const PerfCycleList = lazy(() => import('./pages/Performance/CycleList'))
const PerfLedger = lazy(() => import('./pages/PerfReport/Ledger'))
const PerfPlanDetail = lazy(() => import('./pages/Performance/PlanDetail'))
const PerfPlanForm = lazy(() => import('./pages/Performance/PlanForm'))
const PerfPlanList = lazy(() => import('./pages/Performance/PlanList'))
const PerfTemplateList = lazy(() => import('./pages/Performance/TemplateList'))
const PerfWorkbench = lazy(() => import('./pages/Performance/Workbench'))

export const HR_ROUTES: ReactElement[] = [
  <Route path="/hcm-org-legal" element={<HcmOrgLegalEntityList />} />,
  <Route path="/hcm-org-legal-form" element={<HcmOrgLegalEntityForm />} />,
  <Route path="/hcm-org-legal-detail" element={<HcmOrgLegalEntityForm />} />,
  <Route path="/hcm-org-unit" element={<HcmOrgUnitList />} />,
  <Route path="/hcm-org-unit-form" element={<HcmOrgUnitForm />} />,
  <Route path="/hcm-org-unit-detail" element={<HcmOrgUnitForm />} />,
  <Route path="/hcm-org-job-family" element={<HcmOrgJobFamilyList />} />,
  <Route path="/hcm-org-job-family-form" element={<HcmOrgJobFamilyForm />} />,
  <Route path="/hcm-org-job-family-detail" element={<HcmOrgJobFamilyForm />} />,
  <Route path="/hcm-org-job-grade" element={<HcmOrgJobGradeList />} />,
  <Route path="/hcm-org-job-grade-form" element={<HcmOrgJobGradeForm />} />,
  <Route path="/hcm-org-job-grade-detail" element={<HcmOrgJobGradeForm />} />,
  <Route path="/hcm-org-position" element={<HcmOrgPositionList />} />,
  <Route path="/hcm-org-position-form" element={<HcmOrgPositionForm />} />,
  <Route path="/hcm-payroll-component" element={<HcmPayrollComponentList />} />,
  <Route path="/hcm-payroll-component-form" element={<HcmPayrollComponentForm />} />,
  <Route path="/hcm-payroll-standard" element={<HcmPayrollStandardList />} />,
  <Route path="/hcm-payroll-standard-form" element={<HcmPayrollStandardForm />} />,
  <Route path="/hcm-payroll-benefit" element={<HcmPayrollBenefitList />} />,
  <Route path="/hcm-payroll-benefit-plan-form" element={<HcmPayrollBenefitPlanForm />} />,
  <Route path="/hcm-payroll-enrollment-form" element={<HcmPayrollEnrollmentForm />} />,
  <Route path="/hcm-payroll-rule" element={<HcmPayrollRuleList />} />,
  <Route path="/hcm-payroll-rule-form" element={<HcmPayrollRuleSetForm />} />,
  <Route path="/hcm-payroll-run" element={<HcmPayrollRunList />} />,
  <Route path="/hcm-payroll-run-detail" element={<HcmPayrollRunDetail />} />,
  <Route path="/hcm-org-position-detail" element={<HcmOrgPositionForm />} />,
  <Route path="/hcm-person" element={<HcmPersonList />} />,
  <Route path="/hcm-person-form" element={<HcmPersonForm />} />,
  <Route path="/hcm-person-detail" element={<HcmPersonForm />} />,
  <Route path="/hcm-person-employment-form" element={<HcmEmploymentForm />} />,
  <Route path="/hcm-person-assignment-form" element={<HcmAssignmentForm />} />,
  <Route path="/hcm-person-profile-form" element={<HcmProfileItemForm />} />,
  <Route path="/hr-dict" element={<HrDictManagement />} />,
  <Route path="/hr-dict-edit" element={<HrDictForm />} />,
  <Route path="/hr-onboarding" element={<HrLifecycle type="onboard" />} />,
  <Route path="/hr-onboarding-form" element={<LifecycleForm type="onboard" />} />,
  <Route path="/hr-onboarding-detail" element={<LifecycleDetail />} />,
  <Route path="/hr-rehire" element={<HrLifecycle type="rehire" />} />,
  <Route path="/hr-rehire-form" element={<LifecycleForm type="rehire" />} />,
  <Route path="/hr-rehire-detail" element={<LifecycleDetail />} />,
  <Route path="/hr-regularization" element={<HrLifecycle type="regular" />} />,
  <Route path="/hr-regularization-form" element={<LifecycleForm type="regular" />} />,
  <Route path="/hr-regularization-detail" element={<LifecycleDetail />} />,
  <Route path="/hr-transfer" element={<HrLifecycle type="transfer" />} />,
  <Route path="/hr-transfer-form" element={<LifecycleForm type="transfer" />} />,
  <Route path="/hr-transfer-detail" element={<LifecycleDetail />} />,
  <Route path="/hr-dimission" element={<HrLifecycle type="dimission" />} />,
  <Route path="/hr-dimission-form" element={<LifecycleForm type="dimission" />} />,
  <Route path="/hr-dimission-detail" element={<LifecycleDetail />} />,
  <Route path="/hr-flow-detail" element={<HrFlowDetail />} />,
  <Route path="/hr-leave" element={<LeaveList />} />,
  <Route path="/hr-leave-form" element={<LeaveForm />} />,
  <Route path="/hr-leave-detail" element={<LeaveDetail />} />,
  <Route path="/hr-leave-quota" element={<LeaveQuotaList />} />,
  <Route path="/hr-leave-quota-form" element={<LeaveQuotaForm />} />,
  <Route path="/ess-leave" element={<EssMyLeave />} />,
  <Route path="/ess-leave-form" element={<EssLeaveForm />} />,
  <Route path="/ess-leave-detail" element={<EssLeaveDetail />} />,
  <Route path="/ess-requests" element={<EssMyRequests />} />,
  <Route path="/ess-profile" element={<EssMyProfile />} />,
  <Route path="/ess-certificate" element={<EssCertificateList />} />,
  <Route path="/ess-certificate-form" element={<EssCertificateForm />} />,
  <Route path="/ess-certificate-detail" element={<EssCertificateDetail />} />,
  <Route path="/hr-certificate" element={<CertLedger />} />,
  <Route path="/hr-certificate-issue" element={<CertIssueForm />} />,
  <Route path="/hr-certificate-detail" element={<EssCertificateDetail ledgerMode />} />,
  <Route path="/hr-perf-cycle" element={<PerfCycleList />} />,
  <Route path="/hr-perf-plan" element={<PerfPlanList />} />,
  <Route path="/hr-perf-template" element={<PerfTemplateList />} />,
  <Route path="/hr-perf-plan-form" element={<PerfPlanForm />} />,
  <Route path="/hr-perf-plan-detail" element={<PerfPlanDetail />} />,
  <Route path="/hr-perf-review" element={<PerfWorkbench />} />,
  <Route path="/hr-perf-calibration" element={<PerfCalibration />} />,
  <Route path="/ess-performance" element={<EssMyPerformance />} />,
  <Route path="/hr-perf-ledger" element={<PerfLedger />} />,
  <Route path="/hr-perf-audit" element={<PerfAuditTrail />} />,
  <Route path="/hr-perf-appeal" element={<PerfAppeals />} />,
  <Route path="/hr-contract-renew-form" element={<LifecycleForm type="renew" />} />,
  <Route path="/hr-contract-renew-detail" element={<LifecycleDetail />} />,
  <Route path="/contract-ledger" element={<ContractLedger />} />,
]
