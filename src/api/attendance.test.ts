/**
 * 考勤假勤请求层测试。
 *
 * 重点守三条：
 * 1. **绝不 mock 降级**：考勤组/班次/节假日/排班是判定与薪酬取数的真值来源，
 *    后端不可用时必须让页面报错，而不是拿假班次让用户排班（落库就是脏数据）。
 *    这条与 rdm.ts 的"后端不可用时读接口降级"刻意相反，因此单独钉住。
 * 2. 路径与查询参数逐字对齐后端 Controller：路径写错不会报错，只会 404 后被
 *    请求层提示成"接口或资源不存在"，排查成本极高。
 * 3. 写接口的载荷形状（补卡时间字符串、批量 ids、设置的扁平 map）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from './request'
import {
  changeShiftStatus, confirmExceptions, createShift, deleteGroup, fetchExceptions, fetchGroupStats,
  fetchHolidayDetail, fetchHolidaysByYear, fetchPendingExceptionCount, fetchShiftStats, fetchShifts,
  freezeMonthly, recalculateDaily, reissuePunch, saveAttendanceSettings, saveSchedules,
  syncGroupMembers, syncPunches,
} from './attendance'

vi.mock('./request', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

beforeEach(() => { vi.clearAllMocks() })

describe('考勤请求层：路径与参数', () => {
  it('班次列表把筛选条件原样作为 query 下发（服务端分页与过滤）', async () => {
    vi.mocked(request.get).mockResolvedValue({ records: [], total: 0 })

    await fetchShifts({ page: 2, size: 50, keyword: 'SH0', flexFlag: 1, status: 'enabled' })

    expect(request.get).toHaveBeenCalledWith('/attendance/shifts', {
      params: { page: 2, size: 50, keyword: 'SH0', flexFlag: 1, status: 'enabled' },
    })
  })

  it('统计接口与列表同路径前缀且带同一套筛选（统计卡必须跟随条件）', async () => {
    vi.mocked(request.get).mockResolvedValue({})

    await fetchShiftStats({ keyword: 'SH0', flexFlag: 1, status: 'enabled' })
    expect(request.get).toHaveBeenCalledWith('/attendance/shifts/stats', {
      params: { keyword: 'SH0', flexFlag: 1, status: 'enabled' },
    })

    await fetchGroupStats({ groupType: 2 })
    expect(request.get).toHaveBeenCalledWith('/attendance/groups/stats', { params: { groupType: 2 } })
  })

  it('异常列表与待处理计数走各自端点，计数按工作台菜单鉴权', async () => {
    vi.mocked(request.get).mockResolvedValue({ records: [], total: 0 })

    await fetchExceptions({ page: 1, size: 20, from: '2026-10-01', to: '2026-10-12', exceptionType: 3, status: 1 })
    expect(request.get).toHaveBeenCalledWith('/attendance/exceptions', {
      params: { page: 1, size: 20, from: '2026-10-01', to: '2026-10-12', exceptionType: 3, status: 1 },
    })

    vi.mocked(request.get).mockResolvedValue(7)
    await expect(fetchPendingExceptionCount('2026-10-01', '2026-10-12')).resolves.toBe(7)
    expect(request.get).toHaveBeenLastCalledWith('/attendance/exceptions/pending-count', {
      params: { from: '2026-10-01', to: '2026-10-12' },
    })
  })

  it('节假日按年度整批读取（排班页判断应出勤），详情走 /{id}', async () => {
    vi.mocked(request.get).mockResolvedValue([])

    await fetchHolidaysByYear(2026)
    expect(request.get).toHaveBeenCalledWith('/attendance/holidays/year/2026')

    await fetchHolidayDetail(3)
    expect(request.get).toHaveBeenCalledWith('/attendance/holidays/3')
  })

  it('重算与同步类接口用 POST + query 参数，不带请求体', async () => {
    vi.mocked(request.post).mockResolvedValue({})

    await recalculateDaily('2026-10-01', '2026-10-07', 7)
    // 宽区间重算是同步批量计算，单独放宽超时（缺陷 M1），断言需带上 timeout
    expect(request.post).toHaveBeenCalledWith('/attendance/summaries/daily/recalculate', null, {
      params: { from: '2026-10-01', to: '2026-10-07', groupId: 7 },
      timeout: 180000,
    })

    await syncPunches('2026-10-11', '2026-10-12')
    expect(request.post).toHaveBeenCalledWith('/attendance/punches/sync', null, {
      params: { from: '2026-10-11', to: '2026-10-12', groupId: undefined },
    })
  })
})

describe('考勤请求层：写接口载荷形状', () => {
  it('补卡提交 HH:mm:ss 字符串而不是时间戳（后端 DateTimeFormats.parse 只认字符串）', async () => {
    vi.mocked(request.post).mockResolvedValue({})

    await reissuePunch(11, { onTime: '2026-10-08 09:00:00', offTime: '2026-10-08 18:30:00', reason: '忘記打卡' })

    expect(request.post).toHaveBeenCalledWith('/attendance/exceptions/11/reissue', {
      onTime: '2026-10-08 09:00:00',
      offTime: '2026-10-08 18:30:00',
      reason: '忘記打卡',
    })
  })

  it('批量确认与冻结只提交 ids（冻结语义是定稿，不允许带数值改数）', async () => {
    vi.mocked(request.post).mockResolvedValue({})

    await confirmExceptions([1, 2], '外勤拜訪')
    expect(request.post).toHaveBeenCalledWith('/attendance/exceptions/confirm', { ids: [1, 2], remark: '外勤拜訪' })

    await freezeMonthly([9])
    expect(request.post).toHaveBeenCalledWith('/attendance/summaries/monthly/freeze', { ids: [9] })
  })

  it('排班按条目提交，未提及的格子不动（整周全量覆盖会让并发编辑互相抹掉）', async () => {
    vi.mocked(request.post).mockResolvedValue({})

    await saveSchedules({
      groupId: 7,
      weekStart: '2026-10-12',
      entries: [{ userId: 101, workDate: '2026-10-12', shiftId: 9 }, { userId: 102, workDate: '2026-10-12', shiftId: null }],
    })

    expect(request.post).toHaveBeenCalledWith('/attendance/schedules', {
      groupId: 7,
      weekStart: '2026-10-12',
      entries: [{ userId: 101, workDate: '2026-10-12', shiftId: 9 }, { userId: 102, workDate: '2026-10-12', shiftId: null }],
    })
  })

  it('成员差量同步提交 userId 数组；启停用 query 传状态', async () => {
    vi.mocked(request.put).mockResolvedValue({})

    await syncGroupMembers(7, [101, 202])
    expect(request.put).toHaveBeenCalledWith('/attendance/groups/7/members', [101, 202])

    await changeShiftStatus(2, 'disabled')
    expect(request.put).toHaveBeenCalledWith('/attendance/shifts/2/status', null, { params: { status: 'disabled' } })
  })

  it('新建班次提交 HH:mm，编辑态编码由服务端以库中值为准', async () => {
    vi.mocked(request.post).mockResolvedValue({})

    await createShift({ shiftCode: 'SH07', shiftName: '門店晚班', onTime: '13:00', offTime: '22:00', flexFlag: 0 })

    expect(request.post).toHaveBeenCalledWith('/attendance/shifts', {
      shiftCode: 'SH07', shiftName: '門店晚班', onTime: '13:00', offTime: '22:00', flexFlag: 0,
    })
  })

  it('假勤设置提交扁平 map（后端按 key 白名单校验，混入只读项整批拒绝）', async () => {
    vi.mocked(request.put).mockResolvedValue({})

    await saveAttendanceSettings({ otThreshold: '45', otStep: '30' })

    expect(request.put).toHaveBeenCalledWith('/attendance/settings', { otThreshold: '45', otStep: '30' })
  })

  it('删除走 DELETE /{id}，被引用时由后端拒绝而不是前端预判', async () => {
    vi.mocked(request.delete).mockResolvedValue(undefined)

    await deleteGroup(7)

    expect(request.delete).toHaveBeenCalledWith('/attendance/groups/7')
  })
})

describe('考勤请求层：不做 mock 降级', () => {
  it('后端不可用时读接口原样抛错，不返回假班次/假考勤组', async () => {
    vi.mocked(request.get).mockRejectedValue(new Error('Network Error'))

    await expect(fetchShifts({ page: 1, size: 20 })).rejects.toThrow('Network Error')
    await expect(fetchShiftStats({})).rejects.toThrow('Network Error')
    await expect(fetchPendingExceptionCount()).rejects.toThrow('Network Error')
  })

  it('后端不可用时写接口同样抛错：假成功比报错更难发现', async () => {
    vi.mocked(request.post).mockRejectedValue(new Error('Network Error'))
    vi.mocked(request.put).mockRejectedValue(new Error('Network Error'))
    vi.mocked(request.delete).mockRejectedValue(new Error('Network Error'))

    await expect(reissuePunch(1, { onTime: '2026-10-08 09:00:00', reason: 'x' })).rejects.toThrow('Network Error')
    await expect(confirmExceptions([1])).rejects.toThrow('Network Error')
    await expect(freezeMonthly([1])).rejects.toThrow('Network Error')
    await expect(saveAttendanceSettings({ otThreshold: '30' })).rejects.toThrow('Network Error')
    await expect(deleteGroup(1)).rejects.toThrow('Network Error')
  })
})
