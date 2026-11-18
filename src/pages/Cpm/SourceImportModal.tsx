/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Input, Modal, Segmented, Space, Spin, Tag, Typography, message } from 'antd'
import { ImportOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  createCpmItem, fetchCpmSourceMeetingActions, fetchCpmSourceRdm,
  type CpmSourceVO,
} from '@/api/cpm'
import { RDM_STATUS_COLOR, RDM_STATUS_LABEL, type RdmStatus } from '@/constants/rdm'
import './cpm.css'

/**
 * 关联业务对象导入挑选器（方案 §五-A）。
 *
 * 三条约束：
 * 1. 清单只读，落库仍走 `POST /api/cpm/items`——重复导入由唯一键裁决，这里不自建第二套裁判；
 * 2. 「哪些需求算与我相关」由 RDM 域的「某人视角」口径裁定，前端不传任何身份字段；
 * 3. 状态/角色词表属于来源系统：RDM 状态用 RDM_STATUS_LABEL，会议行动项 pending 用本域文案，
 *    不把上游词表抄成第二份真相。
 *
 * 文案全部走 t() + defaultValue：本模块存量硬编码已被棘轮锁死（不可再增），
 * 新增界面必须从第一天就是多语言的。
 */

interface Props {
  open: boolean
  onClose: () => void
  /** 导入落哪一天（与快捷录入同一天口径） */
  dateStr: string
  templateKey?: string
  categories: { key: string; label: string; hint?: string | null }[]
  onImported: () => void
}

type SourceTab = 'rdm' | 'meeting'

const ROLE_KEYS: Record<string, string> = {
  submitter: 'cpm.sourceRole.submitter',
  pm: 'cpm.sourceRole.pm',
  dev: 'cpm.sourceRole.dev',
  accept: 'cpm.sourceRole.accept',
  participant: 'cpm.sourceRole.participant',
  owner: 'cpm.sourceRole.owner',
}

export default function SourceImportModal({ open, onClose, dateStr, templateKey, categories, onImported }: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<SourceTab>('rdm')
  const [keyword, setKeyword] = useState('')
  const [rows, setRows] = useState<CpmSourceVO[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [importingRef, setImportingRef] = useState<string | null>(null)

  const load = useCallback(async (which: SourceTab, kw: string) => {
    setLoading(true)
    try {
      setRows(which === 'rdm' ? await fetchCpmSourceRdm(kw.trim() || undefined) : await fetchCpmSourceMeetingActions())
      setLoadError(null)
    } catch (err) {
      // 候选清单来自别的系统，取不到时绝不能显示成「没有相关对象」——那是把故障说成结论
      setRows([])
      setLoadError(err instanceof Error ? err.message : t('cpm.sourceImport.loadError', { defaultValue: '候選清單載入失敗' }))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (open) void load(tab, keyword)
    // keyword 只在回车/点搜索时触发，不做输入即查（跨系统清单，避免每敲一个字打两次后端）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab])

  const handleImport = async (row: CpmSourceVO) => {
    setImportingRef(row.sourceRef)
    try {
      await createCpmItem({
        title: row.title,
        category: categories[0]?.key,
        // 结案对象落成待办（收尾还要记），进行中对象默认进行中，由本人行内调整
        status: row.terminated ? 'todo' : 'doing',
        progress: row.progress ?? 0,
        workDate: dateStr,
        templateKey,
        sourceType: row.sourceType,
        sourceRef: row.sourceRef,
        sourceLabel: row.subtitle ?? undefined,
      })
      message.success(t('cpm.sourceImport.importedToast', { defaultValue: '已導入為工作記錄' }))
      setRows(prev => prev.map(r => (r.sourceRef === row.sourceRef ? { ...r, imported: true } : r)))
      onImported()
    } finally {
      setImportingRef(null)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={760}
      footer={<Button onClick={onClose}>{t('cpm.sourceImport.close', { defaultValue: '關閉' })}</Button>}
      title={t('cpm.sourceImport.title', { defaultValue: '關聯業務對象導入' })}
      destroyOnHidden
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Segmented
          value={tab}
          onChange={v => setTab(v as SourceTab)}
          options={[
            { value: 'rdm', label: t('cpm.sourceImport.tabRdm', { defaultValue: '產研需求' }) },
            { value: 'meeting', label: t('cpm.sourceImport.tabMeeting', { defaultValue: '會議行動項' }) },
          ]}
        />
        {tab === 'rdm' && (
          <Input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onPressEnter={() => void load(tab, keyword)}
            allowClear
            style={{ width: 320 }}
            placeholder={t('cpm.sourceImport.search', { defaultValue: '依需求標題或編號搜索' })}
            suffix={<SearchOutlined style={{ color: 'var(--text-3)' }} onClick={() => void load(tab, keyword)} />}
          />
        )}
        {loadError && (
          <Alert type="error" showIcon message={loadError}
            action={<Button size="small" onClick={() => void load(tab, keyword)}>{t('cpm.sourceImport.retry', { defaultValue: '重試' })}</Button>} />
        )}
        {!loadError && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {tab === 'rdm'
              ? t('cpm.sourceImport.hintRdm', { defaultValue: '只列出與本人相關（提出/負責/參與/驗收）且尚未結案的需求。' })
              : t('cpm.sourceImport.hintMeeting', { defaultValue: '只列出本人負責或協辦的未完成會議行動項。' })}
          </Typography.Text>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
        ) : rows.length === 0 && !loadError ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)', fontSize: 13 }}>
            {tab === 'rdm'
              ? t('cpm.sourceImport.emptyRdm', { defaultValue: '目前沒有與本人相關的未結案需求' })
              : t('cpm.sourceImport.emptyMeeting', { defaultValue: '目前沒有待辦的會議行動項' })}
          </div>
        ) : (
          <div className="cpm-source__list">
            {rows.map(row => (
              <div key={`${row.sourceType}-${row.sourceRef}`} className="cpm-source__row">
                <div className="cpm-source__main">
                  <div className="cpm-source__title">{row.title}</div>
                  <Space size={6} wrap>
                    {row.subtitle && <span className="cpm-source__sub">{row.subtitle}</span>}
                    {row.statusCode && (tab === 'rdm'
                      ? <Tag color={RDM_STATUS_COLOR[row.statusCode as RdmStatus] ?? 'default'}>{RDM_STATUS_LABEL[row.statusCode as RdmStatus] ?? row.statusCode}</Tag>
                      : <Tag>{t('cpm.meetingAction.pending', { defaultValue: '待處理' })}</Tag>)}
                    {row.role && ROLE_KEYS[row.role] && (
                      <Tag bordered={false}>{t(ROLE_KEYS[row.role], { defaultValue: row.role })}</Tag>
                    )}
                    {typeof row.progress === 'number' && (
                      <span className="cpm-source__meta">{row.progress}%</span>
                    )}
                    {row.dueDate && <span className="cpm-source__meta">{row.dueDate}</span>}
                    {row.terminated && (
                      <Tag color="default">{t('cpm.sourceImport.terminated', { defaultValue: '來源已結案' })}</Tag>
                    )}
                  </Space>
                </div>
                <Button
                  size="small"
                  type={row.imported ? 'default' : 'primary'}
                  icon={<ImportOutlined />}
                  disabled={row.imported}
                  loading={importingRef === row.sourceRef}
                  onClick={() => void handleImport(row)}
                >
                  {row.imported
                    ? t('cpm.sourceImport.imported', { defaultValue: '已導入' })
                    : t('cpm.sourceImport.import', { defaultValue: '導入' })}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Space>
    </Modal>
  )
}
