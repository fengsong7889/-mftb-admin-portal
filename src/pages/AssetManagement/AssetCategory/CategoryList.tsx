/**
 * 資產分類列表（樹形 Table）
 *
 * - 支持名稱、編碼、最後更新人、最後更新時間搜索
 * - 樹形展示分類層級，每級可維護「參數模板」（供品牌型號庫與資產台賬動態渲染參數）
 * - 新增/編輯跳轉獨立表單頁（同路由內視圖切換，不使用彈窗）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Form, Input, Table, Tag, Modal, message, Space, Tooltip, DatePicker } from 'antd'
import type { TableColumnsType } from 'antd'
import type { Dayjs } from 'dayjs'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchCategoryList, deleteCategory, type AssetCategory } from '../../../api/eam'
import { buildTree, collectIds, annotateDepth, type WithChildren } from '../eamUtils'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

type CategoryRow = WithChildren<AssetCategory> & { depth: number }

interface Props {
  onAdd: (parentId?: number) => void
  onEdit: (id: number) => void
  onView: (id: number) => void
}

interface SearchFormValues {
  name?: string
  code?: string
  updatedBy?: string
  updatedAtRange?: [Dayjs, Dayjs]
}

export default function CategoryList({ onAdd, onEdit, onView }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<SearchFormValues>()
  const [loading, setLoading] = useState(false)
  const [treeData, setTreeData] = useState<CategoryRow[]>([])
  const [expandedKeys, setExpandedKeys] = useState<number[]>([])
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [searchParams, setSearchParams] = useState<{
    name?: string
    code?: string
    updatedBy?: string
    updatedAtStart?: string
    updatedAtEnd?: string
  }>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchCategoryList(searchParams)
      const tree = annotateDepth(buildTree(list))
      setTreeData(tree)
      setExpandedKeys(collectIds(tree))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [searchParams, t])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    const range = v.updatedAtRange
    setSearchParams({
      name: v.name || undefined,
      code: v.code || undefined,
      updatedBy: v.updatedBy || undefined,
      updatedAtStart: range ? range[0].format('YYYY-MM-DD HH:mm:ss') : undefined,
      updatedAtEnd: range ? range[1].format('YYYY-MM-DD HH:mm:ss') : undefined,
    })
  }
  const handleReset = () => {
    form.resetFields()
    setSearchParams({})
  }

  const handleDelete = (record: CategoryRow) => {
    Modal.confirm({
      title: t('asset.confirmDeleteTitle'),
      content: `${record.name}（${record.code}）`,
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteCategory(record.id)
          message.success(t('asset.deleteSuccess'))
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('asset.deleteFailed'))
        }
      },
    })
  }

  /* ── 列字段配置 ── */
  const columnMeta = useMemo(() => [
    { key: 'name', title: t('asset.colName') },
    { key: 'code', title: t('asset.colCode') },
    { key: 'paramTemplate', title: t('asset.colParamTemplate') },
    { key: 'updatedBy', title: t('asset.colUpdatedBy') },
    { key: 'updatedAt', title: t('asset.colUpdatedAt') },
    { key: 'remark', title: t('asset.colRemark') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-category', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: TableColumnsType<CategoryRow> = [
    {
      title: t('asset.colName'),
      dataIndex: 'name', key: 'name', width: 220,
      render: (v: string, record) => (
        <Space size={6}>
          <Tag color={record.depth === 1 ? 'blue' : record.depth === 2 ? 'green' : 'orange'} style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>
            L{record.depth}
          </Tag>
          <span style={{ fontWeight: record.parentId === 0 ? 600 : 400 }}>{v}</span>
        </Space>
      ),
    },
    {
      title: t('asset.colCode'),
      dataIndex: 'code', key: 'code', width: 150,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: t('asset.colParamTemplate'),
      dataIndex: 'paramTemplate', key: 'paramTemplate', width: 280,
      render: (list: AssetCategory['paramTemplate']) => (
        list?.length ? (
          <Tooltip title={list.map((p) => `${p.label}${p.unit ? `(${p.unit})` : ''}`).join('、')}>
            <Space size={4} wrap>
              {list.slice(0, 4).map((p) => <Tag key={p.key}>{p.label}</Tag>)}
              {list.length > 4 && <Tag>+{list.length - 4}</Tag>}
            </Space>
          </Tooltip>
        ) : <span style={{ color: '#8C8C8C' }}>-</span>
      ),
    },
    {
      title: t('asset.colUpdatedBy'),
      dataIndex: 'updatedBy', key: 'updatedBy', width: 100,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('asset.colUpdatedAt'),
      dataIndex: 'updatedAt', key: 'updatedAt', width: 160,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('asset.colRemark'), dataIndex: 'remark', key: 'remark', ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('common.colAction'), key: 'action', width: 240, fixed: 'right',
      render: (_: unknown, record: CategoryRow) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onView(record.id)}>
            {t('common.detail')}
          </Button>
          {record.depth < 3 && (
            <Button type="link" size="small" onClick={() => onAdd(record.id)}>
              {t('common.add')}
            </Button>
          )}
          <Button type="link" size="small" onClick={() => onEdit(record.id)}>
            {t('common.edit')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.colName')} name="name">
            <Input placeholder={t('asset.searchNamePh')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.colCode')} name="code">
            <Input placeholder={t('asset.searchCodePh')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.searchUpdatedBy')} name="updatedBy">
            <Input placeholder={t('asset.searchUpdatedByPh')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.searchUpdatedAt')} name="updatedAtRange">
            <DatePicker.RangePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ====== 操作區 ====== */}
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => onAdd()}>
            {t('asset.btnAddCategory')}
          </Button>
          {configComponent}
        </div>
      </div>

      {/* ====== 樹形表格 ====== */}
      <Table<CategoryRow>
        columns={applyConfig(columns)}
        dataSource={treeData}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1200 }}
        pagination={false}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
          columnWidth: 40,
        }}
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpandedRowsChange: (keys) => setExpandedKeys(keys as number[]),
        }}
      />
    </>
  )
}
