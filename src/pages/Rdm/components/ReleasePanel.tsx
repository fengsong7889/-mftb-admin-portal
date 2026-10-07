/**
 * ReleasePanel —— 需求详情内的「发布放行」区块（阶段 4）
 *
 * 为什么单独一个区块，而不是塞进「业务验收」：
 * 放行回答的是「质量上能不能上线」，由 PMO/研发负责人裁决；
 * 业务验收回答的是「上线后是否真解决了业务问题」，由业务方打分。
 * 合并成一个动作时，签字上线的人和质量责任人变成同一个人，出事没有第二双眼睛。
 *
 * 界面口径：
 * 1. 检查项一律来自服务端，前端只负责勾选豁免与填写理由；
 * 2. 豁免必须写理由，否则按钮不可用（与后端同一规则，不让用户提交后才发现被拒）；
 * 3. 发起/裁决走行内面板（与评审结论录入同法），不开弹窗、不跳页。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, DatePicker, Input, Select, Space, Tag, Tooltip, message } from 'antd'
import dayjs from 'dayjs'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import {
  applyRelease,
  decideRelease,
  fetchReleaseCheck,
  fetchReleases,
  type RdmReleaseCheck,
  type RdmReleaseGate,
} from '../../../api/rdm'
import {
  RDM_RELEASE_ENV_LABEL,
  RDM_RELEASE_STATUS,
  RDM_RELEASE_STATUS_COLOR,
  RDM_RELEASE_STATUS_LABEL,
  RDM_STATUS,
  type RdmReleaseStatus,
} from '../../../constants/rdm'

interface ReleasePanelProps {
  reqId: number
  status: string
  /** 1=旧流程历史记录：新口径检查项会被服务端跳过 */
  flowVersion?: number | null
  editable: boolean
}

/** 还能走放行流程的状态（已上线之后只看历史）；数组宽化到 string 才能容纳任意 status */
const GATE_OPEN_STATUS: string[] = [
  RDM_STATUS.TESTING, RDM_STATUS.TEST_PASSED, RDM_STATUS.UAT_PENDING, RDM_STATUS.UAT_REJECTED,
]

/** 检查结果图标：通过 / 失败 / 已豁免 / 旧流程跳过 */
function CheckIcon({ check }: { check: RdmReleaseCheck }) {
  if (check.skipped) {
    return <MinusCircleOutlined style={{ color: '#8C8C8C' }} />
  }
  if (check.waived) {
    return <Tooltip title="已豁免：理由随放行单永久留痕"><SafetyCertificateOutlined style={{ color: '#FA8C16' }} /></Tooltip>
  }
  return check.passed
    ? <CheckCircleOutlined style={{ color: '#52C41A' }} />
    : <CloseCircleOutlined style={{ color: check.blocking === false ? '#FAAD14' : '#FF4D4F' }} />
}

export default function ReleasePanel({ reqId, status, flowVersion, editable }: ReleasePanelProps) {
  const [check, setCheck] = useState<RdmReleaseGate | null>(null)
  const [gates, setGates] = useState<RdmReleaseGate[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  /** 检查项加载失败原因：失败不能当成“全部通过” */
  const [loadError, setLoadError] = useState<string | null>(null)
  /** 展开的申请面板 */
  const [applyOpen, setApplyOpen] = useState(false)
  const [waivedCodes, setWaivedCodes] = useState<string[]>([])
  const [waiveReason, setWaiveReason] = useState('')
  const [env, setEnv] = useState('prod')
  const [versionNo, setVersionNo] = useState('')
  const [planTime, setPlanTime] = useState<dayjs.Dayjs | null>(null)
  /** 正在裁决的放行单 id 与说明 */
  const [decideId, setDecideId] = useState<number | null>(null)
  const [decideSummary, setDecideSummary] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [next, history] = await Promise.all([
        fetchReleaseCheck(reqId),
        fetchReleases(reqId),
      ])
      setCheck(next)
      setGates(history)
      if (!next) {
        // 预览为空不等于“没有阻断项”：后端报错时静默降级会让人以为可以直接发起
        setLoadError('檢查項載入為空，可能後端未就緒；請刷新重試')
      }
    } catch (err) {
      setLoadError(err instanceof Error && err.message ? err.message : '檢查項載入失敗')
    } finally {
      setLoading(false)
    }
  }, [reqId])

  useEffect(() => { void load() }, [load])

  /** check 每次刷新都是新对象，先固定 checks 引用，避开下游 useMemo 失效 */
  const checks = useMemo(() => check?.checks ?? [], [check])
  const blocking = check?.blockingCount ?? 0
  const gateOpen = GATE_OPEN_STATUS.includes(status)
  const pendingGate = useMemo(() => gates.find(g => g.status === RDM_RELEASE_STATUS.PENDING), [gates])
  const validPass = useMemo(() => gates.find(g => g.status === RDM_RELEASE_STATUS.PASSED && !g.expired), [gates])

  const resetApply = () => {
    setApplyOpen(false)
    setWaivedCodes([])
    setWaiveReason('')
    setVersionNo('')
    setPlanTime(null)
  }

  const handleApply = async () => {
    if (waivedCodes.length > 0 && !waiveReason.trim()) {
      message.warning('豁免檢查項必須填寫豁免理由')
      return
    }
    setSaving(true)
    try {
      await applyRelease(reqId, {
        env,
        versionNo: versionNo.trim() || undefined,
        planTime: planTime ? planTime.format('YYYY-MM-DD HH:mm') : undefined,
        waivedCodes: waivedCodes.length ? waivedCodes : undefined,
        waiveReason: waivedCodes.length ? waiveReason.trim() : undefined,
      })
      message.success('放行單已發起，等待他人裁決')
      resetApply()
      await load()
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '發起放行失敗')
    } finally {
      setSaving(false)
    }
  }

  const handleDecide = async (gate: RdmReleaseGate, passed: boolean) => {
    if (!passed && !decideSummary.trim()) {
      message.warning('駁回放行必須填寫原因')
      return
    }
    setSaving(true)
    try {
      await decideRelease(gate.id as number, { passed, summary: decideSummary.trim() || undefined })
      message.success(passed ? '已准許上線' : '已駁回放行')
      setDecideId(null)
      setDecideSummary('')
      await load()
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '裁決失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rdm-card" id="rdm-release-gate">
      <div className="rdm-card-title">
        <span className="rdm-icon-block" style={{ background: '#FFF1F0', color: '#F5222D' }}><RocketOutlined /></span>
        發布放行
        <span className="rdm-card-title-split" />
        <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>
          上線前的質量閘門，與上線後的業務驗收是兩件事
        </span>
      </div>

      <Alert
        type={blocking === 0 && !loadError ? 'success' : 'warning'}
        showIcon
        style={{ marginBottom: 12 }}
        message={loadError
          ? `檢查項未能確認：${loadError}`
          : blocking === 0
            ? '檢查項已全部通過，可發起放行單'
            : `還有 ${blocking} 項阻斷檢查未通過，處理後才能發起放行`}
        description={flowVersion != null && flowVersion < 2
          ? '本需求為舊流程記錄（V1）：五節點計劃、PRD 定稿快照、工時明細三項檢查自動跳過，不會把歷史需求判成質量不合格。'
          : '檢查結果由服務端計算，前端無法偽造；豁免可以，但理由會隨放行單永久留痕。放行與發起必須是兩個人（系統管理員僅作運維應急例外）。'}
      />

      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        {checks.map(c => (
          <div key={c.code} className="rdm-delivery-row">
            <CheckIcon check={c} />
            <span className="rdm-delivery-row-main">
              <b style={{ fontWeight: 500 }}>{c.label}</b>
              {!c.blocking && <Tag style={{ marginLeft: 8, margin: '0 0 0 8px' }} color="warning">僅提示</Tag>}
              {c.reason && <div className="rdm-delivery-row-desc">{c.reason}</div>}
            </span>
            {editable && gateOpen && !pendingGate && c.blocking && !c.passed && !c.skipped && (
              <Checkbox
                checked={waivedCodes.includes(c.code)}
                onChange={e => setWaivedCodes(prev => (
                  e.target.checked ? [...prev, c.code] : prev.filter(code => code !== c.code)
                ))}
              >
                <span style={{ fontSize: 12 }}>豁免</span>
              </Checkbox>
            )}
          </div>
        ))}
      </Space>

      {gateOpen && !pendingGate && (
        <Space style={{ marginTop: 12 }} wrap>
          {!applyOpen ? (
            <Button
              type="primary"
              loading={loading}
              disabled={!editable || !!loadError || (blocking > 0 && waivedCodes.length !== blocking)}
              onClick={() => setApplyOpen(true)}
            >
              發起放行單
            </Button>
          ) : (
            <div className="rdm-action-panel" style={{ width: '100%' }}>
              <div className="rdm-action-panel-title">發起發布放行</div>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space wrap>
                  <Select
                    style={{ width: 160 }}
                    value={env}
                    onChange={setEnv}
                    options={Object.entries(RDM_RELEASE_ENV_LABEL).map(([value, label]) => ({ value, label }))}
                  />
                  <Input
                    style={{ width: 180 }}
                    placeholder="發布版本號（選填）"
                    value={versionNo}
                    onChange={e => setVersionNo(e.target.value)}
                  />
                  <DatePicker
                    showTime={{ format: 'HH:mm' }}
                    format="YYYY-MM-DD HH:mm"
                    placeholder="計劃上線時間"
                    value={planTime}
                    onChange={setPlanTime}
                  />
                </Space>
                {waivedCodes.length > 0 && (
                  <Input.TextArea
                    rows={2}
                    value={waiveReason}
                    placeholder={`豁免 ${waivedCodes.length} 項的理由（必填），例：設計變更待客戶確認，先上主流程`}
                    onChange={e => setWaiveReason(e.target.value)}
                  />
                )}
                <Space>
                  <Button type="primary" loading={saving} onClick={() => void handleApply()}>提交放行單</Button>
                  <Button onClick={resetApply}>取消</Button>
                  <span style={{ fontSize: 12, color: '#8C8C8C' }}>發起人不可自行放行（系統管理員僅在運維應急時可自批）</span>
                </Space>
              </Space>
            </div>
          )}
        </Space>
      )}

      {pendingGate && (
        <div className="rdm-delivery-row" style={{ marginTop: 12 }}>
          <Tag color={RDM_RELEASE_STATUS_COLOR[RDM_RELEASE_STATUS.PENDING]}>待裁決</Tag>
          <span className="rdm-delivery-row-main">
            <b style={{ fontWeight: 500 }}>{pendingGate.releaseNo}</b>
            <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 8 }}>
              第 {pendingGate.roundNo} 次 · {RDM_RELEASE_ENV_LABEL[pendingGate.env ?? 'prod'] ?? pendingGate.env}
              {pendingGate.applicantName ? ` · 發起 ${pendingGate.applicantName}` : ''}
              {pendingGate.applyTime ? ` · ${pendingGate.applyTime}` : ''}
            </span>
            {pendingGate.summary && <div className="rdm-delivery-row-desc">豁免理由：{pendingGate.summary}</div>}
          </span>
          {editable && (
            <Button type="link" size="small" onClick={() => { setDecideId(decideId === pendingGate.id ? null : (pendingGate.id as number)); setDecideSummary('') }}>
              裁決
            </Button>
          )}
        </div>
      )}

      {decideId != null && pendingGate && (
        <div className="rdm-action-panel">
          <div className="rdm-action-panel-title">裁決放行單：{pendingGate.releaseNo}</div>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Input.TextArea
              rows={2}
              value={decideSummary}
              placeholder="放行說明 或 駁回原因（駁回必填）"
              onChange={e => setDecideSummary(e.target.value)}
            />
            <Space>
              <Button type="primary" icon={<CheckCircleOutlined />} loading={saving} onClick={() => void handleDecide(pendingGate, true)}>
                准許上線
              </Button>
              <Button danger icon={<CloseCircleOutlined />} loading={saving} onClick={() => void handleDecide(pendingGate, false)}>
                駁回
              </Button>
              <Button onClick={() => { setDecideId(null); setDecideSummary('') }}>取消</Button>
            </Space>
          </Space>
        </div>
      )}

      {validPass && !pendingGate && (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 12 }}
          message={`已准許上線（${validPass.releaseNo}），有效期至 ${validPass.expireAt ?? '-'}`}
          description="過期後需重新過閘；需求一旦退回返工，舊放行單會自動作廢。"
        />
      )}

      {gates.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>放行歷史（含被駁回與作廢的輪次，不覆蓋）</div>
          {gates.map(g => (
            <div key={g.id} className="rdm-delivery-row">
              <Tag color={RDM_RELEASE_STATUS_COLOR[(g.status ?? 'pending') as RdmReleaseStatus] ?? 'default'} style={{ margin: 0 }}>
                {RDM_RELEASE_STATUS_LABEL[(g.status ?? 'pending') as RdmReleaseStatus] ?? g.status}
              </Tag>
              <span className="rdm-delivery-row-main">
                <b style={{ fontWeight: 500 }}>第 {g.roundNo} 次 · {g.releaseNo}</b>
                <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 8 }}>
                  {RDM_RELEASE_ENV_LABEL[g.env ?? 'prod'] ?? g.env}
                  {g.versionNo ? ` · ${g.versionNo}` : ''}
                  {g.gateName ? ` · 放行 ${g.gateName}` : ''}
                  {g.decideTime ? ` · ${g.decideTime}` : ''}
                  {g.expired ? ' · 已過期' : ''}
                </span>
                {g.summary && <div className="rdm-delivery-row-desc">{g.summary}</div>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
