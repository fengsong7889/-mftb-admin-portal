/**
 * 节点计划 —— 五节点时间与基线（独立页面，非弹窗）
 *
 * 为什么是独立页面（AGENTS.md §9.1）：一次要录 5 个节点 × 负责人/日期/状态，
 * 弹窗里放不下也看不清哪格没填；独立页可以刷新、可以分享、可以从详情页回跳。
 *
 * 核心口径（与后端一致，界面上必须看得出来）：
 * 1. 初步计划 = PM 受理时的承诺；基线 = 评审通过、各角色估时确认后冻结的那一版；
 * 2. 基线一旦冻结，初步计划与基线都不再可改，只能改「当前预测」；
 *    否则按时率会变成自己改考卷自己得高分；
 * 3. 节点标为「不适用」必须写原因（纯后端需求没有 UI 设计节点），不写原因不给保存。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, DatePicker, Empty, Input, Modal, Select, Space, Spin, Tag, Tooltip, message } from 'antd'
import dayjs from 'dayjs'
import { LockOutlined, SaveOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import RdmFormHeader from './components/RdmFormHeader'
import {
  fetchMilestones,
  fetchRequirementDetail,
  freezeMilestones,
  saveMilestones,
  type RdmRequirementDetail,
} from '../../api/rdm'
import { fetchEmployees } from '../../api/employee'
import {
  RDM_MILESTONE_NODES,
  RDM_MILESTONE_STATUS,
  RDM_MILESTONE_STATUS_LABEL,
  RDM_STATUS,
  type RdmMilestoneCode,
  type RdmMilestoneStatus,

  canFreezeBaseline,
} from '../../constants/rdm'
import './index.css'

/** 页面内一行节点（日期用 dayjs，提交时统一转 yyyy-MM-dd） */
interface MilestoneRow {
  code: RdmMilestoneCode
  label: string
  ownerUserId?: number
  ownerName?: string
  preliminaryDate?: dayjs.Dayjs | null
  baselineDate?: string | null
  forecastDate?: dayjs.Dayjs | null
  actualDate?: string | null
  status: RdmMilestoneStatus
  naReason?: string
  baselineLocked: boolean
}

/** 五个节点始终以固定顺序呈现，缺哪行就补一行空值 */
function buildRows(
  existing: Awaited<ReturnType<typeof fetchMilestones>>,
): MilestoneRow[] {
  return RDM_MILESTONE_NODES.map(node => {
    const row = existing.find(e => e.code === node.code)
    return {
      code: node.code,
      label: node.label,
      ownerUserId: row?.ownerUserId ?? undefined,
      ownerName: row?.ownerName ?? undefined,
      preliminaryDate: row?.preliminaryDate ? dayjs(row.preliminaryDate) : null,
      baselineDate: row?.baselineDate ?? null,
      forecastDate: row?.forecastDate ? dayjs(row.forecastDate) : null,
      actualDate: row?.actualDate ?? null,
      status: (row?.status ?? RDM_MILESTONE_STATUS.PENDING) as RdmMilestoneStatus,
      naReason: row?.naReason ?? undefined,
      baselineLocked: !!row?.baselineLocked,
    }
  })
}

export default function MilestonePlan() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const reqId = Number(searchParams.get('reqId') ?? 0)

  const [detail, setDetail] = useState<RdmRequirementDetail | null>(null)
  const [rows, setRows] = useState<MilestoneRow[]>(() => buildRows([]))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  /** 负责人候选：节点负责人可能是设计/开发/测试，不能只给产品经理名单 */
  const [ownerOptions, setOwnerOptions] = useState<{ value: number; label: string }[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  const update = (code: RdmMilestoneCode, patch: Partial<MilestoneRow>) => {
    setRows(prev => prev.map(r => (r.code === code ? { ...r, ...patch } : r)))
  }

  const load = useCallback(async () => {
    if (!reqId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [milestones, info] = await Promise.all([
        fetchMilestones(reqId),
        fetchRequirementDetail(reqId).catch(() => null),
      ])
      setRows(buildRows(milestones))
      setDetail(info)
      // 已有负责人的行，把人名补进候选列表，否则下拉里只会看到一串 ID
      const known = milestones
        .filter(m => m.ownerUserId && m.ownerName)
        .map(m => ({ value: m.ownerUserId as number, label: m.ownerName as string }))
      setOwnerOptions(prev => {
        const map = new Map(prev.map(o => [o.value, o.label]))
        known.forEach(o => map.set(o.value, o.label))
        return [...map.entries()].map(([value, label]) => ({ value, label }))
      })
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '節點計劃載入失敗')
    } finally {
      setLoading(false)
    }
  }, [reqId])

  useEffect(() => { void load() }, [load])

  useEffect(() => () => searchTimer.current && clearTimeout(searchTimer.current), [])

  const searchOwner = (keyword: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!keyword.trim()) {
      return
    }
    searchTimer.current = setTimeout(() => {
      fetchEmployees({ page: 1, size: 20, keyword: keyword.trim() })
        .then(res => setOwnerOptions(prev => {
          const map = new Map(prev.map(o => [o.value, o.label]))
          ;(res.records ?? []).forEach(e => map.set(e.id, `${e.name}（${e.empId}）`))
          return [...map.entries()].map(([value, label]) => ({ value, label }))
        }))
        .catch(() => { /* 搜索失败不影响已加载的负责人，界面上保留原有候选 */ })
    }, 300)
  }

  /** 基线是否已全部冻结：全冻结时不再提供「冻结基线」入口 */
  const allFrozen = useMemo(() => rows.every(r => r.baselineLocked || r.status === RDM_MILESTONE_STATUS.NOT_APPLICABLE), [rows])
  /** 冻结入口与后端同一口径：判定收敛在 constants/rdm.ts 并由单测钉住 */
  const canFreeze = canFreezeBaseline(detail?.status)

  const validate = (): string | null => {
    for (const row of rows) {
      if (row.status === RDM_MILESTONE_STATUS.NOT_APPLICABLE && !row.naReason?.trim()) {
        return `「${row.label}」標為不適用時必須寫明原因`
      }
      const plan = row.forecastDate ?? row.preliminaryDate
      if (row.status !== RDM_MILESTONE_STATUS.NOT_APPLICABLE && !plan && !row.baselineDate) {
        return `「${row.label}」還未給出計劃日期，請填寫或標為不適用`
      }
      if (row.preliminaryDate && row.baselineDate && row.preliminaryDate.isAfter(dayjs(row.baselineDate))) {
        return `「${row.label}」初步計劃不得晚於已凍結基線`
      }
    }
    return null
  }

  const handleSave = async () => {
    const error = validate()
    if (error) {
      message.warning(error)
      return
    }
    setSaving(true)
    try {
      const saved = await saveMilestones(reqId, rows.map(r => ({
        code: r.code,
        name: r.label,
        ownerUserId: r.ownerUserId,
        preliminaryDate: r.preliminaryDate?.format('YYYY-MM-DD'),
        forecastDate: r.forecastDate?.format('YYYY-MM-DD'),
        status: r.status,
        naReason: r.naReason,
      })))
      setRows(buildRows(saved))
      message.success('節點計劃已保存，相關負責人已收到通知')
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '保存失敗，請檢查計劃日期')
    } finally {
      setSaving(false)
    }
  }

  const handleFreeze = () => {
    Modal.confirm({
      title: '確認凍結基線？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>需求：</span><b>{detail?.reqNo} · {detail?.title}</b></div>
          <div className="confirm-info-row"><span>凍結內容：</span><b>當前預測日期成為已批准基線</b></div>
          <div className="confirm-info-row"><span>之後的改期：</span><b>只能改「當前預測」，基線保留，按時率仍以原承諾計算</b></div>
        </div>
      ),
      okText: '確認凍結',
      cancelText: '取消',
      onOk: async () => {
        try {
          setRows(buildRows(await freezeMilestones(reqId)))
          message.success('基線已凍結')
        } catch (err) {
          message.error(err instanceof Error && err.message ? err.message : '凍結失敗，請先補全計劃')
          throw err
        }
      },
    })
  }

  if (!reqId) {
    return (
      <div className="content-area">
        <Empty description="未指定需求，請從需求詳情頁進入「節點計劃」" />
      </div>
    )
  }

  return (
    <div className="content-area">
      <RdmFormHeader
        title="節點計劃"
        backText="返回需求"
        onBack={() => navigate(`/rdm-detail?id=${reqId}`)}
        meta={detail ? `${detail.reqNo} · ${detail.title} · 當前處理人 ${detail.currentHandler ?? '-'}` : '載入中…'}
      />

      <Spin spinning={loading}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="初步計劃 = 受理時的承諾；基線 = 評審通過、各角色估時確認後凍結的版本"
          description="改期只动「当前预测」，基线不会被覆盖——否则按时率会被自己改考卷改出来。不适用节点必须写明原因，空着不算处理过。"
        />

        {rows.map(row => (
          <div key={row.code} className="rdm-milestone-row">
            <div className="rdm-milestone-row-head">
              <span className="rdm-milestone-name">{row.label}</span>
              {row.baselineLocked ? (
                <Tooltip title="基線已凍結：初步計劃與基線不可再改，只能調整當前預測">
                  <Tag icon={<LockOutlined />} color="purple" style={{ margin: 0 }}>基線 {row.baselineDate}</Tag>
                </Tooltip>
              ) : (
                /*
                 * 未冻结也要显式标出来：之前只有冻结后才有标签，
                 * PM 在这个页面上看不出“自己还没冻结基线”，上线闸门只能靠豁免（阶段 4 实测）。
                 */
                <Tooltip title="基线尚未冻结：排好初步计划后点底部「冻结基线」，之后按时率就以这份基线计算">
                  <Tag color="default" style={{ margin: 0 }}>基線未凍結</Tag>
                </Tooltip>
              )}
              {row.actualDate && <Tag color="success" style={{ margin: 0 }}>實際 {row.actualDate}</Tag>}
              {typeof rowSlip(row) === 'number' && (
                <Tag color={rowSlip(row)! > 0 ? 'error' : 'success'} style={{ margin: 0 }}>
                  {rowSlip(row)! > 0 ? `晚了 ${rowSlip(row)} 天` : '按時'}
                </Tag>
              )}
            </div>
            <Space size={12} wrap align="start">
              <Select
                style={{ width: 240 }}
                showSearch
                allowClear
                filterOption={false}
                placeholder="節點負責人"
                value={row.ownerUserId}
                onSearch={searchOwner}
                onChange={(val?: number) => {
                  const label = ownerOptions.find(o => o.value === val)?.label
                  update(row.code, { ownerUserId: val, ownerName: label })
                }}
                options={ownerOptions}
                notFoundContent="輸入姓名或工號搜索在職員工"
              />
              <DatePicker
                style={{ width: 160 }}
                placeholder="初步計劃 *"
                disabled={row.baselineLocked}
                value={row.preliminaryDate ?? null}
                onChange={d => update(row.code, { preliminaryDate: d })}
              />
              <DatePicker
                style={{ width: 160 }}
                placeholder="當前預測"
                value={row.forecastDate ?? null}
                onChange={d => update(row.code, { forecastDate: d })}
              />
              <Select
                style={{ width: 130 }}
                value={row.status}
                onChange={(v: RdmMilestoneStatus) => update(row.code, { status: v })}
                options={(Object.keys(RDM_MILESTONE_STATUS_LABEL) as RdmMilestoneStatus[]).map(key => ({
                  value: key,
                  label: RDM_MILESTONE_STATUS_LABEL[key],
                }))}
              />
            </Space>
            {row.status === RDM_MILESTONE_STATUS.NOT_APPLICABLE && (
              <Input
                style={{ maxWidth: 520, marginTop: 8 }}
                placeholder="不適用原因（必填），例：純後端需求，無 UI 變更"
                value={row.naReason ?? ''}
                onChange={e => update(row.code, { naReason: e.target.value })}
              />
            )}
          </div>
        ))}
      </Spin>

      <div className="form-footer">
        <Button onClick={() => navigate(`/rdm-detail?id=${reqId}`)}>取消</Button>
        {canFreeze && !allFrozen && (
          <Button icon={<LockOutlined />} onClick={handleFreeze}>凍結基線</Button>
        )}
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
          保存計劃
        </Button>
      </div>
    </div>
  )
}

/** 相对基线的偏差天数（未冻结基线时不计算，避免把「初步计划」当承诺考核） */
function rowSlip(row: MilestoneRow): number | null {
  if (!row.baselineDate || !row.actualDate) {
    return null
  }
  return dayjs(row.actualDate).diff(dayjs(row.baselineDate), 'day')
}
