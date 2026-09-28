import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Descriptions, Drawer, Input, InputNumber, Space, Table, Tag, Typography, message } from 'antd'
import type { TableColumnsType } from 'antd'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import {
  ASSESS_STATUS, INDICATOR_SCORE_MAX, type PerfAssessment, type PerfScoreItem,
  fetchMyAssessment, fetchPerfAssessment, previewWeighted, submitPerfScore,
} from '../../api/hrPerformance'
import { ASSESS_STATUS_LABEL_KEY, ASSESS_STATUS_TAG_COLOR } from './meta'

/** 打分抽屉的四种视角：自评（可写）、上级评（可写）、员工自助查看（走 /my 端点、只读）、HR 查看（只读） */
export type ScoreDrawerMode = 'self' | 'supervisor' | 'self-view' | 'view'

interface Props {
  open: boolean
  assessmentId?: number
  mode: ScoreDrawerMode
  onClose: () => void
  /** 保存/提交成功后回调（列表页据此刷新） */
  onChanged?: () => void
}

/** 明细编辑态：仅前端草稿，提交时一次性发给后端 */
interface EditRow {
  itemId: number
  score: number | null
  targetValue: string
  remark: string
}

const toRows = (items: PerfScoreItem[], mode: ScoreDrawerMode): EditRow[] => items.map(i => ({
  itemId: i.id,
  score: (mode === 'self' || mode === 'self-view' ? i.selfScore : i.supervisorScore) ?? null,
  targetValue: i.targetValue || '',
  remark: i.remark || '',
}))

/**
 * 指标打分抽屉（自评/上级评/查看共用）。
 * <p>
 * 总分一律由服务端按权重计算，抽屉里的合计只做即时预览；
 * 自评视角走 /hr/perf/my 端点取数，未确认时上级评分字段根本不会下发，
 * 因此即便有人改前端状态也拿不到别人的分数。
 */
export default function ScoreDrawer({ open, assessmentId, mode, onClose, onChanged }: Props) {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<PerfAssessment | null>(null)
  const [rows, setRows] = useState<EditRow[]>([])
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const editable = mode === 'self' || mode === 'supervisor'
  /** 员工侧一律走 /hr/perf/my 端点：已确认结果由服务端放行，未确认则根本不下发 */
  const selfSide = mode === 'self' || mode === 'self-view'

  const load = useCallback(async () => {
    if (!assessmentId) return
    setLoading(true)
    try {
      const data = selfSide ? await fetchMyAssessment(assessmentId) : await fetchPerfAssessment(assessmentId)
      setDetail(data)
      setRows(toRows(data.items || [], mode))
      setComment(mode === 'self' ? data.selfComment || '' : '')
    } catch {
      // 请求层已统一提示
    } finally {
      setLoading(false)
    }
  }, [assessmentId, mode, selfSide])

  useEffect(() => {
    if (open) load()
    else { setDetail(null); setRows([]); setComment('') }
  }, [open, load])

  const patchRow = (itemId: number, patch: Partial<EditRow>) => {
    setRows(prev => prev.map(r => (r.itemId === itemId ? { ...r, ...patch } : r)))
  }

  const totalWeight = useMemo(() => (detail?.items || [])
    .reduce((sum, i) => sum + (Number(i.weight) || 0), 0), [detail])

  /** 与明细行一一对应（rows 由 items 直接生成），仅用于录入时的即时预览 */
  const previewTotal = useMemo(() => previewWeighted((detail?.items || []).map((item, idx) => ({
    weight: Number(item.weight) || 0,
    score: rows[idx]?.score ?? null,
  }))), [rows, detail])

  const doSubmit = async (submit: boolean) => {
    if (!assessmentId) return
    if (submit && rows.some(r => r.score == null)) {
      message.warning(t('hrPerf.allItemsRequired'))
      return
    }
    setSaving(true)
    try {
      const next = await submitPerfScore(assessmentId, {
        comment: comment.trim() || undefined,
        submit,
        items: rows.map(r => ({
          itemId: r.itemId,
          score: r.score ?? undefined,
          targetValue: r.targetValue || undefined,
          remark: r.remark || undefined,
        })),
      })
      message.success(submit ? t('hrPerf.scoreSubmitted') : t('hrPerf.draftSaved'))
      setDetail(next)
      setRows(toRows(next.items || [], mode))
      onChanged?.()
      if (submit) onClose()
    } catch {
      // 请求层已统一提示（漏评/阶段不符/已确认冻结都由后端把关）
    } finally {
      setSaving(false)
    }
  }

  const statusLabel = (code?: string) => (code && ASSESS_STATUS_LABEL_KEY[code]
    ? t(ASSESS_STATUS_LABEL_KEY[code]) : (code || '-'))

  const columns = useMemo<TableColumnsType<PerfScoreItem>>(() => {
    const base: TableColumnsType<PerfScoreItem> = [
      { title: t('hrPerf.indicator'), dataIndex: 'indicatorName', key: 'indicatorName', width: 180 },
      {
        title: t('hrPerf.weight'), dataIndex: 'weight', key: 'weight', width: 80,
        render: (v: number) => `${v}`,
      },
    ]
    if (mode !== 'self') {
      base.push({
        title: t('hrPerf.selfScore'), dataIndex: 'selfScore', key: 'selfScore', width: 90,
        render: (v: number | null) => (v == null ? '-' : v),
      })
    }
    base.push({
      // 录入时该列就是“我要填的分”，只读时它是“最新分”，列名必须跟着变
      title: editable ? (mode === 'self' ? t('hrPerf.myScore') : t('hrPerf.supervisorScore')) : t('hrPerf.scoredColumn'),
      key: 'currentScore', width: 150,
      render: (_, r) => {
        const row = rows.find(x => x.itemId === r.id)
        if (!editable) {
          // 只读：最终分 > 上级分 > 自评分（与后端下发口径一致）
          const v = r.finalScore ?? r.supervisorScore ?? r.selfScore
          return v == null ? '-' : v
        }
        return (
          <InputNumber min={0} max={INDICATOR_SCORE_MAX} precision={2} style={{ width: '100%' }}
            value={row?.score ?? null} placeholder={t('hrPerf.scorePlaceholder')}
            onChange={v => patchRow(r.id, { score: v == null ? null : Number(v) })} />
        )
      },
    })
    if (editable) {
      base.push({
        title: t('hrPerf.targetValue'), key: 'targetValue', width: 170,
        render: (_, r) => {
          const row = rows.find(x => x.itemId === r.id)
          return (
            <Input maxLength={200} value={row?.targetValue} placeholder={t('hrPerf.targetValuePlaceholder')}
              onChange={e => patchRow(r.id, { targetValue: e.target.value })} />
          )
        },
      })
    }
    base.push({
      title: t('hrPerf.finalScore'), dataIndex: 'finalScore', key: 'finalScore', width: 90,
      render: (v: number | null) => (v == null ? '-' : v),
    })
    base.push({
      title: t('common.colRemark'), key: 'remark', width: 200,
      render: (_, r) => {
        const row = rows.find(x => x.itemId === r.id)
        if (!editable) return r.remark || '-'
        return (
          <Input maxLength={500} value={row?.remark} placeholder={t('hrPerf.remarkPlaceholder')}
            onChange={e => patchRow(r.id, { remark: e.target.value })} />
        )
      },
    })
    return base
  }, [t, mode, rows, editable])

  return (
    <Drawer
      title={detail ? `${t('hrPerf.scoreDrawerTitle')} · ${detail.empName || ''}` : t('hrPerf.scoreDrawerTitle')}
      open={open}
      onClose={onClose}
      width={Math.min(1120, typeof window !== 'undefined' ? window.innerWidth - 60 : 1120)}
      destroyOnClose
      extra={editable && (
        <Space>
          <Button onClick={() => doSubmit(false)} loading={saving}>{t('hrPerf.saveDraft')}</Button>
          <Button type="primary" onClick={() => doSubmit(true)} loading={saving}>
            {mode === 'self' ? t('hrPerf.submitSelf') : t('hrPerf.submitSupervisor')}
          </Button>
        </Space>
      )}
    >
      {mode === 'supervisor' && detail?.status === ASSESS_STATUS.SELF_PENDING && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={t('hrPerf.selfNotDoneTip')} />
      )}
      {mode === 'self' && detail?.status !== ASSESS_STATUS.SELF_PENDING && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('hrPerf.selfAlreadyDone')} />
      )}

      <Descriptions size="small" column={3} style={{ marginBottom: 12 }}
        items={[
          { key: 'plan', label: t('hrPerf.plan'), children: detail?.planName || '-' },
          { key: 'emp', label: t('hrPerf.employee'), children: `${detail?.empName || '-'}${detail?.empNo ? ` (${detail.empNo})` : ''}` },
          { key: 'dept', label: t('hrPerf.department'), children: detail?.deptName || '-' },
          { key: 'position', label: t('hrPerf.position'), children: `${detail?.positionName || '-'}${detail?.positionLevel ? ` / ${detail.positionLevel}` : ''}` },
          { key: 'evaluator', label: t('hrPerf.evaluator'), children: detail?.evaluatorName || t('hrPerf.notAssigned') },
          {
            key: 'status',
            label: t('common.colStatus'),
            children: <Tag color={ASSESS_STATUS_TAG_COLOR[detail?.status || '']}>{statusLabel(detail?.status)}</Tag>,
          },
        ]} />

      <Table<PerfScoreItem>
        size="small"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={detail?.items || []}
        pagination={false}
        scroll={{ x: 'max-content' }}
        summary={editable ? () => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={2}>
              <Typography.Text strong>{t('hrPerf.weightSum')}</Typography.Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={2} colSpan={4}>
              <Space size={12}>
                <Typography.Text>{`${totalWeight}`}</Typography.Text>
                <Typography.Text strong>{t('hrPerf.previewTotal')}</Typography.Text>
                <Typography.Text strong style={{ color: '#E8720C' }}>
                  {previewTotal ?? '-'}
                </Typography.Text>
                <Typography.Text type="secondary">{t('hrPerf.weightedServerSideTip')}</Typography.Text>
              </Space>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        ) : undefined}
      />

      {editable && (
        <div style={{ marginTop: 16 }}>
          <Typography.Text strong>{mode === 'self' ? t('hrPerf.selfComment') : t('hrPerf.supervisorComment')}</Typography.Text>
          <Input.TextArea rows={3} maxLength={1000} showCount style={{ marginTop: 8 }}
            value={comment} placeholder={t('hrPerf.commentPlaceholder')} onChange={e => setComment(e.target.value)} />
        </div>
      )}

      {!editable && detail && (<>
        <Descriptions column={1} size="small" style={{ marginTop: 16 }}
          items={[
            { key: 'self', label: t('hrPerf.selfSummary'), children: detail.selfScore == null ? '-' : `${detail.selfScore}${detail.selfAt ? ` · ${dayjs(detail.selfAt).format('YYYY-MM-DD HH:mm')}` : ''}` },
            { key: 'sup', label: t('hrPerf.supervisorSummary'), children: detail.supervisorScore == null ? t('hrPerf.hiddenUntilConfirmed') : `${detail.supervisorScore}${detail.supervisorComment ? ` · ${detail.supervisorComment}` : ''}` },
            { key: 'cal', label: t('hrPerf.calibrationSummary'), children: detail.calibratedScore == null && !detail.calibratedGrade ? '-' : `${detail.calibratedScore ?? ''} ${detail.calibratedGrade ?? ''} · ${detail.calibratedReason || '-'}` },
            { key: 'final', label: t('hrPerf.finalResult'), children: detail.finalScore == null ? t('hrPerf.hiddenUntilConfirmed') : `${detail.finalScore} / ${detail.finalGrade || '-'}` },
          ]} />
      </>)}
    </Drawer>
  )
}
