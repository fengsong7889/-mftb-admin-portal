import { message, Upload, type UploadFile } from 'antd'
import { useCountUp } from '../../../hooks/useCountUp'

/** 数字金额转中文大写 */
export function amountToChinese(num: number): string {
  if (!num || num <= 0) return ''
  const digits = ['零', '壹', '貳', '叁', '肆', '伍', '陸', '柒', '捌', '玖']
  const units = ['', '拾', '佰', '仟']
  const bigUnits = ['', '萬', '億']
  const intPart = Math.floor(num)
  const decPart = Math.round((num - intPart) * 100)
  const jiao = Math.floor(decPart / 10)
  const fen = decPart % 10

  let result = ''
  const intStr = String(intPart)
  const groups: number[][] = []
  for (let i = intStr.length; i > 0; i -= 4) {
    groups.unshift(intStr.slice(Math.max(0, i - 4), i).split('').map(Number))
  }
  groups.forEach((group, gi) => {
    let groupStr = ''
    let zeroFlag = false
    group.forEach((d, di) => {
      if (d === 0) { zeroFlag = true; return }
      if (zeroFlag) { groupStr += '零'; zeroFlag = false }
      groupStr += digits[d] + units[group.length - 1 - di]
    })
    if (groupStr) result += groupStr + bigUnits[groups.length - 1 - gi]
  })
  result += '元'
  if (jiao > 0) result += digits[jiao] + '角'
  if (fen > 0) result += digits[fen] + '分'
  return result
}

/** 动画数字组件 */
export function AnimatedNumber({ value, suffix = '', prefix = '' }: { value: number; suffix?: string; prefix?: string }) {
  const animated = useCountUp(value)
  return <>{prefix}{animated.toLocaleString()}{suffix}</>
}

/** 賬戶狀態文案/顏色映射（label 為 i18n key） */
export const accountStatusMap: Record<string, { labelKey: string; color: string }> = {
  normal: { labelKey: 'accountBalance.statusNormal', color: 'green' },
  frozen: { labelKey: 'accountBalance.statusFrozen', color: 'red' },
  mergeFrozen: { labelKey: 'accountBalance.statusMergeFrozen', color: 'orange' },
}

/** 文件上传前校验 */
export function beforeUpload(file: File): boolean | string {
  const isImageOrPdf =
    file.type === 'image/png' ||
    file.type === 'image/jpeg' ||
    file.type === 'image/jpg' ||
    file.type === 'application/pdf'
  if (!isImageOrPdf) {
    message.error('只支持 PNG/JPG/PDF 格式')
    return Upload.LIST_IGNORE
  }
  const isLt5M = file.size / 1024 / 1024 < 5
  if (!isLt5M) {
    message.error('文件大小不能超过 5MB')
    return Upload.LIST_IGNORE
  }
  return true
}
