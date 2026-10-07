/**
 * 需求工作台 —— 全员进入 RDM 的第一屏
 *
 * 设计口径：按「我是谁、我该处理什么」组织页面，四组待办分别对应
 * 审批人 / 技术负责人 / 产品经理 / 业务验收人 四个角色视角，
 * 非相关角色的待办组为空时自动隐藏，避免干扰。
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Empty, Space, Spin, Tag, message } from 'antd'
import {
  AlertOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  ExclamationCircleOutlined,
  FileAddOutlined,
  InboxOutlined,
  RightOutlined,
  RocketOutlined,
  SolutionOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import StatCards from '../../components/StatCards'
import { useAuth } from '../../contexts/AuthContext'
import { fetchRequirementPage, fetchWorkbench, type RdmRequirementRow, type RdmWorkbenchData } from '../../api/rdm'
import {
  RDM_SCOPE,
  RDM_STAGE_LABEL,
  RDM_STAGE_ORDER,
  RDM_STATUS,
  RDM_STATUS_LABEL,
  RDM_STATUS_STAGE,
  type RdmStatus,
} from '../../constants/rdm'
import { PriorityTag, StatusTag, TypeTag } from './components/Tags'
import './index.css'

/**
 * 待办分组 → 落点路由（点击「查看全部」直达）
 * <p>pool 落需求池（分配与审批同属上游）；product 落需求清单的产品视角（清单只做执行）。
 * <p>intake 不能落清单的 todo：todo 查的是需求上的 PM/验收人/研发负责人字段，
 * 而审批人只存在于 OA 审批任务表，之前落 todo 会让审批人看到 3 条却点不进列表。
 */
const TODO_ROUTE: Record<string, string> = {
  pool: '/rdm-intake?scope=pool',
  product: '/rdm-requirement?scope=product',
  acceptance: '/rdm-acceptance',
}

/**
 * 审批待办的落点：有需求池授权的人落池内的「待我審批」视角；
 * <p>准入审批人常常是申请人的上级主管，不是产品总监 —— 他们未必持有 rdm-intake 授权，
 * 把所有人都固定落需求池会让他们点「查看全部」直接进不来。这类人走 OA 中心的待我审批，
 * 那边本来就是审批的单一事实源（准入审批已接 OA 回调）。
 */
function intakeTodoRoute(canOpenPool: boolean): string {
  return canOpenPool ? '/rdm-intake?scope=approving' : '/oa-requests'
}

/** 待办分组图标与主色 */
const TODO_ICON: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  intake: { icon: <AuditOutlined />, color: '#E8720C', bg: '#FFF7E6' },
  pool: { icon: <InboxOutlined />, color: '#FA8C16', bg: '#FFF7F0' },
  product: { icon: <SolutionOutlined />, color: '#722ED1', bg: '#F9F0FF' },
  acceptance: { icon: <CheckCircleOutlined />, color: '#52C41A', bg: '#F6FFED' },
}

/**
 * 提出人自己还得再动一次手的状态。
 * <p>口径只从提出人视角列：草稿是没提交完，intake_rejected / rejected 是被打回要改，
 * on_hold 是产品暂缓但要提出人确认是否还做。技术侧的评审/开发等待不该出现在这里，
 * 否则业务方会以为球还在自己手上。
 */
const SUBMITTER_ACTION_STATUS: string[] = [
  RDM_STATUS.DRAFT,
  RDM_STATUS.INTAKE_REJECTED,
  RDM_STATUS.REJECTED,
  RDM_STATUS.ON_HOLD,
]

/** 上面每个状态该配一句「现在轮到你做什么」，只写状态名等于没提示 */
const SUBMITTER_ACTION_HINT: Record<string, string> = {
  [RDM_STATUS.DRAFT]: '仍是草稿，補充內容後提交才会開始流轉',
  [RDM_STATUS.INTAKE_REJECTED]: '准入審批被駁回，修改後可重新提交',
  [RDM_STATUS.REJECTED]: '產品駁回了需求，可查看理由後決定是否重開',
  [RDM_STATUS.ON_HOLD]: '需求被挂起暂缓，確認是否仍需推進',
}

/**
 * 六段进度（业务视角的折叠阶段）。
 * <p>为什么用状态反查阶段而不直接读接口 stage：草稿/驳回这类状态下 stage 可能为空，
 * 直接渲染会出现「一格都不亮」的进度条，业务方就以为需求没提交成功。
 */
function StageTrack({ status }: { status: string }) {
  const stage = RDM_STATUS_STAGE[status as RdmStatus]
  const currentIndex = stage ? RDM_STAGE_ORDER.indexOf(stage) : -1
  const finished = status === RDM_STATUS.CLOSED
  return (
    <div className="rdm-track-steps">
      {RDM_STAGE_ORDER.map((step, idx) => {
        const cls = finished || idx < currentIndex ? 'done' : idx === currentIndex ? 'current' : 'todo'
        return (
          <div key={step} className={`rdm-track-step ${cls}`} title={RDM_STAGE_LABEL[step]}>
            <span className="rdm-track-dot" />
            <span className="rdm-track-label">{RDM_STAGE_LABEL[step]}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function RdmWorkbench() {
  const navigate = useNavigate()
  const { hasMenuPermission } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<RdmWorkbenchData | null>(null)
  /** 我提的需求（含草稿与被驳回的），走列表接口 scope=mine，与待办分区不同口径 */
  const [mineRows, setMineRows] = useState<RdmRequirementRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 两个只读接口任一失败都不应把整页打成空白，所以提交列表单独兜底
      const [wb, mine] = await Promise.all([
        fetchWorkbench(),
        fetchRequirementPage({ page: 1, size: 6, scope: RDM_SCOPE.MINE }).catch(() => null),
      ])
      setData(wb)
      setMineRows(mine?.records ?? [])
    } catch {
      message.error('工作台數據載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="content-area" style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }
  if (!data) {
    return <div className="content-area"><Empty description="暫無數據" /></div>
  }

  const { identity, stats, todos } = data
  const recentActivity = data.recentActivity ?? []
  // 需要我补充：从我的提交里按提出人可动作的状态过滤，并把原因带上（无原因就不堵人）
  const needAction = mineRows.filter(r => SUBMITTER_ACTION_STATUS.includes(String(r.status)))
  const tracking = mineRows.filter(r => !SUBMITTER_ACTION_STATUS.includes(String(r.status)))

  return (
    <div className="content-area">
      {/* ── 顶部欢迎区 ── */}
      <div className="rdm-hero">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="rdm-hero-title">
              <RocketOutlined style={{ color: '#E8720C' }} />
              需求工作台
              <Tag color="orange" style={{ margin: 0 }}>產研協同</Tag>
            </div>
            <div className="rdm-hero-sub">
              {identity.name}
              {identity.deptName ? ` · ${identity.deptName}` : ''}
              {' · 我的角色：'}{identity.roleNames.join(' / ')}
            </div>
          </div>
          <div className="rdm-hero-actions">
            <Button
              type="primary"
              icon={<FileAddOutlined />}
              onClick={() => navigate('/rdm-submit')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8,
                height: 36, padding: '0 20px', boxShadow: '0 2px 6px rgba(232,114,12,0.3)',
              }}
            >
              我要提需求
            </Button>
            <Button icon={<ThunderboltOutlined />} onClick={() => navigate('/rdm-requirement?scope=mine')}>
              我的需求
            </Button>
            {/* 研发侧角色（UI/前端/后端/测试）才有交付工作台，业务方不展示避免误入 */}
            {hasMenuPermission('rdm-delivery-board') && (
              <Button icon={<CodeOutlined />} onClick={() => navigate('/rdm-delivery')}>
                我的研發任務
              </Button>
            )}
            <Button icon={<AlertOutlined />} onClick={() => navigate('/rdm-dashboard')}>
              全局看板
            </Button>
          </div>
        </div>
      </div>

      {/* ── 指标统计卡 ── */}
      <div style={{ marginBottom: 16 }}>
        <StatCards
          items={[
            { key: 'mine', icon: <FileAddOutlined />, value: stats.mineTotal, label: '我提交的需求', color: 'brand' },
            { key: 'progress', icon: <ClockCircleOutlined />, value: stats.mineProgress, label: '我的進行中', color: 'info' },
            { key: 'todo', icon: <AuditOutlined />, value: stats.todoTotal, label: '待我處理', color: 'system' },
            { key: 'accept', icon: <CheckCircleOutlined />, value: stats.toAcceptTotal, label: '待我驗收', color: 'success' },
            { key: 'overdue', icon: <AlertOutlined />, value: stats.overdueTotal, label: '逾期預警', color: 'brand' },
            { key: 'delivered', icon: <RocketOutlined />, value: stats.deliveredTotal, label: '已交付需求', color: 'info' },
          ]}
        />
      </div>

      {/* ── 需要我补充（提出人阻塞项，排在待办分区之前：球在我手上就先看到）── */}
      {needAction.length > 0 && (
        <div className="rdm-card" style={{ marginBottom: 16 }}>
          <div className="rdm-card-title">
            <span className="rdm-icon-block" style={{ background: '#FFF1F0', color: '#FF4D4F' }}><ExclamationCircleOutlined /></span>
            需要我補充
            <Tag color="red" style={{ margin: 0 }}>{needAction.length}</Tag>
            <span className="rdm-todo-hint">這些需求在等提出人補内容或做決定，不處理會停在原地</span>
            <span className="rdm-card-title-split" />
            <Button type="link" size="small" onClick={() => navigate('/rdm-requirement?scope=mine')}>
              查看全部 <RightOutlined style={{ fontSize: 11 }} />
            </Button>
          </div>
          {needAction.map(row => (
            <div key={row.id} className="rdm-need-item">
              <div className="rdm-todo-item-main">
                <div
                  className="rdm-todo-item-title"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/rdm-detail?id=${row.id}`)}
                >
                  {row.title}
                </div>
                <div className="rdm-need-reason">
                  {SUBMITTER_ACTION_HINT[String(row.status)] ?? '需求等待提出人處理'}
                  {row.rejectReason ? `｜理由：${row.rejectReason}` : ''}
                </div>
                <div className="rdm-todo-item-meta">
                  <span>{row.reqNo}</span>
                  {row.stayHours != null && row.stayHours > 24 && (
                    <span style={{ color: '#D46B08' }}>已停留 {Math.round(row.stayHours / 24)} 天</span>
                  )}
                </div>
              </div>
              <StatusTag status={row.status} overdue={row.overdueFlag ?? false} />
              <Button type="link" size="small" onClick={() => navigate(`/rdm-detail?id=${row.id}`)}>
                去處理
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* ── 待办分区（按角色渲染，空组自动隐藏） ── */}
      {todos.filter(g => g.total > 0).map(group => {
        const meta = TODO_ICON[group.key] ?? { icon: <InboxOutlined />, color: '#8C8C8C', bg: '#F5F5F5' }
        return (
          <div key={group.key} className="rdm-todo-group">
            <div className="rdm-todo-head">
              <div className="rdm-todo-title">
                <span className="rdm-icon-block" style={{ background: meta.bg, color: meta.color }}>{meta.icon}</span>
                {group.title}
                <Tag color={group.total > 0 ? 'orange' : 'default'} style={{ margin: 0 }}>{group.total}</Tag>
                <span className="rdm-todo-hint">{group.hint}</span>
              </div>
              <Button type="link" size="small" onClick={() => navigate(TODO_ROUTE[group.key] ?? intakeTodoRoute(hasMenuPermission('rdm-intake')))}>
                查看全部 <RightOutlined style={{ fontSize: 11 }} />
              </Button>
            </div>
            <div className="rdm-todo-body">
              {group.items.slice(0, 4).map(item => (
                <div key={item.id} className="rdm-todo-item">
                  <div className="rdm-todo-item-main">
                    <div
                      className="rdm-todo-item-title"
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/rdm-detail?id=${item.id}`)}
                    >
                      {item.title}
                    </div>
                    <div className="rdm-todo-item-meta">
                      <span>{item.reqNo}</span>
                      <span>提出人：{item.submitterName}</span>
                      {item.submitDeptName && <span>{item.submitDeptName}</span>}
                      {item.expectDate && <span>期望：{item.expectDate}</span>}
                      {item.stayHours != null && item.stayHours > 24 && (
                        <span style={{ color: '#D46B08' }}>
                          已停留 {Math.round(item.stayHours / 24)} 天
                        </span>
                      )}
                    </div>
                  </div>
                  <Space size={6}>
                    <TypeTag reqType={item.reqType} />
                    <PriorityTag priority={item.priority} />
                    <StatusTag status={item.status} overdue={item.overdueFlag ?? false} />
                  </Space>
                  <Button type="link" size="small" onClick={() => navigate(`/rdm-detail?id=${item.id}`)}>
                    處理
                  </Button>
                </div>
              ))}
              {group.items.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="無待辦" />}
            </div>
          </div>
        )
      })}

      {/* ── 我的提交追踪（业务方最关心：到哪一步、谁在跟、什么时候给）── */}
      <div className="rdm-card" style={{ marginBottom: 16 }}>
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><RocketOutlined /></span>
          我的提交追蹤
          <span className="rdm-todo-hint">只看到自己提的需求，進展與責任人一目了然</span>
          <span className="rdm-card-title-split" />
          <Button type="link" size="small" onClick={() => navigate('/rdm-requirement?scope=mine')}>
            查看全部 <RightOutlined style={{ fontSize: 11 }} />
          </Button>
        </div>
        {tracking.length === 0 ? (
          <div className="rdm-empty-hint">
            目前沒有正在推進的需求。
            <Button type="link" size="small" onClick={() => navigate('/rdm-submit')}>現在提一個需求</Button>
          </div>
        ) : tracking.map(row => (
          <div key={row.id} className="rdm-track-item">
            <div className="rdm-todo-item-main">
              <div
                className="rdm-todo-item-title"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/rdm-detail?id=${row.id}`)}
              >
                {row.title}
              </div>
              <StageTrack status={String(row.status)} />
              <div className="rdm-todo-item-meta">
                <span>{row.reqNo}</span>
                <span>當前處理人：{row.currentHandler || RDM_STATUS_LABEL[row.status as RdmStatus] || '-'}</span>
                {row.promisedPrdDate && <span>承諾 PRD：{row.promisedPrdDate}</span>}
                {row.planReleaseDate && <span>計劃上線：{row.planReleaseDate}</span>}
                {row.expectDate && <span>業務期望：{row.expectDate}</span>}
                {typeof row.progress === 'number' && row.progress > 0 && <span>研發進度 {row.progress}%</span>}
              </div>
            </div>
            <Space size={6}>
              <PriorityTag priority={row.priority} />
              <StatusTag status={row.status} overdue={row.overdueFlag ?? false} />
            </Space>
            <Button type="link" size="small" onClick={() => navigate(`/rdm-detail?id=${row.id}`)}>
              詳情
            </Button>
          </div>
        ))}
      </div>

      {/* ── 最近动态（仅在有意义数据时展示） ── */}
      {recentActivity.length > 0 && (
      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}>
            <ClockCircleOutlined />
          </span>
          最近交付動態
          <span className="rdm-card-title-split" />
          <Button type="link" size="small" onClick={() => navigate('/rdm-requirement?scope=mine')}>
            查看我的需求進度
          </Button>
        </div>
        {recentActivity.slice(0, 6).map(node => (
          <div key={node.id} className="rdm-risk-item">
            <StatusTag status={node.status} />
            <span style={{ color: '#595959' }}>
              {node.operatorName} 將需求推進至「{RDM_STATUS_LABEL[node.status as RdmStatus] ?? node.statusLabel ?? '-'}」
            </span>
            <span style={{ marginLeft: 'auto', color: '#8C8C8C', fontSize: 12 }}>
              {dayjs(node.time).format('MM-DD HH:mm')}
            </span>
          </div>
        ))}
      </div>
      )}
    </div>
  )
}
