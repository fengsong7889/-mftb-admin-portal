import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Modal, Radio, Result, Select, Space, Spin, Tag, message } from 'antd'
import { EyeOutlined, SendOutlined } from '@ant-design/icons'
import { triggerDailyReport, type DailyReportTriggerResult } from '../../../api/rdmDailyReport'
import { fetchIterations, fetchProjectPage, type RdmIterationItem, type RdmProjectListItem } from '../../../api/rdm'
import { useAuth } from '../../../contexts/AuthContext'
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
  const [projectId, setProjectId] = useState<number | undefined>()
  const [iterationCode, setIterationCode] = useState<string | undefined>()
  const [reportType, setReportType] = useState<'morning' | 'evening'>('morning')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DailyReportTriggerResult | null>(null)

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

  /** 迭代候选按所选项目收敛：未选项目时不给选项，避免跨项目误选 */
  const iterationOptions = useMemo(
    () => iterations
      .filter(i => projectId != null && i.projectId === projectId)
      .map(i => ({ value: i.code, label: `${i.code}${i.name ? ' ' + i.name : ''}` })),
    [iterations, projectId])

  const run = async (dryRun: boolean) => {
    if (projectId == null) {
      message.warning(t('rdm.dailyTrigger.projectRequired'))
      return
    }
    setBusy(true)
    try {
      const res = await triggerDailyReport({ type: reportType, projectId, iterationCode, dryRun })
      setResult(res)
      if (!dryRun) {
        message.success(res.message || t('rdm.dailyTrigger.done'))
      }
    } catch (e) {
      message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyTrigger.failed'))
    } finally {
      setBusy(false)
    }
  }

  const handlePush = () => {
    if (projectId == null) {
      message.warning(t('rdm.dailyTrigger.projectRequired'))
      return
    }
    const project = projects.find(p => p.id === projectId)
    const target = `${project ? (project.projectNo ? project.projectNo + ' ' + project.name : project.name) : '#' + projectId}`
      + ' / ' + (iterationCode || t('rdm.dailyTrigger.allIterations'))
    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('rdm.dailyTrigger.confirmTitle'),
      content: t('rdm.dailyTrigger.confirmContent', {
        type: reportType === 'morning' ? t('rdm.dailyTrigger.typeMorning') : t('rdm.dailyTrigger.typeEvening'),
        target,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={labelStyle}>{t('rdm.dailyTrigger.fieldProject')}:</span>
          <Select
            showSearch style={{ width: 340 }} disabled={!canTrigger}
            placeholder={t('rdm.dailyTrigger.projectPlaceholder')}
            value={projectId}
            filterOption={false}
            onSearch={kw => void loadProjects(kw)}
            notFoundContent={searching ? <Spin size="small" /> : t('rdm.dailyTrigger.noProjectMatch')}
            options={projects.map(p => ({ value: p.id, label: p.projectNo ? `${p.projectNo} ${p.name}` : p.name }))}
            onChange={v => { setProjectId(v); setIterationCode(undefined) }}
          />
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('rdm.dailyTrigger.projectRequiredHint')}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={labelStyle}>{t('rdm.dailyTrigger.fieldIteration')}:</span>
          <Select
            allowClear style={{ width: 340 }} disabled={!canTrigger || projectId == null}
            placeholder={projectId == null ? t('rdm.dailyTrigger.pickProjectFirst') : t('rdm.dailyTrigger.allIterations')}
            value={iterationCode} onChange={setIterationCode}
            options={iterationOptions}
            notFoundContent={projectId == null ? t('rdm.dailyTrigger.pickProjectFirst') : t('rdm.dailyTrigger.noIteration')}
          />
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('rdm.dailyTrigger.iterationHint')}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={labelStyle}>{t('rdm.dailyTrigger.fieldType')}:</span>
          <Radio.Group value={reportType} onChange={e => setReportType(e.target.value)} disabled={!canTrigger}>
            <Radio.Button value="morning">{t('rdm.dailyTrigger.typeMorning')}</Radio.Button>
            <Radio.Button value="evening">{t('rdm.dailyTrigger.typeEvening')}</Radio.Button>
          </Radio.Group>
        </div>

        <Space>
          <Button icon={<EyeOutlined />} loading={busy} disabled={!canTrigger} onClick={() => void run(true)}>
            {t('rdm.dailyTrigger.previewNoSend')}
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
