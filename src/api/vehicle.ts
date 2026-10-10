/**
 * 用车管理 API（阶段 B1：对接真实后端）
 *
 * 后端接口: /api/vehicle/*
 *
 * 时间字段约定（与后端 VehicleUseDto 注释一致，混用会静默变成 Invalid date）：
 *   - 出参时间已是 'YYYY-MM-DD HH:mm:ss' 字符串，直接展示，不要再 new Date() 解析；
 *   - 入参时间必须传 ISO 带 T 分隔（toIso() 统一产出），后端口是 LocalDateTime。
 *
 * 不使用 mock 降级：用车台账是"谁在什么时候用了哪辆车"的问责记录，
 * 后端不可用时必须明确报错，绝不能回退到本地假数据或给出「已提交」的假成功。
 */
import dayjs from 'dayjs'
import request from './request'

/* ==================== 视图模型（对齐后端 VO，扁平结构） ==================== */

export interface VehicleVO {
  id: number
  vehicleCode: string
  plateNo: string
  registerRegion: string
  vehicleType: string
  vin?: string | null
  seatCount: number
  currentOdometer: number
  status: string
  allowDirectRegister: boolean
  insuranceValidUntil?: string | null
  inspectionValidUntil?: string | null
  dispatchBlockers?: string[]
  verifyBy?: string | null
  verifyAt?: string | null
  ownerCompanyId?: number | null
  ownerCompanyName?: string | null
  companyBrand?: number | null
  manageDeptId: number
  manageDeptName: string
  eamAssetId?: number | null
  eamAssetNo?: string | null
  remark?: string | null
  allowedDepts?: DeptGrant[]
  managers?: ManagerGrant[]
  occupiedCount?: number
  /** 出车建议起始里程：后端按 max(档案, 最近已确认行程) 给出，与出车校验同口径 */
  suggestStartOdometer?: number | null
  updatedBy: string
  updatedAt: string
  version: number
}

export interface DeptGrant { deptId: number; deptName: string }
export interface ManagerGrant { userId: number; empNo: string; empName: string; level: 'manage' | 'view' }

export interface VehicleOption {
  vehicleId: number
  vehicleCode: string
  plateNo: string
  vehicleType: string
  seatCount: number
  currentOdometer: number
  status: string
  registerRegion: string
  allowDirectRegister: boolean
  /** 不可派原因；非空表示"可见但不可选"，界面要说明而不是隐藏 */
  blockers: string[]
}

export interface QualificationVO {
  id: number
  userId: number
  empNo: string
  empName: string
  region: string
  licenseClass: string
  validUntil: string
  result: string
  verifiedBy?: string | null
  verifiedAt?: string | null
  remark?: string | null
}

export interface TripVO {
  id: number
  vehiclePlateNo: string
  status: string
  departAt?: string | null
  startOdometer?: number | null
  keyReceived?: boolean | null
  conditionOk?: boolean | null
  departByName?: string | null
  departRegisteredAt?: string | null
  returnAt?: string | null
  endOdometer?: number | null
  returnPlace?: string | null
  keyReturned?: boolean | null
  vehicleCondition?: string | null
  exceptionNote?: string | null
  confirmByName?: string | null
  confirmAt?: string | null
  mileage?: number | null
  durationHours?: number | null
  flags?: string[]
  backfillEntryAt?: string | null
  version: number
}

export interface UseVO {
  id: number
  useNo: string
  source: string
  approvalOutcome: string
  status: string
  flowNo?: string | null
  applicantId: number
  applicantEmpNo: string
  applicantName: string
  actualUserName: string
  departmentId: number
  departmentName: string
  intentVehicleId?: number | null
  intentPlateNo?: string | null
  finalVehicleId?: number | null
  finalPlateNo?: string | null
  driverId?: number | null
  driverEmpNo?: string | null
  driverName?: string | null
  drivingMode: string
  passengerCount: number
  purpose: string
  origin: string
  destination: string
  plannedStart: string
  plannedEnd: string
  assignByName?: string | null
  assignAt?: string | null
  directReason?: string | null
  conflictNote?: string | null
  prevUseId?: number | null
  version: number
  updatedBy: string
  updatedAt: string
  createdAt: string
  trip?: TripVO | null
  /** 服务端算好的可执行动作；前端不自行按 status 推断按钮 */
  allowedActions?: string[]
  vehicleBlockers?: string[]
}

export interface EventVO {
  id: number
  action: string
  operatorName: string
  operatorEmpNo: string
  occurredAt: string
  reason?: string | null
  beforeJson?: string | null
  afterJson?: string | null
}

export interface Page<T> { records: T[]; total: number }

/** 待办统计：卡片字段 + 分组徽标（key 与 UseQuery.group 一致） */
export interface TodoStats {
  toAssign: number
  toDepart: number
  inUse: number
  toConfirm: number
  overdue: number
  groupCounts?: Record<string, number>
}

export interface LedgerStats {
  tripCount: number
  vehicleCount: number
  driverCount: number
  totalMileage: number
  totalHours: number
  overdueCount: number
  pendingCount: number
}

export interface SummaryRow { keyId: number; name: string; tripCount: number; totalMileage: number }

/* ==================== 查询入参 ==================== */

export interface VehicleQuery {
  page: number
  size: number
  keyword?: string
  vehicleType?: string
  status?: string
  manageDeptId?: number
  ownerCompanyId?: number
  companyBrand?: number
  usableByDeptId?: number
}

export interface UseQuery {
  page: number
  size: number
  scope?: string
  keyword?: string
  status?: string
  source?: string
  tripStatus?: string
  vehicleId?: number
  plateNo?: string
  driverName?: string
  departmentId?: number
  /** ISO 字符串，见文件头约定 */
  fromDate?: string
  toDate?: string
  group?: string
}

/* ==================== 写操作入参 ==================== */

export interface VehicleSave {
  id?: number
  plateNo: string
  registerRegion: string
  vehicleType: string
  vin?: string
  seatCount: number
  currentOdometer: number
  status: string
  allowDirectRegister: boolean
  insuranceValidUntil?: string | null
  inspectionValidUntil?: string | null
  ownerCompanyId?: number | null
  companyBrand?: number
  manageDeptId: number
  eamAssetNo?: string | null
  remark?: string | null
  allowedDeptIds?: number[]
  managers?: ManagerGrant[]
  requestKey?: string
  expectVersion?: number
}

export interface DraftPayload {
  intentVehicleId?: number
  actualUserName: string
  purpose: string
  origin: string
  destination: string
  plannedStart: string
  plannedEnd: string
  drivingMode: string
  passengerCount: number
  requestKey?: string
}

export interface DirectRegisterPayload {
  vehicleId: number
  actualUserName: string
  departmentId: number
  driverId: number
  purpose: string
  origin: string
  destination: string
  plannedStart: string
  plannedEnd: string
  passengerCount: number
  directReason: string
  startOdometer?: number
  requestKey?: string
}

export interface AssignPayload {
  useId: number
  vehicleId: number
  driverId: number
  conflictNote?: string
  reason?: string
  requestKey?: string
}

export interface DepartPayload {
  useId: number
  departAt: string
  startOdometer: number
  keyReceived: boolean
  conditionOk: boolean
  requestKey?: string
}

export interface ReturnPayload {
  useId: number
  returnAt: string
  endOdometer: number
  returnPlace: string
  keyReturned: boolean
  vehicleCondition: 'normal' | 'abnormal'
  exceptionNote?: string
  requestKey?: string
}

export interface ConfirmPayload { useId: number; reason?: string; requestKey?: string }

export interface CorrectPayload {
  useId: number
  driverId?: number
  departAt?: string
  returnAt?: string
  startOdometer?: number
  endOdometer?: number
  reason: string
  requestKey?: string
}

export interface BackfillPayload {
  vehicleId: number
  actualUserName: string
  departmentId: number
  driverId: number
  purpose: string
  origin: string
  destination: string
  departAt: string
  startOdometer?: number
  returnAt: string
  endOdometer?: number
  returnPlace?: string
  passengerCount: number
  reason: string
  requestKey?: string
}

export interface QualificationSave {
  userId: number
  region: string
  licenseClass: string
  validUntil: string
  remark?: string
  requestKey?: string
}

/* ==================== 工具 ==================== */

/**
 * 生成后端 LocalDateTime 可解析的 ISO 串（必须带 T，且不包含毫秒与时区）。
 * dayjs 的 format 用字面量模板，避免 toISOString 带来 Z 与毫秒。
 */
export function toIso(value: string | Date | dayjs.Dayjs | null | undefined): string | undefined {
  if (!value) return undefined
  const d = dayjs.isDayjs(value) ? value : dayjs(value as string | Date)
  return d.isValid() ? d.format('YYYY-MM-DDTHH:mm:ss') : undefined
}

/** 生成"只到日期"的 ISO（LocalDate 端口） */
export function toIsoDate(value: string | Date | dayjs.Dayjs | null | undefined): string | undefined {
  if (!value) return undefined
  const d = dayjs.isDayjs(value) ? value : dayjs(value as string | Date)
  return d.isValid() ? d.format('YYYY-MM-DD') : undefined
}

/** 幂等键：一次表单提交生成一个，重试同一提交不会长出第二条事实 */
export function newRequestKey(prefix = 'vk'): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}-${rand}`
}

/* ==================== 车辆档案 ==================== */

export function fetchVehicles(query: VehicleQuery): Promise<Page<VehicleVO>> {
  return request.get<unknown, Page<VehicleVO>>('/vehicle/vehicles', { params: query })
}

export function fetchVehicleDetail(id: number): Promise<VehicleVO> {
  return request.get<unknown, VehicleVO>(`/vehicle/vehicles/${id}`)
}

export function createVehicle(payload: VehicleSave): Promise<number> {
  return request.post<unknown, number>('/vehicle/vehicles', payload)
}

export function updateVehicle(id: number, payload: VehicleSave): Promise<number> {
  return request.put<unknown, number>(`/vehicle/vehicles/${id}`, payload)
}

export function changeVehicleStatus(id: number, payload: { status: string; expectVersion: number; reason: string; requestKey?: string }) {
  return request.put(`/vehicle/vehicles/${id}/status`, payload)
}

export function changeDirectRegister(id: number, payload: { enabled: boolean; reason: string; expectVersion: number; requestKey?: string }) {
  return request.put(`/vehicle/vehicles/${id}/direct-register`, payload)
}

export function fetchAvailableVehicles(params: {
  departmentId?: number
  start: string
  end: string
  excludeUseId?: number
  directOnly?: boolean
}): Promise<VehicleOption[]> {
  return request.get<unknown, VehicleOption[]>('/vehicle/vehicles/available', { params })
}

export function fetchQualifications(): Promise<QualificationVO[]> {
  return request.get<unknown, QualificationVO[]>('/vehicle/vehicles/qualifications')
}

export function saveQualification(payload: QualificationSave): Promise<number> {
  return request.post<unknown, number>('/vehicle/vehicles/qualifications', payload)
}

export function fetchEligibleDrivers(): Promise<QualificationVO[]> {
  return request.get<unknown, QualificationVO[]>('/vehicle/vehicles/eligible-drivers')
}

/* ==================== 用车单 ==================== */

export function fetchUses(query: UseQuery): Promise<Page<UseVO>> {
  return request.get<unknown, Page<UseVO>>('/vehicle/uses', { params: query })
}

export function fetchMyUses(query: UseQuery): Promise<Page<UseVO>> {
  return request.get<unknown, Page<UseVO>>('/vehicle/my-uses', { params: query })
}

export function fetchMyDrivingTasks(query: UseQuery): Promise<Page<UseVO>> {
  return request.get<unknown, Page<UseVO>>('/vehicle/my-driving-tasks', { params: query })
}

/**
 * 待办统计。
 *
 * 必须传与列表同一组筛选条件（不含 page/size/group）：卡片与徽标展示的是「当前筛选下的待办数」，
 * 不传就会拿全局数字冒充筛选结果。
 */
export function fetchTodoStats(query?: Omit<UseQuery, 'page' | 'size' | 'group'>): Promise<TodoStats> {
  return request.get<unknown, TodoStats>('/vehicle/uses/todo-stats', { params: query })
}

export function fetchUseDetail(id: number): Promise<UseVO> {
  return request.get<unknown, UseVO>(`/vehicle/uses/${id}`)
}

export function fetchUseEvents(id: number): Promise<EventVO[]> {
  return request.get<unknown, EventVO[]>(`/vehicle/uses/${id}/events`)
}

export function createDraft(payload: DraftPayload): Promise<number> {
  return request.post<unknown, number>('/vehicle/uses/draft', payload)
}

export function directRegister(payload: DirectRegisterPayload): Promise<number> {
  return request.post<unknown, number>('/vehicle/uses/direct-register', payload)
}

export function assignVehicle(payload: AssignPayload) {
  return request.post('/vehicle/uses/assign', payload)
}

export function departTrip(payload: DepartPayload) {
  return request.post('/vehicle/uses/depart', payload)
}

export function returnTrip(payload: ReturnPayload) {
  return request.post('/vehicle/uses/return', payload)
}

export function confirmTrip(payload: ConfirmPayload) {
  return request.post('/vehicle/uses/confirm', payload)
}

export function backfillTrip(payload: BackfillPayload): Promise<number> {
  return request.post<unknown, number>('/vehicle/uses/backfill', payload)
}

export function correctTrip(payload: CorrectPayload) {
  return request.post('/vehicle/uses/correct', payload)
}

/* ==================== 台账 ==================== */

export function fetchLedger(query: UseQuery): Promise<Page<UseVO>> {
  return request.get<unknown, Page<UseVO>>('/vehicle/ledger', { params: query })
}

export function fetchLedgerStats(query: UseQuery): Promise<LedgerStats> {
  return request.get<unknown, LedgerStats>('/vehicle/ledger/stats', { params: query })
}

export function fetchLedgerByDepartment(): Promise<SummaryRow[]> {
  return request.get<unknown, SummaryRow[]>('/vehicle/ledger/by-department')
}

export function fetchLedgerByVehicle(): Promise<SummaryRow[]> {
  return request.get<unknown, SummaryRow[]>('/vehicle/ledger/by-vehicle')
}
