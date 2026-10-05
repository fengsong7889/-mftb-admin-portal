/**
 * 积分规则配置 —— 产出积分的计算口径（M4）
 *
 * 与 SLA / 状态流转配置同族：都是"改了会影响所有人怎么被衡量"的规则，
 * 所以这一页有三条不能省的设计：
 * 1. 改版即升版本（version），历史流水按当时版本冻结，绝不因改规则重算历史分数；
 * 2. 内置试算器：改系数前先拿一条真实需求看分数怎么变，避免"调完才发现全员漂移"；
 * 3. 只有一个「当前生效」版本：启用新版即停用旧版，防止两套口径同时出分。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, InputNumber, Select, Space, Switch, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import StatusSwitch from '../components/StatusSwitch'
import {
  CalculatorOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import {
  fetchScoreRules,
  previewScore,
  saveScoreRule,
  setScoreRuleEnabled,
  type RdmScoreRecord,
  type RdmScoreRule,
} from '../../../api/rdm'
import {
  RDM_COMPLEXITY_LABEL,
  RDM_REQ_TYPE_LABEL,
  RDM_ROLE_LABEL,
  RDM_SCORE_ALLOC_MODE,
  RDM_SCORE_ALLOC_MODE_LABEL,
  RDM_SCORE_ROLE_FACTOR,
  type RdmComplexity,
  type RdmReqType,
  type RdmRoleCode,
} from '../../../constants/rdm'
import { computeScore, DEFAULT_SCORE_PARAMS, sumScorableRoleFactors } from '../../../utils/rdmScore'
import '../index.css'

const ALLOC_OPTIONS = Object.entries(RDM_SCORE_ALLOC_MODE_LABEL).map(([value, label]) => ({ value, label }))

/** 参与计分角色（与引擎保持一致，不在表内即为不计分角色） */
const SCORABLE_ROLE_LIST = Object.keys(RDM_SCORE_ROLE_FACTOR) as RdmRoleCode[]

/** 试算用的需求事实输入 */
interface PreviewFacts {
  reqType: RdmReqType
  complexity: RdmComplexity
  priority: string
  roleCode: RdmRoleCode
  onTime: boolean
  lateDays: number
  reworkCount: number
  firstPass: boolean
  acceptanceScore: number
}

export default function ScoreRuleConfig() {
  const [rules, setRules] = useState<RdmScoreRule[]>([])
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState<Record<number, boolean>>({})
  const [facts, setFacts] = useState<PreviewFacts>({
    reqType: 'NEW_FEATURE',
    complexity: 'MEDIUM',
    priority: 'P1',
    roleCode: 'DEV',
    onTime: true,
    lateDays: 0,
    reworkCount: 0,
    firstPass: true,
    acceptanceScore: 5,
  })
  const [preview, setPreview] = useState<RdmScoreRecord | null>(null)
  const [previewing, setPreviewing] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetchScoreRules()
      .then(setRules)
      .catch(() => message.error('規則載入失敗'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const currentRule = useMemo(
    () => rules.find(r => r.enabled) ?? rules.reduce<RdmScoreRule | null>(
      (max, r) => (!max || r.version > max.version ? r : max), null),
    [rules],
  )

  /** 行内编辑 */
  const update = (id: number, patch: Partial<RdmScoreRule>) => {
    setRules(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
    setDirty(prev => ({ ...prev, [id]: true }))
  }

  const handleSave = async (row: RdmScoreRule) => {
    try {
      const saved = await saveScoreRule(row)
      setRules(prev => prev.map(r => (r.id === saved.id ? saved : r)))
      setDirty(prev => ({ ...prev, [row.id]: false }))
      message.success(`規則 ${row.ruleCode} 已保存（版本 v${saved.version}），需點「按當前規則重算」才會影響分數`)
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '規則保存失敗')
    }
  }

  /**
   * 启停：启用一条即代表切换当期计分口径，风险写进确认框里而不是事后弹提。
   * <p>之前这里只 `message.warning` 一句就照样调接口，注释却写「必须二次确认」——
   * 那等于把“确认”变成了“告知”，现在由 StatusSwitch 保证先确认再执行。
   */
  const handleEnabledChange = async (row: RdmScoreRule, enabled: boolean) => {
    const next = await setScoreRuleEnabled(row.id, enabled)
    if (Array.isArray(next) && next.length > 0) setRules(next)
    else load()
  }

  /** 本地即时试算：不依赖后端也能看到系数叠加结果（与 mock/后端同一引擎） */
  const localPreview = useMemo(() => computeScore({
    roleCode: facts.roleCode,
    reqType: facts.reqType,
    complexity: facts.complexity,
    priority: facts.priority,
    onTime: facts.onTime,
    lateDays: facts.lateDays,
    reworkCount: facts.reworkCount,
    acceptanceScore: facts.acceptanceScore,
    firstPass: facts.firstPass,
    roleFactorSum: sumScorableRoleFactors([facts.roleCode, 'PM', 'QA']),
  }, {
    unitScore: currentRule?.unitScore ?? DEFAULT_SCORE_PARAMS.unitScore,
    onTimeBonus: currentRule?.onTimeBonus ?? DEFAULT_SCORE_PARAMS.onTimeBonus,
    latePenalty: currentRule?.latePenalty ?? DEFAULT_SCORE_PARAMS.latePenalty,
    firstPassBonus: currentRule?.firstPassBonus ?? DEFAULT_SCORE_PARAMS.firstPassBonus,
    reworkPenalty: currentRule?.reworkPenalty ?? DEFAULT_SCORE_PARAMS.reworkPenalty,
    acceptanceFactor: currentRule?.acceptanceFactor ?? DEFAULT_SCORE_PARAMS.acceptanceFactor,
    allocMode: currentRule?.allocMode ?? DEFAULT_SCORE_PARAMS.allocMode,
  }), [facts, currentRule])

  /** 用真实需求试算（走后端 preview 接口，后端不可用时由 mock 兜底） */
  const handleServerPreview = async () => {
    setPreviewing(true)
    try {
      const res = await previewScore({ reqId: 1, roleCode: facts.roleCode })
      setPreview(res)
      if (!res) message.warning('後端沒有可用於試算的交付需求')
    } catch {
      message.error('試算失敗')
    } finally {
      setPreviewing(false)
    }
  }

  const columns: TableColumnsType<RdmScoreRule> = [
    {
      title: '規則', dataIndex: 'ruleCode', key: 'ruleCode', width: 180,
      render: (v: string, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <div style={{ color: '#262626', fontWeight: 600 }}>
            {v}
            {r.enabled && <Tag color="processing" style={{ margin: '0 0 0 6px' }}>當前生效</Tag>}
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>v{r.version} · 生效 {r.effectiveFrom ?? '-'}</div>
        </div>
      ),
    },
    {
      title: '適用範圍', key: 'scope', width: 180,
      render: (_, r) => (
        <Space size={4} wrap>
          <Tag style={{ margin: 0 }}>{r.reqType ? (RDM_REQ_TYPE_LABEL[r.reqType as RdmReqType] ?? r.reqType) : '全部類型'}</Tag>
          <Tag color="geekblue" style={{ margin: 0 }}>{r.roleCode ? (RDM_ROLE_LABEL[r.roleCode as RdmRoleCode] ?? r.roleCode) : '全部角色'}</Tag>
        </Space>
      ),
    },
    {
      title: '單位分', dataIndex: 'unitScore', key: 'unitScore', width: 110,
      render: (v: number | null | undefined, r) => (
        <InputNumber
          size="small"
          min={1}
          max={100}
          value={v ?? DEFAULT_SCORE_PARAMS.unitScore}
          disabled={!r.enabled && dirty[r.id] !== true}
          onChange={val => update(r.id, { unitScore: val ?? undefined })}
          style={{ width: 80 }}
        />
      ),
    },
    {
      title: '按時加分', key: 'onTimeBonus', width: 110,
      render: (_, r) => (
        <InputNumber
          size="small"
          min={0}
          max={0.5}
          step={0.05}
          value={r.onTimeBonus ?? 0}
          onChange={val => update(r.id, { onTimeBonus: val ?? undefined })}
          style={{ width: 80 }}
        />
      ),
    },
    {
      title: '逾期扣分上限', key: 'latePenalty', width: 130,
      render: (_, r) => (
        <InputNumber
          size="small"
          min={0}
          max={0.6}
          step={0.05}
          value={r.latePenalty ?? 0}
          onChange={val => update(r.id, { latePenalty: val ?? undefined })}
          style={{ width: 80 }}
        />
      ),
    },
    {
      title: '一次通過加分', key: 'firstPassBonus', width: 130,
      render: (_, r) => (
        <InputNumber
          size="small"
          min={0}
          max={0.5}
          step={0.05}
          value={r.firstPassBonus ?? 0}
          onChange={val => update(r.id, { firstPassBonus: val ?? undefined })}
          style={{ width: 80 }}
        />
      ),
    },
    {
      title: '每次返工扣分', key: 'reworkPenalty', width: 140,
      render: (_, r) => (
        <InputNumber
          size="small"
          min={0}
          max={0.5}
          step={0.05}
          value={r.reworkPenalty ?? 0}
          onChange={val => update(r.id, { reworkPenalty: val ?? undefined })}
          style={{ width: 80 }}
        />
      ),
    },
    {
      title: '滿意度係數', key: 'acceptanceFactor', width: 120,
      render: (_, r) => (
        <InputNumber
          size="small"
          min={0}
          max={0.2}
          step={0.02}
          value={r.acceptanceFactor ?? 0}
          onChange={val => update(r.id, { acceptanceFactor: val ?? undefined })}
          style={{ width: 80 }}
        />
      ),
    },
    {
      title: '分配模式', dataIndex: 'allocMode', key: 'allocMode', width: 160,
      render: (v: string | null | undefined, r) => (
        <Select
          size="small"
          style={{ width: 150 }}
          value={v ?? RDM_SCORE_ALLOC_MODE.EACH}
          options={ALLOC_OPTIONS}
          onChange={val => update(r.id, { allocMode: val })}
        />
      ),
    },
    {
      title: '啟用', dataIndex: 'enabled', key: 'enabled', width: 80,
      render: (v: boolean, r) => (
        <StatusSwitch
          checked={v}
          target={`${r.ruleCode} v${r.version}`}
          impact={v
            ? '停用後當前生效規則會置空，在重新啟用前需求不再計分'
            : (currentRule && currentRule.id !== r.id
              ? `啟用後將取代 ${currentRule.ruleCode} v${currentRule.version} 成為當前生效規則（歷史流水仍按各自版本展示）`
              : '啟用後立即參與新需求計分')}
          onConfirm={(next: boolean) => handleEnabledChange(r, next)}
        />
      ),
    },
    {
      title: '操作', key: 'action', width: 100, fixed: 'right',
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          icon={<SaveOutlined />}
          disabled={!dirty[r.id]}
          onClick={() => handleSave(r)}
        >
          保存
        </Button>
      ),
    },
  ]

  return (
    <div className="content-area">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 12,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#262626', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalculatorOutlined style={{ color: '#722ED1' }} />
          積分規則
          <span style={{ fontSize: 12, fontWeight: 400, color: '#8C8C8C' }}>
            權重與係數決定所有人的產出分，改版必留痕
          </span>
        </div>
        <Tag color="purple" style={{ margin: 0, height: 30, display: 'inline-flex', alignItems: 'center', padding: '0 12px', borderRadius: 6 }}>
          當前生效：{currentRule ? `${currentRule.ruleCode} v${currentRule.version}` : '未配置'}
        </Tag>
      </div>

      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="保存規則不會自動重算歷史分數"
        description="積分流水按寫入時的規則版本凍結（日後可申訴復算）；調完係數請到「個人產出積分」頁點「按當前規則重算」，且只重算當期週期。"
      />

      {/* ── 试算器：先把系数影响看清楚再保存 ── */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}><ThunderboltOutlined /></span>
          係數試算器
          <span className="rdm-card-title-split" />
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>按當前生效規則實時折算，改上方係數這裡立刻變</span>
        </div>
        <Space size={12} wrap align="end" style={{ marginBottom: 12 }}>
          <LabeledField label="需求類型">
            <Select
              style={{ width: 150 }}
              value={facts.reqType}
              options={Object.entries(RDM_REQ_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
              onChange={v => setFacts(prev => ({ ...prev, reqType: v }))}
            />
          </LabeledField>
          <LabeledField label="複雜度">
            <Select
              style={{ width: 120 }}
              value={facts.complexity}
              options={Object.entries(RDM_COMPLEXITY_LABEL).map(([value, label]) => ({ value, label }))}
              onChange={v => setFacts(prev => ({ ...prev, complexity: v }))}
            />
          </LabeledField>
          <LabeledField label="優先級">
            <Select
              style={{ width: 100 }}
              value={facts.priority}
              options={['P0', 'P1', 'P2', 'P3'].map(v => ({ value: v, label: v }))}
              onChange={v => setFacts(prev => ({ ...prev, priority: v }))}
            />
          </LabeledField>
          <LabeledField label="計分角色">
            <Select
              style={{ width: 130 }}
              value={facts.roleCode}
              options={SCORABLE_ROLE_LIST.map(v => ({ value: v, label: RDM_ROLE_LABEL[v] }))}
              onChange={v => setFacts(prev => ({ ...prev, roleCode: v }))}
            />
          </LabeledField>
          <LabeledField label="逾期天數">
            <InputNumber
              min={0}
              max={60}
              value={facts.onTime ? 0 : facts.lateDays}
              disabled={facts.onTime}
              onChange={v => setFacts(prev => ({ ...prev, lateDays: v ?? 0 }))}
              style={{ width: 90 }}
            />
          </LabeledField>
          <LabeledField label="返工次數">
            <InputNumber
              min={0}
              max={5}
              value={facts.reworkCount}
              onChange={v => setFacts(prev => ({ ...prev, reworkCount: v ?? 0, firstPass: (v ?? 0) === 0 }))}
              style={{ width: 90 }}
            />
          </LabeledField>
          <Space size={6} align="center" style={{ paddingBottom: 4 }}>
            <Switch size="small" checked={facts.onTime} onChange={v => setFacts(prev => ({ ...prev, onTime: v }))} />
            <span style={{ fontSize: 12, color: '#595959' }}>按時上線</span>
          </Space>
        </Space>

        <div className="rdm-score-preview">
          <div className="rdm-score-preview-total">{localPreview.finalScore.toFixed(2)} <span>分</span></div>
          <div className="rdm-score-preview-formula">
            基準 {localPreview.base} × 類型 {localPreview.typeFactor} × 優先級 {localPreview.priorityFactor}
            {' × '}按時 {localPreview.onTimeFactor} × 質量 {localPreview.qualityFactor}
            {' × '}角色 {localPreview.roleFactor} × 單位分 {currentRule?.unitScore ?? DEFAULT_SCORE_PARAMS.unitScore}
          </div>
          <div className="rdm-score-preview-meta">
            <Tag style={{ margin: 0 }}>{RDM_SCORE_ALLOC_MODE_LABEL[(currentRule?.allocMode ?? RDM_SCORE_ALLOC_MODE.EACH) as keyof typeof RDM_SCORE_ALLOC_MODE_LABEL]}</Tag>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>假設該需求還有 PM / QA 參與（SPLIT 模式下按三者係數瓜分）</span>
          </div>
        </div>
        <Space style={{ marginTop: 10 }}>
          <Button size="small" icon={<CalculatorOutlined />} loading={previewing} onClick={handleServerPreview}>
            用真實需求試算（走後端）
          </Button>
          {preview && (
            <span style={{ fontSize: 12, color: '#595959' }}>
              {preview.reqNo} · {RDM_ROLE_LABEL[preview.roleCode as RdmRoleCode] ?? preview.roleCode} → <b>{preview.score.toFixed(2)} 分</b>
            </span>
          )}
        </Space>
      </div>

      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}><SaveOutlined /></span>
          規則列表
          <span className="rdm-card-title-split" />
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>
            停用版本保留供歷史流水回溯，不刪除
          </span>
        </div>
        <Table<RdmScoreRule>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rules}
          pagination={false}
          scroll={{ x: 1500 }}
        />
      </div>

      <div className="rdm-tip-card">
        公式：積分 = 複雜度權重 × 類型係數 × (1 + 優先級加分) × 按時因子 × 質量因子 × 角色係數 × 單位分。
        質量因子 = 1 + 一次通過加分 − 返工次數 × 返工扣分 − 重開次數 × 重開扣分 + (滿意度 − 3) × 滿意度係數，並受下限保護。
        角色係數：{SCORABLE_ROLE_LIST.map(r => `${RDM_ROLE_LABEL[r]} ${RDM_SCORE_ROLE_FACTOR[r]}`).join('，')}；
        提出人/上級/審批人/驗收人不計分。
      </div>
    </div>
  )
}

/** 带标签字段（与其他配置页保持一致的紧凑排版） */
function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}
