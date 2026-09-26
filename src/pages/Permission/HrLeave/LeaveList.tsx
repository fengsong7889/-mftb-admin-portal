import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Space, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  LEAVE_EDITABLE, deleteLeaveRequest, fetchLeaveRequests, fetchLeaveStats, type LeaveRequestItem,
} from '../../../api/hrLeave'
import { LEAVE_STATUS_LABEL_KEY, LEAVE_STATUS_TABS, LEAVE_STATUS_TAG_COLOR, LEAVE_TYPE_LABEL_KEY } from './meta'

/** 请假管理列表：状态页签 + 搜索 + 表格 */
export default function LeaveList() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('hr-leave:create')
  const canEdit = hasPermission('hr-leave:edit')
  const canDelete = hasPermission('hr-leave:delete')

  const [rows, setRows] = useState<LeaveRequestItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [status, setStatus] = useState('all')
  const [keyword, setKeyword] = useState<string>()
  const [stats, setStats] = useState<Record<string, number>>({})
  const [form] = Form.useForm<{ keyword?: string }>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchLeaveRequests({
        page, size, keyword: keyword || undefined, status: status === 'all' ? undefined : status,
      })
      setRows(res.records || [])
      setTotal(res.total || 0)
    } catch {
      // 请求层已统一提示
    } finally {
      setLoading(false)
    }
  }, [page, size, status, keyword])

  const loadStats = useCallback(() => {
    fetchLeaveStats().then(setStats).catch(() => setStats({}))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadStats() }, [loadStats])

  const refresh = useCallback(() => { load(); loadStats() }, [load, loadStats])

  const handleDelete = (record: LeaveRequestItem) => {
    Modal.confirm({
      title: t('hrLeave.confirmDeleteTitle'),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hrLeave.reqNo')}：</span><b>{record.reqNo}</b></div>
          <div className="confirm-info-row"><span>{t('hrLeave.employee')}：</span><b>{record.empName}</b></div>
        </div>
      ),
      okText: t('common.delete'), okButtonProps: { danger: true }, cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteLeaveRequest(record.id)
        message.success(t('hrLeave.deleted'))
        refresh()
      },
    })
  }

  const typeLabel = (code: string) => (LEAVE_TYPE_LABEL_KEY[code] ? t(LEAVE_TYPE_LABEL_KEY[code]) : code)

  const columns = useMemo<TableColumnsType<LeaveRequestItem>>(() => [
    { title: t('hrLeave.reqNo'), dataIndex: 'reqNo', key: 'reqNo', width: 150, fixed: 'left' },
    {
      title: t('hrLeave.employee'), key: 'emp', width: 160,
      render: (_, r) => <Space size={4}><span>{r.empName}</span>{r.empNo && <span style={{ color: '#8C8C8C' }}>({r.empNo})</span>}</Space>,
    },
    { title: t('hrLeave.dept'), dataIndex: 'deptName', key: 'deptName', width: 140, render: (v: string) => v || '-' },
    { title: t('hrLeave.leaveType'), dataIndex: 'leaveType', key: 'leaveType', width: 110, render: (v: string) => <Tag>{typeLabel(v)}</Tag> },
    {
      title: t('hrLeave.period'), key: 'period', width: 210,
      render: (_, r) => `${r.startDate} ~ ${r.endDate}`,
    },
    { title: t('hrLeave.days'), dataIndex: 'days', key: 'days', width: 90, render: (v: number) => `${v} ${t('hrLeave.dayUnit')}` },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => (
        <Tag color={LEAVE_STATUS_TAG_COLOR[v]}>{LEAVE_STATUS_LABEL_KEY[v] ? t(LEAVE_STATUS_LABEL_KEY[v]) : v}</Tag>
      ),
    },
    { title: t('hrLeave.flowNo'), dataIndex: 'flowNo', key: 'flowNo', width: 150, render: (v: string) => v || '-' },
    {
      title: t('common.colCreateTime'), dataIndex: 'createdAt', key: 'createdAt', width: 175,
      render: (v: string) => (v ? <span style={{ whiteSpace: 'nowrap' }}>{dayjs(v).format('YYYY-MM-DD HH:mm:ss')}</span> : '-'),
    },
    {
      title: t('common.colAction'), key: 'action', width: 190, fixed: 'right',
      render: (_, r) => {
        const editable = LEAVE_EDITABLE.includes(r.status)
        return (
          <Space size={0}>
            <Button type="link" size="small" onClick={() => navigate(`/hr-leave-detail?id=${r.id}`)}>{t('common.detail')}</Button>
            {canEdit && editable && (<><span className="action-split">|</span>
              <Button type="link" size="small" onClick={() => navigate(`/hr-leave-form?id=${r.id}`)}>{t('common.edit')}</Button></>)}
            {canDelete && editable && (<><span className="action-split">|</span>
              <Button type="link" size="small" className="ant-btn-dangerous" onClick={() => handleDelete(r)}>{t('common.delete')}</Button></>)}
          </Space>
        )
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, page, status, keyword, canEdit, canDelete])

  const { configComponent, applyConfig } = useColumnConfig('hr-leave',
    columns.map(c => ({ key: String(c.key), title: String(c.title) })),
    [{ key: 'action', visible: true, locked: 'tail' }])

  return (
    <div className="content-area">
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('hrLeave.keyword')} name="keyword">
            <Input placeholder={t('hrLeave.keywordPlaceholder')} allowClear onPressEnter={() => { setKeyword(form.getFieldValue('keyword')?.trim() || undefined); setPage(1) }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}
                onClick={() => { setKeyword(form.getFieldValue('keyword')?.trim() || undefined); setPage(1) }}>
                {t('common.search')}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => { form.resetFields(); setKeyword(undefined); setPage(1) }}>
                {t('common.reset')}
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left">
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/hr-leave-form')}>
              {t('hrLeave.addLeave')}
            </Button>
          )}
        </div>
        <div className="action-section-right">{configComponent}</div>
      </div>

      <Tabs
        activeKey={status}
        items={LEAVE_STATUS_TABS.map(key => ({
          key,
          label: key === 'all'
            ? `${t('hrLeave.statusAll')} (${stats.all ?? 0})`
            : `${LEAVE_STATUS_LABEL_KEY[key] ? t(LEAVE_STATUS_LABEL_KEY[key]) : key} (${stats[key] ?? 0})`,
        }))}
        onChange={key => { setStatus(key); setPage(1) }}
        style={{ marginBottom: 0 }}
      />

      <Table<LeaveRequestItem>
        className="nowrap-table"
        columns={applyConfig(columns)}
        dataSource={rows}
        rowKey="id"
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
