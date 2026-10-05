import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Space, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../../contexts/AuthContext'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  CERT_EDITABLE, CERT_FORM_PATH, CERT_LIST_PATH, deleteCertificate, fetchCertificateStats,
  fetchCertificates, type CertificateItem,
} from '../../api/hrCertificate'
import {
  CERT_STATUS_LABEL_KEY, CERT_STATUS_TABS, CERT_STATUS_TAG_COLOR, CERT_TYPE_LABEL_KEY,
} from './meta'

/** 我的證明開具列表：状态页签 + 搜索 + 表格（数据范围由服务端锁定为登录人） */
export default function CertificateList() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('ess-certificate:create')
  const canEdit = hasPermission('ess-certificate:edit')
  const canDelete = hasPermission('ess-certificate:delete')

  const [rows, setRows] = useState<CertificateItem[]>([])
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
      const res = await fetchCertificates({
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
    fetchCertificateStats().then(setStats).catch(() => setStats({}))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadStats() }, [loadStats])

  const refresh = useCallback(() => { load(); loadStats() }, [load, loadStats])

  const typeLabel = (code: string) => (CERT_TYPE_LABEL_KEY[code] ? t(CERT_TYPE_LABEL_KEY[code]) : code)
  const statusLabel = (code: string) => (CERT_STATUS_LABEL_KEY[code] ? t(CERT_STATUS_LABEL_KEY[code]) : code)

  const handleDelete = (record: CertificateItem) => {
    Modal.confirm({
      title: t('hrCert.confirmDeleteTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hrCert.reqNo')}：</span><b>{record.reqNo}</b></div>
          <div className="confirm-info-row"><span>{t('hrCert.certType')}：</span><b>{typeLabel(record.certType)}</b></div>
          <div className="confirm-info-row"><span>{t('hrCert.purpose')}：</span><b>{record.purpose}</b></div>
        </div>
      ),
      okText: t('common.delete'), okButtonProps: { danger: true }, cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteCertificate(record.id)
        message.success(t('hrCert.deleted'))
        refresh()
      },
    })
  }

  const columns = useMemo<TableColumnsType<CertificateItem>>(() => [
    { title: t('hrCert.reqNo'), dataIndex: 'reqNo', key: 'reqNo', width: 150, fixed: 'left' },
    {
      title: t('hrCert.certType'), dataIndex: 'certType', key: 'certType', width: 120,
      render: (v: string) => <Tag color="cyan">{typeLabel(v)}</Tag>,
    },
    { title: t('hrCert.purpose'), dataIndex: 'purpose', key: 'purpose', width: 200, render: (v: string) => v || '-' },
    { title: t('hrCert.recipient'), dataIndex: 'recipient', key: 'recipient', width: 170, render: (v: string) => v || '-' },
    { title: t('hrCert.copies'), dataIndex: 'copies', key: 'copies', width: 90, render: (v: number) => `${v} ${t('hrCert.copyUnit')}` },
    {
      title: t('hrCert.expectDate'), dataIndex: 'expectDate', key: 'expectDate', width: 120,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD') : '-'),
    },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 110,
      render: (v: string) => <Tag color={CERT_STATUS_TAG_COLOR[v]}>{statusLabel(v)}</Tag>,
    },
    { title: t('hrLeave.flowNo'), dataIndex: 'flowNo', key: 'flowNo', width: 150, render: (v: string) => v || '-' },
    {
      title: t('common.colCreateTime'), dataIndex: 'createdAt', key: 'createdAt', width: 175,
      render: (v: string) => (v ? <span style={{ whiteSpace: 'nowrap' }}>{dayjs(v).format('YYYY-MM-DD HH:mm:ss')}</span> : '-'),
    },
    {
      title: t('common.colAction'), key: 'action', width: 190, fixed: 'right',
      render: (_, r) => {
        const editable = CERT_EDITABLE.includes(r.status)
        return (
          <Space size={0}>
            <Button type="link" size="small" onClick={() => navigate(`${CERT_LIST_PATH}-detail?id=${r.id}`)}>{t('common.detail')}</Button>
            {canEdit && editable && (<><span className="action-split">|</span>
              <Button type="link" size="small" onClick={() => navigate(`${CERT_FORM_PATH}?id=${r.id}`)}>{t('common.edit')}</Button></>)}
            {canDelete && editable && (<><span className="action-split">|</span>
              <Button type="link" size="small" className="ant-btn-dangerous" onClick={() => handleDelete(r)}>{t('common.delete')}</Button></>)}
          </Space>
        )
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, page, status, keyword, canEdit, canDelete])

  const { configComponent, applyConfig } = useColumnConfig('ess-certificate',
    columns.map(c => ({ key: String(c.key), title: String(c.title) })),
    [{ key: 'action', visible: true, locked: 'tail' }])

  return (
    <div className="content-area">
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('hrLeave.keyword')} name="keyword">
            <Input placeholder={t('hrCert.keywordPlaceholder')} allowClear
              onPressEnter={() => { setKeyword(form.getFieldValue('keyword')?.trim() || undefined); setPage(1) }} />
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
        <div className="action-section-left" />
        <div className="action-section-right">
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(CERT_FORM_PATH)}>
              {t('hrCert.apply')}
            </Button>
          )}
          {configComponent}
        </div>
      </div>

      <Tabs
        activeKey={status}
        items={CERT_STATUS_TABS.map(key => ({
          key,
          label: key === 'all'
            ? `${t('hrCert.statusAll')} (${stats.all ?? 0})`
            : `${statusLabel(key)} (${stats[key] ?? 0})`,
        }))}
        onChange={key => { setStatus(key); setPage(1) }}
        style={{ marginBottom: 0 }}
      />

      <Table<CertificateItem>
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
