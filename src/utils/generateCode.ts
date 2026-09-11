/**
 * 資產分類 & 倉庫位置 編碼自動生成工具
 *
 * 分類編碼規則：分層遞進，每層 2 位數字，用 - 分隔
 *   一級：01, 02, 03 ...
 *   二級：01-01, 01-02 ...
 *   三級：01-01-01, 01-01-02 ...
 *
 * 倉庫編碼規則：前綴 + 分層編號
 *   倉庫(warehouse)：CK-001, CK-002 ...
 *   樓層(floor)：    DZ-001-01, DZ-001-02 ...（掛在倉庫下）
 *   房間(room)：     XQ-001-01-01, XQ-001-01-02 ...（掛在樓層下）
 */

/** 倉庫位置類型前綴 */
const LOCATION_PREFIX: Record<string, string> = {
  warehouse: 'CK',
  floor: 'DZ',
  room: 'XQ',
}

/**
 * 從編碼列表中提取最大序號
 * @param codes 現有編碼列表
 * @param prefix 編碼前綴（分類為父編碼前綴，倉庫為類型前綴+父序號）
 * @param digits 序號位數（分類 2 位，倉庫 3 位）
 */
function getNextSeq(codes: string[], prefix: string, digits: number): string {
  let maxSeq = 0
  for (const code of codes) {
    if (code.startsWith(prefix)) {
      const suffix = code.slice(prefix.length)
      // 去掉可能的子級部分（如 "01-01" 中取 "01"）
      const seqPart = suffix.split('-')[0]
      const seq = parseInt(seqPart, 10)
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq
    }
  }
  return String(maxSeq + 1).padStart(digits, '0')
}

/**
 * 生成資產分類編碼
 * @param existingCodes 現有所有分類編碼
 * @param parentId 上級分類 ID（0 或 undefined 表示一級）
 * @param parentCode 上級分類編碼（一級時為空）
 */
export function generateCategoryCode(
  existingCodes: string[],
  parentId?: number,
  parentCode?: string,
): string {
  if (!parentId || !parentCode) {
    // 一級分類：2 位序號
    return getNextSeq(existingCodes, '', 2)
  }
  // 子分類：父編碼 + '-' + 2 位序號
  const prefix = `${parentCode}-`
  return `${parentCode}-${getNextSeq(existingCodes, prefix, 2)}`
}

/**
 * 生成倉庫位置編碼
 * @param existingCodes 現有所有位置編碼
 * @param type 位置類型
 * @param parentId 上級位置 ID（0 或 undefined 表示頂級倉庫）
 * @param parentCode 上級位置編碼
 * @param parentType 上級位置類型
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
    // 頂級倉庫：CK-001
    return `${prefix}-${getNextSeq(existingCodes, `${prefix}-`, 3)}`
  }

  // 子級：根據父類型決定格式
  if (parentType === 'warehouse' && type === 'floor') {
    // 樓層掛在倉庫下：DZ-001-01
    const parentSeq = parentCode.split('-')[1] // CK-001 → 001
    return `${prefix}-${parentSeq}-${getNextSeq(existingCodes, `${prefix}-${parentSeq}-`, 2)}`
  }

  if (parentType === 'floor' && type === 'room') {
    // 房間掛在樓層下：XQ-001-01-01
    const parts = parentCode.split('-') // DZ-001-01
    return `${prefix}-${parts[1]}-${parts[2]}-${getNextSeq(existingCodes, `${prefix}-${parts[1]}-${parts[2]}-`, 2)}`
  }

  // 兜底：同級遞增
  return `${prefix}-${getNextSeq(existingCodes, `${prefix}-`, 3)}`
}
