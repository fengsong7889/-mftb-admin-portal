import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  POSITION_SEQUENCE,
  POSITION_SEQUENCE_OPTIONS,
  createPosition,
  deletePosition,
  fetchPositions,
  updatePosition,
} from '../../../api/position'
import type { PositionItem, PositionPayload } from '../../../api/position'

/** 职级序列标签颜色 */
const SEQUENCE_TAG_COLOR: Record<string, string> = {
  M: 'blue',
  T: 'purple',
  P: 'green',
}

/** 每个序列的职级等级数（如 M1~M9） */
const JOB_LEVEL_MAX = 9

/** 职等选项 R1~R5（R1最低，R5最高） */
const RANK_OPTIONS = Array.from({ length: 5 }, (_, i) => ({
  value: `R${i + 1}`,
  label: `R${i + 1}`,
}))

/** 新增/编辑表单值 */
interface PositionFormValues {
  name: string
  nameEn?: string
  sequence: string
  jobLevel: string
  rank?: string
}

export default function PositionManagement() {
  const [dataSource, setDataSource] = useState<PositionItem[]>([])
  const [loading, setLoading] = useState(false)
  // 查询条件（点击查询后生效）
  const [keyword, setKeyword] = useState<string>()
  const [filterSequence, setFilterSequence] = useState<string>()
  const [searchForm] = Form.useForm()

  // 新增/编辑弹窗
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editing, setEditing] = useState<PositionItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<PositionFormValues>()
  const sequence = Form.useWatch('sequence', form)

  /** 加载职位列表 */
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchPositions()
      setDataSource(list)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  /** 表格数据：按搜索条件过滤 */
  const tableData = useMemo(() => {
    let list = dataSource
    if (keyword) {
      const kw = keyword.toLowerCase()
      list = list.filter(item => item.name.toLowerCase().includes(kw))
    }
    if (filterSequence) {
      list = list.filter(item => item.sequence === filterSequence)
    }
    return list
  }, [dataSource, keyword, filterSequence])

  /** 查询 */
  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    setKeyword(values.keyword?.trim() || undefined)
    setFilterSequence(values.sequence)
  }

  /** 重置 */
  const handleReset = () => {
    searchForm.resetFields()
    setKeyword(undefined)
    setFilterSequence(undefined)
  }

  /** 根据所选序列生成职级选项（如 M1~M9） */
  const jobLevelOptions = useMemo(() => {
    if (!sequence) return []
    return Array.from({ length: JOB_LEVEL_MAX }, (_, i) => {
      const level = `${sequence}${i + 1}`
      return { value: level, label: level }
    })
  }, [sequence])

  /** 新增职位 */
  const handleCreate = () => {
    setEditing(null)
    form.resetFields()
    setEditModalVisible(true)
  }

  /** 编辑职位 */
  const handleEdit = (record: PositionItem) => {
    setEditing(record)
    form.setFieldsValue({
      name: record.name,
      nameEn: record.nameEn,
      sequence: record.sequence,
      jobLevel: record.jobLevel,
      rank: record.rank,
    })
    setEditModalVisible(true)
  }

  /** 切换职级序列时重置职级和职等（新序列下原职级失效） */
  const handleSequenceChange = () => {
    form.setFieldValue('jobLevel', undefined)
    form.setFieldValue('rank', undefined)
  }

  /** 提交新增/编辑 */
  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload: PositionPayload = {
      name: values.name.trim(),
      nameEn: values.nameEn?.trim(),
      sequence: values.sequence,
      jobLevel: values.jobLevel,
      rank: values.rank,
    }
    setSubmitting(true)
    try {
      if (editing) {
        await updatePosition(editing.id, payload)
        message.success('職位信息已更新')
      } else {
        await createPosition(payload)
        message.success('職位創建成功')
      }
      setEditModalVisible(false)
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setSubmitting(false)
    }
  }

  /** 删除职位 */
  const handleDelete = async (record: PositionItem) => {
    try {
      await deletePosition(record.id)
      message.success('職位已刪除')
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  const columns: TableColumnsType<PositionItem> = [
    { title: '職位ID', dataIndex: 'id', key: 'id', width: 90 },
    { title: '職位名稱', dataIndex: 'name', key: 'name', width: 160 },
    { title: '職位名稱英文', dataIndex: 'nameEn', key: 'nameEn', width: 160, render: (v: string) => v || '-' },
    {
      title: '職級序列',
      dataIndex: 'sequence',
      key: 'sequence',
      width: 120,
      render: (value: string) => (
        <Tag color={SEQUENCE_TAG_COLOR[value] || 'default'}>{POSITION_SEQUENCE[value] || value}</Tag>
      ),
    },
    { title: '職級', dataIndex: 'jobLevel', key: 'jobLevel', width: 100 },
    { title: '職等', dataIndex: 'rank', key: 'rank', width: 80, render: (v: string) => v || '-' },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 120, render: (v: string) => v || '-' },
    {
      title: '最後更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-TW', { hour12: false }) : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>
            編輯
          </Button>
          <Popconfirm
            title="確認刪除"
            description={`確定要刪除職位「${record.name}」嗎？`}
            onConfirm={() => handleDelete(record)}
            okText="確認"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>
              刪除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  /** 列字段配置 */
  const columnMeta = columns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { configComponent, applyConfig } = useColumnConfig('position-management', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  return (
    <div className="content-area">
      {/* 搜索区 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label="職位名稱" name="keyword">
            <Input placeholder="請輸入職位名稱" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="職級序列" name="sequence">
            <Select
              placeholder="全部"
              allowClear
              options={POSITION_SEQUENCE_OPTIONS}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                查詢
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区：仅新增，放右侧 */}
      <div className="action-section">
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新增
          </Button>
          {configComponent}
        </div>
      </div>

      <Table
        columns={applyConfig(columns)}
        dataSource={tableData}
        rowKey="id"
        loading={loading}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 條數據`,
        }}
      />

      {/* 新增/编辑职位弹窗 */}
      <Modal
        title={editing ? '編輯職位' : '新增職位'}
        open={editModalVisible}
        onOk={handleSubmit}
        onCancel={() => setEditModalVisible(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        width={480}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="職位名稱" rules={[{ required: true, message: '請輸入職位名稱' }]}>
            <Input placeholder="例如：後端開發工程師" allowClear maxLength={50} />
          </Form.Item>
          <Form.Item name="nameEn" label="職位名稱英文">
            <Input placeholder="例如：Backend Engineer" allowClear maxLength={100} />
          </Form.Item>
          <Form.Item name="sequence" label="職級序列" rules={[{ required: true, message: '請選擇職級序列' }]}>
            <Select
              placeholder="請選擇職級序列"
              options={POSITION_SEQUENCE_OPTIONS}
              onChange={handleSequenceChange}
            />
          </Form.Item>
          <Form.Item
            name="jobLevel"
            label="職級"
            rules={[{ required: true, message: '請選擇職級' }]}
            extra="先選擇職級序列，再選擇對應職級"
          >
            <Select placeholder="請選擇職級" options={jobLevelOptions} disabled={!sequence} />
          </Form.Item>
          <Form.Item
            name="rank"
            label="職等"
            rules={[{ required: true, message: '請選擇職等' }]}
            extra="R1 最低，R5 最高"
          >
            <Select placeholder="請選擇職等" options={RANK_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
