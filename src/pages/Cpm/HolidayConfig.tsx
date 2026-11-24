/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, DatePicker, Modal, Select, Tag, Tooltip, message } from 'antd'
import {
  ClearOutlined,
  PlusOutlined, ScheduleOutlined, SettingOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import {
  dayType, fmt, isRestDay, mondayOf, setDayType, weekdayShort,
  SPECIAL_DAY_TYPES, type GanttData, type SpecialDayType,
} from './worklogGanttModel'
import { clearCalendarYear, fetchLedger, setCalendarDay } from './worklogApi'
import './holidayConfig.css'

/**
 * 節假日配置（/cpm-holiday，獨立一級菜單 cpm-holiday；種子見 cpm:menu:v1.1，动作集 view,edit）。
 *
 * 本页是**独立菜单页**，不是从台账跳转过去的子页：所以头部不放返回按钮——
 * 左侧菜单就是它的入口，一个「返回台账」的箭头会把人引向一条并不存在的层级关系。
 * 头部按全局规范保留橙色渐变动画条 + 标题；年度筛选下沉到 `.search-section`，
 * 统计卡仍在查询区下方（§E.8），与其他列表菜单同一自上而下顺序。
 *
 * 日期类型四选一：節假日/調休/請假 不计工时，補班（周末上班）计工时。
 * 本页为「即改即生效」的配置面而非单据表单，故无底部 form-footer。
 */

const TYPE_META = Object.fromEntries(SPECIAL_DAY_TYPES.map(t => [t.value, t])) as Record<SpecialDayType, typeof SPECIAL_DAY_TYPES[number]>
/** 年历表头从周一开始：取 weekdayShort 的下标映射，而不是另存一份中文数组 */
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]

interface CalCell {
  date: Dayjs
  key: string
  inMonth: boolean
  weekend: boolean
  type: SpecialDayType | null
  today: boolean
}

/** 空台账：后端未返回前不给假数据（同域铁律） */
const EMPTY: GanttData = { groups: [], holidays: [], makeup: [], compOff: [], leave: [] }

export default function HolidayConfig() {
  const { t } = useTranslation()
  const [data, setData] = useState<GanttData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [year, setYear] = useState(dayjs().year())
  const [addDate, setAddDate] = useState<Dayjs | null>(null)
  const [addType, setAddType] = useState<'auto' | SpecialDayType>('auto')

  /** 日历只读台账接口的名单部分：工时口径只有一个真源，不在这里再开一套存储 */
  const reload = useCallback(async () => {
    try {
      const res = await fetchLedger()
      setData(res.data)
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t('cpm.holiday.loadFailed', { defaultValue: '日曆載入失敗' }))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void reload() }, [reload])

  const months = useMemo(() => {
    const out: { label: string; cells: CalCell[] }[] = []
    const today = dayjs()
    for (let m = 0; m < 12; m++) {
      const first = dayjs(`${year}-${String(m + 1).padStart(2, '0')}-01`)
      const last = first.endOf('month')
      const start = mondayOf(first)
      const end = mondayOf(last).add(6, 'day')
      const cells: CalCell[] = []
      for (let cur = start; cur.isBefore(end) || cur.isSame(end, 'day'); cur = cur.add(1, 'day')) {
        const key = fmt(cur)
        cells.push({
          date: cur,
          key,
          inMonth: cur.month() === m,
          weekend: cur.day() === 0 || cur.day() === 6,
          type: dayType(key, data),
          today: cur.isSame(today, 'day'),
        })
      }
      out.push({ label: first.format(t('cpm.holiday.monthFormat', { defaultValue: 'YYYY 年 MM 月' })), cells })
    }
    return out
  }, [year, data, t])

  const yearStats = useMemo(() => {
    const inYear = (list: string[]) => list.filter(x => x.startsWith(`${year}-`))
    let workdays = 0
    for (let cur = dayjs(`${year}-01-01`); cur.year() === year; cur = cur.add(1, 'day')) {
      if (!isRestDay(cur, data)) workdays += 1
    }
    return {
      holiday: inYear(data.holidays).length,
      makeup: inYear(data.makeup).length,
      compOff: inYear(data.compOff).length,
      leave: inYear(data.leave).length,
      workdays,
    }
  }, [data, year])

  /** 已配置日期总表（当年，按日期排序）：一条记录 = 一天 + 类型 */
  const configured = useMemo(() => {
    const rows: { key: string; type: SpecialDayType }[] = []
    data.holidays.filter(x => x.startsWith(`${year}-`)).forEach(k => rows.push({ key: k, type: 'holiday' }))
    data.makeup.filter(x => x.startsWith(`${year}-`)).forEach(k => rows.push({ key: k, type: 'makeup' }))
    data.compOff.filter(x => x.startsWith(`${year}-`)).forEach(k => rows.push({ key: k, type: 'compOff' }))
    data.leave.filter(x => x.startsWith(`${year}-`)).forEach(k => rows.push({ key: k, type: 'leave' }))
    return rows.sort((a, b) => (a.key < b.key ? -1 : 1))
  }, [data, year])

  /**
   * 写入一天口径：本地先行，服务端落定。
   *
   * <p>使用侧永远只写本人作用域（服务端强制），所以「清空本年」只会清掉自己登记的
   * 调休/请假/个人补班，不会把全公司的法定名单抹掉。
   */
  const applyType = (key: string, type: SpecialDayType | null, tip: string) => {
    setData(d => ({ ...d, ...setDayType(d, key, type) }))
    void setCalendarDay(key, type).then(() => message.success(tip)).catch(e => {
      message.error(e instanceof Error ? e.message : t('cpm.holiday.msg.saveFailed', { defaultValue: '口徑保存失敗，已回滾' }))
      void reload()
    })
  }

  /** 年历直接点选：工作日→節假日；周末→補班；已是特殊日→恢复默认口徑 */
  const toggleDay = (c: CalCell) => {
    if (!c.inMonth) return
    if (c.type) {
      applyType(c.key, null, t('cpm.holiday.msg.restored', {
        date: c.key, kind: c.weekend ? t('cpm.holiday.weekendRest', { defaultValue: '周末休息' }) : t('cpm.holiday.workday', { defaultValue: '工作日' }),
        defaultValue: '{{date}} 已恢復為{{kind}}口徑',
      }))
    } else if (c.weekend) {
      applyType(c.key, 'makeup', t('cpm.holiday.msg.setMakeup', { date: c.key, defaultValue: '{{date}} 設為補班（計工時）' }))
    } else {
      applyType(c.key, 'holiday', t('cpm.holiday.msg.setHoliday', { date: c.key, defaultValue: '{{date}} 設為節假日（不計工時）' }))
    }
  }

  const cellTip = (c: CalCell): string => {
    if (!c.inMonth) return ''
    if (c.type) return t('cpm.holiday.tip.revert', { type: TYPE_META[c.type].label, defaultValue: '{{type}}・點擊恢復默認口徑' })
    return c.weekend
      ? t('cpm.holiday.tip.weekendToMakeup', { defaultValue: '周末・點擊設為補班' })
      : t('cpm.holiday.tip.workdayToHoliday', { defaultValue: '工作日・點擊設為節假日' })
  }

  const applyAdd = () => {
    if (!addDate) return
    const key = fmt(addDate)
    const weekend = addDate.day() === 0 || addDate.day() === 6
    const type: SpecialDayType = addType === 'auto' ? (weekend ? 'makeup' : 'holiday') : addType
    applyType(key, type, t('cpm.holiday.msg.applied', { date: key, type: TYPE_META[type].label, defaultValue: '{{date}} 已設為{{type}}' }))
    setAddDate(null)
  }

  /**
   * 全局法定名单已由服务端种子化，本页不再自己拷一份。
   * 按钮保留为一个“拉取最新全局名单”的刷新动作，避免用户以为需要手工导入。
   */
  const applyYearHolidays = () => {
    void reload()
    message.success(t('cpm.holiday.msg.refreshed', { defaultValue: '已同步系統法定假日名單' }))
  }

  /**
   * 清空本年只清本人登记。
   *
   * <p>旧实现从示例数据把法定假日拷进本地名单；现在全局法定名单由系统种子维护，
   * 拷一份到个人名单既多余又会让两边名单分叉。
   */
  const clearYear = () => {
    Modal.confirm({
      title: t('cpm.holiday.clearTitle', { year, defaultValue: '清空 {{year}} 年节假日配置？' }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper confirm-icon-wrapper--danger"><span className="confirm-icon-text">!</span></span>,
      content: t('cpm.holiday.clearContent', { year, defaultValue: '將移除 {{year}} 年全部節假日、補班、調休與請假登記，恢復默認周末休息口徑。' }),
      okText: t('cpm.holiday.clearOk', { defaultValue: '確認清空' }),
      cancelText: t('common.cancel', { defaultValue: '取消' }),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await clearCalendarYear(year)
          await reload()
          message.success(t('cpm.holiday.msg.cleared', { year, defaultValue: '已清空 {{year}} 年配置' }))
        } catch (e) {
          message.error(e instanceof Error ? e.message : t('cpm.holiday.msg.saveFailed', { defaultValue: '口徑保存失敗，已回滾' }))
        }
      },
    })
  }

  return (
    <div className="content-area">
      {loadError && (
        <Alert type="error" showIcon style={{ marginBottom: 14 }}
          message={t('cpm.holiday.loadFailed', { defaultValue: '日曆載入失敗' })} description={loadError}
          action={<Button size="small" onClick={() => void reload()}>{t('cpm.sourceImport.retry', { defaultValue: '重試' })}</Button>} />
      )}
      {/* 頁面頭部：独立菜单页——渐变动画条 + 标题，无返回按钮（入口在左侧菜单） */}
      <div className="hc-pagehead">
        <div className="hc-pagehead__bar" />
        <div className="hc-pagehead__row">
          <div className="hc-pagehead__left">
            <h2>{t('cpm.holiday.title', { defaultValue: '節假日配置' })}</h2>
            <span className="hc-pagehead__sub">{t('cpm.holiday.subtitle', { defaultValue: '工作日口徑：節假日/調休/請假不計工時，補班計入；改動實時同步台账與匯報' })}</span>
          </div>
        </div>
      </div>

      {/* 查询区：年度筛选。它从头部右侧搬到这里，是为了让统计卡能落在查询区下方——
          先给数字再说口径，与其他列表菜单同一顺序；留在头部就会让人先看到未过滤的全量 */}
      <div className="search-section hc-search">
        <span className="hc-search__label">{t('cpm.holiday.searchYear', { defaultValue: '年度' })}</span>
        <div className="hc-search__years">
          {[year - 1, year, year + 1].map(y => (
            <Button key={y} size="small" type={y === year ? 'primary' : 'default'} onClick={() => setYear(y)}>{y}</Button>
          ))}
        </div>
        <span className="hc-search__hint">{t('cpm.holiday.searchHint', { defaultValue: '切换年度只看该年的口径与登记明细' })}</span>
      </div>

      {/* 統計與圖例 */}
      <div className="hc-stats">
        <span className="hc-stat"><i style={{ background: TYPE_META.holiday.color }} />{TYPE_META.holiday.label} <b>{yearStats.holiday}</b> {t('cpm.holiday.unitDay', { defaultValue: '天' })}</span>
        <span className="hc-stat"><i style={{ background: TYPE_META.makeup.color }} />{TYPE_META.makeup.label} <b>{yearStats.makeup}</b> {t('cpm.holiday.unitDay', { defaultValue: '天' })}</span>
        <span className="hc-stat"><i style={{ background: TYPE_META.compOff.color }} />{TYPE_META.compOff.label} <b>{yearStats.compOff}</b> {t('cpm.holiday.unitDay', { defaultValue: '天' })}</span>
        <span className="hc-stat"><i style={{ background: TYPE_META.leave.color }} />{TYPE_META.leave.label} <b>{yearStats.leave}</b> {t('cpm.holiday.unitDay', { defaultValue: '天' })}</span>
        <span className="hc-stat"><i style={{ background: 'var(--success)' }} />{t('cpm.holiday.workdaysYear', { defaultValue: '全年工作日' })} <b>{yearStats.workdays}</b> {t('cpm.holiday.unitDay', { defaultValue: '天' })}</span>
        <span className="hc-stat hc-stat--legend"><i className="hc-lg-work" />{t('cpm.holiday.workday', { defaultValue: '工作日' })}</span>
        <span className="hc-stat hc-stat--legend"><i className="hc-lg-rest" />{t('cpm.holiday.weekendShort', { defaultValue: '周末休' })}</span>
        <span className="hc-stat hc-stat--legend"><i className="hc-lg-today" />{t('cpm.holiday.today', { defaultValue: '今天' })}</span>
      </div>

      <div className="hc-layout">
        {/* 年歷：直接点选 */}
        <div className="hc-cal">
          {months.map(m => (
            <div key={m.label} className="hc-month">
              <div className="hc-month__title">{m.label}</div>
              <div className="hc-month__week">
                {MONDAY_FIRST.map(i => <span key={i}>{weekdayShort(i)}</span>)}
              </div>
              <div className="hc-month__grid">
                {m.cells.map(c => (
                  <Tooltip key={c.key} title={cellTip(c)} mouseEnterDelay={0.4}>
                    <button
                      type="button"
                      className={[
                        'hc-day',
                        c.inMonth ? '' : 'hc-day--out',
                        c.type ? `hc-day--${c.type === 'compOff' ? 'compoff' : c.type}` : c.weekend ? 'hc-day--rest' : '',
                        c.today ? 'hc-day--today' : '',
                      ].join(' ')}
                      onClick={() => toggleDay(c)}
                    >
                      {c.date.date()}
                    </button>
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}
        </div>

        <aside className="hc-side">
          <HcCard icon={<PlusOutlined />} tone="blue" title={t('cpm.holiday.card.add', { defaultValue: '添加日期' })} note={t('cpm.holiday.card.addNote', { defaultValue: '四類型' })}>
            <div className="hc-side__add">
              <DatePicker value={addDate} onChange={setAddDate} placeholder={t('cpm.holiday.pickDate', { defaultValue: '選擇日期' })} style={{ width: '100%' }} />
              <div className="hc-side__addrow">
                <Select
                  style={{ flex: 1 }}
                  value={addType}
                  onChange={setAddType}
                  options={[{ value: 'auto', label: t('cpm.holiday.autoDetect', { defaultValue: '自動識別' }) }, ...SPECIAL_DAY_TYPES.map(x => ({ value: x.value, label: x.label }))]}
                />
                <Button type="primary" icon={<PlusOutlined />} disabled={!addDate} onClick={applyAdd}>{t('cpm.holiday.add', { defaultValue: '添加' })}</Button>
              </div>
            </div>
            <p className="hc-side__tip">{t('cpm.holiday.addTip', { defaultValue: '自動識別：工作日→節假日，周末→補班。請假/調休請手動選擇類型。' })}</p>
          </HcCard>

          <HcCard
            icon={<ScheduleOutlined />}
            tone="info"
            title={t('cpm.holiday.card.configured', { count: configured.length, defaultValue: '已配置日期（{{count}}）' })}
            note={t('cpm.holiday.card.configuredNote', { defaultValue: '× 恢復口徑' })}
          >
            <div className="hc-tags">
              {configured.length === 0 && <p className="hc-side__tip">{t('cpm.holiday.noneInYear', { defaultValue: '本年暫無配置' })}</p>}
              {configured.map(r => (
                <Tag
                  key={r.key}
                  color={TYPE_META[r.type].tag}
                  closable
                  onClose={e => { e.preventDefault(); applyType(r.key, null, t('cpm.holiday.msg.reverted', { date: r.key, defaultValue: '{{date}} 已恢復默認口徑' })) }}
                >
                  {r.key}・{TYPE_META[r.type].label}
                </Tag>
              ))}
            </div>
          </HcCard>

          <HcCard icon={<SettingOutlined />} tone="orange" title={t('cpm.holiday.card.quick', { defaultValue: '快速操作' })} note={t('cpm.holiday.card.quickNote', { year, defaultValue: '僅 {{year}} 年' })}>
            <div className="hc-side__ops">
              <Button icon={<ScheduleOutlined />} onClick={applyYearHolidays}>{t('cpm.holiday.refreshStatutory', { defaultValue: '同步系統法定假日' })}</Button>
              <Button danger icon={<ClearOutlined />} onClick={clearYear}>{t('cpm.holiday.clearYear', { defaultValue: '清空本年' })}</Button>
            </div>
            <p className="hc-side__tip">{t('cpm.holiday.quickTip', { defaultValue: '導入僅合併節假日與補班名單，不動調休/請假；清空前會二次確認。' })}</p>
          </HcCard>
        </aside>
      </div>
    </div>
  )
}

/* ==================== 模块卡片（全局新增/表单页规范） ==================== */

function HcCard({ icon, tone, title, note, children }: {
  icon: ReactNode; tone: 'blue' | 'orange' | 'info'; title: string; note?: string; children: ReactNode
}) {
  return (
    <div className="hc-card">
      <div className="hc-card__head">
        <span className={`hc-card__icon hc-card__icon--${tone}`}>{icon}</span>
        <span className="hc-card__title">{title}</span>
        <div className="hc-card__line" />
        {note && <span className="hc-card__note">{note}</span>}
      </div>
      {children}
    </div>
  )
}