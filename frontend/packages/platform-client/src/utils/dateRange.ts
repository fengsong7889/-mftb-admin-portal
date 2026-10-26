import type { Dayjs } from 'dayjs'

/** RangePicker 表单值 */
export type DateRangeValue = [Dayjs | null, Dayjs | null] | null

/** 查询参数使用的日期格式 */
const QUERY_DATE_FORMAT = 'YYYY-MM-DD'

/** 日期范围起止（YYYY-MM-DD，未选择时为 undefined） */
export interface DateRangeParams {
  from?: string
  to?: string
}

/** RangePicker 值转换为查询参数的起止日期字符串 */
export function toDateRangeParams(value?: DateRangeValue): DateRangeParams {
  return {
    from: value?.[0]?.format(QUERY_DATE_FORMAT),
    to: value?.[1]?.format(QUERY_DATE_FORMAT),
  }
}
