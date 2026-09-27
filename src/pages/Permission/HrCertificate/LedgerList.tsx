import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Select, Space, Table, Tabs, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  CERT_ISSUE_PATH, CERT_LEDGER_PATH, fetchCertificateLedger, fetchCertificateLedgerStats,
  type CertificateItem,
} from '../../../api/hrCertificate'
import {
  CERT_LANG_LABEL_KEY, CERT_PICKUP_LABEL_KEY, CERT_STATUS_LABEL_KEY, CERT_STATUS_TABS,
  CERT_STATUS_TAG_COLOR, CERT_TYPE_LABEL_KEY, CERT_TYPE_ORDER,
} from '../../Ess/meta'

/**
 * 證明開具台账（人事视角）：跨员工查看申请、筛选待开具、登记实际出具信息。
 * <p>
 * 与员工自助页共用后端服务但权限不同：本页要求 hr-certificate 菜单，
 * 自助页只能看本人。登记开具后单据才进入「已開具」。
 */
export default function CertificateLedger() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canIssue = hasPermission('hr-certificate:edit')

  const [rows, setRows] = useState<CertificateItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [status, setStatus] = useState('all')
  const [certType, setCertType] = useState<string>()
  const [keyword, setKeyword] = useState<string>()
  const [stats, setStats] = useState<Record<string, number>>({})
  const [form] = Form.useForm<{ keyword?: string; certType?: string }>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchCertificateLedger({
        page, size, keyword: keyword || undefined, certType,
        status: status === 'all' ? undefined : status,
      })
      setRows(res.records || [])
      setTotal(res.total || 0)
    } catch {
      // 请求层已统一提示
    } finally {
      setLoading(false)
    }
  }, [page, size, status, certType, keyword])

  const loadStats = useCallback(() => {
    fetchCertificateLedgerStats().then(setStats).catch(() => setStats({}))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadStats() }, [loadStats])

  const typeLabel = (code: string) => (CERT_TYPE_LABEL_KEY[code] ? t(CERT_TYPE_LABEL_KEY[code]) : code)
  const statusLabel = (code: string) => (CERT_STATUS_LABEL_KEY[code] ? t(CERT_STATUS_LABEL_KEY[code]) : code)
  const pickupLabel = (code?: string | null) => {
    if (!code) return '-'
    return CERT_PICKUP_LABEL_KEY[code] ? t(CERT_PICKUP_LABEL_KEY[code]) : code
  }

  const columns = useMemo<TableColumnsType<CertificateItem>>(() => [
    { title: t('hrCert.reqNo'), dataIndex: 'reqNo', key: 'reqNo', width: 150, fixed: 'left' },
    {
      title: t('hrCert.applicant'), key: 'emp', width: 160,
      render: (_, r) => (
        <Space size={4}>
          <span>{r.empName}</span>
          {r.empNo && <span style={{ color: '#8C8C8C' }}>({r.empNo})</span>}
        </Space>
      ),
    },
    { title: t('hrLeave.dept'), dataIndex: 'deptName', key: 'deptName', width: 150, render: (v: string) => v || '-' },
    {
      title: t('hrCert.certType'), dataIndex: 'certType', key: 'certType', width: 120,
      render: (v: string) => <Tag color="cyan">{typeLabel(v)}</Tag>,
    },
    { title: t('hrCert.purpose'), dataIndex: 'purpose', key: 'purpose', width: 180, render: (v: string) => v || '-' },
    { title: t('hrCert.recipient'), dataIndex: 'recipient', key: 'recipient', width: 160, render: (v: string) => v || '-' },
    {
      title: t('hrCert.language'), dataIndex: 'language', key: 'language', width: 110,
      render: (v: string) => (CERT_LANG_LABEL_KEY[v] ? t(CERT_LANG_LABEL_KEY[v]) : v || '-'),
    },
    {
      title: t('hrCert.copies'), dataIndex: 'copies', key: 'copies', width: 90,
      render: (v: number) => `${v} ${t('hrCert.copyUnit')}`,
    },
    { title: t('hrCert.certNo'), dataIndex: 'certNo', key: 'certNo', width: 140, render: (v: string) => v || '-' },
    {
      title: t('hrCert.issueDate'), dataIndex: 'issueDate', key: 'issueDate', width: 120,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD') : '-'),
    },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={CERT_STATUS_TAG_COLOR[v]}>{statusLabel(v)}</Tag>,
    },
    {
      title: t('common.colAction'), key: 'action', width: 170, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => navigate(`${CERT_LEDGER_PATH}-detail?id=${r.id}&from=ledger`)}>
            {t('common.detail')}
          </Button>
          {canIssue && r.status === 'approved' && (<>
            <span className="action-split">|</span>
            <Button type="link" size="small" onClick={() => navigate(`${CERT_ISSUE_PATH}?id=${r.id}`)}>
              {t('hrCert.issue')}
            </Button>
          </>)}
          {canIssue && r.status === 'completed' && r.pickupType && (<>
            <span className="action-split">|</span>
            <span style={{ color: '#8C8C8C', fontSize: 12 }}>{pickupLabel(r.pickupType)}</span>
          </>)}
        </Space>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, page, status, certType, keyword, canIssue, navigate])

  const { configComponent, applyConfig } = useColumnConfig('hr-certificate',
    columns.map(c => ({ key: String(c.key), title: String(c.title) })),
    [{ key: 'action', visible: true, locked: 'tail' }])

  return (
    <div className="content-area">
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('hrLeave.keyword')} name="keyword">
            <Input placeholder={t('hrCert.ledgerKeywordPlaceholder')} allowClear
              onPressEnter={() => { setKeyword(form.getFieldValue('keyword')?.trim() || undefined); setPage(1) }} />
          </Form.Item>
          <Form.Item label={t('hrCert.certType')} name="certType">
            <Select style={{ width: 150 }} allowClear placeholder={t('common.pleaseSelect')}
              options={CERT_TYPE_ORDER.map(code => ({ value: code, label: typeLabel(code) }))} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}
                onClick={() => {
                  setKeyword(form.getFieldValue('keyword')?.trim() || undefined)
                  setCertType(form.getFieldValue('certType') || undefined)
                  setPage(1)
                }}>
                {t('common.search')}
              </Button>
              <Button icon={<ReloadOutlined />}
                onClick={() => { form.resetFields(); setKeyword(undefined); setCertType(undefined); setPage(1) }}>
                {t('common.reset')}
              </Button>
            </div>
          </Form.Item>
        </Form>
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

      <div className="action-section">
        <div className="action-section-left">
          {canIssue && (stats.approved ?? 0) > 0 && (
            <Button type="primary" onClick={() => { setStatus('approved'); setPage(1) }}>
              {t('hrCert.pendingIssueCount', { count: stats.approved })}
            </Button>
          )}
        </div>
        <div className="action-section-right">{configComponent}</div>
      </div>

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
