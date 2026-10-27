/**
 * 職位職級列表（/hcm-org-job-grade）
 *
 * 每條職位必須顯示所屬職務族：只顯示族 ID 等於讓使用者自己去猜。
 * 族名由職務族列表一次取回後在本地映射（族是字典量級，不會出現 N+1）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import {
  deleteJobGrade,
  listJobFamilies,
  listJobGrades,
  updateJobGrade,
  type OrgJobFamily,
  type OrgJobGrade,
} from '@/api/hcmOrganization'

interface Filters {
  keyword?: string
  status?: number
  jobFamilyId?: number
}

export default function HcmOrgJobGradeList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<OrgJobGrade[]>([])
  const [families, setFamilies] = useState<OrgJobFamily[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState<Filters>({})
  const [form] = Form.useForm<Filters>()

  const loadData = useCallback(async (nextPage = page, nextSize = pageSize, nextFilters = filters) => {
    setLoading(true)
    try {
      const res = await listJobGrades({ page: nextPage, size: nextSize, ...nextFilters })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filters])

  useEffect(() => {
    listJobFamilies({ page: 1, size: 200 })
      .then((res) => setFamilies(res.records ?? []))
      .catch(() => setFamilies([]))
  }, [])

  const familyNames = useMemo(() => {
    const map = new Map<number, string>()
    families.forEach((item) => {
      if (item.id) map.set(item.id, `${item.name}(${item.code})`)
    })
    return map
  }, [families])

  const handleSearch = () => {
    setPage(1)
    setFilters(form.getFieldsValue())
  }

  const handleReset = () => {
    form.resetFields()
    setPage(1)
    setFilters({})
  }

  const handleDelete = (record: OrgJobGrade) => {
    Modal.confirm({
      title: t('hcmOrg.job.grade.deleteConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hcmOrg.job.grade.code')}：</span><b>{record.code}</b></div>
          <div className="confirm-info-row"><span>{t('hcmOrg.job.grade.name')}：</span><b>{record.name}</b></div>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteJobGrade(record.id as number)
        message.success(t('hcmOrg.job.grade.deleteSuccess'))
        void loadData()
      },
    })
  }

  const handleToggleStatus = (record: OrgJobGrade) => {
    const nextStatus = record.status === 1 ? 0 : 1
    const actionText = nextStatus === 1 ? t('hcmOrg.enable') : t('hcmOrg.disable')
    Modal.confirm({
      title: t('hcmOrg.toggleConfirm', { action: actionText }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await updateJobGrade(record.id as number, { ...record, status: nextStatus })
        message.success(t('hcmOrg.toggleSuccess', { action: actionText }))
        void loadData()
      },
    })
  }

  const columnMeta = [
    { key: 'code', title: t('hcmOrg.job.grade.code') },
    { key: 'name', title: t('hcmOrg.job.grade.name') },
    { key: 'jobFamilyId', title: t('hcmOrg.job.grade.jobFamily') },
    { key: 'gradeLevel', title: t('hcmOrg.job.grade.gradeLevel') },
    { key: 'status', title: t('hcmOrg.status') },
    { key: 'updatedBy', title: t('hcmOrg.updatedBy') },
    { key: 'action', title: t('common.action') },
  ]

  const { configComponent, applyConfig } = useColumnConfig('hcm-org-job-grade', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: ColumnsType<OrgJobGrade> = [
    { key: 'code', title: t('hcmOrg.job.grade.code'), dataIndex: 'code', width: 170 },
    { key: 'name', title: t('hcmOrg.job.grade.name'), dataIndex: 'name' },
    {
      key: 'jobFamilyId', title: t('hcmOrg.job.grade.jobFamily'), dataIndex: 'jobFamilyId', width: 220,
      render: (value: number) => familyNames.get(value) ?? '-',
    },
    { key: 'gradeLevel', title: t('hcmOrg.job.grade.gradeLevel'), dataIndex: 'gradeLevel', width: 100 },
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
          <Button type="link" size="small" onClick={() => navigate(`/hcm-org-job-grade-detail?id=${record.id}`)}>
            {t('common.detail')}
          </Button>
          <Button type="link" size="small" onClick={() => navigate(`/hcm-org-job-grade-form?id=${record.id}`)}>
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
              <Input placeholder={t('hcmOrg.job.grade.keywordPlaceholder')} allowClear />
            </Form.Item>
            <Form.Item name="jobFamilyId" label={t('hcmOrg.job.grade.jobFamily')} style={{ marginBottom: 0 }}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={t('hcmOrg.all')}
                options={families.map((item) => ({ value: item.id, label: `${item.name}(${item.code})` }))}
              />
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/hcm-org-job-grade-form')}>
            {t('hcmOrg.job.grade.add')}
          </Button>
          {configComponent}
        </div>
      </div>

      <Table<OrgJobGrade>
        rowKey="id"
        size="middle"
        loading={loading}
        columns={applyConfig(columns) as ColumnsType<OrgJobGrade>}
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
