/**
 * 發布中心 —— 發布批次列表與狀態追蹤
 *
 * 变更影响：前端（新增完整列表页）
 * 安全边界：仅前端展示层，数据来源于后端 /rdm/release-batch 接口
 * 测试计划：列表加载、筛选条件、创建弹窗表单校验
 * 回滚方案：恢复占位组件
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Col, DatePicker, Form, Input, InputNumber, Modal, Progress,
  Row, Select, Space, Statistic, Table, Tag, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, CloudUploadOutlined,
  DeleteOutlined, MinusCircleOutlined, PlusOutlined, ReloadOutlined,
  RocketOutlined, SearchOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  fetchReleaseBatches,
  createReleaseBatch,
  fetchProjectPage,
  fetchDeliveryItems,
  type RdmReleaseBatchListItem,
  type RdmReleaseBatchCreateForm,
  type RdmProjectListItem,
  type RdmDeliveryItemListItem,
} from '../../api/rdm'
import { fetchEmployees } from '../../api/employee'
import {
  RDM_RELEASE_BATCH_STATUS,
  RDM_RELEASE_BATCH_STATUS_COLOR,
  RDM_RELEASE_BATCH_STATUS_LABEL,
} from '../../constants/rdm'
import './index.css'

const { RangePicker } = DatePicker

/** 状态选项（搜索筛选器） */
const STATUS_OPTIONS = Object.entries(RDM_RELEASE_BATCH_STATUS_LABEL).map(([value, label]) => ({
  value,
  label,
}))

/**
 * 员工下拉选项：选项值取数字用户 ID（sys_user.id）。
 * 注意：不能直接用 api/employee 的 fetchEmployeeOptions，其 value 为工号字符串（如 'MF00001'），
 * 提交时 Number('MF00001') 会得到 NaN，导致发布负责人 / 负责人筛选传参错误。
 */
async function fetchEmployeeIdOptions(keyword: string): Promise<{ value: string; label: string }[]> {
  const res = await fetchEmployees({ page: 1, size: 50, keyword: keyword || undefined, employmentStatus: 'active' })
  return (res.records || []).map(e => {
    const extra = [e.department, e.position, e.jobLevel].filter(Boolean).join(' / ')
    return { value: String(e.id), label: `${e.name}(${e.empId})${extra ? ` · ${extra}` : ''}` }
  })
}

export default function ReleaseCenter() {
  const navigate = useNavigate()
  const [form] = Form.useForm()

  // ===== 列表状态 =====
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<RdmReleaseBatchListItem[]>([])
  const [total, setTotal] = useState(0)
  const [pageNo, setPageNo] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [error, setError] = useState<string | null>(null)

  // ===== 筛选条件 =====
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const [ownerFilter, setOwnerFilter] = useState<string | undefined>(undefined)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)

  // ===== 创建弹窗 =====
  const [createOpen, setCreateOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [projects, setProjects] = useState<RdmProjectListItem[]>([])
  const [deliveryItems, setDeliveryItems] = useState<RdmDeliveryItemListItem[]>([])
  const [employeeOptions, setEmployeeOptions] = useState<{ value: string; label: string }[]>([])

  // ===== 数据加载 =====
  const loadData = useCallback(async (pn = pageNo, ps = pageSize) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchReleaseBatches({
        keyword: keyword || undefined,
        status: statusFilter,
        releaseOwnerUserId: ownerFilter ? Number(ownerFilter) : undefined,
        pageNo: pn,
        pageSize: ps,
      })
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '發布批次清單載入失敗')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [keyword, statusFilter, ownerFilter, pageNo, pageSize])

  useEffect(() => { loadData() }, [loadData])

  // ===== 统计卡片 =====
  const stats = useMemo(() => {
    const planningCount = rows.filter(r =>
      r.status === RDM_RELEASE_BATCH_STATUS.PLANNING || r.status === RDM_RELEASE_BATCH_STATUS.CHECKING
    ).length
    const approvedCount = rows.filter(r => r.status === RDM_RELEASE_BATCH_STATUS.APPROVED).length
    const deployingCount = rows.filter(r =>
      r.status === RDM_RELEASE_BATCH_STATUS.DEPLOYING || r.status === RDM_RELEASE_BATCH_STATUS.VERIFYING
    ).length
    const releasedCount = rows.filter(r => r.status === RDM_RELEASE_BATCH_STATUS.RELEASED).length
    return { planningCount, approvedCount, deployingCount, releasedCount }
  }, [rows])

  // ===== 搜索 =====
  const handleSearch = () => {
    setPageNo(1)
    loadData(1, pageSize)
  }

  const handleReset = () => {
    setKeyword('')
    setStatusFilter(undefined)
    setOwnerFilter(undefined)
    setDateRange(null)
    setPageNo(1)
  }

  // ===== 创建弹窗 =====
  const handleOpenCreate = async () => {
    setCreateOpen(true)
    try {
      const [projRes, empRes] = await Promise.all([
        fetchProjectPage({ pageSize: 200 }),
        fetchEmployeeIdOptions(''),
      ])
      setProjects(projRes.records ?? [])
      setEmployeeOptions(empRes)
    } catch {
      message.error('載入項目或人員清單失敗')
    }
  }

  const handleCreateSubmit = async () => {
    try {
      const values = await form.validateFields()
      setCreateLoading(true)
      const selectedEmployee = employeeOptions.find(e => e.value === String(values.releaseOwnerUserId))
      const data: RdmReleaseBatchCreateForm = {
        versionTag: values.versionTag,
        projectId: values.projectId,
        releaseOwnerUserId: Number(values.releaseOwnerUserId),
        releaseOwnerUserName: selectedEmployee?.label?.split('(')[0] ?? '',
        planTime: values.planTime ? values.planTime.format('YYYY-MM-DDTHH:mm:ss') : undefined,
        deliveryItemIds: values.deliveryItemIds,
        deployments: (values.deployments ?? []).map((d: Record<string, unknown>, i: number) => ({
          systemCode: d.systemCode as string,
          systemName: d.systemName as string | undefined,
          buildId: d.buildId as string | undefined,
          deployOrder: (d.deployOrder as number | undefined) ?? i + 1,
        })),
      }
      await createReleaseBatch(data)
      message.success('發布批次創建成功')
      setCreateOpen(false)
      form.resetFields()
      loadData(1, pageSize)
      setPageNo(1)
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return // form validation error
      message.error('創建發布批次失敗')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleProjectChange = async (projectId: number | undefined) => {
    form.setFieldValue('deliveryItemIds', [])
    if (!projectId) {
      setDeliveryItems([])
      return
    }
    try {
      const res = await fetchDeliveryItems({ projectId, pageSize: 200 })
      setDeliveryItems(res.records ?? [])
    } catch {
      setDeliveryItems([])
    }
  }

  // ===== 表格列 =====
  const columns: TableColumnsType<RdmReleaseBatchListItem> = useMemo(() => [
    {
      title: '批次號', dataIndex: 'batchNo', key: 'batchNo', width: 160,
      render: (v: string, r) => (
        <a className="rdm-table-title__link" onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>{v}</a>
      ),
    },
    {
      title: '版本標識', dataIndex: 'versionTag', key: 'versionTag', width: 130,
      render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    { title: '關聯項目', dataIndex: 'projectName', key: 'projectName', width: 160, ellipsis: true, render: (v?: string) => v || '-' },
    {
      title: '範圍摘要', key: 'scope', width: 140,
      render: (_, r) => <span>{r.systemCount ?? 0} 個系統</span>,
    },
    { title: '發布負責人', dataIndex: 'releaseOwnerUserName', key: 'owner', width: 120, render: (v?: string) => v || '-' },
    {
      title: '計劃時間', dataIndex: 'planTime', key: 'planTime', width: 160,
      render: (v?: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => (
        <Tag color={RDM_RELEASE_BATCH_STATUS_COLOR[v] ?? 'default'}>
          {RDM_RELEASE_BATCH_STATUS_LABEL[v] ?? v}
        </Tag>
      ),
    },
    {
      title: '部署進度', key: 'progress', width: 130,
      render: (_, r) => {
        const pct = r.systemCount > 0 ? Math.round((r.deployedCount / r.systemCount) * 100) : 0
        return (
          <Space size={4}>
            <Progress percent={pct} size="small" style={{ width: 60 }} showInfo={false} />
            <span style={{ fontSize: 12, color: '#595959' }}>{r.deployedCount}/{r.systemCount}</span>
          </Space>
        )
      },
    },
    {
      title: '操作', key: 'action', width: 200, fixed: 'right',
      render: (_, r) => {
        const actions: React.ReactNode[] = []
        const s = r.status
        if (s === RDM_RELEASE_BATCH_STATUS.PLANNING) {
          actions.push(<Button key="check" type="link" size="small" onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>檢查</Button>)
        }
        if (s === RDM_RELEASE_BATCH_STATUS.CHECKING) {
          actions.push(<Button key="apply" type="link" size="small" onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>申請發布</Button>)
        }
        if (s === RDM_RELEASE_BATCH_STATUS.APPROVED) {
          actions.push(<Button key="deploy" type="link" size="small" onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>記錄部署</Button>)
        }
        if (s === RDM_RELEASE_BATCH_STATUS.DEPLOYING) {
          actions.push(<Button key="deploy2" type="link" size="small" onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>記錄部署</Button>)
          actions.push(<Button key="rb" type="link" size="small" danger onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>回滾</Button>)
        }
        if (s === RDM_RELEASE_BATCH_STATUS.VERIFYING) {
          actions.push(<Button key="verify" type="link" size="small" onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>生產驗證</Button>)
          actions.push(<Button key="rb2" type="link" size="small" danger onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>回滾</Button>)
        }
        if (s === RDM_RELEASE_BATCH_STATUS.RELEASED) {
          actions.push(<Button key="rb3" type="link" size="small" danger onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>回滾</Button>)
        }
        actions.push(<Button key="detail" type="link" size="small" onClick={() => navigate(`/rdm-release-detail?id=${r.id}`)}>詳情</Button>)
        return <Space size={0} split={<span className="action-split">|</span>}>{actions}</Space>
      },
    },
  ], [navigate])

  const tableWidth = columns.reduce((sum, col) => sum + Number((col as { width?: number }).width ?? 120), 0)

  return (
    <div className="content-area">
      {/* 錯誤橫幅 */}
      {error && (
        <Alert
          type="error"
          showIcon
          closable
          style={{ marginBottom: 12 }}
          message={error}
          action={<Button size="small" onClick={() => loadData()}>重試</Button>}
        />
      )}

      {/* ===== 搜索區 ===== */}
      <div className="search-section">
        <Form layout="inline" style={{ width: '100%' }}>
          <Form.Item label="關鍵字">
            <Input
              placeholder="版本標識 / 批次號"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
              style={{ width: 180 }}
              prefix={<SearchOutlined style={{ color: '#BFBFBF' }} />}
            />
          </Form.Item>
          <Form.Item label="狀態">
            <Select
              placeholder="全部狀態"
              value={statusFilter}
              onChange={v => setStatusFilter(v)}
              allowClear
              style={{ width: 140 }}
              options={STATUS_OPTIONS}
            />
          </Form.Item>
          <Form.Item label="負責人">
            <Select
              placeholder="發布負責人"
              value={ownerFilter}
              onChange={v => setOwnerFilter(v)}
              allowClear
              showSearch
              filterOption={false}
              onSearch={async (val) => {
                if (val.length >= 1) {
                  try {
                    setEmployeeOptions(await fetchEmployeeIdOptions(val))
                  } catch { /* ignore */ }
                }
              }}
              style={{ width: 160 }}
              options={employeeOptions}
            />
          </Form.Item>
          <Form.Item label="計劃時間">
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
              style={{ width: 240 }}
            />
          </Form.Item>
          <Form.Item className="search-actions">
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      {/* ===== 統計卡片（必須在搜索區下方） ===== */}
      <div className="rdm-release-stats" key={`${statusFilter}-${keyword}`}>
        <Row gutter={16}>
          <Col span={6}>
            <div className="rdm-release-stat-card">
              <Statistic
                title={<span><ClockCircleOutlined style={{ marginRight: 4, color: '#8C8C8C' }} />計劃中</span>}
                value={stats.planningCount}
                valueStyle={{ color: '#595959', fontSize: 28, fontWeight: 700 }}
              />
            </div>
          </Col>
          <Col span={6}>
            <div className="rdm-release-stat-card rdm-release-stat-card--processing">
              <Statistic
                title={<span><CheckCircleOutlined style={{ marginRight: 4, color: '#1890FF' }} />待審批</span>}
                value={stats.approvedCount}
                valueStyle={{ color: '#1890FF', fontSize: 28, fontWeight: 700 }}
              />
            </div>
          </Col>
          <Col span={6}>
            <div className="rdm-release-stat-card rdm-release-stat-card--warning">
              <Statistic
                title={<span><CloudUploadOutlined style={{ marginRight: 4, color: '#E8720C' }} />部署中</span>}
                value={stats.deployingCount}
                valueStyle={{ color: '#E8720C', fontSize: 28, fontWeight: 700 }}
              />
            </div>
          </Col>
          <Col span={6}>
            <div className="rdm-release-stat-card rdm-release-stat-card--success">
              <Statistic
                title={<span><RocketOutlined style={{ marginRight: 4, color: '#52C41A' }} />已發布</span>}
                value={stats.releasedCount}
                valueStyle={{ color: '#52C41A', fontSize: 28, fontWeight: 700 }}
              />
            </div>
          </Col>
        </Row>
      </div>

      {/* ===== 操作區 ===== */}
      <div className="action-section">
        <div className="action-section-left">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>創建發布批次</Button>
        </div>
        <div className="action-section-right">
          <Button icon={<ReloadOutlined />} onClick={() => loadData()}>刷新</Button>
        </div>
      </div>

      {/* ===== 表格 ===== */}
      <Table<RdmReleaseBatchListItem>
        className="nowrap-table"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        tableLayout="fixed"
        scroll={{ x: tableWidth }}
        pagination={{
          current: pageNo,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: t => `共 ${t} 條`,
          onChange: (p, s) => { setPageNo(p); setPageSize(s) },
        }}
      />

      {/* ===== 創建發布批次 Modal ===== */}
      <Modal
        title={<span><RocketOutlined style={{ marginRight: 8, color: '#E8720C' }} />創建發布批次</span>}
        open={createOpen}
        onCancel={() => { setCreateOpen(false); form.resetFields() }}
        onOk={handleCreateSubmit}
        confirmLoading={createLoading}
        width={780}
        okText="創建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="versionTag" label="版本標識" rules={[{ required: true, message: '請輸入版本標識' }]}>
                <Input placeholder="例如 v2.1.0" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="projectId" label="關聯項目">
                <Select
                  placeholder="選擇項目"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  onChange={handleProjectChange}
                  options={projects.map(p => ({ value: p.id, label: `${p.projectNo} - ${p.name}` }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="releaseOwnerUserId" label="發布負責人" rules={[{ required: true, message: '請選擇發布負責人' }]}>
                <Select
                  placeholder="搜索選擇"
                  showSearch
                  filterOption={false}
                  onSearch={async (val) => {
                    try {
                      setEmployeeOptions(await fetchEmployeeIdOptions(val))
                    } catch { /* ignore */ }
                  }}
                  options={employeeOptions}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="planTime" label="計劃發布時間">
                <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} placeholder="選擇計劃時間" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="deliveryItemIds" label="交付項">
            <Select
              mode="multiple"
              placeholder="選擇交付項（依項目篩選）"
              allowClear
              optionFilterProp="label"
              options={deliveryItems.map(d => ({ value: d.id, label: `${d.itemNo} - ${d.title}` }))}
            />
          </Form.Item>

          {/* 部署系統清單（動態表單） */}
          <Form.Item label="部署系統清單" style={{ marginBottom: 0 }}>
            <Form.List name="deployments">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                      <Form.Item {...restField} name={[name, 'systemCode']} rules={[{ required: true, message: '必填' }]} style={{ marginBottom: 0 }}>
                        <Input placeholder="系統編碼" style={{ width: 130 }} />
                      </Form.Item>
                      <Form.Item {...restField} name={[name, 'systemName']} style={{ marginBottom: 0 }}>
                        <Input placeholder="系統名稱" style={{ width: 130 }} />
                      </Form.Item>
                      <Form.Item {...restField} name={[name, 'buildId']} style={{ marginBottom: 0 }}>
                        <Input placeholder="構建標識" style={{ width: 130 }} />
                      </Form.Item>
                      <Form.Item {...restField} name={[name, 'deployOrder']} style={{ marginBottom: 0 }}>
                        <InputNumber placeholder="順序" min={1} style={{ width: 80 }} />
                      </Form.Item>
                      <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#FF4D4F' }} />
                    </Space>
                  ))}
                  <Form.Item>
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      添加部署系統
                    </Button>
                  </Form.Item>
                </>
              )}
            </Form.List>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
