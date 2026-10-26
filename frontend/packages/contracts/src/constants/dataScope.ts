/**
 * 组织数据权限（数据范围）档位常量 —— 前端唯一真值。
 *
 * 与后端 `com.mftb.admin.constant.OrgDataScope` 逐值对齐：档位落库为 TINYINT，
 * 严禁在页面里写数字字面量。缺省 1（僅本人）是刻意的严格模式，
 * 设计口径见 docs/design/员工管理_Core_HR_整改方案_94e06fc1.md §10.9。
 */
export const DATA_SCOPE = {
  /** 仅本人 */
  SELF: 1,
  /** 本部门（不含下级） */
  DEPT: 2,
  /** 本部门及以下 */
  DEPT_AND_CHILD: 3,
  /** 自定部门（勾选部门连同其下级） */
  CUSTOM_DEPT: 4,
  /** 全部 */
  ALL: 5,
} as const

export type DataScope = (typeof DATA_SCOPE)[keyof typeof DATA_SCOPE]

export const ALL_DATA_SCOPES: DataScope[] = [
  DATA_SCOPE.SELF,
  DATA_SCOPE.DEPT,
  DATA_SCOPE.DEPT_AND_CHILD,
  DATA_SCOPE.CUSTOM_DEPT,
  DATA_SCOPE.ALL,
]

/** 档位 → i18n key（后端 scopeLabel 是繁体常量，界面必须按当前语言渲染） */
export const DATA_SCOPE_LABEL_KEY: Record<DataScope, string> = {
  [DATA_SCOPE.SELF]: 'orgScope.self',
  [DATA_SCOPE.DEPT]: 'orgScope.dept',
  [DATA_SCOPE.DEPT_AND_CHILD]: 'orgScope.deptAndChild',
  [DATA_SCOPE.CUSTOM_DEPT]: 'orgScope.customDept',
  [DATA_SCOPE.ALL]: 'orgScope.all',
}

/**
 * 档位 → 说明文案 key（配置界面用，解释「这一档到底能看谁」）。
 * 与 label 分开：下拉里要短，表单提示要说清后果。
 */
export const DATA_SCOPE_HINT_KEY: Record<DataScope, string> = {
  [DATA_SCOPE.SELF]: 'orgScope.hintSelf',
  [DATA_SCOPE.DEPT]: 'orgScope.hintDept',
  [DATA_SCOPE.DEPT_AND_CHILD]: 'orgScope.hintDeptAndChild',
  [DATA_SCOPE.CUSTOM_DEPT]: 'orgScope.hintCustomDept',
  [DATA_SCOPE.ALL]: 'orgScope.hintAll',
}

/** 取档位的 i18n key；脏值（后端返回了未知档位）回落到最严的一档说明 */
export function dataScopeLabelKey(scope: DataScope | number | null | undefined): string {
  return DATA_SCOPE_LABEL_KEY[scope as DataScope] ?? DATA_SCOPE_LABEL_KEY[DATA_SCOPE.SELF]
}
