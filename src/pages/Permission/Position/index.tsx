import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ExportOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { useAuth } from '../../../contexts/AuthContext'
import {
  POSITION_RANK_OPTIONS,
  POSITION_SEQUENCE_TAG_COLOR,
  createPosition,
  deletePosition,
  fetchPositions,
  updatePosition,
} from '../../../api/position'
import type { PositionItem, PositionPayload } from '../../../api/position'
import { exportToCSV } from '../../../utils/exportCSV'

/** 每个序列的职级范围配置 */
const JOB_LEVEL_CONFIG: Record<string, { start: number; end: number }> = {
  M: { start: 4, end: 12 },  // M4 ~ M12
  T: { start: 1, end: 9 },   // T1 ~ T9
  P: { start: 1, end: 9 },   // P1 ~ P9
}

/** 新增/编辑表单值 */
interface PositionFormValues {
  name: string
  nameEn?: string
  sequence: string
  jobLevel: string
  rank?: string
}

export default function PositionManagement() {
  const { t, i18n } = useTranslation()

  /** 當前是否非繁中語言 */
  const isNonZh = !i18n.language?.startsWith('zh')

  /** 獲取職位顯示名稱：非繁中時取英文名，無則回退中文名 */
  const getPositionDisplayName = (pos: PositionItem) =>
    isNonZh ? (pos.nameEn || pos.name) : pos.name
  const [dataSource, setDataSource] = useState<PositionItem[]>([])

  /** 職級序列標籤（依賴 t，定義在組件內以便響應語言切換） */
  const SEQ_LABEL: Record<string, string> = {
    M: t('position.seqMgmt'),
    T: t('position.seqTech'),
    P: t('position.seqProf'),
  }
  const SEQUENCE_OPTIONS = Object.entries(SEQ_LABEL).map(([value, label]) => ({ value, label }))
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
  // 功能权限校验（菜单 key: position-management）
  const { hasPermission } = useAuth()
  // 全选
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

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
      list = list.filter(item => item.name.toLowerCase().includes(kw) || (item.nameEn ?? '').toLowerCase().includes(kw))
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

  /** 根据所选序列生成职级选项 */
  const jobLevelOptions = useMemo(() => {
    if (!sequence) return []
    const config = JOB_LEVEL_CONFIG[sequence] || { start: 1, end: 9 }
    const options = []
    for (let i = config.start; i <= config.end; i++) {
      const level = `${sequence}${i}`
      options.push({ value: level, label: level })
    }
    return options
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
        message.success(t('position.updateSuccess'))
      } else {
        await createPosition(payload)
        message.success(t('position.createSuccess'))
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
      message.success(t('common.deleteSuccess'))
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  /** 导出当前过滤后的列表数据 */
  const handleExport = () => {
    if (tableData.length === 0) {
      message.warning(t('position.noDataToExport'))
      return
    }
    const exportColumns = [
      { title: t('position.colId'), dataIndex: 'id' },
      { title: t('position.colNameZh'), dataIndex: 'name' },
      { title: t('position.colNameEn'), dataIndex: 'nameEn' },
      { title: t('position.colSequence'), dataIndex: 'sequence', render: (v: string) => SEQ_LABEL[v] || v || '' },
      { title: t('position.colJobLevel'), dataIndex: 'jobLevel' },
      { title: t('position.colRank'), dataIndex: 'rank' },
      { title: t('position.colUpdatedBy'), dataIndex: 'updatedBy' },
      { title: t('position.colUpdatedAt'), dataIndex: 'updatedAt' },
    ]
    exportToCSV(t('position.pageTitle'), exportColumns, tableData)
  }

  const columns: TableColumnsType<PositionItem> = [
    { title: t('position.colId'), dataIndex: 'id', key: 'id', width: 90 },
    { title: t('position.colNameZh'), dataIndex: 'name', key: 'name', width: 160 },
    { title: t('position.colNameEn'), dataIndex: 'nameEn', key: 'nameEn', width: 160, render: (v: string) => v || '-' },
    {
      title: t('position.colSequence'),
      dataIndex: 'sequence',
      key: 'sequence',
      width: 120,
      render: (value: string) => (
        <Tag color={POSITION_SEQUENCE_TAG_COLOR[value] || 'default'}>{SEQ_LABEL[value] || value}</Tag>
      ),
    },
    { title: t('position.colJobLevel'), dataIndex: 'jobLevel', key: 'jobLevel', width: 100 },
    { title: t('position.colRank'), dataIndex: 'rank', key: 'rank', width: 80, render: (v: string) => v || '-' },
    { title: t('position.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 120, render: (v: string) => v || '-' },
    {
      title: t('position.colUpdatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-TW', { hour12: false }) : '-'),
    },
    {
      title: t('common.colAction'),
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space size={4}>
          {hasPermission('position-management:edit') && (
            <Button type="link" size="small" onClick={() => handleEdit(record)}>
              {t('common.edit')}
            </Button>
          )}
          {hasPermission('position-management:delete') && (
            <Popconfirm
              title={t('common.confirmDelete')}
              description={t('position.confirmDeleteContent', { name: record.name })}
              onConfirm={() => handleDelete(record)}
              okText={t('common.confirm')}
              cancelText={t('common.cancel')}
            >
              <Button type="link" size="small" danger>
                {t('common.delete')}
              </Button>
            </Popconfirm>
          )}
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
          <Form.Item label={t('position.colNameZh')} name="keyword">
            <Input placeholder={t('position.namePlaceholder')} allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label={t('position.colSequence')} name="sequence">
            <Select
              placeholder={t('common.all')}
              allowClear
              options={SEQUENCE_OPTIONS}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                {t('common.search')}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                {t('common.reset')}
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>{t('common.export')}</Button>
        </div>
        <div className="action-section-right">
          {hasPermission('position-management:create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              {t('common.add')}
            </Button>
          )}
          {configComponent}
        </div>
      </div>

      <Table
        columns={applyConfig(columns)}
        dataSource={tableData}
        rowKey="id"
        loading={loading}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => t('common.total', { count: total }),
        }}
      />

      {/* 新增/编辑职位弹窗 */}
      <Modal
        title={editing ? t('position.editTitle') : t('position.addTitle')}
        open={editModalVisible}
        onOk={handleSubmit}
        onCancel={() => setEditModalVisible(false)}
        confirmLoading={submitting}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={480}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('position.colNameZh')} rules={[{ required: true, message: t('position.nameRequired') }]}>
            <Input placeholder={t('position.nameZhPlaceholder')} allowClear maxLength={50} />
          </Form.Item>
          <Form.Item name="nameEn" label={t('position.colNameEn')}>
            <Input placeholder={t('position.nameEnPlaceholder')} allowClear maxLength={100} />
          </Form.Item>
          <Form.Item name="sequence" label={t('position.colSequence')} rules={[{ required: true, message: t('position.seqRequired') }]}>
            <Select
              placeholder={t('position.seqSelectPlaceholder')}
              options={SEQUENCE_OPTIONS}
              onChange={handleSequenceChange}
            />
          </Form.Item>
          <Form.Item
            name="jobLevel"
            label={t('position.colJobLevel')}
            rules={[{ required: true, message: t('position.levelRequired') }]}
            extra={t('position.levelExtra')}
          >
            <Select placeholder={t('position.levelPlaceholder')} options={jobLevelOptions} disabled={!sequence} />
          </Form.Item>
          <Form.Item
            name="rank"
            label={t('position.colRank')}
            rules={[{ required: true, message: t('position.rankRequired') }]}
            extra={t('position.rankExtra')}
          >
            <Select placeholder={t('position.rankPlaceholder')} options={POSITION_RANK_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
