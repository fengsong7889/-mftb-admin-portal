import { useCallback, useEffect, useState } from 'react'
import { Button, DatePicker, Form, Input, Modal, Select, Space, Table, Tag, Tooltip, message } from 'antd'
import type { TableColumnsType } from 'antd'
import dayjs from 'dayjs'
import { PlusOutlined, ReloadOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { fetchVersionHistory, deleteVersion, syncVersionFromGit } from '../../api/versionHistory'
import type { VersionHistoryRecord } from '../../api/versionHistory'

const { RangePicker } = DatePicker

const RELEASE_TYPE_TAG: Record<string, { color: string }> = {
  major: { color: 'red' },
  minor: { color: 'blue' },
  patch: { color: 'green' },
}

const STATUS_TAG: Record<number, { color: string }> = {
  1: { color: 'success' },
  2: { color: 'default' },
}

export default function VersionHistory() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchForm] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [dataSource, setDataSource] = useState<VersionHistoryRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const values = searchForm.getFieldsValue()
      const dateRange = values.dateRange as [dayjs.Dayjs, dayjs.Dayjs] | undefined
      const res = await fetchVersionHistory({
        page,
        size: pageSize,
        keyword: values.keyword || undefined,
        releaseType: values.releaseType || undefined,
        startDate: dateRange?.[0]?.format('YYYY-MM-DD'),
        endDate: dateRange?.[1]?.format('YYYY-MM-DD'),
        status: values.status,
        createdBy: values.createdBy || undefined,
        updatedBy: values.updatedBy || undefined,
        updatedStartDate: values.updatedDateRange?.[0]?.format('YYYY-MM-DD'),
        updatedEndDate: values.updatedDateRange?.[1]?.format('YYYY-MM-DD'),
      })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch {
      /* error handled by interceptor */
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchForm])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => { setPage(1); loadData() }
  const handleReset = () => { searchForm.resetFields(); setPage(1) }

  const handleDelete = (record: VersionHistoryRecord) => {
    Modal.confirm({
      title: t('versionHistory.deleteConfirmTitle'),
      content: t('versionHistory.deleteConfirmContent', { version: record.versionNo }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteVersion(record.id)
        message.success(t('common.deleteSuccess'))
        loadData()
      },
    })
  }

  const handleSyncFromGit = () => {
    Modal.confirm({
      title: t('versionHistory.syncConfirmTitle'),
      content: t('versionHistory.syncConfirmContent'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          const res = await syncVersionFromGit()
          message.success(res || t('versionHistory.syncSuccess'))
          loadData()
        } catch {
          /* error handled by interceptor */
        }
      },
    })
  }

  const columns: TableColumnsType<VersionHistoryRecord> = [
    {
      key: 'versionNo',
      title: t('versionHistory.versionNo'),
      dataIndex: 'versionNo',
      width: 105,
      render: (v: string) => <span style={{ fontWeight: 600, color: '#1890ff' }}>v{v}</span>,
    },
    {
      key: 'releaseType',
      title: t('versionHistory.releaseType'),
      dataIndex: 'releaseType',
      width: 115,
      render: (v: string) => {
        const tag = RELEASE_TYPE_TAG[v] || { color: 'default' }
        return <Tag color={tag.color}>{t(`versionHistory.type_${v}`)}</Tag>
      },
    },
    {
      key: 'releaseDate',
      title: t('versionHistory.releaseDate'),
      dataIndex: 'releaseDate',
      width: 115,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      key: 'status',
      title: t('versionHistory.status'),
      dataIndex: 'status',
      width: 95,
      render: (v: number) => {
        const tag = STATUS_TAG[v] || { color: 'default' }
        return <Tag color={tag.color}>{v === 1 ? t('versionHistory.statusPublished') : t('versionHistory.statusDraft')}</Tag>
      },
    },
    {
      key: 'createdBy',
      title: t('versionHistory.createdBy'),
      dataIndex: 'createdBy',
      width: 140,
      ellipsis: true,
    },
    {
      key: 'createdAt',
      title: t('versionHistory.createdAt'),
      dataIndex: 'createdAt',
      width: 155,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      key: 'updatedBy',
      title: t('versionHistory.updatedBy'),
      dataIndex: 'updatedBy',
      width: 140,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      key: 'updatedAt',
      title: t('versionHistory.updatedAt'),
      dataIndex: 'updatedAt',
      width: 155,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      key: 'summary',
      title: t('versionHistory.summary'),
      dataIndex: 'summary',
      ellipsis: { showTitle: false },
      render: (v: string) => (
        <Tooltip placement="topLeft" title={v}>
          {v || '-'}
        </Tooltip>
      ),
    },
    {
      title: t('common.action'),
      key: 'action',
      width: 155,
      fixed: 'right',
      render: (_: unknown, record: VersionHistoryRecord) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small"
            onClick={() => navigate(`/version-history-detail/${record.id}`)}>
            {t('common.detail')}
          </Button>
          <Button type="link" size="small"
            onClick={() => navigate(`/version-history-edit/${record.id}`)}>
            {t('common.edit')}
          </Button>
          <Button type="link" size="small" danger
            onClick={() => handleDelete(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  const columnMeta = [
    { key: 'versionNo', title: t('versionHistory.versionNo') },
    { key: 'releaseType', title: t('versionHistory.releaseType') },
    { key: 'releaseDate', title: t('versionHistory.releaseDate') },
    { key: 'status', title: t('versionHistory.status') },
    { key: 'createdBy', title: t('versionHistory.createdBy') },
    { key: 'createdAt', title: t('versionHistory.createdAt') },
    { key: 'updatedBy', title: t('versionHistory.updatedBy') },
    { key: 'updatedAt', title: t('versionHistory.updatedAt') },
    { key: 'summary', title: t('versionHistory.summary') },
    { key: 'action', title: t('common.action') },
  ]

  const { configComponent, applyConfig } =
    useColumnConfig('version-history', columnMeta, [
      { key: 'action', visible: true, locked: 'tail' as const },
    ])

  const filteredColumns = applyConfig(columns)

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label={t('versionHistory.keywordLabel')} name="keyword">
            <Input placeholder={t('versionHistory.searchPlaceholder')} allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label={t('versionHistory.releaseType')} name="releaseType">
            <Select placeholder={t('common.all')} allowClear
              options={[
                { value: 'major', label: t('versionHistory.type_major') },
                { value: 'minor', label: t('versionHistory.type_minor') },
                { value: 'patch', label: t('versionHistory.type_patch') },
              ]} />
          </Form.Item>
          <Form.Item label={t('versionHistory.releaseDate')} name="dateRange">
            <RangePicker />
          </Form.Item>
          <Form.Item label={t('versionHistory.status')} name="status">
            <Select placeholder={t('common.all')} allowClear
              options={[
                { value: 1, label: t('versionHistory.statusPublished') },
                { value: 2, label: t('versionHistory.statusDraft') },
              ]} />
          </Form.Item>
          <Form.Item label={t('versionHistory.createdBy')} name="createdBy">
            <Input placeholder={t('versionHistory.createdByPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('versionHistory.updatedBy')} name="updatedBy">
            <Input placeholder={t('versionHistory.updatedByPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('versionHistory.updatedAt')} name="updatedDateRange">
            <RangePicker />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button icon={<SyncOutlined />} onClick={handleSyncFromGit}>
            {t('versionHistory.syncFromGit')}
          </Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => navigate('/version-history-add')}>
            {t('versionHistory.addVersion')}
          </Button>
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table
          rowKey="id"
          columns={filteredColumns}
          dataSource={dataSource}
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => t('common.total', { count: total }),
            onChange: (p, s) => {
              setPage(s !== pageSize ? 1 : p)
              setPageSize(s)
            },
          }}
        />
      </div>
    </div>
  )
}
