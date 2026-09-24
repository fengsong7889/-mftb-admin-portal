import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { useAuth } from '../../../contexts/AuthContext'
import {
  fetchHrDict, updateHrDictStatus, deleteHrDict,
  HR_DICT_TYPE, type HrDictItem,
} from '../../../api/hrDict'

/** 类型值保持后端编码不变，展示标签随语言切换。 */
const DICT_TYPES = Object.values(HR_DICT_TYPE)

export default function HrDictManagement() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [modal, contextHolder] = Modal.useModal()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('hr-dict:edit')

  const activeType = DICT_TYPES.find(type => type === searchParams.get('type')) ?? HR_DICT_TYPE.EMPLOYER_COMPANY
  const dictTabs = DICT_TYPES.map(key => ({ key, label: t(`hrDict.types.${key}`) }))
  const statusOptions = [{ value: 1, label: t('hrDict.enabled') }, { value: 0, label: t('hrDict.disabled') }]
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [all, setAll] = useState<HrDictItem[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState<string>()
  const [statusFilter, setStatusFilter] = useState<number>()
  const [searchForm] = Form.useForm<{ keyword?: string; status?: number }>()

  /** 加载当前类型全量字典（含停用），关键字/状态在前端过滤（数据量小） */
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchHrDict(activeType)
      setAll(list)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [activeType])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  /** 国家 code → 名称，用于工作地点“上级”列展示 */
  const countryNameByCode = useMemo(() => {
    const map: Record<string, string> = {}
    all.filter(d => !d.parentCode).forEach(d => { map[d.code] = d.name })
    return map
  }, [all])

  const tableData = useMemo(() => {
    let list = all
    if (keyword) {
      const kw = keyword.toLowerCase()
      list = list.filter(d =>
        d.code.toLowerCase().includes(kw)
        || d.name.toLowerCase().includes(kw)
        || (d.nameEn ?? '').toLowerCase().includes(kw))
    }
    if (statusFilter != null) list = list.filter(d => d.status === statusFilter)
    return list
  }, [all, keyword, statusFilter])

  const handleSearch = () => {
    const v = searchForm.getFieldsValue()
    setKeyword(v.keyword?.trim() || undefined)
    setStatusFilter(v.status)
    setPage(1)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setKeyword(undefined)
    setStatusFilter(undefined)
    setPage(1)
  }

  const handleCreate = () => {
    navigate(`/hr-dict-edit?type=${activeType}`)
  }

  const handleEdit = (record: HrDictItem) => {
    navigate(`/hr-dict-edit?type=${activeType}&id=${record.id}`)
  }

  const handleToggleStatus = (record: HrDictItem, checked: boolean) => {
    // §B.8 强制：列表状态 Switch 切换必须先二次确认，确认后才调接口
    modal.confirm({
      title: t(checked ? 'hrDict.enableConfirm' : 'hrDict.disableConfirm', { name: record.name }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await updateHrDictStatus(record.id, checked ? 1 : 0)
        message.success(t(checked ? 'common.enableSuccess' : 'common.disableSuccess'))
        fetchList()
      },
    })
  }

  const handleDelete = async (record: HrDictItem) => {
    try {
      await deleteHrDict(record.id)
      message.success(t('common.deleteSuccess'))
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  const columns: TableColumnsType<HrDictItem> = [
    { title: t('hrDict.code'), dataIndex: 'code', key: 'code', width: 180 },
    { title: t('common.colName'), dataIndex: 'name', key: 'name', width: 200 },
    { title: t('hrDict.nameEn'), dataIndex: 'nameEn', key: 'nameEn', width: 220, render: (v: string) => v || '-' },
    ...(activeType === HR_DICT_TYPE.WORK_LOCATION
      ? [{
          title: t('hrDict.country'), dataIndex: 'parentCode', key: 'parentCode', width: 140,
          render: (v: string) => (v ? (countryNameByCode[v] || v) : t('hrDict.topLevel')),
        } as TableColumnsType<HrDictItem>[number]]
      : []),
    { title: t('hrDict.sort'), dataIndex: 'sortOrder', key: 'sortOrder', width: 80 },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (v: number, record) => (
        canEdit
          ? <Switch checked={v === 1} checkedChildren={t('hrDict.enabled')} unCheckedChildren={t('hrDict.disabled')}
              onChange={(checked) => handleToggleStatus(record, checked)} />
          : <Tag color={v === 1 ? 'success' : 'default'}>{t(v === 1 ? 'hrDict.enabled' : 'hrDict.disabled')}</Tag>
      ),
    },
    { title: t('common.colUpdater'), dataIndex: 'updatedBy', key: 'updatedBy', width: 130, render: (v: string) => v || '-' },
    {
      title: t('common.colAction'), key: 'action', width: 120,
      render: (_, record) => (
        canEdit ? (
          <Space size={0} split={<span className="action-split">|</span>}>
            <Button type="link" size="small" onClick={() => handleEdit(record)}>{t('common.edit')}</Button>
            <Popconfirm title={t('hrDict.deleteConfirm', { name: record.name })} onConfirm={() => handleDelete(record)} okText={t('common.confirm')} cancelText={t('common.cancel')}>
              <Button type="link" size="small" danger>{t('common.delete')}</Button>
            </Popconfirm>
          </Space>
        ) : <span style={{ color: '#8C8C8C' }}>{t('hrDict.readOnly')}</span>
      ),
    },
  ]

  const { configComponent, applyConfig } = useColumnConfig('hr-dict', columns.map(col => ({ key: String(col.key), title: String(col.title) })), [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  return (
    <div className="content-area">
      {contextHolder}
      {/* 搜索区 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label={t('hrDict.keyword')} name="keyword">
            <Input placeholder={t('hrDict.keywordPlaceholder')} allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label={t('common.colStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear options={statusOptions} />
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
        <div className="action-section-left" />
        <div className="action-section-right">
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              {t('hrDict.addTitle', { type: t(`hrDict.types.${activeType}`) })}
            </Button>
          )}
          {configComponent}
        </div>
      </div>

      <Tabs
        activeKey={activeType}
        onChange={(key) => { setSearchParams({ type: key }, { replace: true }); handleReset() }}
        items={dictTabs}
        style={{ marginBottom: 12 }}
      />

      <Table
        className="nowrap-table"
        columns={applyConfig(columns)}
        dataSource={tableData}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize, showSizeChanger: true, showQuickJumper: true,
                  showTotal: (total) => t('common.total', { count: total }),
                  onChange: (next, size) => { setPage(size !== pageSize ? 1 : next); setPageSize(size) },
                }}
      />
    </div>
  )
}
