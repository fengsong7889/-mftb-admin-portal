/**
 * 资产分类 & 仓库位置 编码自动生成工具
 *
 * 分类编码规则：分层递进，每层 2 位数字，用 - 分隔
 *   一级：01, 02, 03 ...
 *   二级：01-01, 01-02 ...
 *   三级：01-01-01, 01-01-02 ...
 *
 * 仓库编码规则：前缀 + 分层编号
 *   仓库(warehouse)：CK-001, CK-002 ...
 *   楼层(floor)：    DZ-001-01, DZ-001-02 ...（挂在仓库下）
 *   房间(room)：     XQ-001-01-01, XQ-001-01-02 ...（挂在楼层下）
 */

/** 仓库位置类型前缀 */
const LOCATION_PREFIX: Record<string, string> = {
  warehouse: 'CK',
  floor: 'DZ',
  room: 'XQ',
}

/**
 * 从编码列表中提取最大序号
 *
 * @param codes 现有编码列表
 * @param prefix 编码前缀（分类为父编码前缀，仓库为类型前缀+父序号）
 * @param digits 序号位数（分类 2 位，仓库 3 位）
 * @returns 补齐位数后的下一个序号字符串
 */
function getNextSeq(codes: string[], prefix: string, digits: number): string {
  let maxSeq = 0
  for (const code of codes) {
    if (code.startsWith(prefix)) {
      const suffix = code.slice(prefix.length)
      // 去掉可能的子级部分（如 "01-01" 中取 "01"）
      const seqPart = suffix.split('-')[0]
      const seq = parseInt(seqPart, 10)
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq
    }
  }
  return String(maxSeq + 1).padStart(digits, '0')
}

/**
 * 生成资产分类编码
 *
 * @param existingCodes 现有所有分类编码
 * @param parentId 上级分类 ID（0 或 undefined 表示一级）
 * @param parentCode 上级分类编码（一级时为空）
 * @returns 新的分类编码
 */
export function generateCategoryCode(
  existingCodes: string[],
  parentId?: number,
  parentCode?: string,
): string {
  if (!parentId || !parentCode) {
    // 一级分类：2 位序号
    return getNextSeq(existingCodes, '', 2)
  }
  // 子分类：父编码 + '-' + 2 位序号
  const prefix = `${parentCode}-`
  return `${parentCode}-${getNextSeq(existingCodes, prefix, 2)}`
}

/**
 * 生成仓库位置编码
 *
 * @param existingCodes 现有所有位置编码
 * @param type 位置类型（warehouse/floor/room）
 * @param parentId 上级位置 ID（0 或 undefined 表示顶级仓库）
 * @param parentCode 上级位置编码
 * @param parentType 上级位置类型
 * @returns 新的位置编码
 */
export function generateLocationCode(
  existingCodes: string[],
  type: string,
  parentId?: number,
  parentCode?: string,
  parentType?: string,
): string {
  const prefix = LOCATION_PREFIX[type] || 'CK'

  if (!parentId || !parentCode) {
    // 顶级仓库：CK-001
    return `${prefix}-${getNextSeq(existingCodes, `${prefix}-`, 3)}`
  }

  // 子级：根据父类型决定格式
  if (parentType === 'warehouse' && type === 'floor') {
    // 楼层挂在仓库下：DZ-001-01
    const parentSeq = parentCode.split('-')[1] // CK-001 → 001
    return `${prefix}-${parentSeq}-${getNextSeq(existingCodes, `${prefix}-${parentSeq}-`, 2)}`
  }

  if (parentType === 'floor' && type === 'room') {
    // 房间挂在楼层下：XQ-001-01-01
    const parts = parentCode.split('-') // DZ-001-01
    return `${prefix}-${parts[1]}-${parts[2]}-${getNextSeq(existingCodes, `${prefix}-${parts[1]}-${parts[2]}-`, 2)}`
  }

  // 兜底：同级递增
  return `${prefix}-${getNextSeq(existingCodes, `${prefix}-`, 3)}`
}
