/**
 * 分配产品经理 —— 需求池/技术负责人视角的独立操作页
 *
 * 为什么不用弹窗（AGENTS.md §9.1）：分配会改变需求归属、直接让需求跳出需求池并通知产品经理，
 * 属于有副作用的正式操作；独立页面能列出被分配的每条需求、能刷新、能从详情页回跳，
 * 出问题时也知道自己在动哪些单子。弹窗里只放一个下拉，用户确认后根本不知道动了谁。
 *
 * 阶段 2C 的交互口径：
 * - 候选人从裸下拉换成卡片，把「负责域 / 在途 / 容量 / 推荐理由」一次看全，
 *   并按领域命中与剩余容量排序，避免靠记忆派人；
 * - 改派已接通（旧受理人仅失去本单操作资格，历史贡献保留），改派原因必填；
 * - 认领不在本页：它是 PM 自需求池抢单的动作，入口在需求池列表的「認領」。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Input, Modal, Segmented, Space, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { CheckCircleOutlined, SendOutlined, UserSwitchOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import RdmFormHeader from './components/RdmFormHeader'
import {
  batchAssign,
  fetchProductOptions,
  fetchRequirementDetail,
  reassignPm,
  type RdmProductOption,
  type RdmRequirementDetail,
} from '../../api/rdm'
import { RDM_PRIORITY_LABEL, RDM_STATUS, RDM_STATUS_COLOR, RDM_STATUS_LABEL, type RdmPriority, type RdmStatus } from '../../constants/rdm'
import './index.css'

/** 选中的产品经理（确认框与提交都要用名字，避免提交后再去反查） */
interface PickedPm {
  userId: number
  name: string
  loadText: string
}

/** 分派模式：只分需求池里的单，还是把已受理的单改派给别人 */
type AssignMode = 'DISPATCH' | 'REASSIGN'

export default function AssignPm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const idsParam = searchParams.get('ids') ?? ''
  // useMemo 让 ids 引用稳定：它每次渲染重建会让下面的 useCallback 失效（依赖里必须能安全写 ids）
  const ids = useMemo(() => idsParam
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n > 0), [idsParam])

  const [rows, setRows] = useState<RdmRequirementDetail[]>([])
  const [pmOptions, setPmOptions] = useState<RdmProductOption[]>([])
  const [picked, setPicked] = useState<PickedPm | null>(null)
  const [mode, setMode] = useState<AssignMode>('DISPATCH')
  /** 改派原因：会写进状态流水并通知三方，不能省 */
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  /**
   * 分配完回到来源入口（back 由列表页带完整路径 + 视角过来，所以需求池回来需求池、清单回来清单）。
   * <p>只接受站内相对路径：拒绝 `//` 开头的协议相对地址，避免外部站点被拼进 navigate。
   */
  const backParam = searchParams.get('back')
  const backPath = backParam && backParam.startsWith('/') && !backParam.startsWith('//')
    ? backParam
    : '/rdm-requirement'

  const load = useCallback(async () => {
    if (ids.length === 0) {
      setLoading(false)
      return
    }
    setLoading(true)
    // 逐条取详情：列表接口按视角过滤，跨视角批量选中时可能查不全，逐条取最稳
    const list = await Promise.all(ids.map(id => fetchRequirementDetail(id).catch(() => null)))
    setRows(list.filter((r): r is RdmRequirementDetail => !!r))
    setLoading(false)
  }, [ids])

  useEffect(() => {
    fetchProductOptions().then(setPmOptions).catch(() => setPmOptions([]))
  }, [])

  useEffect(() => { void load() }, [load])

  /** 从被选需求里抽出领域匹配关键词（系统名 / 菜单名 / 提出部门） */
  const matchKeywords = useMemo(() => {
    const set = new Set<string>()
    rows.forEach(r => {
      if (r.submitDeptName) set.add(r.submitDeptName)
      ;(r.targets ?? []).forEach(t => {
        if (t.systemName) set.add(t.systemName)
        if (t.menuName) set.add(t.menuName)
      })
    })
    return [...set]
  }, [rows])

  /**
   * 候选人排序：领域命中优先，其次剩余容量多者。
   * <p>为什么先在前端算匹配：分派要在点下去之前就说清「凭什么推这个人」；
   * 阶段 2C 会把同一口径落到服务端（分发矩阵 + 负载）并成为分派资格校验，
   * 所以这里的匹配只是展示依据，不能当成权限或限制。
   */
  const candidates = useMemo(() => pmOptions
    .map(pm => {
      const hit = pm.domains.filter(d => matchKeywords.some(k => k.includes(d) || d.includes(k)))
      const remaining = pm.capacity - pm.activeCount
      const reason = hit.length > 0
        ? `負責域命中：${hit.join('、')}`
        : remaining > 0
          ? `無明顯領域匹配，按剩餘容量推薦（還可接 ${remaining} 個）`
          : '容量已滿，再壓需求只會整條鏈路變慢'
      return { pm, hit, remaining, reason }
    })
    .sort((a, b) => (b.hit.length > 0 ? 1 : 0) - (a.hit.length > 0 ? 1 : 0) || b.remaining - a.remaining),
    [pmOptions, matchKeywords])

  // 后端批量分配只认需求池状态，不在池内的先说清，别让人以为已经分出去了
  /** 「不在需求池」只对分配模式有意义：改派的 targets 本来就应该已有人受理 */
  const notInPool = mode === 'DISPATCH' ? rows.filter(r => r.status !== RDM_STATUS.POOL) : []

  const columns: TableColumnsType<RdmRequirementDetail> = [
    { title: '需求編號', dataIndex: 'reqNo', key: 'reqNo', width: 150 },
    { title: '標題', dataIndex: 'title', key: 'title', ellipsis: true },
    {
      title: '優先級', dataIndex: 'priority', key: 'priority', width: 110,
      render: (v: string) => RDM_PRIORITY_LABEL[v as RdmPriority] ?? v,
    },
    {
      title: '當前狀態', dataIndex: 'status', key: 'status', width: 130,
      render: (v: string) => (
        <Tag color={RDM_STATUS_COLOR[v as RdmStatus] ?? 'default'} style={{ margin: 0 }}>
          {RDM_STATUS_LABEL[v as RdmStatus] ?? v}
        </Tag>
      ),
    },
    { title: '提出人', dataIndex: 'submitterName', key: 'submitterName', width: 110 },
    {
      title: '現負責產品', dataIndex: 'pmName', key: 'pmName', width: 120,
      render: (v?: string | null) => v || <span style={{ color: '#8C8C8C' }}>未分配</span>,
    },
  ]

  /** 确认后再提交：分配与改派都会通知对方并改变受理人 */
  const handleSubmit = () => {
    if (ids.length === 0) {
      message.warning('未指定要處理的需求')
      return
    }
    if (!picked) {
      message.warning('請選擇產品經理')
      return
    }
    if (mode === 'REASSIGN' && !reason.trim()) {
      message.warning('改派必須填寫原因，便於舊受理人與提出人理解')
      return
    }
    if (mode === 'DISPATCH' && notInPool.length > 0) {
      message.warning(`有 ${notInPool.length} 條需求已不在需求池，請刷新後重新選定`)
      return
    }
    const target = picked
    Modal.confirm({
      title: mode === 'REASSIGN'
        ? `確認把 ${ids.length} 條需求改派給 ${target.name}？`
        : `確認把 ${ids.length} 條需求分配給 ${target.name}？`,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>產品經理：</span><b>{target.name}</b></div>
          <div className="confirm-info-row"><span>當前負荷：</span><b>{target.loadText}</b></div>
          <div className="confirm-info-row"><span>需求：</span><b>{rows.map(r => r.reqNo).join('、') || `${ids.length} 條`}</b></div>
          <div className="confirm-info-row"><span>狀態影響：</span><b>{mode === 'REASSIGN'
            ? '受理人更改為指定產品經理；舊受理人失去本單操作資格但保留歷史貢獻，雙方與提出人都會收到通知'
            : '需求直接進入「已分配·待受理」，並向對方發送待辦提醒'}</b></div>
          {mode === 'REASSIGN' && (
            <div className="confirm-info-row"><span>改派原因：</span><b>{reason.trim()}</b></div>
          )}
        </div>
      ),
      okText: mode === 'REASSIGN' ? '確認改派' : '確認分配',
      cancelText: '取消',
      onOk: () => runAssign(target),
    })
  }

  const runAssign = async (target: PickedPm) => {
    setSubmitting(true)
    try {
      if (mode === 'REASSIGN') {
        // 逐条改派：每条都是服务端 CAS（以旧受理人为条件），两人同时改派只有一人成功
        for (const id of ids) {
          await reassignPm(id, { userId: target.userId, name: target.name }, reason.trim())
        }
        message.success(`已改派 ${ids.length} 條需求給 ${target.name}`)
      } else {
        await batchAssign(ids, { userId: target.userId, name: target.name })
        message.success(`已分配 ${ids.length} 條需求給 ${target.name}`)
      }
      navigate(backPath)
    } catch (err) {
      // 写接口是静默请求，失败必须在这里说清，否则页面停在原地让人以为卡在加载
      message.error(err instanceof Error && err.message ? err.message : '操作失敗，請重試')
      throw err
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="content-area">
      <RdmFormHeader
        title="分配產品經理"
        backText="返回列表"
        onBack={() => navigate(backPath)}
        meta={mode === 'REASSIGN'
          ? `已選 ${ids.length} 條需求，改派只換受理人：舊受理人失去本單操作資格，已做的評估與應得貢獻仍保留`
          : `已選 ${ids.length} 條需求，分配後將跳過需求池直接進入產品受理，並向被指派人發送待辦提醒`}
      />

      {rows.length < ids.length && !loading && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`有 ${ids.length - rows.length} 條需求載入失敗或已被刪除，將不會被分配`}
        />
      )}

      {notInPool.length > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={`有 ${notInPool.length} 條需求已不在需求池（${notInPool.map(r => r.reqNo).join('、')}）`}
          description="這些單已被他人接走或推進過，在池內才能分配；請返回列表刷新後重新選定。"
        />
      )}

      <div className="rdm-form-section">
        <div className="rdm-form-section-title">
          <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><UserSwitchOutlined /></span>
          分配對象
          <span className="rdm-todo-hint">按領域命中與剩餘容量排序，點卡片即選中</span>
          <span style={{ flex: 1 }} />
          <Tag color="blue" style={{ margin: 0 }}>自願認領請在需求池列表點「認領」</Tag>
        </div>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Segmented
            value={mode}
            onChange={(v: string | number) => setMode(v as AssignMode)}
            options={[
              { value: 'DISPATCH', label: '分配需求池需求' },
              { value: 'REASSIGN', label: '改派已分配需求' },
            ]}
          />
          {mode === 'REASSIGN' && (
            <>
              <div className="rdm-tip-card">
                改派只換受理人、不抹歷史：舊受理人會失去本單的操作資格，但他已做的評估、評論與應得貢獻仍然保留；
                舊受理人、新受理人與提出人都會收到通知。服務端以舊受理人為條件更新，兩人同時改派只有一人成功。
              </div>
              <div>
                <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>改派原因（必填，會寫進流轉記錄）</div>
                <Input.TextArea
                  rows={2}
                  style={{ maxWidth: 720 }}
                  placeholder="例：該需求屬於交易域，改派給負責該域的產品經理；或原受理人離職/載荷已滿"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  maxLength={200}
                  showCount
                />
              </div>
            </>
          )}

          {/*
           * 候选卡片两种模式下都要渲染：它同时是「新受理人」的选择器。
           * 之前只在分配模式下出现，导致改派模式只剩一个原因框、根本选不了人（深度测试实测）。
           */}
          <div className="rdm-pm-grid">
            {candidates.length === 0 && (
              <div className="rdm-empty-hint">暫無候選產品經理：請檢查「分發矩陣」設定與 rdm-requirement:edit 授權。</div>
            )}
            {candidates.map(({ pm, hit, remaining, reason }) => {
              const active = picked?.userId === pm.userId
              const ratio = pm.capacity > 0 ? Math.min((pm.activeCount / pm.capacity) * 100, 100) : 100
              return (
                <div
                  key={pm.userId}
                  className={`rdm-pm-card ${active ? 'active' : ''}`}
                  onClick={() => setPicked({
                    userId: pm.userId,
                    name: pm.name,
                    loadText: `在途 ${pm.activeCount}/${pm.capacity} · ${reason}`,
                  })}
                >
                  <div className="rdm-pm-card-head">
                    <span className="rdm-pm-card-name">{pm.name}</span>
                    {active && <Tag color="orange" icon={<CheckCircleOutlined />} style={{ margin: 0 }}>已選</Tag>}
                    {hit.length > 0 && <Tag color="green" style={{ margin: 0 }}>領域匹配</Tag>}
                  </div>
                  <div className="rdm-pm-card-load">
                    <span>在途 {pm.activeCount} / 容量 {pm.capacity}</span>
                    <span>{remaining > 0 ? `還可接 ${remaining} 個` : '已達容量'}</span>
                  </div>
                  <div className="rdm-load-bar">
                    <div className="rdm-load-bar-inner" style={{ width: `${ratio}%` }} />
                  </div>
                  <div className="rdm-pm-card-reason">{reason}</div>
                  {pm.domains.length > 0 && (
                    <Space size={4} wrap style={{ marginTop: 6 }}>
                      {pm.domains.map(d => <Tag key={d} style={{ margin: 0 }}>{d}</Tag>)}
                    </Space>
                  )}
                </div>
              )
            })}
          </div>
        </Space>
      </div>

      <div className="rdm-form-section">
        <div className="rdm-form-section-title">
          <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}><SendOutlined /></span>
          {/* 加载中先按“要分配几条”计数，否则进入页面的瞬间会显示「被分配的需求（0）」，
              让人误以为没选中任何需求 */}
          被分配的需求（{loading ? ids.length : rows.length}）
        </div>
        <Table<RdmRequirementDetail>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 900 }}
        />
      </div>

      <div className="form-footer">
        <Button onClick={() => navigate(backPath)}>取消</Button>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>
          {mode === 'REASSIGN' ? '確認改派' : '確認分配'}
        </Button>
      </div>
    </div>
  )
}
