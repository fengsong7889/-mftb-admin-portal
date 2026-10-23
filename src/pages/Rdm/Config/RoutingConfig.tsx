/**
 * 需求路由配置 —— 一条需求提交后的两个分叉都在这里配
 *
 * 两个 Tab 各管一个分叉，但它们是同一条判断链的上游与下游：
 * - 准入策略（要不要先审批）：按部门/角色/系统/类型决定这条需求是否先送上级或指定人；
 * - 分发矩阵（谁来受理）：按系统/菜单/部门/类型推荐或默认分配产品经理。
 *
 * 为什么合并到一页而不是拆两个菜单：两边用的是同一套匹配维度（部门/系统/类型），
 * 拆开后管理员要在两个地方对齐条件，很容易配成互相冲突的两套规则。
 * 采用行内编辑（新增行直接落到表格），不使用弹窗承载表单（AGENTS.md §9.1）。
 *
 * 匹配對象必须选「真值编码」而不是手填显示名：后端 RdmConfigService 按
 * scope_value 与 menuKey / systemCode / deptId / reqType 精确比对，只存显示名的规则永远匹配不上。
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Modal, Space, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import StatusSwitch from '../components/StatusSwitch'
import { rdmTableLocale } from '../components/tableLocale'
import AdmitPolicyPanel from './AdmitPolicyPanel'
import { deleteRoutingRule, fetchRoutingRules, saveRoutingRule, type RdmRoutingRow } from '../../../api/rdm'
import '../index.css'

/** 匹配范围类型 */
const SCOPE_OPTIONS = [
  { value: 'SYSTEM', label: '按系統' },
  { value: 'MENU', label: '按菜單' },
  { value: 'DEPT', label: '按提出部門' },
  { value: 'TYPE', label: '按需求類型' },
]

/**
 * 页面内文案取数器：统一走 `t(key, { defaultValue: 原繁體 })`，
 * key 没进语言包时繁体界面照常显示，不会退化成页面上出现原始 key。
 */
type Txt = (key: string, original: string, options?: Record<string, unknown>) => string

/** 分发矩阵（受理侧）：本文件只铺表格，准入侧见 AdmitPolicyPanel */
function RoutingMatrix() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const txt = useCallback<Txt>((key, original, options) => t(key, { defaultValue: original, ...options }), [t])
  const [rows, setRows] = useState<RdmRoutingRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRoutingRules()
      .then(setRows)
      .catch(() => message.error('分發矩陣載入失敗'))
      .finally(() => setLoading(false))
  }, [])

  /**
   * 启停开关直接落库（§B.8：确认后执行 API 并刷新）。
   * 行内编辑已迁到独立页，这里只保留启停这个单一动作。
   */
  const handleToggle = async (row: RdmRoutingRow, next: boolean) => {
    const { isNew: _isNew, ...rest } = row
    try {
      setRows(await saveRoutingRule({ ...rest, id: row.id, enabled: next }))
    } catch (err) {
      // 接口是 SILENT：把后端原因抛给 StatusSwitch 统一提示
      throw err instanceof Error ? err : new Error('保存失敗，請重試')
    }
  }

  /** 移除：未落库的新增行直接丢，已落库的行走服务端删除 + 二次确认 */
  const handleRemove = (row: RdmRoutingRow) => {
    if (row.isNew || row.id == null) {
      setRows(prev => prev.filter(x => x !== row))
      return
    }
    Modal.confirm({
      title: txt('rdm.routing.removeTitle', '確定要移除該分發規則嗎？'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{txt('rdm.routing.removeMatchLabel', '匹配：')}</span><b>{row.scopeName || row.scopeValue}</b></div>
          <div className="confirm-info-row"><span>{txt('rdm.routing.removePmLabel', '產品經理：')}</span><b>{row.pmName || txt('rdm.routing.removePmUnknown', '待指定')}</b></div>
          <div className="confirm-info-row"><span>影響：</span><b>{txt('rdm.routing.removeImpact', '移除後新需求不再按本條派單，已受理的需求不受影響')}</b></div>
        </div>
      ),
      okText: txt('rdm.routing.removeOk', '確認移除'),
      cancelText: txt('rdm.routing.cancel', '取消'),
      onOk: async () => {
        try {
          setRows(await deleteRoutingRule(row.id))
          message.success(txt('rdm.routing.removed', '已移除'))
        } catch {
          // request.ts 已弹后端原因，不再双弹（§G.4）
        }
      },
    })
  }

  const scopeLabel = (value: string) => SCOPE_OPTIONS.find(o => o.value === value)?.label ?? value

  const columns: TableColumnsType<RdmRoutingRow> = [
    {
      title: '優先級', dataIndex: 'priority', key: 'priority', width: 90,
    },
    {
      title: '匹配範圍', dataIndex: 'scopeType', key: 'scopeType', width: 130,
      render: (v: string) => scopeLabel(v),
    },
    {
      title: '匹配對象', key: 'scopeName', width: 240, ellipsis: true,
      render: (_, r) => <span title={r.scopeName || r.scopeValue}>{r.scopeName || r.scopeValue || '-'}</span>,
    },
    {
      title: '負責產品經理', dataIndex: 'pmName', key: 'pm', width: 160,
      render: (v?: string | null) => v || '-',
    },
    {
      title: '備用人', dataIndex: 'backupPmName', key: 'backup', width: 140,
      render: (v?: string | null) => v || '-',
    },
    {
      title: '容量 / 在途', key: 'load', width: 120,
      render: (_, r) => (
        <Space size={4}>
          <span>{r.loadCapacity}</span>
          <Tag color={r.activeCount >= r.loadCapacity ? 'error' : 'processing'} style={{ margin: 0 }}>
            {r.activeCount}
          </Tag>
        </Space>
      ),
    },
    {
      title: '啟用', key: 'enabled', width: 80,
      render: (_, r) => (
        <StatusSwitch
          checked={r.enabled}
          target={`${r.scopeName || r.scopeValue || '全局'} → ${r.pmName || '待指定產品'}`}
          onConfirm={(next: boolean) => handleToggle(r, next)}
        />
      ),
    },
    {
      title: '操作', key: 'action', width: 130, fixed: 'right',
      render: (_, r) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/rdm-config-routing-form?id=${r.id}`)}>編輯</Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => handleRemove(r)}
          >
            移除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div className="action-section">
        <div className="action-section-left">
          <Tag color="orange" style={{ height: 32, display: 'inline-flex', alignItems: 'center', borderRadius: 6 }}>
            命中順序：菜單 &gt; 系統 &gt; 部門 &gt; 類型，多條命中取優先級小者
          </Tag>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rdm-config-routing-form')}>新增規則</Button>
        </div>
      </div>

      <Table<RdmRoutingRow>
        className="nowrap-table"
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1180 }}
        locale={rdmTableLocale(loading, '還沒有配置分發規則，新增後新需求會按優先級推薦產品經理')}
      />
    </>
  )
}

/**
 * 页面容器：两个分叉各占一个 Tab。
 * <p>默认落在分发矩阵：它是现有管理员熟悉的那个「分發矩陣」菜单，
 * 准入策略是新增能力，不能一进来就把老习惯的落点据掉。
 */
export default function RoutingConfig() {
  return (
    <div className="content-area">
      <Tabs
        defaultActiveKey="routing"
        items={[
          { key: 'routing', label: '分發矩陣（誰來受理）', children: <RoutingMatrix /> },
          { key: 'admit', label: '準入策略（要不要先審批）', children: <AdmitPolicyPanel /> },
        ]}
      />
    </div>
  )
}
