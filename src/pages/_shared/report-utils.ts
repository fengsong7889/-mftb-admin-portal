/**
 * 報表頁面共享工具 —— HintReport 與 HotSearchReport 的公共邏輯
 */
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'

/* ──────────── 公共選項 ──────────── */

type TFn = (key: string, options?: Record<string, unknown>) => string

export const createTerminalOptions = (t: TFn) => [
  { label: t('common.all'), value: 'all' },
  { label: t('dict.terminal.app'), value: 'app' },
  { label: t('dict.terminal.wechatMini'), value: 'wechatMini' },
  { label: t('dict.terminal.mpayMini'), value: 'mpayMini' },
  { label: t('dict.terminal.wechatH5'), value: 'wechatH5' },
]

export const createRegionOptions = (t: TFn) => [
  { label: t('common.all'), value: 'all' },
  { label: t('dict.region.macau'), value: 'macau' },
  { label: t('dict.region.taipa'), value: 'taipa' },
]

export { brandOptions }

/* ──────────── 圖表公共配置 ──────────── */

export const trendAnimationConfig = {
  animation: {
    appear: {
      animation: 'path-in',
      duration: 1000,
    },
  },
  smooth: true,
  legend: { position: 'top' as const },
  tooltip: { showMarkers: false },
  point: { size: 3, shape: 'circle' },
}

export const pieLabelConfig = {
  type: 'outer' as const,
  content: '{name} {percentage}',
}

export const pieInteractions = [{ type: 'element-active' }]

export const columnLabelLayout = [
  { type: 'interval-adjust-position' },
  { type: 'interval-hide-overlap' },
  { type: 'adjust-color' },
]

/* ──────────── 表格分頁公共配置 ──────────── */

export const reportTablePagination = (total: number, t: TFn) => ({
  total,
  pageSize: 10,
  showTotal: (total: number) => t('common.total', { count: total }),
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  defaultPageSize: 10,
  showQuickJumper: true,
})

export const reportTableCommonProps = {
  size: 'middle' as const,
  bordered: false,
}
