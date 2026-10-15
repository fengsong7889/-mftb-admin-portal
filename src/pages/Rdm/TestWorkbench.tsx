/**
 * 提測工作台 —— 測試批次列表與操作
 *
 * QA 團隊的主要工作區：查看所有提測批次，按狀態篩選，接收/退回/錄入結果/發起復測。
 * 統計卡片跟隨搜索條件動態變化（AGENTS.md §E.8：統計卡片必須在搜索區下方）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button, Col, DatePicker, Form, Input, Modal, Row,
  Select, Space, Statistic, Table, Tag, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
  MinusCircleOutlined, PlusOutlined,
  ReloadOutlined, SendOutlined, SyncOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  fetchTestBatches, submitTestBatch, acceptTestBatch, returnTestBatch,
  fetchDeliveryItems,
  type RdmTestBatchListItem, type RdmTestBatchQuery,
  type RdmTestBatchSubmitForm, type RdmDeliveryItemListItem,
} from '../../api/rdm'
import { fetchRequirementPage, type RdmRequirementRow } from '../../api/rdm'
import {
  RDM_TEST_BATCH_STATUS, RDM_TEST_BATCH_STATUS_LABEL, RDM_TEST_BATCH_STATUS_COLOR,
} from '../../constants/rdm'
import './index.css'

const { RangePicker } = DatePicker
const { TextArea } = Input

/** 測試環境選項 */
const TEST_ENV_OPTIONS = [
  { value: 'uat', label: 'UAT 環境' },
  { value: 'pre', label: '預發環境' },
  { value: 'prod', label: '生產環境' },
]

export default function TestWorkbench() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<RdmTestBatchListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // 搜索條件
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [testLeadFilter, setTestLeadFilter] = useState('')
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)

  // 統計
  const [stats, setStats] = useState({ pending: 0, executing: 0, failed: 0, passed: 0 })

  // 發起提測 Modal
  const [submitOpen, setSubmitOpen] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitForm] = Form.useForm()
  const [reqOptions, setReqOptions] = useState<RdmRequirementRow[]>([])
  const [deliveryOptions, setDeliveryOptions] = useState<RdmDeliveryItemListItem[]>([])
  const [buildIds, setBuildIds] = useState<string[]>([''])

  // 退回 Modal
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnId, setReturnId] = useState<number | null>(null)
  const [returnReason, setReturnReason] = useState('')
  const [returnLoading, setReturnLoading] = useState(false)

  const buildQuery = useCallback((): RdmTestBatchQuery => {
    const q: RdmTestBatchQuery = { pageNo: page, pageSize }
    if (keyword.trim()) q.keyword = keyword.trim()
    if (statusFilter) q.status = statusFilter
    return q
  }, [page, pageSize, keyword, statusFilter])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchTestBatches(buildQuery())
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
      // 統計各狀態數量（從全量推導）
      computeStats()
    } catch {
      message.error('提測批次載入失敗')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  /** 分別查詢各狀態的 total 來生成統計卡片 */
  const computeStats = async () => {
    try {
      const baseQ: RdmTestBatchQuery = {}
      if (keyword.trim()) baseQ.keyword = keyword.trim()
      const [p, e, f, s] = await Promise.all([
        fetchTestBatches({ ...baseQ, status: RDM_TEST_BATCH_STATUS.PENDING, pageSize: 1 }),
        fetchTestBatches({ ...baseQ, status: RDM_TEST_BATCH_STATUS.EXECUTING, pageSize: 1 }),
        fetchTestBatches({ ...baseQ, status: RDM_TEST_BATCH_STATUS.FAILED, pageSize: 1 }),
        fetchTestBatches({ ...baseQ, status: RDM_TEST_BATCH_STATUS.PASSED, pageSize: 1 }),
      ])
      setStats({ pending: p.total, executing: e.total, failed: f.total, passed: s.total })
    } catch { /* 統計失敗不影響主列表 */ }
  }

  useEffect(() => { void loadData() }, [loadData])

  const handleSearch = () => { setPage(1); void loadData() }
  const handleReset = () => {
    setKeyword(''); setStatusFilter(undefined); setTestLeadFilter(''); setDateRange(null)
    setPage(1)
  }

  // ===== 操作 =====
  const handleAccept = (id: number) => {
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
          void loadData()
        } catch {
          // request.ts 已统一弹后端返回的失败原因，这里再弹一次就是双弹（AGENTS §G.4）
        }
      },
    })
  }

  const handleReturn = (id: number) => {
    setReturnId(id); setReturnReason(''); setReturnOpen(true)
  }

  const confirmReturn = async () => {
    if (!returnReason.trim()) { message.warning('請填寫退回原因'); return }
    if (!returnId) return
    setReturnLoading(true)
    try {
      await returnTestBatch(returnId, { reason: returnReason.trim() })
      message.success('已退回提測批次')
      setReturnOpen(false)
      void loadData()
    } catch { message.error('退回失敗') }
    finally { setReturnLoading(false) }
  }

  // ===== 發起提測 =====
  const openSubmitModal = async () => {
    setSubmitOpen(true)
    submitForm.resetFields()
    setBuildIds([''])
    setDeliveryOptions([])
    try {
      const res = await fetchRequirementPage({ size: 50, page: 1, scope: 'delivery' })
      setReqOptions(res.records ?? [])
    } catch { /* ignore */ }
  }

  const handleReqChange = async (reqId: number) => {
    submitForm.setFieldsValue({ deliveryItemIds: [] })
    try {
      const res = await fetchDeliveryItems({ reqId, pageSize: 100 })
      setDeliveryOptions(res.records ?? [])
    } catch { setDeliveryOptions([]) }
  }

  const handleSubmitBatch = async () => {
    try {
      const values = await submitForm.validateFields()
      setSubmitLoading(true)
      const payload: RdmTestBatchSubmitForm = {
        reqId: values.reqId,
        deliveryItemIds: values.deliveryItemIds,
        testEnv: values.testEnv,
        testLeadUserId: values.testLeadUserId,
        testLeadUserName: values.testLeadUserName || '',
        executorUserIds: values.executorUserIds,
        planEndTime: values.planEndTime ? values.planEndTime.format('YYYY-MM-DD HH:mm:ss') : undefined,
        buildIds: buildIds.filter(b => b.trim()),
      }
      await submitTestBatch(payload)
      message.success('提測批次已建立')
      setSubmitOpen(false)
      void loadData()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return // form validation
      message.error('提交失敗')
    } finally { setSubmitLoading(false) }
  }

  // ===== 表格列 =====
  const columns: TableColumnsType<RdmTestBatchListItem> = useMemo(() => [
    {
      title: '批次號', dataIndex: 'batchNo', key: 'batchNo', width: 140,
      render: (v: string, r) => (
        <a className="rdm-table-title__link" onClick={() => navigate(`/rdm-test-detail?id=${r.id}`)}>{v}</a>
      ),
    },
    {
      title: '交付範圍', dataIndex: 'deliveryItemTitles', key: 'deliveryItemTitles', width: 200, ellipsis: true,
      render: (v: string[]) => v?.join('、') || '-',
    },
    {
      title: '需求', key: 'req', width: 200, ellipsis: true,
      render: (_, r) => <span>{r.reqNo} {r.reqTitle}</span>,
    },
    {
      title: '環境', dataIndex: 'testEnv', key: 'testEnv', width: 90,
      render: (v: string) => <Tag>{v?.toUpperCase() || '-'}</Tag>,
    },
    { title: '測試負責人', dataIndex: 'testLeadUserName', key: 'testLeadUserName', width: 110 },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={RDM_TEST_BATCH_STATUS_COLOR[v] || 'default'}>{RDM_TEST_BATCH_STATUS_LABEL[v] || v}</Tag>,
    },
    { title: '輪次', dataIndex: 'roundNo', key: 'roundNo', width: 70, align: 'center' },
    {
      title: '計劃結束', dataIndex: 'planEndTime', key: 'planEndTime', width: 120,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      title: '通過/總數', key: 'ratio', width: 100, align: 'center',
      render: (_, r) => {
        const color = r.totalCount === 0 ? '#8C8C8C' : r.passCount === r.totalCount ? '#52C41A' : r.passCount > 0 ? '#FA8C16' : '#FF4D4F'
        return <span style={{ color, fontWeight: 600 }}>{r.passCount}/{r.totalCount}</span>
      },
    },
    {
      title: '操作', key: 'action', width: 180, fixed: 'right',
      render: (_, r) => {
        const actions: React.ReactNode[] = []
        if (r.status === RDM_TEST_BATCH_STATUS.PENDING) {
          actions.push(<Button key="accept" type="link" size="small" onClick={() => handleAccept(r.id)}>接收</Button>)
          actions.push(<Button key="return" type="link" size="small" danger onClick={() => handleReturn(r.id)}>退回</Button>)
        }
        if (r.status === RDM_TEST_BATCH_STATUS.EXECUTING || r.status === RDM_TEST_BATCH_STATUS.ACCEPTED) {
          actions.push(<Button key="exec" type="link" size="small" onClick={() => navigate(`/rdm-test-detail?id=${r.id}`)}>錄入結果</Button>)
          actions.push(<Button key="issue" type="link" size="small" onClick={() => navigate(`/rdm-issue?batchId=${r.id}&mode=create`)}>登記問題</Button>)
        }
        if (r.status === RDM_TEST_BATCH_STATUS.FAILED) {
          actions.push(<Button key="retest" type="link" size="small" onClick={() => navigate(`/rdm-test-detail?id=${r.id}`)}>復測</Button>)
        }
        actions.push(<Button key="detail" type="link" size="small" onClick={() => navigate(`/rdm-test-detail?id=${r.id}`)}>詳情</Button>)
        return <Space size={0} split={<span className="action-split">|</span>}>{actions}</Space>
      },
    },
  ], [navigate])

  const statusOptions = Object.entries(RDM_TEST_BATCH_STATUS_LABEL).map(([value, label]) => ({ value, label }))

  return (
    <div className="content-area rdm-workspace">
      {/* ── 搜索區 ── */}
      <div className="search-section">
        <Form layout="inline" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px 16px' }}>
          <Form.Item label="關鍵詞">
            <Input
              placeholder="批次號 / 需求標題"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </Form.Item>
          <Form.Item label="狀態">
            <Select
              placeholder="全部狀態"
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
              allowClear
            />
          </Form.Item>
          <Form.Item label="測試負責人">
            <Input
              placeholder="負責人姓名"
              value={testLeadFilter}
              onChange={e => setTestLeadFilter(e.target.value)}
              allowClear
            />
          </Form.Item>
          <Form.Item label="計劃結束時間">
            <RangePicker
              value={dateRange}
              onChange={(v) => setDateRange(v as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item className="search-actions" style={{ gridColumn: '1 / -1' }}>
            <Space>
              <Button type="primary" onClick={handleSearch}>查詢</Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      {/* ── 統計卡片（必須在搜索區下方、操作區上方） ── */}
      <div className="rdm-test-stats" key={`${keyword}-${statusFilter}`}>
        <Row gutter={16}>
          <Col span={6}>
            <div className="rdm-stat-card rdm-stat-card--warning">
              <Statistic title="待接收" value={stats.pending} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#FA8C16' }} />
            </div>
          </Col>
          <Col span={6}>
            <div className="rdm-stat-card rdm-stat-card--processing">
              <Statistic title="執行中" value={stats.executing} prefix={<SyncOutlined spin />} valueStyle={{ color: '#1890FF' }} />
            </div>
          </Col>
          <Col span={6}>
            <div className="rdm-stat-card rdm-stat-card--error">
              <Statistic title="待復測" value={stats.failed} prefix={<CloseCircleOutlined />} valueStyle={{ color: '#FF4D4F' }} />
            </div>
          </Col>
          <Col span={6}>
            <div className="rdm-stat-card rdm-stat-card--success">
              <Statistic title="已通過" value={stats.passed} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52C41A' }} />
            </div>
          </Col>
        </Row>
      </div>

      {/* ── 操作區 ── */}
      <div className="action-section">
        <div className="action-section-left">
          <Button type="primary" icon={<PlusOutlined />} onClick={openSubmitModal}>發起提測</Button>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        </div>
      </div>

      {/* ── 表格 ── */}
      <Table<RdmTestBatchListItem>
        className="nowrap-table"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1400 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: t => `共 ${t} 條`,
          onChange: (p, s) => { setPage(p); setPageSize(s) },
        }}
      />

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
        <TextArea
          rows={4}
          value={returnReason}
          onChange={e => setReturnReason(e.target.value)}
          placeholder="例：構建版本未包含最新修復，環境配置不完整…"
          maxLength={500}
          showCount
        />
      </Modal>

      {/* ── 發起提測 Modal ── */}
      <Modal
        title={<span><SendOutlined style={{ marginRight: 8, color: '#E8720C' }} />發起提測</span>}
        open={submitOpen}
        onCancel={() => setSubmitOpen(false)}
        onOk={handleSubmitBatch}
        confirmLoading={submitLoading}
        okText="提交"
        cancelText="取消"
        width={640}
        destroyOnClose
      >
        <Form form={submitForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="reqId" label="關聯需求" rules={[{ required: true, message: '請選擇需求' }]}>
            <Select
              placeholder="搜索需求"
              showSearch
              optionFilterProp="label"
              onChange={handleReqChange}
              options={reqOptions.map(r => ({ value: r.id, label: `${r.reqNo} ${r.title}` }))}
            />
          </Form.Item>
          <Form.Item name="deliveryItemIds" label="交付項" rules={[{ required: true, message: '請選擇交付項' }]}>
            <Select
              mode="multiple"
              placeholder="選擇交付項（可多選）"
              options={deliveryOptions.map(d => ({ value: d.id, label: `${d.itemNo} ${d.title}` }))}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="testEnv" label="測試環境" rules={[{ required: true, message: '請選擇環境' }]}>
                <Select placeholder="選擇環境" options={TEST_ENV_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="planEndTime" label="計劃結束時間">
                <DatePicker showTime style={{ width: '100%' }} placeholder="選擇日期" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="testLeadUserId" label="測試負責人 ID" rules={[{ required: true, message: '請輸入' }]}>
                <Input placeholder="用戶 ID" type="number" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="testLeadUserName" label="測試負責人姓名">
                <Input placeholder="姓名" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="executorUserIds" label="執行人員 ID（逗號分隔）">
            <Select mode="tags" placeholder="輸入用戶 ID 後按 Enter" />
          </Form.Item>
          <Form.Item label="構建標識">
            {buildIds.map((bid, idx) => (
              <Space key={idx} style={{ display: 'flex', marginBottom: 8 }}>
                <Input
                  value={bid}
                  onChange={e => {
                    const next = [...buildIds]; next[idx] = e.target.value; setBuildIds(next)
                  }}
                  placeholder={`構建 ID ${idx + 1}`}
                  style={{ width: 280 }}
                />
                {buildIds.length > 1 && (
                  <Button type="link" danger size="small" icon={<MinusCircleOutlined />}
                    onClick={() => setBuildIds(buildIds.filter((_, i) => i !== idx))} />
                )}
              </Space>
            ))}
            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => setBuildIds([...buildIds, ''])}>
              新增構建
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
