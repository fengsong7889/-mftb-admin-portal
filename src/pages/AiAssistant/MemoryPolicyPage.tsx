import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button, InputNumber, Switch, Tag, message } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  InfoCircleOutlined,
  SaveOutlined,
  SettingOutlined,
  StopOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  fetchMemoryStats,
  fetchRuntimeSettings,
  saveRuntimeSettings,
  type AiMemoryStats,
  type AiRuntimeSettingRow,
} from '@/api/aiRuntimeSetting'
import StatCards, { type StatCardItem } from '@/components/StatCards'
import { formatDateTime } from '@/utils/datetime'
import AiAssistantPageShell from './PageShell'

const KEY_LABEL: Record<string, string> = {
  'memory.max_count': '單人記憶上限',
  'memory.retention_days': '保留天數',
  'memory.prompt_top': '每次注入條數',
  'memory.auto_suggest': '自動記憶建議',
}

/** 模塊卡片標題行：28×28 色塊 + 15px/600 標題 + 右側延伸分隔線（§C.3） */
function CardTitle({
  icon,
  color,
  bg,
  title,
  tag,
  extra,
}: {
  icon: ReactNode
  color: string
  bg: string
  title: string
  tag?: ReactNode
  extra?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 14, color }}>{icon}</span>
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {tag}
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {extra}
    </div>
  )
}

/**
 * 记忆策略：运营可调上限/保留期/注入条数，并查看当前记忆体量。
 * <p>只影响“记忆怎么存/怎么用”，敏感内容过滤与按用户隔离仍在代码里，不随配置变化。
 */
export default function MemoryPolicyPage() {
  const [settings, setSettings] = useState<AiRuntimeSettingRow[]>([])
  const [stats, setStats] = useState<AiMemoryStats | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([fetchRuntimeSettings(), fetchMemoryStats()])
      .then(([rows, stat]) => {
        setSettings(rows)
        setStats(stat)
        setDraft(Object.fromEntries(rows.map((row) => [row.key, row.value])))
      })
      .catch(() => message.error('載入記憶策略失敗'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const dirty = useMemo(
    () => settings.some((row) => draft[row.key] !== undefined && draft[row.key] !== row.value),
    [settings, draft],
  )

  /** 最后更新时间：取已落库配置里最新的一条 */
  const lastUpdated = useMemo(() => {
    const rows = settings.filter((row) => row.updatedAt)
    if (rows.length === 0) return null
    const latest = rows.reduce((a, b) => (String(a.updatedAt) > String(b.updatedAt) ? a : b))
    return { by: latest.updatedBy || '--', at: formatDateTime(latest.updatedAt) }
  }, [settings])

  const save = async () => {
    const payload: Record<string, string> = {}
    for (const row of settings) {
      const value = draft[row.key] ?? row.value
      payload[row.key] = row.type === 'bool' ? (value === '1' ? '1' : '0') : value
    }
    setSaving(true)
    try {
      await saveRuntimeSettings(payload)
      message.success('已保存，下一次記憶寫入/回答時生效')
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  const statItems: StatCardItem[] = [
    { key: 'total', icon: <DatabaseOutlined />, value: stats?.total ?? 0, label: '記憶總數', color: 'info' },
    { key: 'active', icon: <CheckCircleOutlined />, value: stats?.active ?? 0, label: '生效中', color: 'success' },
    { key: 'disabled', icon: <StopOutlined />, value: stats?.disabled ?? 0, label: '已停用', color: 'system' },
    { key: 'expired', icon: <WarningOutlined />, value: stats?.expired ?? 0, label: '已過期', color: 'danger' },
    { key: 'expiring', icon: <ClockCircleOutlined />, value: stats?.expiring7d ?? 0, label: '7 天內到期', color: 'brand' },
    { key: 'users', icon: <TeamOutlined />, value: stats?.users ?? 0, label: '覆蓋人數', color: 'info' },
  ]

  return (
    <AiAssistantPageShell
      title="記憶策略"
      intro="記憶只保存使用者主動確認的偏好；上限、保留期與注入條數可在這裡調整，敏感內容過濾與按使用者隔離仍由服務端強制。"
    >
      {/* 卡片一：策略參數 */}
      <div className="detail-card">
        <CardTitle
          icon={<SettingOutlined />}
          color="#fa8c16"
          bg="#fff7e6"
          title="策略參數"
          tag={<Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>保存後生效</Tag>}
          extra={lastUpdated
            ? <span style={{ fontSize: 12, color: '#8c8c8c' }}>最後更新：{lastUpdated.by} · {lastUpdated.at}</span>
            : <span style={{ fontSize: 12, color: '#8c8c8c' }}>尚未調整過</span>}
        />

        <div style={{ display: 'grid', gap: 18 }}>
          {settings.map((row) => (
            <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 13, color: '#595959', minWidth: 112, textAlign: 'right', flexShrink: 0,
              }}>
                {KEY_LABEL[row.key] ?? row.key}
              </span>
              <div style={{ width: 168 }}>
                {row.type === 'bool' ? (
                  <Switch
                    checked={draft[row.key] === '1'}
                    checkedChildren="開啟"
                    unCheckedChildren="關閉"
                    onChange={(checked) =>
                      setDraft((prev) => ({ ...prev, [row.key]: checked ? '1' : '0' }))
                    }
                  />
                ) : (
                  <InputNumber
                    min={row.min}
                    max={row.max}
                    value={Number(draft[row.key] ?? row.value)}
                    onChange={(value) => {
                      // 超出范围时主动纠偏并提示：默认的静默截断会让人以为改成功了
                      const raw = value === null || value === undefined ? row.min : Number(value)
                      const clamped = Math.min(Math.max(raw, row.min), row.max)
                      if (raw !== clamped) {
                        message.warning(`已自動調整為 ${clamped}（範圍 ${row.min} ~ ${row.max}）`)
                      }
                      setDraft((prev) => ({ ...prev, [row.key]: String(clamped) }))
                    }}
                    style={{ width: '100%' }}
                  />
                )}
              </div>
              <span style={{ fontSize: 12, color: '#8c8c8c', flex: 1, minWidth: 240 }}>
                {row.remark}（範圍 {row.min} ~ {row.max}，默認 {row.defaultValue}）
              </span>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 20, display: 'flex', gap: 8, alignItems: 'flex-start',
          background: '#fff7f0', border: '1px solid #ffe7d1', borderRadius: 8, padding: '10px 12px',
        }}>
          <InfoCircleOutlined style={{ color: '#fa8c16', marginTop: 2 }} />
          <span style={{ fontSize: 12, color: '#8c8c8c', lineHeight: 1.7 }}>
            上限降低不會刪除已有記憶，只限制繼續新增；保留期只影響新寫入的記憶，已有記憶按原到期時間失效。
          </span>
        </div>
      </div>

      {/* 卡片二：記憶體量 */}
      <div className="detail-card">
        <CardTitle
          icon={<DatabaseOutlined />}
          color="#1890ff"
          bg="#e6f7ff"
          title="記憶體量"
          extra={<span style={{ fontSize: 12, color: '#8c8c8c' }}>統計口徑：全部員工</span>}
        />
        <StatCards items={statItems} columns={3} animationKey={stats?.total ?? 0} />
      </div>

      <div className="form-footer">
        <Button onClick={load} loading={loading} disabled={saving}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={save} loading={saving} disabled={!dirty}>
          保存
        </Button>
      </div>
    </AiAssistantPageShell>
  )
}
