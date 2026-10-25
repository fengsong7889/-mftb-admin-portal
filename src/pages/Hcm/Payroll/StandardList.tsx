/**
 * 薪酬標準列表（/hcm-payroll-standard?employmentId=xxx）
 *
 * 薪酬標準挂在"雇佣关系"上而不是人员上：同一人可能多法人并行，工资必须按雇佣分别核算。
 * 因此本页必须由雇佣进入；直接点菜单进来时给出明确指引（而不是显示一个空列表让人以为没数据）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, DatePicker, Form, Modal, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  CHANGE_TYPE_OPTIONS,
  deleteStandard,
  listStandards,
  type PayrollSalaryStandard,
} from '../../../api/payroll'

export default function HcmPayrollStandardList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const employmentId = params.get('employmentId') ? Number(params.get('employmentId')) : null

  const [rows, setRows] = useState<PayrollSalaryStandard[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [asOf, setAsOf] = useState<string | undefined>(undefined)
  const [form] = Form.useForm<{ asOf?: dayjs.Dayjs }>()

  const loadData = useCallback(async (nextPage = page, nextSize = pageSize, nextAsOf = asOf) => {
    if (!employmentId) {
      setRows([])
      setTotal(0)
      return
    }
    setLoading(true)
    try {
      const res = await listStandards({ employmentId, asOf: nextAsOf, page: nextPage, size: nextSize })
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [employmentId, page, pageSize, asOf])

  useEffect(() => {
    void loadData(page, pageSize, asOf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employmentId, page, pageSize, asOf])

  const handleSearch = () => {
    const value = form.getFieldValue('asOf') as dayjs.Dayjs | undefined
    setPage(1)
    setAsOf(value ? value.format('YYYY-MM-DD') : undefined)
  }

  const handleReset = () => {
    form.resetFields()
    setPage(1)
    setAsOf(undefined)
  }

  const handleDelete = (record: PayrollSalaryStandard) => {
    Modal.confirm({
      title: t('payroll.standard.deleteConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('payroll.standard.effectiveFrom')}：</span><b>{record.effectiveFrom}</b></div>
          <div className="confirm-info-row"><span>{t('payroll.standard.baseAmount')}：</span><b>{record.baseAmount} {record.currency}</b></div>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteStandard(record.id as number)
        message.success(t('payroll.standard.deleteSuccess'))
        void loadData()
      },
    })
  }

  const columnMeta = useMemo(() => ([
    { key: 'effectiveFrom', title: t('payroll.standard.effectiveFrom') },
    { key: 'effectiveTo', title: t('payroll.standard.effectiveTo') },
    { key: 'baseAmount', title: t('payroll.standard.baseAmount') },
    { key: 'changeType', title: t('payroll.standard.changeType') },
    { key: 'seqNo', title: t('hcmPerson.seqNo') },
    { key: 'action', title: t('common.action') },
  ]), [t])

  const { configComponent, applyConfig } = useColumnConfig('hcm-payroll-standard', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: ColumnsType<PayrollSalaryStandard> = [
    { key: 'effectiveFrom', title: t('payroll.standard.effectiveFrom'), dataIndex: 'effectiveFrom', width: 140 },
    {
      key: 'effectiveTo', title: t('payroll.standard.effectiveTo'), dataIndex: 'effectiveTo', width: 150,
      render: (value: string) => value || <Tag color="blue">{t('payroll.standard.current')}</Tag>,
    },
    {
      key: 'baseAmount', title: t('payroll.standard.baseAmount'), dataIndex: 'baseAmount', width: 180,
      render: (value: string, record) => `${value} ${record.currency}`,
    },
    {
      key: 'changeType', title: t('payroll.standard.changeType'), dataIndex: 'changeType', width: 140,
      render: (value: string) => CHANGE_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? value,
    },
    { key: 'seqNo', title: t('hcmPerson.seqNo'), dataIndex: 'seqNo', width: 100 },
    {
      key: 'action', title: t('common.action'), width: 150, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button
            type="link" size="small"
            onClick={() => navigate(`/hcm-payroll-standard-form?id=${record.id}&employmentId=${record.employmentId}`)}
          >
            {t('common.edit')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  if (!employmentId) {
    return (
      <div className="content-area">
        <Alert
          type="info"
          showIcon
          message={t('payroll.standard.needEmployment')}
          description={t('payroll.standard.needEmploymentHint')}
          action={(
            <Button type="primary" onClick={() => navigate('/hcm-person')}>
              {t('payroll.standard.goPerson')}
            </Button>
          )}
        />
      </div>
    )
  }

  return (
    <div className="content-area">
      <div className="search-section">
        <Form form={form} layout="vertical" onFinish={handleSearch}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
            <Form.Item name="asOf" label={t('payroll.standard.asOf')} style={{ marginBottom: 0 }}>
              <DatePicker style={{ width: '100%' }} placeholder={t('payroll.standard.asOfHint')} />
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
          <Button
            type="primary" icon={<PlusOutlined />}
            onClick={() => navigate(`/hcm-payroll-standard-form?employmentId=${employmentId}`)}
          >
            {t('payroll.standard.add')}
          </Button>
          {configComponent}
        </div>
      </div>

      <Table<PayrollSalaryStandard>
        rowKey="id"
        size="middle"
        loading={loading}
        columns={applyConfig(columns) as ColumnsType<PayrollSalaryStandard>}
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
