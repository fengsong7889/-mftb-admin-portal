/**
 * 迭代排期 —— 项目经理 / 技术负责人的容量视图
 *
 * 设计口径：排期不是把需求塞进某个日期，而是「产能 vs 已排工时」的对比。
 * 因此每行直接给出产能、已排任务工时与负载率，超载标红，避免拍脑袋承诺。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Dropdown, Modal, Progress, Space, Table, Tag, Tooltip, message } from 'antd'
import type { MenuProps, TableColumnsType } from 'antd'
import {
  AlertOutlined,
  FieldTimeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import dayjs from 'dayjs'
import StatCards from '../../components/StatCards'
import { useAuth } from '../../contexts/AuthContext'
import { fetchIterations, updateIterationStatus, type RdmIterationItem } from '../../api/rdm'
import {
  RDM_ITERATION_STATUS,
  RDM_ITERATION_STATUS_COLOR,
  RDM_ITERATION_STATUS_LABEL,
  RDM_ITERATION_TYPE,
  RDM_ITERATION_TYPE_COLOR,
  RDM_ITERATION_TYPE_LABEL,
  type RdmIterationStatus,
  type RdmIterationType,
} from '../../constants/rdm'
import './index.css'

/** 负载率：已排工时 / 产能，无产能时视为 0（不参与超载判断） */
function loadRate(row: RdmIterationItem): number {
  if (!row.capacityHours || row.capacityHours <= 0) return 0
  return Math.round(((row.taskHours ?? 0) / row.capacityHours) * 100)
}

/**
 * 列元数据（§E.3）：key 与 i18n 键的单一来源，表头与列配置抽屉共用同一份，
 * 避免两处各写一次导致抽屉里的名字和表头不一致。
 * <p>titleKey 存字符串而不在此处调 t()：模块顶层常量求值早于 i18n 初始化（见 constants/rdm.ts 同构问题）。
 * <p>导出仅供回归测试钉住“表头标题与列配置同源 + 双语键齐备”，页面自身不依赖外部改写。
 */
// eslint-disable-next-line react-refresh/only-export-components
export const COLUMN_META = [
  { key: 'name', titleKey: 'rdm.iteration.colName' },
  { key: 'iterationType', titleKey: 'rdm.iteration.colType' },
  { key: 'projectName', titleKey: 'rdm.iteration.colProject' },
  { key: 'startDate', titleKey: 'rdm.iteration.colStartDate' },
  { key: 'endDate', titleKey: 'rdm.iteration.colEndDate' },
  { key: 'duration', titleKey: 'rdm.iteration.colDuration' },
  { key: 'status', titleKey: 'rdm.iteration.colStatus' },
  { key: 'ownerName', titleKey: 'rdm.iteration.colOwner' },
  { key: 'reqCount', titleKey: 'rdm.iteration.colReqCount' },
  { key: 'taskCount', titleKey: 'rdm.iteration.colTaskCount' },
  { key: 'capacity', titleKey: 'rdm.iteration.colCapacity' },
  { key: 'remark', titleKey: 'rdm.iteration.colRemark' },
  { key: 'action', titleKey: 'common.colAction' },
] as const

export default function IterationPlan() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const [rows, setRows] = useState<RdmIterationItem[]>([])
  const [loading, setLoading] = useState(true)
  // 菜单收敛后「產品需求處理」已退役，它的 edit 平移到需求清单；仍查退役 key 会让有编辑权的人也按不动
  const canEdit = hasPermission('rdm-delivery-iteration:edit') || hasPermission('rdm-requirement:edit')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchIterations()
      // 进行中的迭代优先，其次按开始日期倒序（最近的排期先看）
      setRows([...list].sort((a, b) => {
        const rank = (i: RdmIterationItem) => (i.status === RDM_ITERATION_STATUS.ACTIVE ? 0 : i.status === RDM_ITERATION_STATUS.PLANNING ? 1 : 2)
        const diff = rank(a) - rank(b)
        return diff !== 0 ? diff : (b.startDate ?? '').localeCompare(a.startDate ?? '')
      }))
    } catch {
      message.error('迭代載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter(r => r.status === RDM_ITERATION_STATUS.ACTIVE).length,
    planning: rows.filter(r => r.status === RDM_ITERATION_STATUS.PLANNING).length,
    overloaded: rows.filter(r => loadRate(r) > 100).length,
    reqs: rows.reduce((s, r) => s + (r.reqCount ?? 0), 0),
    hours: rows.reduce((s, r) => s + (r.taskHours ?? 0), 0),
  }), [rows])

  /** 目标状态的影响说明：写进二次确认框，让用户在点下去之前就知道会锁住什么 */
  const statusImpact = (next: RdmIterationStatus): string => {
    if (next === RDM_ITERATION_STATUS.CLOSED) return t('rdm.iteration.statusImpactClosed')
    if (next === RDM_ITERATION_STATUS.ACTIVE) return t('rdm.iteration.statusImpactActive')
    return t('rdm.iteration.statusImpactPlanned')
  }

  /**
   * 列表直改状态：下拉只给「不是当前值」的目标态，选定后按 §B.3 走二次确认再调接口。
   * <p>不跳编辑表单：改一个状态要填完整张表单（名称/起止/产能）是纯摩擦，
   * 而只回写状态这一个字段也顺手避开了拿列表旧数据覆盖别人的编辑。
   */
  const handleChangeStatus = (row: RdmIterationItem, next: RdmIterationStatus) => {
    const current = (row.status ?? RDM_ITERATION_STATUS.PLANNING) as RdmIterationStatus
    if (current === next) return
    Modal.confirm({
      title: t('rdm.iteration.changeStatusTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('rdm.iteration.confirmIter')}</span><b>{row.name}（{row.code}）</b></div>
          <div className="confirm-info-row"><span>{t('rdm.iteration.confirmCurrentStatus')}</span><b>{RDM_ITERATION_STATUS_LABEL[current]}</b></div>
          <div className="confirm-info-row"><span>{t('rdm.iteration.confirmNextStatus')}</span><b>{RDM_ITERATION_STATUS_LABEL[next]}</b></div>
          <div className="confirm-info-row"><span>{t('rdm.iteration.confirmImpact')}</span><b>{statusImpact(next)}</b></div>
        </div>
      ),
      okText: t('rdm.iteration.confirmOk'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await updateIterationStatus(row.id, next)
          message.success(t('rdm.iteration.statusUpdated'))
          // 重取列表：状态同时决定卡片口径与排序（进行中优先），本地改写会两头不一致
          await load()
        } catch {
          // request.ts 已统一弹后端失败原因，这里不再双弹
        }
      },
    })
  }

  /** 列配置面板的可选列（标题与表头同源，随语言切换重新取词） */
  const columnMeta = useMemo(() => COLUMN_META.map(m => ({ key: m.key, title: t(m.titleKey) })), [t])

  const columns: TableColumnsType<RdmIterationItem> = [
    {
      title: t('rdm.iteration.colName'), dataIndex: 'name', key: 'name', width: 220,
      render: (v: string, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <div style={{ color: '#262626', fontWeight: 500 }}>{v}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{r.code}</div>
        </div>
      ),
    },
    {
      title: t('rdm.iteration.colType'), dataIndex: 'iterationType', key: 'iterationType', width: 100,
      render: (v?: string) => {
        // 历史数据可能没有类型，统一按常规迭代展示
        const key = (v ?? RDM_ITERATION_TYPE.SPRINT) as RdmIterationType
        const color = RDM_ITERATION_TYPE_COLOR[key] ?? '#8C8C8C'
        return <Tag style={{ margin: 0, color, borderColor: `${color}66`, background: `${color}12` }}>{RDM_ITERATION_TYPE_LABEL[key] ?? v ?? '-'}</Tag>
      },
    },
    {
      /** 归属体系改造：迭代挂项目后才能按项目统计「上了哪些迭代」；未挂行警示，引导管理员补挂 */
      title: t('rdm.iteration.colProject'), dataIndex: 'projectName', key: 'projectName', width: 180,
      render: (v: string | null | undefined, r) => {
        if (r.projectId != null) {
          return (
            <a style={{ color: '#2F54EB' }} onClick={() => navigate(`/rdm-project-detail?id=${r.projectId}`)}>
              {v ?? `項目 #${r.projectId}`}
            </a>
          )
        }
        // hotfix 允许不挂项目（跨项目平台级热修），不算异常；其余类型未挂是存量待补
        const isHotfix = (r.iterationType ?? RDM_ITERATION_TYPE.SPRINT) === RDM_ITERATION_TYPE.HOTFIX
        return isHotfix
          ? <span style={{ color: '#8C8C8C', fontSize: 12 }}>-</span>
          : <Tag color="warning" style={{ margin: 0 }}>{t('rdm.iteration.noProject')}</Tag>
      },
    },
    {
      title: t('rdm.iteration.colStartDate'), dataIndex: 'startDate', key: 'startDate', width: 110,
      render: (v?: string | null) => v ?? '-',
    },
    {
      title: t('rdm.iteration.colEndDate'), dataIndex: 'endDate', key: 'endDate', width: 110,
      render: (v?: string | null) => v ?? '-',
    },
    {
      /** 迭代周期天数：拆起止后单独成列，避免旧版把天数黏在日期后面被读成状态数字 */
      title: t('rdm.iteration.colDuration'), key: 'duration', width: 80,
      render: (_, r) => {
        const days = r.startDate && r.endDate ? dayjs(r.endDate).diff(dayjs(r.startDate), 'day') + 1 : 0
        return days > 0
          ? <span style={{ color: '#595959' }}>{t('rdm.iteration.durationDays', { days })}</span>
          : <span style={{ color: '#8C8C8C' }}>-</span>
      },
    },
    {
      title: t('rdm.iteration.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (v?: string) => (
        <Tag color={RDM_ITERATION_STATUS_COLOR[(v ?? RDM_ITERATION_STATUS.PLANNING) as RdmIterationStatus] ?? 'default'} style={{ margin: 0 }}>
          {RDM_ITERATION_STATUS_LABEL[(v ?? RDM_ITERATION_STATUS.PLANNING) as RdmIterationStatus] ?? v}
        </Tag>
      ),
    },
    { title: t('rdm.iteration.colOwner'), dataIndex: 'ownerName', key: 'ownerName', width: 110, render: (v?: string | null) => v ?? '-' },
    { title: t('rdm.iteration.colReqCount'), dataIndex: 'reqCount', key: 'reqCount', width: 90, render: (v?: number) => v ?? 0 },
    { title: t('rdm.iteration.colTaskCount'), dataIndex: 'taskCount', key: 'taskCount', width: 90, render: (v?: number) => v ?? 0 },
    {
      title: t('rdm.iteration.colCapacity'), key: 'capacity', width: 220,
      render: (_, r) => {
        const rate = loadRate(r)
        const over = rate > 100
        return (
          <Space size={8}>
            <Progress
              percent={Math.min(rate, 100)}
              size="small"
              status={over ? 'exception' : rate >= 85 ? 'active' : 'normal'}
              strokeColor={over ? '#FF4D4F' : rate >= 85 ? '#FA8C16' : '#52C41A'}
              style={{ width: 96 }}
            />
            <span style={{ fontSize: 12, color: over ? '#CF1322' : '#595959' }}>
              {(r.taskHours ?? 0).toFixed(0)} / {r.capacityHours ?? 0} h
            </span>
            {over && (
              <Tooltip title={`已排工時超出產能 ${rate - 100}%，建議順延低優需求或補充人力`}>
                <Tag color="error" icon={<AlertOutlined />} style={{ margin: 0 }}>超載</Tag>
              </Tooltip>
            )}
          </Space>
        )
      },
    },
    {
      title: t('rdm.iteration.colRemark'), dataIndex: 'remark', key: 'remark', ellipsis: true, render: (v?: string | null) => v ?? '-'
    },
    {
      title: t('common.colAction'), key: 'action', width: 160, fixed: 'right',
      /** §B.9 操作列纯文字 + 竖线分隔：詳情→編輯→其他动作，状态直改不藏图标按钮 */
      render: (_, r) => {
        if (!canEdit) return <span style={{ color: '#8C8C8C', fontSize: 12 }}>{t('rdm.iteration.viewOnly')}</span>
        const current = (r.status ?? RDM_ITERATION_STATUS.PLANNING) as RdmIterationStatus
        const items: MenuProps['items'] = Object.values(RDM_ITERATION_STATUS)
          .filter(s => s !== current)
          .map(s => ({ key: s, label: RDM_ITERATION_STATUS_LABEL[s] }))
        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            <Button type="link" size="small" onClick={() => navigate(`/rdm-iteration-form?id=${r.id}`)}>{t('common.edit')}</Button>
            <Dropdown
              menu={{ items, onClick: ({ key }) => handleChangeStatus(r, key as RdmIterationStatus) }}
              trigger={['click']}
              placement="bottomRight"
            >
              <Button type="link" size="small">{t('rdm.iteration.changeStatus')}</Button>
            </Dropdown>
          </Space>
        )
      },
    },
  ]

  /**
   * 列配置（§E.3）。
   * <p>注意 locked 只能写在第三个参数（defaultConfig）：hook 从 allColumns 里不读 locked，
   * 写在第二参数会既报错又静默失效。
   * <p>storageKey 升到 -v3：归属体系改造新增「所属项目」列，旧存档没有该列会被 hook
   * 当成已删除列抖掉；沿用全站既有惯例（asset-list-v2 / rdm-requirement-v2）换 key 强制重排，
   * 不去改共享 hook 加版本号——那会把所有列表页的存档行为一起拖进来。
   */
  const { configComponent, applyConfig } = useColumnConfig('rdm-iteration-plan-v3', columnMeta, [
    { key: 'name', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  return (
    <div className="content-area">
      {/* 統計卡必須在操作區上方（§E.8）：先給口徑數字，再給動作入口 */}
      <div style={{ marginBottom: 16 }}>
        <StatCards
          animationKey="iteration"
          items={[
            { key: 'total', icon: <FieldTimeOutlined />, value: stats.total, label: '迭代總數', color: 'info' },
            { key: 'active', icon: <FieldTimeOutlined />, value: stats.active, label: '進行中', color: 'brand' },
            { key: 'planning', icon: <FieldTimeOutlined />, value: stats.planning, label: '規劃中', color: 'system' },
            { key: 'over', icon: <AlertOutlined />, value: stats.overloaded, label: '超載迭代', color: 'system' },
            { key: 'req', icon: <FieldTimeOutlined />, value: stats.reqs, label: '已排需求', color: 'success' },
            { key: 'hours', icon: <FieldTimeOutlined />, value: Number(stats.hours.toFixed(1)), decimals: 1, suffix: ' h', label: '已排工時', color: 'info' },
          ]}
        />
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Tag icon={<FieldTimeOutlined />} color="orange" style={{ height: 32, display: 'inline-flex', alignItems: 'center', padding: '0 12px', borderRadius: 6 }}>
            迭代產能用於「需求排期 → 任務工時」對賬，超載行請在排期前先處理
          </Tag>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button onClick={() => navigate('/rdm-delivery')}>返回交付工作台</Button>
        </div>
        <div className="action-section-right">
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rdm-iteration-form')}>新增迭代</Button>
          )}
          {configComponent}
        </div>
      </div>

      <Table<RdmIterationItem>
        className="nowrap-table"
        rowKey="id"
        loading={loading}
        columns={applyConfig(columns) as TableColumnsType<RdmIterationItem>}
        dataSource={rows}
        scroll={{ x: 1860 }}
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: t => `共 ${t} 條`,
        }}
      />
    </div>
  )
}
