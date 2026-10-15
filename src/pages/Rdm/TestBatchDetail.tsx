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
  Radio, Row, Select, Space, Spin, Statistic, Table, Tag, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined, ExperimentOutlined,
  MinusCircleOutlined, PlusOutlined, SendOutlined, SyncOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import RdmFormHeader from './components/RdmFormHeader'
import {
  fetchTestBatchDetail, fetchTestBatchSummary, acceptTestBatch, returnTestBatch,
  submitTestExecution, retestBatch,
  type RdmTestBatchDetail as RdmTestBatchDetailType,
  type RdmTestBatchSummary, type RdmTestExecutionRecord, type RdmTestExecutionForm,
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
      const payload: RdmTestExecutionForm = {
        caseTitle: values.caseTitle,
        deliveryItemId: values.deliveryItemId ? Number(values.deliveryItemId) : undefined,
        result: values.result,
        buildId: values.buildId || undefined,
        testEnv: values.testEnv || undefined,
        remark: values.remark || undefined,
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

  const deliveryItemOptions = useMemo(() => {
    const titles = detail?.deliveryItemTitles ?? []
    return titles.map((t, i) => ({ value: String(i + 1), label: t }))
  }, [detail?.deliveryItemTitles])

  const execColumns: TableColumnsType<RdmTestExecutionRecord> = [
    { title: '交付項', dataIndex: 'deliveryItemTitle', key: 'deliveryItemTitle', width: 160, ellipsis: true },
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
  ]

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
          <Descriptions.Item label="輪次">第 {detail.roundNo} 輪</Descriptions.Item>
          <Descriptions.Item label="測試環境"><Tag>{detail.testEnv?.toUpperCase()}</Tag></Descriptions.Item>
          <Descriptions.Item label="測試負責人">{detail.testLeadUserName}</Descriptions.Item>
          <Descriptions.Item label="申請人">{detail.applicantUserName || '-'}</Descriptions.Item>
          <Descriptions.Item label="計劃結束時間">{detail.planEndTime ? dayjs(detail.planEndTime).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
          <Descriptions.Item label="創建時間">{detail.createdAt ? dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
          <Descriptions.Item label="關聯需求" span={2}>
            <a onClick={() => navigate(`/rdm-detail?id=${detail.reqId}`)}>{detail.reqNo} {detail.reqTitle}</a>
          </Descriptions.Item>
          <Descriptions.Item label="交付項" span={2}>
            <Space size={4} wrap>
              {detail.deliveryItemTitles?.map((t, i) => <Tag key={i}>{t}</Tag>)}
            </Space>
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
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={3}><Statistic title="總用例數" value={summary.totalCases} /></Col>
            <Col span={3}><Statistic title="已執行" value={summary.executedCases} valueStyle={{ color: '#1890FF' }} /></Col>
            <Col span={3}><Statistic title="通過" value={summary.passedCases} valueStyle={{ color: '#52C41A' }} /></Col>
            <Col span={3}><Statistic title="失敗" value={summary.failedCases} valueStyle={{ color: '#FF4D4F' }} /></Col>
            <Col span={3}><Statistic title="阻塞" value={summary.blockedCases} valueStyle={{ color: '#FA8C16' }} /></Col>
            <Col span={3}><Statistic title="跳過" value={summary.skippedCases} valueStyle={{ color: '#8C8C8C' }} /></Col>
            <Col span={3}><Statistic title="未執行" value={summary.notExecutedCases} valueStyle={{ color: '#8C8C8C' }} /></Col>
            <Col span={3}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>通過率</div>
                <Progress
                  type="circle"
                  size={56}
                  percent={Math.round(summary.passRate * 100)}
                  strokeColor={summary.passRate >= 0.8 ? '#52C41A' : summary.passRate >= 0.5 ? '#FA8C16' : '#FF4D4F'}
                />
              </div>
            </Col>
          </Row>
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
          </Space>
        </div>
        <Table<RdmTestExecutionRecord>
          rowKey="id"
          size="small"
          columns={execColumns}
          dataSource={filteredExecutions}
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 20, showTotal: t => `共 ${t} 條` }}
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
        destroyOnClose
      >
        <Form form={execForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="caseTitle" label="用例標題" rules={[{ required: true, message: '請輸入用例標題' }]}>
            <Input placeholder="例：用戶登入後跳轉首頁" maxLength={200} />
          </Form.Item>
          <Form.Item name="deliveryItemId" label="交付項">
            <Select placeholder="選擇交付項（可選）" allowClear options={deliveryItemOptions} />
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
        destroyOnClose
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
