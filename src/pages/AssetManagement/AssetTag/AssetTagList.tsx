/**
 * 資產標籤列表頁（資產標籤 - 基礎配置）
 *
 * 參考業務原型圖 2：默認卡片視圖（每張卡片直接渲染標籤最終呈現效果 + 修改/刪除），
 * 可切換列表視圖（表格全列 + useColumnConfig 列配置）；兩種視圖共享受控分頁。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button, Empty, Form, Input, Modal, Pagination, Popconfirm,
  Radio, Select, Space, Switch, Table, Tag, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AppstoreOutlined, DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined,
  ReloadOutlined, SearchOutlined, UnorderedListOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { fetchAssetTagList, deleteAssetTag, toggleAssetTagStatus } from '../../../api/eam'
import type { AssetTagTemplate } from '../../../api/eam'
import AssetTagPreview from './AssetTagPreview'
import './index.css'

interface AssetTagListProps {
  onAdd: () => void
  onEdit: (id: number) => void
  onDetail: (id: number) => void
}

type ViewMode = 'card' | 'table'

export default function AssetTagList({ onAdd, onEdit, onDetail }: AssetTagListProps) {
  const { t } = useTranslation()
  const [tags, setTags] = useState<AssetTagTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [searchForm] = Form.useForm()
  const [viewMode, setViewMode] = useState<ViewMode>('card')

  // 搜索条件
  const [searchName, setSearchName] = useState<string>()
  const [searchStatus, setSearchStatus] = useState<string>()

  // 分页受控
  const [current, setCurrent] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  /** 加载数据 */
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAssetTagList()
      setTags(data)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /** 过滤数据 */
  const filteredData = useMemo(() => {
    let list = tags
    if (searchName) {
      list = list.filter(t => t.name.toLowerCase().includes(searchName.toLowerCase()))
    }
    if (searchStatus) {
      list = list.filter(t => t.status === searchStatus)
    }
    return list
  }, [tags, searchName, searchStatus])

  /** 当前页数据（卡片视图手动切片） */
  const pageData = useMemo(() => {
    const start = (current - 1) * pageSize
    return filteredData.slice(start, start + pageSize)
  }, [filteredData, current, pageSize])

  /** 查询 */
  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    setSearchName(values.name?.trim() || undefined)
    setSearchStatus(values.status || undefined)
    setCurrent(1)
  }

  /** 重置 */
  const handleReset = () => {
    searchForm.resetFields()
    setSearchName(undefined)
    setSearchStatus(undefined)
    setCurrent(1)
  }

  /** 禁用/启用（二次确认） */
  const handleToggleStatus = useCallback(async (record: AssetTagTemplate) => {
    const isEnable = record.status === 'disabled'
    Modal.confirm({
      title: isEnable ? t('assetTag.confirmEnableTitle') : t('assetTag.confirmDisableTitle'),
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      centered: true,
      className: 'custom-confirm-modal',
      width: 520,
      content: isEnable
        ? t('assetTag.enableContent', { name: record.name })
        : t('assetTag.disableContent', { name: record.name }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await toggleAssetTagStatus(record.id)
          message.success(isEnable ? t('assetTag.enabledMsg') : t('assetTag.disabledMsg'))
          fetchData()
        } catch {
          // 错误提示由请求层统一处理
        }
      },
    })
  }, [fetchData, t])

  /** 删除 */
  const handleDelete = useCallback(async (record: AssetTagTemplate) => {
    try {
      await deleteAssetTag(record.id)
      message.success(t('assetTag.deleteSuccess'))
      fetchData()
    } catch {
      // 错误提示由请求层统一处理
    }
  }, [fetchData, t])

  /** 表格列定义（列表视图） */
  const columns: TableColumnsType<AssetTagTemplate> = useMemo(() => [
    {
      title: t('assetTag.colPreview'),
      key: 'preview',
      width: 230,
      render: (_, record) => (
        <AssetTagPreview
          variant="mini"
          data={{ name: record.name, bgColor: record.bgColor, textColor: record.textColor, displayFields: record.displayFields }}
        />
      ),
    },
    { title: t('assetTag.colName'), dataIndex: 'name', key: 'name', width: 140 },
    {
      title: t('assetTag.colDescription'),
      dataIndex: 'description',
      key: 'description',
      width: 200,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: t('assetTag.colFieldCount'),
      dataIndex: 'displayFields',
      key: 'fieldCount',
      width: 100,
      align: 'center',
      render: (fields: string[]) => <span style={{ fontWeight: 600 }}>{fields.length}</span>,
    },
    {
      title: t('assetTag.colBoundAssets'),
      dataIndex: 'boundCount',
      key: 'boundCount',
      width: 110,
      align: 'center',
      render: (v: number) => <span style={{ fontWeight: 600 }}>{v ?? 0}</span>,
    },
    {
      title: t('assetTag.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, record: AssetTagTemplate) => (
        <Switch
          checked={status === 'enabled'}
          checkedChildren={t('assetTag.switchEnable')}
          unCheckedChildren={t('assetTag.switchDisable')}
          onChange={() => handleToggleStatus(record)}
        />
      ),
    },
    {
      title: t('assetTag.colUpdatedBy'),
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: t('assetTag.colUpdatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (v: string) => v || '-',
    },
    {
      title: t('assetTag.colAction'),
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onDetail(record.id)}>{t('common.detail')}</Button>
          <Button type="link" size="small" onClick={() => onEdit(record.id)}>{t('common.edit')}</Button>
          <Popconfirm
            title={t('assetTag.deleteConfirmTitle')}
            description={(record.boundCount ?? 0) > 0
              ? t('assetTag.deleteConfirmContentBound', { name: record.name, count: record.boundCount })
              : t('assetTag.deleteConfirmContent', { name: record.name })}
            onConfirm={() => handleDelete(record)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button type="link" size="small" danger>{t('common.delete')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ], [onEdit, onDetail, handleToggleStatus, handleDelete, t])

  /** 列字段配置 */
  const columnMeta = columns.map(col => ({ key: col.key as string, title: (col.title ?? '') as string }))
  const { config, configComponent, applyConfig } = useColumnConfig('asset-tag', columnMeta)

  /** 根據可見列動態計算 scroll 寬度 */
  const scrollX = useMemo(() => {
    const visibleKeys = new Set(config.filter(c => c.visible).map(c => c.key))
    return columns.reduce((sum, col) => sum + (visibleKeys.has(col.key as string) ? (col.width as number) : 0), 0)
  }, [config, columns])

  /** 受控分页配置（卡片 / 列表视图共享） */
  const paginationProps = {
    current,
    pageSize,
    total: filteredData.length,
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (total: number) => t('common.total', { count: total }),
    onChange: (page: number, size: number) => {
      setCurrent(page)
      setPageSize(size)
    },
  }

  return (
    <>
      {/* 搜索区 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label={t('assetTag.searchName')} name="name">
            <Input placeholder={t('assetTag.searchNamePh')} allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label={t('assetTag.searchStatus')} name="status">
            <Select placeholder="全部" allowClear options={[
              { value: 'enabled', label: t('assetTag.statusEnabled') },
              { value: 'disabled', label: t('assetTag.statusDisabled') },
            ]} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          <Radio.Group
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: <Space size={4}><AppstoreOutlined />{t('assetTag.cardView')}</Space>, value: 'card' },
              { label: <Space size={4}><UnorderedListOutlined />{t('assetTag.listView')}</Space>, value: 'table' },
            ]}
          />
        </div>
        <div className="action-section-right">
          {viewMode === 'table' && configComponent}
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>{t('assetTag.addTemplate')}</Button>
        </div>
      </div>

      {viewMode === 'card' ? (
        <>
          {/* 卡片视图（参考图 2：卡片直接渲染标签最终效果） */}
          {pageData.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 8, padding: '48px 0' }}>
              <Empty description={loading ? t('common.loading') : t('assetTag.empty')} />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 16 }}>
              {pageData.map(record => (
                <div key={record.id} className="asset-tag-card">
                  <div className="asset-tag-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#262626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {record.name}
                      </span>
                      <Tag color={record.status === 'enabled' ? 'success' : 'default'} style={{ margin: 0 }}>
                        {record.status === 'enabled' ? t('assetTag.statusEnabled') : t('assetTag.statusDisabled')}
                      </Tag>
                    </div>
                    <Space size={8}>
                      <Switch
                        size="small"
                        checked={record.status === 'enabled'}
                        onChange={() => handleToggleStatus(record)}
                      />
                      <Button size="small" icon={<EyeOutlined />} onClick={() => onDetail(record.id)}>{t('common.detail')}</Button>
                      <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(record.id)}>{t('common.edit')}</Button>
                      <Popconfirm
                        title={t('assetTag.deleteConfirmTitle')}
                        description={(record.boundCount ?? 0) > 0
                          ? t('assetTag.deleteConfirmContentBound', { name: record.name, count: record.boundCount })
                          : t('assetTag.deleteConfirmContent', { name: record.name })}
                        onConfirm={() => handleDelete(record)}
                        okText={t('common.confirm')}
                        cancelText={t('common.cancel')}
                      >
                        <Button size="small" danger icon={<DeleteOutlined />}>{t('common.delete')}</Button>
                      </Popconfirm>
                    </Space>
                  </div>
                  <div className="asset-tag-card-body">
                    <div className="asset-tag-card-canvas">
                      <AssetTagPreview
                        data={{ name: record.name, bgColor: record.bgColor, textColor: record.textColor, displayFields: record.displayFields }}
                      />
                    </div>
                  </div>
                  <div className="asset-tag-card-footer">
                    <span>{t('assetTag.fieldCountLabel', { count: record.displayFields.length })}</span>
                    <span>{t('assetTag.boundCountLabel', { count: record.boundCount ?? 0 })}</span>
                    <span style={{ marginLeft: 'auto' }}>
                      {record.updatedBy ? `${record.updatedBy} · ` : ''}{t('assetTag.updatedByLabel', { time: record.updatedAt || '-' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Pagination {...paginationProps} />
          </div>
        </>
      ) : (
        /* 列表视图（表格 + 列配置） */
        <Table
          columns={applyConfig(columns)}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          scroll={{ x: scrollX }}
          pagination={paginationProps}
        />
      )}
    </>
  )
}
