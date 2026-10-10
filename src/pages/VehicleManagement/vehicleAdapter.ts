/**
 * 用车管理 — 后端 VO ↔ 前端视图模型适配器
 *
 * 为什么保留嵌套视图模型而不是把页面改成扁平结构：
 *   1. 时段冲突、里程校验、状态机、台账口径这些规则（vehicleRules.ts + 41 项单测）
 *      是按"申请 / 安排 / 行程"三段语义写的，扁平 VO 会让规则可读性骤降；
 *   2. 后端把表拆成 use + trip 两张是存储决策，不该渗透进每个组件；
 *   3. 只在这一处做映射，字段对不上时只有一个地方要改。
 *
 * 反向（表单 → payload）也集中在这里，避免各表单自己拼 ISO 字符串。
 */
import type {
  DirectRegisterPayload, DraftPayload, QualificationVO, ReturnPayload,
  TripVO, UseVO, VehicleOption, VehicleSave, VehicleVO,
} from '../../api/vehicle'
import {
  APPROVAL_OUTCOME, DRIVING_MODE, QUALIFICATION_RESULT, TRIP_STATUS, USE_SOURCE, USE_STATUS,
  VEHICLE_STATUS,
  type DriverQualification, type TripFlag, type TripStatus, type UseSource, type UseStatus,
  type VehicleFile, type VehicleTrip,
  type VehicleUseOrder, type VehicleUseApplyFormValues, type DirectRegisterFormValues,
} from './vehicleTypes'

/** 后端布尔是 Java Boolean，展示模型统一成 boolean */
const bool = (v: boolean | number | null | undefined): boolean => !!v

/**
 * 空字符串时间在 DB 里是 null，视图模型里用 undefined 表示"尚未发生"。
 * 不做任何 '—' 兜底：让页面按状态自己决定占位文案，避免把缺失误当成有效时间。
 */
function optStr(value?: string | null): string | undefined {
  return value == null || value === '' ? undefined : value
}

function toTripStatus(status?: string | null): TripStatus {
  const known: string[] = Object.values(TRIP_STATUS)
  return (known.includes(status ?? '') ? status : TRIP_STATUS.DEPARTED) as TripStatus
}

export function toTrip(vo: TripVO | null | undefined): VehicleTrip | undefined {
  if (!vo) return undefined
  return {
    id: vo.id,
    // useId 不在 trip VO 上，由用车单回填
    useId: 0,
    vehicleId: 0,
    plateNo: vo.vehiclePlateNo ?? '',
    driverEmpId: 0,
    driverName: '',
    driverEmpNo: '',
    status: toTripStatus(vo.status),
    depart: {
      departAt: optStr(vo.departAt),
      startOdometer: vo.startOdometer ?? undefined,
      keyReceived: bool(vo.keyReceived),
      conditionOk: bool(vo.conditionOk),
      registerBy: optStr(vo.departByName),
      registerAt: optStr(vo.departRegisteredAt),
    },
    tripReturn: {
      returnAt: optStr(vo.returnAt),
      endOdometer: vo.endOdometer ?? undefined,
      returnPlace: optStr(vo.returnPlace),
      keyReturned: vo.keyReturned == null ? undefined : bool(vo.keyReturned),
      condition: vo.vehicleCondition === 'abnormal' ? 'abnormal'
        : vo.vehicleCondition === 'normal' ? 'normal' : undefined,
      exceptionNote: optStr(vo.exceptionNote),
      confirmBy: optStr(vo.confirmByName),
      confirmAt: optStr(vo.confirmAt),
    },
    mileage: vo.mileage ?? undefined,
    durationHours: vo.durationHours ?? undefined,
    flags: (vo.flags ?? []) as TripFlag[],
    backfillEntryAt: optStr(vo.backfillEntryAt),
    version: vo.version,
  }
}

function toUseStatus(status: string): UseStatus {
  const known: string[] = Object.values(USE_STATUS)
  return (known.includes(status) ? status : USE_STATUS.DRAFT) as UseStatus
}

function toSource(source: string): UseSource {
  const known: string[] = Object.values(USE_SOURCE)
  return (known.includes(source) ? source : USE_SOURCE.OA_APPROVAL) as UseSource
}

function toApproval(approval: string): ApprovalOutcomeAlias {
  const known: string[] = Object.values(APPROVAL_OUTCOME)
  return (known.includes(approval) ? approval : APPROVAL_OUTCOME.NOT_SUBMITTED) as ApprovalOutcomeAlias
}

/** 便于不引入额外导出名：审批结论的联合类型别名 */
type ApprovalOutcomeAlias = typeof APPROVAL_OUTCOME[keyof typeof APPROVAL_OUTCOME]

export function toOrder(vo: UseVO): VehicleUseOrder {
  const trip = toTrip(vo.trip)
  if (trip) {
    // trip 上不带归属信息，从用车单补齐，规则层依赖这三个字段做占用与冲突判定
    trip.useId = vo.id
    trip.vehicleId = vo.finalVehicleId ?? 0
    trip.driverEmpId = vo.driverId ?? 0
    trip.driverName = vo.driverName ?? ''
    trip.driverEmpNo = vo.driverEmpNo ?? ''
  }
  return {
    id: vo.id,
    useNo: vo.useNo,
    source: toSource(vo.source),
    approval: toApproval(vo.approvalOutcome),
    status: toUseStatus(vo.status),
    flowNo: optStr(vo.flowNo),
    apply: {
      applicantEmpId: vo.applicantId,
      applicantName: vo.applicantName,
      applicantEmpNo: vo.applicantEmpNo,
      actualUserName: vo.actualUserName,
      departmentId: vo.departmentId,
      departmentName: vo.departmentName,
      intentVehicleId: vo.intentVehicleId ?? undefined,
      intentPlateNo: optStr(vo.intentPlateNo),
      purpose: vo.purpose,
      origin: vo.origin,
      destination: vo.destination,
      plannedStart: vo.plannedStart,
      plannedEnd: vo.plannedEnd,
      drivingMode: vo.drivingMode === DRIVING_MODE.COMPANY_DRIVER
        ? DRIVING_MODE.COMPANY_DRIVER : DRIVING_MODE.SELF,
      passengerCount: vo.passengerCount,
    },
    assign: {
      finalVehicleId: vo.finalVehicleId ?? undefined,
      finalPlateNo: optStr(vo.finalPlateNo),
      driverEmpId: vo.driverId ?? undefined,
      driverName: optStr(vo.driverName),
      driverEmpNo: optStr(vo.driverEmpNo),
      assignBy: optStr(vo.assignByName),
      assignAt: optStr(vo.assignAt),
      directRegisterReason: optStr(vo.directReason),
      conflictNote: optStr(vo.conflictNote),
    },
    trip,
    createdBy: vo.applicantName,
    createdAt: vo.createdAt,
    updatedBy: vo.updatedBy,
    updatedAt: vo.updatedAt,
  }
}

export function toOrders(list: UseVO[]): VehicleUseOrder[] {
  return list.map(toOrder)
}

function toVehicleStatus(status: string): VehicleFile['status'] {
  const known: string[] = Object.values(VEHICLE_STATUS)
  return (known.includes(status) ? status : VEHICLE_STATUS.NORMAL) as VehicleFile['status']
}

export function toVehicleFile(vo: VehicleVO): VehicleFile {
  return {
    id: vo.id,
    vehicleCode: vo.vehicleCode,
    plateNo: vo.plateNo,
    registerRegion: vo.registerRegion,
    vehicleType: vo.vehicleType,
    vin: optStr(vo.vin),
    seatCount: vo.seatCount,
    currentOdometer: Number(vo.currentOdometer ?? 0),
    status: toVehicleStatus(vo.status),
    allowDirectRegister: bool(vo.allowDirectRegister),
    insuranceValidUntil: optStr(vo.insuranceValidUntil),
    inspectionValidUntil: optStr(vo.inspectionValidUntil),
    verifyBy: optStr(vo.verifyBy),
    verifyAt: optStr(vo.verifyAt),
    ownerCompanyId: vo.ownerCompanyId ?? 0,
    // 名称快照缺失时退回 ID，避免界面出现空白却看不出是哪一法人
    ownerCompanyName: vo.ownerCompanyName || (vo.ownerCompanyId ? `公司#${vo.ownerCompanyId}` : ''),
    companyBrand: vo.companyBrand ?? 1,
    manageDeptId: vo.manageDeptId,
    manageDeptName: vo.manageDeptName,
    eamAssetNo: optStr(vo.eamAssetNo),
    suggestStartOdometer: vo.suggestStartOdometer ?? undefined,
    remark: optStr(vo.remark),
    allowedDepts: (vo.allowedDepts ?? []).map(d => ({ deptId: d.deptId, deptName: d.deptName })),
    managers: (vo.managers ?? []).map(m => ({
      empId: m.userId, empNo: m.empNo, empName: m.empName, level: m.level,
    })),
    updatedBy: vo.updatedBy,
    updatedAt: vo.updatedAt,
    // 版本回传给表单，保存时作为 expectVersion，防止覆盖他人改动
    version: vo.version,
  }
}

export function toVehicleFiles(list: VehicleVO[]): VehicleFile[] {
  return list.map(toVehicleFile)
}

export function toQualification(vo: QualificationVO): DriverQualification {
  const known: string[] = Object.values(QUALIFICATION_RESULT)
  return {
    id: vo.id,
    empId: vo.userId,
    empNo: vo.empNo,
    empName: vo.empName,
    region: vo.region,
    licenseClass: vo.licenseClass,
    validUntil: vo.validUntil,
    result: (known.includes(vo.result) ? vo.result : QUALIFICATION_RESULT.PENDING) as DriverQualification['result'],
    verifiedBy: optStr(vo.verifiedBy),
    verifiedAt: optStr(vo.verifiedAt),
  }
}

export function toQualifications(list: QualificationVO[]): DriverQualification[] {
  return list.map(toQualification)
}

/** 可用车辆选项 → 表单需要的最小信息（含 seatCount 与不可派原因） */
export interface VehicleChoice {
  value: number
  label: string
  plateNo: string
  seatCount: number
  startOdometer: number
  registerRegion: string
  allowDirectRegister: boolean
  /** 非空表示可见但不可选，界面必须说明原因 */
  blockers: string[]
}

export function toChoices(list: VehicleOption[]): VehicleChoice[] {
  return list.map(o => ({
    value: o.vehicleId,
    plateNo: o.plateNo,
    seatCount: o.seatCount,
    startOdometer: Number(o.currentOdometer ?? 0),
    registerRegion: o.registerRegion,
    allowDirectRegister: bool(o.allowDirectRegister),
    blockers: o.blockers ?? [],
    label: `${o.plateNo} · ${o.vehicleType} · ${o.seatCount} 座 · ${Number(o.currentOdometer ?? 0).toLocaleString()} km`
      + ((o.blockers?.length) ? `（${o.blockers[0]}）` : ''),
  }))
}

/* ==================== 反向：表单值 → 后端 payload ==================== */

export function toDraftPayload(
  values: VehicleUseApplyFormValues, departmentId: number, applicantName: string, requestKey: string,
  isoStart: string, isoEnd: string,
): DraftPayload {
  return {
    intentVehicleId: values.intentVehicleId,
    actualUserName: values.actualUserName || applicantName,
    purpose: values.purpose,
    origin: values.origin,
    destination: values.destination,
    plannedStart: isoStart,
    plannedEnd: isoEnd,
    drivingMode: values.drivingMode,
    passengerCount: values.passengerCount ?? 1,
    requestKey,
  }
}

export function toDirectPayload(
  values: DirectRegisterFormValues, departmentId: number, requestKey: string,
  isoStart: string, isoEnd: string,
): DirectRegisterPayload {
  return {
    vehicleId: values.vehicleId!,
    actualUserName: values.actualUserName,
    departmentId: values.departmentId ?? departmentId,
    driverId: values.driverEmpId!,
    purpose: values.purpose,
    origin: values.origin,
    destination: values.destination,
    plannedStart: isoStart,
    plannedEnd: isoEnd,
    passengerCount: values.passengerCount ?? 1,
    directReason: values.directRegisterReason,
    startOdometer: values.startOdometer,
    requestKey,
  }
}

export function toVehicleSavePayload(
  values: {
    plateNo: string; registerRegion: string; vehicleType: string; vin?: string; seatCount?: number
    currentOdometer?: number; status: string; allowDirectRegister: boolean; insuranceValidUntil?: string
    inspectionValidUntil?: string; ownerCompanyId?: number; companyBrand?: number; manageDeptId?: number
    allowedDeptIds?: number[]; eamAssetNo?: string; remark?: string
  },
  editing?: VehicleFile,
): VehicleSave {
  return {
    id: editing?.id,
    plateNo: values.plateNo,
    registerRegion: values.registerRegion,
    vehicleType: values.vehicleType,
    vin: values.vin,
    seatCount: values.seatCount ?? 0,
    currentOdometer: values.currentOdometer ?? 0,
    status: values.status,
    allowDirectRegister: !!values.allowDirectRegister,
    insuranceValidUntil: values.insuranceValidUntil,
    inspectionValidUntil: values.inspectionValidUntil,
    ownerCompanyId: values.ownerCompanyId,
    companyBrand: values.companyBrand,
    manageDeptId: values.manageDeptId ?? 0,
    allowedDeptIds: values.allowedDeptIds,
    eamAssetNo: values.eamAssetNo,
    remark: values.remark,
    // 管理人员不在本表单维护，编辑时必须把原值带回，否则后端按"整组覆盖"会清空授权
    managers: editing?.managers.map(m => ({
      userId: m.empId, empNo: m.empNo, empName: m.empName, level: m.level,
    })),
    expectVersion: editing?.version,
  }
}

export function toReturnPayload(values: {
  returnAt: string; endOdometer: number; returnPlace: string; keyReturned: boolean
  condition: 'normal' | 'abnormal'; exceptionNote?: string
}, useId: number, requestKey: string): ReturnPayload {
  return {
    useId,
    returnAt: values.returnAt,
    endOdometer: values.endOdometer,
    returnPlace: values.returnPlace,
    keyReturned: values.keyReturned,
    vehicleCondition: values.condition,
    exceptionNote: values.exceptionNote,
    requestKey,
  }
}
