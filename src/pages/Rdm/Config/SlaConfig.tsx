/**
 * SLA 与逾期规则配置 —— 每个环节的标准时长、预警点、升级对象
 *
 * 这是「逾期风险」与「催办升级」的计算口径来源：
 * 时长按小时配置，剩余时间低于预警阈值先发提醒，超 SLA 则通知升级角色。
 */
import { useEffect, useState } from 'react'
import { Alert, Button, InputNumber, Select, Space, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { ClockCircleOutlined, SaveOutlined } from '@ant-design/icons'
import StatusSwitch from '../components/StatusSwitch'
import { fetchSlaConfigs, saveSlaConfig, type RdmSlaRow } from '../../../api/rdm'
import {
  RDM_PRIORITY_LABEL,
  type RdmPriority,
  RDM_ROLE_LABEL,
  RDM_STATUS_LABEL,
  type RdmRoleCode,
  type RdmStatus,
} from '../../../constants/rdm'
import '../index.css'

export default function SlaConfig() {
  const [rows, setRows] = useState<RdmSlaRow[]>([])
  const [loading, setLoading] = useState(true)
  /** 已改动未保存的状态码 */
  const [dirty, setDirty] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetchSlaConfigs()
      .then(setRows)
      .catch(() => message.error('SLA 載入失敗'))
      .finally(() => setLoading(false))
  }, [])

  const update = (statusCode: string, patch: Partial<RdmSlaRow>) => {
    setRows(prev => prev.map(r => r.statusCode === statusCode ? { ...r, ...patch } : r))
    setDirty(prev => ({ ...prev, [statusCode]: true }))
  }

  /** 保存一行（服务端校验预警阈值必须小于标准时效） */
  const handleSave = async (row: RdmSlaRow) => {
    try {
      const next = await saveSlaConfig(row)
      setRows(next)
      setDirty(prev => ({ ...prev, [row.statusCode]: false }))
      message.success('SLA 已保存，下一輪逾期掃描即按新口徑執行')
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : 'SLA 保存失敗')
    }
  }

  const columns: TableColumnsType<RdmSlaRow> = [
    {
      title: '環節', key: 'status', width: 150,
      render: (_, r) => <Tag color="orange" style={{ margin: 0 }}>{RDM_STATUS_LABEL[r.statusCode as RdmStatus] ?? r.statusLabel}</Tag>,
    },
    {
      title: '適用優先級', key: 'priority', width: 160,
      render: (_, r) => (
        <Select
          size="small"
          style={{ width: 140 }}
          allowClear
          placeholder="全部優先級"
          value={r.priority || undefined}
          onChange={v => update(r.statusCode, { priority: v ?? '' })}
          options={Object.entries(RDM_PRIORITY_LABEL).map(([value, label]) => ({ value, label }))}
        />
      ),
    },
    {
      title: '標準時效（小時）', key: 'slaHours', width: 150,
      render: (_, r) => (
        <InputNumber size="small" min={1} max={24 * 90} value={r.slaHours} onChange={v => update(r.statusCode, { slaHours: v ?? 0 })} style={{ width: 100 }} />
      ),
    },
    {
      title: '預警閾值（小時）', key: 'warnHours', width: 160,
      render: (_, r) => (
        <InputNumber size="small" min={1} max={24 * 90} value={r.warnHours} onChange={v => update(r.statusCode, { warnHours: v ?? 0 })} style={{ width: 100 }} />
      ),
    },
    {
      title: '逾期升級通知對象', key: 'escalate', width: 180,
      render: (_, r) => (
        <Select
          size="small"
          style={{ width: 160 }}
          value={r.escalateRole}
          onChange={v => update(r.statusCode, { escalateRole: v })}
          options={Object.entries(RDM_ROLE_LABEL).map(([value, label]) => ({ value, label }))}
        />
      ),
    },
    {
      title: '啟用', key: 'enabled', width: 90,
      render: (_, r) => (
        <StatusSwitch
          checked={r.enabled}
          target={`${r.statusLabel}${r.priority ? ` · ${RDM_PRIORITY_LABEL[r.priority as RdmPriority] ?? r.priority}` : ''}`}
          onConfirm={(next: boolean) => update(r.statusCode, { enabled: next })}
        />
      ),
    },
    {
      title: '效果預覽', key: 'preview', width: 200,
      render: (_, r) => (
        <Space size={4} style={{ fontSize: 12, color: '#8C8C8C' }}>
          <ClockCircleOutlined />
          {r.warnHours}h 後提醒處理人，{r.slaHours}h 未處理通知
          <b style={{ color: '#595959' }}>{RDM_ROLE_LABEL[r.escalateRole as RdmRoleCode] ?? r.escalateRole}</b>
        </Space>
      ),
    },
    {
      title: '操作', key: 'action', width: 110, fixed: 'right',
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          icon={<SaveOutlined />}
          disabled={!dirty[r.statusCode]}
          onClick={() => void handleSave(r)}
        >
          {dirty[r.statusCode] ? '保存修改' : '已保存'}
        </Button>
      ),
    },
  ]

  return (
    <div className="content-area">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="SLA 只作用於「在同一環節停留的時長」，不疊加已懸掛時間；暫停/掛起狀態不計逾期，避免誤傷合理等待。修改後請點「保存」才生效。"
      />
      <Table<RdmSlaRow>
        className="nowrap-table"
        rowKey={row => String(row.id ?? `${row.statusCode}-${row.priority ?? ''}`)}
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1240 }}
      />
    </div>
  )
}
