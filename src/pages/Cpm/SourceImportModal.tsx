/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Input, Modal, Segmented, Space, Spin, Switch, Tag, Tooltip, Typography, message } from 'antd'
import { ImportOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  createCpmItem, fetchCpmSourceMeetingActions, fetchCpmSourceMeetings, fetchCpmSourceRdm, fetchCpmSourceRdmTasks,
  type CpmMeetingSourceVO, type CpmSourceVO,
} from '@/api/cpm'
import { RDM_STATUS_COLOR, RDM_STATUS_LABEL, type RdmStatus } from '@/constants/rdm'
import dayjs from 'dayjs'
import './cpm.css'

/**
 * 关联业务对象导入挑选器（方案 §五-A，阶段三补 RDM 任务档；本轮并入了会议本体档）。
 *
 * 五条约束：
 * 1. 清单只读，落库仍走台账/条目写入——重复导入由唯一键裁决，这里不自建第二套裁判；
 * 2. 「哪些需求/任务/会议算与我相关」由来源域的「某人视角」口径裁定，前端不传任何身份字段；
 * 3. 状态/角色词表属于来源系统：RDM 状态用 RDM_STATUS_LABEL，会议行动项 pending 与本域文案，
 *    不把上游词表抄成第二份真相；
 * 4. **需求档不回写、任务档才回写**：RDM 的进度真值在 `rdm_work_task.progress`，
 *    `rdm_requirement.progress` 被 RDM 日报明确判为「可能长期停留 0」，
 *    写它等于造出第二套假真值，所以需求档只提供关联、不提供回写开关；
 * 5. **会议本体与会议行动项是两个档而不是一个列表**：行动项是「会上分给我的那件事」
 *    （带完成时限，单日），会议本体是「那段时间本身」（带预定起止，区间）。合成一档
 *    就无法在同一列日期里说清两种语义，用户导入后才发现带进去的不是他选的那个东西。
 *    导入逻辑也不共用：行动项走条目侧 createCpmItem，会议本体必须走台账写入带区间，
 *    所以由调用方以 `onImportMeeting` 递交。
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
  /**
   * 会议本体导入回调（不传就不列这一档）。
   *
   * <p>写入留在台账侧：会议本体要落计划起日 + 计划止日，那是台账的字段，
   * 在本面板里另拼一份 payload 就会与台账的 sourceType/sourceRef 对账口径分叉。
   */
  onImportMeeting?: (row: CpmMeetingSourceVO) => Promise<void> | void
}

type SourceTab = 'rdm' | 'rdmTask' | 'meeting' | 'meetingBooking'

const ROLE_KEYS: Record<string, string> = {
  submitter: 'cpm.sourceRole.submitter',
  pm: 'cpm.sourceRole.pm',
  dev: 'cpm.sourceRole.dev',
  accept: 'cpm.sourceRole.accept',
  participant: 'cpm.sourceRole.participant',
  owner: 'cpm.sourceRole.owner',
  /* 会议本体档的角色：组织与我参会，与行动项的 owner/participant 不同词表 */
  organizer: 'cpm.meetingImport.roleOrganizer',
}

/** 会议本体状态词表属于会议域：本文件只取文案，不另存一份枚举 */
const MEETING_STATUS_KEYS: Record<string, string> = {
  booked: 'cpm.meetingImport.statusBooked',
  checked_in: 'cpm.meetingImport.statusCheckedIn',
  finished: 'cpm.meetingImport.statusFinished',
}

/**
 * 会议状态标签色：进行中给蓝/绿，已开完给中性。
 *
 * <p>不拿红色当「不是现在的会」：会议开完不是异常；而名单里根本不会出现已取消的会
 *（服务端已排除），所以这里没有任何一档需要报错色。
 */
const MEETING_STATUS_COLORS: Record<string, string> = {
  booked: 'blue',
  checked_in: 'green',
  finished: 'default',
}

export default function SourceImportModal({ open, onClose, dateStr, templateKey, categories, onImported, onImportMeeting }: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<SourceTab>('rdm')
  const [keyword, setKeyword] = useState('')
  const [rows, setRows] = useState<CpmSourceVO[]>([])
  /**
   * 会议本体档单独一份行：它的形状是「一段起止」而不是「一个时限」，
   * 塑进 CpmSourceVO 就得把 startTime/endTime 塞进 dueDate 或 subtitle，
   * 那等于在类型上撒谎，下游渲染会拿错字段。
   */
  const [meetings, setMeetings] = useState<CpmMeetingSourceVO[]>([])
  /** 行内回写开关：默认开（从任务导入就是想让两边一致），但必须一眼看得到、关得掉 */
  const [syncFlags, setSyncFlags] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [importingRef, setImportingRef] = useState<string | null>(null)

  const load = useCallback(async (which: SourceTab, kw: string) => {
    setLoading(true)
    try {
      if (which === 'meetingBooking') {
        setMeetings(await fetchCpmSourceMeetings(kw.trim() || undefined))
      } else {
        const data = which === 'rdmTask'
          ? await fetchCpmSourceRdmTasks(kw.trim() || undefined)
          : which === 'rdm'
            ? await fetchCpmSourceRdm(kw.trim() || undefined)
            : await fetchCpmSourceMeetingActions()
        setRows(data)
      }
      setLoadError(null)
    } catch (err) {
      // 候选清单来自别的系统，取不到时绝不能显示成「没有相关对象」——那是把故障说成结论
      setRows([])
      setMeetings([])
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

  /**
   * 导入：三个条目档共用一条写入路径，差别只在 `sourceType` 与是否带 `rdmSyncEnabled`。
   *
   * 任务档必须真写 `sourceType='rdm_task'` + `sourceRef=taskId`（而不是 manual + 本地绑定表）：
   * 回写徽标读的是服务端落库后的回写结果，本地绑定只在这一次会话里存在，
   * 刷新就没了的「已关联」比没有关联更误导。
   */
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
        // 只有任务档有回写语义；需求/会议档传了这个字段后端也不会开闸
        ...(row.sourceType === 'rdm_task' ? { rdmSyncEnabled: syncFlags[row.sourceRef] ?? true } : {}),
      })
      message.success(t('cpm.sourceImport.importedToast', { defaultValue: '已導入為工作記錄' }))
      setRows(prev => prev.map(r => (r.sourceRef === row.sourceRef ? { ...r, imported: true } : r)))
      onImported()
    } finally {
      setImportingRef(null)
    }
  }

  /**
   * 会议本体导入：写库交给台账侧，本面板只负责把这一行标成已导入。
   *
   * <p>失败不标：导入报错却把行灰成「已導入」，用户会以为已经进台账而不再重试；
   * 报错就保持原样，由台账侧的 syncError 把原因说出来。
   */
  const handleImportMeeting = async (row: CpmMeetingSourceVO) => {
    if (!onImportMeeting) return
    setImportingRef(`booking-${row.bookingId}`)
    try {
      await onImportMeeting(row)
      setMeetings(prev => prev.map(r => (r.bookingId === row.bookingId ? { ...r, imported: true } : r)))
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
            { value: 'rdmTask', label: t('cpm.sourceImport.tabRdmTask', { defaultValue: '產研任務' }) },
            /* 会议本体档只在台账里出现（它是唯一能接住「一段起止」的写入方）；
               其他宿主没传 onImportMeeting 就不列这一档，否则导入必丢日期 */
            ...(onImportMeeting
              ? [{ value: 'meetingBooking', label: t('cpm.sourceImport.tabMeetingBooking', { defaultValue: '會議本體' }) }]
              : []),
            { value: 'meeting', label: t('cpm.sourceImport.tabMeeting', { defaultValue: '會議行動項' }) },
          ]}
        />
        {tab !== 'meeting' && (
          <Input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onPressEnter={() => void load(tab, keyword)}
            allowClear
            style={{ width: 320 }}
            placeholder={tab === 'rdm'
              ? t('cpm.sourceImport.search', { defaultValue: '依需求標題或編號搜索' })
              : tab === 'meetingBooking'
                ? t('cpm.meetingImport.search', { defaultValue: '依會議標題或編號搜索' })
                : t('cpm.sourceImport.searchTask', { defaultValue: '依任務標題或任務號搜索' })}
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
              ? t('cpm.sourceImport.hintRdm', { defaultValue: '只列出與本人相關（提出/負責/參與/驗收）且尚未結案的需求；需求級關聯不回寫進度。' })
              : tab === 'rdmTask'
                ? t('cpm.sourceImport.hintRdmTask', { defaultValue: '只列本人負責或參與的未結案任務；導入後進度更新會回寫到 RDM 同一個任務。' })
                : tab === 'meetingBooking'
                  ? t('cpm.meetingImport.hint', { defaultValue: '只列我組織或我參與的未取消會議；導入後計劃起止取會議預定起止，會議後續被取消會自動標為已取消。' })
                  : t('cpm.sourceImport.hintMeeting', { defaultValue: '只列出本人負責或協办的未完成會議行動項。' })}
          </Typography.Text>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
        ) : tab === 'meetingBooking' ? (
          meetings.length === 0 && !loadError ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)', fontSize: 13 }}>
              {t('cpm.meetingImport.empty', { defaultValue: '目前沒有可導入的會議' })}
            </div>
          ) : (
            <div className="cpm-source__list">
              {meetings.map(row => (
                <div key={`meeting-${row.bookingId}`} className="cpm-source__row">
                  <div className="cpm-source__main">
                    <div className="cpm-source__title">{row.title}</div>
                    <Space size={6} wrap>
                      <span className="cpm-source__sub">{row.bookingNo}</span>
                      {/* 起止即导入后的计划起止：先让人看见「会带什么日期进去」再决定导入 */}
                      <span className="cpm-source__meta">
                        {dayjs(row.startTime).format(t('cpm.meetingImport.dayFormat', { defaultValue: 'MM-DD HH:mm' }))}
                        {' ~ '}
                        {dayjs(row.endTime).format(t('cpm.meetingImport.endTimeFormat', { defaultValue: 'HH:mm' }) as string)}
                      </span>
                      {row.roomName && <Tag bordered={false}>{row.roomName}</Tag>}
                      <Tag bordered={false}>{t(ROLE_KEYS[row.role] ?? '', { defaultValue: row.role === 'organizer' ? '我組織' : '我參會' })}</Tag>
                      <Tag color={MEETING_STATUS_COLORS[row.statusCode] ?? 'default'}>
                        {t(MEETING_STATUS_KEYS[row.statusCode] ?? '', { defaultValue: row.statusCode })}
                      </Tag>
                    </Space>
                  </div>
                  <Tooltip title={row.imported
                    ? t('cpm.meetingImport.importedTip', { defaultValue: '這場會議已導入過，重複導入會被拒絕' })
                    : t('cpm.meetingImport.importTip', { defaultValue: '帶入為台賬子任務，計劃起止取會議起止時間' })}>
                    <Button
                      size="small"
                      type={row.imported ? 'default' : 'primary'}
                      icon={<ImportOutlined />}
                      disabled={row.imported}
                      loading={importingRef === `booking-${row.bookingId}`}
                      onClick={() => void handleImportMeeting(row)}
                    >
                      {row.imported
                        ? t('cpm.sourceImport.imported', { defaultValue: '已導入' })
                        : t('cpm.sourceImport.import', { defaultValue: '導入' })}
                    </Button>
                  </Tooltip>
                </div>
              ))}
            </div>
          )
        ) : tab === 'rdmTask' ? (
          rows.length === 0 && !loadError ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)', fontSize: 13 }}>
              {t('cpm.sourceImport.emptyTask', { defaultValue: '目前沒有與本人相關的未結案任務' })}
            </div>
          ) : (
            <div className="cpm-source__list">
              {rows.map(task => (
                <div className="cpm-source__row" key={`rdm-task-${task.sourceRef}`}>
                  <div className="cpm-source__main">
                    <div className="cpm-source__title">{task.title}</div>
                    <Space size={6} wrap>
                      <span className="cpm-source__sub">{task.externalNo}｜{task.parentTitle}</span>
                      <Tag color={RDM_STATUS_COLOR[task.statusCode as RdmStatus] ?? 'default'}>
                        {RDM_STATUS_LABEL[task.statusCode as RdmStatus] ?? task.statusCode}
                      </Tag>
                      <Tag bordered={false}>{t(ROLE_KEYS[task.role ?? ''] ?? '', { defaultValue: task.role })}</Tag>
                      <span className="cpm-source__meta">{task.progress ?? 0}%</span>
                      {task.planHours ? <span className="cpm-source__meta">{t('cpm.sourceImport.planHours', { defaultValue: '計劃' })} {task.planHours}h</span> : null}
                      {task.dueDate && <span className="cpm-source__meta">{task.dueDate} {t('cpm.sourceImport.dueBefore', { defaultValue: '前' })}</span>}
                      {task.prdTask && <Tag color="blue">{t('cpm.sourceImport.prdTask', { defaultValue: 'PRD 任務' })}</Tag>}
                      {task.terminated && <Tag color="default">{t('cpm.sourceImport.terminated', { defaultValue: '來源已結案' })}</Tag>}
                    </Space>
                  </div>
                  <Space size={8} align="center">
                    {/* 回写开关只在导入前有意义：导入后去条目行的徽标里改，两处不各留一个开关 */}
                    <Tooltip title={t('cpm.sourceImport.syncHint', { defaultValue: '開啟後本條目的進度更新會回寫 RDM 任務；RDM 的規則仍會攔截不合法上報' })}>
                      <Switch
                        size="small"
                        checked={syncFlags[task.sourceRef] ?? true}
                        disabled={task.imported}
                        onChange={checked => setSyncFlags(prev => ({ ...prev, [task.sourceRef]: checked }))}
                      />
                    </Tooltip>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('cpm.sourceImport.syncLabel', { defaultValue: '回寫' })}</span>
                    <Button
                      size="small"
                      type={task.imported ? 'default' : 'primary'}
                      icon={<ImportOutlined />}
                      disabled={task.imported}
                      loading={importingRef === task.sourceRef}
                      onClick={() => void handleImport(task)}
                    >
                      {task.imported
                        ? t('cpm.sourceImport.imported', { defaultValue: '已導入' })
                        : t('cpm.sourceImport.import', { defaultValue: '導入' })}
                    </Button>
                  </Space>
                </div>
              ))}
            </div>
          )
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
