import { useCallback, useEffect, useState } from 'react'
import { Button, DatePicker, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import { ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchConfigChanges, type AiConfigChangeRow } from '../../api/aiAudit'
import AiAssistantPageShell from './PageShell'

const TYPE_LABEL: Record<string, string> = {
  capability: '能力清單',
  prompt: '回答骨架',
  glossary: '術語與口徑',
  knowledge: '知識庫',
  guardrail: '合規護欄',
}

const ACTION_LABEL: Record<string, string> = {
  create: '新增',
  update: '修改',
  publish: '發布',
  rollback: '回滾',
  delete: '刪除',
  status: '啟停',
  rebuild: '重建分塊',
}

function pretty(raw?: string | null) {
  if (!raw) return '--'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function formatTime(value?: string | number | null) {
  if (value === null || value === undefined) return '--'
  if (typeof value === 'number') return new Date(value).toLocaleString('zh-TW', { hour12: false })
  return String(value).replace('T', ' ').slice(0, 19)
}

/** 配置变更审计：只读；详情只展示后端截断后的 before/after，不提供回滚入口。 */
export default function AuditPage() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<AiConfigChangeRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [configType, setConfigType] = useState<string>()
  const [action, setAction] = useState<string>()
  const [keyword, setKeyword] = useState('')
  const [operator, setOperator] = useState('')
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [detail, setDetail] = useState<AiConfigChangeRow | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetchConfigChanges({
      configType,
      action,
      operator: operator.trim() || undefined,
      keyword: keyword.trim() || undefined,
      from: range?.[0]?.format('YYYY-MM-DDTHH:mm:ss'),
      to: range?.[1]?.format('YYYY-MM-DDTHH:mm:ss'),
      page,
      size: 20,
    })
      .then((res) => {
        setRows(res.records ?? [])
        setTotal(res.total ?? 0)
      })
      .catch(() => message.error(t('aiAssistantConfig.loadFailed', { defaultValue: '加載失敗' })))
      .finally(() => setLoading(false))
  }, [configType, action, operator, keyword, range, page, t])

  useEffect(() => { load() }, [load])

  const columns: ColumnsType<AiConfigChangeRow> = [
    {
      title: t('aiAssistantConfig.colFeedbackTime', { defaultValue: '時間' }),
      dataIndex: 'createdAt', key: 'createdAt', width: 170,
      render: (v) => formatTime(v),
    },
    {
      title: t('aiAssistantConfig.colType', { defaultValue: '類型' }),
      dataIndex: 'configType', key: 'configType', width: 110,
      render: (v: string) => <Tag>{TYPE_LABEL[v] ?? v}</Tag>,
    },
    {
      title: t('aiAssistantConfig.colConfigKey', { defaultValue: '對象' }),
      dataIndex: 'configKey', key: 'configKey', ellipsis: true,
    },
    {
      title: t('aiAssistantConfig.colAction', { defaultValue: '動作' }),
      dataIndex: 'action', key: 'action', width: 100,
      render: (v: string) => <Tag color={v === 'delete' ? 'error' : v === 'publish' ? 'success' : 'processing'}>
        {ACTION_LABEL[v] ?? v}
      </Tag>,
    },
    { title: t('aiAssistantConfig.colOperator', { defaultValue: '操作人' }), dataIndex: 'operator', key: 'operator', width: 140 },
    {
      title: t('common.action', { defaultValue: '操作' }), key: 'op', width: 80,
      render: (_, row) => (
        <Button type="link" size="small" onClick={() => setDetail(row)}>
          {t('aiAssistantConfig.viewDetail', { defaultValue: '詳情' })}
        </Button>
      ),
    },
  ]

  return (
    <AiAssistantPageShell
      title={t('aiAssistantConfig.pageAudit', { defaultValue: '變更審計' })}
      intro={t('aiAssistantConfig.introAudit', {
        defaultValue: '記錄能力、回答骨架、術語、知識庫與護欄的每次寫操作；審計只讀，回滾仍在各自配置頁執行。',
      })}
    >
      <div className="search-section" style={{ marginBottom: 8 }}>
        <Space wrap>
          <Select
            allowClear
            style={{ width: 140 }}
            placeholder={t('aiAssistantConfig.colType', { defaultValue: '類型' })}
            value={configType}
            onChange={(v) => { setConfigType(v); setPage(1) }}
            options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))}
          />
          <Select
            allowClear
            style={{ width: 130 }}
            placeholder={t('aiAssistantConfig.colAction', { defaultValue: '動作' })}
            value={action}
            onChange={(v) => { setAction(v); setPage(1) }}
            options={Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label }))}
          />
          <Input.Search
            allowClear
            style={{ width: 220 }}
            placeholder={t('aiAssistantConfig.auditKeyword', { defaultValue: '按對象搜索' })}
            onSearch={(v) => { setKeyword(v); setPage(1) }}
          />
          <Input
            allowClear
            style={{ width: 160 }}
            placeholder={t('aiAssistantConfig.colOperator', { defaultValue: '操作人' })}
            onChange={(e) => { setOperator(e.target.value); setPage(1) }}
          />
          <DatePicker.RangePicker
            showTime
            style={{ width: 360 }}
            onChange={(value) => { setRange(value as [Dayjs, Dayjs] | null); setPage(1) }}
          />
        </Space>
      </div>
      <div className="action-section" style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={load}>
          {t('common.refresh', { defaultValue: '刷新' })}
        </Button>
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{
          current: page,
          total,
          pageSize: 20,
          showSizeChanger: false,
          onChange: setPage,
        }}
        locale={{ emptyText: t('aiAssistantConfig.auditEmpty', { defaultValue: '暫無變更記錄' }) }}
      />
      <Modal
        open={!!detail}
        title={t('aiAssistantConfig.auditDetail', { defaultValue: '變更詳情' })}
        onCancel={() => setDetail(null)}
        footer={null}
        width={880}
        destroyOnHidden
      >
        {detail && (
          <div>
            <div style={{ marginBottom: 12, color: '#595959' }}>
              <Space wrap>
                <Tag>{TYPE_LABEL[detail.configType] ?? detail.configType}</Tag>
                <b>{detail.configKey}</b>
                <Tag color="processing">{ACTION_LABEL[detail.action] ?? detail.action}</Tag>
                <span>{detail.operator}</span>
                <span>{formatTime(detail.createdAt)}</span>
              </Space>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('aiAssistantConfig.auditBefore', { defaultValue: '變更前' })}</div>
                <pre style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6, padding: 12, maxHeight: 420, overflow: 'auto', fontSize: 12 }}>
                  {pretty(detail.beforeJson)}
                </pre>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('aiAssistantConfig.auditAfter', { defaultValue: '變更後' })}</div>
                <pre style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6, padding: 12, maxHeight: 420, overflow: 'auto', fontSize: 12 }}>
                  {pretty(detail.afterJson)}
                </pre>
              </div>
            </div>
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>
              {t('aiAssistantConfig.auditTruncated', {
                defaultValue: '審計內容最多保留 4000 字；完整正文以對應業務頁為準。',
              })}
            </div>
          </div>
        )}
      </Modal>
    </AiAssistantPageShell>
  )
}
