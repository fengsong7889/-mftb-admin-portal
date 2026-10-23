/**
 * 產研交付个人工作台 —— 角色专属数据面板
 *
 * 设计口径：研发任务 / 测试批次 / 问题 / 发布批次是四种不同的工作对象，各自只有一个
 * 归属工作台（研发工作台 / 测试工作台 / 发布中心）。工作台是「跨阶段总入口」，
 * 这里只做概览与直达，不复制执行操作，避免和工作台页面变成两套真相。
 *
 * 数据来源与范围：全部走服务端已有的只读列表接口。这些接口对非全量授权者一律收敛为
 * 「与我相关」，前端不传 userId、不拼 scope，因此不存在越权，也不会出现「看到的是别人的活」。
 * 每个面板自己取数：区块被隐藏时不渲染，也就不会发无意义的请求。
 *
 * i18n：本轮按高效开发模式只交界面，文案暂沿用繁中硬编码（整个 RDM 页面尚未接入 i18n），
 * 待界面确认后的第二阶段统一抽取 domain 键并同步 zh-TW/en 两份文件。
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Select, Space, Spin, Tag } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  fetchIssues,
  fetchMyTasks,
  fetchReleaseBatches,
  fetchTeamMembers,
  fetchTeamTasks,
  fetchTestBatches,
  type RdmReleaseBatchListItem,
  type RdmTaskItem,
  type RdmTeamMember,
  type RdmTestBatchListItem,
} from '../../api/rdm'
import {
  RDM_ISSUE_SEVERITY,
  RDM_ISSUE_SEVERITY_COLOR,
  RDM_ISSUE_SEVERITY_LABEL,
  RDM_ISSUE_STATUS,
  RDM_ISSUE_STATUS_COLOR,
  RDM_ISSUE_STATUS_LABEL,
  RDM_RELEASE_BATCH_STATUS,
  RDM_RELEASE_BATCH_STATUS_COLOR,
  RDM_RELEASE_BATCH_STATUS_LABEL,
  RDM_TASK_STATUS_COLOR,
  RDM_TASK_STATUS_LABEL,
  RDM_TEST_BATCH_STATUS,
  RDM_TEST_BATCH_STATUS_COLOR,
  RDM_TEST_BATCH_STATUS_LABEL,
} from '../../constants/rdm'
import { RDM_SECTION_ICON } from './workbenchSectionIcons'
import './index.css'

/** 面板统一外框：标题行（图标 + 名称 + 计数 + 说明 + 右侧动作）+ 内容区 */
function PanelShell(props: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  title: string
  count?: number
  hint?: string
  action?: React.ReactNode
  loading: boolean
  error?: boolean
  /** 失败原因（如“没有共同项目”）：只给默认的“數據載入失敗”会让人反复重试一个权限问题 */
  errorText?: string
  onRetry?: () => void
  emptyText?: string
  hasData: boolean
  children: React.ReactNode
}) {
  const { icon, iconBg, iconColor, title, count, hint, action, loading, error, errorText, onRetry, emptyText, hasData, children } = props
  return (
    <div className="rdm-card" style={{ marginBottom: 16 }}>
      <div className="rdm-card-title">
        <span className="rdm-icon-block" style={{ background: iconBg, color: iconColor }}>{icon}</span>
        {title}
        {typeof count === 'number' && (
          <Tag color={count > 0 ? 'orange' : 'default'} style={{ margin: 0 }}>{count}</Tag>
        )}
        {hint && <span className="rdm-todo-hint">{hint}</span>}
        {action && (
          <>
            <span className="rdm-card-title-split" />
            {action}
          </>
        )}
      </div>
      {loading ? (
        <div style={{ padding: '20px 0', textAlign: 'center' }}><Spin /></div>
      ) : error ? (
        <Alert
          type="error"
          showIcon
          message={errorText ?? '數據載入失敗'}
          description={(
            <span>
              {errorText ? '不影響其他區塊。' : '該區塊暫時取不到數據，不影響其他區塊。'}
              {onRetry && (
                <Button type="link" size="small" onClick={onRetry} style={{ padding: '0 4px' }}>重試</Button>
              )}
            </span>
          )}
        />
      ) : !hasData ? (
        <div className="rdm-empty-hint">{emptyText ?? '目前沒有相關內容'}</div>
      ) : children}
    </div>
  )
}

/** 单个面板的取数状态：null 表示「还没成功过」，与空数组区分开，失败不能被渲染成空态 */
function usePanelFetch<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setData(await loader())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
    // loader 由调用方以内联箭头函数传入，每次渲染都是新引用；
    // 本钩子只在挂载时取一次，重试通过 load 手动触发，因此这里故意不设依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { load() }, [load])
  return { data, loading, error, reload: load }
}

/** 未完成/阻塞任务的紧急度排序：逾期 → 阻塞 → 计划到期日近的在前 */
function taskUrgency(task: RdmTaskItem): number {
  if (task.overdue) return 0
  if (task.status === 'blocked') return 1
  if (task.status === 'doing') return 2
  return 3
}

/** 我的研发任务：研发同学进入工作台第一眼该看到的东西（旧版这里只有「我提交的需求」） */
export function MyDevTasksPanel() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [members, setMembers] = useState<RdmTeamMember[]>([])
  /** 0 = 我的任务；>0 = 指定成员（团队协作视图） */
  const [ownerId, setOwnerId] = useState(0)
  const [data, setData] = useState<RdmTaskItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorText, setErrorText] = useState<string | null>(null)

  // 成员列表失败不阻断「我的任务」：下拉只保留「我的任務」一项
  useEffect(() => {
    let alive = true
    fetchTeamMembers()
      .then(list => { if (alive) setMembers(list) })
      .catch(() => { /* 静默：没有团队视图也能正常看自己的任务 */ })
    return () => { alive = false }
  }, [])

  const load = useCallback(async (id: number) => {
    setLoading(true)
    setErrorText(null)
    try {
      setData(id > 0 ? await fetchTeamTasks(id) : await fetchMyTasks())
    } catch (err) {
      // 无共同项目是权限/归属问题，必须把后端原文摆出来，不能伪装成「对方没任务」
      setData(null)
      setErrorText(err instanceof Error && err.message ? err.message : t('rdm.teamTask.loadFailed', { defaultValue: '數據載入失敗' }))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void load(ownerId) }, [load, ownerId])

  const rows = (data ?? []).slice().sort((a, b) => taskUrgency(a) - taskUrgency(b))
  const viewingTeam = ownerId > 0
  return (
    <PanelShell
      icon={RDM_SECTION_ICON['dev-tasks']}
      iconBg="#E6F7FF"
      iconColor="#1890FF"
      title={viewingTeam ? t('rdm.teamTask.teamTitle', { defaultValue: '團隊成員任務' }) : t('rdm.teamTask.myTitle', { defaultValue: '我的研發任務' })}
      count={rows.length}
      hint={viewingTeam ? t('rdm.teamTask.teamHint', { defaultValue: '僅顯示你們共同項目下的任務，逾期與阻塞置頂' }) : t('rdm.teamTask.myHint', { defaultValue: '僅列指派給我的未完成任務，逾期與阻塞置頂' })}
      action={(
        <Space size={8}>
          <Select
            size="small"
            style={{ width: 200 }}
            value={ownerId}
            onChange={setOwnerId}
            showSearch
            optionFilterProp="label"
            aria-label={t('rdm.teamTask.switcherLabel', { defaultValue: '切換查看成員' })}
            options={[
              { value: 0, label: t('rdm.teamTask.selfOption', { defaultValue: '我的任務' }) },
              ...members.map(m => ({
                value: m.userId,
                label: m.empNo ? `${m.name}（${m.empNo}）` : m.name,
              })),
            ]}
          />
          <Button type="link" size="small" onClick={() => navigate('/rdm-delivery')}>
            {t('rdm.teamTask.gotoBoard', { defaultValue: '研發工作台' })} <RightOutlined style={{ fontSize: 11 }} />
          </Button>
        </Space>
      )}
      loading={loading}
      error={Boolean(errorText)}
      errorText={errorText ?? undefined}
      onRetry={() => { void load(ownerId) }}
      hasData={rows.length > 0}
      emptyText={viewingTeam ? t('rdm.teamTask.teamEmpty', { defaultValue: '該成員在你們的共同項目下暫無未完成任務' }) : t('rdm.teamTask.empty', { defaultValue: '目前沒有指派給你的未完成任務，可到研發工作台查看全部交付項' })}
    >
      {rows.slice(0, 6).map(task => (
        <div key={task.id} className="rdm-todo-item">
          <div className="rdm-todo-item-main">
            <div
              className="rdm-todo-item-title"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/rdm-detail?id=${task.reqId}`)}
            >
              {task.title}
            </div>
            <div className="rdm-todo-item-meta">
              <span>{task.taskNo}</span>
              {task.reqTitle && <span>需求：{task.reqTitle}</span>}
              {task.planFinishDate && (
                <span style={task.overdue ? { color: '#FF4D4F' } : undefined}>
                  計劃完成：{task.planFinishDate}
                </span>
              )}
              {typeof task.progress === 'number' && task.progress > 0 && <span>進度 {task.progress}%</span>}
              {task.blockedReason && <span style={{ color: '#D46B08' }}>阻塞：{task.blockedReason}</span>}
            </div>
          </div>
          <Tag color={RDM_TASK_STATUS_COLOR[task.status as keyof typeof RDM_TASK_STATUS_COLOR] ?? 'default'} style={{ margin: 0 }}>
            {RDM_TASK_STATUS_LABEL[task.status as keyof typeof RDM_TASK_STATUS_LABEL] ?? task.status}
          </Tag>
          {/* 团队视图不提供“到工作台处理”：那是自己的操作台，会让人误以为能代他人上报 */}
          {!viewingTeam && (
            <Button type="link" size="small" onClick={() => navigate('/rdm-delivery')}>
              {t('rdm.teamTask.toWorkbench', { defaultValue: '到工作台處理' })}
            </Button>
          )}
        </div>
      ))}
    </PanelShell>
  )
}

/** 待接收 / 执行中 / 未通过的批次排前面，已通过的沉底 */
function testBatchUrgency(batch: RdmTestBatchListItem): number {
  if (batch.status === RDM_TEST_BATCH_STATUS.PENDING) return 0
  if (batch.status === RDM_TEST_BATCH_STATUS.RETURNED || batch.status === RDM_TEST_BATCH_STATUS.FAILED) return 1
  if (batch.status === RDM_TEST_BATCH_STATUS.ACCEPTED || batch.status === RDM_TEST_BATCH_STATUS.EXECUTING) return 2
  return 3
}

/** 我的测试批次：测试角色首屏要看的是批次，不是需求列表 */
export function MyTestBatchesPanel() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = usePanelFetch(
    () => fetchTestBatches({ pageNo: 1, pageSize: 8 }),
  )
  const rows = (data?.records ?? []).slice().sort((a, b) => testBatchUrgency(a) - testBatchUrgency(b))
  // 计数取服务端 total（与我相关的全部批次），列表只截前 6 条，两者不能混为一谈
  return (
    <PanelShell
      icon={RDM_SECTION_ICON['test-batches']}
      iconBg="#F9F0FF"
      iconColor="#722ED1"
      title="我的測試批次"
      count={data?.total ?? rows.length}
      hint="僅列與我相關的提測批次（待接收與未通過置頂）"
      loading={loading}
      error={error}
      onRetry={reload}
      hasData={rows.length > 0}
      emptyText="目前沒有與你相關的提測批次"
      action={(
        <Button type="link" size="small" onClick={() => navigate('/rdm-test')}>
          測試工作台 <RightOutlined style={{ fontSize: 11 }} />
        </Button>
      )}
    >
      {rows.slice(0, 6).map(batch => (
        <div key={batch.id} className="rdm-todo-item">
          <div className="rdm-todo-item-main">
            <div
              className="rdm-todo-item-title"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/rdm-test-detail?id=${batch.id}`)}
            >
              {batch.reqTitle}
            </div>
            <div className="rdm-todo-item-meta">
              <span>{batch.batchNo}</span>
              <span>第 {batch.roundNo} 輪</span>
              {batch.testLeadUserName && <span>測試負責人：{batch.testLeadUserName}</span>}
              {batch.planEndTime && (
                <span>截止：{dayjs(batch.planEndTime).format('MM-DD HH:mm')}</span>
              )}
              <span>
                通過 {batch.passCount}/{batch.totalCount}
                {batch.failCount > 0 && <span style={{ color: '#FF4D4F' }}>｜未通過 {batch.failCount}</span>}
              </span>
            </div>
          </div>
          <Tag color={RDM_TEST_BATCH_STATUS_COLOR[batch.status] ?? 'default'} style={{ margin: 0 }}>
            {RDM_TEST_BATCH_STATUS_LABEL[batch.status] ?? batch.status}
          </Tag>
          <Button type="link" size="small" onClick={() => navigate(`/rdm-test-detail?id=${batch.id}`)}>
            詳情
          </Button>
        </div>
      ))}
    </PanelShell>
  )
}

/** 未闭环问题的严重度排序：致命 → 严重 → 一般 → 轻微 */
const ISSUE_SEVERITY_ORDER: Record<string, number> = {
  [RDM_ISSUE_SEVERITY.CRITICAL]: 0,
  [RDM_ISSUE_SEVERITY.MAJOR]: 1,
  [RDM_ISSUE_SEVERITY.MINOR]: 2,
  [RDM_ISSUE_SEVERITY.TRIVIAL]: 3,
}

/** 未闭环问题清单：研发看自己要修的，测试看自己要回归验证的 */
export function OpenIssuesPanel() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = usePanelFetch(() => fetchIssues({ pageNo: 1, pageSize: 100 }))
  // 服务端返回与我相关的全部状态，工作台只催未闭环的那几类
  const rows = (data?.records ?? [])
    .filter(issue => issue.status === RDM_ISSUE_STATUS.OPEN
      || issue.status === RDM_ISSUE_STATUS.PROCESSING
      || issue.status === RDM_ISSUE_STATUS.PENDING_VERIFY)
    .sort((a, b) => (ISSUE_SEVERITY_ORDER[a.severity] ?? 9) - (ISSUE_SEVERITY_ORDER[b.severity] ?? 9))
  return (
    <PanelShell
      icon={RDM_SECTION_ICON.issues}
      iconBg="#FFF1F0"
      iconColor="#FF4D4F"
      title="待閉環問題"
      count={rows.length}
      hint="與我相關的未閉環問題，完整清單在項目詳情"
      loading={loading}
      error={error}
      onRetry={reload}
      hasData={rows.length > 0}
      emptyText="沒有需要你處理的未閉環問題"
    >
      {rows.slice(0, 6).map(issue => (
        <div key={issue.id} className="rdm-todo-item">
          <div className="rdm-todo-item-main">
            <div
              className="rdm-todo-item-title"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/rdm-issue?id=${issue.id}`)}
            >
              {issue.title}
            </div>
            <div className="rdm-todo-item-meta">
              <span>{issue.issueNo}</span>
              {issue.reqTitle && <span>需求：{issue.reqTitle}</span>}
              {issue.ownerUserName && <span>負責人：{issue.ownerUserName}</span>}
              <span>登記：{dayjs(issue.createdAt).format('MM-DD HH:mm')}</span>
            </div>
          </div>
          <Space size={6}>
            <Tag color={RDM_ISSUE_SEVERITY_COLOR[issue.severity] ?? '#8C8C8C'} style={{ margin: 0 }}>
              {RDM_ISSUE_SEVERITY_LABEL[issue.severity] ?? issue.severity}
            </Tag>
            <Tag color={RDM_ISSUE_STATUS_COLOR[issue.status] ?? 'default'} style={{ margin: 0 }}>
              {RDM_ISSUE_STATUS_LABEL[issue.status] ?? issue.status}
            </Tag>
          </Space>
          <Button type="link" size="small" onClick={() => navigate(`/rdm-issue?id=${issue.id}`)}>
            詳情
          </Button>
        </div>
      ))}
    </PanelShell>
  )
}

/** 待裁决 / 部署中的发布批次优先 */
function releaseBatchUrgency(batch: RdmReleaseBatchListItem): number {
  if (batch.status === RDM_RELEASE_BATCH_STATUS.CHECKING) return 0
  if (batch.status === RDM_RELEASE_BATCH_STATUS.APPROVED || batch.status === RDM_RELEASE_BATCH_STATUS.DEPLOYING) return 1
  if (batch.status === RDM_RELEASE_BATCH_STATUS.PLANNING) return 2
  return 3
}

/** 我的发布批次：发布负责人与验收人关心「哪一批在等谁」 */
export function MyReleaseBatchesPanel() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = usePanelFetch(
    () => fetchReleaseBatches({ pageNo: 1, pageSize: 8 }),
  )
  const rows = (data?.records ?? []).slice().sort((a, b) => releaseBatchUrgency(a) - releaseBatchUrgency(b))
  // 计数取服务端 total（与我相关的全部批次），列表只截前 6 条
  return (
    <PanelShell
      icon={RDM_SECTION_ICON['release-batches']}
      iconBg="#FFF7E6"
      iconColor="#E8720C"
      title="我的發布批次"
      count={data?.total ?? rows.length}
      hint="僅列與我相關的發布批次（待裁決與部署中置頂）"
      loading={loading}
      error={error}
      onRetry={reload}
      hasData={rows.length > 0}
      emptyText="目前沒有與你相關的發布批次"
      action={(
        <Button type="link" size="small" onClick={() => navigate('/rdm-release')}>
          發布中心 <RightOutlined style={{ fontSize: 11 }} />
        </Button>
      )}
    >
      {rows.slice(0, 6).map(batch => (
        <div key={batch.id} className="rdm-todo-item">
          <div className="rdm-todo-item-main">
            <div
              className="rdm-todo-item-title"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/rdm-release-detail?id=${batch.id}`)}
            >
              {batch.versionTag || batch.batchNo}
            </div>
            <div className="rdm-todo-item-meta">
              <span>{batch.batchNo}</span>
              {batch.projectName && <span>項目：{batch.projectName}</span>}
              {batch.releaseOwnerUserName && <span>發布人：{batch.releaseOwnerUserName}</span>}
              {batch.planTime && <span>計劃：{dayjs(batch.planTime).format('MM-DD HH:mm')}</span>}
              <span>系統部署 {batch.deployedCount}/{batch.systemCount}</span>
            </div>
          </div>
          <Tag color={RDM_RELEASE_BATCH_STATUS_COLOR[batch.status] ?? 'default'} style={{ margin: 0 }}>
            {RDM_RELEASE_BATCH_STATUS_LABEL[batch.status] ?? batch.status}
          </Tag>
          <Button type="link" size="small" onClick={() => navigate(`/rdm-release-detail?id=${batch.id}`)}>
            詳情
          </Button>
        </div>
      ))}
    </PanelShell>
  )
}
