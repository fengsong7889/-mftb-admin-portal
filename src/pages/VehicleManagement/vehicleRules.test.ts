/**
 * 用车管理 — 业务口径单元测试（阶段 A）
 *
 * 为什么阶段 A 就写测试：时段冲突、里程校验、状态跳转、台账统计口径是这个模块的
 * 核心风险点。先把口径固化成可执行断言，阶段 B1 后端实现必须与本表一致，
 * 避免「前端一套理解、后端一套实现」。
 */
import { describe, it, expect } from 'vitest'
import {
  buildCorrectionDiff, canCancel, canTransition, countsInLedger, computeDurationHours,
  deptAllowed, driverQualified, evaluateBackfill, evaluateDepart, findScheduleConflicts,
  hasTimeOverlap, isOverdue, passengerWithinSeatLimit, plannedRangeValid, summarizeLedger,
  vehicleDispatchable, checkMileage, buildVisibleNodes,
} from './vehicleRules'
import {
  APPROVAL_OUTCOME, DRIVING_MODE, QUALIFICATION_RESULT, TRIP_STATUS, USE_SOURCE, USE_STATUS,
  VEHICLE_STATUS,
  type DriverQualification, type VehicleFile, type VehicleUseOrder,
} from './vehicleTypes'

/* ==================== 测试脚手架 ==================== */

function vehicle(over: Partial<VehicleFile> = {}): VehicleFile {
  return {
    id: 1, vehicleCode: 'VH000001', plateNo: 'MT-12-34', registerRegion: '澳門',
    vehicleType: '商務車', ownerCompanyId: 1, ownerCompanyName: '閃蜂有限公司', companyBrand: 1,
    manageDeptId: 10, manageDeptName: '總裁辦', seatCount: 7, currentOdometer: 30000,
    status: VEHICLE_STATUS.NORMAL, allowDirectRegister: false,
    insuranceValidUntil: '2027-12-31', inspectionValidUntil: '2027-06-30',
    verifyBy: '系統管理員', verifyAt: '2026-01-01 09:00:00',
    allowedDepts: [{ deptId: 10, deptName: '總裁辦' }],
    managers: [{ empId: 100, empNo: 'MF00001', empName: '張車管', level: 'manage' }],
    updatedBy: '系統管理員', updatedAt: '2026-10-01 10:00:00',
    ...over,
  }
}

function qual(over: Partial<DriverQualification> = {}): DriverQualification {
  return {
    id: 1, empId: 200, empNo: 'MF00020', empName: '李司機', region: '澳門',
    licenseClass: 'B2', validUntil: '2030-01-01', result: QUALIFICATION_RESULT.VERIFIED,
    verifiedBy: '張車管', verifiedAt: '2026-05-01 09:00:00', ...over,
  }
}

function order(over: Partial<VehicleUseOrder> = {}): VehicleUseOrder {
  return {
    id: 1, useNo: 'YC202610080001', source: USE_SOURCE.OA_APPROVAL,
    approval: APPROVAL_OUTCOME.APPROVED, status: USE_STATUS.TO_DEPART, flowNo: 'LC00001',
    apply: {
      applicantEmpId: 300, applicantName: '王員工', applicantEmpNo: 'MF00030',
      actualUserName: '王員工', departmentId: 10, departmentName: '總裁辦',
      intentVehicleId: 1, intentPlateNo: 'MT-12-34', purpose: '客戶拜訪',
      origin: '公司', destination: '澳門半島',
      plannedStart: '2026-10-09 09:00:00', plannedEnd: '2026-10-09 12:00:00',
      drivingMode: DRIVING_MODE.SELF, passengerCount: 3,
    },
    assign: {
      finalVehicleId: 1, finalPlateNo: 'MT-12-34', driverEmpId: 300,
      driverName: '王員工', driverEmpNo: 'MF00030', assignBy: '張車管',
      assignAt: '2026-10-08 15:00:00',
    },
    createdBy: '王員工', createdAt: '2026-10-08 14:00:00',
    updatedBy: '張車管', updatedAt: '2026-10-08 15:00:00',
    ...over,
  }
}

/* ==================== 1. 时段冲突 ==================== */

describe('hasTimeOverlap', () => {
  it('完全重叠判定为冲突', () => {
    expect(hasTimeOverlap('2026-10-09 09:00', '2026-10-09 12:00', '2026-10-09 10:00', '2026-10-09 11:00')).toBe(true)
  })

  it('部分重叠判定为冲突', () => {
    expect(hasTimeOverlap('2026-10-09 09:00', '2026-10-09 12:00', '2026-10-09 11:00', '2026-10-09 14:00')).toBe(true)
  })

  it('首尾相接不算冲突（允许 10:00 还车后立即派下一单）', () => {
    expect(hasTimeOverlap('2026-10-09 08:00', '2026-10-09 10:00', '2026-10-09 10:00', '2026-10-09 12:00')).toBe(false)
  })

  it('完全分离不算冲突', () => {
    expect(hasTimeOverlap('2026-10-09 08:00', '2026-10-09 10:00', '2026-10-09 14:00', '2026-10-09 16:00')).toBe(false)
  })

  it('时间缺失时不误判为冲突', () => {
    expect(hasTimeOverlap(null, '2026-10-09 12:00', '2026-10-09 10:00', '2026-10-09 14:00')).toBe(false)
  })
})

describe('findScheduleConflicts', () => {
  it('同车同驾驶人命中两类冲突', () => {
    const orders = [order()]
    const hits = findScheduleConflicts(orders, {
      vehicleId: 1, driverEmpId: 300, start: '2026-10-09 10:00', end: '2026-10-09 11:00',
    })
    expect(hits).toHaveLength(2)
    expect(hits.map(h => h.resource).sort()).toEqual(['driver', 'vehicle'])
  })

  it('待安排状态不占用资源（审批通过未安排不算预约）', () => {
    const orders = [order({ status: USE_STATUS.TO_ASSIGN, assign: {} })]
    const hits = findScheduleConflicts(orders, {
      vehicleId: 1, start: '2026-10-09 10:00', end: '2026-10-09 11:00',
    })
    expect(hits).toHaveLength(0)
  })

  it('已完成行程不再占用资源', () => {
    const orders = [order({ status: USE_STATUS.COMPLETED })]
    const hits = findScheduleConflicts(orders, {
      vehicleId: 1, start: '2026-10-09 10:00', end: '2026-10-09 11:00',
    })
    expect(hits).toHaveLength(0)
  })

  it('排除自身单据（改派重排时不被自己挡住）', () => {
    const orders = [order()]
    const hits = findScheduleConflicts(orders, {
      vehicleId: 1, driverEmpId: 300, start: '2026-10-09 10:00', end: '2026-10-09 11:00', excludeUseId: 1,
    })
    expect(hits).toHaveLength(0)
  })

  it('同一驾驶人同时被派两台车也要拦截', () => {
    const orders = [order({ id: 1, assign: { finalVehicleId: 1, finalPlateNo: 'A', driverEmpId: 300, driverName: '王員工' } })]
    const hits = findScheduleConflicts(orders, {
      vehicleId: 2, driverEmpId: 300, start: '2026-10-09 10:00', end: '2026-10-09 11:00',
    })
    expect(hits).toHaveLength(1)
    expect(hits[0].resource).toBe('driver')
  })
})

/* ==================== 2. 车辆与驾驶人可派性 ==================== */

describe('vehicleDispatchable', () => {
  it('正常且证件齐全的车辆可派', () => {
    expect(vehicleDispatchable(vehicle(), '2026-10-08 12:00')).toHaveLength(0)
  })

  it('维修/停用/退出均阻断新出车', () => {
    expect(vehicleDispatchable(vehicle({ status: VEHICLE_STATUS.REPAIRING }), '2026-10-08')).toHaveLength(1)
    expect(vehicleDispatchable(vehicle({ status: VEHICLE_STATUS.SUSPENDED }), '2026-10-08')).toHaveLength(1)
    expect(vehicleDispatchable(vehicle({ status: VEHICLE_STATUS.RETIRED }), '2026-10-08')).toHaveLength(1)
  })

  it('保险或检验缺失/过期都阻断（未核验不等于可用）', () => {
    expect(vehicleDispatchable(vehicle({ insuranceValidUntil: undefined }), '2026-10-08'))
      .toContainEqual(expect.objectContaining({ code: 'INSURANCE_UNVERIFIED' }))
    expect(vehicleDispatchable(vehicle({ inspectionValidUntil: '2025-01-01' }), '2026-10-08'))
      .toContainEqual(expect.objectContaining({ code: 'INSPECTION_EXPIRED' }))
  })
})

describe('driverQualified', () => {
  it('无核验记录不得安排出车', () => {
    expect(driverQualified(undefined, '2026-10-08')).toContainEqual(expect.objectContaining({ code: 'QUAL_MISSING' }))
  })

  it('待核验与失效都阻断', () => {
    expect(driverQualified(qual({ result: QUALIFICATION_RESULT.PENDING }), '2026-10-08'))
      .toContainEqual(expect.objectContaining({ code: 'QUAL_PENDING' }))
    expect(driverQualified(qual({ result: QUALIFICATION_RESULT.EXPIRED }), '2026-10-08'))
      .toContainEqual(expect.objectContaining({ code: 'QUAL_EXPIRED' }))
  })

  it('有效期已过按失效处理', () => {
    expect(driverQualified(qual({ validUntil: '2026-01-01' }), '2026-10-08'))
      .toContainEqual(expect.objectContaining({ code: 'QUAL_VALID_UNTIL_EXPIRED' }))
  })
})

describe('deptAllowed / passengerWithinSeatLimit', () => {
  it('一期只认显式授权部门，不做子部门隐式继承', () => {
    expect(deptAllowed(vehicle(), 10)).toBe(true)
    expect(deptAllowed(vehicle(), 99)).toBe(false)
    expect(deptAllowed(vehicle(), undefined)).toBe(false)
  })

  it('人数含驾驶人，超过核定载客拒绝', () => {
    expect(passengerWithinSeatLimit(7, 7)).toBe(true)
    expect(passengerWithinSeatLimit(8, 7)).toBe(false)
    expect(passengerWithinSeatLimit(0, 7)).toBe(false)
  })
})

/* ==================== 3. 里程与时长 ==================== */

describe('checkMileage', () => {
  it('正常递增里程可计算', () => {
    expect(checkMileage(30000, 30125)).toEqual({ mileage: 125, blockers: [] })
  })

  it('结束里程倒退被拒绝', () => {
    const r = checkMileage(30000, 29900)
    expect(r.mileage).toBeUndefined()
    expect(r.blockers).toContainEqual(expect.objectContaining({ code: 'ODOMETER_ROLLBACK' }))
  })

  it('起始里程低于上次确认值需要说明差异', () => {
    expect(checkMileage(29000, 30000, 30000))
      .toMatchObject({ blockers: [expect.objectContaining({ code: 'ODOMETER_BELOW_LAST' })] })
  })

  it('缺失里程不得静默算作 0', () => {
    expect(checkMileage(undefined, 30000).blockers)
      .toContainEqual(expect.objectContaining({ code: 'ODOMETER_MISSING' }))
  })
})

describe('computeDurationHours / isOverdue', () => {
  it('时长按实际出还与实际归还计算，不用申请时段代替', () => {
    expect(computeDurationHours('2026-10-09 09:00', '2026-10-09 11:30')).toBe(2.5)
  })

  it('归还早于出车不产生负时长', () => {
    expect(computeDurationHours('2026-10-09 11:00', '2026-10-09 09:00')).toBeUndefined()
  })

  it('超期只标记，不倒改批准时段', () => {
    expect(isOverdue('2026-10-09 12:00', '2026-10-09 13:20')).toBe(true)
    expect(isOverdue('2026-10-09 12:00', '2026-10-09 11:00')).toBe(false)
  })

  it('计划时段必须结束晚于开始', () => {
    expect(plannedRangeValid('2026-10-09 09:00', '2026-10-09 12:00')).toBe(true)
    expect(plannedRangeValid('2026-10-09 12:00', '2026-10-09 09:00')).toBe(false)
  })
})

/* ==================== 4. 状态机 ==================== */

describe('canTransition', () => {
  it('允许 审批中→待安排→待出车→使用中→待归还确认→已完成', () => {
    expect(canTransition(USE_STATUS.APPROVING, USE_STATUS.TO_ASSIGN)).toBe(true)
    expect(canTransition(USE_STATUS.TO_ASSIGN, USE_STATUS.TO_DEPART)).toBe(true)
    expect(canTransition(USE_STATUS.TO_DEPART, USE_STATUS.IN_USE)).toBe(true)
    expect(canTransition(USE_STATUS.IN_USE, USE_STATUS.TO_CONFIRM)).toBe(true)
    expect(canTransition(USE_STATUS.TO_CONFIRM, USE_STATUS.COMPLETED)).toBe(true)
  })

  it('禁止跳过安排直接出车，也禁止从已完成回退', () => {
    expect(canTransition(USE_STATUS.APPROVING, USE_STATUS.IN_USE)).toBe(false)
    expect(canTransition(USE_STATUS.COMPLETED, USE_STATUS.IN_USE)).toBe(false)
    expect(canTransition(USE_STATUS.REJECTED, USE_STATUS.TO_ASSIGN)).toBe(false)
  })
})

describe('canCancel', () => {
  it('已出车不可取消，只能据实归还', () => {
    expect(canCancel(order({ status: USE_STATUS.IN_USE })))
      .toContainEqual(expect.objectContaining({ code: 'ALREADY_DEPARTED' }))
  })

  it('待安排阶段可以取消', () => {
    expect(canCancel(order({ status: USE_STATUS.TO_ASSIGN, assign: {} }))).toEqual([])
  })
})

describe('evaluateDepart', () => {
  const base = { vehicles: [vehicle()], quals: [qual({ empId: 300, empName: '王員工', empNo: 'MF00030' })] }

  it('全部条件满足时可出车', () => {
    const blockers = evaluateDepart(order(), base.vehicles[0], base.quals[0], [], '2026-10-09 08:00')
    expect(blockers).toEqual([])
  })

  it('审批未通过不得出车', () => {
    const o = order({ approval: APPROVAL_OUTCOME.APPROVING, status: USE_STATUS.APPROVING })
    expect(evaluateDepart(o, base.vehicles[0], base.quals[0], [], '2026-10-09 08:00'))
      .toContainEqual(expect.objectContaining({ code: 'NOT_APPROVED' }))
  })

  it('未安排车辆不得出车（审批通过不等于已预约）', () => {
    const o = order({ status: USE_STATUS.TO_ASSIGN, assign: {} })
    const blockers = evaluateDepart(o, undefined, base.quals[0], [], '2026-10-09 08:00')
    expect(blockers.some(b => b.code === 'STATUS_NOT_READY' || b.code === 'VEHICLE_MISSING')).toBe(true)
  })

  it('资源被其他单据占用时出车被拒', () => {
    const occupied = order({ id: 2, useNo: 'YC202610080002' })
    const blockers = evaluateDepart(order({ id: 1 }), base.vehicles[0], base.quals[0], [occupied], '2026-10-09 08:00')
    expect(blockers.some(b => b.code === 'CONFLICT')).toBe(true)
  })

  it('车辆维修中即使已安排也不能出车', () => {
    const blockers = evaluateDepart(order(), vehicle({ status: VEHICLE_STATUS.REPAIRING }), base.quals[0], [], '2026-10-09 08:00')
    expect(blockers).toContainEqual(expect.objectContaining({ code: 'VEHICLE_REPAIRING' }))
  })
})

/* ==================== 5. 台账统计口径 ==================== */

describe('台账统计', () => {
  const confirmed = order({
    id: 1, status: USE_STATUS.COMPLETED,
    trip: {
      id: 1, useId: 1, vehicleId: 1, plateNo: 'MT-12-34', driverEmpId: 300, driverName: '王員工',
      driverEmpNo: 'MF00030', status: TRIP_STATUS.CONFIRMED,
      depart: { departAt: '2026-10-09 09:00:00', startOdometer: 30000 },
      tripReturn: { returnAt: '2026-10-09 11:00:00', endOdometer: 30100 },
      mileage: 100, durationHours: 2, flags: [], version: 1,
    },
  })
  const inUse = order({ id: 2, status: USE_STATUS.IN_USE, useNo: 'YC2' })
  const backfillPending = order({
    id: 3, status: USE_STATUS.TO_CONFIRM, useNo: 'YC3', source: USE_SOURCE.BACKFILL,
    trip: {
      id: 3, useId: 3, vehicleId: 1, plateNo: 'MT-12-34', driverEmpId: 300, driverName: '王員工',
      driverEmpNo: 'MF00030', status: TRIP_STATUS.PENDING_CHECK,
      depart: { departAt: '2026-10-05 09:00:00', startOdometer: 29000 },
      tripReturn: { returnAt: '2026-10-05 12:00:00', endOdometer: 29150 },
      mileage: 150, durationHours: 3, flags: [], version: 1,
    },
  })
  const rejected = order({ id: 4, status: USE_STATUS.REJECTED, useNo: 'YC4', approval: APPROVAL_OUTCOME.REJECTED })

  it('只有已确认行程计入正式台账，补录待核对单列', () => {
    const s = summarizeLedger([confirmed, inUse, backfillPending, rejected])
    expect(s.tripCount).toBe(1)
    expect(s.totalMileage).toBe(100)
    expect(s.totalHours).toBe(2)
    expect(s.pendingCheckCount).toBe(1)
  })

  it('驳回与取消的单据不算出车次数', () => {
    expect(countsInLedger(rejected.trip)).toBe(false)
    expect(summarizeLedger([rejected, order({ status: USE_STATUS.CANCELLED, id: 5 })]).tripCount).toBe(0)
  })

  it('跨日行程按实际出车日归属，时长正常累计', () => {
    const cross = order({
      id: 9, status: USE_STATUS.COMPLETED,
      trip: {
        id: 9, useId: 9, vehicleId: 1, plateNo: 'MT-12-34', driverEmpId: 300, driverName: '王員工',
        driverEmpNo: 'MF00030', status: TRIP_STATUS.CONFIRMED,
        depart: { departAt: '2026-10-09 22:00:00', startOdometer: 30000 },
        tripReturn: { returnAt: '2026-10-10 02:00:00', endOdometer: 30200 },
        mileage: 200, durationHours: 4, flags: [], version: 1,
      },
    })
    expect(summarizeLedger([cross]).totalHours).toBe(4)
  })
})

/* ==================== 6. 补录与更正 ==================== */

describe('evaluateBackfill', () => {
  it('与既有行程冲突时进入争议核对，不覆盖旧单', () => {
    const existing = order()
    const r = evaluateBackfill([existing], {
      vehicleId: 1, driverEmpId: 300, start: '2026-10-09 10:00', end: '2026-10-09 11:00',
    })
    expect(r.disputed).toBe(true)
    expect(r.conflictWith).toContain('YC202610080001')
  })

  it('补录历史时间且无冲突时只需常规核对', () => {
    const r = evaluateBackfill([], {
      vehicleId: 1, driverEmpId: 300, start: '2026-09-01 09:00', end: '2026-09-01 12:00',
    })
    expect(r.disputed).toBe(false)
  })
})

describe('buildCorrectionDiff', () => {
  it('只保留真正变化的字段', () => {
    const rows = buildCorrectionDiff([
      ['駕駛人', '王員工', '李司機'],
      ['事由', '客戶拜訪', '客戶拜訪'],
      ['歸還時間', '2026-10-09 12:00', '2026-10-09 13:20'],
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ field: '駕駛人', before: '王員工', after: '李司機' })
  })
})


/* ==================== 8. 审批节点懒加载（浏览器端到端测试发现的缺陷回归） ==================== */

/**
 * 这一组断言来自真实缺陷：草稿单（未提交）详情曾画出「主管審批 / 審批通過」绿点，
 * 并向用户暴露后面的「車輛安排」节点 —— 等于界面谎称一张没提交过的单子已审批通过。
 * 规范 §D.5 要求只显示 流程创建 + 已完成节点 + 当前待审节点，不显示未来节点。
 */
describe('buildVisibleNodes', () => {
  const draft = () => order({
    approval: APPROVAL_OUTCOME.NOT_SUBMITTED, status: USE_STATUS.DRAFT,
    assign: {}, flowNo: undefined,
  })

  it('草稿只展示流程创建，不伪造审批通过', () => {
    const nodes = buildVisibleNodes(draft())
    expect(nodes.map(n => n.state)).toEqual(['done', 'pending'])
    expect(nodes.some(n => n.actor === '審批通過')).toBe(false)
    expect(nodes.some(n => n.label === '車輛安排')).toBe(false)
  })

  it('草稿节点明确标为未提交，说明资源占用尚未开始', () => {
    const last = buildVisibleNodes(draft()).at(-1)!
    expect(last.actor).toBe('未提交')
    expect(last.note).toContain('尚未提交')
  })

  it('审批中只显示当前节点，不显示安排与出车', () => {
    const nodes = buildVisibleNodes(order({ approval: APPROVAL_OUTCOME.APPROVING, status: USE_STATUS.APPROVING, assign: {} }))
    expect(nodes).toHaveLength(2)
    expect(nodes[1].state).toBe('current')
    expect(nodes.some(n => n.label === '出車登記')).toBe(false)
  })

  it('审批通过但未安排：安排为当前节点，并说明审批通过不等于已预约', () => {
    const nodes = buildVisibleNodes(order({ assign: {}, status: USE_STATUS.TO_ASSIGN }))
    const last = nodes.at(-1)!
    expect(last.label).toBe('車輛安排')
    expect(last.state).toBe('current')
    expect(last.note).toContain('不等於已預約')
  })

  it('已驳回只追加驳回节点，不继续暴露后续流程', () => {
    const nodes = buildVisibleNodes(order({ approval: APPROVAL_OUTCOME.REJECTED, status: USE_STATUS.REJECTED, assign: {} }))
    expect(nodes).toHaveLength(2)
    expect(nodes[1].actor).toBe('已駁回')
  })

  it('已出车后节点推进到出车登记为完成，归还为当前', () => {
    const nodes = buildVisibleNodes(order({
      status: USE_STATUS.IN_USE,
      trip: {
        id: 1, useId: 1, vehicleId: 1, plateNo: 'MT-12-34', driverEmpId: 300,
        driverName: '王員工', driverEmpNo: 'MF00030', status: TRIP_STATUS.DEPARTED,
        depart: { departAt: '2026-10-09 09:00:00', startOdometer: 30000, keyReceived: true, conditionOk: true },
        tripReturn: {}, flags: [], version: 1,
      },
    }))
    expect(nodes.filter(n => n.state === 'done').length).toBeGreaterThanOrEqual(3)
    expect(nodes.at(-1)!.state).toBe('current')
    // 未来节点（确认归档）不得出现
    expect(nodes.filter(n => n.state === 'pending')).toHaveLength(0)
  })
})
