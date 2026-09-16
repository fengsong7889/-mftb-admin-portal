/**
 * 資產標籤預覽組件
 * 根據標籤模板配置（配色方案 + 展示字段）實時渲染標籤最終呈現效果，
 * 復用於三處：新增/編輯頁實時預覽、列表卡片視圖、列表表格預覽列。
 */
import { ASSET_DISPLAY_FIELDS, ASSET_FIELD_SAMPLE_VALUES } from '../../../api/eam'

export interface AssetTagPreviewData {
  name?: string
  bgColor: string
  textColor: string
  displayFields: string[]
}

interface AssetTagPreviewProps {
  data: AssetTagPreviewData
  /** card：完整標籤卡（表單預覽 / 卡片視圖）；mini：緊湊版（表格預覽列） */
  variant?: 'card' | 'mini'
  /** 真實資產數據（鍵為 ASSET_DISPLAY_FIELDS key，見 buildTagValues）；缺省用示例值 */
  values?: Record<string, string>
  /** 寬度填滿容器（列印單元格用）：解除默認 min/max 寬度約束並去陰影，避免溢出被裁切 */
  fluid?: boolean
}

export default function AssetTagPreview({ data, variant = 'card', values, fluid = false }: AssetTagPreviewProps) {
  const { name, bgColor, textColor, displayFields } = data
  const fields = ASSET_DISPLAY_FIELDS.filter(f => displayFields.includes(f.key))
  const isMini = variant === 'mini'

  return (
    <div
      className="asset-tag-preview"
      style={{
        display: 'inline-block',
        background: '#fff',
        border: `1px solid ${bgColor}55`,
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: fluid ? 'none' : '0 2px 8px rgba(0,0,0,0.06)',
        minWidth: fluid ? undefined : isMini ? 150 : 240,
        maxWidth: fluid ? undefined : isMini ? 210 : 320,
        width: fluid ? '100%' : undefined,
        textAlign: 'left',
      }}
    >
      {/* 標籤頭：配色方案 + 標籤名稱 */}
      <div style={{
        background: bgColor,
        color: textColor,
        padding: isMini ? '3px 10px' : '7px 14px',
        fontSize: isMini ? 12 : 14,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name || '標籤名稱'}
        </span>
        {!isMini && (
          <span style={{ fontSize: 11, opacity: 0.75, flexShrink: 0 }}>資產標籤</span>
        )}
      </div>
      {/* 標籤體：展示字段 */}
      {isMini ? (
        <div style={{ padding: '6px 8px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {fields.length === 0 ? (
            <span style={{ fontSize: 11, color: '#8C8C8C' }}>未配置展示字段</span>
          ) : (
            <>
              {fields.slice(0, 4).map(f => (
                <span key={f.key} style={{
                  fontSize: 11,
                  color: bgColor,
                  background: `${bgColor}14`,
                  border: `1px solid ${bgColor}40`,
                  borderRadius: 4,
                  padding: '0 6px',
                  lineHeight: '18px',
                  whiteSpace: 'nowrap',
                }}>{f.label}</span>
              ))}
              {fields.length > 4 && (
                <span style={{ fontSize: 11, color: '#8C8C8C', lineHeight: '18px' }}>
                  +{fields.length - 4}
                </span>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={{ padding: '10px 14px' }}>
          {fields.length === 0 ? (
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>
              未配置展示字段，請在「展示字段配置」中勾選
            </div>
          ) : (
            fields.map(f => (
              <div key={f.key} style={{ display: 'flex', gap: 6, fontSize: 12, lineHeight: '22px' }}>
                <span style={{ color: '#8C8C8C', flexShrink: 0 }}>{f.label}：</span>
                <span style={{ color: '#262626', fontWeight: 500 }}>
                  {values?.[f.key] || ASSET_FIELD_SAMPLE_VALUES[f.key] || '—'}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
