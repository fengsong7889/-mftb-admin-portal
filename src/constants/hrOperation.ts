/**
 * 人事异动动作 code —— 前端唯一真值，与后端 `HrOperationCode` 逐值对齐。
 *
 * 为什么用 code 而不是中文名提交（方案 §5.3）：库里存简体、界面显示繁体，
 * 「在职/离职」以前靠 `"离职".equals(operation)` 判定，换语言或繁简混写就静默失效。
 * `operation` 名称仍然提交/回显，但降级为「发生时的名称快照」，不参与判定。
 */
export const HR_OPERATION = {
  ONBOARD: 'ONBOARD',
  REGULAR: 'REGULAR',
  PROMOTION: 'PROMOTION',
  TRANSFER: 'TRANSFER',
  DEMOTION: 'DEMOTION',
  DIMISSION: 'DIMISSION',
  REHIRE: 'REHIRE',
  OTHER: 'OTHER',
} as const

export type HrOperation = (typeof HR_OPERATION)[keyof typeof HR_OPERATION]

/** 职务记录表单可选的动作（OTHER 只由后端兜底产生，不给选） */
export const HR_OPERATION_OPTIONS: HrOperation[] = [
  HR_OPERATION.ONBOARD,
  HR_OPERATION.REGULAR,
  HR_OPERATION.TRANSFER,
  HR_OPERATION.PROMOTION,
  HR_OPERATION.DEMOTION,
  HR_OPERATION.DIMISSION,
  HR_OPERATION.REHIRE,
]

/** code → i18n key（标签随界面语言渲染） */
export const HR_OPERATION_LABEL_KEY: Record<HrOperation, string> = {
  [HR_OPERATION.ONBOARD]: 'hrOperation.ONBOARD',
  [HR_OPERATION.REGULAR]: 'hrOperation.REGULAR',
  [HR_OPERATION.PROMOTION]: 'hrOperation.PROMOTION',
  [HR_OPERATION.TRANSFER]: 'hrOperation.TRANSFER',
  [HR_OPERATION.DEMOTION]: 'hrOperation.DEMOTION',
  [HR_OPERATION.DIMISSION]: 'hrOperation.DIMISSION',
  [HR_OPERATION.REHIRE]: 'hrOperation.REHIRE',
  [HR_OPERATION.OTHER]: 'hrOperation.OTHER',
}

/** code → Tag 颜色（取代旧的「正则匹配中文」判色，方案 §5.3 明确禁止字符串判定） */
export const HR_OPERATION_TAG_COLOR: Record<HrOperation, string> = {
  [HR_OPERATION.ONBOARD]: 'green',
  [HR_OPERATION.REGULAR]: 'geekblue',
  [HR_OPERATION.PROMOTION]: 'gold',
  [HR_OPERATION.TRANSFER]: 'blue',
  [HR_OPERATION.DEMOTION]: 'orange',
  [HR_OPERATION.DIMISSION]: 'red',
  [HR_OPERATION.REHIRE]: 'cyan',
  [HR_OPERATION.OTHER]: 'default',
}

/** 让 TS 在「后端回了登记外的值」时不炸：脏值归到 OTHER 展示 */
export function asHrOperation(code?: string | null): HrOperation | undefined {
  if (!code) return undefined
  return (HR_OPERATION_LABEL_KEY as Record<string, string>)[code]
    ? (code as HrOperation)
    : HR_OPERATION.OTHER
}

/**
 * 名称快照 → code（与后端 `HrOperationCode.NAME_TO_CODE` 同源）。
 * 只用于历史行回填表单：库内存简体、界面曾经直接写繁体，两边都得收。
 */
const NAME_TO_CODE: Record<string, HrOperation> = {
  入职: HR_OPERATION.ONBOARD, 入職: HR_OPERATION.ONBOARD,
  转正: HR_OPERATION.REGULAR, 轉正: HR_OPERATION.REGULAR,
  晋升: HR_OPERATION.PROMOTION, 晉升: HR_OPERATION.PROMOTION,
  调动: HR_OPERATION.TRANSFER, 調動: HR_OPERATION.TRANSFER,
  降职: HR_OPERATION.DEMOTION, 降職: HR_OPERATION.DEMOTION,
  离职: HR_OPERATION.DIMISSION, 離職: HR_OPERATION.DIMISSION,
  重新入职: HR_OPERATION.REHIRE, 重新入職: HR_OPERATION.REHIRE,
}

/** 从名称快照反推 code（编辑历史行时预填表单用）；推不出返回 undefined */
export function hrOperationCodeFromName(name?: string | null): HrOperation | undefined {
  if (!name) return undefined
  return NAME_TO_CODE[name.trim()]
}

/** 取动作展示名：优先按 code 出 i18n 标签，code 缺失（历史未回填）时退回库里的名称快照。
 * 不写正则匹配「離職/离职」——那正是本次改造要消灭的东西。
 */
export function hrOperationLabel(
  code: string | null | undefined,
  nameSnapshot: string | null | undefined,
  translate: (key: string) => string,
): string {
  const normalized = asHrOperation(code)
  if (normalized && normalized !== HR_OPERATION.OTHER) return translate(HR_OPERATION_LABEL_KEY[normalized])
  return nameSnapshot || translate(HR_OPERATION_LABEL_KEY[HR_OPERATION.OTHER])
}

/** 取动作 Tag 颜色（无 code 时默认色，不猜名称） */
export function hrOperationColor(code?: string | null): string {
  const normalized = asHrOperation(code)
  return normalized ? HR_OPERATION_TAG_COLOR[normalized] : 'default'
}
