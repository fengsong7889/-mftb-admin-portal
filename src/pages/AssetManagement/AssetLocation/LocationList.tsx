/**
 * 仓库维护列表（樹形 Table：倉庫 / 樓層 / 辦公室）
 *
 * - 搜索條件：倉庫名稱、編碼、位置類型
 * - 位置樹供批量入庫、台賬「存放位置」欄位選用
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Form, Input, Select, Table, Tag, Modal, message, Space } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchLocationList, deleteLocation, type AssetLocation } from '../../../api/eam'
import { buildTree, collectIds, type WithChildren } from '../eamUtils'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

type LocationRow = WithChildren<AssetLocation>

const TYPE_META: Record<AssetLocation['type'], { key: string; color: string }> = {
  warehouse: { key: 'asset.locWarehouse', color: 'blue' },
  floor:     { key: 'asset.locFloor',     color: 'cyan' },
  room:      { key: 'asset.locRoom',      color: 'green' },
}

const TYPE_OPTIONS = [
  { value: 'warehouse', label: '倉庫' },
  { value: 'floor', label: '樓層' },
  { value: 'room', label: '辦公室' },
]

interface Props {
  onAdd: (parentId?: number) => void
  onEdit: (id: number) => void
  onView: (id: number) => void
}

interface SearchFormValues {
  name?: string
  code?: string
  type?: string
  updatedBy?: string
}

export default function LocationList({ onAdd, onEdit, onView }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<SearchFormValues>()
  const [loading, setLoading] = useState(false)
  const [treeData, setTreeData] = useState<LocationRow[]>([])
  const [expandedKeys, setExpandedKeys] = useState<number[]>([])
  const [searchParams, setSearchParams] = useState<{
    name?: string
    code?: string
    type?: string
    updatedBy?: string
  }>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchLocationList(searchParams)
      const tree = buildTree(list)
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
    setSearchParams({
      name: v.name || undefined,
      code: v.code || undefined,
      type: v.type || undefined,
      updatedBy: v.updatedBy || undefined,
    })
  }
  const handleReset = () => { form.resetFields(); setSearchParams({}) }

  const handleDelete = (record: LocationRow) => {
    Modal.confirm({
      title: t('asset.confirmDeleteTitle'),
      content: `${record.name}（${record.code}）`,
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteLocation(record.id)
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
    { key: 'code', title: '編碼' },
    { key: 'name', title: '倉庫名稱' },
    { key: 'type', title: '位置類型' },
    { key: 'address', title: '倉庫地址' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'remark', title: '備註' },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-location', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: TableColumnsType<LocationRow> = [
    {
      title: '編碼', dataIndex: 'code', key: 'code', width: 150,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: '倉庫名稱', dataIndex: 'name', key: 'name', width: 240,
      render: (v: string, record) => (
        <span style={{ fontWeight: record.parentId === 0 ? 600 : 400 }}>{v}</span>
      ),
    },
    {
      title: '位置類型', dataIndex: 'type', key: 'type', width: 110,
      render: (v: AssetLocation['type']) => {
        const m = TYPE_META[v]
        return <Tag color={m.color}>{t(m.key)}</Tag>
      },
    },
    {
      title: '倉庫地址', dataIndex: 'address', key: 'address', width: 220, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 110,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 170,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '備註', dataIndex: 'remark', key: 'remark', ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('common.colAction'), key: 'action', width: 240, fixed: 'right',
      render: (_: unknown, record: LocationRow) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onView(record.id)}>
            {t('common.detail')}
          </Button>
          {record.type !== 'room' && (
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
          <Form.Item label="倉庫名稱" name="name">
            <Input placeholder="請輸入倉庫名稱" allowClear />
          </Form.Item>
          <Form.Item label="編碼" name="code">
            <Input placeholder="請輸入編碼" allowClear />
          </Form.Item>
          <Form.Item label="位置類型" name="type">
            <Select placeholder="全部" allowClear options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item label="最後更新人" name="updatedBy">
            <Input placeholder="請輸入更新人" allowClear />
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
            新增倉庫
          </Button>
          {configComponent}
        </div>
      </div>

      {/* ====== 樹形表格 ====== */}
      <Table<LocationRow>
        columns={applyConfig(columns)}
        dataSource={treeData}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1500 }}
        pagination={false}
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpandedRowsChange: (keys) => setExpandedKeys(keys as number[]),
        }}
      />
    </>
  )
}
