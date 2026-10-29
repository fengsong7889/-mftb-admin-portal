import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CloseOutlined, HomeOutlined } from '@ant-design/icons'
import type { MenuVO } from '@/api/menu'
import { translateMenuName } from '@/i18n/menuNameEn'
import { OFFLINE_MENU_LABELS } from '@/constants/offlineMenus'
import { pathToKey } from './Sidebar'
import { isPathBackendConnected } from '@/constants/menuDataSource'
import { useMenu } from '@/contexts/MenuContext'
import { useConfirmLeave } from '@/contexts/UnsavedChangesContext'
import { useAuth } from '@/contexts/AuthContext'
import { useTranslationRevision } from '@/hooks/useTranslationRevision'
import { ROUTE_MENU_KEY_MAP } from '@mftb/contracts/menuPermission'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { HR_DICT_TYPE } from '@/api/hrDict'
import './MenuTabs.css'

/** 标签页信息 */
interface MenuTab {
  path: string
  title: string
  /** 完整路径（含 query）：切语言时用它重算标题，保留新增/编辑等模式差异 */
  fullPath?: string
}

/** localStorage key */
const TABS_STORAGE_KEY = 'menu_tabs_history'

/** 首页固定标签 */
const HOME_TAB: MenuTab = { path: '/', title: 'i18n:common.home', fullPath: '/' }

/**
 * 从后端菜单树构建 path → { key, name } 映射 + menuKey → name 映射
 * 递归遍历所有层级菜单
 */
function buildPathMap(menus: MenuVO[], result: Record<string, { key: string; name: string; nameEn?: string | null }> = {}) {
  for (const m of menus) {
    if (m.path) {
      result[m.path] = { key: m.menuKey, name: m.name, nameEn: m.nameEn }
    }
    if (m.children?.length) {
      buildPathMap(m.children, result)
    }
  }
  return result
}

/** menuKey → 菜单名（含 DB name_en, 非中文语言优先取 DB） */
function buildKeyNameMap(menus: MenuVO[], result: Record<string, { name: string; nameEn?: string | null }> = {}) {
  for (const m of menus) {
    result[m.menuKey] = { name: m.name, nameEn: m.nameEn }
    if (m.children?.length) {
      buildKeyNameMap(m.children, result)
    }
  }
  return result
}

/**
 * 子页面完整标题 —— 与页面标题（H2 / DetailPageHeader）完全一致，优先级最高
 * fixed：固定标题；add/edit：新增/編輯标题（判定与页面 isEdit 一致：editParam 参数非空且 mode≠detail，editParam 默认 'id'）
 * typeParam/typeMap/typeDefault：标题按 query 参数值切换（如審批中心按 type、贈送管理按 mode）
 * nameParam/nameMap：标题追加 query 参数对应名称后缀（如新增算法按 type 追加算法类型名）
 * 值以 'i18n:' 前缀标识 i18n key（随语言切换），其余为页面硬编码文案原样使用
 */
interface SubPageTitle {
  fixed?: string
  /** 详情页标题（前缀匹配到列表条目且有额外路径段时使用） */
  detailFixed?: string
  add?: string
  edit?: string
  editParam?: string
  typeParam?: string
  typeDefault?: string
  typeMap?: Record<string, string>
  /** 标题按 mode query 参数值切换（如採購訂單 ?mode=add） */
  modeParam?: string
  modeMap?: Record<string, string>
  /** 追加名称后缀的 query 参数名（默认 'type'），配合 nameMap 使用 */
  nameParam?: string
  /** query 参数值 → 追加到标题尾部的名称（如算法类型 i18n key） */
  nameMap?: Record<string, string>
}

const SUB_PAGE_FULL_TITLE: Record<string, SubPageTitle> = {
  // 规则拆分第一阶段的临时标题；第二阶段使用独立菜单名及翻译。
  '/meeting-blacklist': { fixed: '預約黑名單' },
  '/meeting-room-rules': { fixed: '會議室專屬規則' },
  '/doc-plans/detail': { fixed: 'i18n:docNative.detailTitle' },
  '/doc-plans/edit': { add: 'i18n:docNative.createTitle', edit: 'i18n:docNative.editTitle' },
  '/doc-plans/confirm': { fixed: 'i18n:docNative.confirmTitle' },
  '/doc-plans/handoff': { fixed: 'i18n:docNative.handoffTitle' },
  '/doc-plans/acl': { fixed: 'i18n:docNative.aclTitle' },
  '/doc-plans/execution': { fixed: 'i18n:docNative.executionTitle' },
  '/doc-governance/members': { fixed: 'i18n:docNative.membersTitle' },
  '/doc-governance/taxonomy': { fixed: 'i18n:docKnowledge.taxonomyTitle' },
  '/doc-governance/clearance': { fixed: 'i18n:docKnowledge.clearanceTitle' },
  '/doc-center/knowledge': { fixed: 'i18n:docKnowledge.detailTitle' },
  '/doc-center/my-acks': { fixed: 'i18n:docKnowledge.myAcksTitle' },
  '/doc-books': { fixed: 'i18n:docKnowledge.booksTitle' },
  '/doc-archives': { fixed: 'i18n:docKnowledge.archivesTitle' },
  '/doc-system-plans': { fixed: 'i18n:docKnowledge.systemPlansTitle' },
  '/doc-system-plans/detail': { fixed: 'i18n:docKnowledge.systemPlanDetailTitle' },
  '/doc-api-center': { fixed: 'i18n:docKnowledge.apiCenterTitle' },
  // 财务管理
  '/recharge-add': { fixed: 'i18n:accountBalance.rechargePageTitle' },
  '/transfer-add': { fixed: 'i18n:accountBalance.transferTitle' },
  '/deduct-add': { fixed: 'i18n:accountBalance.deductPageTitle' },
  '/merge-add': { fixed: 'i18n:accountBalance.mergePageTitle' },
  '/batch-detail': { fixed: 'i18n:batchDetail.pageTitle' },
  '/debt-detail': { fixed: 'i18n:debtDetail.pageTitle' },
  '/approval-detail': {
    typeParam: 'type',
    typeDefault: 'recharge',
    typeMap: {
      recharge: 'i18n:approvalDetail.typeTitleRecharge',
      deduct: 'i18n:approvalDetail.typeTitleDeduct',
      transfer: 'i18n:approvalDetail.typeTitleTransfer',
      merge: 'i18n:approvalDetail.typeTitleMerge',
      gift: 'i18n:approvalDetail.typeTitleGift',
      ai_access: 'i18n:approvalDetail.typeTitleAiAccess',
      // 系統權限申請（門戶「我要申請」發起的流程），漏登記會讓審批頁簽顯示成充值詳情
      system_access: 'i18n:approvalDetail.typeTitleSystemAccess',
    },
  },
  // 系統權限申請頁：無菜單記錄的門戶自助頁，頁簽名走語言包而不是路徑名兜底
  '/system-access-apply': { fixed: 'i18n:systemAccessApply.pageTitle' },
  // 搜索校验（动态路由 /search-verify-detail/:id）
  '/search-verify-detail': { fixed: 'i18n:searchVerifyDetail.title' },
  // 考勤假勤系统：表单页(新增/编辑按 ?id 区分)与详情页分开登记，避免列表/新增/详情三个页签同名
  '/attendance-shift-form': { add: 'i18n:attendance.shiftAdd', edit: 'i18n:attendance.shiftEdit' },
  '/attendance-shift-detail': { fixed: 'i18n:attendance.shiftDetail' },
  '/hcm-org-legal-form': { add: 'i18n:hcmOrg.legal.addTitle', edit: 'i18n:hcmOrg.legal.editTitle' },
  '/hcm-org-legal-detail': { fixed: 'i18n:hcmOrg.legal.detailTitle' },
  '/hcm-org-unit-form': { add: 'i18n:hcmOrg.unit.addTitle', edit: 'i18n:hcmOrg.unit.editTitle' },
  '/hcm-org-unit-detail': { fixed: 'i18n:hcmOrg.unit.detailTitle' },
  '/hcm-org-job-family-form': { add: 'i18n:hcmOrg.job.family.addTitle', edit: 'i18n:hcmOrg.job.family.editTitle' },
  '/hcm-org-job-family-detail': { fixed: 'i18n:hcmOrg.job.family.detailTitle' },
  '/hcm-org-job-grade-form': { add: 'i18n:hcmOrg.job.grade.addTitle', edit: 'i18n:hcmOrg.job.grade.editTitle' },
  '/hcm-org-job-grade-detail': { fixed: 'i18n:hcmOrg.job.grade.detailTitle' },
  '/hcm-org-position-form': { add: 'i18n:hcmOrg.position.addTitle', edit: 'i18n:hcmOrg.position.editTitle' },
  '/hcm-org-position-detail': { fixed: 'i18n:hcmOrg.position.detailTitle' },
  '/hcm-person-form': { add: 'i18n:hcmPerson.addTitle', edit: 'i18n:hcmPerson.editTitle' },
  '/hcm-person-detail': { fixed: 'i18n:hcmPerson.detailTitle' },
  '/hcm-person-employment-form': { add: 'i18n:hcmPerson.addEmployment', edit: 'i18n:hcmPerson.editEmployment' },
  '/hcm-person-assignment-form': { add: 'i18n:hcmPerson.addAssignment', edit: 'i18n:hcmPerson.editAssignment' },
  '/hcm-person-profile-form': { add: 'i18n:hcmPerson.addProfileItem', edit: 'i18n:hcmPerson.editProfileItem' },
  // 薪酬福利：薪酬标准按雇佣进入，表单保留 query 以区分新增/编辑
  '/hcm-payroll-component-form': { add: 'i18n:payroll.component.addTitle', edit: 'i18n:payroll.component.editTitle' },
  '/hcm-payroll-standard-form': { add: 'i18n:payroll.standard.addTitle', edit: 'i18n:payroll.standard.editTitle' },
  '/hcm-payroll-benefit-plan-form': { add: 'i18n:payroll.benefit.addPlanTitle', edit: 'i18n:payroll.benefit.editPlanTitle' },
  '/hcm-payroll-enrollment-form': { add: 'i18n:payroll.enrollment.addTitle', edit: 'i18n:payroll.enrollment.editTitle' },
  '/hcm-payroll-rule-form': { add: 'i18n:payroll.rule.addTitle', edit: 'i18n:payroll.rule.editTitle' },
  '/hcm-payroll-run-detail': { fixed: 'i18n:payroll.run.detailTitle' },
  '/attendance-group-form': { add: 'i18n:attendance.groupAdd', edit: 'i18n:attendance.groupEdit' },
  '/attendance-group-detail': { fixed: 'i18n:attendance.groupDetail' },
  '/attendance-holiday-form': { add: 'i18n:attendance.holidayAdd', edit: 'i18n:attendance.holidayEdit' },
  '/attendance-holiday-detail': { fixed: 'i18n:attendance.holidayDetail' },
  // 商家推广工具
  '/promotion-algorithm-add': {
    add: 'i18n:recommend.addAlgo',
    edit: 'i18n:recommend.editAlgo',
    modeParam: 'mode',
    modeMap: { detail: 'i18n:recommend.algoDetail' },
    nameMap: {
      '1': 'i18n:recommend.algoInvincibleStar',
      '2': 'i18n:recommend.algoNewStoreAd',
      '3': 'i18n:recommend.algoHotReviveAd',
      '4': 'i18n:recommend.algoExclusiveMerchant',
      '5': 'i18n:recommend.algoPopularMerchant',
      '6': 'i18n:recommend.algoGuessYouLike',
      '7': 'i18n:recommend.algoOrganicTraffic',
      '11': 'i18n:recommend.algoBrandMerchant',
      '12': 'i18n:recommend.algoGoldAd',
      '13': 'i18n:recommend.algoGoldenSignboard',
      '14': 'i18n:recommend.algoProductPromo',
      '15': 'i18n:recommend.algoTrafficAd',
    },
  },
  '/promotion-slot-config-add': { add: 'i18n:promotionSlotConfig:addSlotConfig', edit: 'i18n:promotionSlotConfig:editSlotConfig' },
  '/promotion-waterfall-add': { add: 'i18n:recommend.addPricingTitle', edit: 'i18n:recommend.editPricingTitle' },
  '/order-detail': { fixed: 'i18n:orderDetail.detailTitle' },
  // 赠送管理（?mode=gift → 贈送廣告天數；否则新增推廣贈送）
  '/gift-add': {
    typeParam: 'mode',
    typeMap: { gift: 'i18n:giftAdd.giftAdDays' },
    add: 'i18n:giftAdd.addGift',
  },
  '/gift-detail-view': { fixed: 'i18n:giftDetailView.pageTitle' },
  // AI 智能中心（页面标题硬编码）
  '/ai-model-edit': { fixed: '編輯模型' },
  '/ai-model-detail': { fixed: '模型詳情' },
  '/ai-dept-auth-edit': { add: '新增模型授權-部門', edit: '編輯模型授權-部門' },
  '/ai-dept-auth-detail': { fixed: '授權模型詳情-部門' },
  '/ai-pos-auth-edit': { add: '新增模型授權-職位', edit: '編輯模型授權-職位' },
  '/ai-pos-auth-detail': { fixed: '授權模型詳情-職位' },
  '/ai-role-auth-edit': { add: '新增模型授權-角色', edit: '編輯模型授權-角色', editParam: 'roleId' },
  '/ai-role-auth-detail': { fixed: '授權模型詳情-角色' },
  '/ai-dept-quota-edit': { add: '新增部門額度', edit: '編輯部門額度' },
  '/ai-dept-quota-detail': { fixed: '部門額度詳情' },
  '/ai-emp-quota-edit': { add: '新增模型額度-職位', edit: '編輯模型額度-職位' },
  '/ai-emp-quota-detail': { fixed: '額度詳情-職位' },
  '/ai-role-quota-edit': { add: '新增模型額度-角色', edit: '編輯模型額度-角色' },
  '/ai-role-quota-detail': { fixed: '額度詳情-角色' },
  '/ai-operation-auth-edit': { add: '新增工具', edit: '編輯工具' },
  '/ai-operation-auth-log': { fixed: '調用日誌' },
  '/employee-detail': { fixed: '員工詳情' },
  '/ai-access-apply': { fixed: 'i18n:aiApply.pageTitle' },
  '/ai-mcp-service': { fixed: 'i18n:mcpService.pageTitle' },
  // 审批流程（动态路由 /workflow-config/detail/:id）
  '/workflow-config/detail': { fixed: '審批流程詳情' },
  // 版本管理
  '/version-history-detail': { fixed: 'i18n:versionHistory.detailTitle' },
  '/version-history-add': { fixed: 'i18n:versionHistory.addVersion' },
  // 对话审计（动态路由 /ai-conversation-audit/:id）
  '/ai-conversation-audit': { fixed: '對話審計', detailFixed: '對話詳情' },
  '/version-history-edit': { fixed: 'i18n:versionHistory.editVersion' },
  // 页面说明（页面标题含动态页面名，取静态主体）
  '/page-description-editor': { fixed: '編輯界面說明' },
  '/page-prd-view': { fixed: '界面需求說明' },
  // 用車管理子頁面：不登記的話會全部退化到父菜單名，一個「用車辦理」能堆出 6 個同名標籤
  '/vehicle-ledger/detail': { fixed: '用車詳情' },
  '/vehicle-ledger/correct': { fixed: '授權更正' },
  '/vehicle-ledger/backfill': { fixed: '事後補錄' },
  '/vehicle-dispatch/detail': { fixed: '用車辦理詳情' },
  '/vehicle-dispatch/assign': { fixed: '安排車輛與駕駛人' },
  '/vehicle-dispatch/direct': { fixed: '授權直接登記' },
  '/vehicle-dispatch/depart': { fixed: '出車登記' },
  '/vehicle-dispatch/return': { fixed: '歸還登記' },
  '/vehicle-dispatch/confirm': { fixed: '歸還確認' },
  '/my-vehicle-use/apply': { fixed: '申請用車' },
  '/my-vehicle-use/detail': { fixed: '我的用車詳情' },
  '/vehicle-files/detail': { fixed: '車輛詳情' },
  '/vehicle-files/add': { fixed: '新增車輛檔案' },
  '/vehicle-files/edit': { fixed: '編輯車輛檔案' },
  '/vehicle-files/qualification': { fixed: '新增駕駛資格核驗' },
  // 采购执行（?mode=add/edit → 与页面 H2 标题同一 i18n key；?id=X → 詳情）
  '/purchase-order': { modeParam: 'mode', modeMap: { add: 'i18n:asset.addPoTitle', edit: 'i18n:asset.editPoTitle' }, detailFixed: 'i18n:eam.purchaseOrderDetailTitle' },
  // 資產管理（EAM）子页面 —— 与页面标题（H2 / DetailPageHeader）一致；页面标题含动态单号/员工名时取静态主体
  '/asset-claim/add': { fixed: 'i18n:asset.claimTitle' },
  '/asset-claim/detail': { fixed: '領用資產詳情' },
  '/asset-claim/record': { fixed: '领用及签收凭证详情' },
  '/asset-borrow/add': { fixed: '借用登記' },
  '/asset-borrow/detail': { fixed: '借用詳情' },
  '/asset-borrow/renew': { fixed: '續借' },
  '/asset-return/add': { fixed: '歸還登記' },
  '/asset-return/detail': { fixed: '歸還詳情' },
  '/asset-return/dispose': { fixed: '處置登記' },
  '/asset-return/recover': { fixed: '遺失找回' },
  // 員工個人入口（右上角頭像下拉進入，非菜單頁，標題必須穩定不得退回 slug）
  '/my-assets': { fixed: 'i18n:header.myAssets' },
  '/my-claims': { fixed: 'i18n:transfer.myClaims' },
  // 集團人事（入轉調離 / 請假）子頁面 —— 與頁面 DetailPageHeader 標題保持一致，禁止退回 slug 文案
  '/hr-flow-detail': { fixed: 'i18n:hrLifecycle.flowDetailTitle' },
  '/hr-leave-detail': { fixed: 'i18n:hrLeave.detailTitle' },
  '/hr-leave-form': { fixed: 'i18n:hrLeave.formTitle' },
  '/hr-leave-quota-form': { add: 'i18n:hrLeave.addQuotaTitle', edit: 'i18n:hrLeave.editQuotaTitle' },
  '/hr-onboarding-detail': { fixed: 'i18n:hrLifecycle.detailTitle' },
  '/hr-regularization-detail': { fixed: 'i18n:hrLifecycle.detailTitle' },
  '/hr-transfer-detail': { fixed: 'i18n:hrLifecycle.detailTitle' },
  '/hr-dimission-detail': { fixed: 'i18n:hrLifecycle.detailTitle' },
  '/ess-leave-form': { fixed: 'i18n:hrLeave.formTitle' },
  '/ess-leave-detail': { fixed: 'i18n:hrLeave.detailTitle' },
  '/ess-certificate-form': { fixed: 'i18n:hrCert.formTitle' },
  '/ess-certificate-detail': { fixed: 'i18n:hrCert.detailTitle' },
  '/hr-certificate-issue': { fixed: 'i18n:hrCert.issueTitle' },
  '/hr-certificate-detail': { fixed: 'i18n:hrCert.detailTitle' },
  // 績效考核子页面（计划发起/进度详情共用 hr-perf-admin 授权）
  '/hr-perf-plan-form': { fixed: 'i18n:hrPerf.launchPlan' },
  '/hr-perf-plan-detail': { fixed: 'i18n:hrPerf.planDetailTitle' },
  '/hr-perf-template': { fixed: 'i18n:hrPerf.templateLedgerTitle' },
  '/hr-contract-renew-detail': { fixed: 'i18n:hrLifecycle.detailTitle' },
  // 菜单配置·高级设置（仅超管）：同一页按 ?id 区分新增/編輯，标题与页面 H2 一致
  '/menu-config/setting': { add: '新增菜單 · 高級設置', edit: '編輯菜單 · 高級設置' },
  /*
   * 產研交付（RDM）子頁面：這些路由在 pathToKey 裡有權限錨點，但頁簽不能直接沿用父菜單名，
   * 否則「研發工作台/測試工作台/發布中心」會出現 2~3 個同名頁簽（同名不同路徑）。
   * 子頁面一律給獨立標題，優先級高於 pathToKey（matchFullTitle 在 getMenuName 第 1 步）。
   */
  '/rdm-detail': { fixed: 'i18n:rdm.tab.reqDetail' },
  '/rdm-submit': { add: 'i18n:rdm.tab.reqSubmitAdd', edit: 'i18n:rdm.tab.reqSubmitEdit' },
  '/rdm-gantt': { fixed: 'i18n:rdm.tab.gantt' },
  '/rdm-assign': { fixed: 'i18n:rdm.tab.assign' },
  '/rdm-prd': { fixed: 'i18n:rdm.tab.prd' },
  '/rdm-review': { fixed: 'i18n:rdm.tab.review' },
  '/rdm-change': { fixed: 'i18n:rdm.tab.change' },
  '/rdm-milestone': { fixed: 'i18n:rdm.tab.milestone' },
  '/rdm-acceptance-form': { fixed: 'i18n:rdm.tab.acceptanceForm' },
  '/rdm-task': { add: 'i18n:rdm.tab.taskAdd', edit: 'i18n:rdm.tab.taskEdit' },
  '/rdm-test-detail': { fixed: 'i18n:rdm.tab.testDetail' },
  '/rdm-test-submit': { fixed: 'i18n:rdm.tab.testSubmit' },
  '/rdm-release-create': { fixed: 'i18n:rdm.tab.releaseCreate' },
  '/rdm-release-detail': { fixed: 'i18n:rdm.tab.releaseDetail' },
  '/rdm-delivery-item': {
    modeParam: 'mode',
    modeMap: { create: 'i18n:rdm.tab.deliveryItemCreate', edit: 'i18n:rdm.tab.deliveryItemEdit' },
    detailFixed: 'i18n:rdm.tab.deliveryItemDetail',
  },
  '/rdm-project-detail': {
    modeParam: 'mode',
    modeMap: { create: 'i18n:rdm.tab.projectCreate', edit: 'i18n:rdm.tab.projectEdit' },
    detailFixed: 'i18n:rdm.tab.projectDetail',
  },
  '/rdm-iteration-form': { add: 'i18n:rdm.tab.iterationAdd', edit: 'i18n:rdm.tab.iterationEdit' },
  '/rdm-issue': { fixed: 'i18n:rdm.tab.issue' },
  '/rdm-grayscale': { fixed: 'i18n:rdm.tab.grayscale' },
  '/rdm-stock-migration': { fixed: 'i18n:rdm.tab.stockMigration' },
  '/rdm-daily-report-rule-form': { add: 'i18n:rdm.tab.dailyRuleAdd', edit: 'i18n:rdm.tab.dailyRuleEdit' },
  '/rdm-daily-report-template-form': { add: 'i18n:rdm.tab.dailyTemplateAdd', edit: 'i18n:rdm.tab.dailyTemplateEdit' },
  // 內置版式詳情頁：權限錨定推送配置菜單，但頁簽必須自報身份，否則會被叫成「推送配置」
  '/rdm-daily-report-template-builtin': { fixed: 'i18n:rdm.tab.builtinLayout' },
  '/rdm-config-routing-form': { add: 'i18n:rdm.tab.routingAdd', edit: 'i18n:rdm.tab.routingEdit' },
  '/rdm-score-budget-form': { add: 'i18n:rdm.tab.scoreBudgetAdd', edit: 'i18n:rdm.tab.scoreBudgetEdit' },
  '/rdm-task-type-config-form': { add: 'i18n:rdm.tab.taskTypeAdd', edit: 'i18n:rdm.tab.taskTypeEdit' },
}

/**
 * 非菜单页（后端 sys_menu 无记录）的标签名兜底：详情页 / 独立配置页 / 原型页。
 * 菜单页名称一律取自后端菜单树（DB 为唯一真值），此处不再维护菜单名副本。
 */
const SUB_PAGE_NAME: Record<string, string> = {
  '/ai-operation-auth-edit': 'AI 操作授權',
  '/ai-operation-auth-log': 'AI 操作授權',
  '/ai-pos-auth': '職位授權',
  '/employee-detail': '員工詳情',
  '/gift-add': '新增贈送',
  '/gift-detail-view': '贈送明細',
  '/map-planning': '地圖規劃',
  '/oa-purchase-request': '採購申請',
  '/order-detail': '訂單詳情',
  '/promotion-order-manage': '訂單管理',
  /*
   * 產研交付（RDM）的详情/独立表单页：这些路由本就没有菜单记录，
   * 不兜底就会退成 slug（深度测试实测到页签显示「rdm submit」）。
   * <p>只列详情页与独立表单页：门禁（check:menu）限制本表条目数且禁止“菜单名副本”，
   * 所以退役菜单（rdm-query / rdm-product / rdm-delivery-req）的名字不往这里塞——
   * 它们的旧地址本来就重定向到存活页，页签会归到目标页名下。
   */
  '/rdm-submit': '提交需求',
  '/rdm-detail': '需求詳情',
  '/rdm-gantt': '需求甘特圖',
  '/rdm-assign': '分配產品經理',
  '/rdm-prd': '編寫 PRD',
  '/rdm-review': '需求評審',
  '/rdm-change': '需求變更申請',
  '/rdm-milestone': '節點計劃',
  '/rdm-acceptance-form': '需求驗收',
  '/store-data-config': '門店數據配置',
  '/translation-manage': '翻譯工作台',
}

/**
 * 离线菜单（仍依赖 mock）的 path → 名称：由 OFFLINE_MENUS 与 Sidebar 的 pathToKey 派生，
 * 避免第三份手写菜单名副本；后端可用时仍以后端菜单树名称为准。
 */
const OFFLINE_PATH_NAME: Record<string, string> = {}
for (const [path, menuKey] of Object.entries(pathToKey)) {
  const label = OFFLINE_MENU_LABELS[menuKey]
  if (label) {
    OFFLINE_PATH_NAME[path] = label
  }
}

/** 后端菜单树不可用时的降级名称表：离线菜单（派生） + 无菜单记录的子页面 */
const FALLBACK_PATH_NAME: Record<string, string> = {
  ...OFFLINE_PATH_NAME,
  ...SUB_PAGE_NAME,
}

/** 标准化路径：去除 query string 和 hash */
function normalizePath(pathname: string): string {
  return pathname.split('?')[0].split('#')[0]
}

/** 解析标题文案：'i18n:' 前缀走 t() 翻译（随语言切换），否则为页面硬编码文案原样返回 */
function resolveTitle(raw: string, t: TFunction): string {
  return raw.startsWith('i18n:') ? t(raw.slice(5)) : raw
}

/** 追加名称后缀（如算法类型名）：nameMap 命中 query 参数值时以「 · 名称」拼接 */
function appendName(title: string, entry: SubPageTitle, params: URLSearchParams | null, t: TFunction): string {
  if (!entry.nameMap || !params) return title
  const value = params.get(entry.nameParam ?? 'type')
  const raw = value ? entry.nameMap[value] : undefined
  return raw ? `${title} · ${resolveTitle(raw, t)}` : title
}

/** 匹配子页面完整标题（与页面标题一致；支持动态路由前缀与 query 参数区分新增/編輯/类型） */
function matchFullTitle(pathname: string, t: TFunction): string | null {
  const normalized = normalizePath(pathname)
  if (normalized === '/hr-dict-edit') {
    const params = new URLSearchParams(pathname.split('?')[1])
    const type = Object.values(HR_DICT_TYPE).find(value => value === params.get('type')) ?? HR_DICT_TYPE.EMPLOYER_COMPANY
    return t(params.get('id') ? 'hrDict.editTitle' : 'hrDict.addTitle', { type: t(`hrDict.types.${type}`) })
  }
  let entry = SUB_PAGE_FULL_TITLE[normalized]
  if (!entry) {
    // 动态路由前缀匹配（如 /search-verify-detail/:id、/workflow-config/detail/:id）
    for (const [prefix, e] of Object.entries(SUB_PAGE_FULL_TITLE)) {
      if (normalized.startsWith(prefix + '/')) {
        entry = e
        // 对话审计详情页：前缀匹配到列表条目时，若有额外路径段则使用详情标题
        if (e.detailFixed && normalized !== prefix) {
          return resolveTitle(e.detailFixed, t)
        }
        break
      }
    }
  }
  if (!entry) return null

  const qs = pathname.split('?')[1]
  const params = qs ? new URLSearchParams(qs) : null

  // 标题按 query 参数值切换（如審批中心按 type、贈送管理按 mode）
  if (entry.typeParam && entry.typeMap) {
    const typeValue = params?.get(entry.typeParam) ?? entry.typeDefault ?? ''
    if (entry.typeMap[typeValue]) return appendName(resolveTitle(entry.typeMap[typeValue], t), entry, params, t)
  }

  // 标题按 mode query 参数值切换（如採購訂單 ?mode=add/edit）
  if (entry.modeParam && entry.modeMap) {
    const modeValue = params?.get(entry.modeParam) ?? ''
    if (entry.modeMap[modeValue]) return appendName(resolveTitle(entry.modeMap[modeValue], t), entry, params, t)
    // 有 id 但无 mode → 详情页标题
    if (entry.detailFixed && params?.get('id')) return appendName(resolveTitle(entry.detailFixed, t), entry, params, t)
  }

  if (entry.fixed) return appendName(resolveTitle(entry.fixed, t), entry, params, t)
  if (entry.add && entry.edit) {
    // 与页面 isEdit 判定一致：editParam（默认 id）非空且 mode≠detail 为編輯模式
    const editParam = entry.editParam ?? 'id'
    const isEdit = !!params?.get(editParam) && params.get('mode') !== 'detail'
    return appendName(resolveTitle(isEdit ? entry.edit : entry.add, t), entry, params, t)
  }
  return null
}

/** 需要保留 query string 的路径（用于区分新增/编辑等模式，与标签标题联动） */
const TAB_PATHS_WITH_QUERY = new Set([
  '/promotion-algorithm-add',
  '/promotion-slot-config-add',
  '/promotion-waterfall-add',
  '/gift-add',
  '/approval-detail',
  '/ai-dept-auth-edit',
  '/ai-dept-auth-detail',
  '/ai-pos-auth-edit',
  '/ai-pos-auth-detail',
  '/ai-role-auth-edit',
  '/ai-role-auth-detail',
  '/ai-dept-quota-edit',
  '/ai-dept-quota-detail',
  '/ai-emp-quota-edit',
  '/ai-emp-quota-detail',
  '/ai-role-quota-edit',
  '/ai-role-quota-detail',
  '/ai-operation-auth-edit',
  '/hr-dict-edit',
  '/purchase-order',
  '/menu-config/setting',
  // 考勤假勤：表单/详情页保留 query 以区分新增/编辑/不同详情，并与页签标题联动
  '/hcm-org-legal-form', '/hcm-org-legal-detail',
  '/hcm-org-unit-form', '/hcm-org-unit-detail',
  '/hcm-org-job-family-form', '/hcm-org-job-family-detail',
  '/hcm-org-job-grade-form', '/hcm-org-job-grade-detail',
  '/hcm-org-position-form', '/hcm-org-position-detail',
  '/hcm-person-form', '/hcm-person-detail',
  '/hcm-person-employment-form', '/hcm-person-assignment-form', '/hcm-person-profile-form',
  '/hcm-payroll-component-form', '/hcm-payroll-standard-form',
  '/hcm-payroll-benefit-plan-form', '/hcm-payroll-enrollment-form', '/hcm-payroll-rule-form',
  '/hcm-payroll-run-detail',
  '/attendance-shift-form', '/attendance-shift-detail',
  '/attendance-group-form', '/attendance-group-detail',
  '/attendance-holiday-form', '/attendance-holiday-detail',
])

/** Tab 路径：特定路径保留 query string 以区分新增/编辑 */
export function tabPath(pathname: string): string {
  const normalized = normalizePath(pathname)
  if (normalized === '/rdm-prd') {
    const source = new URLSearchParams(pathname.split('?')[1])
    const identity = new URLSearchParams()
    for (const key of ['reqId', 'id', 'draftId']) {
      const value = source.get(key)
      if (value) identity.set(key, value)
    }
    return identity.size ? `${normalized}?${identity}` : normalized
  }
  if (TAB_PATHS_WITH_QUERY.has(normalized)) {
    const qs = pathname.split('?')[1]
    return qs ? `${normalized}?${qs}` : normalized
  }
  return normalized
}

export default function MenuTabs() {
  const location = useLocation()
  const navigate = useNavigate()
  const { i18n: i18nInstance, t } = useTranslation()
  const { menuTree, status: menuStatus } = useMenu()
  /** 語言包異步注入完成後重算頁簽名：否則同一次刷新內會出現兩套命名 */
  const translationRevision = useTranslationRevision()
  /** 关闭/切换页签前先问未保存页面：返回 false 表示用户选择继续编辑 */
  const confirmLeave = useConfirmLeave()
  const { hasMenuPermission } = useAuth()
  const [tabs, setTabs] = useState<MenuTab[]>([HOME_TAB])
  const scrollRef = useRef<HTMLDivElement>(null)

  /** 从共享菜单 Context 构建 path → name 及 menuKey → name 映射 */
  const pathNameMap = useMemo(() => menuTree ? buildPathMap(menuTree) : {}, [menuTree])
  const keyNameMap = useMemo(() => menuTree ? buildKeyNameMap(menuTree) : {}, [menuTree])

  /** 从 localStorage 恢复历史标签 */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TABS_STORAGE_KEY)
      if (saved) {
        const parsed: MenuTab[] = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hasHome = parsed.some(t => t.path === '/')
          // 首页标签持久化的是旧文案：统一改回 i18n key，切语言时才能跟着变
          const restored = (hasHome ? parsed : [HOME_TAB, ...parsed])
            .map(t => (t.path === '/' ? { ...t, title: HOME_TAB.title, fullPath: '/' }
              : { ...t, path: tabPath(t.fullPath ?? t.path) }))
          setTabs(restored)
        }
      }
    } catch { /* 忽略解析错误 */ }
  }, [])

  /** 持久化标签到 localStorage */
  useEffect(() => {
    try {
      localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs))
    } catch { /* 忽略存储错误 */ }
  }, [tabs])

  /** 离线时过滤已接入后端的标签：保留首页 + 原型页面，移除后端菜单标签 */
  useEffect(() => {
    if (menuStatus !== 'offline') return
    setTabs((prev) => {
      const filtered = prev.filter(
        (tab) => tab.path === '/' || !isPathBackendConnected(tab.path),
      )
      return filtered.length === prev.length ? prev : filtered
    })
  }, [menuStatus])

  /** 获取路径对应的菜单名称（子页面优先用与页面标题一致的完整标题，菜单页与侧边栏一致） */
  const getMenuName = useCallback((pathname: string): string => {
    const normalized = normalizePath(pathname)

    // 1. 子页面完整标题（与页面标题完全一致，优先级最高）
    const fullTitle = matchFullTitle(pathname, t)
    if (fullTitle) return fullTitle

    // 2. 后端菜单树 path 直接匹配
    const backendEntry = pathNameMap[normalized]
    if (backendEntry) {
      return translateMenuName(backendEntry.key, backendEntry.name, backendEntry.nameEn)
    }

    // 3. 通过 pathToKey（与侧边栏共享）找到 menuKey，再从后端 keyNameMap 获取名称
    const menuKey = pathToKey[normalized]
    if (menuKey && keyNameMap[menuKey]) {
      return translateMenuName(menuKey, keyNameMap[menuKey].name, keyNameMap[menuKey].nameEn)
    }

    // 4. 后端菜单不可用时的降级 fallback
    return FALLBACK_PATH_NAME[normalized] || normalized.replace(/^\//, '').replace(/-/g, ' ')
  }, [pathNameMap, keyNameMap, t])

  /** 判断路由是否为「受控但当前用户无权限」（与 MenuPermissionGuard 同口径） */
  const isDeniedRoute = useCallback((pathname: string, search: string): boolean => {
    const isTransferAsset = pathname === '/asset-detail' && new URLSearchParams(search).get('context') === 'transfer'
    const menuKey = isTransferAsset ? 'asset-transfer-list' : (ROUTE_MENU_KEY_MAP[pathname] ?? pathToKey[pathname])
    return !!menuKey && !hasMenuPermission(menuKey)
  }, [hasMenuPermission])

  /** 路由变化时自动添加/激活标签 */
  useEffect(() => {
    // 无权限的受控路由不创建标签：避免泄漏无权限菜单名称、且点击标签只会反复 403
    if (isDeniedRoute(location.pathname, location.search)) return
    // location.pathname 不含 query string，需拼接 location.search
    const fullPath = location.pathname + location.search
    const currentTabPath = tabPath(fullPath)
    if (normalizePath(currentTabPath) === '/login') return

    const state: unknown = location.state
    const closingPath = state && typeof state === 'object' && 'closeMenuTab' in state && typeof state.closeMenuTab === 'string'
      ? tabPath(state.closeMenuTab) : null
    setTabs((previous) => {
      const prev = closingPath && closingPath !== '/' && closingPath !== currentTabPath
        ? previous.filter(tab => tab.path !== closingPath) : previous
      const exists = prev.find(t => t.path === currentTabPath)
      if (exists) {
        // 首页固定保留 i18n key，不能被 getMenuName 解析后的文案覆盖（否则切语言不跟随）
        if (currentTabPath === '/') return prev
        // 同一基礎路徑復用標籤時同步標題：新增/編輯共用一條路由（query 不進 tabPath）時，
        // 否則從「新增預算」跳到「調整預算」標題會停在「新增預算」。
        const nextTitle = getMenuName(fullPath)
        return exists.title === nextTitle && exists.fullPath === fullPath
          ? prev
          : prev.map(t => (t.path === currentTabPath ? { ...t, title: nextTitle, fullPath } : t))
      }
      // 若當前路徑的基礎路徑已存在標籤（含 query），更新該標籤路徑與標題
      const normalizedBase = normalizePath(currentTabPath)
      if (normalizedBase !== currentTabPath) {
        const baseIdx = prev.findIndex(t => t.path === normalizedBase)
        if (baseIdx >= 0) {
          const title = getMenuName(fullPath)
          const updated = [...prev]
          updated[baseIdx] = { path: currentTabPath, title, fullPath }
          return updated
        }
      }
      const title = getMenuName(fullPath)
      return [...prev, { path: currentTabPath, title, fullPath }]
    })
    if (closingPath && state && typeof state === 'object') {
      // 消费一次性关闭指令，避免浏览器后退到列表时再次关闭后来新开的标签。
      const remainingState = { ...state }
      delete (remainingState as { closeMenuTab?: unknown }).closeMenuTab
      navigate(fullPath, { replace: true, state: remainingState })
    }
  }, [location.pathname, location.search, location.state, navigate, getMenuName, isDeniedRoute])

  /** 清理当前用户无权限的标签（含从 localStorage 恢复的越权历史标签），避免菜单名泄漏与反复 403 */
  useEffect(() => {
    setTabs((prev) => {
      const kept = prev.filter((tab) =>
        tab.path === '/' || !isDeniedRoute(normalizePath(tab.path), tab.path.split('?')[1] ?? ''),
      )
      return kept.length === prev.length ? prev : kept
    })
  }, [isDeniedRoute])

  /** 语言变化时刷新所有标签名称 */
  useEffect(() => {
    setTabs((prev) => prev.map((tab) => ({
      ...tab,
      title: tab.path === '/' ? HOME_TAB.title : getMenuName(tab.fullPath ?? tab.path),
    })))
  }, [i18nInstance.language, translationRevision, getMenuName])

  /** 点击标签：导航到对应路径（离开当前页前先过未保存保护） */
  const handleTabClick = useCallback(async (path: string) => {
    const currentFullPath = location.pathname + location.search
    if (path === tabPath(currentFullPath)) return
    const target = tabs.find(tab => tab.path === path)?.fullPath ?? path
    // 把目标路径告诉守卫：确认后那一次导航只放行一次，不再重复弹框
    const decision = confirmLeave(target)
    if (decision !== true && !await decision) return
    navigate(target)
  }, [navigate, location.pathname, location.search, confirmLeave, tabs])

  /** 关闭标签：只有关闭的是当前页时才需要离开确认 */
  const handleClose = useCallback(async (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    const currentPath = tabPath(location.pathname + location.search)
    const closingActive = path === currentPath
    if (tabs.length <= 1) return
    const idx = tabs.findIndex(t => t.path === path)
    const remaining = tabs.filter(t => t.path !== path)
    const closeTarget = remaining.length > 0
      ? (remaining[Math.max(0, Math.min(idx, remaining.length - 1))].fullPath
        ?? remaining[Math.max(0, Math.min(idx, remaining.length - 1))].path)
      : '/'
    if (closingActive) {
      const decision = confirmLeave(closeTarget)
      if (decision !== true && !await decision) return
    }
    const next = remaining
    setTabs(next)
    if (closingActive && next.length > 0) {
      const target = next[Math.max(0, Math.min(idx, next.length - 1))]
      navigate(target.fullPath ?? target.path)
    }
  }, [navigate, location.pathname, location.search, confirmLeave, tabs])

  /** 当前激活的路径 */
  const activePath = tabPath(location.pathname + location.search)

  /** 自动滚动激活标签到可视区域 */
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const activeEl = container.querySelector('.menu-tab-item--active') as HTMLElement | null
    if (activeEl) {
      const cRect = container.getBoundingClientRect()
      const eRect = activeEl.getBoundingClientRect()
      if (eRect.right > cRect.right || eRect.left < cRect.left) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }
  }, [activePath])

  /** 右键菜单 */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string } | null>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, path })
  }, [])

  useEffect(() => {
    if (!ctxMenu) return
    const handler = () => setCtxMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [ctxMenu])

  const handleCloseOthers = useCallback(async (path: string) => {
    // 目标页不是当前页 → 会离开当前编辑页，必须先确认
    const target = tabs.find(t => t.path === path)?.fullPath ?? path
    if (path !== activePath) {
      const decision = confirmLeave(target)
      if (decision !== true && !await decision) {
        setCtxMenu(null)
        return
      }
    }
    setTabs(tabs.filter(t => t.path === path || t.path === '/'))
    if (path !== activePath) navigate(target)
    setCtxMenu(null)
  }, [navigate, activePath, confirmLeave, tabs])

  const handleCloseRight = useCallback(async (path: string) => {
    const idx = tabs.findIndex(t => t.path === path)
    const activeIdx = tabs.findIndex(t => t.path === activePath)
    // 当前页在待关闭范围内（且不是保留点）时会离开它
    const target = tabs.find(t => t.path === path)?.fullPath ?? path
    if (activeIdx > idx && activePath !== '/') {
      const decision = confirmLeave(target)
      if (decision !== true && !await decision) {
        setCtxMenu(null)
        return
      }
    }
    const kept = tabs.filter((tab, i) => i <= idx || tab.path === '/')
    setTabs(kept)
    if (!kept.some(t => t.path === activePath)) {
      navigate(target)
    }
    setCtxMenu(null)
  }, [navigate, activePath, tabs, confirmLeave])

  const handleCloseAll = useCallback(async () => {
    // 关闭全部必然离开当前页：先过未保存保护
    const decision = confirmLeave('/')
    if (decision !== true && !await decision) {
      setCtxMenu(null)
      return
    }
    setTabs([HOME_TAB])
    navigate('/')
    setCtxMenu(null)
  }, [navigate, confirmLeave])

  if (tabs.length === 0) return null

  return (
    <>
      <div className="menu-tabs-bar">
        <div className="menu-tabs-scroll" ref={scrollRef}>
          {tabs.map((tab) => (
            <div
              key={tab.path}
              className={`menu-tab-item${tab.path === activePath ? ' menu-tab-item--active' : ''}`}
              onClick={() => handleTabClick(tab.path)}
              onContextMenu={(e) => handleContextMenu(e, tab.path)}
            >
              {tab.path === '/' && <HomeOutlined className="menu-tab-home-icon" />}
              <span className="menu-tab-title">{resolveTitle(tab.title, t)}</span>
              {tabs.length > 1 && (
                <span
                  className="menu-tab-close"
                  onClick={(e) => handleClose(e, tab.path)}
                  title={t('common.close')}
                >
                  <CloseOutlined />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {ctxMenu && (
        <div
          className="menu-tabs-context"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="menu-tabs-context-item" onClick={() => handleCloseOthers(ctxMenu.path)}>
            {t('common.closeOthers')}
          </div>
          <div className="menu-tabs-context-item" onClick={() => handleCloseRight(ctxMenu.path)}>
            {t('common.closeRight')}
          </div>
          {ctxMenu.path !== '/' && (
            <div className="menu-tabs-context-item menu-tabs-context-item--danger" onClick={handleCloseAll}>
              {t('common.closeAll')}
            </div>
          )}
        </div>
      )}
    </>
  )
}
