import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Tag, Button, Input, Select, DatePicker, Modal, Form, message } from 'antd'
import dayjs from 'dayjs'
import {
  SearchOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useWorkflowConfig } from '../../hooks/useWorkflowConfig'
import { APPROVAL_TYPE_OPTIONS } from './types'
import type { WorkflowDefinition } from './types'

export default function WorkflowConfig() {
  const navigate = useNavigate()
  const { workflows, deleteWorkflow, toggleEnabled } = useWorkflowConfig()

  /* 搜索區表單 */
  const [searchForm] = Form.useForm()
  const [searchName, setSearchName] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterUpdatedBy, setFilterUpdatedBy] = useState('')
  const [filterUpdatedAt, setFilterUpdatedAt] = useState<string>('')

  /* 過濾後的數據 */
  const filteredWorkflows = useMemo(() => {
    return workflows.filter(wf => {
      if (searchName && !wf.name.includes(searchName) && !wf.workflowKey.includes(searchName)) return false
      if (filterStatus === 'enabled' && !wf.enabled) return false
      if (filterStatus === 'disabled' && wf.enabled) return false
      if (filterType !== 'all' && wf.approvalType !== filterType) return false
      if (filterUpdatedBy && !(wf.updatedBy || '').includes(filterUpdatedBy)) return false
      if (filterUpdatedAt) {
        const wfDate = new Date(wf.updatedAt).toISOString().slice(0, 10)
        if (wfDate !== filterUpdatedAt) return false
      }
      return true
    })
  }, [workflows, searchName, filterStatus, filterType, filterUpdatedBy, filterUpdatedAt])

  /* 查詢 */
  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    setSearchName(values.name || '')
    setFilterType(values.type || 'all')
    setFilterStatus(values.status || 'all')
    setFilterUpdatedBy(values.updatedBy || '')
    setFilterUpdatedAt(values.updatedAt ? values.updatedAt.format('YYYY-MM-DD') : '')
  }

  /* 重置 */
  const handleReset = () => {
    searchForm.resetFields()
    setSearchName('')
    setFilterStatus('all')
    setFilterType('all')
    setFilterUpdatedBy('')
    setFilterUpdatedAt('')
  }

  /* 刪除流程 */
  const handleDelete = (record: WorkflowDefinition) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定刪除「${record.name}」流程？此操作不可撤銷。`,
      okText: '確認刪除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        deleteWorkflow(record.id)
        message.success(`「${record.name}」已刪除`)
      },
    })
  }

  /* 切換啟用/停用 */
  const handleToggle = (id: string) => {
    const wf = workflows.find(w => w.id === id)
    if (!wf) return
    const action = wf.enabled ? '停用' : '啟用'
    Modal.confirm({
      title: `確認${action}`,
      content: wf.enabled
        ? `確定${action}「${wf.name}」流程？${action}後對應操作將直接執行，無需審批。`
        : `確定${action}「${wf.name}」流程？${action}後對應操作將進入審批環節。`,
      okText: '確認',
      cancelText: '取消',
      okButtonProps: { danger: wf.enabled },
      onOk: async () => {
        await toggleEnabled(id)
        message.success(`「${wf.name}」已${action}`)
      },
    })
  }

  /* 業務類型標籤映射 */
  const typeLabelMap: Record<string, { label: string; color: string }> = {
    recharge: { label: '充值', color: '#1890FF' },
    transfer: { label: '轉賬', color: '#13C2C2' },
    deduct: { label: '扣款', color: '#FF4D4F' },
    merge: { label: '合併', color: '#FA8C16' },
    gift: { label: '贈送', color: '#722ED1' },
  }

  const columns: ColumnsType<WorkflowDefinition> = [
    {
      title: '流程名稱',
      dataIndex: 'name',
      key: 'name',
      width: 160,
      render: (name: string) => (
        <span style={{ fontWeight: 600, color: '#262626' }}>{name}</span>
      ),
    },
    {
      title: '流程類型',
      dataIndex: 'approvalType',
      key: 'approvalType',
      width: 110,
      align: 'center',
      render: (type: string) => {
        const meta = typeLabelMap[type]
        return meta
          ? <Tag color={meta.color}>{meta.label}</Tag>
          : <Tag>{type}</Tag>
      },
    },
    {
      title: '審批節點',
      dataIndex: 'nodes',
      key: 'nodeCount',
      width: 100,
      align: 'center',
      render: (nodes: WorkflowDefinition['nodes']) => (
        <span style={{ fontWeight: 600, color: '#262626' }}>{nodes.length} 個</span>
      ),
    },
    {
      title: '駁回策略',
      dataIndex: 'rejectBehavior',
      key: 'rejectBehavior',
      width: 140,
      render: (behavior: string) => (
        <span style={{ fontSize: 13, color: '#595959' }}>
          {behavior === 'restart' ? '駁回發起人' : '駁回上一節點'}
        </span>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      align: 'center',
      render: (enabled: boolean) => (
        enabled
          ? <Tag color="success">啟用</Tag>
          : <Tag color="default">停用</Tag>
      ),
    },
    {
      title: '最後更新人',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 110,
      render: (v: string) => v || '-',
    },
    {
      title: '最後更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (date: string) => (date ? <span style={{ whiteSpace: 'nowrap' }}>{dayjs(date).format('YYYY-MM-DD HH:mm:ss')}</span> : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_: unknown, record: WorkflowDefinition) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Button type="link" size="small"
            onClick={() => navigate(`/workflow-config/detail/${record.id}`)}>
            詳情
          </Button>
          <Button type="link" size="small"
            onClick={() => navigate(`/workflow-config/${record.id}`)}>
            編輯
          </Button>
          <Button type="link" size="small"
            onClick={() => handleToggle(record.id)}>
            {record.enabled ? '停用' : '啟用'}
          </Button>
          <Button type="link" size="small" danger
            onClick={() => handleDelete(record)}>
            刪除
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* ── 搜索區 ── */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label="流程名稱">
            <Input
              placeholder="搜索流程名稱"
              allowClear
              onPressEnter={handleSearch}
            />
          </Form.Item>
          <Form.Item label="流程類型">
            <Select
              placeholder="全部"
              allowClear
              options={APPROVAL_TYPE_OPTIONS}
            />
          </Form.Item>
          <Form.Item label="狀態">
            <Select
              placeholder="全部"
              allowClear
              options={[
                { label: '已啟用', value: 'enabled' },
                { label: '已停用', value: 'disabled' },
              ]}
            />
          </Form.Item>
          <Form.Item label="最後更新人">
            <Input
              placeholder="搜索更新人"
              allowClear
              onPressEnter={handleSearch}
            />
          </Form.Item>
          <Form.Item label="最後更新時間">
            <DatePicker
              placeholder="選擇日期"
              allowClear
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ── 列表表格 ── */}
      <Table
        columns={columns}
        dataSource={filteredWorkflows}
        rowKey="id"
        pagination={false}
        size="middle"
        scroll={{ x: 1030 }}
        locale={{ emptyText: '暫無審批流程配置' }}
      />
    </div>
  )
}
