/**
 * GovernancePanel —— 贡献预算、HR 绩效建议与指标口径（阶段 6）
 *
 * 挂在「效能量看板」页内而不是新建路由：
 * MenuTabs 的非菜单页名兜底表已满 20/20，新增独立页会撞 check:menu 门禁；
 * 而且预算、建议、口径本来就是「看分数」时要一起看到的东西，拆开反而没人看。
 *
 * 三块内容的共同点：它们回答的不是「谁分高」，而是「这个数凭什么能进考核」。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Collapse, DatePicker, Input, InputNumber, Modal, Progress, Select, Space, Table, Tag, Tooltip, message } from 'antd'
import type { TableColumnsType } from 'antd'
import dayjs from 'dayjs'
import {
  AuditOutlined,
  DeleteOutlined,
  FileProtectOutlined,
  PlusOutlined,
  RollbackOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons'
import {
  deleteScoreBudget,
  fetchHrSuggestions,
  fetchMetricCatalog,
  fetchScoreBudgets,
  generateHrSuggestions,
  pushHrSuggestions,
  recomputeSnapshot,
  reviewHrSuggestion,
  saveScoreBudget,
  withdrawHrSuggestion,
  type RdmHrSuggestionItem,
  type RdmMetricDefinition,
  type RdmScoreBudgetItem,
} from '../../../api/rdm'
import { fetchDepartments, type DepartmentItem } from '../../../api/department'
import {
  RDM_SUGGESTION_STATUS,
  RDM_SUGGESTION_STATUS_COLOR,
  RDM_SUGGESTION_STATUS_LABEL,
  type RdmSuggestionStatus,
} from '../../../constants/rdm'

interface GovernancePanelProps {
  /** 与看板共用当前周期，避免两处各选各的 */
  periodCode?: string
  editable: boolean
}

/** 建议的复核意见录入面板（行内展开，与流转处理/评审结论同法） */
interface ReviewDraft {
  id: number
  confirmed: boolean
}

export default function GovernancePanel({ periodCode, editable }: GovernancePanelProps) {
  const [budgets, setBudgets] = useState<RdmScoreBudgetItem[]>([])
  const [suggestions, setSuggestions] = useState<RdmHrSuggestionItem[]>([])
  const [metrics, setMetrics] = useState<RdmMetricDefinition[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [deptOptions, setDeptOptions] = useState<{ value: number; label: string }[]>([])
  /** 快照重算区间（行内面板，不用 window.prompt：原生框无法校验也拦不住误操作） */
  const [recomputeOpen, setRecomputeOpen] = useState(false)
  const [recomputeRange, setRecomputeRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  /** 正在新增/编辑的预算行 */
  const [budgetDraft, setBudgetDraft] = useState<RdmScoreBudgetItem | null>(null)
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null)
  const [reviewRemark, setReviewRemark] = useState('')
  const [withdrawTarget, setWithdrawTarget] = useState<RdmHrSuggestionItem | null>(null)
  const [withdrawReason, setWithdrawReason] = useState('')

  const load = useCallback(async () => {
    setBusy('load')
    try {
      const [b, s, m] = await Promise.all([
        fetchScoreBudgets(periodCode).catch(() => []),
        fetchHrSuggestions({ periodCode }).catch(() => []),
        fetchMetricCatalog().catch(() => []),
      ])
      setBudgets(b)
      setSuggestions(s)
      setMetrics(m)
    } finally {
      setBusy(null)
    }
  }, [periodCode])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    fetchDepartments()
      .then((list: DepartmentItem[]) => setDeptOptions((list ?? []).map(d => ({ value: d.id, label: d.name }))))
      .catch(() => setDeptOptions([]))
  }, [])

  /** 按分组整理指标字典，前端不再各写一份解释 */
  const metricGroups = useMemo(() => {
    const map = new Map<string, RdmMetricDefinition[]>()
    metrics.forEach(m => {
      const key = m.group ?? '其他'
      map.set(key, [...(map.get(key) ?? []), m])
    })
    return [...map.entries()]
  }, [metrics])

  const handleSaveBudget = async () => {
    if (!budgetDraft) {
      return
    }
    if (!budgetDraft.scoreBudget || budgetDraft.scoreBudget <= 0) {
      message.warning('預算上限必須大於 0')
      return
    }
    if (!budgetDraft.remark?.trim()) {
      message.warning('預算必須填寫依據（人力/迭代容量/歷史均值）')
      return
    }
    setBusy('budget')
    try {
      await saveScoreBudget({ ...budgetDraft, periodCode })
      message.success('預算已保存')
      setBudgetDraft(null)
      await load()
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '保存失敗')
      throw err
    } finally {
      setBusy(null)
    }
  }

  const handleDeleteBudget = (row: RdmScoreBudgetItem) => {
    Modal.confirm({
      title: '確認刪除該筆預算？',
      className: 'custom-confirm-modal',
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>週期：</span><b>{row.periodCode}</b></div>
          <div className="confirm-info-row"><span>適用：</span><b>{row.deptName ?? '全員'}</b></div>
          <div className="confirm-info-row"><span>影響：</span><b>刪除後該範圍不再有超限預警，建議值仍會照常生成</b></div>
        </div>
      ),
      okText: '確認刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await deleteScoreBudget(row.id as number)
        message.success('預算已刪除')
        await load()
      },
    })
  }

  const handleGenerate = () => {
    Modal.confirm({
      title: '重新聚合績效建議？',
      className: 'custom-confirm-modal',
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>依據：</span><b>當前周期的積分流水</b></div>
          <div className="confirm-info-row"><span>已確認的建議：</span><b>分數變化時會退回「待復核」，不會带着旧确认推送新数字</b></div>
        </div>
      ),
      okText: '開始聚合',
      cancelText: '取消',
      onOk: async () => {
        setBusy('generate')
        try {
          const count = await generateHrSuggestions(periodCode)
          message.success(`已聚合 ${count} 位成員的建議，等待復核`)
          await load()
        } catch (err) {
          message.error(err instanceof Error && err.message ? err.message : '聚合失敗')
          throw err
        } finally {
          setBusy(null)
        }
      },
    })
  }

  const handleReview = async () => {
    if (!reviewDraft) {
      return
    }
    if (!reviewDraft.confirmed && !reviewRemark.trim()) {
      message.warning('駁回必須寫明原因')
      return
    }
    setBusy('review')
    try {
      await reviewHrSuggestion(reviewDraft.id, { confirmed: reviewDraft.confirmed, remark: reviewRemark.trim() || undefined })
      message.success(reviewDraft.confirmed ? '已確認，可推送' : '已駁回')
      setReviewDraft(null)
      setReviewRemark('')
      await load()
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '復核失敗')
    } finally {
      setBusy(null)
    }
  }

  const handlePush = () => {
    const confirmed = suggestions.filter(s => s.status === RDM_SUGGESTION_STATUS.CONFIRMED)
    Modal.confirm({
      title: '推送已確認的建議值？',
      className: 'custom-confirm-modal',
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>人數：</span><b>{confirmed.length} 位（僅推「已確認」狀態）</b></div>
          <div className="confirm-info-row"><span>寫入通道：</span><b>只寫考核單的「建議值」，自評/主管評/最終分由 HR 校准</b></div>
          <div className="confirm-info-row"><span>可撤回：</span><b>推送後可在本頁撤回，撤回會清空建議值並留原因</b></div>
        </div>
      ),
      okText: '確認推送',
      cancelText: '取消',
      onOk: async () => {
        setBusy('push')
        try {
          const count = await pushHrSuggestions(periodCode)
          message.success(`已推送 ${count} 位成員的建議值`)
          await load()
        } catch (err) {
          message.error(err instanceof Error && err.message ? err.message : '推送失敗')
          throw err
        } finally {
          setBusy(null)
        }
      },
    })
  }

  const handleWithdraw = async () => {
    if (!withdrawTarget) {
      return
    }
    if (!withdrawReason.trim()) {
      message.warning('撤回必須填寫原因')
      return
    }
    setBusy('withdraw')
    try {
      await withdrawHrSuggestion(withdrawTarget.id, withdrawReason.trim())
      message.success('已撤回，考核單建議值已清空')
      setWithdrawTarget(null)
      setWithdrawReason('')
      await load()
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '撤回失敗')
    } finally {
      setBusy(null)
    }
  }

  const handleRecompute = async () => {
    if (!recomputeRange || !recomputeRange[0] || !recomputeRange[1]) {
      message.warning('請選擇重算的起止日期')
      return
    }
    setBusy('recompute')
    try {
      const days = await recomputeSnapshot(recomputeRange[0].format('YYYY-MM-DD'), recomputeRange[1].format('YYYY-MM-DD'))
      message.success(`已重算 ${days} 天的快照`)
      setRecomputeOpen(false)
      setRecomputeRange(null)
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '重算失敗')
    } finally {
      setBusy(null)
    }
  }

  const budgetColumns: TableColumnsType<RdmScoreBudgetItem> = [
    { title: '適用範圍', dataIndex: 'deptName', key: 'deptName', width: 160, render: (v: string) => v || '全員' },
    { title: '預算上限', dataIndex: 'scoreBudget', key: 'scoreBudget', width: 110 },
    { title: '已產生', dataIndex: 'used', key: 'used', width: 100 },
    {
      title: '占用',
      key: 'ratio',
      width: 190,
      render: (_, r) => (
        <Space size={6}>
          <Progress
            percent={Math.min(100, Number(r.usedRatio ?? 0))}
            size="small"
            status={r.over ? 'exception' : r.warning ? 'active' : 'normal'}
            style={{ width: 110 }}
          />
          <span style={{ fontSize: 12, color: '#595959' }}>{r.usedRatio ?? 0}%</span>
          {r.over && <Tag color="error" style={{ margin: 0 }}>超預算</Tag>}
          {!r.over && r.warning && <Tag color="warning" style={{ margin: 0 }}>接近上限</Tag>}
        </Space>
      ),
    },
    { title: '依據', dataIndex: 'remark', key: 'remark', ellipsis: true },
    {
      title: '操作',
      key: 'action',
      width: 130,
      render: (_, r) => (
        <Space size={0}>
          {editable && (
            <>
              <Button type="link" size="small" onClick={() => setBudgetDraft({ ...r })}>編輯</Button>
              <span className="action-split">|</span>
            </>
          )}
          <Button type="link" size="small" onClick={() => setBudgetDraft({ ...r, id: undefined, deptId: undefined })}>
            另存一份
          </Button>
          {editable && (
            <>
              <span className="action-split">|</span>
              <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteBudget(r)}>刪除</Button>
            </>
          )}
        </Space>
      ),
    },
  ]

  const suggestionColumns: TableColumnsType<RdmHrSuggestionItem> = [
    {
      title: '成員',
      key: 'user',
      width: 170,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 500, color: '#262626' }}>{r.userName ?? `#${r.userId}`}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{r.empNo ?? '-'} · {r.deptName ?? '未歸屬部門'}</div>
        </div>
      ),
    },
    {
      title: '貢獻分',
      dataIndex: 'totalScore',
      key: 'totalScore',
      width: 130,
      sorter: (a, b) => Number(a.totalScore ?? 0) - Number(b.totalScore ?? 0),
      render: (_, r) => (
        <Space size={4}>
          <b style={{ color: '#E8720C' }}>{Number(r.totalScore ?? 0).toFixed(1)}</b>
          {r.overBudget && (
            <Tooltip title={`部門預算已用 ${r.budgetUsedRatio ?? 0}%，超限需書面說明才能推送`}>
              <Tag color="error" style={{ margin: 0 }}>超限</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '依據',
      key: 'basis',
      width: 210,
      render: (_, r) => (
        <span style={{ fontSize: 12, color: '#595959' }}>
          {r.recordCount ?? 0} 條流水 · {r.deliveredCount ?? 0} 個交付
          {r.avgAcceptanceScore ? ` · 滿意度 ${Number(r.avgAcceptanceScore).toFixed(1)}/5` : ''}
          {r.firstPassCount ? ` · 一次通過 ${r.firstPassCount}` : ''}
          {r.ruleVersion ? ` · 規則 v${r.ruleVersion}` : ''}
        </span>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (v: string, r) => (
        <Space size={4} direction="vertical">
          <Tag color={RDM_SUGGESTION_STATUS_COLOR[v as RdmSuggestionStatus] ?? 'default'} style={{ margin: 0 }}>
            {RDM_SUGGESTION_STATUS_LABEL[v as RdmSuggestionStatus] ?? v}
          </Tag>
          {r.reviewerName && (
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{r.reviewerName} · {r.reviewTime}</span>
          )}
        </Space>
      ),
    },
    { title: '復核意見', dataIndex: 'reviewRemark', key: 'reviewRemark', ellipsis: true },
    {
      title: '操作',
      key: 'action',
      width: 170,
      render: (_, r) => {
        if (!r.actionable && !editable) {
          return <span style={{ fontSize: 12, color: '#8C8C8C' }}>{r.blockedReason ?? '-'}</span>
        }
        return (
          <Space size={0}>
            {editable && r.actionable && (
              <>
                <Button type="link" size="small" icon={<AuditOutlined />}
                  onClick={() => { setReviewDraft({ id: r.id, confirmed: true }); setReviewRemark(r.reviewRemark ?? '') }}
                >
                  確認
                </Button>
                <span className="action-split">|</span>
                <Button type="link" size="small" danger onClick={() => { setReviewDraft({ id: r.id, confirmed: false }); setReviewRemark('') }}>
                  駁回
                </Button>
                <span className="action-split">|</span>
              </>
            )}
            {editable && r.status === RDM_SUGGESTION_STATUS.PUSHED && (
              <Button type="link" size="small" icon={<RollbackOutlined />}
                onClick={() => { setWithdrawTarget(r); setWithdrawReason('') }}
              >
                撤回
              </Button>
            )}
            {!editable && !r.actionable && <span style={{ fontSize: 12, color: '#8C8C8C' }}>{r.blockedReason ?? '只讀'}</span>}
          </Space>
        )
      },
    },
  ]

  return (
    <>
      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}><FileProtectOutlined /></span>
          貢獻分預算
          <span className="rdm-card-title-split" />
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>
            預算只用于超限預警，不會自動折算個人分數——折算會讓分數取決於同期他人產出
          </span>
        </div>

        <Table<RdmScoreBudgetItem>
          rowKey={r => `${r.id ?? 'new'}-${r.deptId ?? 0}`}
          size="small"
          columns={budgetColumns}
          dataSource={budgets}
          pagination={false}
          loading={busy === 'load'}
          locale={{ emptyText: '本周期還沒有預算（不配也能出分，只是没有超限预警）' }}
        />

        {editable && (
          budgetDraft ? (
            <div className="rdm-action-panel" style={{ marginTop: 10 }}>
              <div className="rdm-action-panel-title">{budgetDraft.id ? '調整預算' : '新增預算'}</div>
              <Space wrap align="end">
                <Select
                  style={{ width: 200 }}
                  allowClear
                  placeholder="適用部門（不選=全員）"
                  value={budgetDraft.deptId ?? undefined}
                  options={deptOptions}
                  onChange={v => setBudgetDraft({ ...budgetDraft, deptId: v ?? 0 })}
                />
                <InputNumber
                  style={{ width: 150 }}
                  min={1}
                  addonBefore="上限"
                  value={budgetDraft.scoreBudget}
                  onChange={v => setBudgetDraft({ ...budgetDraft, scoreBudget: typeof v === 'number' ? v : 0 })}
                />
                <InputNumber
                  style={{ width: 150 }}
                  min={0}
                  max={500}
                  addonAfter="%預警"
                  value={budgetDraft.warningRatio ?? 80}
                  onChange={v => setBudgetDraft({ ...budgetDraft, warningRatio: typeof v === 'number' ? v : 80 })}
                />
                <Input
                  style={{ width: 300 }}
                  placeholder="預算依據（必填）"
                  value={budgetDraft.remark ?? ''}
                  onChange={e => setBudgetDraft({ ...budgetDraft, remark: e.target.value })}
                />
                <Button type="primary" icon={<SaveOutlined />} loading={busy === 'budget'} onClick={() => void handleSaveBudget()}>
                  保存
                </Button>
                <Button onClick={() => setBudgetDraft(null)}>取消</Button>
              </Space>
            </div>
          ) : (
            <Button
              size="small"
              icon={<PlusOutlined />}
              style={{ marginTop: 10 }}
              onClick={() => setBudgetDraft({ periodCode: periodCode ?? '', scoreBudget: 0, deptId: 0 })}
            >
              新增預算
            </Button>
          )
        )}
      </div>

      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}><AuditOutlined /></span>
          HR 績效建議
          <span className="rdm-card-title-split" />
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>
            積分 → 人工復核 → 推送建議值；自評/主管評/最終分仍由 HR 校准
          </span>
          <Space size={8} style={{ marginLeft: 'auto' }}>
            {editable && (
              <>
                <Button size="small" loading={busy === 'generate'} onClick={handleGenerate}>聚合建議</Button>
                <Button
                  size="small"
                  type="primary"
                  icon={<SendOutlined />}
                  loading={busy === 'push'}
                  disabled={!suggestions.some(s => s.status === RDM_SUGGESTION_STATUS.CONFIRMED)}
                  onClick={handlePush}
                >
                  推送已確認
                </Button>
              </>
            )}
          </Space>
        </div>

        {suggestions.length === 0 ? (
          <Alert
            type="info"
            showIcon
            message="本周期還沒有績效建議"
            description="需先完成積分重算，再點「聚合建議」；没有流水依据时不会生成建议，避免把没有证据的数字送进考核。"
          />
        ) : (
          <Table<RdmHrSuggestionItem>
            rowKey="id"
            size="small"
            columns={suggestionColumns}
            dataSource={suggestions}
            loading={busy === 'load'}
            scroll={{ x: 1050 }}
            pagination={{ pageSize: 10, showTotal: t => `共 ${t} 條` }}
          />
        )}

        {reviewDraft && (
          <div className="rdm-action-panel" style={{ marginTop: 10 }}>
            <div className="rdm-action-panel-title">
              {reviewDraft.confirmed ? '確認該成員的績效建議' : '駁回該成員的績效建議'}
            </div>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Input.TextArea
                rows={2}
                value={reviewRemark}
                placeholder={reviewDraft.confirmed
                  ? '復核說明（超限人員必填），例：本迭代含兩次線上支援，分數已核對流水'
                  : '駁回原因（必填），例：工時漏報導致分數偏低，下个周期重算'}
                onChange={e => setReviewRemark(e.target.value)}
              />
              <Space>
                <Button type="primary" loading={busy === 'review'} onClick={() => void handleReview()}>
                  {reviewDraft.confirmed ? '確認' : '駁回'}
                </Button>
                <Button onClick={() => { setReviewDraft(null); setReviewRemark('') }}>取消</Button>
              </Space>
            </Space>
          </div>
        )}
      </div>

      <Modal
        title="撤回已推送的建議值"
        open={!!withdrawTarget}
        className="custom-confirm-modal"
        okText="確認撤回"
        cancelText="取消"
        confirmLoading={busy === 'withdraw'}
        onOk={() => void handleWithdraw()}
        onCancel={() => { setWithdrawTarget(null); setWithdrawReason('') }}
      >
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>成員：</span><b>{withdrawTarget?.userName ?? '-'}</b></div>
          <div className="confirm-info-row"><span>影響：</span><b>考核單上的建議值會被清空，本地留撤回痕跡</b></div>
          <Input
            style={{ marginTop: 8 }}
            placeholder="撤回原因（必填）"
            value={withdrawReason}
            onChange={e => setWithdrawReason(e.target.value)}
          />
        </div>
      </Modal>

      {/* 指标字典：口径的唯一出处，避免看板/快照/绩效三处各写一份解释 */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          指標口徑字典
          <span className="rdm-card-title-split" />
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>
            每個数都應能回答：怎麼算的、能不能回算、哪里会误读
          </span>
          {editable && (
            <Button size="small" style={{ marginLeft: 'auto' }} onClick={() => setRecomputeOpen(true)}>重算歷史快照</Button>
          )}
        </div>

        {recomputeOpen && (
          <div className="rdm-action-panel" style={{ marginBottom: 10 }}>
            <div className="rdm-action-panel-title">重算效能量快照（單次最多 180 天）</div>
            <Space wrap align="end">
              <DatePicker.RangePicker
                value={recomputeRange}
                allowClear
                onChange={v => setRecomputeRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                placeholder={['起始日', '結束日']}
              />
              <Button type="primary" loading={busy === 'recompute'} onClick={() => Modal.confirm({
                title: '確認重算歷史快照？',
                className: 'custom-confirm-modal',
                content: (
                  <div className="confirm-info-card">
                    <div className="confirm-info-row"><span>區間：</span><b>{recomputeRange ? `${recomputeRange[0].format('YYYY-MM-DD')} 至 ${recomputeRange[1].format('YYYY-MM-DD')}` : '-'}</b></div>
                    <div className="confirm-info-row"><span>影響：</span><b>会覆盖这些日期的快照行，但不改需求與流水原始數據</b></div>
                  </div>
                ),
                okText: '開始重算',
                cancelText: '返回',
                onOk: () => handleRecompute(),
              })}>開注重算</Button>
              <Button onClick={() => { setRecomputeOpen(false); setRecomputeRange(null) }}>取消</Button>
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>只覆盖快照表，不改需求與流水原始數據</span>
            </Space>
          </div>
        )}
        {metrics.length === 0 ? (
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>指標字典載入中，或後端不可用（本頁僅作展示，不影響數據）。</div>
        ) : (
          <Collapse
            size="small"
            items={metricGroups.map(([group, list]) => ({
              key: group,
              label: `${group}（${list.length}）`,
              children: (
                <Table<RdmMetricDefinition>
                  rowKey="code"
                  size="small"
                  pagination={false}
                  dataSource={list}
                  columns={[
                    { title: '指標', dataIndex: 'name', key: 'name', width: 150 },
                    { title: '口徑', dataIndex: 'formula', key: 'formula' },
                    { title: '事實來源', dataIndex: 'source', key: 'source', width: 220 },
                    {
                      title: '可回算',
                      dataIndex: 'recomputeable',
                      key: 'recomputeable',
                      width: 90,
                      render: (v: boolean) => (v
                        ? <Tag color="success" style={{ margin: 0 }}>是</Tag>
                        : <Tag color="default" style={{ margin: 0 }}>否</Tag>),
                    },
                    { title: '易誤讀處', dataIndex: 'caveat', key: 'caveat', width: 260 },
                  ]}
                />
              ),
            }))}
          />
        )}
      </div>
    </>
  )
}
