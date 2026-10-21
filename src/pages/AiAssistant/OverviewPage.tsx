import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Empty, Space, Tag, message } from 'antd'
import { ReloadOutlined, RightOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchAssistantOverview, type AiAssistantOverview } from '../../api/aiOverview'
import AiAssistantPageShell from './PageShell'

const TYPE_LABEL: Record<string, string> = {
  capability: '能力清單',
  prompt: '回答骨架',
  glossary: '術語與口徑',
  knowledge: '知識庫',
  guardrail: '合規護欄',
  quick_prompt: '快捷提問',
  push_template: '推送模板',
  runtime_setting: '記憶策略',
}

/** 审计动作枚举 → 繁中文案；未知值原样展示，不丢信息 */
const ACTION_LABEL: Record<string, string> = {
  create: '新增',
  update: '修改',
  publish: '發布',
  rollback: '回滾',
  delete: '刪除',
  status: '啟停',
  rebuild: '重建分塊',
}

function formatTime(value?: string | number | null) {
  if (value === null || value === undefined) return '--'
  if (typeof value === 'number') return new Date(value).toLocaleString('zh-TW', { hour12: false })
  return String(value).replace('T', ' ').slice(0, 19)
}

/** AI 助手概览：后端按权限收敛，前端只渲染返回的卡片。 */
export default function OverviewPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [data, setData] = useState<AiAssistantOverview | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetchAssistantOverview()
      .then(setData)
      .catch(() => message.error(t('aiAssistantConfig.loadFailed', { defaultValue: '加載失敗' })))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => { load() }, [load])

  return (
    <AiAssistantPageShell
      title={t('aiAssistantConfig.pageOverview', { defaultValue: '助手概覽' })}
      intro={t('aiAssistantConfig.introOverview', {
        defaultValue: '只展示你有權限的模組；點擊卡片進入對應配置頁。',
      })}
      backTo="/"
    >
      <div className="action-section" style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={load}>
          {t('common.refresh', { defaultValue: '刷新' })}
        </Button>
      </div>

      {!!data?.issues?.length && (
        <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
          {data.issues.map((issue, index) => (
            <Alert
              key={`${issue.text}-${index}`}
              type={issue.tone === 'danger' ? 'error' : issue.tone === 'warning' ? 'warning' : 'info'}
              showIcon
              message={issue.text}
              action={(
                <Button size="small" type="link" onClick={() => navigate(issue.route)}>
                  {t('aiAssistantConfig.goFix', { defaultValue: '去處理' })}
                </Button>
              )}
            />
          ))}
        </Space>
      )}

      {data && data.areas.length === 0 ? (
        <Empty description={t('aiAssistantConfig.overviewEmpty', { defaultValue: '暫無可用的 AI 助手配置項' })} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {(data?.areas ?? []).map((area) => (
            <button
              type="button"
              key={area.key}
              onClick={() => navigate(area.route)}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                border: '1px solid #e8eaed',
                borderRadius: 10,
                background: '#fff',
                padding: '16px 18px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{area.title}</span>
                <RightOutlined style={{ color: '#bfbfbf' }} />
              </div>
              <div style={{ color: '#8c8c8c', fontSize: 12, margin: '6px 0 12px' }}>{area.description}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: '#E8720C' }}>{area.value}</span>
                <span style={{ color: '#595959', fontSize: 12 }}>{area.unit}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {data?.canViewAudit && (
        <div style={{ marginTop: 20, border: '1px solid #e8eaed', borderRadius: 10, background: '#fff', padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{t('aiAssistantConfig.recentChanges', { defaultValue: '最近變更' })}</span>
            <Button type="link" size="small" onClick={() => navigate('/ai-assistant/audit')}>
              {t('aiAssistantConfig.viewAll', { defaultValue: '查看全部' })}
            </Button>
          </div>
          {(data.recentChanges ?? []).length === 0 ? (
            <div style={{ color: '#8c8c8c' }}>{t('aiAssistantConfig.auditEmpty', { defaultValue: '暫無變更記錄' })}</div>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              {data.recentChanges.map((row) => (
                <div key={row.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
                  <Tag>{TYPE_LABEL[row.configType] ?? row.configType}</Tag>
                  <b style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.configKey}</b>
                  <span style={{ color: '#595959' }}>{ACTION_LABEL[row.action] ?? row.action}</span>
                  <span style={{ color: '#8c8c8c' }}>{row.operator}</span>
                  <span style={{ color: '#bfbfbf' }}>{formatTime(row.createdAt)}</span>
                </div>
              ))}
            </Space>
          )}
        </div>
      )}
    </AiAssistantPageShell>
  )
}
