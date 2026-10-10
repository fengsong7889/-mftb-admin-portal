/**
 * 用车管理 — 领域常量与类型定义（阶段 A：前端原型）
 *
 * 说明：本文件固化用车台账的业务口径（状态、来源、异常标识），供四个页面与
 * 业务规则纯函数共用，避免同一状态在列表/详情/台账里各写一套文案。
 * 阶段 B1 接后端时，这些字符串常量将与后端整型枚举一一映射（见 vehicleMeta.ts）。
 *
 * 原型阶段约束：本模块所有数据均来自 vehicleDemoData.ts 的内存演示数据，
 * 不调用真实后端接口，不写入数据库。
 */

/* ==================== 数据来源 ==================== */

/** 用车单数据来源：审批用车 / 授权直接登记 / 事后补录 */
export const USE_SOURCE = {
  /** 走 OA 审批流程的常规用车 */
  OA_APPROVAL: 'oa_approval',
  /** 授权车管直接登记（有独立权限与登记原因，不冒充审批通过） */
  DIRECT_REGISTER: 'direct_register',
  /** 事后补录（无事前系统审批，与实际发生时间分离） */
  BACKFILL: 'backfill',
} as const

export type UseSource = (typeof USE_SOURCE)[keyof typeof USE_SOURCE]

/* ==================== 审批结果（与业务状态分开） ==================== */

/**
 * 审批结论维度。
 * 关键约束：授权直接登记与补录都不能伪装成 approved，否则台账无法区分管控强度。
 */
export const APPROVAL_OUTCOME = {
  NOT_SUBMITTED: 'not_submitted',
  APPROVING: 'approving',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  /** 授权直接登记 */
  DIRECT: 'direct',
  /** 补录场景，事前审批不适用 */
  NOT_APPLICABLE: 'not_applicable',
} as const

export type ApprovalOutcome = (typeof APPROVAL_OUTCOME)[keyof typeof APPROVAL_OUTCOME]

/* ==================== 用车单业务状态 ==================== */

/**
 * 用车单主状态机。显式定义，禁止任意跳转（跳转规则见 vehicleRules.ts）。
 * 超时/补录/更正/里程异常属于附加标识，不塞进主状态。
 */
export const USE_STATUS = {
  DRAFT: 'draft',
  /** OA 审批中 */
  APPROVING: 'approving',
  /** 审批通过或无需审批，等待车管安排车辆与驾驶人 */
  TO_ASSIGN: 'to_assign',
  /** 已安排（形成有效预约），尚未出车 */
  TO_DEPART: 'to_depart',
  /** 已出车，实际占用车辆与驾驶人 */
  IN_USE: 'in_use',
  /** 已登记归还，等待车管确认 */
  TO_CONFIRM: 'to_confirm',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const

export type UseStatus = (typeof USE_STATUS)[keyof typeof USE_STATUS]

/* ==================== 车辆运行状态 ==================== */

/** 预约中/使用中由时段与行程推导，不在此枚举内，避免与真实占用状态冲突 */
export const VEHICLE_STATUS = {
  NORMAL: 'normal',
  REPAIRING: 'repairing',
  SUSPENDED: 'suspended',
  RETIRED: 'retired',
} as const

export type VehicleStatus = (typeof VEHICLE_STATUS)[keyof typeof VEHICLE_STATUS]

/* ==================== 行程状态 ==================== */

export const TRIP_STATUS = {
  /** 已出车进行中 */
  DEPARTED: 'departed',
  /** 已还车待车管确认 */
  RETURNED: 'returned',
  /** 已确认，计入正式台账 */
  CONFIRMED: 'confirmed',
  /** 补录待核对，不计入正式汇总 */
  PENDING_CHECK: 'pending_check',
  /** 与既有记录冲突，争议核对中 */
  DISPUTED: 'disputed',
} as const

export type TripStatus = (typeof TRIP_STATUS)[keyof typeof TRIP_STATUS]

/* ==================== 驾驶方式 ==================== */

export const DRIVING_MODE = {
  /** 员工本人自驾 */
  SELF: 'self',
  /** 公司内部专职司机驾驶 */
  COMPANY_DRIVER: 'company_driver',
} as const

export type DrivingMode = (typeof DRIVING_MODE)[keyof typeof DRIVING_MODE]

/* ==================== 行程异常标识 ==================== */

/** 可叠加的附加标识，与主状态分离；台账筛选与统计依赖它们 */
export const TRIP_FLAG = {
  /** 超出批准时段归还 */
  OVERDUE: 'overdue',
  /** 事后补录 */
  BACKFILL: 'backfill',
  /** 已被授权更正 */
  CORRECTED: 'corrected',
  /** 里程倒退或差异未说明 */
  MILEAGE_ANOMALY: 'mileage_anomaly',
  /** 钥匙未交还 */
  KEY_PENDING: 'key_pending',
  /** 车况异常 */
  CONDITION_ABNORMAL: 'condition_abnormal',
  /** 受前车晚归还影响，本预约需改派 */
  AFFECTED_BY_LATE_RETURN: 'affected_by_late_return',
} as const

export type TripFlag = (typeof TRIP_FLAG)[keyof typeof TRIP_FLAG]

/* ==================== 驾驶资格核验结果 ==================== */

export const QUALIFICATION_RESULT = {
  VERIFIED: 'verified',
  PENDING: 'pending',
  EXPIRED: 'expired',
} as const

export type QualificationResult = (typeof QUALIFICATION_RESULT)[keyof typeof QUALIFICATION_RESULT]

/* ==================== 类型定义 ==================== */

/** 车辆可使用部门关系（显式授权，一期不隐式继承子部门） */
export interface VehicleDeptGrant {
  deptId: number
  deptName: string
}

/** 车辆授权管理人员 */
export interface VehicleManager {
  empId: number
  empNo: string
  empName: string
  /** 管理权限级别：manage=可办理用车 view=仅可查阅 */
  level: 'manage' | 'view'
}

/** 车辆运行档案（一车一档） */
export interface VehicleFile {
  id: number
  /** 系统车辆 ID 对外展示的稳定编码 */
  vehicleCode: string
  /** 当前主车牌（换牌留痕，历史台账保留当时车牌） */
  plateNo: string
  /** 车牌登记地区 */
  registerRegion: string
  /** 车型 */
  vehicleType: string
  /** 法人主体（复用购买公司字典维度，非汽车制造商品牌） */
  ownerCompanyId: number
  ownerCompanyName: string
  /** 公司品牌：1=闪蜂 2=mFood（独立维度） */
  companyBrand: number
  /** 管理部门 */
  manageDeptId: number
  manageDeptName: string
  /** 核定载客人数（含驾驶人） */
  seatCount: number
  /** 当前里程（上次确认值，公里） */
  currentOdometer: number
  status: VehicleStatus
  /** 是否允许授权直接登记（配置开关） */
  allowDirectRegister: boolean
  /** 保险/检验：一期做最小有效性记录 */
  insuranceValidUntil?: string
  inspectionValidUntil?: string
  /** 合规核验人与时间 */
  verifyBy?: string
  verifyAt?: string
  /** 可选关联 EAM 资产编号；不要求一期先建资产 */
  eamAssetNo?: string
  /** VIN 可选 */
  vin?: string
  /** 可使用部门（显式授权） */
  allowedDepts: VehicleDeptGrant[]
  /** 授权管理人员 */
  managers: VehicleManager[]
  remark?: string
  updatedBy: string
  updatedAt: string
  /** 后端乐观锁版本：编辑时回传为 expectVersion，避免覆盖他人改动 */
  version?: number
  /** 出车建议起始里程（后端按 max(档案, 最近已确认行程) 算，与出车校验同口径） */
  suggestStartOdometer?: number
}

/** 内部员工驾驶资格最小核验记录 */
export interface DriverQualification {
  id: number
  empId: number
  empNo: string
  empName: string
  /** 驾照适用地区 */
  region: string
  /** 准驾范围，如 C1 / B2 / A1 */
  licenseClass: string
  /** 有效期至 */
  validUntil: string
  result: QualificationResult
  verifiedBy?: string
  verifiedAt?: string
}

/** 用车申请信息（申请人视角） */
export interface VehicleUseApply {
  applicantEmpId: number
  applicantName: string
  applicantEmpNo: string
  /** 实际用车人：与申请人可不同 */
  actualUserName: string
  departmentId: number
  departmentName: string
  /** 意向车辆（安排前不代表预约成功） */
  intentVehicleId?: number
  intentPlateNo?: string
  purpose: string
  origin: string
  destination: string
  plannedStart: string
  plannedEnd: string
  drivingMode: DrivingMode
  /** 人数含驾驶人 */
  passengerCount: number
}

/** 车辆安排信息（车管视角） */
export interface VehicleUseAssign {
  finalVehicleId?: number
  finalPlateNo?: string
  /** 实际驾驶人：与申请人/用车人分别记录 */
  driverEmpId?: number
  driverName?: string
  driverEmpNo?: string
  assignBy?: string
  assignAt?: string
  /** 冲突检查结论 */
  conflictNote?: string
  /** 授权直接登记原因（直接登记必填） */
  directRegisterReason?: string
}

/** 出车登记 */
export interface TripDepart {
  departAt?: string
  startOdometer?: number
  /** 钥匙领取 */
  keyReceived?: boolean
  /** 车况确认 */
  conditionOk?: boolean
  registerBy?: string
  registerAt?: string
}

/** 归还登记 */
export interface TripReturn {
  returnAt?: string
  endOdometer?: number
  returnPlace?: string
  keyReturned?: boolean
  /** 车况：normal / abnormal */
  condition?: 'normal' | 'abnormal'
  exceptionNote?: string
  confirmBy?: string
  confirmAt?: string
}

/** 实际行程（一期与用车单一对一） */
export interface VehicleTrip {
  id: number
  useId: number
  vehicleId: number
  /** 行程发生时的车牌快照 */
  plateNo: string
  driverEmpId: number
  driverName: string
  driverEmpNo: string
  status: TripStatus
  depart: TripDepart
  tripReturn: TripReturn
  /** 计算值：结束里程 - 起始里程 */
  mileage?: number
  /** 计算值：实际还车 - 实际出车（小时） */
  durationHours?: number
  flags: TripFlag[]
  /** 补录场景：实际发生时间与系统登记时间分开 */
  backfillEntryAt?: string
  version: number
}

/** 用车单（申请 + 安排 + 行程 + 审计的聚合视图） */
export interface VehicleUseOrder {
  id: number
  /** 业务单号，阶段 B 由 BizSeqService 生成 */
  useNo: string
  source: UseSource
  approval: ApprovalOutcome
  status: UseStatus
  /** OA 流程编号（审批用车才有） */
  flowNo?: string
  apply: VehicleUseApply
  assign: VehicleUseAssign
  trip?: VehicleTrip
  /** 当前待审节点名（原型展示用） */
  currentNodeName?: string
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}

/** 追加式审计事件（业务页面不可删除） */
export interface VehicleAuditEvent {
  id: number
  useNo: string
  action: string
  actor: string
  at: string
  detail: string
}

/* ==================== 表单值类型 ==================== */

export interface VehicleFileFormValues {
  plateNo: string
  registerRegion: string
  vehicleType: string
  ownerCompanyId?: number
  companyBrand?: number
  manageDeptId?: number
  seatCount?: number
  currentOdometer?: number
  status: VehicleStatus
  allowDirectRegister: boolean
  insuranceValidUntil?: string
  inspectionValidUntil?: string
  eamAssetNo?: string
  vin?: string
  allowedDeptIds?: number[]
  remark?: string
}

export interface VehicleUseApplyFormValues {
  actualUserName: string
  intentVehicleId?: number
  purpose: string
  origin: string
  destination: string
  plannedStart?: string
  plannedEnd?: string
  drivingMode: DrivingMode
  passengerCount?: number
}

export interface DispatchAssignFormValues {
  finalVehicleId?: number
  driverEmpId?: number
  plannedStart?: string
  plannedEnd?: string
  assignRemark?: string
}

export interface DirectRegisterFormValues {
  vehicleId?: number
  driverEmpId?: number
  actualUserName: string
  departmentId?: number
  purpose: string
  origin: string
  destination: string
  /** 直接登记原因（必填） */
  directRegisterReason: string
  /** 计划起止：后端据此建立占用窗口并判定超时（'YYYY-MM-DD HH:mm:ss'） */
  plannedStart: string
  plannedEnd: string
  departAt?: string
  startOdometer?: number
  passengerCount?: number
}

export interface TripDepartFormValues {
  departAt?: string
  startOdometer?: number
  keyReceived: boolean
  conditionOk: boolean
}

export interface TripReturnFormValues {
  returnAt?: string
  endOdometer?: number
  returnPlace: string
  keyReturned: boolean
  condition: 'normal' | 'abnormal'
  exceptionNote?: string
}

export interface LedgerCorrectionFormValues {
  reason: string
  driverEmpId?: number
  departAt?: string
  returnAt?: string
  startOdometer?: number
  endOdometer?: number
}

export interface LedgerFilterValues {
  keyword?: string
  plateNo?: string
  driverName?: string
  departmentId?: number
  source?: UseSource
  status?: TripStatus
  dateRange?: [{ format: (f: string) => string } | null, { format: (f: string) => string } | null] | null
}
