/**
 * 准入策略配置 —— 「哪些人 / 哪些部门 / 哪类需求要不要先审批」
 *
 * 为什么放在「分发矩阵」页里做成第二个 Tab，而不是新增菜单：
 * 两者都是「按部门/系统/类型决定这条需求往哪走」的路由配置，一个管准入（要不要审批），
 * 一个管受理（谁来接）。拆成两个菜单会让管理员在两个地方维护同一套部门/系统条件。
 *
 * 交互沿用本页既有约定：行内编辑 + 保存，不使用 Modal 承载表单（AGENTS.md §9.1）。
 *
 * 阶段 2B 起数据与裁决都在服务端（rdm_intake_policy / rdm_intake_round）：
 * 本面板只负责配置与「命中链路」展示，前端不参与「要不要审批」的判断。
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Checkbox, DatePicker, Input, Select, Space, Spin, Table, Tag, Tooltip, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DeleteOutlined,
  ExperimentOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import StatusSwitch from '../components/StatusSwitch'
import {
  RDM_INTAKE_MODE_COLOR,
  RDM_INTAKE_MODE_LABEL,
  deleteIntakePolicy,
  fetchIntakePolicies,
  saveIntakePolicy,
  simulateIntake,
  type RdmIntakeDecision,
  type RdmIntakeMode,
  type RdmIntakePolicy,
} from '../../../api/rdm'
import { fetchDepartments } from '../../../api/department'
import { RDM_REQ_TYPE_LABEL } from '../../../constants/rdm'
import '../index.css'

const MODE_OPTIONS = (Object.keys(RDM_INTAKE_MODE_LABEL) as RdmIntakeMode[]).map(m => ({
  value: m,
  label: RDM_INTAKE_MODE_LABEL[m],
}))

const REQ_TYPE_OPTIONS = Object.entries(RDM_REQ_TYPE_LABEL).map(([value, label]) => ({ value, label }))

/** 生成一条空白策略：默认「需审批 + 停用」，避免新建即放开免审 */
function blankPolicy(seq: number): RdmIntakePolicy {
  return {
    id: undefined,
    name: `新策略 ${seq}`,
    mode: 'APPROVE',
    scopeDepts: [],
    includeSubDept: false,
    scopeRoles: [],
    scopeSystems: [],
    scopeReqTypes: [],
    approvalNodes: ['直屬主管'],
    dispatcherName: '技術負責人',
    priority: seq,
    effectiveFrom: dayjs().format('YYYY-MM-DD'),
    version: 'v1',
    enabled: false,
  }
}

export default function AdmitPolicyPanel() {
  const [policies, setPolicies] = useState<RdmIntakePolicy[]>([])
  const [deptOptions, setDeptOptions] = useState<{ value: string; label: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [simEmpNo, setSimEmpNo] = useState('')
  const [simSystem, setSimSystem] = useState<string>()
  const [simReqType, setSimReqType] = useState<string>()
  const [simResult, setSimResult] = useState<RdmIntakeDecision | null>(null)
  const [simLoading, setSimLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setPolicies(await fetchIntakePolicies())
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '准入策略載入失敗')
      setPolicies([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    fetchDepartments()
      .then(list => setDeptOptions(list.map(d => ({ value: d.name, label: d.name }))))
      .catch(() => setDeptOptions([]))
  }, [load])

  const update = (index: number, patch: Partial<RdmIntakePolicy>) => {
    setPolicies(prev => prev.map((p, i) => i === index ? { ...p, ...patch } : p))
    // 改动后旧命中结论就失效了，留着会让人拿着过期结果做决定
    setSimResult(null)
  }

  const handleAdd = () => {
    setPolicies(prev => [...prev, blankPolicy(prev.length + 1)])
    setSimResult(null)
  }

  /**
   * 保存：裁决口径（强制审批优先、同优先级冲突拦截、需审批必须有节点）都在服务端，
   * 这里只负责把结果如实显示出来，不做前端兜底放行。
   */
  const handleSave = async (row: RdmIntakePolicy) => {
    if (!row.name.trim()) {
      message.warning('請填寫策略名稱')
      return
    }
    if (row.id == null && !row.enabled) {
      message.info('新建策略預設停用：確認條件無誤後再啟用，避免半套條件直接上線')
    }
    setSaving(true)
    try {
      setPolicies(await saveIntakePolicy(row))
      message.success(row.enabled ? '已保存並啟用（僅影響之後的新提交，在途單據不受影響）' : '已保存（未啟用）')
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '保存失敗，請檢查條件與優先級')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (row: RdmIntakePolicy) => {
    if (row.id == null) {
      setPolicies(prev => prev.filter(p => p !== row))
      return
    }
    try {
      setPolicies(await deleteIntakePolicy(row.id))
      message.success('已刪除策略（歷史輪次仍保留當時命中的策略與版本）')
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '刪除失敗，請重試')
    }
  }

  const handleSimulate = async () => {
    setSimLoading(true)
    try {
      setSimResult(await simulateIntake({
        empNo: simEmpNo.trim() || undefined,
        reqType: simReqType,
        systemCode: simSystem,
      }))
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '模擬失敗，請重試')
      setSimResult(null)
    } finally {
      setSimLoading(false)
    }
  }

  const columns: TableColumnsType<RdmIntakePolicy> = [
    {
      title: '優先級', key: 'priority', width: 84, fixed: 'left',
      render: (_, r, i) => <Input type="number" size="small" value={r.priority} onChange={e => update(i, { priority: Number(e.target.value) })} />,
    },
    {
      title: '策略名稱', key: 'name', width: 190, fixed: 'left',
      render: (_, r, i) => <Input size="small" value={r.name} onChange={e => update(i, { name: e.target.value })} />,
    },
    {
      title: '准入動作', key: 'mode', width: 150,
      render: (_, r, i) => (
        <Select
          size="small"
          style={{ width: 132 }}
          value={r.mode}
          onChange={(v: RdmIntakeMode) => update(i, { mode: v })}
          options={MODE_OPTIONS}
        />
      ),
    },
    {
      title: '適用部門', key: 'scopeDepts', width: 210,
      render: (_, r, i) => (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Select
            mode="tags"
            size="small"
            style={{ width: '100%' }}
            placeholder="留空 = 不限"
            value={r.scopeDepts}
            onChange={(v: string[]) => update(i, { scopeDepts: v })}
            options={deptOptions}
          />
          <Checkbox
            checked={r.includeSubDept}
            disabled={!r.scopeDepts?.length}
            onChange={e => update(i, { includeSubDept: e.target.checked })}
          >
            <span style={{ fontSize: 12 }}>含下級部門</span>
          </Checkbox>
        </Space>
      ),
    },
    {
      title: '適用角色', key: 'scopeRoles', width: 170,
      render: (_, r, i) => (
        <Select
          mode="tags"
          size="small"
          style={{ width: '100%' }}
          placeholder="留空 = 不限，例：組長"
          value={r.scopeRoles}
          onChange={(v: string[]) => update(i, { scopeRoles: v })}
        />
      ),
    },
    {
      title: '適用系統 / 需求類型', key: 'scopeSystems', width: 230,
      render: (_, r, i) => (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Select
            mode="tags"
            size="small"
            style={{ width: '100%' }}
            placeholder="系統留空 = 不限"
            value={r.scopeSystems}
            onChange={(v: string[]) => update(i, { scopeSystems: v })}
          />
          <Select
            mode="tags"
            size="small"
            style={{ width: '100%' }}
            placeholder="類型留空 = 不限"
            value={r.scopeReqTypes}
            onChange={(v: string[]) => update(i, { scopeReqTypes: v })}
            options={REQ_TYPE_OPTIONS}
          />
        </Space>
      ),
    },
    {
      title: '審批節點（順序）', key: 'approvalNodes', width: 210,
      render: (_, r, i) => (
        <Select
          mode="tags"
          size="small"
          style={{ width: '100%' }}
          disabled={r.mode === 'EXEMPT'}
          placeholder={r.mode === 'EXEMPT' ? '免審不需要節點' : '例：直屬主管 → 產品總監'}
          value={r.approvalNodes}
          onChange={(v: string[]) => update(i, { approvalNodes: v })}
        />
      ),
    },
    {
      title: '默認分派', key: 'dispatcherName', width: 140,
      render: (_, r, i) => <Input size="small" value={r.dispatcherName ?? ''} onChange={e => update(i, { dispatcherName: e.target.value })} />,
    },
    {
      title: '生效起', key: 'effectiveFrom', width: 140,
      render: (_, r, i) => (
        <DatePicker
          size="small"
          value={r.effectiveFrom ? dayjs(r.effectiveFrom) : null}
          onChange={d => update(i, { effectiveFrom: d ? d.format('YYYY-MM-DD') : '' })}
        />
      ),
    },
    {
      title: '版本', key: 'version', width: 80,
      render: (_, r) => <Tag style={{ margin: 0 }}>{r.version || 'v1'}</Tag>,
    },
    {
      title: '啟用', key: 'enabled', width: 80,
      render: (_, r) => (
        <StatusSwitch
          checked={!!r.enabled}
          target={`${r.name} → ${RDM_INTAKE_MODE_LABEL[r.mode]}`}
          impact={r.mode === 'EXEMPT'
            ? '啟用後這些人提的需求將跳過准入審批，直接送達技術部'
            : '啟用後新需求提交時按本策略判定是否需審批；在途單據不受影響'}
          onConfirm={async next => {
            const saved = await saveIntakePolicy({ ...r, enabled: next })
            setPolicies(saved)
          }}
        />
      ),
    },
    {
      title: '操作', key: 'action', width: 130, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave(r)}>保存</Button>
          <span className="action-split">|</span>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => void handleDelete(r)}>刪除</Button>
        </Space>
      ),
    },
  ]

  return (
    <Spin spinning={loading}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="准入裁决已在服务端生效"
        description={
          <span>
            「要不要审批」由服务端按提交人的部门与角色裁决，并连同策略名称、版本与命中链路写进需求；
            客户端参数不再生效。策略变更只影响之后的新提交，已在途的审批单继续按其发起时的版本走完。
          </span>
        }
      />

      {/* ── 规则模拟：配好策略先验证，而不是等真实需求走错流程才发现 ── */}
      <div className="rdm-card" style={{ marginBottom: 16 }}>
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}><ExperimentOutlined /></span>
          規則模擬
          <span className="rdm-todo-hint">按服务端同一套裁决逻辑演算，结果与真实提交一致</span>
          <span className="rdm-card-title-split" />
        </div>
        <Space size={12} wrap align="start">
          <Input
            style={{ width: 200 }}
            allowClear
            placeholder="員工工號（留空=我本人）"
            value={simEmpNo}
            onChange={e => setSimEmpNo(e.target.value)}
          />
          <Select
            mode="tags"
            style={{ width: 200 }}
            placeholder="所屬系統（選填）"
            value={simSystem ? [simSystem] : []}
            onChange={(v: string[]) => setSimSystem(v[v.length - 1])}
          />
          <Select
            style={{ width: 160 }}
            placeholder="需求類型（選填）"
            allowClear
            value={simReqType}
            onChange={setSimReqType}
            options={REQ_TYPE_OPTIONS}
          />
          <Button type="primary" loading={simLoading} onClick={() => void handleSimulate()}>模擬匹配</Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>重載策略</Button>
        </Space>
        {simResult && (
          <div className="rdm-sim-result">
            <div className="rdm-sim-head">
              <SafetyCertificateOutlined />
              <span>判定結果</span>
              <Tag color={RDM_INTAKE_MODE_COLOR[simResult.mode]} style={{ margin: 0 }}>
                {RDM_INTAKE_MODE_LABEL[simResult.mode]}
              </Tag>
              {simResult.fallback && <Tag style={{ margin: 0 }}>未命中，使用默認策略</Tag>}
              {simResult.abnormal && (
                <Tag color="error" style={{ margin: 0 }}>審批節點缺失 → 異常待辦</Tag>
              )}
              {simResult.policyName && (
                <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                  {simResult.policyName} · {simResult.policyVersion || 'v1'}
                </span>
              )}
            </div>
            <ol className="rdm-sim-steps">
              {(simResult.explain || []).map((line, idx) => <li key={idx}>{line}</li>)}
            </ol>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>
              真实提交时，以上判定链路会同策略版本一起写进本轮准入记录（rdm_intake_round），
              方便事后追查「为什么这单免了审」。
            </div>
          </div>
        )}
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Tooltip title="强制审批约束优先于免审；同优先级且条件重叠的策略服务端拒绝保存；未命中任何策略时默认需审批">
            <Tag color="orange" style={{ height: 32, display: 'inline-flex', alignItems: 'center', borderRadius: 6 }}>
              匹配順序：強制審批 &gt; 優先級小者 &gt; 默認需審批
            </Tag>
          </Tooltip>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增策略</Button>
        </div>
      </div>

      <Table<RdmIntakePolicy>
        className="nowrap-table"
        rowKey={(r, i) => String(r.id ?? `new-${i}`)}
        size="small"
        columns={columns}
        dataSource={policies}
        pagination={false}
        scroll={{ x: 1720 }}
      />
    </Spin>
  )
}
