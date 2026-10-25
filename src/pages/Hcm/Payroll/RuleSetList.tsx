/**
 * 薪酬規則列表（/hcm-payroll-rule）
 *
 * 城市 × 期间的一整套算薪口径。系统不内置任何默认费率，因此这里是业务录入规则的唯一入口。
 * 「複製」是主力动作：城市参数年年只改几个数，从空白重建要重录十几档级距。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, DatePicker, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CalculatorOutlined, CopyOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  JURISDICTION_OPTIONS,
  copyRuleSet,
  deleteRuleSet,
  listRuleSets,
  updateRuleSet,
  type PayrollRuleSet,
} from '../../../api/payroll'

interface Filters { keyword?: string; jurisdiction?: string; status?: number }

interface CopyFormValues {
  newCode: string
  newName: string
  period: [Dayjs, Dayjs | null]
}

export default function HcmPayrollRuleList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<PayrollRuleSet[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState<Filters>({})
  const [form] = Form.useForm<Filters>()
  const [copySource, setCopySource] = useState<PayrollRuleSet | null>(null)
  const [copyForm] = Form.useForm<CopyFormValues>()
  const [copying, setCopying] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listRuleSets({ page, size: pageSize, ...filters })
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const openCopy = (record: PayrollRuleSet) => {
    setCopySource(record)
    const nextFrom = dayjs(record.effectiveFrom).add(1, 'year')
    copyForm.setFieldsValue({
      newCode: `${record.code}-NEXT`,
      newName: `${record.name}（新）`,
      period: [nextFrom, nextFrom.endOf('year')],
    })
  }

  const handleCopy = async () => {
    if (!copySource) return
    const values = await copyForm.validateFields()
    setCopying(true)
    try {
      await copyRuleSet(copySource.id as number, {
        newCode: values.newCode,
        newName: values.newName,
        effectiveFrom: values.period[0].format('YYYY-MM-DD'),
        effectiveTo: values.period[1] ? values.period[1].format('YYYY-MM-DD') : null,
      })
      message.success(t('payroll.rule.copySuccess'))
      setCopySource(null)
      void loadData()
    } finally {
      setCopying(false)
    }
  }

  const handleDelete = (record: PayrollRuleSet) => {
    Modal.confirm({
      title: t('payroll.rule.deleteConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('payroll.rule.code')}：</span><b>{record.code}</b></div>
          <div className="confirm-info-row"><span>{t('payroll.rule.period')}：</span><b>{record.effectiveFrom} ~ {record.effectiveTo || '-'}</b></div>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteRuleSet(record.id as number)
        message.success(t('payroll.rule.deleteSuccess'))
        void loadData()
      },
    })
  }

  const handleToggle = (record: PayrollRuleSet) => {
    const nextStatus = record.status === 1 ? 0 : 1
    const actionText = nextStatus === 1 ? t('hcmOrg.enable') : t('hcmOrg.disable')
    Modal.confirm({
      title: t('hcmOrg.toggleConfirm', { action: actionText }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await updateRuleSet(record.id as number, { ...record, status: nextStatus })
        message.success(t('hcmOrg.toggleSuccess', { action: actionText }))
        void loadData()
      },
    })
  }

  const columnMeta = useMemo(() => ([
    { key: 'code', title: t('payroll.rule.code') },
    { key: 'name', title: t('payroll.rule.name') },
    { key: 'city', title: t('payroll.rule.city') },
    { key: 'period', title: t('payroll.rule.period') },
    { key: 'basicDeduction', title: t('payroll.rule.basicDeduction') },
    { key: 'status', title: t('hcmOrg.status') },
    { key: 'action', title: t('common.action') },
  ]), [t])

  const { configComponent, applyConfig } = useColumnConfig('hcm-payroll-rule', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: ColumnsType<PayrollRuleSet> = [
    { key: 'code', title: t('payroll.rule.code'), dataIndex: 'code', width: 160 },
    { key: 'name', title: t('payroll.rule.name'), dataIndex: 'name' },
    {
      key: 'city', title: t('payroll.rule.city'), width: 190,
      render: (_, record) => (
        <span>
          {record.cityName || record.cityCode}
          <Tag style={{ marginLeft: 8 }}>{record.jurisdiction}</Tag>
        </span>
      ),
    },
    {
      key: 'period', title: t('payroll.rule.period'), width: 220,
      render: (_, record) => `${record.effectiveFrom} ~ ${record.effectiveTo || t('payroll.rule.openEnded')}`,
    },
    {
      key: 'basicDeduction', title: t('payroll.rule.basicDeduction'), width: 150,
      render: (_, record) => `${record.basicDeduction} ${record.currency}`,
    },
    {
      key: 'status', title: t('hcmOrg.status'), dataIndex: 'status', width: 100,
      render: (value: number) => (value === 1
        ? <Tag color="green">{t('hcmOrg.enabled')}</Tag>
        : <Tag color="default">{t('hcmOrg.disabled')}</Tag>),
    },
    {
      key: 'action', title: t('common.action'), width: 250, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/hcm-payroll-rule-form?id=${record.id}`)}>
            {t('common.edit')}
          </Button>
          <Button type="link" size="small" icon={<CopyOutlined />} onClick={() => openCopy(record)}>
            {t('payroll.rule.copy')}
          </Button>
          <Button type="link" size="small" onClick={() => handleToggle(record)}>
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
        <Form form={form} layout="vertical" onFinish={() => {
          setPage(1)
          setFilters(form.getFieldsValue())
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
            <Form.Item name="keyword" label={t('hcmOrg.keyword')} style={{ marginBottom: 0 }}>
              <Input placeholder={t('payroll.rule.keywordPlaceholder')} allowClear />
            </Form.Item>
            <Form.Item name="jurisdiction" label={t('payroll.benefit.jurisdiction')} style={{ marginBottom: 0 }}>
              <Select allowClear placeholder={t('hcmOrg.all')} options={[...JURISDICTION_OPTIONS]} />
            </Form.Item>
            <Form.Item name="status" label={t('hcmOrg.status')} style={{ marginBottom: 0 }}>
              <Select allowClear placeholder={t('hcmOrg.all')} options={[
                { value: 1, label: t('hcmOrg.enabled') },
                { value: 0, label: t('hcmOrg.disabled') },
              ]} />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <div className="search-actions" style={{ paddingTop: 26 }}>
                <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
                <Button icon={<ReloadOutlined />} onClick={() => {
                  form.resetFields()
                  setPage(1)
                  setFilters({})
                }}>{t('common.reset')}</Button>
              </div>
            </Form.Item>
          </div>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
            <CalculatorOutlined /> {t('payroll.rule.noDefaultHint')}
          </span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/hcm-payroll-rule-form')}>
            {t('payroll.rule.add')}
          </Button>
          {configComponent}
        </div>
      </div>

      <Table<PayrollRuleSet>
        rowKey="id"
        size="middle"
        loading={loading}
        columns={applyConfig(columns) as ColumnsType<PayrollRuleSet>}
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

      <Modal
        title={t('payroll.rule.copyTitle', { code: copySource?.code ?? '' })}
        open={!!copySource}
        onCancel={() => setCopySource(null)}
        onOk={handleCopy}
        confirmLoading={copying}
        okText={t('payroll.rule.copy')}
        cancelText={t('common.cancel')}
        destroyOnClose
      >
        <Form form={copyForm} layout="vertical">
          <Form.Item name="newCode" label={t('payroll.rule.code')} rules={[{ required: true, message: t('payroll.rule.codeRequired') }]}>
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="newName" label={t('payroll.rule.name')} rules={[{ required: true, message: t('payroll.rule.nameRequired') }]}>
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name="period" label={t('payroll.rule.period')} rules={[{ required: true, message: t('payroll.rule.periodRequired') }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} allowEmpty={[false, true]} />
          </Form.Item>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            {t('payroll.rule.copyHint')}
          </div>
        </Form>
      </Modal>
    </div>
  )
}
