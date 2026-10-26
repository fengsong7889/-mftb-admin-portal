import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Checkbox, Modal, Radio, Result, Select, Space, Spin, Tag, message } from 'antd'
import { EyeOutlined, FundProjectionScreenOutlined, SendOutlined } from '@ant-design/icons'
import { fetchDailyReportBoardPreview, fetchDailyReportEmployeeOptions, triggerDailyReport, type DailyReportTriggerResult } from '@/api/rdmDailyReport'
import type { OptionItem } from '@/api/types'
import type { DailyReportPublicView } from '@/api/rdmDailyReportPublic'
import { fetchIterations, fetchProjectPage, type RdmIterationItem, type RdmProjectListItem } from '@/api/rdm'
import { useAuth } from '@/contexts/AuthContext'
import DailyReportBoardPreviewModal from './BoardPreviewModal'
import '../index.css'

/**
 * 進度日報 > 手動觸發（独立页）。
 *
 * <p>为什么独立成页而不是塞进发送记录：① 它是表单（选项目/迭代 + 档位 + 执行），
 * 按 AGENTS.md §9.1 表单不得用 Modal 承载；② 它的权限是 {@code trigger}（不可撤回的群发），
 * 与发送记录的只读 {@code view} 是两种权力，合并后无法分开授权。
 *
 * <p>范围选择（用户明确要求的模型）：先选项目，再可选指定迭代；
 * 不选迭代 = 推送该项目<b>全部迭代</b>的进度，选定迭代 = 只推该迭代。
 *
 * <p>两道闸：前端二次确认（消息不可撤回），服务端同档位+项目 1 分钟节流。
 */
export default function DailyReportTrigger() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canTrigger = hasPermission('rdm-daily-report-trigger:trigger')

  const [projects, setProjects] = useState<RdmProjectListItem[]>([])
  const [iterations, setIterations] = useState<RdmIterationItem[]>([])
  const [searching, setSearching] = useState(false)
  const [projectIds, setProjectIds] = useState<number[]>([])
  const [allProjects, setAllProjects] = useState(false)
  const [iterationCode, setIterationCode] = useState<string | undefined>()
  const [reportType, setReportType] = useState<'morning' | 'evening'>('morning')
  /** 发送对象：all=群+個人（現狀）/ group=僅群 / users=僅指定人 */
  const [recipientMode, setRecipientMode] = useState<'all' | 'group' | 'users'>('all')
  const [recipientUserIds, setRecipientUserIds] = useState<number[]>([])
  const [employeeOptions, setEmployeeOptions] = useState<OptionItem[]>([])
  const [employeeLoading, setEmployeeLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DailyReportTriggerResult | null>(null)
  const [boardOpen, setBoardOpen] = useState(false)
  const [boardView, setBoardView] = useState<DailyReportPublicView | null>(null)

  const loadProjects = useCallback(async (keyword?: string) => {
    setSearching(true)
    try {
      const res = await fetchProjectPage({ pageNo: 1, pageSize: 50, keyword })
      setProjects(res.records ?? [])
    } catch {
      setProjects([])
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    void loadProjects()
    fetchIterations().then(setIterations).catch(() => setIterations([]))
  }, [loadProjects])

  /** 只有恰好一个项目时才允许指定迭代；多项目/全部项目推送全部迭代 */
  const singleProjectId = projectIds.length === 1 ? projectIds[0] : undefined
  const hasTarget = allProjects || projectIds.length > 0 || Boolean(iterationCode)

  const iterationOptions = useMemo(
    () => iterations
      .filter(i => singleProjectId != null && i.projectId === singleProjectId)
      .map(i => ({ value: i.code, label: `${i.code}${i.name ? ' ' + i.name : ''}` })),
    [iterations, singleProjectId])

  /**
   * 指定人搜索：远程按姓名/工号查；已选项的 label 累积保留，
   * 换搜索词或清空输入后已选的人不会退化成裸 ID。
   */
  const searchEmployees = useCallback(async (keyword?: string) => {
    setEmployeeLoading(true)
    try {
      const list = await fetchDailyReportEmployeeOptions(keyword ?? '')
      setEmployeeOptions(prev => {
        const merged = new Map(prev.map(o => [o.value, o]))
        list.forEach(o => merged.set(o.value, o))
        return [...merged.values()]
      })
    } catch {
      // 搜索失败不清空已选项：宁可少几个候选，也不能把已选的人变成 #123
    } finally {
      setEmployeeLoading(false)
    }
  }, [])

  /** 发送对象校验：仅指定人时必须至少选一人，不能静默执行成「一个都没发」 */
  const validateRecipient = (): boolean => {
    if (recipientMode === 'users' && recipientUserIds.length === 0) {
      message.warning(t('rdm.dailyTrigger.recipientRequired'))
      return false
    }
    return true
  }

  const scopeParams = () => ({
    projectId: singleProjectId,
    projectIds: allProjects ? [] : projectIds,
    allProjects,
    iterationCode: singleProjectId ? iterationCode : undefined,
  })

  const run = async (dryRun: boolean): Promise<DailyReportTriggerResult | null> => {
    if (!hasTarget) {
      message.warning(t('rdm.dailyTrigger.targetRequired'))
      return null
    }
    // 真发才校验发送对象：预览/干跑不发送，不拦人
    if (!dryRun && !validateRecipient()) {
      return null
    }
    setBusy(true)
    try {
      const res = await triggerDailyReport({
        type: reportType,
        ...scopeParams(),
        dryRun,
        recipientMode,
        recipientUserIds: recipientMode === 'users' ? recipientUserIds : undefined,
      })
      setResult(res)
      if (!dryRun) {
        message.success(res.message || t('rdm.dailyTrigger.done'))
      }
      return res
    } catch (e) {
      message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyTrigger.failed'))
      return null
    } finally {
      setBusy(false)
    }
  }

  /**
   * 查看看板：按当前数据即时生成一份视图（不发送、不落库）。
   * 不再复用预览链接：推送前当天可能还没有快照，读链接只会得到“尚未生成”。
   */
  const handleViewBoard = async () => {
    if (!hasTarget) {
      message.warning(t('rdm.dailyTrigger.targetRequired'))
      return
    }
    setBusy(true)
    try {
      const view = await fetchDailyReportBoardPreview({ type: reportType, ...scopeParams() })
      setBoardView(view)
      setBoardOpen(true)
    } catch (e) {
      message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyTrigger.boardFailed'))
    } finally {
      setBusy(false)
    }
  }

  const handlePush = () => {
    if (!hasTarget) {
      message.warning(t('rdm.dailyTrigger.targetRequired'))
      return
    }
    if (!validateRecipient()) {
      return
    }
    let target: string
    if (allProjects) {
      target = `${t('rdm.dailyTrigger.allProjects')} / ${t('rdm.dailyTrigger.allIterations')}`
    } else if (projectIds.length > 1) {
      target = projectIds.map(id => {
        const p = projects.find(x => x.id === id)
        return p ? (p.projectNo ? `${p.projectNo} ${p.name}` : p.name) : `#${id}`
      }).join('、') + ' / ' + t('rdm.dailyTrigger.allIterations')
    } else {
      const project = projects.find(p => p.id === singleProjectId)
      target = `${project ? (project.projectNo ? project.projectNo + ' ' + project.name : project.name) : '—'}`
        + ' / ' + (iterationCode || t('rdm.dailyTrigger.allIterations'))
    }
    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('rdm.dailyTrigger.confirmTitle'),
      content: t('rdm.dailyTrigger.confirmContent', {
        type: reportType === 'morning' ? t('rdm.dailyTrigger.typeMorning') : t('rdm.dailyTrigger.typeEvening'),
        target,
        recipient: recipientMode === 'all'
          ? t('rdm.dailyTrigger.recipientAll')
          : recipientMode === 'group'
            ? t('rdm.dailyTrigger.recipientGroup')
            : t('rdm.dailyTrigger.recipientUsersNamed', {
                names: recipientUserIds
                  .map(id => employeeOptions.find(o => o.value === String(id))?.label ?? `#${id}`)
                  .join('、'),
              }),
      }),
      okText: t('rdm.dailyTrigger.confirmOk'),
      cancelText: t('rdm.dailyTrigger.confirmCancel'),
      onOk: () => run(false),
    })
  }

  return (
    <div className="content-area">
      {!canTrigger && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={t('rdm.dailyTrigger.noPermission')} />
      )}
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t('rdm.dailyTrigger.hint')} />

      <div style={cardStyle}>
        {/* 「全部在途項目」是總開關：獨立成行；勾選即推送全部在途項目，下方項目與迭代隨之鎖定 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <Checkbox checked={allProjects} disabled={!canTrigger}
            onChange={e => {
              setAllProjects(e.target.checked)
              setIterationCode(undefined)
              setResult(null)
              if (e.target.checked) setProjectIds([])
            }}>
            {t('rdm.dailyTrigger.allProjects')}
          </Checkbox>
          {allProjects && (
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('rdm.dailyTrigger.allProjectsNoIteration')}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={labelStyle}>{t('rdm.dailyTrigger.fieldProject')}:</span>
          <Select
            mode="multiple" showSearch style={{ width: 340, minWidth: 260 }} disabled={!canTrigger || allProjects}
            placeholder={allProjects ? t('rdm.dailyTrigger.allProjects') : t('rdm.dailyTrigger.projectPlaceholder')}
            value={projectIds}
            filterOption={false}
            onSearch={kw => void loadProjects(kw)}
            notFoundContent={searching ? <Spin size="small" /> : t('rdm.dailyTrigger.noProjectMatch')}
            options={projects.map(p => ({ value: p.id, label: p.projectNo ? `${p.projectNo} ${p.name}` : p.name }))}
            onChange={v => {
              setProjectIds(v)
              setIterationCode(undefined)
              setResult(null)
            }}
          />
          {!allProjects && (
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>
              {projectIds.length > 1
                ? t('rdm.dailyTrigger.multipleProjects', { count: projectIds.length })
                : t('rdm.dailyTrigger.projectRequiredHint')}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={labelStyle}>{t('rdm.dailyTrigger.fieldIteration')}:</span>
          <Select
            allowClear style={{ width: 340 }} disabled={!canTrigger || singleProjectId == null}
            placeholder={singleProjectId == null
              ? t('rdm.dailyTrigger.iterationOnlySingle')
              : t('rdm.dailyTrigger.allIterations')}
            value={iterationCode} onChange={v => { setIterationCode(v); setResult(null) }}
            options={iterationOptions}
            notFoundContent={singleProjectId == null
              ? t('rdm.dailyTrigger.iterationOnlySingle') : t('rdm.dailyTrigger.noIteration')}
          />
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('rdm.dailyTrigger.iterationHint')}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={labelStyle}>{t('rdm.dailyTrigger.fieldType')}:</span>
          <Radio.Group value={reportType} onChange={e => { setReportType(e.target.value); setResult(null) }}
            disabled={!canTrigger}>
            <Radio.Button value="morning">{t('rdm.dailyTrigger.typeMorning')}</Radio.Button>
            <Radio.Button value="evening">{t('rdm.dailyTrigger.typeEvening')}</Radio.Button>
          </Radio.Group>
        </div>

        {/* 发送对象：手动触发可以只发群或只发指定人，不再一律「群 + 全体个人」 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={labelStyle}>{t('rdm.dailyTrigger.fieldRecipient')}:</span>
          <Radio.Group
            value={recipientMode}
            onChange={e => {
              const mode = e.target.value as 'all' | 'group' | 'users'
              setRecipientMode(mode)
              setResult(null)
              // 首次切到“仅指定人”时预拉一页候选，避免下拉空白
              if (mode === 'users' && employeeOptions.length === 0) void searchEmployees('')
            }}
            disabled={!canTrigger}
          >
            <Radio.Button value="all">{t('rdm.dailyTrigger.recipientAll')}</Radio.Button>
            <Radio.Button value="group">{t('rdm.dailyTrigger.recipientGroup')}</Radio.Button>
            <Radio.Button value="users">{t('rdm.dailyTrigger.recipientUsers')}</Radio.Button>
          </Radio.Group>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
            {recipientMode === 'group'
              ? t('rdm.dailyTrigger.recipientGroupHint')
              : recipientMode === 'users'
                ? t('rdm.dailyTrigger.recipientUsersHint')
                : ''}
          </span>
        </div>

        {recipientMode === 'users' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <span style={labelStyle}>{t('rdm.dailyTrigger.recipientLabel')}:</span>
            <Select
              mode="multiple"
              showSearch
              style={{ width: 340, minWidth: 260 }}
              disabled={!canTrigger}
              placeholder={t('rdm.dailyTrigger.recipientPlaceholder')}
              value={recipientUserIds.map(String)}
              filterOption={false}
              onSearch={kw => void searchEmployees(kw)}
              notFoundContent={employeeLoading ? <Spin size="small" /> : t('rdm.dailyTrigger.noEmployeeMatch')}
              options={employeeOptions}
              onChange={v => { setRecipientUserIds(v.map(Number)); setResult(null) }}
            />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('rdm.dailyTrigger.recipientLimit')}</span>
          </div>
        )}

        <Space wrap>
          <Button icon={<EyeOutlined />} loading={busy} disabled={!canTrigger} onClick={() => void run(true)}>
            {t('rdm.dailyTrigger.previewNoSend')}
          </Button>
          <Button icon={<FundProjectionScreenOutlined />} loading={busy} disabled={!canTrigger}
            onClick={() => void handleViewBoard()}>
            {t('rdm.dailyTrigger.viewBoard')}
          </Button>
          <Button type="primary" icon={<SendOutlined />} loading={busy} disabled={!canTrigger} onClick={handlePush}>
            {t('rdm.dailyTrigger.pushNow')}
          </Button>
        </Space>
      </div>

      {result && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{t('rdm.dailyTrigger.resultTitle')}</span>
            {result.dryRun && <Tag color="orange">{t('rdm.dailyTrigger.dryRunTag')}</Tag>}
            <Tag color={result.groupDispatched ? 'success' : 'default'}>
              {result.groupDispatched ? t('rdm.dailyTrigger.groupDispatched') : t('rdm.dailyTrigger.groupNotSent')}
            </Tag>
            <Tag color="blue">{t('rdm.dailyTrigger.personalSent', { count: result.personalSent })}</Tag>
            {result.personalSkipped > 0 && (
              <Tag color="warning">{t('rdm.dailyTrigger.personalSkipped', { count: result.personalSkipped })}</Tag>
            )}
            <Tag>{t('rdm.dailyTrigger.projectCount', { count: result.projectCount })}</Tag>
          </div>
          {result.message && (
            <Alert type={result.dryRun ? 'info' : 'success'} showIcon style={{ marginBottom: 12 }} message={result.message} />
          )}
          {result.groupContent ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{result.groupTitle}</div>
              <pre style={{
                background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6, padding: 12,
                fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: 420, overflow: 'auto',
              }}>
                {result.groupContent}
              </pre>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6 }}>{t('rdm.dailyTrigger.previewHint')}</div>
            </>
          ) : (
            <Result status="info" subTitle={t('rdm.dailyTrigger.noContent')} />
          )}
        </div>
      )}

      <DailyReportBoardPreviewModal
        open={boardOpen}
        view={boardView}
        onClose={() => setBoardOpen(false)}
      />
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

const labelStyle: React.CSSProperties = {
  fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0,
}
