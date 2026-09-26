import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  batchInitBalances, deleteLeaveBalance, fetchLeaveBalances, fetchLeaveOverdueCount, type LeaveBalance,
} from '../../../api/hrLeave'
import { LEAVE_TYPE_LABEL_KEY, LEAVE_TYPE_ORDER } from './meta'

/** 假期额度台账：年度筛选 + 批量初始化 + 剩余额度计算列 */
export default function LeaveQuotaList() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('hr-leave-quota:create')
  const canEdit = hasPermission('hr-leave-quota:edit')
  const canDelete = hasPermission('hr-leave-quota:delete')
  const currentYear = dayjs().year()

  const [rows, setRows] = useState<LeaveBalance[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [year, setYear] = useState<number>(currentYear)
  const [keyword, setKeyword] = useState<string>()
  /** 超额行数由后端按整年统计（只看当前分页会漏报） */
  const [overdue, setOverdue] = useState(0)
  const [form] = Form.useForm<{ keyword?: string; year?: number }>()
  const [initForm] = Form.useForm<{ year: number; leaveType: string; totalDays: number }>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [res, overdueCount] = await Promise.all([
        fetchLeaveBalances({ page, size, year, keyword: keyword || undefined }),
        fetchLeaveOverdueCount(year).catch(() => 0),
      ])
      setRows(res.records || [])
      setTotal(res.total || 0)
      setOverdue(overdueCount ?? 0)
    } catch {
      // 请求层已提示
    } finally {
      setLoading(false)
    }
  }, [page, size, year, keyword])

  useEffect(() => { load() }, [load])

  const typeLabel = (code: string) => (LEAVE_TYPE_LABEL_KEY[code] ? t(LEAVE_TYPE_LABEL_KEY[code]) : code)

  const handleBatchInit = () => {
    initForm.validateFields().then(values => {
      Modal.confirm({
        title: t('hrLeave.batchInitTitle'),
        className: 'custom-confirm-modal',
        content: (
          <div className="confirm-info-card">
            <div className="confirm-info-row"><span>{t('hrLeave.year')}：</span><b>{values.year}</b></div>
            <div className="confirm-info-row"><span>{t('hrLeave.leaveType')}：</span><b>{typeLabel(values.leaveType)}</b></div>
            <div className="confirm-info-row"><span>{t('hrLeave.totalDays')}：</span><b>{values.totalDays}</b></div>
            <div className="confirm-info-row"><span>{t('hrLeave.batchInitScope')}：</span><b>{t('hrLeave.batchInitAll')}</b></div>
          </div>
        ),
        okText: t('hrLeave.confirmSubmit'), cancelText: t('common.cancel'),
        onOk: async () => {
          const created = await batchInitBalances(values)
          message.success(t('hrLeave.batchInitDone', { count: created }))
          await load()
        },
      })
    })
  }

  const handleDelete = (record: LeaveBalance) => {
    Modal.confirm({
      title: t('hrLeave.confirmDeleteQuotaTitle'),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hrLeave.employee')}：</span><b>{record.empName}({record.empNo})</b></div>
          <div className="confirm-info-row"><span>{t('hrLeave.leaveType')}：</span><b>{typeLabel(record.leaveType)}</b></div>
        </div>
      ),
      okText: t('common.delete'), okButtonProps: { danger: true }, cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteLeaveBalance(record.id as number)
        message.success(t('hrLeave.deleted'))
        await load()
      },
    })
  }

  const columns = useMemo<TableColumnsType<LeaveBalance>>(() => [
    {
      title: t('hrLeave.employee'), key: 'emp', width: 170, fixed: 'left',
      render: (_, r) => <Space size={4}><span>{r.empName || '-'}</span><span style={{ color: '#8C8C8C' }}>({r.empNo || '-'})</span></Space>,
    },
    { title: t('hrLeave.dept'), dataIndex: 'department', key: 'department', width: 150, render: (v: string) => v || '-' },
    { title: t('hrLeave.year'), dataIndex: 'year', key: 'year', width: 90 },
    { title: t('hrLeave.leaveType'), dataIndex: 'leaveType', key: 'leaveType', width: 120, render: (v: string) => <Tag>{typeLabel(v)}</Tag> },
    { title: t('hrLeave.totalDays'), dataIndex: 'totalDays', key: 'totalDays', width: 110 },
    { title: t('hrLeave.carriedDays'), dataIndex: 'carriedDays', key: 'carriedDays', width: 110 },
    { title: t('hrLeave.usedDays'), dataIndex: 'usedDays', key: 'usedDays', width: 110 },
    { title: t('hrLeave.occupiedDays'), dataIndex: 'occupiedDays', key: 'occupiedDays', width: 120, render: (v: number) => v ?? 0 },
    {
      // 剩余可为负（超额），用红色 Tag 提示
      title: t('hrLeave.remaining'), key: 'remaining', width: 110,
      render: (_, r) => {
        const left = r.remainingDays ?? 0
        return <Tag color={left < 0 ? 'error' : left <= 1 ? 'warning' : 'success'}>{left}</Tag>
      },
    },
    {
      title: t('common.colAction'), key: 'action', width: 150, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          {canEdit && (
            <Button type="link" size="small"
              onClick={() => navigate(`/hr-leave-quota-form?id=${r.id}&userId=${r.userId}&leaveType=${r.leaveType}&year=${r.year}`)}>
              {t('common.edit')}
            </Button>
          )}
          {canDelete && (
            <><span className="action-split">|</span>
              <Button type="link" size="small" className="ant-btn-dangerous" onClick={() => handleDelete(r)}>{t('common.delete')}</Button>
            </>
          )}
        </Space>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, page, year, keyword, canEdit, canDelete])

  const { configComponent, applyConfig } = useColumnConfig('hr-leave-quota',
    columns.map(c => ({ key: String(c.key), title: String(c.title) })),
    [{ key: 'action', visible: true, locked: 'tail' }])

  return (
    <div className="content-area">
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('hrLeave.keyword')} name="keyword">
            <Input placeholder={t('hrLeave.keywordPlaceholder')} allowClear onPressEnter={() => { setKeyword(form.getFieldValue('keyword')?.trim() || undefined); setPage(1) }} />
          </Form.Item>
          <Form.Item label={t('hrLeave.year')} name="year" initialValue={currentYear}>
            <Select style={{ width: 120 }} options={[currentYear - 1, currentYear, currentYear + 1].map(y => ({ value: y, label: String(y) }))} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}
                onClick={() => { setKeyword(form.getFieldValue('keyword')?.trim() || undefined); setYear(form.getFieldValue('year') ?? currentYear); setPage(1) }}>
                {t('common.search')}
              </Button>
              <Button icon={<ReloadOutlined />}
                onClick={() => { form.resetFields(); setKeyword(undefined); setYear(currentYear); setPage(1) }}>
                {t('common.reset')}
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {overdue > 0 && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }}
          message={t('hrLeave.overdueAlert', { count: overdue })} />
      )}

      <div className="action-section">
        <div className="action-section-left">
          {canCreate && (
            <>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/hr-leave-quota-form')}>
                {t('hrLeave.addQuota')}
              </Button>
              <Button icon={<ThunderboltOutlined />} onClick={() => {
                initForm.setFieldsValue({ year, leaveType: 'ANNUAL' })
                Modal.confirm({
                  title: t('hrLeave.batchInitTitle'),
                  icon: null,
                  width: 460,
                  content: (
                    <Form form={initForm} layout="vertical" style={{ marginTop: 12 }}>
                      <Form.Item name="year" label={t('hrLeave.year')} rules={[{ required: true }]}>
                        <Select options={[currentYear - 1, currentYear, currentYear + 1].map(y => ({ value: y, label: String(y) }))} />
                      </Form.Item>
                      <Form.Item name="leaveType" label={t('hrLeave.leaveType')} rules={[{ required: true }]}>
                        <Select options={LEAVE_TYPE_ORDER.map(c => ({ value: c, label: typeLabel(c) }))} />
                      </Form.Item>
                      <Form.Item name="totalDays" label={t('hrLeave.totalDays')}
                        rules={[{ required: true, message: t('hrLeave.totalDaysRequired') }]}
                        extra={t('hrLeave.totalDaysHint')}>
                        <InputNumber min={0} max={365} step={0.5} style={{ width: '100%' }} />
                      </Form.Item>
                    </Form>
                  ),
                  okText: t('common.confirm'), cancelText: t('common.cancel'),
                  onOk: handleBatchInit,
                })
              }}>
                {t('hrLeave.batchInit')}
              </Button>
            </>
          )}
        </div>
        <div className="action-section-right">{configComponent}</div>
      </div>

      <Table<LeaveBalance>
        className="nowrap-table"
        columns={applyConfig(columns)}
        dataSource={rows}
        rowKey={r => `${r.id}`}
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true, showQuickJumper: true,
          showTotal: (c) => t('common.total', { count: c }),
          onChange: (p, s) => { setPage(s !== size ? 1 : p); setSize(s) },
        }}
      />
    </div>
  )
}
