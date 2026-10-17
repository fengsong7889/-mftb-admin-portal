import type { ColumnsType } from 'antd/es/table'

/** 「字段設置」面板需要的最小列元数据 */
export interface RdmColumnMeta {
  key: string
  title: string
}

/**
 * 从 antd columns 直接派生「字段設置」候选清单。
 *
 * 为什么不让每页再手写一份 key/title 数组：RDM 有 20+ 张表，手写清单一旦和真正的
 * columns 定义漂移，就会出现「设置里能勾选、表面上却没有那一列」（或反过来），
 * 而这种假选项比没有列配置更误导人。派生后两者天然同源，加一列就自动多一个候选。
 *
 * 跳过规则（宁可少给候选，也不要给出勾了没反应的）：
 * - 没有 key 的列（纯 render 列 / 选择列 / 展开列）；
 * - title 不是字符串的列（分组表头、图标+文字等，拿不到可读名称）。
 *
 * 注意 antd 的 `ColumnsType` 对 RecordType 是逆变的（render 入参方向），所以这里用
 * 泛型函数而不是固定 `ColumnsType<unknown>`，否则各页的具体行类型传不进来。
 */
export function deriveRdmColumnMeta<RecordType>(columns: ColumnsType<RecordType>): RdmColumnMeta[] {
  const out: RdmColumnMeta[] = []
  for (const col of columns) {
    const key = (col as { key?: unknown }).key
    const title = (col as { title?: unknown }).title
    if (typeof key !== 'string' || typeof title !== 'string') continue
    out.push({ key, title })
  }
  return out
}
