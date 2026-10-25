/**
 * 薪酬項目列表（/hcm-payroll-component）
 *
 * 字典量级的清单，不设统计卡：搜索区 → 操作区 → 表格。
 * 类型（應發/扣除/雇主成本）用 Tag 明示，避免评审时把雇主成本当成员工实发。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  COMPONENT_TYPE_OPTIONS,
  deleteComponent,
  listComponents,
  updateComponent,
  type PayrollComponent,
} from '../../../api/payroll'

interface Filters {
  keyword?: string
  componentType?: string
  status?: number
}

const TYPE_COLOR: Record<string, string> = {
  EARNING: 'green',
  DEDUCTION: 'orange',
  EMPLOYER_COST: 'purple',
}

export default function HcmPayrollComponentList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<PayrollComponent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState<Filters>({})
  const [form] = Form.useForm<Filters>()

  const loadData = useCallback(async (nextPage = page, nextSize = pageSize, nextFilters = filters) => {
    setLoading(true)
    try {
      const res = await listComponents({ page: nextPage, size: nextSize, ...nextFilters })
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

  const handleSearch = () => {
    setPage(1)
    setFilters(form.getFieldsValue())
  }

  const handleReset = () => {
    form.resetFields()
    setPage(1)
    setFilters({})
  }

  const handleDelete = (record: PayrollComponent) => {
    Modal.confirm({
      title: t('payroll.component.deleteConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('payroll.component.code')}：</span><b>{record.code}</b></div>
          <div className="confirm-info-row"><span>{t('payroll.component.name')}：</span><b>{record.name}</b></div>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteComponent(record.id as number)
        message.success(t('payroll.component.deleteSuccess'))
        void loadData()
      },
    })
  }

  const handleToggleStatus = (record: PayrollComponent) => {
    const nextStatus = record.status === 1 ? 0 : 1
    const actionText = nextStatus === 1 ? t('hcmOrg.enable') : t('hcmOrg.disable')
    Modal.confirm({
      title: t('hcmOrg.toggleConfirm', { action: actionText }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await updateComponent(record.id as number, { ...record, status: nextStatus })
        message.success(t('hcmOrg.toggleSuccess', { action: actionText }))
        void loadData()
      },
    })
  }

  const columnMeta = useMemo(() => ([
    { key: 'code', title: t('payroll.component.code') },
    { key: 'name', title: t('payroll.component.name') },
    { key: 'componentType', title: t('payroll.component.type') },
    { key: 'taxable', title: t('payroll.component.taxable') },
    { key: 'currency', title: t('payroll.component.currency') },
    { key: 'status', title: t('hcmOrg.status') },
    { key: 'action', title: t('common.action') },
  ]), [t])

  const { configComponent, applyConfig } = useColumnConfig('hcm-payroll-component', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: ColumnsType<PayrollComponent> = [
    { key: 'code', title: t('payroll.component.code'), dataIndex: 'code', width: 160 },
    { key: 'name', title: t('payroll.component.name'), dataIndex: 'name' },
    {
      key: 'componentType', title: t('payroll.component.type'), dataIndex: 'componentType', width: 130,
      render: (value: string) => (
        <Tag color={TYPE_COLOR[value] ?? 'default'}>
          {COMPONENT_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? value}
        </Tag>
      ),
    },
    {
      key: 'taxable', title: t('payroll.component.taxable'), dataIndex: 'taxable', width: 100,
      render: (value: number) => (value === 1
        ? <Tag color="blue">{t('payroll.component.taxableYes')}</Tag>
        : <Tag>{t('payroll.component.taxableNo')}</Tag>),
    },
    { key: 'currency', title: t('payroll.component.currency'), dataIndex: 'currency', width: 100,
      render: (value: string) => value || '-' },
    {
      key: 'status', title: t('hcmOrg.status'), dataIndex: 'status', width: 100,
      render: (value: number) => (value === 1
        ? <Tag color="green">{t('hcmOrg.enabled')}</Tag>
        : <Tag color="default">{t('hcmOrg.disabled')}</Tag>),
    },
    {
      key: 'action', title: t('common.action'), width: 200, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/hcm-payroll-component-form?id=${record.id}`)}>
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
              <Input placeholder={t('payroll.component.keywordPlaceholder')} allowClear />
            </Form.Item>
            <Form.Item name="componentType" label={t('payroll.component.type')} style={{ marginBottom: 0 }}>
              <Select allowClear placeholder={t('hcmOrg.all')} options={[...COMPONENT_TYPE_OPTIONS]} />
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/hcm-payroll-component-form')}>
            {t('payroll.component.add')}
          </Button>
          {configComponent}
        </div>
      </div>

      <Table<PayrollComponent>
        rowKey="id"
        size="middle"
        loading={loading}
        columns={applyConfig(columns) as ColumnsType<PayrollComponent>}
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
