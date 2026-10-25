/**
 * 職務族列表（/hcm-org-job-family）
 *
 * 職務族是職位體系的根：族決定能力模型與發展通道，職位職級挂在族下。
 * 這是一份字典量級的清單（通常十幾條），因此不做统计卡，保持「搜索 → 操作 → 表格」的短動線。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  deleteJobFamily,
  listJobFamilies,
  updateJobFamily,
  type OrgJobFamily,
} from '../../../api/hcmOrganization'

interface Filters {
  keyword?: string
  status?: number
}

export default function HcmOrgJobFamilyList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<OrgJobFamily[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState<Filters>({})
  const [form] = Form.useForm<Filters>()

  const loadData = useCallback(async (nextPage = page, nextSize = pageSize, nextFilters = filters) => {
    setLoading(true)
    try {
      const res = await listJobFamilies({ page: nextPage, size: nextSize, ...nextFilters })
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters])

  useEffect(() => {
    void loadData(page, pageSize, filters)
    // 三个显式参数已覆盖取数口径，避免把 loadData 引用变化当成数据变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filters])

  const handleSearch = () => {
    setPage(1)
    setFilters(form.getFieldsValue())
  }

  const handleReset = () => {
    form.resetFields()
    setPage(1)
    setFilters({})
  }

  const handleDelete = (record: OrgJobFamily) => {
    Modal.confirm({
      title: t('hcmOrg.job.family.deleteConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hcmOrg.job.family.code')}：</span><b>{record.code}</b></div>
          <div className="confirm-info-row"><span>{t('hcmOrg.job.family.name')}：</span><b>{record.name}</b></div>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteJobFamily(record.id as number)
        message.success(t('hcmOrg.job.family.deleteSuccess'))
        void loadData()
      },
    })
  }

  const handleToggleStatus = (record: OrgJobFamily) => {
    const nextStatus = record.status === 1 ? 0 : 1
    const actionText = nextStatus === 1 ? t('hcmOrg.enable') : t('hcmOrg.disable')
    Modal.confirm({
      title: t('hcmOrg.toggleConfirm', { action: actionText }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await updateJobFamily(record.id as number, { ...record, status: nextStatus })
        message.success(t('hcmOrg.toggleSuccess', { action: actionText }))
        void loadData()
      },
    })
  }

  const columnMeta = [
    { key: 'code', title: t('hcmOrg.job.family.code') },
    { key: 'name', title: t('hcmOrg.job.family.name') },
    { key: 'nameEn', title: t('hcmOrg.job.family.nameEn') },
    { key: 'sortOrder', title: t('hcmOrg.sortOrder') },
    { key: 'status', title: t('hcmOrg.status') },
    { key: 'updatedBy', title: t('hcmOrg.updatedBy') },
    { key: 'action', title: t('common.action') },
  ]

  const { configComponent, applyConfig } = useColumnConfig('hcm-org-job-family', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: ColumnsType<OrgJobFamily> = [
    { key: 'code', title: t('hcmOrg.job.family.code'), dataIndex: 'code', width: 160 },
    { key: 'name', title: t('hcmOrg.job.family.name'), dataIndex: 'name' },
    { key: 'nameEn', title: t('hcmOrg.job.family.nameEn'), dataIndex: 'nameEn' },
    { key: 'sortOrder', title: t('hcmOrg.sortOrder'), dataIndex: 'sortOrder', width: 90 },
    {
      key: 'status', title: t('hcmOrg.status'), dataIndex: 'status', width: 100,
      render: (value: number) => (value === 1
        ? <Tag color="green">{t('hcmOrg.enabled')}</Tag>
        : <Tag color="default">{t('hcmOrg.disabled')}</Tag>),
    },
    { key: 'updatedBy', title: t('hcmOrg.updatedBy'), dataIndex: 'updatedBy', width: 130 },
    {
      key: 'action', title: t('common.action'), width: 200, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/hcm-org-job-family-detail?id=${record.id}`)}>
            {t('common.detail')}
          </Button>
          <Button type="link" size="small" onClick={() => navigate(`/hcm-org-job-family-form?id=${record.id}`)}>
            {t('common.edit')}
          </Button>
          <Button type="link" size="small" onClick={() => handleToggleStatus(record)}>
            {record.status === 1 ? t('hcmOrg.disable') : t('hcmOrg.enable')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      <div className="search-section">
        <Form form={form} layout="vertical" onFinish={handleSearch}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
            <Form.Item name="keyword" label={t('hcmOrg.keyword')} style={{ marginBottom: 0 }}>
              <Input placeholder={t('hcmOrg.job.family.keywordPlaceholder')} allowClear />
            </Form.Item>
            <Form.Item name="status" label={t('hcmOrg.status')} style={{ marginBottom: 0 }}>
              <Select allowClear placeholder={t('hcmOrg.all')} options={[
                { value: 1, label: t('hcmOrg.enabled') },
                { value: 0, label: t('hcmOrg.disabled') },
              ]} />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <div className="search-actions" style={{ paddingTop: 26 }}>
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
              </div>
            </Form.Item>
          </div>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/hcm-org-job-family-form')}>
            {t('hcmOrg.job.family.add')}
          </Button>
          {configComponent}
        </div>
      </div>

      <Table<OrgJobFamily>
        rowKey="id"
        size="middle"
        loading={loading}
        columns={applyConfig(columns) as ColumnsType<OrgJobFamily>}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (count) => t('common.total', { count }),
          onChange: (nextPage, nextSize) => {
            setPage(nextSize !== pageSize ? 1 : nextPage)
            setPageSize(nextSize || 20)
          },
        }}
      />
    </div>
  )
}
