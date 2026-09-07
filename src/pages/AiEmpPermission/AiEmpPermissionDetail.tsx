import { useCallback, useEffect, useState } from 'react'
import { Button, Input, InputNumber, Modal, Progress, Space, Spin, Switch, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SafetyOutlined, WalletOutlined, HistoryOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DetailPageHeader from '../../components/DetailPageHeader'
import {
  SOURCE_LABEL,
  SOURCE_TAG_COLOR,
  QUOTA_STATUS_LABEL,
  QUOTA_STATUS_COLOR,
  calcQuotaStatus,
  type EmpPermissionSummary,
  type EmpModelPermission,
  type EmpQuotaGrant,
} from '../../api/mock/aiEmpPermissionMock'
import { fetchEmpPermissionDetail, saveEmpPermission, fetchAdjustLogs } from '../../api/empPermission'

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
 * 員工AI權額管理 — 詳情/編輯頁
 * mode=view（默認）：只讀查看
 * mode=edit：可編輯（切換模型啟停、調整額度）
 */
export default function AiEmpPermissionDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const empId = searchParams.get('empId')
  const isEdit = searchParams.get('mode') === 'edit'

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
    fetchEmpPermissionDetail(Number(empId))
      .then(({ summary, models, quotas }) => {
        if (cancelled) return
        setEmp(summary)
        setModelPerms(models)
        setQuotaGrants(quotas)
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

  /* ── 編輯暫存（保存前不生效） ── */
  const [pendingQuotaValues, setPendingQuotaValues] = useState<Record<number, number>>({})
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustRecords, setAdjustRecords] = useState<{
    quotaId: number; sourceDesc: string; oldValue: number; newValue: number; reason: string; operator: string; time: string
  }[]>([])

  /** 切換模型能力開關（編輯模式） */
  const handleToggleCapability = useCallback((modelId: number, field: keyof Pick<EmpModelPermission, 'visionSupport' | 'functionCalling' | 'jsonMode' | 'streaming' | 'thinkingMode'>) => {
    setModelPerms((prev) => prev.map((m) =>
      m.modelId === modelId ? { ...m, [field]: !m[field] } : m
    ))
  }, [])

  /** 暫存額度值變更 */
  const handlePendingQuota = useCallback((id: number, value: number) => {
    setPendingQuotaValues((prev) => ({ ...prev, [id]: value }))
  }, [])

  /** 保存所有修改（二次確認） */
  const handleSave = useCallback(() => {
    if (!emp) return
    Modal.confirm({
      title: '確認保存',
      content: '確定要保存所有修改嗎？保存後將返回列錶。',
      okText: '確認保存',
      cancelText: '繼續編輯',
      onOk: async () => {
        // 構建額度調整請求
        const quotaAdjusts = Object.entries(pendingQuotaValues).map(([idStr, newVal]) => {
          const id = Number(idStr)
          const original = quotaGrants.find((q) => q.id === id)
          return {
            quotaId: id,
            source: original?.source ?? 'employee',
            sourceDesc: original?.sourceDesc ?? '',
            quotaType: original?.quotaType ?? 'token',
            quotaPeriod: original?.quotaPeriod ?? 'monthly',
            oldValue: original?.quotaValue ?? 0,
            newValue: newVal,
          }
        })
        try {
          await saveEmpPermission(emp.employeeId, {
            employeeId: emp.employeeId,
            modelToggles: [],
            quotaAdjusts,
            reason: adjustReason || '',
          })
          message.success('保存成功')
          navigate('/ai-emp-permission')
        } catch {
          message.error('保存失敗，請重試')
        }
      },
    })
  }, [pendingQuotaValues, adjustReason, quotaGrants, emp, navigate])

  /** 取消編輯 */
  const handleCancelEdit = useCallback(() => {
    if (emp) {
      setModelPerms(emp.modelPermissions)
      setQuotaGrants(emp.quotaGrants)
    }
    setPendingQuotaValues({})
    setAdjustRecords([])
    setAdjustReason('')
    navigate(`/ai-emp-permission-detail?empId=${emp?.employeeId}`)
  }, [emp, navigate])

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
      title: '模型能力', key: 'capabilities', width: 280,
      render: (_, r) => (
        <Space size={4} wrap>
          {CAPABILITY_FIELDS.map((f) => (
            <Tag
              key={f.key}
              color={r[f.key] ? f.color : undefined}
              style={{
                margin: 0, fontSize: 11,
                opacity: r[f.key] ? 1 : 0.35,
                ...(isEdit ? { cursor: 'pointer', userSelect: 'none' as const } : {}),
              }}
              onClick={isEdit ? () => handleToggleCapability(r.modelId, f.key) : undefined}
            >
              {r[f.key] ? f.label : <span style={{ textDecoration: 'line-through' }}>{f.label}</span>}
              {!r[f.key] && isEdit && <span style={{ fontSize: 10, marginLeft: 2, color: '#FF4D4F' }}>已廢除</span>}
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
    ...(isEdit ? [{
      title: '操作', key: 'action', width: 80, align: 'center' as const, fixed: 'right' as const,
      render: (_: unknown, r: EmpModelPermission) => (
        <Switch
          size="small"
          checked={r.status === 1}
          onChange={(checked) => handleToggleModel(r.modelId, checked)}
          checkedChildren="啟用"
          unCheckedChildren="禁用"
        />
      ),
    }] : []),
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
      render: (_, r) => {
        const displayValue = pendingQuotaValues[r.id] ?? r.quotaValue
        const isPending = pendingQuotaValues[r.id] != null
        return isEdit ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <InputNumber
              size="small"
              value={displayValue}
              min={0}
              step={100}
              onChange={(v) => v != null && handlePendingQuota(r.id, v)}
              style={{ width: 100, borderColor: isPending ? '#E8720C' : undefined }}
            />
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{QUOTA_TYPE_LABEL[r.quotaType]}</span>
            {isPending && <Tag color="orange" style={{ margin: 0, fontSize: 10 }}>待保存</Tag>}
          </div>
        ) : (
          <span>{r.quotaValue.toLocaleString()} {QUOTA_TYPE_LABEL[r.quotaType]}</span>
        )
      },
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
    ...(isEdit ? [{
      title: '操作', key: 'action', width: 80, align: 'center' as const, fixed: 'right' as const,
      render: (_: unknown, r: EmpQuotaGrant) => (
        <Switch
          size="small"
          checked={r.status === 1}
          onChange={(checked) => handleToggleQuota(r.id, checked)}
          checkedChildren="啟用"
          unCheckedChildren="停用"
        />
      ),
    }] : []),
  ]

  const quotaStatus = calcQuotaStatus(emp.quotaGrants)

  return (
    <>
      {/* ====== 頭部 ====== */}
      <DetailPageHeader
        title={isEdit ? '編輯員工AI權額' : '員工AI權額詳情'}
        onBack={() => navigate('/ai-emp-permission')}
        meta={`${emp.empId} · ${emp.employeeName} · ${emp.department} · ${emp.position}（${emp.jobLevel}）`}
        tags={<Tag color={QUOTA_STATUS_COLOR[quotaStatus]}>{QUOTA_STATUS_LABEL[quotaStatus]}</Tag>}
        onEdit={!isEdit ? () => navigate(`/ai-emp-permission-detail?empId=${emp.employeeId}&mode=edit`) : undefined}
      />

      {/* ====== 模型權限 ====== */}
      <div className="content-area" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SafetyOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>模型權限（{modelPerms.filter((m) => m.status === 1).length}/{modelPerms.length}）</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <Table<EmpModelPermission>
          rowKey="modelId"
          columns={modelColumns}
          dataSource={modelPerms}
          pagination={false}
          size="small"
          scroll={{ x: isEdit ? 900 : 820 }}
        />
      </div>

      {/* ====== 額度明細 ====== */}
      <div className="content-area" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <WalletOutlined style={{ fontSize: 14, color: '#52c41a' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>額度明細（{quotaGrants.filter((q) => q.status === 1).length} 條有效）</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <Table<EmpQuotaGrant>
          rowKey="id"
          columns={quotaColumns}
          dataSource={quotaGrants}
          pagination={false}
          size="small"
          scroll={{ x: isEdit ? 1000 : 920 }}
        />
        {/* 額度調整原因（編輯模式） */}
        {isEdit && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>調整原因：</div>
            <Input.TextArea
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="請填寫調整原因"
              maxLength={300}
              showCount
              rows={3}
              style={{ width: '100%' }}
            />
          </div>
        )}
      </div>

      {/* ====== 額度調整記錄（查看模式） ====== */}
      {!isEdit && adjustRecords.length > 0 && (
        <div className="content-area" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <HistoryOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>額度調整記錄（{adjustRecords.length}）</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          {[...adjustRecords].reverse().map((rec, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: idx < adjustRecords.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
              <span style={{ fontSize: 12, color: '#8C8C8C', width: 140, flexShrink: 0 }}>{rec.time}</span>
              <span style={{ fontSize: 13, color: '#262626' }}>{rec.sourceDesc}</span>
              <span style={{ fontSize: 13, color: '#FF4D4F' }}>{rec.oldValue.toLocaleString()}</span>
              <span style={{ color: '#8C8C8C' }}>→</span>
              <span style={{ fontSize: 13, color: '#52C41A', fontWeight: 600 }}>{rec.newValue.toLocaleString()}</span>
              <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 'auto' }}>{rec.operator} · {rec.reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* ====== 底部操作按鈕（編輯模式） ====== */}
      {isEdit && (
        <div className="form-footer">
          <Button onClick={handleCancelEdit}>取消</Button>
          <Button type="primary" onClick={handleSave}>保存</Button>
        </div>
      )}
    </>
  )
}
