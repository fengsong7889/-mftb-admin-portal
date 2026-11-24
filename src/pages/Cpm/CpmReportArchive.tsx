/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Empty, Space, Spin, Tag, Timeline } from 'antd'
import { TrophyFilled } from '@ant-design/icons'
import { fetchMyRecognitions, listMyCpmReports, type CpmRecognitionVO, type CpmReportVO } from '@/api/cpm'
import { CPM_PERIOD_LABELS, RECOGNITION_KIND_LABELS, type CpmPeriodValue } from './meta'
import './cpm.css'

/**
 * 我的匯報側欄（成果檔案／歷史匯報）：後端取數能力原樣保留，
 * 主閱讀面重構為本地台账自動聚合的專業匯報（見 MyReport.tsx）。
 */

export function RecognitionArchive() {
  const { t } = useTranslation()
  const [records, setRecords] = useState<CpmRecognitionVO[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchMyRecognitions()
      .then(list => { if (alive) setRecords(list) })
      .catch(err => { if (alive) setError(err instanceof Error ? err.message : t('cpm.common.loadFailed', { defaultValue: '載入失敗' })) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) return <Alert type="error" showIcon message={t('cpm.archive.recognitionLoadFailed', { defaultValue: '成果檔案載入失敗' })} description={error} />
  if (!records) return <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
  if (records.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('cpm.archive.noRecognition', { defaultValue: '還沒有收到成果認定' })} />
  }
  return (
    <div className="cpm-card">
      <div className="cpm-card__title-row">
        <div className="cpm-card__icon cpm-card__icon--purple"><TrophyFilled style={{ fontSize: 14 }} /></div>
        <span className="cpm-card__title">{t('cpm.archive.recognitionTitle', { defaultValue: '上級認可記錄' })}</span>
        <div className="cpm-card__line" />
        <span className="cpm-card__extra">{t('cpm.archive.recognitionNote', { defaultValue: '認定即績效證據，期末可供 HR 績效考核取數（二期接口）' })}</span>
      </div>
      <Timeline
        items={records.map(r => ({
          color: r.kind === 'milestone' ? 'purple' : 'blue',
          children: (
            <div>
              <Space size={6} wrap>
                <Tag className="cpm-recognition__kind" color={r.kind === 'milestone' ? 'purple' : 'blue'}>
                  {RECOGNITION_KIND_LABELS[r.kind]}
                </Tag>
                <b style={{ fontSize: 13, color: 'var(--text-1)' }}>{r.targetTitle}</b>
              </Space>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{r.comment}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {t('cpm.archive.recognitionMeta', { by: r.fromName, at: r.createdAt, period: r.periodTag, defaultValue: '認定人：{{by}} · {{at}} · 週期 {{period}}' })}
              </div>
            </div>
          ),
        }))}
      />
    </div>
  )
}

export function HistoryList() {
  const { t } = useTranslation()
  const [list, setList] = useState<CpmReportVO[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listMyCpmReports()
      .then(rows => { if (alive) setList(rows) })
      .catch(err => { if (alive) setError(err instanceof Error ? err.message : t('cpm.common.loadFailed', { defaultValue: '載入失敗' })) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) return <Alert type="error" showIcon message={t('cpm.archive.historyLoadFailed', { defaultValue: '歷史匯報載入失敗' })} description={error} />
  if (!list) return <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
  if (list.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('cpm.archive.noHistory', { defaultValue: '還沒有歷史匯報' })} />
  return (
    <div className="cpm-card">
      {list.map(r => (
        <div className="cpm-item" key={`${r.periodType}-${r.periodStart}`}>
          <div className="cpm-item__main">
            <div className="cpm-item__title">{CPM_PERIOD_LABELS[r.periodType as CpmPeriodValue] ?? r.periodType} · {r.periodStart} ~ {r.periodEnd}</div>
            <div className="cpm-item__meta">
              <Tag color={r.status === 'published' ? 'green' : 'orange'} style={{ marginInlineEnd: 0 }}>
                {r.status === 'published' ? t('cpm.archive.published', { defaultValue: '已發布' }) : t('cpm.document.edition.draft', { defaultValue: '草稿' })}
              </Tag>
              <span>{t('cpm.archive.itemMeta', { total: r.snapshot?.totals.total ?? 0, done: r.snapshot?.totals.done ?? 0, defaultValue: '{{total}} 項 · 完成 {{done}}' })}</span>
              {r.aiSummary && <Tag color="purple" style={{ marginInlineEnd: 0 }}>{t('cpm.archive.aiSummary', { defaultValue: 'AI 摘要' })}</Tag>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}