/**
 * GanttChart —— 需求交付甘特与关键路径（阶段 5，首期只读图形 + 依赖维护）
 *
 * 为什么自绘 SVG 而不引甘特库：项目已有多余的图表依赖风险，甘特只需要
 * 「按天平铺的条 + 依赖折线 + 里程碑菱形」，200 行内可控且能贴合设计令牌。
 *
 * 界面口径（与后端一致，不做二次解释）：
 * 1. 条的位置来自服务端排程（依赖 + 该人工作日历推演），不是人填的计划日期；
 *    两条都画：浅色是人工计划，主色是推演结果，一眼看出计划与现实的差距。
 * 2. 关键路径用主色描边，非关键任务显示松弛天数——只有这样才能回答「延一个任务会不会拖上线」。
 * 3. 依赖成环时不画关键路径，直接提示先修数据：画一条假的最长路径比承认算不出更危险。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, InputNumber, Modal, Select, Space, Tag, Tooltip, message } from 'antd'
import { DeleteOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useSearchParams } from 'react-router-dom'
import {
  addDependency,
  fetchDependencies,
  fetchRequirementPage,
  fetchSchedulePlan,
  removeDependency,
  type RdmScheduleBar,
  type RdmScheduleDependency,
  type RdmSchedulePlan,
} from '../../../api/rdm'
import { RDM_TASK_STATUS, RDM_TASK_TYPE_COLOR, type RdmTaskType } from '../../../constants/rdm'

/** 一天的像素宽度：太窄看不清依赖线，太宽一屏放不下一个月 */
const DAY_W = 26
/** 左侧任务名栏宽度 */
const LABEL_W = 210
/** 单行高度 */
const ROW_H = 34
/** 里程碑泳道高度 */
const LANE_H = 26

interface GanttChartProps {
  editable: boolean
}

/** 依赖候选任务（排除自己） */
function taskOptions(bars: RdmScheduleBar[], exclude?: number) {
  return bars
    .filter(b => b.taskId !== exclude)
    .map(b => ({ value: b.taskId, label: `${b.taskNo ?? b.taskId} ${b.title}` }))
}

export default function GanttChart({ editable }: GanttChartProps) {
  const [searchParams] = useSearchParams()
  const [reqId, setReqId] = useState<number>(() => Number(searchParams.get('reqId') ?? 0))
  const [options, setOptions] = useState<{ value: number; label: string }[]>([])
  const [plan, setPlan] = useState<RdmSchedulePlan | null>(null)
  const [deps, setDeps] = useState<RdmScheduleDependency[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [predId, setPredId] = useState<number | undefined>()
  const [succId, setSuccId] = useState<number | undefined>()
  const [lag, setLag] = useState<number>(0)

  /** 需求候选：交付中的需求最常被看，先取这一批，关键词搜索覆盖其余 */
  const loadOptions = useCallback(async (keyword?: string) => {
    try {
      const page = await fetchRequirementPage({ page: 1, size: 50, keyword: keyword || undefined })
      setOptions((page.records ?? []).map(r => ({ value: r.id, label: `${r.reqNo} ${r.title}` })))
      if (!reqId && page.records?.length) {
        setReqId(page.records[0].id)
      }
    } catch {
      message.error('需求列表載入失敗')
    }
  }, [reqId])

  useEffect(() => { void loadOptions() }, [loadOptions])

  const load = useCallback(async () => {
    if (!reqId) {
      setPlan(null)
      setDeps([])
      return
    }
    setLoading(true)
    try {
      const [nextPlan, nextDeps] = await Promise.all([
        fetchSchedulePlan(reqId).catch(() => null),
        fetchDependencies(reqId).catch(() => []),
      ])
      setPlan(nextPlan)
      setDeps(nextDeps)
    } finally {
      setLoading(false)
    }
  }, [reqId])

  useEffect(() => { void load() }, [load])

  /** 甘特窗口：至少覆盖到今天，避免条全部落在可视区外 */
  const [start, days] = useMemo(() => {
    const from = plan?.windowStart ? dayjs(plan.windowStart) : dayjs().startOf('day')
    let to = plan?.windowEnd ? dayjs(plan.windowEnd) : from.add(14, 'day')
    if (to.isBefore(dayjs(), 'day')) {
      to = dayjs().endOf('day')
    }
    const count = Math.max(7, to.diff(from, 'day') + 1)
    return [from, count] as const
  }, [plan])

  /** plan 每次刷新都是新对象，先固定 bars 引用，避开下游 useMemo 失效 */
  const bars = useMemo(() => plan?.bars ?? [], [plan])
  const width = LABEL_W + days * DAY_W
  const height = LANE_H + bars.length * ROW_H + 12

  /** 某任务所在行的 y（按 bars 顺序） */
  const rowIndex = useMemo(() => {
    const map = new Map<number, number>()
    bars.forEach((b, i) => map.set(b.taskId, i))
    return map
  }, [bars])

  const xOfDay = useCallback((date?: string | null) => {
    if (!date) {
      return null
    }
    return LABEL_W + dayjs(date).diff(start, 'day') * DAY_W
  }, [start])

  const handleAdd = async () => {
    if (!predId || !succId) {
      message.warning('請選擇前置任務與後續任務')
      return
    }
    setSaving(true)
    try {
      await addDependency({ reqId, predTaskId: predId, succTaskId: succId, lagDays: lag || undefined })
      message.success('依賴已建立，排程已重算')
      setPredId(undefined)
      setSuccId(undefined)
      setLag(0)
      await load()
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '依賴建立失敗')
    } finally {
      setSaving(false)
    }
  }

  /** 删除依赖会重算关键路径，属于危险动作：必须二次确认并说明后果 */
  const handleRemove = (dep: RdmScheduleDependency) => {
    Modal.confirm({
      title: '確認刪除這條依賴？',
      className: 'custom-confirm-modal',
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>影響：</span><b>兩張任務變成可並行，關鍵路徑與預計完工日会重算</b></div>
          <div className="confirm-info-row"><span>前置：</span><b>{dep.predTaskTitle ?? `#${dep.predTaskId}`}</b></div>
          <div className="confirm-info-row"><span>後續：</span><b>{dep.succTaskTitle ?? `#${dep.succTaskId}`}</b></div>
        </div>
      ),
      okText: '確認刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await removeDependency(dep.id)
          message.success('依賴已刪除，關鍵路徑已重算')
          await load()
        } catch (err) {
          message.error(err instanceof Error && err.message ? err.message : '刪除失敗，請重試')
          throw err
        }
      },
    })
  }

  if (!reqId) {
    return <Alert type="info" showIcon message="請先選擇需求" description="甘圖按單條需求展開：跨需求的时间线由迭代排期负责。" />
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Space wrap>
        <Select
          style={{ minWidth: 320 }}
          showSearch
          value={reqId}
          options={options}
          filterOption={false}
          onSearch={kw => void loadOptions(kw)}
          onChange={v => setReqId(v)}
          placeholder="選擇需求"
        />
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>刷新</Button>
        {plan?.forecastFinish && (
          <Tag color="processing" style={{ margin: 0 }}>
            按現行依賴與日历，預計 {plan.forecastFinish} 完成
          </Tag>
        )}
      </Space>

      {plan?.cyclic && (
        <Alert
          type="error"
          showIcon
          message="依賴存在循環（A→B→…→A），無法計算關鍵路徑"
          description="请先删除成环的依赖再查看排程；这时下方只画人工计划日期，不画推演结果。"
        />
      )}

      {!bars.length && !loading ? (
        <Alert type="info" showIcon message="該需求尚未拆解任務" description="拆解任務後甘特图才会出现条形与依赖。" />
      ) : (
        <div className="rdm-gantt-scroll">
          <svg width={width} height={height} role="img" aria-label="需求甘特图">
            {/* 顶部：日期刻度与里程碑泳道 */}
            {Array.from({ length: days }).map((_, i) => {
              const day = start.add(i, 'day')
              const weekend = day.day() === 0 || day.day() === 6
              return (
                <g key={`head-${i}`}>
                  <rect
                    x={LABEL_W + i * DAY_W}
                    y={LANE_H - 18}
                    width={DAY_W}
                    height={height}
                    fill={weekend ? '#FAFAFA' : 'transparent'}
                  />
                  <text
                    x={LABEL_W + i * DAY_W + DAY_W / 2}
                    y={LANE_H - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fill={weekend ? '#8C8C8C' : '#595959'}
                  >
                    {day.format('MM/DD')}
                  </text>
                </g>
              )
            })}

            {/* 里程碑菱形：基线（虚位）与实际（实心） */}
            {(plan?.milestones ?? []).map((ms, i) => {
              const x = xOfDay(ms.baselineDate ?? ms.forecastDate ?? ms.actualDate)
              if (x == null) {
                return null
              }
              const slipped = (ms.slipDays ?? 0) > 0
              return (
                <g key={`ms-${ms.code}-${i}`}>
                  <polygon
                    points={`${x},${LANE_H - 2} ${x + 6},${LANE_H + 4} ${x},${LANE_H + 10} ${x - 6},${LANE_H + 4}`}
                    fill={slipped ? '#FF4D4F' : '#52C41A'}
                    opacity={0.9}
                  >
                    <title>{`${ms.name ?? ms.code} 基線 ${ms.baselineDate ?? '-'}／實際 ${ms.actualDate ?? '未完成'}`}</title>
                  </polygon>
                </g>
              )
            })}

            {bars.map((bar, i) => {
              const y = LANE_H + i * ROW_H
              const planX = xOfDay(bar.planStartDate)
              const planEnd = xOfDay(bar.planFinishDate)
              const es = xOfDay(bar.earliestStart)
              const ef = xOfDay(bar.earliestFinish)
              const typeColor = RDM_TASK_TYPE_COLOR[bar.taskType as RdmTaskType] ?? '#E8720C'
              const done = bar.status === RDM_TASK_STATUS.DONE
              return (
                <g key={bar.taskId}>
                  <text x={8} y={y + ROW_H / 2 + 4} fontSize={12} fill="#262626">
                    {bar.title.length > 14 ? `${bar.title.slice(0, 14)}…` : bar.title}
                  </text>
                  {/* 人工计划（浅色底条） */}
                  {planX != null && planEnd != null && planEnd >= planX && (
                    <rect x={planX} y={y + 10} width={Math.max(DAY_W, planEnd - planX + DAY_W)} height={12} rx={6} fill="#F0F0F0" />
                  )}
                  {/* 排程推演条 */}
                  {es != null && ef != null && (
                    <>
                      <rect
                        x={es}
                        y={y + 7}
                        width={Math.max(DAY_W, ef - es + DAY_W)}
                        height={18}
                        rx={4}
                        fill={done ? '#F6FFED' : '#FFF7E6'}
                        stroke={bar.critical ? '#E8720C' : 'transparent'}
                        strokeWidth={bar.critical ? 2 : 0}
                      />
                      <rect
                        x={es}
                        y={y + 7}
                        width={Math.max(2, (Math.max(DAY_W, ef - es + DAY_W)) * ((bar.progress ?? 0) / 100))}
                        height={18}
                        rx={4}
                        fill={typeColor}
                        opacity={done ? 0.45 : 0.8}
                      >
                        <title>{`${bar.title} ${bar.progress ?? 0}% · ${bar.ownerName ?? '未指派'} · ${bar.planHours ?? 0}h`}</title>
                      </rect>
                    </>
                  )}
                  {bar.overdue && <circle cx={(ef ?? planX ?? LABEL_W) + DAY_W + 8} cy={y + ROW_H / 2} r={3} fill="#FF4D4F" />}
                </g>
              )
            })}

            {/* 依赖折线：前驱完成日 → 后继开始日 */}
            {(plan?.links ?? []).map(link => {
              const from = bars.find(b => b.taskId === link.predTaskId)
              const to = bars.find(b => b.taskId === link.succTaskId)
              const fi = rowIndex.get(link.predTaskId)
              const ti = rowIndex.get(link.succTaskId)
              if (!from || !to || fi == null || ti == null) {
                return null
              }
              const x1 = (xOfDay(from.earliestFinish) ?? 0) + DAY_W
              const y1 = LANE_H + fi * ROW_H + ROW_H / 2
              const x2 = xOfDay(to.earliestStart) ?? 0
              const y2 = LANE_H + ti * ROW_H + ROW_H / 2
              const mid = Math.max(x1 + 8, x2 - 10)
              return (
                <polyline
                  key={`link-${link.id}`}
                  points={`${x1},${y1} ${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke="#BFBFBF"
                  strokeWidth={1.2}
                />
              )
            })}
          </svg>
        </div>
      )}

      {/* 依赖维护：删除是关键路径事实的变更，走二次确认；新增用行内表单不开弹窗 */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          任務依賴
          <span className="rdm-card-title-split" />
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>
            只支持「完成→開始」（FS），可加減工作日延遲；成環會被服务端拒绝
          </span>
        </div>
        {deps.length === 0 && (
          <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>尚未設定依賴，所有任務會被視為可並行。</div>
        )}
        {deps.map(d => (
          <div key={d.id} className="rdm-delivery-row">
            <Tag color="blue" style={{ margin: 0 }}>FS</Tag>
            <span className="rdm-delivery-row-main">
              <b style={{ fontWeight: 500 }}>{d.predTaskTitle ?? `#${d.predTaskId}`}</b>
              <span style={{ margin: '0 8px' }}>→</span>
              <b style={{ fontWeight: 500 }}>{d.succTaskTitle ?? `#${d.succTaskId}`}</b>
              {d.lagDays ? <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 8 }}>延遲 {d.lagDays} 工作日</span> : null}
            </span>
            {editable && (
              <>
                <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleRemove(d)}>刪除</Button>
                <span className="action-split">|</span>
                <Tooltip title="刪除後兩張任務變成可並行，關鍵路徑會重算">
                  <span style={{ fontSize: 12, color: '#8C8C8C' }}>影響排程</span>
                </Tooltip>
              </>
            )}
          </div>
        ))}

        {editable && (
          <Space wrap style={{ marginTop: 10 }}>
            <Select
              style={{ minWidth: 240 }}
              placeholder="前置任務"
              value={predId}
              showSearch
              optionFilterProp="label"
              options={taskOptions(bars, succId)}
              onChange={setPredId}
            />
            <span style={{ color: '#8C8C8C' }}>完成後 →</span>
            <Select
              style={{ minWidth: 240 }}
              placeholder="後續任務"
              value={succId}
              showSearch
              optionFilterProp="label"
              options={taskOptions(bars, predId)}
              onChange={setSuccId}
            />
            <InputNumber
              style={{ width: 130 }}
              min={-60}
              max={60}
              value={lag}
              addonAfter="工作日"
              onChange={v => setLag(typeof v === 'number' ? v : 0)}
            />
            <Button type="primary" icon={<PlusOutlined />} loading={saving} onClick={() => void handleAdd()}>
              建立依賴
            </Button>
          </Space>
        )}
      </div>
    </Space>
  )
}
