import { Input } from 'antd'
import type { TextAreaProps } from 'antd/es/input'

/**
 * 備註輸入框全系統統一標準（見 .qoder/rules/frontend-ui-design-spec.md 備註條目）。
 *
 * 尺寸與上限的依據：
 * - 備註的真實使用場景是 1~3 句補充說明，實測多數落在 60~120 字；上限取 200 字，
 *   既容得下較長的交接/故障描述，又避免把備註當正文寫。
 * - 整行寬度下 14px 字號約 85 字/行，rows=3 可顯示約 255 字 ≥ 200 字上限，
 *   即「上限內的內容不滾動、不遮擋」，用戶不需要拖拽高度去讀自己寫的內容。
 * - resize: 'none'：高度是算出來的而不是讓用戶調的；放開 resize 只會產生
 *   每頁高度不一的備註框（歷史上 rows 曾散落在 1~8 之間）。
 *
 * 使用約定：備註必須獨占一整行（grid 容器內加 gridColumn: '1 / -1'），
 * 不得與其它字段並排——並排時列寬變窄，3 行就裝不下 200 字。
 */
export const REMARK_MAX_LENGTH = 200

export default function RemarkTextArea(props: TextAreaProps) {
  return (
    <Input.TextArea
      rows={3}
      maxLength={REMARK_MAX_LENGTH}
      showCount
      placeholder="選填"
      style={{ resize: 'none', ...props.style }}
      {...props}
    />
  )
}
