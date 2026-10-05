/**
 * 需求看板视图 —— 按生命周期折叠为 5 列的扫视视图
 *
 * 由「產品需求處理」迁入，作为需求清单的第二个视图形态：
 * 表格视图负责精查与批量操作，看板视图负责「一眼看出堆在哪个环节」。
 * 数据由父组件（需求清单）统一获取，本组件不自行请求，保证两个视图
 * 看到的是同一份筛选结果 —— 之前看板有自己一套 fetch 且忽略搜索条件，
 * 切视图等于换了个查询，是这两个页面本质重复却表现不一致的根因。
 */
import { useMemo } from 'react'
import { Space, Tag, Tooltip } from 'antd'
import { AlertOutlined } from '@ant-design/icons'
import RequirementStageBar from './RequirementStageBar'
import { PriorityTag, StatusTag, TypeTag } from './Tags'
import { RDM_BOARD_COLUMNS, type RdmStatus } from '../../../constants/rdm'
import type { RdmRequirementRow } from '../../../api/rdm'
// 样式由承载页（需求清单）引入 index.css，本组件不重复引，与其他 components/ 下的组件一致

interface RequirementKanbanProps {
  rows: RdmRequirementRow[]
  /** 达到数量上限时的提示文案（看板不做翻页，必须告知截断） */
  limitHint?: string
  onOpen: (id: number) => void
}

export default function RequirementKanban({ rows, limitHint, onOpen }: RequirementKanbanProps) {
  /** 按看板列分组：一行只落一列，状态不在任何列里的行直接不显示（防止脏状态把卡片吞掉却看不见） */
  const grouped = useMemo(() => RDM_BOARD_COLUMNS.map(col => ({
    ...col,
    items: rows.filter(r => col.statuses.includes(r.status as RdmStatus)),
  })), [rows])

  const orphan = useMemo(() => {
    const known = new Set(RDM_BOARD_COLUMNS.flatMap(col => col.statuses as string[]))
    return rows.filter(r => !known.has(r.status))
  }, [rows])

  return (
    <div className="rdm-board">
      {grouped.map(col => (
        <div key={col.key} className="rdm-board-col">
          <div className="rdm-board-col-head">
            <span>{col.label}</span>
            <Space size={4}>
              {col.items.some(r => r.overdueFlag) && <Tag color="error" icon={<AlertOutlined />} style={{ margin: 0 }}>逾期</Tag>}
              <span style={{ color: '#8C8C8C', fontWeight: 400 }}>{col.items.length}</span>
            </Space>
          </div>
          <div className="rdm-board-col-body">
            {col.items.map(item => (
              <Tooltip
                key={item.id}
                title={`點擊查看詳情並處理：${item.currentHandler ?? '尚無處理人'}`}
                placement="top"
              >
                <div
                  className={`rdm-board-card ${item.overdueFlag ? 'overdue' : ''}`}
                  onClick={() => onOpen(item.id)}
                >
                  <div className="rdm-board-card-title">{item.title}</div>
                  <div className="rdm-board-card-meta">
                    <TypeTag reqType={item.reqType} />
                    <PriorityTag priority={item.priority} />
                    <StatusTag status={item.status} overdue={item.overdueFlag ?? false} />
                  </div>
                  <div className="rdm-board-card-meta" style={{ marginTop: 4 }}>
                    <span>{item.reqNo}</span>
                    <span>提出：{item.submitterName}</span>
                  </div>
                  <div className="rdm-board-card-meta" style={{ marginTop: 4 }}>
                    <span>處理人：{item.pmName ?? <span style={{ color: '#FF4D4F' }}>未分配</span>}</span>
                    {item.planReleaseDate && <span>計劃：{item.planReleaseDate}</span>}
                  </div>
                  <RequirementStageBar status={item.status} compact overdue={item.overdueFlag ?? false} />
                </div>
              </Tooltip>
            ))}
            {col.items.length === 0 && (
              <div style={{ textAlign: 'center', color: '#BFBFBF', fontSize: 12, padding: '18px 0' }}>
                無需求
              </div>
            )}
          </div>
        </div>
      ))}

      {/* 未归入任何看板列的状态：宁可显式暴露，也不要静默消失（否则数量对不上只能靠猜） */}
      {(orphan.length > 0 || limitHint) && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#8C8C8C' }}>
          {orphan.length > 0 && (
            <span style={{ color: '#D46B08' }}>
              另有 {orphan.length} 條需求的狀態未歸入看板列，請切換表格視圖查看。
            </span>
          )}
          {limitHint && <span style={{ marginLeft: orphan.length > 0 ? 12 : 0 }}>{limitHint}</span>}
        </div>
      )}
    </div>
  )
}
