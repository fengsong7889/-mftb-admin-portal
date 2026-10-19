/**
 * 問題詳情 —— 問題記錄、延期申請與決策流程
 *
 * 支持兩種模式：
 * 1. 新建模式（?mode=create&reqId=xxx&deliveryItemId=xxx）：登記新問題
 * 2. 詳情模式（?id=xxx）：查看問題摘要、延期流程、操作區
 *
 * 延期流程可視化使用 antd Steps 展示六個節點的流轉狀態。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Checkbox, Col, DatePicker, Descriptions, Form, Input, InputNumber,
  Modal, Radio, Row, Select, Space, Spin, Steps, Tag, message,
} from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined,
  ExclamationCircleOutlined, FileTextOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import RdmFormHeader from './components/RdmFormHeader'
import HelpPopover from '../../components/HelpPopover'
import {
  createIssue, fetchIssueDetail, applyIssueDefer, decideIssueDefer, resolveIssue,
  bindIssueFollowUp, cancelIssue, mergeIssue, reassignIssue,
  fetchDeliveryItems,
  type RdmIssueDetail as RdmIssueDetailType,
  type RdmIssueCreateForm, type RdmIssueDeferApplyForm, type RdmIssueDeferDecisionForm,
  type RdmIssueResolveForm, type RdmIssueBindForm, type RdmIssueActionForm,
  type RdmDeliveryItemListItem,
} from '../../api/rdm'
import { fetchRequirementPage, type RdmRequirementRow } from '../../api/rdm'
import {
  RDM_ISSUE_STATUS, RDM_ISSUE_STATUS_LABEL, RDM_ISSUE_STATUS_COLOR,
  RDM_ISSUE_SEVERITY_LABEL, RDM_ISSUE_SEVERITY_COLOR,
  RDM_DEFER_STATUS, RDM_DEFER_STATUS_LABEL, RDM_DEFER_STATUS_COLOR,
  RDM_ISSUE_SOURCE_TYPE_LABEL, RDM_DECISION,
} from '../../constants/rdm'
import './index.css'

const { TextArea } = Input

/** 問題來源類型（對齊後端 RdmIssueDTO.Create.sourceType：test/acceptance/online/other） */
const SOURCE_TYPE_OPTIONS = Object.entries(RDM_ISSUE_SOURCE_TYPE_LABEL).map(([value, label]) => ({ value, label }))

/** 嚴重程度選項 */
const SEVERITY_OPTIONS = Object.entries(RDM_ISSUE_SEVERITY_LABEL).map(([value, label]) => ({
  value, label,
}))

export default function IssueDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const id = Number(searchParams.get('id') ?? 0)
  const mode = searchParams.get('mode')
  const isCreateMode = mode === 'create' || (!id && mode !== null)

  const [loading, setLoading] = useState(!isCreateMode)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<RdmIssueDetailType | null>(null)

  // 新建模式
  const [createForm] = Form.useForm()
  const [createLoading, setCreateLoading] = useState(false)
  const [reqOptions, setReqOptions] = useState<RdmRequirementRow[]>([])
  const [deliveryOptions, setDeliveryOptions] = useState<RdmDeliveryItemListItem[]>([])
  const presetReqId = Number(searchParams.get('reqId') ?? 0) || undefined
  const presetDeliveryItemId = Number(searchParams.get('deliveryItemId') ?? 0) || undefined
  const presetBatchId = Number(searchParams.get('batchId') ?? 0) || undefined

  // 延期申請 Modal
  const [deferOpen, setDeferOpen] = useState(false)
  const [deferLoading, setDeferLoading] = useState(false)
  const [deferForm] = Form.useForm()

  // 決策 Modal
  const [decideOpen, setDecideOpen] = useState(false)
  const [decideLoading, setDecideLoading] = useState(false)
  const [decideForm] = Form.useForm()
  const [decideType, setDecideType] = useState<'product' | 'business'>('product')
  const [decideDeferId, setDecideDeferId] = useState<number | null>(null)

  // 承接 / 關閉 / 取消 / 合併 / 改派 共用 Modal
  const [actionModal, setActionModal] = useState<'resolve' | 'bind' | 'cancel' | 'merge' | 'reassign' | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionForm] = Form.useForm()

  const loadDetail = useCallback(async () => {
    if (!id) return
    setLoading(true); setError(null)
    try {
      const d = await fetchIssueDetail(id)
      setDetail(d)
    } catch {
      setError('問題詳情載入失敗')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { if (!isCreateMode) void loadDetail() }, [isCreateMode, loadDetail])

  // 新建模式：載入需求列表
  useEffect(() => {
    if (!isCreateMode) return
    fetchRequirementPage({ size: 50, page: 1, scope: 'delivery' })
      .then(res => setReqOptions(res.records ?? []))
      .catch(() => {})
    if (presetReqId) {
      createForm.setFieldsValue({ reqId: presetReqId })
      loadDeliveryItems(presetReqId)
    }
    if (presetDeliveryItemId) createForm.setFieldsValue({ deliveryItemId: presetDeliveryItemId })
  }, [isCreateMode])

  const loadDeliveryItems = async (reqId: number) => {
    try {
      const res = await fetchDeliveryItems({ reqId, pageSize: 100 })
      setDeliveryOptions(res.records ?? [])
    } catch { setDeliveryOptions([]) }
  }

  const handleCreateReqChange = (reqId: number) => {
    createForm.setFieldsValue({ deliveryItemId: undefined })
    void loadDeliveryItems(reqId)
  }

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields()
      setCreateLoading(true)
      const payload: RdmIssueCreateForm = {
        title: values.title,
        sourceType: values.sourceType,
        severity: values.severity,
        reqId: values.reqId || presetReqId,
        deliveryItemId: values.deliveryItemId || presetDeliveryItemId,
        description: values.description,
        impact: values.impact,
        ownerUserId: values.ownerUserId ? Number(values.ownerUserId) : undefined,
        ownerUserName: values.ownerUserName,
        buildId: values.buildId,
        scopeVersion: values.scopeVersion,
        sourceId: presetBatchId,
      }
      await createIssue(payload)
      message.success('問題已登記')
      navigate(-1)
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error('登記失敗')
    } finally { setCreateLoading(false) }
  }

  // ===== 延期申請 =====
  const openDeferModal = () => {
    deferForm.resetFields()
    setDeferOpen(true)
  }

  const handleDeferSubmit = async () => {
    try {
      const values = await deferForm.validateFields()
      setDeferLoading(true)
      const payload: RdmIssueDeferApplyForm = {
        reason: values.reason,
        impactDesc: values.impactDesc,
        mitigation: values.mitigation,
        targetVersion: values.targetVersion,
        ownerUserId: values.ownerUserId ? Number(values.ownerUserId) : undefined,
        ownerUserName: values.ownerUserName,
        // 後端 dueAt 嚴格為 yyyy-MM-dd（不帶時間）；帶時間值會被拒
        dueAt: values.dueAt.format('YYYY-MM-DD'),
        expectedVersion: detail?.version,
      }
      await applyIssueDefer(id, payload)
      message.success('延期申請已提交')
      setDeferOpen(false)
      void loadDetail()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error('提交失敗')
    } finally { setDeferLoading(false) }
  }

  // ===== 決策 =====
  const openDecideModal = (type: 'product' | 'business', deferId: number) => {
    setDecideType(type)
    setDecideDeferId(deferId)
    decideForm.resetFields()
    setDecideOpen(true)
  }

  const handleDecideSubmit = async () => {
    if (!decideDeferId) return
    try {
      const values = await decideForm.validateFields()
      setDecideLoading(true)
      const deferRecord = detail?.deferRecords?.find(r => r.id === decideDeferId)
      const payload: RdmIssueDeferDecisionForm = {
        // decision 取值必為 approved/rejected（不是 approve/reject），與後端一字不差
        decision: values.decision,
        reason: values.reason,
        followUpReqId: values.followUpReqId ? Number(values.followUpReqId) : undefined,
        // 產品裁決时可指定是否需業務方複決（四眼：延期需兩道裁決才解除阻斷）
        bizDecisionRequired: decideType === 'product' ? values.bizDecisionRequired : undefined,
        expectedVersion: deferRecord?.version,
      }
      await decideIssueDefer(decideDeferId, decideType, payload)
      message.success('決策已提交')
      setDecideOpen(false)
      void loadDetail()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error('提交失敗')
    } finally { setDecideLoading(false) }
  }

  // ===== 承接 / 關閉 / 取消 / 合併 / 改派 =====
  const openActionModal = (type: 'resolve' | 'bind' | 'cancel' | 'merge' | 'reassign') => {
    actionForm.resetFields()
    if (type === 'resolve') actionForm.setFieldsValue({ conclusion: 'pass' })
    setActionModal(type)
  }

  /**
   * 統一提交承接/關閉/取消/合併/改派。
   * <p><b>關閉（resolve）必須带修復證據 + 復測輪次 + 產品驗收，絕不無證據關閉；延期≠解決，承接需求完成驗收≠原問題自動解決。</b>
   * <p>expectedVersion 取問題詳情 version（樂觀鎖）；后端四眼/唯一承接/證據門禁失败时会回明確 message。
   */
  const handleActionSubmit = async () => {
    if (!actionModal) return
    try {
      const values = await actionForm.validateFields()
      setActionLoading(true)
      const expectedVersion = detail?.version
      if (actionModal === 'resolve') {
        const payload: RdmIssueResolveForm = {
          repairEvidenceJson: values.repairEvidenceJson,
          testRoundId: Number(values.testRoundId),
          productAcceptanceId: Number(values.productAcceptanceId),
          reason: values.reason,
          conclusion: values.conclusion || 'pass',
          businessAcceptanceId: values.businessAcceptanceId ? Number(values.businessAcceptanceId) : undefined,
          followupId: values.followupId ? Number(values.followupId) : undefined,
          deliveryItemId: values.deliveryItemId ? Number(values.deliveryItemId) : undefined,
          buildId: values.buildId || undefined,
          testExecutionIdsJson: values.testExecutionIdsJson || undefined,
          expectedVersion,
        }
        await resolveIssue(id, payload)
        message.success('問題已按證據關閉')
      } else if (actionModal === 'bind') {
        const payload: RdmIssueBindForm = {
          issueId: id,
          followUpReqId: Number(values.followUpReqId),
          ownerUserId: values.ownerUserId ? Number(values.ownerUserId) : undefined,
          reason: values.reason || undefined,
          expectedVersion,
        }
        await bindIssueFollowUp(payload)
        message.success('已建立承接')
      } else {
        const payload: RdmIssueActionForm = {
          reason: values.reason,
          targetIssueId: actionModal === 'merge' ? Number(values.targetIssueId) : undefined,
          newOwnerUserId: actionModal === 'reassign' ? Number(values.newOwnerUserId) : undefined,
          newOwnerUserName: actionModal === 'reassign' ? values.newOwnerUserName : undefined,
          expectedVersion,
        }
        if (actionModal === 'cancel') await cancelIssue(id, payload)
        else if (actionModal === 'merge') await mergeIssue(id, payload)
        else await reassignIssue(id, payload)
        message.success('操作已提交')
      }
      setActionModal(null)
      void loadDetail()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      // request.ts 已統一彈後端失敗原因，不再雙彈
    } finally { setActionLoading(false) }
  }

  // ===== 延期流程 Steps =====
  const deferSteps = useMemo(() => {
    if (!detail?.deferRecords?.length) return []
    return detail.deferRecords.map(record => {
      const steps = [
        { title: '登記問題', status: 'finish' as const, desc: `${detail.reporterUserName} · ${dayjs(detail.createdAt).format('MM-DD HH:mm')}` },
        { title: '申請延期', status: 'finish' as const, desc: `${record.applicantUserName} · ${dayjs(record.createdAt).format('MM-DD HH:mm')}` },
        {
          title: '產品決定',
          status: record.productDecision ? 'finish' as const : record.status === RDM_DEFER_STATUS.PENDING_PRODUCT ? 'process' as const : 'wait' as const,
          desc: record.productDecision
            ? `${record.productDecideUserName || ''} · ${record.productDecision === RDM_DECISION.APPROVED ? '同意' : '拒絕'} · ${record.productDecideTime ? dayjs(record.productDecideTime).format('MM-DD HH:mm') : ''}`
            : record.status === RDM_DEFER_STATUS.PENDING_PRODUCT ? '等待產品經理裁決' : '',
        },
        {
          title: '業務決定',
          status: record.bizDecision ? 'finish' as const : record.status === RDM_DEFER_STATUS.PENDING_BIZ ? 'process' as const : 'wait' as const,
          desc: record.bizDecision
            ? `${record.bizDecideUserName || ''} · ${record.bizDecision === RDM_DECISION.APPROVED ? '同意' : '拒絕'} · ${record.bizDecideTime ? dayjs(record.bizDecideTime).format('MM-DD HH:mm') : ''}`
            : record.status === RDM_DEFER_STATUS.PENDING_BIZ ? '等待業務方確認' : record.productDecision === RDM_DECISION.REJECTED ? '產品已拒絕' : '',
        },
        {
          title: '建立承接',
          status: record.followUpReqId ? 'finish' as const : record.status === RDM_DEFER_STATUS.PENDING_BIND ? 'process' as const : 'wait' as const,
          desc: record.followUpReqId ? `承接需求：${record.followUpReqNo}` : record.status === RDM_DEFER_STATUS.PENDING_BIND ? '待綁定承接需求' : '',
        },
        {
          title: '延期生效',
          status: record.status === RDM_DEFER_STATUS.EFFECTIVE ? 'finish' as const : record.status === RDM_DEFER_STATUS.REJECTED ? 'error' as const : 'wait' as const,
          desc: record.status === RDM_DEFER_STATUS.EFFECTIVE ? '延期已生效' : record.status === RDM_DEFER_STATUS.REJECTED ? '已拒絕' : '',
        },
      ]
      return { record, steps }
    })
  }, [detail])

  // ===== 渲染：新建模式 =====
  if (isCreateMode) {
    return (
      <div className="content-area">
        <RdmFormHeader title="登記問題" onBack={() => navigate(-1)} />
        <div className="rdm-card">
          <Form form={createForm} layout="vertical">
            <Form.Item name="title" label="問題標題" rules={[{ required: true, message: '請輸入問題標題' }]}>
              <Input placeholder="簡短描述問題現象" maxLength={200} />
            </Form.Item>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="sourceType" label="來源類型" rules={[{ required: true, message: '請選擇' }]}>
                  <Select placeholder="選擇來源" options={SOURCE_TYPE_OPTIONS} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="severity" label="嚴重程度" rules={[{ required: true, message: '請選擇' }]}>
                  <Select placeholder="選擇程度" options={SEVERITY_OPTIONS} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="reqId" label="關聯需求">
                  <Select
                    placeholder="搜索需求"
                    showSearch
                    optionFilterProp="label"
                    allowClear
                    onChange={handleCreateReqChange}
                    options={reqOptions.map(r => ({ value: r.id, label: `${r.reqNo} ${r.title}` }))}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="deliveryItemId" label="關聯交付項">
                  <Select
                    placeholder="選擇交付項"
                    allowClear
                    options={deliveryOptions.map(d => ({ value: d.id, label: d.title }))}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="ownerUserId" label="負責人 ID">
                  <Input placeholder="選填" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="ownerUserName" label="負責人姓名">
                  <Input placeholder="選填" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="description" label="問題描述" rules={[{ required: true, message: '請描述問題' }]}>
              <TextArea rows={4} placeholder="詳細描述問題現象、重現步驟…" maxLength={2000} showCount />
            </Form.Item>
            <Form.Item name="impact" label="影響說明">
              <TextArea rows={3} placeholder="描述對業務/用戶的影響（選填）" maxLength={1000} />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="buildId" label="構建標識">
                  <Input placeholder="選填" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="scopeVersion" label="範圍版本">
                  <InputNumber placeholder="選填" min={1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </div>
        <div className="form-footer">
          <Button onClick={() => navigate(-1)}>取消</Button>
          <Button type="primary" icon={<SendOutlined />} loading={createLoading} onClick={handleCreate}>提交</Button>
        </div>
      </div>
    )
  }

  // ===== 渲染：詳情模式 =====
  /*
   * 無 id 且非新建模式（直接訪問 /rdm-issue）：loadDetail 會直接 return，
   * loading 初值 true 就永遠轉圈。這裡先給出參數缺失引導，不能讓頁面白屏。
   */
  if (!id && !isCreateMode) {
    return (
      <div className="content-area">
        <Alert type="info" showIcon message="未指定問題"
          description="請從測試工作台、交付項或問題列表進入問題詳情；如需登記新問題請使用「新增問題」。"
          action={<Button size="small" onClick={() => navigate(-1)}>返回</Button>} />
      </div>
    )
  }

  if (loading) {
    return <div className="content-area" style={{ textAlign: 'center', padding: 80 }}><Spin size="large" tip="載入中…" /></div>
  }

  if (error || !detail) {
    return (
      <div className="content-area">
        <Alert type="error" showIcon message={error || '問題不存在'}
          action={<Button size="small" onClick={() => navigate(-1)}>返回</Button>} />
      </div>
    )
  }

  const severityColor = RDM_ISSUE_SEVERITY_COLOR[detail.severity] || '#8C8C8C'
  const severityLabel = RDM_ISSUE_SEVERITY_LABEL[detail.severity] || detail.severity
  const statusLabel = RDM_ISSUE_STATUS_LABEL[detail.status] || detail.status
  const statusColor = RDM_ISSUE_STATUS_COLOR[detail.status] || 'default'

  /** 獲取當前待決策的延期記錄 */
  const pendingDefer = detail.deferRecords?.find(
    r => r.status === RDM_DEFER_STATUS.PENDING_PRODUCT || r.status === RDM_DEFER_STATUS.PENDING_BIZ || r.status === RDM_DEFER_STATUS.PENDING_BIND
  )

  return (
    <div className="content-area">
      <RdmFormHeader
        title={`問題 ${detail.issueNo}`}
        onBack={() => navigate(-1)}
        badge={
          <>
            <Tag color={statusColor}>{statusLabel}</Tag>
            <Tag color={severityColor} style={{ color: '#fff' }}>{severityLabel}</Tag>
          </>
        }
        meta={`${detail.title} · 負責人 ${detail.ownerUserName || '-'}`}
      />

      {/* ── Section 1: 問題摘要 ── */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#FFF1F0', color: '#FF4D4F' }}><ExclamationCircleOutlined /></span>
          問題摘要
          <span className="rdm-card-title-split" />
        </div>
        <Descriptions column={4} size="small" bordered={false}>
          <Descriptions.Item label="問題編號">{detail.issueNo}</Descriptions.Item>
          <Descriptions.Item label="標題" span={2}>{detail.title}</Descriptions.Item>
          <Descriptions.Item label="來源類型"><Tag>{SOURCE_TYPE_OPTIONS.find(s => s.value === detail.sourceType)?.label || detail.sourceType}</Tag></Descriptions.Item>
          <Descriptions.Item label="嚴重程度"><Tag color={severityColor} style={{ color: '#fff' }}>{severityLabel}</Tag></Descriptions.Item>
          <Descriptions.Item label="狀態"><Tag color={statusColor}>{statusLabel}</Tag></Descriptions.Item>
          <Descriptions.Item label="負責人">{detail.ownerUserName || '-'}</Descriptions.Item>
          <Descriptions.Item label="報告人">{detail.reporterUserName || '-'}</Descriptions.Item>
          <Descriptions.Item label="關聯需求">
            {detail.reqId ? <a onClick={() => navigate(`/rdm-detail?id=${detail.reqId}`)}>{detail.reqNo} {detail.reqTitle}</a> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="關聯交付項">
            {detail.deliveryItemId ? <a onClick={() => navigate(`/rdm-delivery-item?id=${detail.deliveryItemId}`)}>{detail.deliveryItemTitle}</a> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="創建時間">{detail.createdAt ? dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
          <Descriptions.Item label="更新時間">{detail.updatedAt ? dayjs(detail.updatedAt).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
          <Descriptions.Item label="構建標識">{detail.buildId || '-'}</Descriptions.Item>
          <Descriptions.Item label="範圍版本">{detail.scopeVersion ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="問題描述" span={4}>
            <div className="rdm-desc-block">{detail.description || '-'}</div>
          </Descriptions.Item>
          {detail.impact && (
            <Descriptions.Item label="影響說明" span={4}>
              <div className="rdm-desc-block">{detail.impact}</div>
            </Descriptions.Item>
          )}
        </Descriptions>
      </div>

      {/* ── Section 2: 延期流程 ── */}
      {detail.deferRecords && detail.deferRecords.length > 0 && (
        <div className="rdm-card">
          <div className="rdm-card-title">
            <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}><ClockCircleOutlined /></span>
            延期流程
            <span className="rdm-card-title-split" />
          </div>
          {deferSteps.map(({ record, steps }, idx) => (
            <div key={record.id} style={{ marginBottom: idx < deferSteps.length - 1 ? 24 : 0 }}>
              {deferSteps.length > 1 && (
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>第 {idx + 1} 次延期申請</div>
              )}
              <Steps size="small" current={steps.findIndex(s => s.status === 'process')} items={steps.map(s => ({
                title: s.title,
                status: s.status,
                description: s.desc ? <span style={{ fontSize: 11 }}>{s.desc}</span> : undefined,
              }))} />
              {/* 延期詳細信息 */}
              <div className="rdm-defer-detail-card">
                <Row gutter={16} style={{ fontSize: 13 }}>
                  <Col span={8}><b>延期原因：</b>{record.reason}</Col>
                  <Col span={8}><b>目標版本：</b>{record.targetVersion || '-'}</Col>
                  <Col span={8}><b>截止日期：</b>{record.dueAt ? dayjs(record.dueAt).format('YYYY-MM-DD') : '-'}</Col>
                </Row>
                {record.impactDesc && <div style={{ fontSize: 12, color: '#595959', marginTop: 8 }}><b>影響描述：</b>{record.impactDesc}</div>}
                {record.mitigation && <div style={{ fontSize: 12, color: '#595959', marginTop: 4 }}><b>臨時措施：</b>{record.mitigation}</div>}
                {record.productDecideReason && (
                  <div style={{ fontSize: 12, color: '#595959', marginTop: 4 }}>
                    <b>產品裁決原因：</b>{record.productDecideReason}
                  </div>
                )}
                {record.bizDecideReason && (
                  <div style={{ fontSize: 12, color: '#595959', marginTop: 4 }}>
                    <b>業務裁決原因：</b>{record.bizDecideReason}
                  </div>
                )}
                <div style={{ marginTop: 8 }}>
                  <Tag color={RDM_DEFER_STATUS_COLOR[record.status] || 'default'}>
                    {RDM_DEFER_STATUS_LABEL[record.status] || record.status}
                  </Tag>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Section 3: 操作區 ── */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#E6FFFB', color: '#13C2C2' }}><FileTextOutlined /></span>
          可用操作
          <HelpPopover
            title="問題閉環三原則"
            ariaLabel="問題閉環原則說明"
            content={[
              { label: '延期需批准才解除阻斷', body: '延期申請必須經產品（必要時業務）裁決批准後才生效；未批准的延期不解除阻斷。', tone: 'warn' },
              { label: '承接唯一', body: '每個問題同一時刻只有一條有效承接需求；改派/合併/取消都保留既有承接與歷史。', tone: 'info' },
              { label: '關閉需證據', body: '按證據關閉必須帶修復證據 + 復測輪次 + 產品驗收；延期≠解決，承接需求完成驗收≠原問題自動解決。', tone: 'danger' },
            ]}
          />
          <span className="rdm-card-title-split" />
        </div>
        <Space wrap size={12}>
          {(detail.status === RDM_ISSUE_STATUS.OPEN || detail.status === RDM_ISSUE_STATUS.PROCESSING) && (
            <Button icon={<ClockCircleOutlined />} onClick={openDeferModal}>申請延期</Button>
          )}
          {pendingDefer && pendingDefer.status === RDM_DEFER_STATUS.PENDING_PRODUCT && (
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => openDecideModal('product', pendingDefer.id)}>
              產品裁決
            </Button>
          )}
          {pendingDefer && pendingDefer.status === RDM_DEFER_STATUS.PENDING_BIZ && (
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => openDecideModal('business', pendingDefer.id)}>
              業務裁決
            </Button>
          )}
          {pendingDefer && pendingDefer.status === RDM_DEFER_STATUS.PENDING_BIND && (
            <Button type="primary" icon={<SendOutlined />} onClick={() => openActionModal('bind')}>建立承接</Button>
          )}
          {(detail.status === RDM_ISSUE_STATUS.PROCESSING || detail.status === RDM_ISSUE_STATUS.OPEN) && (
            <>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => openActionModal('resolve')}>按證據關閉</Button>
              <Button icon={<SendOutlined />} onClick={() => openActionModal('reassign')}>改派</Button>
              <Button icon={<SendOutlined />} onClick={() => openActionModal('merge')}>合併</Button>
              <Button danger icon={<SendOutlined />} onClick={() => openActionModal('cancel')}>取消</Button>
            </>
          )}
          <Button onClick={() => navigate(-1)}>返回</Button>
        </Space>
      </div>

      {/* ── 底部操作欄 ── */}
      <div className="form-footer">
        <Button onClick={() => navigate(-1)}>返回</Button>
      </div>

      {/* ── 延期申請 Modal ── */}
      <Modal
        title="申請延期"
        open={deferOpen}
        onCancel={() => setDeferOpen(false)}
        onOk={handleDeferSubmit}
        confirmLoading={deferLoading}
        okText="提交申請"
        cancelText="取消"
        width={580}
        destroyOnHidden
      >
        <Form form={deferForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="reason" label="延期原因" rules={[{ required: true, message: '請填寫延期原因' }]}>
            <TextArea rows={3} placeholder="為什麼需要延期？例：依賴第三方接口未完成聯調" maxLength={500} showCount />
          </Form.Item>
          <Form.Item name="impactDesc" label="影響描述">
            <TextArea rows={2} placeholder="延期對業務/用戶的影響（選填）" maxLength={500} />
          </Form.Item>
          <Form.Item name="mitigation" label="臨時措施">
            <TextArea rows={2} placeholder="延期期間的臨時應對方案（選填）" maxLength={500} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="targetVersion" label="目標版本" rules={[{ required: true, message: '請填寫具體目標版本' }]}>
                <Input placeholder="例：v2.5.0（必須具體，不可填「以後」）" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="dueAt" label="截止日期" rules={[{ required: true, message: '請選擇截止日期' }]}>
                <DatePicker style={{ width: '100%' }} placeholder="選擇日期（年-月-日）" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="ownerUserId" label="後續責任人 ID">
                <Input placeholder="選填" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="ownerUserName" label="後續責任人姓名">
                <Input placeholder="選填" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ── 決策 Modal ── */}
      <Modal
        title={decideType === 'product' ? '產品裁決' : '業務裁決'}
        open={decideOpen}
        onCancel={() => setDecideOpen(false)}
        onOk={handleDecideSubmit}
        confirmLoading={decideLoading}
        okText="提交決策"
        cancelText="取消"
        width={520}
        destroyOnHidden
      >
        <Form form={decideForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="decision" label="決定" rules={[{ required: true, message: '請選擇' }]}>
            <Radio.Group optionType="button" buttonStyle="solid">
              <Radio.Button value={RDM_DECISION.APPROVED}>同意延期</Radio.Button>
              <Radio.Button value={RDM_DECISION.REJECTED}>拒絕</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="reason" label="原因" rules={[{ required: true, message: '請填寫原因' }]}>
            <TextArea rows={3} placeholder="說明同意或拒絕的原因" maxLength={500} showCount />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.decision !== cur.decision}>
            {({ getFieldValue }) => {
              const decision = getFieldValue('decision')
              if (decision !== RDM_DECISION.APPROVED) return null
              return (
                <>
                  {decideType === 'product' && (
                    <>
                      <Alert type="info" showIcon style={{ marginBottom: 16 }}
                        message="同意後將流轉到業務方確認環節（四眼：延期需兩道裁決才解除阻斷）" />
                      <Form.Item name="bizDecisionRequired" valuePropName="checked" label="是否需業務方複決">
                        <Checkbox>需要業務方複決</Checkbox>
                      </Form.Item>
                    </>
                  )}
                  <Form.Item name="followUpReqId" label="承接需求 ID（選填）">
                    <Input placeholder="綁定後續承接需求 ID" />
                  </Form.Item>
                </>
              )
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* ── 承接 / 關閉 / 取消 / 合併 / 改派 Modal ── */}
      <Modal
        title={
          actionModal === 'resolve' ? '按證據關閉問題'
            : actionModal === 'bind' ? '建立承接需求'
            : actionModal === 'cancel' ? '取消問題'
            : actionModal === 'merge' ? '合併到目標問題'
            : '改派負責人'
        }
        open={actionModal !== null}
        onCancel={() => setActionModal(null)}
        onOk={handleActionSubmit}
        confirmLoading={actionLoading}
        okText="提交"
        cancelText="取消"
        width={580}
        destroyOnHidden
      >
        {actionModal === 'resolve' && (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }}
            message="關閉必須帶證據"
            description="延期≠解決；承接需求完成驗收≠原問題自動解決。修復證據、復測輪次、產品驗收均為必填，後端據此校驗，缺證據一律拒絕。" />
        )}
        {actionModal === 'bind' && (
          <Alert type="info" showIcon style={{ marginBottom: 16 }}
            message="每個問題同一時刻唯一有效承接；承接需求以數值 ID 指定。" />
        )}
        <Form form={actionForm} layout="vertical" style={{ marginTop: 8 }}>
          {actionModal === 'resolve' && (
            <>
              <Form.Item name="repairEvidenceJson" label="修復證據（JSON）" rules={[{ required: true, message: '請填寫修復證據' }]}>
                <TextArea rows={3} placeholder='例：{"commit":"...","pr":"...","screenshots":["..."]}' />
              </Form.Item>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="testRoundId" label="復測輪次ID" rules={[{ required: true, message: '請填寫' }]}>
                    <InputNumber min={1} style={{ width: '100%' }} placeholder="必填" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="productAcceptanceId" label="產品驗收ID" rules={[{ required: true, message: '請填寫' }]}>
                    <InputNumber min={1} style={{ width: '100%' }} placeholder="必填" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="businessAcceptanceId" label="業務驗收ID">
                    <InputNumber min={1} style={{ width: '100%' }} placeholder="選填" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="conclusion" label="閉環結論">
                    <Radio.Group optionType="button" buttonStyle="solid">
                      <Radio.Button value="pass">通過</Radio.Button>
                      <Radio.Button value="fail">不通過</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="followupId" label="承接記錄ID">
                    <InputNumber min={1} style={{ width: '100%' }} placeholder="選填" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="deliveryItemId" label="交付項ID">
                    <InputNumber min={1} style={{ width: '100%' }} placeholder="選填" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="buildId" label="構建標識">
                    <Input placeholder="選填" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="testExecutionIdsJson" label="復測執行記錄ID（JSON）">
                <Input placeholder='例：[101,102]（選填）' />
              </Form.Item>
            </>
          )}
          {actionModal === 'bind' && (
            <>
              <Form.Item name="followUpReqId" label="承接需求ID" rules={[{ required: true, message: '請填寫承接需求ID' }]}>
                <InputNumber min={1} style={{ width: '100%' }} placeholder="必填" />
              </Form.Item>
              <Form.Item name="ownerUserId" label="承接負責人ID">
                <InputNumber min={1} style={{ width: '100%' }} placeholder="選填" />
              </Form.Item>
            </>
          )}
          {actionModal === 'merge' && (
            <Form.Item name="targetIssueId" label="目標問題ID" rules={[{ required: true, message: '請填寫目標問題ID' }]}>
              <InputNumber min={1} style={{ width: '100%' }} placeholder="合併到該問題（必填）" />
            </Form.Item>
          )}
          {actionModal === 'reassign' && (
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="newOwnerUserId" label="新負責人ID" rules={[{ required: true, message: '請填寫' }]}>
                  <InputNumber min={1} style={{ width: '100%' }} placeholder="必填" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="newOwnerUserName" label="新負責人姓名">
                  <Input placeholder="選填" />
                </Form.Item>
              </Col>
            </Row>
          )}
          <Form.Item name="reason" label={actionModal === 'resolve' ? '關閉說明' : '原因'}
            rules={actionModal === 'bind' ? [] : [{ required: true, message: '請填寫原因' }]}>
            <TextArea rows={3} placeholder={actionModal === 'bind' ? '說明承接原因（選填）' : '說明原因（必填）'} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
