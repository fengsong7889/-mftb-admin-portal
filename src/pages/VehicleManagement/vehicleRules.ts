/**
 * 用车管理 — 业务口径纯函数（阶段 A）
 *
 * 为什么单独成文件：时段冲突、里程校验、状态跳转、台账统计口径是这个模块最容易
 * 写错也最容易在四个页面各写一遍的地方。先在前端固化为可测试的纯函数，
 * 阶段 B1 后端按同一份口径实现并作为安全边界（前端校验只负责 UX，不是安全边界）。
 *
 * 时间口径：一期业务显示按 UTC+8，这里统一接收 'YYYY-MM-DD HH:mm:ss' 或 dayjs 对象。
 */
import dayjs, { type Dayjs } from 'dayjs'
import {
  APPROVAL_OUTCOME, DRIVING_MODE, QUALIFICATION_RESULT, TRIP_FLAG, TRIP_STATUS, USE_SOURCE, USE_STATUS,
  VEHICLE_STATUS,
  type VehicleFile, type VehicleTrip, type VehicleUseOrder,
} from './vehicleTypes'

/**
 * 时间输入：兼容接口返回的时间串、表单的 Dayjs、以及业务当前时间 Date。
 * dayjs 对三者都能直接构造，归一化后统一比较，避免各页面自己转格式。
 */
export type TimeInput = string | Dayjs | Date | null | undefined

/** 归一化时间输入；空值返回 null，由调用方决定如何提示 */
export function toDay(value: TimeInput): Dayjs | null {
  if (value === null || value === undefined || value === '') return null
  const d = dayjs.isDayjs(value) ? value : dayjs(value)
  return d.isValid() ? d : null
}

/* ==================== 1. 时段冲突检测 ==================== */

/**
 * 两个时段是否重叠。
 * 口径：左闭右开语义下的「首尾相接不算冲突」——A 的结束时间等于 B 的开始时间时不冲突，
 * 允许 10:00 还车后 10:00 立即派下一单。一期不额外设置缓冲时间。
 */
export function hasTimeOverlap(
  aStart: TimeInput, aEnd: TimeInput, bStart: TimeInput, bEnd: TimeInput,
): boolean {
  const as = toDay(aStart); const ae = toDay(aEnd)
  const bs = toDay(bStart); const be = toDay(bEnd)
  if (!as || !ae || !bs || !be) return false
  // dayjs 核心 API 是 isSame（无 isEqualTo），按精确时间戳比较边界相接
  if (ae.isSame(bs) || be.isSame(as)) return false
  return as.isBefore(be) && ae.isAfter(bs)
}

/** 会占用车辆或驾驶人的状态：待出车（已形或有效预约）、使用中、待归还确认 */
const OCCUPYING_STATUSES: string[] = [
  USE_STATUS.TO_DEPART, USE_STATUS.IN_USE, USE_STATUS.TO_CONFIRM,
]

/** 判断用车单是否处于「已安排且未归还」的占用窗口 */
export function isOccupying(order: VehicleUseOrder): boolean {
  return OCCUPYING_STATUSES.includes(order.status) && order.assign.finalVehicleId != null
}

/** 占用窗口时间：已出车用实际出车时间起算，未出车用计划时段 */
function occupyWindow(order: VehicleUseOrder): { start: Dayjs | null; end: Dayjs | null } {
  const depart = order.trip?.depart.departAt
  const plannedEnd = order.apply.plannedEnd
  return { start: toDay(depart ?? order.apply.plannedStart), end: toDay(plannedEnd) }
}

export interface ConflictHit {
  useNo: string
  /** 冲突资源类型 */
  resource: 'vehicle' | 'driver'
  /** 冲突对象标识（车牌或驾驶人） */
  target: string
  conflictUseNo: string
  conflictWindow: string
  /** 由谁占用 */
  occupiedBy: string
}

/**
 * 检测拟安排的车辆与驾驶人在目标时段内是否已被占用。
 * 阶段 A 在内存演示数据上模拟；阶段 B1 必须由后端在同一资源锁边界内做当前读校验，
 * 不能只靠「先查一下」或普通唯一索引（并发下会双双通过）。
 */
export function findScheduleConflicts(
  orders: VehicleUseOrder[],
  target: { vehicleId?: number; driverEmpId?: number; start: TimeInput; end: TimeInput; excludeUseId?: number },
): ConflictHit[] {
  const start = toDay(target.start)
  const end = toDay(target.end)
  if (!start || !end || start.isAfter(end)) return []

  const hits: ConflictHit[] = []
  for (const order of orders) {
    if (order.id === target.excludeUseId) continue
    if (!isOccupying(order)) continue
    const win = occupyWindow(order)
    if (!win.start || !win.end) continue

    const vehicleClash = target.vehicleId != null && order.assign.finalVehicleId === target.vehicleId
    const driverClash = target.driverEmpId != null && order.assign.driverEmpId === target.driverEmpId
    if (!vehicleClash && !driverClash) continue
    if (!hasTimeOverlap(win.start, win.end, start, end)) continue

    if (vehicleClash) {
      hits.push({
        useNo: order.useNo, resource: 'vehicle', target: order.assign.finalPlateNo ?? '—',
        conflictUseNo: order.useNo,
        conflictWindow: `${win.start.format('YYYY-MM-DD HH:mm')} ~ ${win.end.format('YYYY-MM-DD HH:mm')}`,
        occupiedBy: order.assign.driverName ?? order.apply.applicantName,
      })
    }
    if (driverClash) {
      hits.push({
        useNo: order.useNo, resource: 'driver', target: order.assign.driverName ?? '—',
        conflictUseNo: order.useNo,
        conflictWindow: `${win.start.format('YYYY-MM-DD HH:mm')} ~ ${win.end.format('YYYY-MM-DD HH:mm')}`,
        occupiedBy: order.apply.applicantName,
      })
    }
  }
  return hits
}

/** 冲突提示项类型（供页面直接使用，避免各处手抄结构） */
export type ScheduleConflict = ReturnType<typeof findScheduleConflicts>[number]

/** 从可用车辆中排除时段已被占用的，供安排/登记表单的车辆下拉使用 */
export function filterAvailableVehicles(
  vehicles: VehicleFile[],
  orders: VehicleUseOrder[],
  target: { start: TimeInput; end: TimeInput; excludeUseId?: number },
): VehicleFile[] {
  return vehicles.filter(v => {
    if (vehicleDispatchable(v).length > 0) return false
    const conflicts = findScheduleConflicts(orders, {
      vehicleId: v.id, start: target.start, end: target.end, excludeUseId: target.excludeUseId,
    })
    return conflicts.length === 0
  })
}

/* ==================== 2. 车辆与驾驶人可派性 ==================== */

export interface Blocker { code: string; message: string }

/**
 * 车辆能否派出：运行状态 + 保险/检验有效性。
 * 口径：资料未核验或已失效时禁止新出车，但绝不阻止已经发生的行程归还。
 */
export function vehicleDispatchable(vehicle: VehicleFile, at: TimeInput = dayjs()): Blocker[] {
  const blockers: Blocker[] = []
  const now = toDay(at)

  if (vehicle.status === VEHICLE_STATUS.REPAIRING) {
    blockers.push({ code: 'VEHICLE_REPAIRING', message: `車輛 ${vehicle.plateNo} 正在維修，不可派出` })
  } else if (vehicle.status === VEHICLE_STATUS.SUSPENDED) {
    blockers.push({ code: 'VEHICLE_SUSPENDED', message: `車輛 ${vehicle.plateNo} 已停用，不可派出` })
  } else if (vehicle.status === VEHICLE_STATUS.RETIRED) {
    blockers.push({ code: 'VEHICLE_RETIRED', message: `車輛 ${vehicle.plateNo} 已退出使用，不可派出` })
  }

  const insurance = toDay(vehicle.insuranceValidUntil)
  if (!insurance) {
    blockers.push({ code: 'INSURANCE_UNVERIFIED', message: `車輛 ${vehicle.plateNo} 保險有效期未錄入，需先完成核驗` })
  } else if (now && insurance.isBefore(now, 'day')) {
    blockers.push({ code: 'INSURANCE_EXPIRED', message: `車輛 ${vehicle.plateNo} 保險已過期（${vehicle.insuranceValidUntil}）` })
  }

  const inspection = toDay(vehicle.inspectionValidUntil)
  if (!inspection) {
    blockers.push({ code: 'INSPECTION_UNVERIFIED', message: `車輛 ${vehicle.plateNo} 檢驗有效期未錄入，需先完成核驗` })
  } else if (now && inspection.isBefore(now, 'day')) {
    blockers.push({ code: 'INSPECTION_EXPIRED', message: `車輛 ${vehicle.plateNo} 年檢已過期（${vehicle.inspectionValidUntil}）` })
  }

  return blockers
}

/**
 * 驾驶资格判定所需的最小字段。
 *
 * <p>故意不收整个 DriverQualification：同一个校验要同时给本地视图模型（result 是字面量联合）
 * 与后端 VO（result 是 string）用。写死其中一个就会让另一个不可赋值，而拷贝一份校验
 * 又会造成两套口径——收窄到真正被读的三个字段，两边都能用。
 */
export interface QualificationLike {
  empName: string
  result: string
  validUntil: string
}

/** 驾驶资格能否用于驾驶该车（阶段 B1 需要车辆登记准驾要求，一期先校验有效期与核验状态） */
export function driverQualified(qual: QualificationLike | undefined, at: TimeInput = dayjs()): Blocker[] {
  const blockers: Blocker[] = []
  if (!qual) {
    blockers.push({ code: 'QUAL_MISSING', message: '該駕駛人無駕駛資格核驗記錄，不可安排出車' })
    return blockers
  }
  if (qual.result === QUALIFICATION_RESULT.EXPIRED) {
    blockers.push({ code: 'QUAL_EXPIRED', message: `${qual.empName} 的駕駛資格已失效` })
    return blockers
  }
  if (qual.result === QUALIFICATION_RESULT.PENDING) {
    blockers.push({ code: 'QUAL_PENDING', message: `${qual.empName} 的駕駛資格尚未核驗，不可安排出車` })
    return blockers
  }
  const until = toDay(qual.validUntil)
  const now = toDay(at)
  if (until && now && until.isBefore(now, 'day')) {
    blockers.push({ code: 'QUAL_VALID_UNTIL_EXPIRED', message: `${qual.empName} 的駕駛資格已過有效期（${qual.validUntil}）` })
  }
  return blockers
}

/** 部门是否在车辆可使用范围内：一期按显式授权判定，不隐式继承子部门 */
export function deptAllowed(vehicle: VehicleFile, departmentId?: number): boolean {
  if (departmentId == null) return false
  return vehicle.allowedDepts.some(d => d.deptId === departmentId)
}

/** 人数校验：核定载客含驾驶人 */
export function passengerWithinSeatLimit(passengerCount: number, seatCount: number): boolean {
  return passengerCount > 0 && passengerCount <= seatCount
}

/* ==================== 3. 里程与时长 ==================== */

export interface MileageResult { mileage?: number; blockers: Blocker[] }

/**
 * 里程校验与计算。
 * 口径：结束里程不得小于起始里程；差异需说明；倒退必须有权限的核对更正。
 * 行驶里程由后端计算，前端只做 UX 校验，不写入台账。
 */
export function checkMileage(
  startOdometer?: number, endOdometer?: number, lastConfirmedOdometer?: number,
): MileageResult {
  const blockers: Blocker[] = []
  if (startOdometer == null || endOdometer == null) {
    return { blockers: [{ code: 'ODOMETER_MISSING', message: '起止里程均需填寫' }] }
  }
  if (startOdometer < 0 || endOdometer < 0) {
    blockers.push({ code: 'ODOMETER_NEGATIVE', message: '里程不可為負數' })
  }
  if (endOdometer < startOdometer) {
    blockers.push({
      code: 'ODOMETER_ROLLBACK',
      message: `結束里程（${endOdometer}）小於起始里程（${startOdometer}），需走授權更正`,
    })
  }
  if (lastConfirmedOdometer != null && startOdometer < lastConfirmedOdometer) {
    blockers.push({
      code: 'ODOMETER_BELOW_LAST',
      message: `起始里程低於上次確認值（${lastConfirmedOdometer}），請說明差異`,
    })
  }
  const mileage = blockers.length === 0 ? endOdometer - startOdometer : undefined
  return { mileage, blockers }
}

/** 用车时长：实际还车 - 实际出车，不用申请时段代替 */
export function computeDurationHours(departAt: TimeInput, returnAt: TimeInput): number | undefined {
  const d = toDay(departAt); const r = toDay(returnAt)
  if (!d || !r || r.isBefore(d)) return undefined
  return Math.round(r.diff(d, 'minute') / 60 * 100) / 100
}

/** 是否超出批准时段归还（超出只标记异常，不倒改原审批时间） */
export function isOverdue(plannedEnd: TimeInput, returnAt: TimeInput): boolean {
  const p = toDay(plannedEnd); const r = toDay(returnAt)
  if (!p || !r) return false
  return r.isAfter(p)
}

/** 计划时段合法性：结束必须晚于开始 */
export function plannedRangeValid(start: TimeInput, end: TimeInput): boolean {
  const s = toDay(start); const e = toDay(end)
  return !!s && !!e && e.isAfter(s)
}

/* ==================== 4. 状态机 ==================== */

/** 用车单主状态显式跳转表，禁止任意跳转 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  [USE_STATUS.DRAFT]: [USE_STATUS.APPROVING, USE_STATUS.TO_ASSIGN, USE_STATUS.CANCELLED],
  [USE_STATUS.APPROVING]: [USE_STATUS.TO_ASSIGN, USE_STATUS.REJECTED, USE_STATUS.CANCELLED],
  [USE_STATUS.TO_ASSIGN]: [USE_STATUS.TO_DEPART, USE_STATUS.CANCELLED],
  [USE_STATUS.TO_DEPART]: [USE_STATUS.IN_USE, USE_STATUS.TO_ASSIGN, USE_STATUS.CANCELLED],
  [USE_STATUS.IN_USE]: [USE_STATUS.TO_CONFIRM],
  [USE_STATUS.TO_CONFIRM]: [USE_STATUS.COMPLETED, USE_STATUS.TO_CONFIRM],
  [USE_STATUS.COMPLETED]: [],
  [USE_STATUS.REJECTED]: [],
  [USE_STATUS.CANCELLED]: [],
}

export function canTransition(from: string, to: string): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to)
}

/**
 * 已出车不可取消、不可重新派车，只能据实归还。
 * 已过期但未出车的预约不能直接补点出车，需重新办理。
 */
/**
 * 已出车及之后的状态：这些阶段不允许取消，只能据实归还。
 * 显式标为 string[]，避免 TS 把字面量数组收窄成联合类型后 includes 报错。
 */
const NON_CANCELLABLE_STATUSES: string[] = [
  USE_STATUS.IN_USE, USE_STATUS.TO_CONFIRM, USE_STATUS.COMPLETED,
]

export function canCancel(order: VehicleUseOrder): Blocker[] {
  if (NON_CANCELLABLE_STATUSES.includes(order.status)) {
    return [{ code: 'ALREADY_DEPARTED', message: '已出車或已完成的用車單不可取消，請據實歸還登記' }]
  }
  if (order.approval === APPROVAL_OUTCOME.APPROVED && order.status === USE_STATUS.TO_DEPART) {
    return [{ code: 'ASSIGNED_NEED_MANAGER', message: '已安排車輛的用車單取消需由車管辦理並保留原因' }]
  }
  return []
}

/** 出车前置校验：状态 + 车辆 + 驾驶人 + 冲突，一次返回所有阻断项 */
export function evaluateDepart(
  order: VehicleUseOrder, vehicle: VehicleFile | undefined, qual: QualificationLike | undefined,
  allOrders: VehicleUseOrder[], at: TimeInput = dayjs(),
): Blocker[] {
  const blockers: Blocker[] = []
  if (order.status !== USE_STATUS.TO_DEPART) {
    blockers.push({ code: 'STATUS_NOT_READY', message: `當前狀態「${order.status}」不可出車，需先完成車輛安排` })
  }
  // 审批通过但未安排不算预约；直接登记必须来源正确
  if (order.source === USE_SOURCE.OA_APPROVAL && order.approval !== APPROVAL_OUTCOME.APPROVED) {
    blockers.push({ code: 'NOT_APPROVED', message: '審批用車需審批全部通過後才能出車' })
  }
  if (!vehicle) {
    blockers.push({ code: 'VEHICLE_MISSING', message: '未找到安排的最終車輛' })
  } else {
    blockers.push(...vehicleDispatchable(vehicle, at))
  }
  blockers.push(...driverQualified(qual, at))

  const departTime = toDay(order.apply.plannedStart) ?? toDay(at)
  const clash = findScheduleConflicts(allOrders, {
    vehicleId: order.assign.finalVehicleId,
    driverEmpId: order.assign.driverEmpId,
    start: departTime,
    end: toDay(order.apply.plannedEnd) ?? departTime,
    excludeUseId: order.id,
  })
  for (const c of clash) {
    blockers.push({
      code: 'CONFLICT',
      message: `${c.resource === 'vehicle' ? '車輛' : '駕駛人'} ${c.target} 在 ${c.conflictWindow} 已被 ${c.conflictUseNo} 占用`,
    })
  }
  return blockers
}

/* ==================== 5. 台账统计口径 ==================== */

/** 只有「已确认」的实际行程计入正式台账与统计；补录待核对、争议单列 */
export function countsInLedger(trip: VehicleTrip | undefined): boolean {
  return trip?.status === TRIP_STATUS.CONFIRMED
}

/** 实际发生过的行程才算出车次数；预约、驳回、取消不能计入 */
export function isActualTrip(order: VehicleUseOrder): boolean {
  const s = order.trip?.status
  return s === TRIP_STATUS.DEPARTED || s === TRIP_STATUS.RETURNED
    || s === TRIP_STATUS.CONFIRMED || s === TRIP_STATUS.PENDING_CHECK
}

/** 待核对记录（不计入正式汇总） */
export function isPendingCheck(order: VehicleUseOrder): boolean {
  return order.trip?.status === TRIP_STATUS.PENDING_CHECK || order.trip?.status === TRIP_STATUS.DISPUTED
}

export interface LedgerSummary {
  tripCount: number
  vehicleCount: number
  totalMileage: number
  totalHours: number
  pendingCheckCount: number
  overdueCount: number
}

/**
 * 台账汇总：按实际出车日期归属期间，跨日不拆分。
 * 不计算缺乏分母的「利用率」，不在缺少费用数据时展示「百公里成本」。
 */
export function summarizeLedger(orders: VehicleUseOrder[]): LedgerSummary {
  const confirmed = orders.filter(o => countsInLedger(o.trip))
  const mileage = confirmed.reduce((sum, o) => sum + (o.trip?.mileage ?? 0), 0)
  const hours = confirmed.reduce((sum, o) => sum + (o.trip?.durationHours ?? 0), 0)
  return {
    tripCount: confirmed.length,
    vehicleCount: new Set(confirmed.map(o => o.trip?.vehicleId)).size,
    totalMileage: Math.round(mileage * 100) / 100,
    totalHours: Math.round(hours * 100) / 100,
    pendingCheckCount: orders.filter(isPendingCheck).length,
    overdueCount: confirmed.filter(o => o.trip?.flags.includes(TRIP_FLAG.OVERDUE)).length,
  }
}

/* ==================== 6. 补录与更正 ==================== */

/**
 * 补录结论：已结束行程的补录不占用当前车辆，但先进入待核对。
 * 与既有行程冲突时进入争议核对，不覆盖旧单。
 */
export function evaluateBackfill(
  allOrders: VehicleUseOrder[],
  target: { vehicleId: number; driverEmpId: number; start: TimeInput; end: TimeInput },
): { conflictWith: string[]; disputed: boolean } {
  const clashes = findScheduleConflicts(allOrders, target)
  const conflictWith = Array.from(new Set(clashes.map(c => c.conflictUseNo)))
  return { conflictWith, disputed: conflictWith.length > 0 }
}

/** 更正前后值对照行，供更正表单展示「修改前 → 修改后」 */
export interface CorrectionDiffRow { field: string; before: string; after: string }

export function buildCorrectionDiff(pairs: Array<[string, string, string]>): CorrectionDiffRow[] {
  return pairs
    .filter(([, before, after]) => (before ?? '') !== (after ?? ''))
    .map(([field, before, after]) => ({ field, before, after }))
}

/* ==================== 7. 审批节点可见性（懒加载口径 §D.5） ==================== */

export interface VisibleNode {
  label: string
  actor: string
  at?: string
  state: 'done' | 'current' | 'pending'
  note?: string
}

/**
 * 只输出「流程创建 + 已完成节点 + 当前待审节点」，不提前暴露未来节点。
 * 直接登记与补录不生成审批节点，避免界面把它们画成「审批通过」。
 * 放在规则层而不是详情页组件里，是为了让详情页只导出组件（保证 HMR fast refresh），
 * 也让阶段 B1 能直接复用同一份节点推导。
 */
export function buildVisibleNodes(order: VehicleUseOrder): VisibleNode[] {
  const nodes: VisibleNode[] = []

  if (order.source === USE_SOURCE.DIRECT_REGISTER) {
    nodes.push({
      label: '授權直接登記', actor: order.assign.assignBy ?? '—', at: order.assign.assignAt,
      state: 'done', note: order.assign.directRegisterReason,
    })
    nodes.push({
      label: '出車登記', actor: order.trip?.depart.registerBy ?? '待登記', at: order.trip?.depart.registerAt,
      state: order.trip ? 'done' : 'current',
    })
    nodes.push({
      label: '歸還確認', actor: order.trip?.tripReturn.confirmBy ?? '待確認', at: order.trip?.tripReturn.confirmAt,
      state: order.trip?.tripReturn.confirmAt ? 'done' : 'pending',
    })
    return nodes
  }

  if (order.source === USE_SOURCE.BACKFILL) {
    nodes.push({
      label: '事後補錄', actor: order.createdBy, at: order.trip?.backfillEntryAt ?? order.createdAt,
      state: 'done', note: '無事前系統審批，實際發生時間與系統登記時間分開保存',
    })
    nodes.push({
      label: '補錄核對', actor: order.trip?.tripReturn.confirmBy ?? '待核對', at: order.trip?.tripReturn.confirmAt,
      state: order.trip?.tripReturn.confirmAt ? 'done' : 'current',
    })
    return nodes
  }

  nodes.push({ label: '流程創建', actor: order.apply.applicantName, at: order.createdAt, state: 'done' })

  if (order.approval === APPROVAL_OUTCOME.APPROVING) {
    nodes.push({ label: order.currentNodeName ?? '主管審批', actor: '待審批', state: 'current' })
    return nodes
  }
  if (order.approval === APPROVAL_OUTCOME.REJECTED) {
    nodes.push({
      label: order.currentNodeName ?? '主管審批', actor: '已駁回', state: 'current',
      note: '可修改後重新提交，生成新單與新審批實例',
    })
    return nodes
  }
  if (order.approval === APPROVAL_OUTCOME.CANCELLED) {
    nodes.push({ label: '主管審批', actor: order.updatedBy, state: 'current', note: '申請已撤銷，審批歷史保留不改寫' })
    return nodes
  }
  // 草稿（未提交）必须单独分支：少了它就会落到下面“審批通過”兜底行，
  // 向用户谎称一张没提交过的单子已经审批通过，并同时暴露后面的“車輛安排”节点
  if (order.approval === APPROVAL_OUTCOME.NOT_SUBMITTED) {
    nodes.push({
      label: '主管審批', actor: '未提交', state: 'pending',
      note: '草稿尚未提交審批，审批与资源占用均未开始',
    })
    return nodes
  }

  nodes.push({ label: '主管審批', actor: '審批通過', at: order.updatedAt, state: 'done' })

  if (!order.assign.finalVehicleId) {
    nodes.push({
      label: '車輛安排', actor: '待車管安排', state: 'current',
      note: '審批通過不等於已預約，安排成功才占用車輛時段',
    })
    return nodes
  }
  nodes.push({
    label: '車輛安排', actor: order.assign.assignBy ?? '—', at: order.assign.assignAt,
    state: order.status === USE_STATUS.TO_ASSIGN ? 'current' : 'done',
    note: `${order.assign.finalPlateNo ?? ''} · ${order.assign.driverName ?? ''}`,
  })

  if (order.status === USE_STATUS.TO_ASSIGN || order.status === USE_STATUS.TO_DEPART) {
    // 规范 §D.5 只允许「流程创建 + 已完成 + 当前节点」，待安排连出车都还没到，
    // 更早地显示「歸還確認」属于未来节点，会让用户误以为流程已经排到后面
    if (order.status === USE_STATUS.TO_DEPART) {
      nodes.push({ label: '出車登記', actor: '待出車', state: 'current' })
    }
    return nodes
  }
  nodes.push({ label: '出車登記', actor: order.trip?.depart.registerBy ?? '—', at: order.trip?.depart.registerAt, state: 'done' })
  nodes.push({
    label: '歸還確認', actor: order.trip?.tripReturn.confirmBy ?? '待確認', at: order.trip?.tripReturn.confirmAt,
    state: order.trip?.tripReturn.confirmAt ? 'done' : 'current',
  })
  return nodes
}

/* ==================== 8. 展示辅助 ==================== */

/** 时段展示：YYYY-MM-DD HH:mm ~ HH:mm（同日省略第二次日期） */
export function formatWindow(start: TimeInput, end: TimeInput): string {
  const s = toDay(start); const e = toDay(end)
  if (!s && !e) return '—'
  if (s && !e) return `${s.format('YYYY-MM-DD HH:mm')} ~ —`
  if (!s && e) return `— ~ ${e!.format('YYYY-MM-DD HH:mm')}`
  const sameDay = s!.isSame(e!, 'day')
  return `${s!.format('YYYY-MM-DD HH:mm')} ~ ${sameDay ? e!.format('HH:mm') : e!.format('YYYY-MM-DD HH:mm')}`
}

/** 自驾场景下驾驶人即申请人，安排表单需要据此决定是否选司机 */
export function resolveDriverId(drivingMode: string, applicantEmpId: number, selectedDriverId?: number): number | undefined {
  return drivingMode === DRIVING_MODE.SELF ? applicantEmpId : selectedDriverId
}
