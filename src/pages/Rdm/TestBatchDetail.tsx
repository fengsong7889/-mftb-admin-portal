/**
 * 提測批次詳情 —— 執行記錄、通過率、接收/退回/錄入結果/復測
 *
 * 三個主要區塊：
 * 1. 批次摘要（Descriptions 4 列佈局）
 * 2. 執行摘要（統計卡片 + 通過率 Progress）
 * 3. 執行記錄（Table，可按結果/執行人篩選）
 *
 * 底部操作欄根據批次狀態動態顯示可用操作。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Col, Descriptions, Form, Input, Modal, Progress,
  Radio, Row, Select, Space, Spin, Table, Tag, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined, ExperimentOutlined,
  MinusCircleOutlined, PlusOutlined, SendOutlined, SyncOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import RdmFormHeader from './components/RdmFormHeader'
import StatCards from '../../components/StatCards'
import HelpPopover from '../../components/HelpPopover'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { deriveRdmColumnMeta } from './rdmColumnMeta'
import {
  fetchTestBatchDetail, fetchTestBatchSummary, acceptTestBatch, returnTestBatch,
  submitTestExecution, retestBatch,
  type RdmTestBatchDetail as RdmTestBatchDetailType,
  type RdmTestBatchSummary, type RdmTestExecutionRecord, type RdmTestExecutionForm,
  type RdmTestBatchScopeItem,
} from '../../api/rdm'
import {
  RDM_TEST_BATCH_STATUS, RDM_TEST_BATCH_STATUS_LABEL, RDM_TEST_BATCH_STATUS_COLOR,
  RDM_TEST_ENV_LABEL,
} from '../../constants/rdm'
import './index.css'

const { TextArea } = Input

/** 測試環境選項 */
const TEST_ENV_OPTIONS = Object.entries(RDM_TEST_ENV_LABEL).map(([value, label]) => ({ value, label }))

/** 執行結果配置 */
const RESULT_CONFIG: Record<string, { label: string; color: string }> = {
  pass: { label: '通過', color: '#52C41A' },
  fail: { label: '失敗', color: '#FF4D4F' },
  blocked: { label: '阻塞', color: '#FA8C16' },
  skip: { label: '跳過', color: '#8C8C8C' },
}

export default function TestBatchDetail() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const id = Number(searchParams.get('id') ?? 0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<RdmTestBatchDetailType | null>(null)
  const [summary, setSummary] = useState<RdmTestBatchSummary | null>(null)

  // 篩選
  const [resultFilter, setResultFilter] = useState<string | undefined>()
  const [executorFilter, setExecutorFilter] = useState<string | undefined>()

  // 錄入結果 Modal
  const [execOpen, setExecOpen] = useState(false)
  const [execLoading, setExecLoading] = useState(false)
  const [execForm] = Form.useForm()

  // 退回 Modal
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnReason, setReturnReason] = useState('')
  const [returnLoading, setReturnLoading] = useState(false)

  // 復測 Modal
  const [retestOpen, setRetestOpen] = useState(false)
  const [retestReason, setRetestReason] = useState('')
  const [retestBuildIds, setRetestBuildIds] = useState<string[]>([''])
  const [retestLoading, setRetestLoading] = useState(false)

  const loadDetail = useCallback(async () => {
    if (!id) { setError('未指定批次 ID'); setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const [d, s] = await Promise.all([
        fetchTestBatchDetail(id),
        fetchTestBatchSummary(id),
      ])
      setDetail(d)
      setSummary(s)
    } catch {
      setError('批次詳情載入失敗')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void loadDetail() }, [loadDetail])

  // ===== 操作 =====
  const handleAccept = () => {
    Modal.confirm({
      title: '確認接收',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: '接收後批次進入「已接收」狀態，可開始執行測試。',
      okText: '確認接收',
      cancelText: '取消',
      onOk: async () => {
        try {
          await acceptTestBatch(id)
          message.success('已接收提測批次')
          void loadDetail()
        } catch {
          // request.ts 已统一弹后端返回的失败原因，这里再弹一次就是双弹（AGENTS §G.4）
        }
      },
    })
  }

  const confirmReturn = async () => {
    if (!returnReason.trim()) { message.warning('請填寫退回原因'); return }
    setReturnLoading(true)
    try {
      await returnTestBatch(id, { reason: returnReason.trim() })
      message.success('已退回提測批次')
      setReturnOpen(false)
      void loadDetail()
    } catch { message.error('退回失敗') }
    finally { setReturnLoading(false) }
  }

  const handleExecSubmit = async () => {
    try {
      const values = await execForm.validateFields()
      setExecLoading(true)
      const diId = values.deliveryItemId ? Number(values.deliveryItemId) : undefined
      // 范围版本优先取选中冻结用例自带的（权威），没选时才回落到范围快照
      const picked = frozenCases.find(c => c.caseId === values.caseId)
      const scopeVersion = picked?.scopeVersion
        ?? (diId != null ? scopeVersionByItem.get(diId) : undefined)
      const payload: RdmTestExecutionForm = {
        caseTitle: values.caseTitle,
        deliveryItemId: diId,
        result: values.result,
        buildId: values.buildId || undefined,
        testEnv: values.testEnv || undefined,
        remark: values.remark || undefined,
        // Batch3：V3 测试流字段——稳定 caseId + 证据 + 冻结范围版本（按选中交付项自动带出）
        caseId: values.caseId || undefined,
        evidenceJson: values.evidenceJson || undefined,
        scopeVersion,
        expectedVersion: detail?.version,
      }
      await submitTestExecution(id, payload)
      message.success('執行結果已錄入')
      setExecOpen(false)
      execForm.resetFields()
      void loadDetail()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error('錄入失敗')
    } finally { setExecLoading(false) }
  }

  const handleRetest = async () => {
    if (!retestReason.trim()) { message.warning('請填寫復測原因'); return }
    setRetestLoading(true)
    try {
      await retestBatch(id, {
        reason: retestReason.trim(),
        buildIds: retestBuildIds.filter(b => b.trim()),
      })
      message.success('已發起復測')
      setRetestOpen(false)
      void loadDetail()
    } catch { message.error('復測發起失敗') }
    finally { setRetestLoading(false) }
  }

  // ===== 執行記錄（篩選後） =====
  const filteredExecutions = useMemo(() => {
    let list = detail?.executions ?? []
    if (resultFilter) list = list.filter(e => e.result === resultFilter)
    if (executorFilter) list = list.filter(e => e.executorUserName === executorFilter)
    return list
  }, [detail?.executions, resultFilter, executorFilter])

  const executorOptions = useMemo(() => {
    const names = [...new Set((detail?.executions ?? []).map(e => e.executorUserName).filter(Boolean))]
    return names.map(n => ({ value: n, label: n }))
  }, [detail?.executions])

  /**
   * 解析范围快照，取<b>真实 deliveryItemId</b>（后端 buildScopeSnapshot 逐交付项写入）。
   * <p>绝不用数组下标 +1 伪造 ID：伪 ID 提交后后端无法定位交付项，等于把执行结果记到错误对象上。
   */
  const scopeItems = useMemo<RdmTestBatchScopeItem[]>(() => {
    if (!detail?.scopeSnapshotJson) return []
    try {
      const parsed = JSON.parse(detail.scopeSnapshotJson)
      return Array.isArray(parsed) ? (parsed as RdmTestBatchScopeItem[]) : []
    } catch { return [] }
  }, [detail?.scopeSnapshotJson])

  const deliveryItemOptions = useMemo(
    () => scopeItems
      .filter(it => it.deliveryItemId != null)
      .map(it => ({
        value: String(it.deliveryItemId),
        label: it.itemNo ? `${it.itemNo} ${it.title ?? ''}`.trim() : (it.title || `交付項 #${it.deliveryItemId}`),
      })),
    [scopeItems],
  )

  /** 选中交付项时带出其冻结范围版本（scopeVersion 以冻结轮次为权威，不一致即拒） */
  const scopeVersionByItem = useMemo(() => {
    const m = new Map<number, number>()
    scopeItems.forEach(it => {
      if (it.deliveryItemId != null && it.scopeVersion != null) m.set(it.deliveryItemId, it.scopeVersion)
    })
    return m
  }, [scopeItems])

  /*
   * 冻结用例候选（服务端受理时派生稳定 caseId）。
   * 以前这里只有一个让 QA 手输的「用例ID」输入框，但 caseId 是 sha256 截位生成的
   * （C-<交付项>-<12位>）且没有任何地方可查 → 手输必然被服务端拒，提测结果永远录不进去。
   * 现在改成从服务端返回的冻结集里选，同时自动带出标题/交付项/范围版本，避免人与库对不上。
   */
  const frozenCases = useMemo(() => detail?.frozenCases ?? [], [detail?.frozenCases])
  const frozenCaseOptions = useMemo(
    () => frozenCases.map(c => ({
      value: c.caseId,
      label: `${c.caseTitle || c.caseId}${c.mandatory === false ? '（非必測）' : ''}`,
    })),
    [frozenCases],
  )
  /** 选用例后一次性带回标题/交付项/范围版本（都以冻结集为权威） */
  const pickFrozenCase = (caseId: string) => {
    const c = frozenCases.find(x => x.caseId === caseId)
    if (!c) return
    execForm.setFieldsValue({
      caseId: c.caseId,
      caseTitle: c.caseTitle ?? '',
      deliveryItemId: c.deliveryItemId != null ? String(c.deliveryItemId) : undefined,
    })
  }

  const execColumns: TableColumnsType<RdmTestExecutionRecord> = useMemo(() => [
    { title: '交付項', dataIndex: 'deliveryItemTitle', key: 'deliveryItemTitle', width: 160, ellipsis: true },
    { title: '用例ID', dataIndex: 'caseId', key: 'caseId', width: 130, ellipsis: true, render: (v: string | null) => v || '-' },
    { title: '用例標題', dataIndex: 'caseTitle', key: 'caseTitle', width: 220, ellipsis: true },
    { title: '執行人', dataIndex: 'executorUserName', key: 'executorUserName', width: 100 },
    { title: '構建', dataIndex: 'buildId', key: 'buildId', width: 120, ellipsis: true, render: (v: string) => v || '-' },
    { title: '環境', dataIndex: 'testEnv', key: 'testEnv', width: 80, render: (v: string) => <Tag>{v?.toUpperCase() || '-'}</Tag> },
    {
      title: '結果', dataIndex: 'result', key: 'result', width: 80,
      render: (v: string) => {
        const cfg = RESULT_CONFIG[v]
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <Tag>{v}</Tag>
      },
    },
    {
      title: '執行時間', dataIndex: 'executedAt', key: 'executedAt', width: 140,
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
    },
    { title: '備註', dataIndex: 'remark', key: 'remark', width: 180, ellipsis: true, render: (v: string) => v || '-' },
  // 列定义包进 useMemo：下面拿它做「字段設置」候选的依赖，不包会每渲染都变
  ], [])

  /*
   * 執行記錄列配置（§E.3）：10 列且一屏装不下，QA 关心用例结果、研发关心交付项与构建，
   * 得能各自收起不看的那几列。必须与其它 hook 一样放在 early return 之前。
   */
  const execMeta = useMemo(() => deriveRdmColumnMeta(execColumns), [execColumns])
  const { configComponent: execConfig, applyConfig: applyExec } = useColumnConfig(
    'rdm-test-batch-execution', execMeta,
    [{ key: 'caseTitle', visible: true, locked: 'head' as const }],
  )
  const visibleExecColumns = applyExec(execColumns) as typeof execColumns
  // ===== 構建標識解析 =====
  const parsedBuildIds = useMemo(() => {
    if (!detail?.buildIdsJson) return []
    try { return JSON.parse(detail.buildIdsJson) as string[] } catch { return [] }
  }, [detail?.buildIdsJson])

  // ===== 渲染 =====
  if (loading) {
    return (
      <div className="content-area" style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" tip="載入中…" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="content-area">
        <Alert
          type="error"
          showIcon
          message={error || '批次不存在'}
          action={<Button size="small" onClick={() => navigate(-1)}>返回</Button>}
        />
      </div>
    )
  }

  const statusLabel = RDM_TEST_BATCH_STATUS_LABEL[detail.status] || detail.status
  const statusColor = RDM_TEST_BATCH_STATUS_COLOR[detail.status] || 'default'

  return (
    <div className="content-area">
      <RdmFormHeader
        title={`提測批次 ${detail.batchNo}`}
        onBack={() => navigate(-1)}
        badge={<Tag color={statusColor}>{statusLabel}</Tag>}
        meta={`第 ${detail.roundNo} 輪 · ${detail.testLeadUserName} · ${detail.testEnv?.toUpperCase()}`}
      />

      {/* ── Section 1: 批次摘要 ── */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><ExperimentOutlined /></span>
          批次摘要
          <span className="rdm-card-title-split" />
        </div>
        <Descriptions column={4} size="small" bordered={false}>
          <Descriptions.Item label="批次號">{detail.batchNo}</Descriptions.Item>
          <Descriptions.Item label="狀態"><Tag color={statusColor}>{statusLabel}</Tag></Descriptions.Item>
          <Descriptions.Item label={(
            <span>輪次
              <HelpPopover
                title="凍結輪次與穩定用例ID"
                ariaLabel="凍結輪次說明"
                content={[
                  { label: '輪次不可變', body: '接收後本輪範圍與用例集即凍結（roundNo 固定），修改範圍必須走變更流程、開新一輪。', tone: 'info' },
                  { label: '穩定 caseId', body: '通過門禁按本輪凍結的唯一 caseId 逐用例判定，絕不按「QA 任務完成度」推導通過。', tone: 'warn' },
                ]}
              />
            </span>
          )}>第 {detail.roundNo} 輪</Descriptions.Item>
          <Descriptions.Item label="測試環境"><Tag>{detail.testEnv?.toUpperCase()}</Tag></Descriptions.Item>
          <Descriptions.Item label="測試負責人">{detail.testLeadUserName}</Descriptions.Item>
          <Descriptions.Item label="申請人">{detail.applicantUserName || '-'}</Descriptions.Item>
          <Descriptions.Item label="計劃結束時間">{detail.planEndTime ? dayjs(detail.planEndTime).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
          <Descriptions.Item label="創建時間">{detail.createdAt ? dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
          <Descriptions.Item label="關聯需求" span={2}>
            <a onClick={() => navigate(`/rdm-detail?id=${detail.reqId}`)}>{detail.reqNo} {detail.reqTitle}</a>
          </Descriptions.Item>
          <Descriptions.Item label="交付項" span={2}>
            {scopeItems.length > 0 ? (
              <Space size={4} wrap>
                {scopeItems.map(it => (
                  <Tag key={it.deliveryItemId}>
                    {it.itemNo ? `${it.itemNo} ` : ''}{it.title || `#${it.deliveryItemId}`}
                    {it.scopeVersion != null ? ` · 範圍v${it.scopeVersion}` : ''}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Space size={4} wrap>
                {detail.deliveryItemTitles?.map((t, i) => <Tag key={i}>{t}</Tag>)}
              </Space>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="構建標識" span={2}>
            {parsedBuildIds.length > 0
              ? <Space size={4} wrap>{parsedBuildIds.map((b, i) => <Tag key={i} color="blue">{b}</Tag>)}</Space>
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="執行人員" span={2}>
            {detail.executorUserIds?.length ? detail.executorUserIds.join(', ') : '-'}
          </Descriptions.Item>
          {detail.returnedReason && (
            <Descriptions.Item label="退回原因" span={4}>
              <span style={{ color: '#FF4D4F' }}>{detail.returnedReason}</span>
            </Descriptions.Item>
          )}
        </Descriptions>
      </div>

      {/* ── Section 2: 執行摘要 ── */}
      {summary && (
        <div className="rdm-card">
          <div className="rdm-card-title">
            <span className="rdm-icon-block" style={{ background: '#F6FFED', color: '#52C41A' }}><CheckCircleOutlined /></span>
            執行摘要
            <span className="rdm-card-title-split" />
          </div>
          {/* §B.7：数据指标卡统一走 StatCards（4 格 grid + 计数动画 + 统一 hover），
              不再用 antd Row/Col + Statistic 旧式静态卡；通過率圆盘作为附属读数并列展示 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <StatCards
                animationKey={`${detail?.id}-${summary.totalCases}`}
                columns={4}
                items={[
                  { key: 'total', icon: <ExperimentOutlined />, color: 'info', value: summary.totalCases, label: '總用例數' },
                  { key: 'executed', icon: <SyncOutlined />, color: 'brand', value: summary.executedCases, label: '已執行' },
                  { key: 'passed', icon: <CheckCircleOutlined />, color: 'success', value: summary.passedCases, label: '通過' },
                  { key: 'failed', icon: <CloseCircleOutlined />, color: 'danger', value: summary.failedCases, label: '失敗' },
                  { key: 'blocked', icon: <MinusCircleOutlined />, color: 'system', value: summary.blockedCases, label: '阻塞' },
                  { key: 'skipped', icon: <MinusCircleOutlined />, color: 'system', value: summary.skippedCases, label: '跳過' },
                  { key: 'notExecuted', icon: <MinusCircleOutlined />, color: 'info', value: summary.notExecutedCases, label: '未執行' },
                ]}
              />
            </div>
            <div style={{
              width: 132, flexShrink: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              border: '1px solid #f0f0f0', borderRadius: 12,
            }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>通過率</div>
              <Progress
                type="circle"
                size={72}
                percent={Math.max(0, Math.min(100, Math.round(summary.passRate)))}
                strokeColor={summary.passRate >= 80 ? '#52C41A' : summary.passRate >= 50 ? '#FA8C16' : '#FF4D4F'}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Section 3: 執行記錄 ── */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}><SyncOutlined /></span>
          執行記錄
          <span className="rdm-card-title-split" />
          <Space size={12} style={{ marginLeft: 'auto' }}>
            <Select
              placeholder="按結果篩選"
              style={{ width: 120 }}
              value={resultFilter}
              onChange={setResultFilter}
              allowClear
              options={Object.entries(RESULT_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))}
            />
            <Select
              placeholder="按執行人篩選"
              style={{ width: 130 }}
              value={executorFilter}
              onChange={setExecutorFilter}
              allowClear
              options={executorOptions}
            />
            {execConfig}
          </Space>
        </div>
        <Table<RdmTestExecutionRecord>
          rowKey="id"
          size="small"
          columns={visibleExecColumns}
          dataSource={filteredExecutions}
          scroll={{ x: 1100 }}
          pagination={{
            defaultPageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: t => `共 ${t} 條`,
          }}
          locale={{ emptyText: '尚無執行記錄' }}
        />
      </div>

      {/* ── 底部操作欄 ── */}
      <div className="form-footer">
        <Button onClick={() => navigate(-1)}>返回</Button>
        {detail.status === RDM_TEST_BATCH_STATUS.PENDING && (
          <>
            <Button danger icon={<CloseCircleOutlined />} onClick={() => setReturnOpen(true)}>退回</Button>
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleAccept}>接收</Button>
          </>
        )}
        {(detail.status === RDM_TEST_BATCH_STATUS.EXECUTING || detail.status === RDM_TEST_BATCH_STATUS.ACCEPTED) && (
          <>
            <Button icon={<SendOutlined />} onClick={() => navigate(`/rdm-issue?batchId=${id}&mode=create`)}>登記問題</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setExecOpen(true); execForm.resetFields() }}>錄入結果</Button>
          </>
        )}
        {detail.status === RDM_TEST_BATCH_STATUS.FAILED && (
          <Button type="primary" icon={<SyncOutlined />} onClick={() => { setRetestOpen(true); setRetestReason(''); setRetestBuildIds(['']) }}>
            發起復測
          </Button>
        )}
      </div>

      {/* ── 退回 Modal ── */}
      <Modal
        title="退回提測批次"
        open={returnOpen}
        onCancel={() => setReturnOpen(false)}
        onOk={confirmReturn}
        confirmLoading={returnLoading}
        okText="確認退回"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <div style={{ marginBottom: 12, color: '#595959', fontSize: 13 }}>
          退回後研發需修復問題再重新提測，請說明退回原因：
        </div>
        <TextArea rows={4} value={returnReason} onChange={e => setReturnReason(e.target.value)}
          placeholder="例：構建版本未包含最新修復…" maxLength={500} showCount />
      </Modal>

      {/* ── 錄入結果 Modal ── */}
      <Modal
        title="錄入執行結果"
        open={execOpen}
        onCancel={() => setExecOpen(false)}
        onOk={handleExecSubmit}
        confirmLoading={execLoading}
        okText="提交"
        cancelText="取消"
        width={560}
        destroyOnHidden
      >
        <Form form={execForm} layout="vertical" style={{ marginTop: 16 }}>
          {frozenCases.length > 0 ? (
            <Form.Item name="caseId" label={t('rdm.testBatch.frozenCaseLabel', { defaultValue: '凍結用例' })}
              rules={[{ required: true, message: t('rdm.testBatch.frozenCaseRequired', { defaultValue: '請從凍結用例集選擇' }) }]}
              tooltip={t('rdm.testBatch.frozenCaseTooltip', { defaultValue: '服務端受理時凍結的本輪必測用例，門禁逐 caseId 判定通過；選定後自動帶出標題與交付項' })}>
              <Select
                placeholder={t('rdm.testBatch.frozenCasePlaceholder', { defaultValue: `選擇本輪凍結用例（共 ${frozenCases.length} 條）`, count: frozenCases.length })}
                showSearch
                optionFilterProp="label"
                options={frozenCaseOptions}
                onChange={pickFrozenCase}
              />
            </Form.Item>
          ) : (
            <Form.Item name="caseId" label={t('rdm.testBatch.caseIdLabel', { defaultValue: '用例ID' })}
              tooltip={t('rdm.testBatch.caseIdFallbackTooltip', { defaultValue: '尚未受理凍結，沒有可用的穩定用例ID；先受理提測批次再錄結果' })}>
              <Input placeholder={t('rdm.testBatch.caseIdFallbackPlaceholder', { defaultValue: '例：CASE-LOGIN-001（受理後請改為下拉選擇）' })} maxLength={64} />
            </Form.Item>
          )}
          <Form.Item name="caseTitle" label="用例標題" rules={[{ required: true, message: '請輸入用例標題' }]}>
            <Input placeholder="例：用戶登入後跳轉首頁" maxLength={200} />
          </Form.Item>
          <Form.Item name="deliveryItemId" label="交付項">
            <Select placeholder="選擇交付項（可選）" allowClear options={deliveryItemOptions}
              notFoundContent="無可用交付項（缺範圍快照）" />
          </Form.Item>
          <Form.Item name="result" label="執行結果" rules={[{ required: true, message: '請選擇結果' }]}>
            <Radio.Group optionType="button" buttonStyle="solid">
              {Object.entries(RESULT_CONFIG).map(([v, c]) => (
                <Radio.Button key={v} value={v}>{c.label}</Radio.Button>
              ))}
            </Radio.Group>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="buildId" label="構建標識">
                <Input placeholder="選填" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="testEnv" label="測試環境">
                <Select placeholder="選填" allowClear options={TEST_ENV_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="備註">
            <TextArea rows={3} placeholder="補充說明（選填）" maxLength={500} />
          </Form.Item>
          <Form.Item name="evidenceJson" label="執行證據"
            tooltip="截圖/日誌連結等證據（JSON 字串，服務端原樣留存）">
            <TextArea rows={3} placeholder='例：{"screenshots":["..."],"logs":["..."]}（選填）' />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── 復測 Modal ── */}
      <Modal
        title="發起復測"
        open={retestOpen}
        onCancel={() => setRetestOpen(false)}
        onOk={handleRetest}
        confirmLoading={retestLoading}
        okText="確認復測"
        cancelText="取消"
        width={520}
        destroyOnHidden
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>復測原因（必填）</div>
          <TextArea rows={3} value={retestReason} onChange={e => setRetestReason(e.target.value)}
            placeholder="例：研發已修復登入跳轉問題，新構建 build-2024-1234" maxLength={500} showCount />
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>新構建標識</div>
          {retestBuildIds.map((bid, idx) => (
            <Space key={idx} style={{ display: 'flex', marginBottom: 8 }}>
              <Input
                value={bid}
                onChange={e => { const next = [...retestBuildIds]; next[idx] = e.target.value; setRetestBuildIds(next) }}
                placeholder={`構建 ID ${idx + 1}`}
                style={{ width: 280 }}
              />
              {retestBuildIds.length > 1 && (
                <Button type="link" danger size="small" icon={<MinusCircleOutlined />}
                  onClick={() => setRetestBuildIds(retestBuildIds.filter((_, i) => i !== idx))} />
              )}
            </Space>
          ))}
          <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => setRetestBuildIds([...retestBuildIds, ''])}>
            新增構建
          </Button>
        </div>
      </Modal>
    </div>
  )
}
