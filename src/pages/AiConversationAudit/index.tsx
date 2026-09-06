import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, DatePicker, Form, Pagination, Select, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import {
  SearchOutlined,
  ReloadOutlined,
  MessageOutlined,
  RobotOutlined,
  AppstoreOutlined,
} from '@ant-design/icons'
import {
  fetchAuditConversations,
  fetchAuditModelKeys,
  fetchAuditUsernames,
} from '../../api/aiConversation'
import type { AiConversation, AuditPageResult } from '../../api/aiConversation'

const { RangePicker } = DatePicker

/** 格式化时间 */
const formatTime = (value: string | null) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '--')

/** 格式化 tokens 数 */
const formatTokens = (tokens: number) => {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}

/** 消息预览（取前 50 字符） */
const getMessagePreview = (messagesJson: string): string => {
  try {
    const messages = JSON.parse(messagesJson)
    if (!Array.isArray(messages) || messages.length === 0) return '--'
    const firstUserMsg = messages.find((m: { role: string }) => m.role === 'user')
    if (!firstUserMsg?.content) return '--'
    const text = firstUserMsg.content
    return text.length > 50 ? `${text.slice(0, 50)}...` : text
  } catch {
    return '--'
  }
}

export default function AiConversationAudit() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchForm] = Form.useForm()

  /* ── 查询条件 ── */
  const [dates, setDates] = useState<[Dayjs, Dayjs] | null>(null)
  const [username, setUsername] = useState<string | undefined>(undefined)
  const [modelKey, setModelKey] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  /* ─ 数据 ── */
  const [result, setResult] = useState<AuditPageResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [userOptions, setUserOptions] = useState<{ value: string; label: string }[]>([])
  const [modelOptions, setModelOptions] = useState<{ value: string; label: string }[]>([])

  /** 加载筛选选项 */
  useEffect(() => {
    fetchAuditUsernames().then((list) => {
      setUserOptions(list.map((u) => ({ value: u, label: u })))
    }).catch(() => {})
    fetchAuditModelKeys().then((list) => {
      setModelOptions(list.map((m) => ({ value: m, label: m })))
    }).catch(() => {})
  }, [])

  /** 查询参数 */
  const queryParams = useCallback(() => ({
    page,
    size: pageSize,
    username,
    modelKey,
    startDate: dates?.[0]?.format('YYYY-MM-DD'),
    endDate: dates?.[1]?.format('YYYY-MM-DD'),
  }), [page, pageSize, username, modelKey, dates])

  /** 加载数据 */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAuditConversations(queryParams()).then((data) => {
      if (!cancelled) setResult(data)
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [queryParams])

  const handleSearch = () => {
    setPage(1)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setDates(null)
    setUsername(undefined)
    setModelKey(undefined)
    setPage(1)
  }

  /* ── 表格列定义 ── */
  const columns: ColumnsType<AiConversation> = [
    {
      title: t('conversationAudit.colId'),
      dataIndex: 'conversationId',
      width: 170,
      align: 'center',
      render: (v: string | null) => <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#8c8c8c' }}>{v || '--'}</span>,
    },
    {
      title: t('conversationAudit.colUsername'),
      dataIndex: 'username',
      width: 120,
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: t('conversationAudit.colTitle'),
      dataIndex: 'title',
      width: 180,
      ellipsis: true,
    },
    {
      title: t('conversationAudit.colModel'),
      dataIndex: 'modelKey',
      width: 140,
      render: (v: string | null) => v ? <Tag color="green">{v}</Tag> : <span style={{ color: '#BFBFBF' }}>--</span>,
    },
    {
      title: t('conversationAudit.colTokens'),
      dataIndex: 'totalTokens',
      width: 100,
      align: 'right',
      render: (v: number) => v > 0 ? formatTokens(v) : <span style={{ color: '#BFBFBF' }}>--</span>,
    },
    {
      title: t('conversationAudit.colRequests'),
      dataIndex: 'requestCount',
      width: 90,
      align: 'right',
      render: (v: number) => v > 0 ? v : <span style={{ color: '#BFBFBF' }}>--</span>,
    },
    {
      title: t('conversationAudit.colPreview'),
      key: 'preview',
      width: 200,
      ellipsis: true,
      render: (_, row) => getMessagePreview(row.messages),
    },
    {
      title: t('conversationAudit.colStatus'),
      dataIndex: 'deleted',
      width: 90,
      align: 'center',
      filters: [
        { text: t('conversationAudit.statusActive'), value: 0 },
        { text: t('conversationAudit.statusTrashed'), value: 1 },
        { text: t('conversationAudit.statusPurged'), value: 2 },
      ],
      onFilter: (value, record) => record.deleted === value,
      render: (v: number) => {
        if (v === 1) return <Tag color="orange">{t('conversationAudit.statusTrashed')}</Tag>
        if (v === 2) return <Tag color="red">{t('conversationAudit.statusPurged')}</Tag>
        return <Tag color="green">{t('conversationAudit.statusActive')}</Tag>
      },
    },
    {
      title: t('conversationAudit.colCreatedAt'),
      dataIndex: 'createdAt',
      width: 170,
      render: formatTime,
    },
    {
      title: t('conversationAudit.colUpdatedAt'),
      dataIndex: 'updatedAt',
      width: 170,
      render: formatTime,
    },
    {
      title: t('conversationAudit.colAction'),
      key: 'action',
      width: 100,
      align: 'center',
      render: (_, row) => (
        <Button
          type="link"
          size="small"
          onClick={() => navigate(`/ai-conversation-audit/${row.id}`)}
        >
          {t('conversationAudit.viewDetail')}
        </Button>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 搜索区 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label={t('conversationAudit.filterUsername')} name="username">
            <Select
              value={username}
              placeholder={t('conversationAudit.filterUsername')}
              allowClear
              showSearch
              optionFilterProp="label"
              options={userOptions}
              onChange={(value) => setUsername(value)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label={t('conversationAudit.filterModel')} name="modelKey">
            <Select
              value={modelKey}
              placeholder={t('conversationAudit.filterModel')}
              allowClear
              showSearch
              optionFilterProp="label"
              options={modelOptions}
              onChange={(value) => setModelKey(value)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label={t('conversationAudit.filterDate')} name="dateRange">
            <RangePicker
              value={dates}
              allowClear
              onChange={(values) => {
                if (values && values[0] && values[1]) {
                  setDates([values[0], values[1]])
                } else {
                  setDates(null)
                }
              }}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                {t('common.search')}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                {t('common.reset')}
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 统计摘要 */}
      {result && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div style={{
            flex: 1, padding: '16px 20px', borderRadius: 10,
            background: '#E6F7FF', border: '1px solid rgba(24,144,255,0.12)',
            display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(24,144,255,0.12)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <MessageOutlined style={{ color: '#1890FF', fontSize: 20 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#8C8C8C' }}>{t('conversationAudit.totalConversations')}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1890FF' }}>{result.total}</div>
            </div>
          </div>
          <div style={{
            flex: 1, padding: '16px 20px', borderRadius: 10,
            background: '#F6FFED', border: '1px solid rgba(82,196,26,0.12)',
            display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(82,196,26,0.12)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <RobotOutlined style={{ color: '#52C41A', fontSize: 20 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#8C8C8C' }}>{t('conversationAudit.totalUsers')}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#52C41A' }}>{userOptions.length}</div>
            </div>
          </div>
          <div style={{
            flex: 1, padding: '16px 20px', borderRadius: 10,
            background: '#FFF7E6', border: '1px solid rgba(232,114,12,0.12)',
            display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(232,114,12,0.12)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <AppstoreOutlined style={{ color: '#E8720C', fontSize: 20 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#8C8C8C' }}>{t('conversationAudit.totalModels')}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#E8720C' }}>{modelOptions.length}</div>
            </div>
          </div>
        </div>
      )}

      {/* 表格 */}
      <div className="table-section">
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={result?.records ?? []}
          pagination={false}
          scroll={{ x: 1550 }}
        />
      </div>

      {/* 分页 */}
      {result && result.total > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Pagination
            current={result.current}
            pageSize={result.size}
            total={result.total}
            showSizeChanger
            showTotal={(total) => t('common.totalRecords', { count: total })}
            onChange={(p, ps) => {
              setPage(p)
              setPageSize(ps)
            }}
          />
        </div>
      )}
    </div>
  )
}
