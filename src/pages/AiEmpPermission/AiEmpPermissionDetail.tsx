import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, InputNumber, Progress, Space, Spin, Switch, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, TeamOutlined, SafetyOutlined, WalletOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DetailPageHeader from '../../components/DetailPageHeader'
import {
  fetchMockEmpPermissions,
  SOURCE_LABEL,
  SOURCE_TAG_COLOR,
  type EmpPermissionSummary,
  type EmpModelPermission,
  type EmpQuotaGrant,
} from '../../api/mock/aiEmpPermissionMock'

/* ══════════ 展示常量 ══════════ */

const QUOTA_TYPE_LABEL: Record<string, string> = { token: 'tokens', request: 'requests' }
const QUOTA_PERIOD_LABEL: Record<string, string> = { daily: '日', monthly: '月' }
const OVER_LIMIT_LABEL: Record<string, string> = { reject: '拒絕', approve: '需審批', downgrade: '降級' }

/** 能力開關標籤 */
const CAPABILITY_FIELDS: { key: keyof Pick<EmpModelPermission, 'visionSupport' | 'functionCalling' | 'jsonMode' | 'streaming' | 'thinkingMode'>; label: string; color: string }[] = [
  { key: 'visionSupport', label: '視覺', color: '#722ED1' },
  { key: 'functionCalling', label: '工具', color: '#1890FF' },
  { key: 'jsonMode', label: 'JSON', color: '#13C2C2' },
  { key: 'streaming', label: '流式', color: '#52C41A' },
  { key: 'thinkingMode', label: '思考', color: '#E8720C' },
]

/* ══════════ 組件 ══════════ */

/**
 * 員工AI權限 — 詳情/編輯頁
 * 分區：基本信息 → 模型權限列表 → 額度明細
 * 管理員可直接禁用模型、調整額度
 */
export default function AiEmpPermissionDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const empId = searchParams.get('empId')

  const [loading, setLoading] = useState(true)
  const [emp, setEmp] = useState<EmpPermissionSummary | null>(null)

  /* ── 加載數據 ── */
  useEffect(() => {
    if (!empId) {
      message.error('缺少員工 ID')
      navigate('/ai-emp-permission')
      return
    }
    let cancelled = false
    setLoading(true)
    fetchMockEmpPermissions()
      .then((list) => {
        if (cancelled) return
        const found = list.find((r) => r.employeeId === Number(empId))
        setEmp(found ?? null)
        if (!found) message.error('員工權限數據不存在')
      })
      .catch(() => { if (!cancelled) message.error('加載失敗') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [empId, navigate])

  /* ── 本地操作（mock：直接修改 state） ── */
  const [modelPerms, setModelPerms] = useState<EmpModelPermission[]>([])
  const [quotaGrants, setQuotaGrants] = useState<EmpQuotaGrant[]>([])

  useEffect(() => {
    if (emp) {
      setModelPerms(emp.modelPermissions)
      setQuotaGrants(emp.quotaGrants)
    }
  }, [emp])

  /** 切換模型啟用/禁用 */
  const handleToggleModel = useCallback((modelId: number, checked: boolean) => {
    setModelPerms((prev) => prev.map((m) =>
      m.modelId === modelId ? { ...m, status: checked ? 1 : 0 } : m
    ))
    message.success(checked ? '已啟用' : '已禁用')
  }, [])

  /** 調整額度值 */
  const handleAdjustQuota = useCallback((id: number, newValue: number) => {
    setQuotaGrants((prev) => prev.map((q) =>
      q.id === id ? { ...q, quotaValue: newValue } : q
    ))
    message.success('額度已調整')
  }, [])

  /** 切換額度啟用/停用 */
  const handleToggleQuota = useCallback((id: number, checked: boolean) => {
    setQuotaGrants((prev) => prev.map((q) =>
      q.id === id ? { ...q, status: checked ? 1 : 0 } : q
    ))
    message.success(checked ? '已啟用' : '已停用')
  }, [])

  /* ── 統計 ── */
  const stats = useMemo(() => {
    const activeModels = modelPerms.filter((m) => m.status === 1)
    const activeQuotas = quotaGrants.filter((q) => q.status === 1)
    const sources = new Set(modelPerms.map((m) => m.source))
    return { activeModels: activeModels.length, totalModels: modelPerms.length, activeQuotas: activeQuotas.length, sources }
  }, [modelPerms, quotaGrants])

  if (loading) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!emp) {
    return (
      <div className="content-area" style={{ textAlign: 'center', padding: 80 }}>
        <div style={{ fontSize: 16, color: '#8C8C8C' }}>員工權限數據不存在</div>
        <Button style={{ marginTop: 16 }} onClick={() => navigate('/ai-emp-permission')}>返回列表</Button>
      </div>
    )
  }

  /* ── 模型權限列定義 ── */
  const modelColumns: ColumnsType<EmpModelPermission> = [
    {
      title: '模型', key: 'model', width: 180,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.modelName}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>ID: {r.modelId}</div>
        </div>
      ),
    },
    {
      title: '授權來源', key: 'source', width: 160,
      render: (_, r) => (
        <div>
          <Tag color={SOURCE_TAG_COLOR[r.source]}>{SOURCE_LABEL[r.source]}</Tag>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{r.sourceDesc}</div>
        </div>
      ),
    },
    {
      title: '能力', key: 'capabilities', width: 260,
      render: (_, r) => (
        <Space size={4} wrap>
          {CAPABILITY_FIELDS.map((f) => (
            <Tag
              key={f.key}
              color={r[f.key] ? f.color : undefined}
              style={{ margin: 0, fontSize: 11, opacity: r[f.key] ? 1 : 0.35 }}
            >
              {f.label}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '狀態', key: 'status', width: 80, align: 'center',
      render: (_, r) => (
        <Tag color={r.status === 1 ? 'success' : 'default'}>{r.status === 1 ? '啟用' : '已禁用'}</Tag>
      ),
    },
    {
      title: '授權時間', dataIndex: 'grantedAt', width: 120,
      render: (v: string) => v ? v.slice(0, 10) : '--',
    },
    {
      title: '操作', key: 'action', width: 80, align: 'center', fixed: 'right',
      render: (_, r) => (
        <Switch
          size="small"
          checked={r.status === 1}
          onChange={(checked) => handleToggleModel(r.modelId, checked)}
          checkedChildren="啟用"
          unCheckedChildren="禁用"
        />
      ),
    },
  ]

  /* ── 額度明細列定義 ── */
  const quotaColumns: ColumnsType<EmpQuotaGrant> = [
    {
      title: '來源', key: 'source', width: 150,
      render: (_, r) => (
        <div>
          <Tag color={SOURCE_TAG_COLOR[r.source]}>{SOURCE_LABEL[r.source]}</Tag>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{r.sourceDesc}</div>
        </div>
      ),
    },
    {
      title: '額度類型', key: 'quotaType', width: 120,
      render: (_, r) => (
        <span>{QUOTA_TYPE_LABEL[r.quotaType]} / {QUOTA_PERIOD_LABEL[r.quotaPeriod]}</span>
      ),
    },
    {
      title: '額度值', key: 'quotaValue', width: 180,
      render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <InputNumber
            size="small"
            value={r.quotaValue}
            min={0}
            step={100}
            onChange={(v) => v != null && handleAdjustQuota(r.id, v)}
            style={{ width: 100 }}
          />
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{QUOTA_TYPE_LABEL[r.quotaType]}</span>
        </div>
      ),
    },
    {
      title: '使用情況', key: 'usage', width: 180,
      render: (_, r) => {
        const pct = r.quotaValue > 0 ? Math.min(Math.floor((r.usedValue / r.quotaValue) * 100), 100) : 0
        const color = pct >= 90 ? '#FF4D4F' : pct >= 70 ? '#FAAD14' : '#52C41A'
        return (
          <div>
            <Progress percent={pct} size="small" strokeColor={color} style={{ marginBottom: 2 }} />
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>
              {r.usedValue.toLocaleString()} / {r.quotaValue.toLocaleString()}
            </div>
          </div>
        )
      },
    },
    {
      title: '有效期', key: 'validity', width: 140,
      render: (_, r) => {
        if (r.effectiveType === 'permanent') return <Tag>永久</Tag>
        return (
          <div>
            <Tag color="orange">臨時</Tag>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>至 {r.expireAt?.slice(0, 10) ?? '--'}</div>
          </div>
        )
      },
    },
    {
      title: '超額動作', dataIndex: 'overLimitAction', width: 100,
      render: (v: string | null) => v ? OVER_LIMIT_LABEL[v] || v : '--',
    },
    {
      title: '狀態', key: 'status', width: 80, align: 'center',
      render: (_, r) => (
        <Tag color={r.status === 1 ? 'success' : 'default'}>{r.status === 1 ? '啟用' : '已停用'}</Tag>
      ),
    },
    {
      title: '操作', key: 'action', width: 80, align: 'center', fixed: 'right',
      render: (_, r) => (
        <Switch
          size="small"
          checked={r.status === 1}
          onChange={(checked) => handleToggleQuota(r.id, checked)}
          checkedChildren="啟用"
          unCheckedChildren="停用"
        />
      ),
    },
  ]

  return (
    <>
      {/* ====== 頭部 ====== */}
      <DetailPageHeader
        title={
          <>
            <TeamOutlined style={{ marginRight: 8, color: '#E8720C' }} />
            <span style={{ fontSize: 17, fontWeight: 600, color: '#262626' }}>員工AI權限</span>
          </>
        }
        onBack={() => navigate('/ai-emp-permission')}
        tags={
          <>
            <span style={{ fontSize: 13, color: '#8C8C8C' }}>{emp.empId}</span>
            <span style={{ fontSize: 13, color: '#595959', fontWeight: 500, marginLeft: 8 }}>{emp.employeeName}</span>
            <Tag color="blue" style={{ marginLeft: 8 }}>{emp.department}</Tag>
            <span style={{ fontSize: 13, color: '#8C8C8C', marginLeft: 4 }}>{emp.position}</span>
          </>
        }
      />

      {/* ====== 統計概覽 ====== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        {[
          { icon: <SafetyOutlined />, label: '可用模型', value: stats.activeModels, sub: `共 ${stats.totalModels} 個授權`, color: '#1890FF', bg: '#E6F7FF' },
          { icon: <WalletOutlined />, label: '有效額度', value: stats.activeQuotas, sub: '條額度記錄', color: '#52C41A', bg: '#F6FFED' },
          { icon: <TeamOutlined />, label: '授權來源', value: stats.sources.size, sub: '種配置來源', color: '#722ED1', bg: '#F9F0FF' },
          { icon: <ArrowLeftOutlined />, label: '最近授予', value: null, sub: emp.lastGrantedAt?.slice(0, 10) ?? '--', color: '#E8720C', bg: '#FFF7E6' },
        ].map((card, i) => (
          <div
            key={i}
            style={{
              borderRadius: 12, padding: 16, background: card.bg,
              border: `1px solid ${card.color}22`, textAlign: 'center',
              position: 'relative', overflow: 'hidden',
              transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'default',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = ''
              e.currentTarget.style.boxShadow = ''
            }}
          >
            <div style={{ fontSize: 20, color: card.color, marginBottom: 4 }}>{card.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>
              {card.value != null ? card.value : ''}
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>{card.label}</div>
            <div style={{ fontSize: 11, color: '#BFBFBF', marginTop: 2 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ====== 模型權限 ====== */}
      <div className="content-area" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#262626', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <SafetyOutlined style={{ color: '#1890FF' }} />
          模型權限（{modelPerms.filter((m) => m.status === 1).length}/{modelPerms.length}）
        </div>
        <Table<EmpModelPermission>
          rowKey="modelId"
          columns={modelColumns}
          dataSource={modelPerms}
          pagination={false}
          size="small"
          scroll={{ x: 900 }}
        />
      </div>

      {/* ====== 額度明細 ====== */}
      <div className="content-area">
        <div style={{ fontSize: 15, fontWeight: 600, color: '#262626', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <WalletOutlined style={{ color: '#52C41A' }} />
          額度明細（{quotaGrants.filter((q) => q.status === 1).length} 條有效）
        </div>
        <Table<EmpQuotaGrant>
          rowKey="id"
          columns={quotaColumns}
          dataSource={quotaGrants}
          pagination={false}
          size="small"
          scroll={{ x: 1000 }}
        />
      </div>
    </>
  )
}
