/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Drawer, Table, Tag } from 'antd'
import { fetchLedgerArchive, type LedgerQuery } from './worklogApi'
import { TASK_STATUS_META, taskStatus, type GanttTask } from './worklogGanttModel'
import { noteToText } from './noteRich'

interface WorklogArchiveDrawerProps {
  open: boolean
  query: LedgerQuery
  onClose: () => void
}

interface ArchiveRow {
  key: string
  groupTitle: string
  task: GanttTask
}

/** 更早归档只读抽屉：主台账只保留活动与近 12 个月记录，这里按游标补历史。 */
export default function WorklogArchiveDrawer({ open, query, onClose }: WorklogArchiveDrawerProps) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<ArchiveRow[]>([])
  const [cursor, setCursor] = useState<{ date: string; id: number } | null>(null)
  const [matching, setMatching] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (reset: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchLedgerArchive(
        query,
        reset ? undefined : cursor?.date,
        reset ? undefined : cursor?.id,
      )
      const page = result.groups.flatMap(group => group.tasks.map(task => ({
        key: `${group.id}-${task.id}`,
        groupTitle: group.title || t('cpm.gantt.req.ungroupedTitle', { defaultValue: '未分組記錄' }),
        task,
      })))
      setRows(current => reset ? page : [...current, ...page])
      setMatching(result.matchingTaskCount)
      const next = result.archiveCursor
        ?? (result.nextCursorDate && result.nextCursorId
          ? { date: result.nextCursorDate, id: result.nextCursorId }
          : null)
      setCursor(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('cpm.gantt.archive.loadFailed', { defaultValue: '更早歸檔載入失敗' }))
    } finally {
      setLoading(false)
    }
  }, [cursor, query, t])

  useEffect(() => {
    if (!open) return
    setRows([])
    setCursor(null)
    setMatching(0)
    void load(true)
    // 抽屉每次打开都从第一页重读；load 会随游标变化，不能把它塞进依赖造成重复翻页。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const columns = [
    { title: t('cpm.gantt.col.item', { defaultValue: '工作項' }), dataIndex: 'groupTitle', width: 180 },
    { title: t('cpm.gantt.col.task', { defaultValue: '任務子項' }), width: 260, render: (_: unknown, row: ArchiveRow) => row.task.title },
    { title: t('cpm.gantt.col.start', { defaultValue: '開始日期' }), width: 120, render: (_: unknown, row: ArchiveRow) => row.task.start ?? '-' },
    { title: t('cpm.gantt.col.end', { defaultValue: '結束日期' }), width: 120, render: (_: unknown, row: ArchiveRow) => row.task.end ?? '-' },
    { title: t('cpm.gantt.col.progress', { defaultValue: '當前進度' }), width: 100, render: (_: unknown, row: ArchiveRow) => `${row.task.progress}%` },
    {
      title: t('common.colStatus', { defaultValue: '狀態' }),
      width: 100,
      render: (_: unknown, row: ArchiveRow) => {
        const status = taskStatus(row.task)
        return <Tag color={TASK_STATUS_META[status].tag}>{TASK_STATUS_META[status].label}</Tag>
      },
    },
    { title: t('cpm.gantt.col.hours', { defaultValue: '耗時' }), width: 90, render: (_: unknown, row: ArchiveRow) => row.task.hours == null ? '-' : `${row.task.hours}h` },
    { title: t('cpm.gantt.col.note', { defaultValue: '備註原因' }), width: 260, render: (_: unknown, row: ArchiveRow) => noteToText(row.task.note) || '-' },
  ]

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={1040}
      destroyOnClose
      title={t('cpm.gantt.archive.title', { defaultValue: '更早歸檔記錄' })}
    >
      {error && (
        <Alert type="error" showIcon style={{ marginBottom: 14 }} message={error}
          action={<Button size="small" onClick={() => void load(rows.length === 0)}>{t('cpm.sourceImport.retry', { defaultValue: '重試' })}</Button>} />
      )}
      <p className="wg-archive-summary">
        {t('cpm.gantt.archive.summary', {
          loaded: rows.length, matching,
          defaultValue: '已載入 {{loaded}} 條 · 更早歸檔共 {{matching}} 條',
        })}
      </p>
      <Table<ArchiveRow>
        rowKey="key"
        size="small"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
        scroll={{ x: 'max-content' }}
      />
      <div className="wg-archive-footer">
        <Button onClick={onClose}>{t('cpm.gantt.archive.backToLedger', { defaultValue: '返回台账' })}</Button>
        {cursor && rows.length < matching && (
          <Button loading={loading} onClick={() => void load(false)}>
            {t('cpm.gantt.archive.loadMore', { defaultValue: '載入更多更早記錄' })}
          </Button>
        )}
        {!loading && (!cursor || rows.length >= matching) && (
          <span>{t('cpm.gantt.archive.end', { count: rows.length, defaultValue: '更早歸檔已全部載入（{{count}} 條）' })}</span>
        )}
      </div>
    </Drawer>
  )
}
