/**
 * 發布批次詳情 —— 全流程（檢查 / 申請 / 裁決 / 部署 / 驗證 / 開放 / 回滾 / 緊急豁免 / 產品補驗）
 *
 * 变更影响：前端（消费真实后端契约 + allowedActions 单一真相源）
 * 安全边界：仅前端展示层，所有写操作走后端 API，前端绝不放宽任何门禁
 *
 * <p><b>按钮口径单一真相源 = 后端 `/rdm/release-batch/{id}/actions` 下发的 allowedActions</b>：
 * <ul>
 *   <li>未下发的动作码一律不渲染对应按钮；</li>
 *   <li>下发的动作码 ∩ 菜单权限 {@code rdm-delivery-release:edit} 后才可点，否则置灰并提示无权限；</li>
 *   <li>灰度未开启时后端不下发推进码（apply、decide、deploy、verify、open、exemption_apply、
 *       exemption_decide、supplementary_complete），前端据此自然不渲染；</li>
 *   <li>{@code rollback} 是<b>止损例外</b>：只要在 deploying/verifying/released 且为发布负责人即下发，
 *       即使灰度关闭/证据过期也正常渲染；</li>
 *   <li>点击后仍可能被服务层硬门禁（证据 / 四眼 / 构建不可变 / 裁决有效期）拒绝，前端优雅呈现后端 message，
 *       绝不自行放宽。</li>
 * </ul>
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Alert, Button, Checkbox, Col, Descriptions, Form, Input, InputNumber, Modal,
  Radio, Row, Select, Space, Spin, Table, Tag, Timeline, Tooltip, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AuditOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
  CloudUploadOutlined, ExclamationCircleOutlined, FileDoneOutlined, PlusOutlined,
  ReloadOutlined, RocketOutlined, RollbackOutlined, SafetyCertificateOutlined, UnlockOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import RdmFormHeader from './components/RdmFormHeader'
import HelpPopover from '../../components/HelpPopover'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchReleaseBatchDetail,
  fetchReleaseBatchActions,
  checkReleaseBatch,
  applyReleaseBatch,
  decideReleaseBatch,
  submitReleaseDeployment,
  submitReleaseVerification,
  openReleaseBatch,
  rollbackReleaseBatch,
  applyReleaseExemption,
  decideReleaseExemption,
  completeReleaseSupplementary,
  type RdmReleaseBatchDetail as RdmReleaseBatchDetailType,
  type RdmReleaseCheckResult,
  type RdmReleaseDeploymentRecord,
  type RdmReleaseExemptionRecord,
  type RdmReleaseSupplementaryRecord,
  type RdmEntityAction,
} from '../../api/rdm'
import {
  RDM_RELEASE_BATCH_STATUS,
  RDM_RELEASE_BATCH_STATUS_COLOR,
  RDM_RELEASE_BATCH_STATUS_LABEL,
  RDM_DEPLOY_STATUS_COLOR,
  RDM_DEPLOY_STATUS_LABEL,
  RDM_VERIFY_STATUS,
  RDM_VERIFY_STATUS_LABEL,
  RDM_VERIFY_STATUS_COLOR,
  RDM_OPEN_STATUS,
  RDM_OPEN_STATUS_LABEL,
  RDM_OPEN_STATUS_COLOR,
  RDM_RELEASE_CHECK_TYPE_LABEL,
  RDM_DECISION,
  RDM_DECISION_LABEL,
  RDM_EXEMPTION_DECISION_TYPE,
  RDM_EXEMPTION_DECISION_TYPE_LABEL,
  RDM_SUPPLEMENTARY_STATUS,
  RDM_SUPPLEMENTARY_STATUS_LABEL,
  RDM_SUPPLEMENTARY_STATUS_COLOR,
  RDM_SUPPLEMENTARY_RESULT,
  RDM_SUPPLEMENTARY_RESULT_LABEL,
} from '../../constants/rdm'
import './index.css'

/** 后端契约动作码（与 RdmAllowedActionsService.computeReleaseBatchActions 逐字一致） */
const ACTION = {
  VIEW: 'view',
  ADD_ITEM: 'add_item',
  APPLY: 'apply',
  DECIDE: 'decide',
  DEPLOY: 'deploy',
  VERIFY: 'verify',
  OPEN: 'open',
  ROLLBACK: 'rollback',
  EXEMPTION_APPLY: 'exemption_apply',
  EXEMPTION_DECIDE: 'exemption_decide',
  SUPPLEMENTARY_COMPLETE: 'supplementary_complete',
} as const

/** 动作码 → 图标（label 用后端下发文案，图标前端固定语义） */
const ACTION_ICON: Record<string, ReactNode> = {
  [ACTION.ADD_ITEM]: <PlusOutlined />,
  [ACTION.APPLY]: <RocketOutlined />,
  [ACTION.DECIDE]: <AuditOutlined />,
  [ACTION.DEPLOY]: <CloudUploadOutlined />,
  [ACTION.VERIFY]: <CheckCircleOutlined />,
  [ACTION.OPEN]: <UnlockOutlined />,
  [ACTION.ROLLBACK]: <RollbackOutlined />,
  [ACTION.EXEMPTION_APPLY]: <SafetyCertificateOutlined />,
  [ACTION.EXEMPTION_DECIDE]: <AuditOutlined />,
  [ACTION.SUPPLEMENTARY_COMPLETE]: <FileDoneOutlined />,
}

export default function ReleaseBatchDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const batchId = Number(searchParams.get('id')) || 0
  const { hasPermission } = useAuth()
  /** 写动作菜单权限：allowedActions ∩ 此权限才可点（与后端 @RequirePermission(action=edit) 一致） */
  const canEdit = hasPermission('rdm-delivery-release:edit')

  // ===== 页面状态 =====
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<RdmReleaseBatchDetailType | null>(null)
  const [checkResults, setCheckResults] = useState<RdmReleaseCheckResult[]>([])
  const [actions, setActions] = useState<RdmEntityAction[]>([])
  const [checking, setChecking] = useState(false)

  // ===== 弹窗状态 =====
  const [deployModalOpen, setDeployModalOpen] = useState(false)
  const [verifyModalOpen, setVerifyModalOpen] = useState(false)
  const [openModalOpen, setOpenModalOpen] = useState(false)
  const [rollbackModalOpen, setRollbackModalOpen] = useState(false)
  const [decideModalOpen, setDecideModalOpen] = useState(false)
  const [exemptionModalOpen, setExemptionModalOpen] = useState(false)
  const [exemptionDecideModalOpen, setExemptionDecideModalOpen] = useState(false)
  const [supplementaryModalOpen, setSupplementaryModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  /** 待裁决的在途豁免单（exemption_decide 目标） */
  const [exemptionTarget, setExemptionTarget] = useState<RdmReleaseExemptionRecord | null>(null)

  const [deployForm] = Form.useForm()
  const [verifyForm] = Form.useForm()
  const [openForm] = Form.useForm()
  const [rollbackForm] = Form.useForm()
  const [decideForm] = Form.useForm()
  const [exemptionForm] = Form.useForm()
  const [exemptionDecideForm] = Form.useForm()
  const [supplementaryForm] = Form.useForm()

  // ===== 数据加载 =====
  const loadDetail = useCallback(async () => {
    if (!batchId) { setError('缺少批次 ID'); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const [data, acts] = await Promise.all([
        fetchReleaseBatchDetail(batchId),
        // actions 失败降级为空：只影响按钮渲染，不阻断详情展示（读接口降级）
        fetchReleaseBatchActions(batchId).catch(() => [] as RdmEntityAction[]),
      ])
      setDetail(data)
      setCheckResults(data.checkResults ?? [])
      setActions(acts)
    } catch (err) {
      setError(err instanceof Error ? err.message : '發布批次詳情載入失敗')
    } finally {
      setLoading(false)
    }
  }, [batchId])

  useEffect(() => { loadDetail() }, [loadDetail])

  /** 动作码 → 动作对象；按钮渲染的唯一依据（未下发即不渲染） */
  const actionMap = useMemo(() => new Map(actions.map(a => [a.code, a])), [actions])

  // ===== 操作 =====
  const handleCheck = async () => {
    setChecking(true)
    try {
      const results = await checkReleaseBatch(batchId)
      setCheckResults(results)
      message.success('檢查完成')
      loadDetail()
    } catch {
      // request.ts 已统一弹后端原因，不双弹
    } finally {
      setChecking(false)
    }
  }

  const handleApply = async () => {
    try {
      await applyReleaseBatch(batchId)
      message.success('已提交發布申請')
      loadDetail()
    } catch { /* request.ts 已统一弹后端原因（灰度/门禁），不双弹 */ }
  }

  const handleDecideSubmit = async () => {
    try {
      const values = await decideForm.validateFields()
      setSubmitting(true)
      // decision 取值必为 approved/rejected（不是 approve/reject），与后端一字不差；expectedVersion 回传批次 version
      await decideReleaseBatch(batchId, {
        decision: values.decision,
        reason: values.reason || undefined,
        expectedVersion: detail?.version,
      })
      message.success(values.decision === RDM_DECISION.APPROVED ? '已批准發布' : '已駁回發布')
      setDecideModalOpen(false)
      decideForm.resetFields()
      loadDetail()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      // 硬门禁/四眼失败由 request.ts 弹后端 message，此处不覆盖
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeploySubmit = async () => {
    try {
      const values = await deployForm.validateFields()
      setSubmitting(true)
      await submitReleaseDeployment(batchId, {
        systemCode: values.systemCode,
        deployStatus: values.deployStatus,
        buildId: values.buildId || undefined,
        expectedVersion: detail?.version,
      })
      message.success('部署結果已記錄')
      setDeployModalOpen(false)
      deployForm.resetFields()
      loadDetail()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
    } finally {
      setSubmitting(false)
    }
  }

  const handleVerifySubmit = async () => {
    try {
      const values = await verifyForm.validateFields()
      setSubmitting(true)
      await submitReleaseVerification(batchId, {
        systemCode: values.systemCode,
        verifyStatus: values.verifyStatus,
        remark: values.remark || undefined,
        expectedVersion: detail?.version,
      })
      message.success('驗證結果已記錄')
      setVerifyModalOpen(false)
      verifyForm.resetFields()
      loadDetail()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
    } finally {
      setSubmitting(false)
    }
  }

  /** 登记业务开放：开放是独立事实，绝不由「验证通过」推导 */
  const handleOpenSubmit = async () => {
    try {
      const values = await openForm.validateFields()
      setSubmitting(true)
      await openReleaseBatch(batchId, {
        systemCodes: values.systemCodes?.length ? values.systemCodes : undefined,
        openStatus: values.openStatus || RDM_OPEN_STATUS.OPENED,
        remark: values.remark || undefined,
        expectedVersion: detail?.version,
      })
      message.success('業務開放已登記')
      setOpenModalOpen(false)
      openForm.resetFields()
      loadDetail()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
    } finally {
      setSubmitting(false)
    }
  }

  const handleRollbackSubmit = async () => {
    try {
      const values = await rollbackForm.validateFields()
      Modal.confirm({
        title: '二次確認',
        className: 'custom-confirm-modal',
        icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
        content: '回滾是不可逆的止損操作，確認要執行回滾嗎？',
        okText: '確認回滾',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          setSubmitting(true)
          try {
            await rollbackReleaseBatch(batchId, {
              reason: values.reason,
              systemCodes: values.systemCodes?.length ? values.systemCodes : undefined,
              expectedVersion: detail?.version,
            })
            message.success('回滾已執行')
            setRollbackModalOpen(false)
            rollbackForm.resetFields()
            loadDetail()
          } catch {
            // request.ts 已统一弹后端原因（回滚常被门禁拦下），不双弹
          } finally {
            setSubmitting(false)
          }
        },
      })
    } catch { /* validation error */ }
  }

  /** 申请紧急豁免（只可豁免缺失的产品验收；业务验收永不可豁免） */
  const handleExemptionSubmit = async () => {
    try {
      const values = await exemptionForm.validateFields()
      setSubmitting(true)
      await applyReleaseExemption(batchId, {
        reason: values.reason,
        risk: values.risk,
        rollbackPlan: values.rollbackPlan,
        expectedVersion: detail?.version,
      })
      message.success('緊急豁免申請已提交，待兩類裁決齊備')
      setExemptionModalOpen(false)
      exemptionForm.resetFields()
      loadDetail()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
    } finally {
      setSubmitting(false)
    }
  }

  /** 打开豁免裁决弹窗：定位在途豁免单（两类裁决未齐备）与其缺失的裁决类型 */
  const openExemptionDecide = () => {
    const target = (detail?.exemptions ?? []).find(e => {
      const types = new Set((e.decisions ?? []).map(d => d.decisionType))
      return !(types.has(RDM_EXEMPTION_DECISION_TYPE.PRODUCT_RISK) && types.has(RDM_EXEMPTION_DECISION_TYPE.RELEASE))
    })
    if (!target) { message.warning('目前沒有待裁決的在途豁免單'); return }
    setExemptionTarget(target)
    exemptionDecideForm.resetFields()
    setExemptionDecideModalOpen(true)
  }

  const handleExemptionDecideSubmit = async () => {
    if (!exemptionTarget) return
    try {
      const values = await exemptionDecideForm.validateFields()
      setSubmitting(true)
      await decideReleaseExemption(batchId, exemptionTarget.id, {
        decisionType: values.decisionType,
        decision: values.decision,
        reason: values.reason,
        expectedVersion: detail?.version,
      })
      message.success('豁免裁決已提交')
      setExemptionDecideModalOpen(false)
      exemptionDecideForm.resetFields()
      setExemptionTarget(null)
      loadDetail()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      // 四眼失败（申请人自批/管理员自批）由 request.ts 弹后端 message
    } finally {
      setSubmitting(false)
    }
  }

  const openSupplementary = () => {
    supplementaryForm.resetFields()
    setSupplementaryModalOpen(true)
  }

  /** 登记产品补验完成：仅冻结的补验人本人可登记（无 admin 直通）；expectedVersion 取补验单 version */
  const handleSupplementarySubmit = async () => {
    try {
      const values = await supplementaryForm.validateFields()
      setSubmitting(true)
      const target = (detail?.supplementaries ?? []).find(s => s.id === Number(values.supplementaryId))
      await completeReleaseSupplementary(Number(values.supplementaryId), {
        acceptanceRecordId: Number(values.acceptanceRecordId),
        result: values.result,
        evidenceJson: values.evidenceJson || undefined,
        expectedVersion: target?.version ?? undefined,
      })
      message.success('補驗完成已登記')
      setSupplementaryModalOpen(false)
      supplementaryForm.resetFields()
      loadDetail()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * 渲染一个由 allowedActions 驱动的动作按钮：
   * 未下发 → 不渲染；下发但无菜单权限 → 置灰 + 提示原因；下发且有权限 → 可点。
   */
  const actionButton = (code: string, onClick: () => void, opts?: { danger?: boolean }) => {
    const act = actionMap.get(code)
    if (!act) return null
    const disabled = !canEdit
    const danger = opts?.danger ?? act.tone === 'danger'
    const btnType = danger ? 'default' : (act.tone === 'primary' || act.tone === 'success' ? 'primary' : 'default')
    const btn = (
      <Button key={code} danger={danger} type={btnType} icon={ACTION_ICON[code]} disabled={disabled} onClick={onClick}>
        {act.label}
      </Button>
    )
    return disabled
      ? <Tooltip key={code} title="無操作權限（需 rdm-delivery-release:edit）"><span style={{ display: 'inline-block' }}>{btn}</span></Tooltip>
      : btn
  }

  // ===== 派生数据 =====
  const deployedSystems = useMemo(() => detail?.deployments?.filter(d => d.deployStatus === 'success') ?? [], [detail?.deployments])
  const verifiedSystems = useMemo(() => detail?.deployments?.filter(d => d.verifyStatus === RDM_VERIFY_STATUS.PASSED) ?? [], [detail?.deployments])
  const systemOptions = useMemo(
    () => (detail?.deployments ?? []).map(d => ({ value: d.systemCode, label: d.systemName || d.systemCode })),
    [detail?.deployments],
  )
  /** 待补验（pending/overdue）补验单，供 supplementary_complete 选择 */
  const pendingSupplementaries = useMemo(
    () => (detail?.supplementaries ?? []).filter(s => s.status === RDM_SUPPLEMENTARY_STATUS.PENDING || s.status === RDM_SUPPLEMENTARY_STATUS.OVERDUE),
    [detail?.supplementaries],
  )
  /** 在途豁免单缺失的裁决类型（供 exemption_decide 单选） */
  const missingDecisionTypes = useMemo(() => {
    if (!exemptionTarget) return [] as string[]
    const types = new Set((exemptionTarget.decisions ?? []).map(d => d.decisionType))
    return [RDM_EXEMPTION_DECISION_TYPE.PRODUCT_RISK, RDM_EXEMPTION_DECISION_TYPE.RELEASE].filter(t => !types.has(t))
  }, [exemptionTarget])

  // ===== 部署表格列 =====
  const deployColumns: TableColumnsType<RdmReleaseDeploymentRecord> = useMemo(() => {
    const cols: TableColumnsType<RdmReleaseDeploymentRecord> = [
      { title: '順序', dataIndex: 'deployOrder', key: 'order', width: 60, render: (v: number) => v ?? '-' },
      { title: '系統編碼', dataIndex: 'systemCode', key: 'code', width: 130 },
      { title: '系統名稱', dataIndex: 'systemName', key: 'name', width: 140, render: (v?: string) => v || '-' },
      { title: '構建標識', dataIndex: 'buildId', key: 'buildId', width: 130, render: (v?: string) => v || '-' },
      {
        title: '部署狀態', dataIndex: 'deployStatus', key: 'deployStatus', width: 100,
        render: (v: string) => <Tag color={RDM_DEPLOY_STATUS_COLOR[v] ?? 'default'}>{RDM_DEPLOY_STATUS_LABEL[v] ?? v}</Tag>,
      },
      {
        title: '部署時間', dataIndex: 'deployTime', key: 'deployTime', width: 150,
        render: (v?: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
      },
      {
        title: '驗證狀態', dataIndex: 'verifyStatus', key: 'verifyStatus', width: 90,
        render: (v: string) => <Tag color={RDM_VERIFY_STATUS_COLOR[v] ?? 'default'}>{RDM_VERIFY_STATUS_LABEL[v] ?? '待驗證'}</Tag>,
      },
      {
        title: '驗證時間', dataIndex: 'verifyTime', key: 'verifyTime', width: 150,
        render: (v?: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
      },
      {
        title: '開放狀態', dataIndex: 'openStatus', key: 'openStatus', width: 90,
        render: (v: string) => <Tag color={RDM_OPEN_STATUS_COLOR[v] ?? 'default'}>{RDM_OPEN_STATUS_LABEL[v] ?? '待開放'}</Tag>,
      },
      { title: '操作人', dataIndex: 'operatorUserName', key: 'operator', width: 100, render: (v?: string) => v || '-' },
    ]
    // 行级操作同样由 allowedActions ∩ 权限驱动（不再由 status 单独决定）
    if (actionMap.has(ACTION.DEPLOY) && canEdit) {
      cols.push({
        title: '操作', key: 'action', width: 120, fixed: 'right',
        render: (_, r) => (
          <Button type="link" size="small" onClick={() => {
            deployForm.setFieldsValue({ systemCode: r.systemCode })
            setDeployModalOpen(true)
          }}>記錄部署</Button>
        ),
      })
    } else if (actionMap.has(ACTION.VERIFY) && canEdit) {
      cols.push({
        title: '操作', key: 'action', width: 120, fixed: 'right',
        render: (_, r) => (
          <Button type="link" size="small" onClick={() => {
            verifyForm.setFieldsValue({ systemCode: r.systemCode })
            setVerifyModalOpen(true)
          }}>記錄驗證</Button>
        ),
      })
    }
    return cols
  }, [actionMap, canEdit, deployForm, verifyForm])

  // ===== 时间线事件 =====
  const timelineItems = useMemo(() => {
    if (!detail) return []
    const items: { color: string; children: ReactNode }[] = []

    items.push({
      color: 'blue',
      children: (
        <div>
          <strong>創建批次</strong>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{detail.applicantUserName || '-'} · {detail.createdAt ? dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm') : '-'}</div>
        </div>
      ),
    })

    if (checkResults.length > 0) {
      const passed = checkResults.filter(c => c.passed).length
      const totalChecks = checkResults.length
      items.push({
        color: passed === totalChecks ? 'green' : 'red',
        children: (
          <div>
            <strong>放行檢查</strong>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>
              {passed === totalChecks ? '全部通過' : `${totalChecks - passed} 項未通過`}
            </div>
          </div>
        ),
      })
    }

    if (detail.applicantUserName && detail.status !== RDM_RELEASE_BATCH_STATUS.PLANNING) {
      items.push({
        color: 'blue',
        children: (
          <div>
            <strong>申請發布</strong>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>{detail.applicantUserName}</div>
          </div>
        ),
      })
    }

    if (detail.approvalUserName && detail.approvalTime) {
      const isApproved = detail.status !== RDM_RELEASE_BATCH_STATUS.ROLLED_BACK
      items.push({
        color: isApproved ? 'green' : 'red',
        children: (
          <div>
            <strong>{isApproved ? '審批通過' : '審批拒絕'}</strong>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>{detail.approvalUserName} · {dayjs(detail.approvalTime).format('YYYY-MM-DD HH:mm')}</div>
          </div>
        ),
      })
    }

    if (detail.deployments?.length) {
      detail.deployments.forEach(dep => {
        if (dep.deployTime) {
          items.push({
            color: dep.deployStatus === 'success' ? 'green' : dep.deployStatus === 'failed' ? 'red' : 'blue',
            children: (
              <div>
                <strong>部署 {dep.systemName || dep.systemCode}</strong>
                <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                  {RDM_DEPLOY_STATUS_LABEL[dep.deployStatus] ?? dep.deployStatus} · {dayjs(dep.deployTime).format('MM-DD HH:mm')}
                  {dep.operatorUserName ? ` · ${dep.operatorUserName}` : ''}
                </div>
              </div>
            ),
          })
        }
        if (dep.verifyTime) {
          items.push({
            color: dep.verifyStatus === RDM_VERIFY_STATUS.PASSED ? 'green' : dep.verifyStatus === RDM_VERIFY_STATUS.FAILED ? 'red' : 'blue',
            children: (
              <div>
                <strong>驗證 {dep.systemName || dep.systemCode}</strong>
                <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                  {RDM_VERIFY_STATUS_LABEL[dep.verifyStatus] ?? dep.verifyStatus} · {dayjs(dep.verifyTime).format('MM-DD HH:mm')}
                </div>
              </div>
            ),
          })
        }
      })
    }

    if (detail.status === RDM_RELEASE_BATCH_STATUS.RELEASED) {
      items.push({
        color: 'green',
        children: <div><strong>發布完成</strong><div style={{ fontSize: 12, color: '#8C8C8C' }}>{detail.updatedAt ? dayjs(detail.updatedAt).format('YYYY-MM-DD HH:mm') : ''}</div></div>,
      })
    }

    if (detail.status === RDM_RELEASE_BATCH_STATUS.ROLLED_BACK) {
      items.push({
        color: 'red',
        children: (
          <div>
            <strong>已回滾</strong>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>{detail.rollbackReason || ''} · {detail.updatedAt ? dayjs(detail.updatedAt).format('YYYY-MM-DD HH:mm') : ''}</div>
          </div>
        ),
      })
    }

    return items
  }, [detail, checkResults])

  // ===== 渲染 =====
  if (loading) {
    return <div className="content-area" style={{ textAlign: 'center', padding: 80 }}><Spin size="large" tip="載入中..." /></div>
  }

  if (error || !detail) {
    return (
      <div className="content-area">
        <Alert type="error" showIcon message="載入失敗" description={error || '未找到發布批次'} style={{ marginBottom: 16 }}
          action={<Button size="small" onClick={loadDetail}>重試</Button>} />
        <Button onClick={() => navigate(-1)}>返回</Button>
      </div>
    )
  }

  const s = detail.status
  const projectId = (detail as unknown as { projectId?: number }).projectId
  const grayscaleOff = detail.v3ReleaseEnabled === false

  return (
    <div className="content-area">
      <RdmFormHeader
        title={`發布批次 ${detail.batchNo}`}
        onBack={() => navigate(-1)}
        badge={<Tag color={RDM_RELEASE_BATCH_STATUS_COLOR[s] ?? 'default'}>{RDM_RELEASE_BATCH_STATUS_LABEL[s] ?? s}</Tag>}
        right={
          <Space wrap>
            {actionButton(ACTION.ADD_ITEM, () => navigate(`/rdm-delivery-item?mode=create&batchId=${batchId}${projectId ? `&projectId=${projectId}` : ''}`))}
            {(s === RDM_RELEASE_BATCH_STATUS.PLANNING || s === RDM_RELEASE_BATCH_STATUS.CHECKING) && canEdit && (
              <Button icon={<SafetyCertificateOutlined />} loading={checking} onClick={handleCheck}>執行檢查</Button>
            )}
            {actionButton(ACTION.APPLY, handleApply)}
            {actionButton(ACTION.DECIDE, () => { decideForm.resetFields(); setDecideModalOpen(true) })}
            {actionButton(ACTION.DEPLOY, () => { deployForm.resetFields(); setDeployModalOpen(true) })}
            {actionButton(ACTION.VERIFY, () => { verifyForm.resetFields(); setVerifyModalOpen(true) })}
            {actionButton(ACTION.OPEN, () => { openForm.resetFields(); setOpenModalOpen(true) })}
            {actionButton(ACTION.EXEMPTION_APPLY, () => { exemptionForm.resetFields(); setExemptionModalOpen(true) })}
            {actionButton(ACTION.EXEMPTION_DECIDE, openExemptionDecide)}
            {actionButton(ACTION.SUPPLEMENTARY_COMPLETE, openSupplementary)}
            {/* rollback 是止损例外：只要后端下发即渲染（不受灰度门控影响） */}
            {actionButton(ACTION.ROLLBACK, () => { rollbackForm.resetFields(); setRollbackModalOpen(true) }, { danger: true })}
            <Button icon={<ReloadOutlined />} onClick={loadDetail}>刷新</Button>
          </Space>
        }
      />

      {/* 灰度未开启说明：推进码后端不下发，前端自然不渲染；rollback 例外 */}
      {grayscaleOff && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="本項目 V3 發布灰度未開啟"
          description="推進動作（申請 / 裁決 / 部署 / 驗證 / 開放 / 緊急豁免 / 產品補驗）在灰度開啟前不可用；回滾為止損動作，不受灰度門控影響。"
        />
      )}

      {/* ===== Section 1: 批次摘要 ===== */}
      <div className="rdm-release-section">
        <h3 className="rdm-release-section-title"><ClockCircleOutlined style={{ marginRight: 6 }} />批次摘要</h3>
        <Descriptions column={{ xs: 1, sm: 2, md: 4 }} size="small" bordered>
          <Descriptions.Item label="批次號">{detail.batchNo}</Descriptions.Item>
          <Descriptions.Item label="版本標識"><strong>{detail.versionTag}</strong></Descriptions.Item>
          <Descriptions.Item label="狀態">
            <Tag color={RDM_RELEASE_BATCH_STATUS_COLOR[s] ?? 'default'}>{RDM_RELEASE_BATCH_STATUS_LABEL[s] ?? s}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="計劃時間">{detail.planTime ? dayjs(detail.planTime).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
          <Descriptions.Item label="發布負責人">{detail.releaseOwnerUserName || '-'}</Descriptions.Item>
          <Descriptions.Item label="申請人">{detail.applicantUserName || '-'}</Descriptions.Item>
          <Descriptions.Item label="審批人">{detail.approvalUserName || '-'}</Descriptions.Item>
          <Descriptions.Item label="審批時間">{detail.approvalTime ? dayjs(detail.approvalTime).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
          <Descriptions.Item label="裁決有效期">
            {detail.approvalExpiresAt ? dayjs(detail.approvalExpiresAt).format('YYYY-MM-DD HH:mm') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="驗證通過">{detail.verificationPassed == null ? '-' : detail.verificationPassed ? '是' : '否'}</Descriptions.Item>
          <Descriptions.Item label="已開放系統">{detail.openedCount ?? 0}</Descriptions.Item>
          <Descriptions.Item label="關聯項目">
            {detail.projectName ? (
              <a onClick={() => navigate(`/rdm-project-detail?id=${projectId ?? ''}`)}>{detail.projectName}</a>
            ) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="創建時間">{detail.createdAt ? dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
          <Descriptions.Item label="更新時間">{detail.updatedAt ? dayjs(detail.updatedAt).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
        </Descriptions>
        {s === RDM_RELEASE_BATCH_STATUS.ROLLED_BACK && detail.rollbackReason && (
          <Alert type="error" showIcon style={{ marginTop: 12 }} message={`回滾原因：${detail.rollbackReason}`} />
        )}
      </div>

      {/* ===== Section 2: 放行檢查 ===== */}
      <div className="rdm-release-section">
        <h3 className="rdm-release-section-title">
          <SafetyCertificateOutlined style={{ marginRight: 6 }} />放行檢查
          <HelpPopover
            title="放行檢查項說明"
            ariaLabel="放行檢查項說明"
            content={[
              { tone: 'info', label: '測試通過（test）', body: '關聯交付項的提測批次是否已全部通過' },
              { tone: 'info', label: '驗收完成（acceptance）', body: '產品驗收是否建立、路徑A的業務驗收是否在上線前完成' },
              { tone: 'danger', label: '缺陷閉環（defect）', body: '是否存在致命/嚴重級別未閉環缺陷' },
              { tone: 'warn', label: '依賴就緒（dependency）', body: '部署系統間的依賴順序是否滿足' },
              { tone: 'neutral', label: '範圍一致（scope）', body: '發布範圍是否與立項/凍結時的計劃一致' },
            ]}
          />
        </h3>
        {checkResults.length > 0 ? (
          <>
            {checkResults.every(c => c.passed) ? (
              <Alert type="success" showIcon message="全部通過" description="所有檢查項均已通過，可以申請發布" style={{ marginBottom: 12 }} />
            ) : (
              <Alert type="error" showIcon
                message={`${checkResults.filter(c => !c.passed).length} 項未通過`}
                description="存在未通過的檢查項，請處理後重新檢查"
                style={{ marginBottom: 12 }}
              />
            )}
            <div className="rdm-release-checklist">
              {checkResults.map((item, idx) => (
                <div key={idx} className={`rdm-release-check-item ${item.passed ? 'passed' : 'failed'}`}>
                  <span className="rdm-release-check-icon">
                    {item.passed
                      ? <CheckCircleOutlined style={{ color: '#52C41A', fontSize: 16 }} />
                      : <CloseCircleOutlined style={{ color: '#FF4D4F', fontSize: 16 }} />}
                  </span>
                  <span className="rdm-release-check-type">{RDM_RELEASE_CHECK_TYPE_LABEL[item.checkType] ?? item.checkType}</span>
                  <span className="rdm-release-check-msg">{item.message || '-'}</span>
                </div>
              ))}
            </div>
            {(s === RDM_RELEASE_BATCH_STATUS.PLANNING || s === RDM_RELEASE_BATCH_STATUS.CHECKING) && canEdit && (
              <Button icon={<ReloadOutlined />} loading={checking} onClick={handleCheck} style={{ marginTop: 12 }}>重新檢查</Button>
            )}
          </>
        ) : (
          <Alert type="info" showIcon message="尚未執行檢查" description="請點擊「執行檢查」按鈕啟動放行檢查" style={{ marginBottom: 12 }} />
        )}
      </div>

      {/* ===== Section 3: 系統部署 ===== */}
      <div className="rdm-release-section">
        <h3 className="rdm-release-section-title"><CloudUploadOutlined style={{ marginRight: 6 }} />系統部署</h3>
        {detail.deployments?.length > 0 ? (
          <Table<RdmReleaseDeploymentRecord>
            className="nowrap-table"
            rowKey="id"
            columns={deployColumns}
            dataSource={detail.deployments}
            pagination={false}
            size="small"
            scroll={{ x: deployColumns.reduce((sum, c) => sum + Number((c as { width?: number }).width ?? 100), 0) }}
          />
        ) : (
          <Alert type="info" showIcon message="尚無部署系統記錄" />
        )}
      </div>

      {/* ===== Section 4: 緊急豁免與產品補驗 ===== */}
      {((detail.exemptions?.length ?? 0) > 0 || (detail.supplementaries?.length ?? 0) > 0) && (
        <div className="rdm-release-section">
          <h3 className="rdm-release-section-title">
            <SafetyCertificateOutlined style={{ marginRight: 6 }} />緊急豁免與產品補驗
            <HelpPopover
              title="緊急豁免 / 補驗口徑"
              ariaLabel="緊急豁免與補驗口徑說明"
              content={[
                { tone: 'danger', label: '只豁免缺失的產品驗收', body: '業務驗收永不可豁免；缺失清單由服務端按當前範圍版本計算。' },
                { tone: 'warn', label: '豁免也要四眼', body: '裁決人不得是申請人本人，管理員亦不得自批；product_risk 與 release 兩類裁決齊備且均為批准，豁免才生效。' },
                { tone: 'info', label: '補驗期限按真實工作日曆', body: '補驗期限按補驗人真實工作日曆凍結；僅凍結的補驗人本人可登記完成（無 admin 直通），補驗失敗即升級整改，且產品驗收未真實建立前仍拒絕開放。' },
              ]}
            />
          </h3>
          {(detail.exemptions?.length ?? 0) > 0 && (
            <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 12 }}>
              {detail.exemptions!.map(ex => {
                const types = new Set((ex.decisions ?? []).map(d => d.decisionType))
                return (
                  <div key={ex.id} className="rdm-desc-block" style={{ padding: '8px 12px' }}>
                    <Space size={8} wrap>
                      <strong>豁免單 #{ex.id}</strong>
                      <Tag color={ex.effective ? 'success' : 'processing'} style={{ margin: 0 }}>{ex.effective ? '已生效' : '未生效'}</Tag>
                      <Tag color={types.has(RDM_EXEMPTION_DECISION_TYPE.PRODUCT_RISK) ? 'success' : 'default'} style={{ margin: 0 }}>
                        {RDM_EXEMPTION_DECISION_TYPE_LABEL.product_risk}{types.has(RDM_EXEMPTION_DECISION_TYPE.PRODUCT_RISK) ? '✓' : '…'}
                      </Tag>
                      <Tag color={types.has(RDM_EXEMPTION_DECISION_TYPE.RELEASE) ? 'success' : 'default'} style={{ margin: 0 }}>
                        {RDM_EXEMPTION_DECISION_TYPE_LABEL.release}{types.has(RDM_EXEMPTION_DECISION_TYPE.RELEASE) ? '✓' : '…'}
                      </Tag>
                    </Space>
                    {ex.reason && <div style={{ fontSize: 12, color: '#595959', marginTop: 4 }}>事由：{ex.reason}</div>}
                  </div>
                )
              })}
            </Space>
          )}
          {(detail.supplementaries?.length ?? 0) > 0 && (
            <Table<RdmReleaseSupplementaryRecord>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={detail.supplementaries}
              scroll={{ x: 900 }}
              columns={[
                { title: '交付項', dataIndex: 'deliveryItemTitle', key: 'item', width: 200, ellipsis: true, render: (v?: string | null, r?) => v || `#${r?.deliveryItemId ?? '-'}` },
                { title: '補驗人', dataIndex: 'verifierUserName', key: 'verifier', width: 120, render: (v?: string | null) => v || '-' },
                { title: '期限', dataIndex: 'deadline', key: 'deadline', width: 120, render: (v?: string | null) => v || '-' },
                {
                  title: '狀態', dataIndex: 'status', key: 'status', width: 100,
                  render: (v?: string | null) => <Tag color={RDM_SUPPLEMENTARY_STATUS_COLOR[v ?? ''] ?? 'default'} style={{ margin: 0 }}>{RDM_SUPPLEMENTARY_STATUS_LABEL[v ?? ''] ?? v ?? '-'}</Tag>,
                },
                {
                  title: '結果', dataIndex: 'result', key: 'result', width: 90,
                  render: (v?: string | null) => v ? <Tag color={v === RDM_SUPPLEMENTARY_RESULT.PASS ? 'success' : 'error'} style={{ margin: 0 }}>{RDM_SUPPLEMENTARY_RESULT_LABEL[v] ?? v}</Tag> : '-',
                },
                { title: '超期工作日', dataIndex: 'overdueWorkingDays', key: 'overdue', width: 110, render: (v?: number | null) => v ?? '-' },
              ]}
            />
          )}
        </div>
      )}

      {/* ===== Section 5: 操作時間線 ===== */}
      <div className="rdm-release-section">
        <h3 className="rdm-release-section-title"><ClockCircleOutlined style={{ marginRight: 6 }} />操作時間線</h3>
        {timelineItems.length > 0 ? (
          <Timeline items={timelineItems} />
        ) : (
          <Alert type="info" showIcon message="暫無操作記錄" />
        )}
      </div>

      {/* ===== 部署結果 Modal ===== */}
      <Modal
        title="記錄部署結果"
        open={deployModalOpen}
        onCancel={() => { setDeployModalOpen(false); deployForm.resetFields() }}
        onOk={handleDeploySubmit}
        confirmLoading={submitting}
        okText="提交"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={deployForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="systemCode" label="系統" rules={[{ required: true, message: '請選擇系統' }]}>
            <Select placeholder="選擇系統" options={systemOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="deployStatus" label="部署狀態" rules={[{ required: true, message: '請選擇部署狀態' }]}>
            <Radio.Group>
              <Radio value="success">成功</Radio>
              <Radio value="failed">失敗</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="buildId" label="構建標識" extra="構建不可變：部署的構建必須與放行裁決凍結的構建一致，否則後端拒絕">
            <Input placeholder="可選，如 build-20241015-001" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== 驗證結果 Modal ===== */}
      <Modal
        title="記錄驗證結果"
        open={verifyModalOpen}
        onCancel={() => { setVerifyModalOpen(false); verifyForm.resetFields() }}
        onOk={handleVerifySubmit}
        confirmLoading={submitting}
        okText="提交"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={verifyForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="systemCode" label="系統" rules={[{ required: true, message: '請選擇系統' }]}>
            <Select placeholder="選擇系統" options={systemOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="verifyStatus" label="驗證結果" rules={[{ required: true, message: '請選擇驗證結果' }]}>
            <Radio.Group>
              <Radio value={RDM_VERIFY_STATUS.PASSED}>通過</Radio>
              <Radio value={RDM_VERIFY_STATUS.FAILED}>未通過</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="remark" label="備註">
            <Input.TextArea rows={3} placeholder="可選，記錄驗證過程中的關鍵信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== 業務開放 Modal ===== */}
      <Modal
        title="登記業務開放"
        open={openModalOpen}
        onCancel={() => { setOpenModalOpen(false); openForm.resetFields() }}
        onOk={handleOpenSubmit}
        confirmLoading={submitting}
        okText="提交"
        cancelText="取消"
        destroyOnClose
      >
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="開放是獨立事實，絕不由「驗證通過」推導"
          description="全部系統驗證通過後批次仍停在「驗證中」，必須顯式登記開放；not_opened 為止損動作，不校驗硬門禁。" />
        <Form form={openForm} layout="vertical" initialValues={{ openStatus: RDM_OPEN_STATUS.OPENED }}>
          <Form.Item name="openStatus" label="開放結果" rules={[{ required: true, message: '請選擇開放結果' }]}>
            <Radio.Group>
              <Radio value={RDM_OPEN_STATUS.OPENED}>已開放</Radio>
              <Radio value={RDM_OPEN_STATUS.NOT_OPENED}>不開放（止損）</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="systemCodes" label="開放系統（不選則默認全部已驗證通過系統）">
            <Select mode="multiple" placeholder="選擇系統" options={verifiedSystems.map(d => ({ value: d.systemCode, label: d.systemName || d.systemCode }))} />
          </Form.Item>
          <Form.Item name="remark" label="備註 / 不開放原因">
            <Input.TextArea rows={2} placeholder="可選" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== 回滾 Modal ===== */}
      <Modal
        title={<span style={{ color: '#FF4D4F' }}><RollbackOutlined style={{ marginRight: 8 }} />回滾發布批次</span>}
        open={rollbackModalOpen}
        onCancel={() => { setRollbackModalOpen(false); rollbackForm.resetFields() }}
        onOk={handleRollbackSubmit}
        confirmLoading={submitting}
        okText="確認回滾"
        okType="danger"
        cancelText="取消"
        destroyOnClose
      >
        <Alert type="warning" showIcon icon={<ExclamationCircleOutlined />}
          message="回滾是不可逆的止損操作，將影響已部署的系統"
          description="回滾為止損動作，不受灰度門控限制；請確認所有相關人員已知曉回滾計劃。"
          style={{ marginBottom: 16 }}
        />
        <Form form={rollbackForm} layout="vertical">
          <Form.Item name="reason" label="回滾原因" rules={[{ required: true, message: '請填寫回滾原因' }]}>
            <Input.TextArea rows={3} placeholder="請詳細說明回滾原因" />
          </Form.Item>
          <Form.Item name="systemCodes" label="回滾系統（不選則回滾全部已部署系統）">
            <Checkbox.Group>
              <Row>
                {deployedSystems.map(sys => (
                  <Col span={12} key={sys.systemCode}>
                    <Checkbox value={sys.systemCode}>{sys.systemName || sys.systemCode}</Checkbox>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== 審批決定 Modal ===== */}
      <Modal
        title="審批發布申請"
        open={decideModalOpen}
        onCancel={() => { setDecideModalOpen(false); decideForm.resetFields() }}
        onOk={handleDecideSubmit}
        confirmLoading={submitting}
        okText="提交"
        cancelText="取消"
        destroyOnClose
      >
        <Alert type="info" showIcon message="四眼原則：裁決人不能是申請人本人，管理員亦不得自批" style={{ marginBottom: 16 }} />
        <Form form={decideForm} layout="vertical" initialValues={{ decision: RDM_DECISION.APPROVED }}>
          <Form.Item name="decision" label="裁決結果" rules={[{ required: true, message: '請選擇裁決結果' }]}>
            <Radio.Group>
              <Radio value={RDM_DECISION.APPROVED}>{RDM_DECISION_LABEL.approved}</Radio>
              <Radio value={RDM_DECISION.REJECTED}>{RDM_DECISION_LABEL.rejected}</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="reason" label="原因" extra="批准前會重新校驗全部硬門禁；駁回則置為取消，不寫任何裁決快照">
            <Input.TextArea rows={3} placeholder="駁回時建議填寫原因" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== 緊急豁免申請 Modal ===== */}
      <Modal
        title="申請緊急豁免"
        open={exemptionModalOpen}
        onCancel={() => { setExemptionModalOpen(false); exemptionForm.resetFields() }}
        onOk={handleExemptionSubmit}
        confirmLoading={submitting}
        okText="提交申請"
        cancelText="取消"
        destroyOnClose
      >
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message="只可豁免缺失的產品驗收，業務驗收永不可豁免"
          description="豁免屬例外授權，須兩類裁決（產品風險 / 發布）齊備且均為批准才生效；豁免只豁免發布時序，不豁免開放。" />
        <Form form={exemptionForm} layout="vertical">
          <Form.Item name="reason" label="豁免事由" rules={[{ required: true, message: '請填寫豁免事由' }]}>
            <Input.TextArea rows={2} placeholder="為什麼需要緊急豁免" />
          </Form.Item>
          <Form.Item name="risk" label="產品風險評估" rules={[{ required: true, message: '請填寫產品風險評估' }]}>
            <Input.TextArea rows={2} placeholder="豁免帶來的產品風險" />
          </Form.Item>
          <Form.Item name="rollbackPlan" label="回滾預案" rules={[{ required: true, message: '請填寫可執行回滾預案' }]}>
            <Input.TextArea rows={2} placeholder="豁免發布必須帶可執行回滾方案" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== 豁免裁決 Modal ===== */}
      <Modal
        title="裁決緊急豁免"
        open={exemptionDecideModalOpen}
        onCancel={() => { setExemptionDecideModalOpen(false); exemptionDecideForm.resetFields(); setExemptionTarget(null) }}
        onOk={handleExemptionDecideSubmit}
        confirmLoading={submitting}
        okText="提交裁決"
        cancelText="取消"
        destroyOnClose
      >
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="四眼：裁決人不得是豁免申請人本人，管理員亦無自批"
          description={exemptionTarget ? `豁免單 #${exemptionTarget.id}；兩類裁決齊備且均為批准，豁免才生效。` : undefined} />
        <Form form={exemptionDecideForm} layout="vertical" initialValues={{ decision: RDM_DECISION.APPROVED }}>
          <Form.Item name="decisionType" label="裁決類型" rules={[{ required: true, message: '請選擇裁決類型' }]}>
            <Radio.Group>
              {missingDecisionTypes.map(t => (
                <Radio key={t} value={t}>{RDM_EXEMPTION_DECISION_TYPE_LABEL[t] ?? t}</Radio>
              ))}
            </Radio.Group>
          </Form.Item>
          <Form.Item name="decision" label="裁決結果" rules={[{ required: true, message: '請選擇裁決結果' }]}>
            <Radio.Group>
              <Radio value={RDM_DECISION.APPROVED}>{RDM_DECISION_LABEL.approved}</Radio>
              <Radio value={RDM_DECISION.REJECTED}>{RDM_DECISION_LABEL.rejected}</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="reason" label="裁決理由" rules={[{ required: true, message: '豁免屬例外授權，必須留痕，請填寫理由' }]}>
            <Input.TextArea rows={3} placeholder="裁決理由（必填，可審計）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== 補驗完成登記 Modal ===== */}
      <Modal
        title="登記產品補驗完成"
        open={supplementaryModalOpen}
        onCancel={() => { setSupplementaryModalOpen(false); supplementaryForm.resetFields() }}
        onOk={handleSupplementarySubmit}
        confirmLoading={submitting}
        okText="提交登記"
        cancelText="取消"
        destroyOnClose
      >
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="僅凍結的補驗人本人可登記（無 admin 直通）"
          description="result 須與引用的真實驗收記錄結論一致；補驗失敗即置 failed 並升級整改，且產品驗收未真實建立前仍拒絕開放。" />
        <Form form={supplementaryForm} layout="vertical" initialValues={{ result: RDM_SUPPLEMENTARY_RESULT.PASS }}>
          <Form.Item name="supplementaryId" label="補驗單" rules={[{ required: true, message: '請選擇補驗單' }]}>
            <Select
              placeholder="選擇待補驗單"
              options={pendingSupplementaries.map(sup => ({
                value: sup.id,
                label: `${sup.deliveryItemTitle || `交付項#${sup.deliveryItemId ?? '-'}`} · 補驗人 ${sup.verifierUserName || '-'} · 期限 ${sup.deadline || '-'}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="acceptanceRecordId" label="真實驗收記錄ID" rules={[{ required: true, message: '請填寫已存在的驗收記錄ID' }]}>
            <InputNumber style={{ width: '100%' }} min={1} placeholder="必须是已存在的真实产品验收记录" />
          </Form.Item>
          <Form.Item name="result" label="補驗結果" rules={[{ required: true, message: '請選擇補驗結果' }]}>
            <Radio.Group>
              <Radio value={RDM_SUPPLEMENTARY_RESULT.PASS}>{RDM_SUPPLEMENTARY_RESULT_LABEL.pass}</Radio>
              <Radio value={RDM_SUPPLEMENTARY_RESULT.FAIL}>{RDM_SUPPLEMENTARY_RESULT_LABEL.fail}</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="evidenceJson" label="補驗證據 JSON（可選）">
            <Input.TextArea rows={2} placeholder="可選，缺省由服務端按驗收記錄組裝" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
