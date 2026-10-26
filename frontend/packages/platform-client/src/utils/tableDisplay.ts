import type { TFunction } from 'i18next'
import type { TablePaginationConfig } from 'antd'

/**
 * 全站列表页统一分页配置（对齐 `.qoder/rules/frontend-ui-design-spec.md` §E.4）。
 * <p>为什么抽出来：AI 智能中心 9 个列表页里 6 个写 `pagination={false}`（数据一多直接撑爆页面），
 * 2 个用 20 條/頁，没有一个页面的 `showTotal` 走 i18n；散着写就会继续漂。
 * 统一从这里取，页面只给总数与（可选）受控分页参数。
 *
 * @param t i18n 翻译函数（`common.total` 模板是 `共 {{count}} 條`，变量名必须是 count）
 * @param total 总条数（前端分页时传 dataSource.length，服务端分页时传后端 total）
 */
export function tablePagination(t: TFunction, total?: number): TablePaginationConfig {
  return {
    pageSize: PAGE_SIZE,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    showTotal: (count: number) => t('common.total', { count }),
    ...(total !== undefined ? { total } : {}),
  }
}

/** 全站默认每页条数（与 §E.4 示例一致） */
export const PAGE_SIZE = 10

/** 可选每页条数档位 */
export const PAGE_SIZE_OPTIONS = ['10', '20', '50', '100']

/**
 * 金额显示小数位：AI 单次问答费用常在 0.001~0.01 元量级，固定 2 位会把真实消耗显示成 ¥0.00（看起来像免费）。
 * <1 元时自适应到 4 位，≥ 1 元仍用 2 位。
 */
export function costDecimals(amount: number | null | undefined): number {
  const value = Number(amount ?? 0)
  if (!Number.isFinite(value)) return 2
  return Math.abs(value) > 0 && Math.abs(value) < 1 ? 4 : 2
}

/**
 * 把毫秒时间戳/后端 epoch 渲染成可读时间。
 * <p>后端 Jackson 把 LocalDateTime 序列化成 Unix 毫秒，页面直接 `{v || '-'}` 会把
 * `1790183892000` 原样印在「最後更新時間」列上（AI 操作授權页实测）。
 * 空值返回占位符，0/undefined 都走同一分支，避免 `0 || '-'` 这种把 epoch 0 当空值。
 */
export function formatEpochOrDash(value: string | number | null | undefined, placeholder = '--'): string {
  if (value === null || value === undefined || value === '') return placeholder
  const ts = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(ts) || ts <= 0) return String(value)
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
