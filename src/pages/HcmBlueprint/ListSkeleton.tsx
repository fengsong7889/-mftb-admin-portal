/**
 * 列表頁骨架（階段 B 預覽）
 *
 * 為什麼按真實頁面的結構寫死：階段 B 的目的就是讓業務/HR 確認「列表長什麼樣、有哪些列、統計卡口徑對不對」，
 * 所以必須走全項目統一的 `.search-section` → 統計卡 → `.action-section` → Table 順序（§E.7 / §E.8），
 * 並且真的掛上 useColumnConfig，讓列配置抽屜也能一起評審。數據全部來自 blueprint.ts 的靜態示範。
 */
import { useMemo } from 'react'
import { Button, DatePicker, Form, Input, Select, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TagsOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import StatCards, { type StatCardItem } from '../../components/StatCards'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import type { HcmDemo } from './blueprint'

interface DemoRow {
  key: string
  values: string[]
}

/** 最後一列固定是狀態：用 Tag 呈現，便於評審時確認狀態語義而不是純文字 */
const STATUS_INDEX_FROM_END = 1

function buildRows(demo: HcmDemo): DemoRow[] {
  return demo.rows.map((values, index) => ({ key: `${demo.entity}-${index}`, values }))
}

export default function ListSkeleton({ demo, pageKey }: { demo: HcmDemo; pageKey: string }) {
  const rows = useMemo(() => buildRows(demo), [demo])

  const columnMeta = useMemo(
    () => demo.columns.map((title, index) => ({ key: `c${index}`, title })),
    [demo.columns],
  )

  const { configComponent, applyConfig } = useColumnConfig(pageKey, columnMeta, [
    { key: 'c0', visible: true, locked: 'head' as const },
  ])

  const columns: ColumnsType<DemoRow> = useMemo(
    () => demo.columns.map((title, index) => ({
      key: `c${index}`,
      title,
      dataIndex: ['values', index],
      width: index === 0 ? 160 : undefined,
      render: (value: string) => {
        if (index === demo.columns.length - STATUS_INDEX_FROM_END) {
          const color = /鎖定|已確認|已封存|啟用|在職|無$/.test(value) ? 'green'
            : /待|進行|報名|處理中|試用/.test(value) ? 'orange'
            : /異常|疑問|待受理/.test(value) ? 'red'
            : 'default'
          return <Tag color={color}>{value}</Tag>
        }
        return value
      },
    })),
    [demo.columns],
  )

  const stats: StatCardItem[] = useMemo(
    () => [
      { key: 'total', icon: <TagsOutlined />, value: rows.length, label: `${demo.entity}總數`, color: 'info' },
      { key: 'active', icon: <ClockCircleOutlined />, value: rows.filter((row) => /進行|待|報名|處理中/.test(row.values[row.values.length - 1])).length, label: '進行中', color: 'brand' },
      { key: 'done', icon: <CheckCircleOutlined />, value: rows.filter((row) => /鎖定|已確認|已封存|已關閉|在職/.test(row.values[row.values.length - 1])).length, label: '已完成 / 已鎖定', color: 'success' },
      { key: 'risk', icon: <ExclamationCircleOutlined />, value: rows.filter((row) => /異常|待受理|疑問/.test(row.values[row.values.length - 1])).length, label: '待處理異常', color: 'danger' },
    ],
    [rows, demo.entity],
  )

  return (
    <>
      {/* 1. 搜索區：4 列 grid，條件變更跟隨統計口徑（此處為靜態骨架，接數時把 filters 一併傳給統計接口） */}
      <div className="search-section">
        <Form layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
            <Form.Item label="關鍵字" style={{ marginBottom: 0 }}>
              <Input placeholder="編碼 / 姓名" allowClear />
            </Form.Item>
            <Form.Item label="狀態" style={{ marginBottom: 0 }}>
              <Select placeholder="全部" allowClear options={[]} />
            </Form.Item>
            <Form.Item label="所屬法人" style={{ marginBottom: 0 }}>
              <Select placeholder="全部" allowClear options={[]} />
            </Form.Item>
            <Form.Item label="更新日期" style={{ marginBottom: 0 }}>
              <DatePicker.RangePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button type="primary" icon={<SearchOutlined />}>查詢</Button>
            <Button icon={<ReloadOutlined />}>重置</Button>
          </div>
        </Form>
      </div>

      {/* 2. 統計卡：必須在搜索區下方（§E.8），口徑跟隨搜索條件 */}
      <div style={{ marginBottom: 16 }}>
        <StatCards items={stats} animationKey={pageKey} columns={4} />
      </div>

      {/* 3. 操作區：左側導出/批量，右側新增 + 列配置 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export">導出</Button>
          <Button className="btn-import">導入</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />}>新增{demo.entity}</Button>
          {configComponent}
        </div>
      </div>

      {/* 4. 表格 */}
      <Table<DemoRow>
        rowKey="key"
        size="middle"
        columns={applyConfig(columns) as ColumnsType<DemoRow>}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: 1,
          pageSize: 10,
          total: rows.length,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (count) => `共 ${count} 條`,
        }}
      />
    </>
  )
}
