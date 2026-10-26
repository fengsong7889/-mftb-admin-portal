/**
 * 排班管理 —— 周矩阵视图
 *
 * 为什么用矩阵而不是普通列表：排班的操作单位是「员工 × 日期 × 班次」，
 * 普通分页列表无法横向对齐一周工时，也无法一眼看出漏排。
 *
 * 三种格子状态必须视觉可分（这是排班页最容易做错的地方）：
 * ① 有班次 → 显示班次编码；
 * ② 显式排休（shiftId 为空但记录存在）→ 显示「休」，不产生异常；
 * ③ 没有记录 → 显示「未排班」并用警示色，因为它会产生「未排班」异常。
 * 把 ②③ 混成同一个"-"，HR 就永远看不出谁漏排了。
 *
 * 保存口径：只提交改动过的格子（按 (userId, workDate) upsert），未提及的格子不动——
 * 整周全量覆盖会让两个同时编辑同一周的人互相抹掉对方没看到的格子。
 *
 * 规范例外（已按 §M 登记）：本视图列集合随所选周期漂移（每周 7 个日期列），
 * 不适用 useColumnConfig 的持久化列顺序，故本页不注册列配置面板。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Form, Modal, Select, Space, Table, Tag, Tooltip, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, CopyOutlined, ExportOutlined, LeftOutlined, ReloadOutlined,
  RightOutlined, SaveOutlined, TeamOutlined, WarningOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import StatCards from '@/components/StatCards'
import { useAuth } from '@/contexts/AuthContext'
import {
  copyScheduleWeek, fetchHolidaysByYear, fetchScheduleStats, fetchScheduleWeek,
  fetchShiftOptions, saveSchedules, type HolidayVO, type ScheduleRow,
} from '@/api/attendance'
import { useAttendanceOptions } from './useAttendanceOptions'
import { exportToCSV } from '@/utils/exportCSV'
import '@/styles/components.css'
import OrgScopeNotice from '@/components/OrgScopeNotice'

/** 「显式排休」在编辑控件里的哨兵值：不能与 shiftId（数字）冲突，故用字符串 */
const REST_VALUE = '__rest__'

interface ScheduleEdits {
  [cellKey: string]: number | null
}

export default function AttendanceSchedule() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('attendance-schedule:edit')
  const canExport = hasPermission('attendance-schedule:export')
  const { groups, groupOptions } = useAttendanceOptions()

  const [groupId, setGroupId] = useState<number | undefined>()
  const [weekOffset, setWeekOffset] = useState(0)
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [stats, setStats] = useState<Record<string, number>>({})
  const [unscheduledCount, setUnscheduledCount] = useState(0)
  const [shiftOptions, setShiftOptions] = useState<Array<{ id: number; code: string; name: string; flex: boolean }>>([])
  const [holidays, setHolidays] = useState<HolidayVO[]>([])
  const [edits, setEdits] = useState<ScheduleEdits>({})
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  // 防确认弹窗重入：确认框弹出期间 saving 仍为 false（要等 onOk 里才置位），
  // 若不拦截，连点「保存排班/複製上一週」会叠加多个 Modal.confirm 并发多次写请求。
  const confirmBusyRef = useRef(false)

  /**
   * 本周一：所有日期计算都以它为基准，避免用"今天"导致跨周错位。
   * <p>不用 dayjs 的 startOf('isoWeek')：那个能力靠 isoWeek 插件，本仓没有全局装载，
   * 直接调会在运行时抛错（而不是编译期），因此按 day() 手算。
   */
  const weekStart = useMemo(() => {
    const base = dayjs().add(weekOffset, 'week').startOf('day')
    // day(): 0=周日 … 6=周六；换算成"距本周一几天"
    return base.subtract((base.day() + 6) % 7, 'day')
  }, [weekOffset])
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day').format('YYYY-MM-DD')),
    [weekStart],
  )

  // 考勤组是后端必填参数：选项到位后默认选第一个，避免进来是空白页
  useEffect(() => {
    if (groupId === undefined && groups.length > 0) setGroupId(groups[0].id)
  }, [groups, groupId])

  useEffect(() => {
    fetchShiftOptions().then(setShiftOptions).catch(() => setShiftOptions([]))
  }, [])

  useEffect(() => {
    fetchHolidaysByYear(weekStart.year()).then(setHolidays).catch(() => setHolidays([]))
  }, [weekStart])

  const load = useCallback(async () => {
    if (!groupId) return
    setLoading(true)
    const start = weekStart.format('YYYY-MM-DD')
    try {
      const [week, counts] = await Promise.all([
        fetchScheduleWeek(groupId, start),
        fetchScheduleStats(groupId, start),
      ])
      setRows(week.rows ?? [])
      setUnscheduledCount(week.unscheduledCount ?? 0)
      setStats(counts ?? {})
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
      setRows([])
      setStats({})
      setUnscheduledCount(0)
    } finally {
      setLoading(false)
    }
  }, [groupId, weekStart])

  useEffect(() => { load() }, [load])

  /** 切周或切组时丢弃未保存的编辑：留着会让用户以为改动跟着走了 */
  const resetEdits = () => { setEdits({}); setEditing(false) }

  const changeWeek = (delta: number) => {
    setWeekOffset(prev => prev + delta)
    resetEdits()
  }

  const changeGroup = (value?: number) => {
    setGroupId(value)
    resetEdits()
  }

  const holidayOf = (date: string) => holidays.find(h => h.holidayDate === date)

  const cellKey = (userId: number, date: string) => `${userId}|${date}`

  const setCell = (userId: number, date: string, value: number | typeof REST_VALUE) => {
    setEdits(prev => ({ ...prev, [cellKey(userId, date)]: value === REST_VALUE ? null : value }))
  }

  const currentCell = (row: ScheduleRow, date: string) => row.cells?.[date] ?? null

  const editValue = (row: ScheduleRow, date: string) => {
    const key = cellKey(row.userId, date)
    if (key in edits) return edits[key] === null ? REST_VALUE : (edits[key] as number)
    const cell = currentCell(row, date)
    if (!cell) return undefined
    return cell.rest || cell.shiftId == null ? REST_VALUE : cell.shiftId
  }

  const dirtyCount = Object.keys(edits).length

  const handleSave = () => {
    if (!groupId || dirtyCount === 0) {
      message.info(t('attendance.scheduleNothingToSave'))
      return
    }
    if (confirmBusyRef.current) return
    confirmBusyRef.current = true
    Modal.confirm({
      title: t('attendance.scheduleSaveConfirmTitle', { count: dirtyCount }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      afterClose: () => { confirmBusyRef.current = false },
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span>{t('attendance.recalcRangeLabel')}</span><b>{days[0]} ~ {days[6]}</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('attendance.recalcEffectLabel')}</span><b>{t('attendance.scheduleSaveEffect')}</b>
          </div>
        </div>
      ),
      onOk: async () => {
        setSaving(true)
        try {
          const entries = Object.entries(edits).map(([key, shiftId]) => {
            const [userId, workDate] = key.split('|')
            return { userId: Number(userId), workDate, shiftId }
          })
          const result = await saveSchedules({ groupId, weekStart: days[0], entries })
          message.success(t('attendance.scheduleSaveResult', {
            saved: result.saved ?? entries.length,
            rest: result.rest ?? 0,
          }))
          resetEdits()
          await load()
        } catch {
          // 请求层已统一提示（班次已停用、成员不属于该组等）
        } finally {
          setSaving(false)
        }
      },
    })
  }

  /** 复制上一周：服务端批量写入，属不可逆覆盖，必须二次确认并说明范围 */
  const handleCopyLastWeek = () => {
    if (!groupId) return
    if (confirmBusyRef.current) return
    confirmBusyRef.current = true
    const sourceWeekStart = weekStart.subtract(1, 'week').format('YYYY-MM-DD')
    Modal.confirm({
      title: t('attendance.scheduleCopyConfirmTitle'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('attendance.scheduleCopyConfirmOk'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      afterClose: () => { confirmBusyRef.current = false },
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span>{t('attendance.scheduleCopySourceLabel')}</span><b>{sourceWeekStart}</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('attendance.scheduleCopyTargetLabel')}</span><b>{days[0]} ~ {days[6]}</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('attendance.recalcEffectLabel')}</span><b>{t('attendance.scheduleCopyEffect')}</b>
          </div>
        </div>
      ),
      onOk: async () => {
        setSaving(true)
        try {
          const result = await copyScheduleWeek(groupId, sourceWeekStart, days[0])
          message.success(t('attendance.scheduleCopyResult', { copied: result.saved ?? 0 }))
          resetEdits()
          await load()
        } catch {
          // 请求层已统一提示
        } finally {
          setSaving(false)
        }
      },
    })
  }

  const handleExport = () => {
    if (rows.length === 0) {
      message.warning(t('common.noDataToExport'))
      return
    }
    exportToCSV(
      `${t('attendance.scheduleTitle')}_${days[0]}`,
      [
        { title: t('attendance.colEmpNo'), dataIndex: 'empNo', render: v => v ?? '-' },
        { title: t('attendance.colEmpName'), dataIndex: 'empName', render: v => v ?? '-' },
        { title: t('attendance.colDept'), dataIndex: 'deptName', render: v => v ?? '-' },
        ...days.map(date => ({
          title: `${date.slice(5)} ${t(`attendance.weekday${dayjs(date).day()}`)}`,
          dataIndex: 'cells',
          render: (_: unknown, row: ScheduleRow) => cellText(row, date),
        })),
      ],
      rows,
    )
    message.success(t('common.exportSuccess'))
  }

  /**
   * 格子状态：班次 / 排休 / 未排班。
   * <p>不靠比对翻译后的文本判类型（那样换语言就失效），而是直接看数据：
   * 编辑态优先取本地改动，否则取后端单元格；`cells[date]` 不存在 = 漏排，
   * 存在但 shiftId 为空 = 显式排休。两者必须可区分，否则 HR 看不出谁漏排了。
   */
  const cellState = (row: ScheduleRow, date: string): { kind: 'shift' | 'rest' | 'unscheduled'; text: string } => {
    const key = cellKey(row.userId, date)
    if (key in edits) {
      const value = edits[key]
      if (value === null) return { kind: 'rest', text: t('attendance.scheduleRest') }
      const shift = shiftOptions.find(s => s.id === value)
      return { kind: 'shift', text: shift ? (shift.code ?? String(value)) : String(value) }
    }
    const cell = currentCell(row, date)
    if (!cell) return { kind: 'unscheduled', text: t('attendance.scheduleUnscheduled') }
    if (cell.rest || cell.shiftId == null) return { kind: 'rest', text: t('attendance.scheduleRest') }
    return { kind: 'shift', text: cell.shiftCode ?? cell.shiftName ?? String(cell.shiftId) }
  }

  /** 导出用的纯文本文案 */
  const cellText = (row: ScheduleRow, date: string) => cellState(row, date).text

  const columns: TableColumnsType<ScheduleRow> = [
    { title: t('attendance.colEmpNo'), dataIndex: 'empNo', key: 'empNo', width: 110, fixed: 'left' },
    { title: t('attendance.colEmpName'), dataIndex: 'empName', key: 'empName', width: 100, fixed: 'left' },
    { title: t('attendance.colDept'), dataIndex: 'deptName', key: 'deptName', width: 140, ellipsis: true, render: (v?: string) => v || '-' },
    ...days.map(date => {
      const holiday = holidayOf(date)
      return {
        title: (
          <div style={{ textAlign: 'center' }}>
            <div>{date.slice(5)}</div>
            <div style={{ fontSize: 11, color: '#8C8C8C', fontWeight: 400 }}>
              {t(`attendance.weekday${dayjs(date).day()}`)}
            </div>
            {holiday && (
              <div style={{ fontSize: 11, color: holiday.holidayType === 2 ? '#fa8c16' : '#cf1322' }}>
                {holiday.holidayName}
              </div>
            )}
          </div>
        ),
        key: date,
        width: 130,
        align: 'center' as const,
        render: (_: unknown, row: ScheduleRow) => {
          if (!editing) {
            const state = cellState(row, date)
            // 漏排用警示色：它会产生「未排班」异常，而排休不会
            return state.kind === 'unscheduled'
              ? <Tag color="warning">{state.text}</Tag>
              : <span>{state.text}</span>
          }
          return (
            <Select
              size="small"
              allowClear
              style={{ width: '100%' }}
              placeholder={t('attendance.scheduleUnscheduled')}
              value={editValue(row, date)}
              onChange={value => setCell(row.userId, date, value === undefined ? REST_VALUE : value as number)}
              optionFilterProp="label"
              options={[
                { value: REST_VALUE, label: t('attendance.scheduleRest') },
                ...shiftOptions.map(s => ({ value: s.id, label: `${s.code} ${s.name}` })),
              ]}
            />
          )
        },
      }
    }),
  ]

  const statsKey = `${groupId ?? 'none'}-${days[0]}`

  if (groups.length === 0) {
    return (
      <div className="content-area" style={{ padding: '20px 24px' }}>
        <Alert
          type="info"
          showIcon
          message={t('attendance.scheduleNoGroup')}
          description={t('attendance.scheduleNoGroupHint')}
        />
      </div>
    )
  }

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {loadFailed && (
        <Alert
          type="error"
          showIcon
          message={t('common.loadFailed')}
          style={{ marginBottom: 16 }}
          action={<Button size="small" onClick={load}>{t('common.reset')}</Button>}
        />
      )}
      <OrgScopeNotice />
      <Alert type="info" showIcon message={t('attendance.schedulePageHint')} style={{ marginBottom: 16 }} />

      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('attendance.colGroup')} required>
            <Select
              showSearch
              optionFilterProp="label"
              style={{ width: 220 }}
              value={groupId}
              onChange={changeGroup}
              options={groupOptions}
            />
          </Form.Item>
          <Form.Item label={t('attendance.scheduleWeek')}>
            <Space>
              <Button icon={<LeftOutlined />} onClick={() => changeWeek(-1)} />
              <span style={{ minWidth: 190, textAlign: 'center' }}>{days[0]} ~ {days[6]}</span>
              <Button icon={<RightOutlined />} onClick={() => changeWeek(1)} />
              <Button onClick={() => { setWeekOffset(0); resetEdits() }}>{t('attendance.scheduleThisWeek')}</Button>
            </Space>
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button icon={<ReloadOutlined />} onClick={load}>{t('common.search')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 统计卡片：搜索区之后、操作区之前（规范 §E.8） */}
      <div style={{ marginBottom: 16 }}>
        <StatCards
          animationKey={statsKey}
          items={[
            { key: 'staff', icon: <TeamOutlined />, color: 'info', value: stats.staff ?? rows.length, label: t('attendance.statScheduleStaff') },
            { key: 'scheduled', icon: <CheckCircleOutlined />, color: 'success', value: stats.scheduled ?? 0, label: t('attendance.statScheduleScheduled') },
            { key: 'rest', icon: <ReloadOutlined />, color: 'system', value: stats.rest ?? 0, label: t('attendance.statScheduleRest') },
            { key: 'unscheduled', icon: <WarningOutlined />, color: 'brand', value: unscheduledCount, label: t('attendance.statScheduleUnscheduled') },
          ]}
        />
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Space>
            {canExport && (
              <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
                {t('common.export')}
              </Button>
            )}
            {canEdit && (
              <>
                <Button
                  type={editing ? 'default' : 'primary'}
                  icon={<SaveOutlined />}
                  onClick={() => { if (editing && dirtyCount > 0) { resetEdits() } else { setEditing(true) } }}
                >
                  {editing ? t('attendance.scheduleExitEdit') : t('attendance.scheduleEnterEdit')}
                </Button>
                <Tooltip title={editing ? undefined : t('attendance.scheduleCopyNeedEditHint')}>
                  <Button icon={<CopyOutlined />} disabled={!editing} loading={saving} onClick={handleCopyLastWeek}>
                    {t('attendance.scheduleCopyLastWeek')}
                  </Button>
                </Tooltip>
              </>
            )}
          </Space>
        </div>
        <div className="action-section-right">
          {editing && (
            <Space>
              <span style={{ fontSize: 12, color: dirtyCount > 0 ? '#E8720C' : '#8C8C8C' }}>
                {t('attendance.scheduleDirtyCount', { count: dirtyCount })}
              </span>
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
                {t('attendance.scheduleSave')}
              </Button>
            </Space>
          )}
        </div>
      </div>

      <Table<ScheduleRow>
        rowKey="userId"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1240 }}
        size="middle"
        pagination={false}
        locale={{ emptyText: t('attendance.scheduleNoMembers') }}
      />

      {/* 未保存离开提示：矩阵编辑一屏改动多，静默丢弃会让人重排一遍 */}
      {editing && dirtyCount > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message={t('attendance.scheduleUnsavedHint', { count: dirtyCount })}
        />
      )}
    </div>
  )
}
