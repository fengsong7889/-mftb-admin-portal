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
import { Button, Input, Modal, Select, Space, Table, Tabs, Tag, TreeSelect, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import StatusSwitch from '../components/StatusSwitch'
import AdmitPolicyPanel from './AdmitPolicyPanel'
import { deleteRoutingRule, fetchProductOptions, fetchRoutingRules, saveRoutingRule, type RdmProductOption, type RdmRoutingRow } from '../../../api/rdm'
import { fetchDepartments } from '../../../api/department'
import { buildDeptTree, type DeptNode } from '../../Attendance/deptTree'
import { RDM_REQ_TYPE_LABEL } from '../../../constants/rdm'
import { PORTAL_SYSTEM_ICONS } from '../../../constants/portalSystems'
import { keyToPath } from '../../../constants/menuDataSource'
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
  const txt = useCallback<Txt>((key, original, options) => t(key, { defaultValue: original, ...options }), [t])
  const [rows, setRows] = useState<RdmRoutingRow[]>([])
  const [pmOptions, setPmOptions] = useState<RdmProductOption[]>([])
  const [deptTree, setDeptTree] = useState<DeptNode[]>([])
  const [loading, setLoading] = useState(true)

  // 部门树单独加载：它只服务「按提出部门」一个匹配维度，失败不得拖垮整个分发矩阵
  useEffect(() => {
    fetchDepartments()
      .then(list => setDeptTree(buildDeptTree(list ?? [])))
      .catch(() => setDeptTree([]))
  }, [])

  /** 匹配對象候选（非部门维度）：值与标签都取后端比对用的真值 */
  const scopeValueOptions = (scopeType: string): { value: string; label: string }[] => {
    switch (scopeType) {
      case 'SYSTEM':
        return Object.keys(PORTAL_SYSTEM_ICONS).map(code => ({ value: code, label: code }))
      case 'MENU':
        return Object.keys(keyToPath).map(key => ({ value: key, label: key }))
      case 'TYPE':
        return Object.entries(RDM_REQ_TYPE_LABEL).map(([value, label]) => ({ value, label }))
      default:
        return []
    }
  }

  useEffect(() => {
    Promise.all([fetchRoutingRules(), fetchProductOptions()])
      .then(([rules, pms]) => {
        setRows(rules)
        setPmOptions(pms)
      })
      .catch(() => message.error('分發矩陣載入失敗'))
      .finally(() => setLoading(false))
  }, [])

  const updateRow = (id: number, patch: Partial<RdmRoutingRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  const handleAdd = () => {
    setRows(prev => [...prev, {
      // 本地 rowKey 用时间戳，但必须同时标 isNew：提交时要把它换成 null，
      // 否则后端按「带 id 的更新」处理，影响 0 行却仍回「已保存」
      id: Date.now(),
      isNew: true,
      scopeType: 'SYSTEM',
      scopeValue: '',
      scopeName: '',
      pmUserId: pmOptions[0]?.userId ?? 0,
      pmName: pmOptions[0]?.name ?? '',
      loadCapacity: 8,
      activeCount: 0,
      priority: prev.length + 1,
      enabled: true,
    }])
  }

  /** 提交行数据给后端（新增送 null）；返回最新列表并刷新表格 */
  const persistRow = async (row: RdmRoutingRow, patch?: Partial<RdmRoutingRow>) => {
    const merged = { ...row, ...patch }
    /*
     * 校验必须 null-safe：旧写法直接 row.scopeName.trim()，后端返回的行上该字段为 null 时
     * 会抛 TypeError，异步 handler 的 rejection 没人接 → 点「保存」既无请求也无提示（静默失败）。
     */
    const scopeValue = (merged.scopeValue ?? '').trim()
    const scopeName = (merged.scopeName ?? '').trim()
    if (!scopeValue) {
      message.warning(txt('rdm.routing.scopeValueRequired', '請選擇匹配對象（後端按編碼精確匹配，不能只填顯示名）'))
      return false
    }
    if (!merged.pmUserId) {
      message.warning(txt('rdm.routing.pmRequired', '請選擇負責產品經理'))
      return false
    }
    const pm = pmOptions.find(p => p.userId === merged.pmUserId)
    try {
      const { isNew: _isNew, ...rest } = merged
      const next = await saveRoutingRule({
        ...rest,
        // 新增行必须送 null（而不是本地临时 id），后端才会走 INSERT
        id: merged.isNew ? null : merged.id,
        scopeValue,
        scopeName: scopeName || pm?.name || scopeValue,
        pmName: pm?.name ?? merged.pmName,
      })
      setRows(next)
      return true
    } catch {
      // request.ts 已统一弹后端失败原因；这里只兜住异常，不让它变成无人接的 rejection
      return false
    }
  }

  const handleSave = async (row: RdmRoutingRow) => {
    if (await persistRow(row)) message.success(txt('rdm.routing.rowSaved', '已保存，下次分配即刻生效'))
  }

  /**
   * 启停开关直接落库（§B.8：确认后执行 API 并刷新）。
   * 旧写法只 updateRow 改本地 state，用户以为开关就是生效状态，必须再点一次「保存」；
   * 忘了点就出现「界面显示停用、后端仍在派单」的假状态。
   */
  const handleToggle = async (row: RdmRoutingRow, next: boolean) => {
    const ok = await persistRow(row, { enabled: next })
    if (!ok) throw new Error('toggle-failed')
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

  const columns: TableColumnsType<RdmRoutingRow> = [
    {
      title: '優先級', dataIndex: 'priority', key: 'priority', width: 90,
      render: (v: number, r) => <Input type="number" size="small" value={v} onChange={e => updateRow(r.id, { priority: Number(e.target.value) })} />,
    },
    {
      title: '匹配範圍', key: 'scopeType', width: 130,
      render: (_, r) => (
        <Select
          size="small"
          style={{ width: 110 }}
          value={r.scopeType}
          // 换维度时旧的匹配對象不再有意义（部门 id 当系统码用会静默匹不上），一并清空
          onChange={v => updateRow(r.id, { scopeType: v, scopeValue: '', scopeName: '' })}
          options={SCOPE_OPTIONS}
        />
      ),
    },
    {
      title: '匹配對象', key: 'scopeName', width: 220,
      render: (_, r) => (
        r.scopeType === 'DEPT' ? (
          <TreeSelect
            size="small"
            style={{ width: 200 }}
            treeData={deptTree}
            value={r.scopeValue ? Number(r.scopeValue) : undefined}
            showSearch
            treeNodeFilterProp="title"
            placeholder="選擇部門"
            onChange={(value, labelList) => updateRow(r.id, {
              scopeValue: value == null ? '' : String(value),
              scopeName: String(labelList?.[0] ?? ''),
            })}
          />
        ) : (
          <Select
            size="small"
            style={{ width: 200 }}
            showSearch
            optionFilterProp="label"
            value={r.scopeValue || undefined}
            placeholder="選擇匹配對象"
            options={scopeValueOptions(r.scopeType)}
            onChange={v => updateRow(r.id, {
              scopeValue: v,
              scopeName: scopeValueOptions(r.scopeType).find(o => o.value === v)?.label ?? v,
            })}
          />
        )
      ),
    },
    {
      title: '負責產品經理', key: 'pm', width: 170,
      render: (_, r) => (
        <Select
          size="small"
          style={{ width: 150 }}
          value={r.pmUserId}
          onChange={v => updateRow(r.id, { pmUserId: v })}
          options={pmOptions.map(pm => ({ value: pm.userId, label: pm.name }))}
        />
      ),
    },
    {
      title: '備用人', key: 'backup', width: 150,
      render: (_, r) => (
        <Select
          size="small"
          style={{ width: 130 }}
          allowClear
          placeholder="主責休假時接手"
          value={r.backupPmName}
          onChange={v => updateRow(r.id, { backupPmName: v ?? undefined })}
          options={pmOptions.map(pm => ({ value: pm.name, label: pm.name }))}
        />
      ),
    },
    {
      title: '容量 / 在途', key: 'load', width: 120,
      render: (_, r) => (
        <Space size={4}>
          <Input
            type="number"
            size="small"
            style={{ width: 60 }}
            value={r.loadCapacity}
            onChange={e => updateRow(r.id, { loadCapacity: Number(e.target.value) })}
          />
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
          <Button type="link" size="small" onClick={() => handleSave(r)}>保存</Button>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增規則</Button>
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
