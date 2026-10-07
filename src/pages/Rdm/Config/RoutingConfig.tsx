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
 */
import { useEffect, useState } from 'react'
import { Button, Input, Select, Space, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import StatusSwitch from '../components/StatusSwitch'
import AdmitPolicyPanel from './AdmitPolicyPanel'
import { fetchProductOptions, fetchRoutingRules, saveRoutingRule, type RdmProductOption, type RdmRoutingRow } from '../../../api/rdm'
import '../index.css'

/** 匹配范围类型 */
const SCOPE_OPTIONS = [
  { value: 'SYSTEM', label: '按系統' },
  { value: 'MENU', label: '按菜單' },
  { value: 'DEPT', label: '按提出部門' },
  { value: 'TYPE', label: '按需求類型' },
]

/** 分发矩阵（受理侧）：本文件只铺表格，准入侧见 AdmitPolicyPanel */
function RoutingMatrix() {
  const [rows, setRows] = useState<RdmRoutingRow[]>([])
  const [pmOptions, setPmOptions] = useState<RdmProductOption[]>([])
  const [loading, setLoading] = useState(true)

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
      id: Date.now(),
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

  const handleSave = async (row: RdmRoutingRow) => {
    if (!row.scopeName.trim() || !row.pmName) {
      message.warning('請填寫匹配對象與產品經理')
      return
    }
    const pm = pmOptions.find(p => p.userId === row.pmUserId)
    const next = await saveRoutingRule({ ...row, pmName: pm?.name ?? row.pmName })
    setRows(next)
    message.success('已保存，下次分配即刻生效')
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
          onChange={v => updateRow(r.id, { scopeType: v })}
          options={SCOPE_OPTIONS}
        />
      ),
    },
    {
      title: '匹配對象', key: 'scopeName', width: 190,
      render: (_, r) => <Input size="small" value={r.scopeName} placeholder="例：廣告推薦系統" onChange={e => updateRow(r.id, { scopeName: e.target.value })} />,
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
          onConfirm={(next: boolean) => updateRow(r.id, { enabled: next })}
        />
      ),
    },
    {
      title: '操作', key: 'action', width: 130, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<SaveOutlined />} onClick={() => handleSave(r)}>保存</Button>
          <span className="action-split">|</span>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))}
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
          { key: 'admit', label: '准入策略（要不要先審批）', children: <AdmitPolicyPanel /> },
        ]}
      />
    </div>
  )
}
