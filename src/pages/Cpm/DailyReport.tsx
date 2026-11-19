/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Space, Spin, message } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { fetchCpmDaily, type CpmSnapshot } from '@/api/cpm'
import CpmReportDocument from './CpmReportDocument'
import CpmExportButton from './CpmExportButton'
import { buildDocModel } from './cpmDocument'
import { snapshotToMarkdown } from './cpmPeriod'

/**
 * 日報只读投影（阶段三新增查看档位）。
 *
 * **日报不建 report 实体、不给发布按钮**：它今天是「条目的当日投影」，这一点在阶段二的
 * 数据库设计里也保持不变（`biz_cpm_report.period_type` 的 CHECK 不放宽）。
 * 给日报加发布动作，等于给每个人每天多一个打卡任务——本模块的反内卷红线不允许。
 *
 * 取数走 `GET /cpm/reports/daily`：日报的工时与分组由服务端同一个 `CpmSnapshotBuilder`
 * 算出（区间取 [date, date]），所以「日报数字」和「周报里这一天的数字」必然相等。
 * 前端若自己按日投影，两处口径迟早分叉，而这正是最难被发现的那类错误。
 */

interface Props {
  date: Dayjs
  periodLabel: string
  ownerName?: string | null
  ownerEmpId?: string | null
}

export default function DailyReport({ date, periodLabel, ownerName, ownerEmpId }: Props) {
  const { t } = useTranslation()
  const dateStr = date.format('YYYY-MM-DD')
  const [snapshot, setSnapshot] = useState<CpmSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const docRef = useRef<HTMLElement | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const daily = await fetchCpmDaily(dateStr)
      setSnapshot(daily.snapshot ?? null)
      setError(null)
    } catch (err) {
      setSnapshot(null)
      setError(err instanceof Error ? err.message : t('cpm.common.loadFailed', { defaultValue: '載入失敗' }))
    } finally {
      setLoading(false)
    }
  }, [dateStr])

  useEffect(() => { void reload() }, [reload])

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
  }
  if (error) {
    return (
      <Alert type="error" showIcon message={t('cpm.daily.loadError', { defaultValue: '日報載入失敗' })} description={error}
        action={<Button size="small" onClick={() => void reload()}>{t('common.retry', { defaultValue: '重試' })}</Button>} />
    )
  }

  const range = { start: dateStr, end: dateStr }
  const model = buildDocModel(snapshot)

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(snapshotToMarkdown(periodLabel, snapshot, undefined, { time: model.time }))
      message.success(t('cpm.report.copied', { defaultValue: '已複製 Markdown' }))
    } catch {
      message.error(t('cpm.report.clipboardUnavailable', { defaultValue: '剪貼板不可用' }))
    }
  }

  return (
    <CpmReportDocument
      docTitle={t('cpm.daily.title', { period: periodLabel, defaultValue: '工作日報（{{period}}）' })}
      ownerName={ownerName}
      ownerEmpId={ownerEmpId}
      periodLabel={periodLabel}
      status="readonly"
      model={model}
      range={range}
      rootRef={docRef}
      actions={(
        <Space size={8} wrap>
          <Button icon={<CopyOutlined />} onClick={() => void handleCopyMarkdown()}>
            {t('cpm.report.copyMarkdown', { defaultValue: '複製 Markdown' })}
          </Button>
          <CpmExportButton getTarget={() => docRef.current} fileBase={t('cpm.daily.fileBase', { date: dateStr, defaultValue: '工作日報_{{date}}' })} />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {t('cpm.daily.footnote', { defaultValue: '日報不需發布；正式版本只在「週報／月報」產生，因此沒有 Word 出口' })}
          </span>
        </Space>
      )}
    />
  )
}
