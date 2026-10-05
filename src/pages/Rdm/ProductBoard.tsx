/**
 * 产品需求处理 —— 产品经理视角（看板 + 列表双视图）
 *
 * 看板按生命周期折叠为 5 列，卡片直接暴露「逾期/无主/待受理」信号，
 * 让 PM 一进页面就知道先处理什么；点击卡片进入详情执行流转动作。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Segmented, Select, Space, Spin, Tag, Tooltip, message } from 'antd'
import {
  AlertOutlined,
  FileAddOutlined,
  ReloadOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import StatCards from '../../components/StatCards'
import RequirementStageBar from './components/RequirementStageBar'
import RequirementList from './RequirementList'
import { PriorityTag, StatusTag, TypeTag } from './components/Tags'
import { fetchRequirementPage, type RdmRequirementRow } from '../../api/rdm'
import {
  RDM_BOARD_COLUMNS,
  RDM_SCOPE,
  RDM_STATUS,
  type RdmScope,
  type RdmStatus,
} from '../../constants/rdm'
import './index.css'

type ViewMode = 'kanban' | 'list'

export default function ProductBoard() {
  const navigate = useNavigate()
  const [view, setView] = useState<ViewMode>('kanban')
  const [scope, setScope] = useState<RdmScope>(RDM_SCOPE.PRODUCT)
  const [rows, setRows] = useState<RdmRequirementRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchRequirementPage({ scope, size: 100, page: 1 })
      setRows(res.records ?? [])
    } catch {
      message.error('需求載入失敗')
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => {
    load()
  }, [load])

  /** 按看板列分组 */
  const grouped = useMemo(() => RDM_BOARD_COLUMNS.map(col => ({
    ...col,
    items: rows.filter(r => col.statuses.includes(r.status as RdmStatus)),
  })), [rows])

  const stats = useMemo(() => {
    const overdue = rows.filter(r => r.overdueFlag).length
    const toAccept = rows.filter(r => r.status === RDM_STATUS.UAT_PENDING).length
    const pool = rows.filter(r => r.status === RDM_STATUS.POOL).length
    return { total: rows.length, overdue, toAccept, pool }
  }, [rows])

  return (
    <div className="content-area">
      {/* ── 顶部：视图切换 + 范围筛选 ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 16,
      }}>
        <Segmented
          value={view}
          onChange={v => setView(v as ViewMode)}
          options={[
            { label: '看板視圖', value: 'kanban' },
            { label: '列表視圖', value: 'list' },
          ]}
        />
        <Space size={8} wrap>
          <Select
            style={{ width: 200 }}
            value={scope}
            onChange={v => setScope(v as RdmScope)}
            options={[
              { value: RDM_SCOPE.PRODUCT, label: '我負責的產品需求' },
              { value: RDM_SCOPE.POOL, label: '需求池·待分配' },
              { value: RDM_SCOPE.DELIVERY, label: '研發交付中' },
              { value: RDM_SCOPE.ACCEPTANCE, label: '待業務驗收' },
              { value: RDM_SCOPE.ALL, label: '全部需求' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button type="primary" icon={<FileAddOutlined />} onClick={() => navigate('/rdm-submit')}>我要提需求</Button>
        </Space>
      </div>

      <div style={{ marginBottom: 16 }}>
        <StatCards
          items={[
            { key: 'total', icon: <FileAddOutlined />, value: stats.total, label: '範圍內需求', color: 'info' },
            { key: 'pool', icon: <UserAddOutlined />, value: stats.pool, label: '待分配', color: 'brand' },
            { key: 'overdue', icon: <AlertOutlined />, value: stats.overdue, label: '逾期需求', color: 'system' },
            { key: 'accept', icon: <AlertOutlined />, value: stats.toAccept, label: '待驗收', color: 'success' },
          ]}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : view === 'list' ? (
        <RequirementList scope={scope} switchable={false} />
      ) : (
        <div className="rdm-board">
          {grouped.map(col => (
            <div key={col.key} className="rdm-board-col">
              <div className="rdm-board-col-head">
                <span>{col.label}</span>
                <Space size={4}>
                  {col.items.some(r => r.overdueFlag) && <Tag color="error" style={{ margin: 0 }}>逾期</Tag>}
                  <span style={{ color: '#8C8C8C', fontWeight: 400 }}>{col.items.length}</span>
                </Space>
              </div>
              <div className="rdm-board-col-body">
                {col.items.map(item => (
                  <Tooltip
                    key={item.id}
                    title={`點擊查看詳情並處理：${item.currentHandler ?? ''}`}
                    placement="top"
                  >
                    <div
                      className={`rdm-board-card ${item.overdueFlag ? 'overdue' : ''}`}
                      onClick={() => navigate(`/rdm-detail?id=${item.id}`)}
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
        </div>
      )}
    </div>
  )
}
