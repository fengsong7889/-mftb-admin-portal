/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useState } from 'react'
import { Button, Checkbox, Input, InputNumber, Modal, Popover, Space, TimePicker, Tooltip, message } from 'antd'
import { FieldTimeOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import {
  createCpmTimeEntry, deleteCpmTimeEntry,
  type CpmItemTimeVO, type CpmItemVO, type CpmTimeEntryForm, type CpmTimeEntryVO,
} from '@/api/cpm'
import HelpPopover from '@/components/HelpPopover'
import { calcSegmentMinutes, formatMinutes, formatSegmentRange, MAX_SEGMENT_MINUTES, toClockInput } from './cpmTime'
import './cpm.css'

/**
 * 行内「記時」：把一段真实投入记成 biz_cpm_time_entry。
 *
 * 三条设计约束：
 * 1. **可选**——不点这个按钮，页面行为与阶段二完全一致；低录入成本是本模块的立身之本，
 *    任何把「填时间」变成保存前置条件的设计都要被推翻。
 * 2. 耗时默认由起止算出并当场可见，但允许显式覆盖（中途离开、补记、只记得时长）；
 *    服务端把最终值固化落库、查询时不再二次计算，否则同一行在不同查询里会给出不同工时。
 * 3. 同日允许多段（上午评审 + 下午开发是两段事实），所以这里是一张可增删的清单，
 *    而不是「一对起止时间」的表单。
 */

interface Props {
  item: CpmItemVO
  dateStr: string
  /** 该条目当天的投入时段（随日视图一次带回，不逐条目另发请求） */
  day: CpmItemTimeVO | undefined
  onChanged: () => Promise<void> | void
}

const NOTE_MAX = 200

export default function TimeEntryPopover({ item, dateStr, day, onChanged }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState<string | undefined>()
  const [end, setEnd] = useState<string | undefined>()
  const [crosses, setCrosses] = useState(false)
  const [manualMinutes, setManualMinutes] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const segments = day?.segments ?? []
  const computed = calcSegmentMinutes(start, end, crosses)
  /** 显式覆盖优先，否则用起止算出的值；两者都拿不到就是「还没填够」 */
  const effective = manualMinutes ?? computed ?? null
  const totalMinutes = segments.reduce((sum, segment) => sum + segment.durationMinutes, 0)

  const resetDraft = () => {
    setStart(undefined)
    setEnd(undefined)
    setCrosses(false)
    setManualMinutes(null)
    setNote('')
  }

  const handleSave = async () => {
    // 起止只填一半：这是最常见的误操作，前端拦一下省一次无谓往返（安全边界仍在后端）
    if ((start && !end) || (!start && end)) {
      message.warning(t('cpm.timeEntry.needBothClocks', { defaultValue: '起止需同時填寫' }))
      return
    }
    if (!effective || effective <= 0) {
      message.warning(t('cpm.timeEntry.needDuration', { defaultValue: '請填起止或耗時' }))
      return
    }
    setSaving(true)
    try {
      const form: CpmTimeEntryForm = {
        workDate: dateStr,
        startTime: start,
        endTime: end,
        crossesMidnight: crosses,
        durationMinutes: effective,
        note: note.trim() || undefined,
      }
      await createCpmTimeEntry(item.id, form)
      resetDraft()
      message.success(t('cpm.timeEntry.saved', { defaultValue: '已記錄' }))
      await onChanged()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (segment: CpmTimeEntryVO) => {
    Modal.confirm({
      title: t('cpm.timeEntry.deleteConfirmTitle', { defaultValue: '確定刪除這段投入時間？' }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper confirm-icon-wrapper--danger"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span>{t('cpm.common.item', { defaultValue: '事項：' })}</span><b>{item.title}</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('cpm.timeEntry.field.range', { defaultValue: '時段：' })}</span>
            <b>{formatSegmentRange(segment.startTime, segment.endTime, segment.crossesMidnight) ?? t('cpm.time.range.none', { defaultValue: '未填起止' })}</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('cpm.timeEntry.field.duration', { defaultValue: '耗時：' })}</span><b>{formatMinutes(segment.durationMinutes)}</b>
          </div>
        </div>
      ),
      okText: t('cpm.timeEntry.deleteConfirmOk', { defaultValue: '確認刪除' }),
      cancelText: t('common.cancel', { defaultValue: '取消' }),
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteCpmTimeEntry(segment.id)
        await onChanged()
      },
    })
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="left"
      title={(
        <Space size={6}>
          <span>{t('cpm.timeEntry.title', { date: dateStr, defaultValue: '記時（{{date}}）' })}</span>
          <HelpPopover
            ariaLabel={t('cpm.timeEntry.helpAria', { defaultValue: '記時說明' })}
            title={t('cpm.timeEntry.helpTitle', { defaultValue: '記時是選填的投入成本記錄' })}
            content={t('cpm.timeEntry.helpBody', { defaultValue: '不記時也能正常記錄與匯報，這裡的資料只用於工時分布與時間投入分析，不進入任何評價或排名口徑。跨日的時段請勾選「跨夜」。' })}
          />
        </Space>
      )}
      content={(
        <div className="cpm-time__panel">
          <div className="cpm-time__list">
            {segments.length === 0 && <div className="cpm-time__empty">{t('cpm.timeEntry.empty', { defaultValue: '今天還沒有投入時段' })}</div>}
            {segments.map(segment => (
              <div className="cpm-time__row" key={segment.id}>
                <div className="cpm-time__row-main">
                  <span className="cpm-time__row-range">
                    {formatSegmentRange(segment.startTime, segment.endTime, segment.crossesMidnight) ?? t('cpm.time.range.none', { defaultValue: '未填起止' })}
                  </span>
                  <span className="cpm-time__row-note">{segment.note ?? ''}</span>
                </div>
                <span className="cpm-time__row-minutes">{formatMinutes(segment.durationMinutes)}</span>
                <Button type="link" size="small" danger onClick={() => handleDelete(segment)}>
                  {t('cpm.common.delete', { defaultValue: '刪除' })}
                </Button>
              </div>
            ))}
          </div>

          <div className="cpm-time__draft">
            <Space size={6} align="center" wrap>
              <TimePicker
                size="small"
                format="HH:mm"
                allowClear
                value={start ? dayjs(start, 'HH:mm') : null}
                onChange={(_, timeString) => setStart(toClockInput(Array.isArray(timeString) ? timeString[0] : timeString))}
                placeholder={t('cpm.timeEntry.placeholder.start', { defaultValue: '開始' })}
              />
              <span className="cpm-time__dash">–</span>
              <TimePicker
                size="small"
                format="HH:mm"
                allowClear
                value={end ? dayjs(end, 'HH:mm') : null}
                onChange={(_, timeString) => setEnd(toClockInput(Array.isArray(timeString) ? timeString[0] : timeString))}
                placeholder={t('cpm.timeEntry.placeholder.end', { defaultValue: '結束' })}
              />
              <Checkbox checked={crosses} onChange={e => setCrosses(e.target.checked)}>
                {t('cpm.timeEntry.crossMidnight', { defaultValue: '跨夜' })}
              </Checkbox>
            </Space>
            <Space size={6} align="center" wrap style={{ marginTop: 8 }}>
              <InputNumber
                size="small"
                min={1}
                max={MAX_SEGMENT_MINUTES}
                step={15}
                value={manualMinutes ?? undefined}
                onChange={value => setManualMinutes(typeof value === 'number' ? value : null)}
                placeholder={computed
                  ? t('cpm.timeEntry.autoComputed', { minutes: computed, defaultValue: '自動 {{minutes}} 分' })
                  : t('cpm.timeEntry.placeholder.minutes', { defaultValue: '耗時(分)' })}
                style={{ width: 116 }}
              />
              <span className="cpm-time__hint">
                {manualMinutes
                  ? t('cpm.timeEntry.hint.manual', { minutes: manualMinutes, defaultValue: '將按手動 {{minutes}} 分記錄' })
                  : computed
                    ? t('cpm.timeEntry.hint.auto', { minutes: computed, defaultValue: '按起止自動計 {{minutes}} 分' })
                    : t('cpm.timeEntry.hint.either', { defaultValue: '起止或耗時擇一填寫' })}
              </span>
            </Space>
            <Input
              size="small"
              style={{ marginTop: 8 }}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t('cpm.timeEntry.placeholder.note', { defaultValue: '這段做了什麼（選填）' })}
              maxLength={NOTE_MAX}
            />
            <div className="cpm-time__draft-footer">
              <Button type="primary" size="small" icon={<PlusOutlined />} loading={saving} onClick={() => void handleSave()}>
                {t('cpm.timeEntry.addSegment', { defaultValue: '添加時段' })}
              </Button>
            </div>
          </div>

          <div className="cpm-time__total">
            {t('cpm.timeEntry.todayTotal', { minutes: formatMinutes(totalMinutes), defaultValue: '今天合計 {{minutes}}' })}
          </div>
        </div>
      )}
    >
      <Tooltip title={totalMinutes > 0
        ? t('cpm.timeEntry.tooltip', { minutes: formatMinutes(totalMinutes), defaultValue: '今天已記 {{minutes}}' })
        : undefined}>
        <Button type="link" size="small" icon={<FieldTimeOutlined style={{ fontSize: 11 }} />}>
          {t('cpm.timeEntry.button', { defaultValue: '記時' })}
        </Button>
      </Tooltip>
    </Popover>
  )
}
