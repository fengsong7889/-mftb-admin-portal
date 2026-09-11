/**
 * 员工资产管理详情页
 *
 * 从领用管理列表点击「管理」进入，展示某位员工的领用资产全貌：
 *  - 顶部：DetailPageHeader（紫色渐变顶条 + 返回按钮 + 员工姓名）
 *  - 员工信息卡：姓名 / 工号 / 部门 / 在用资产数 / 已归还数
 *  - Tab 1「在用资产」：该员工当前持有的资产列表，支持「详情」跳转资产台账，支持「继续领用」
 *  - Tab 2「已归还资产」：历史记录，仅查看
 *
 * 注意：此页面仅做领用操作，归还操作统一在「归还管理」菜单处理
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Table, Tabs, Tag, message, Spin } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  PlusOutlined, UserOutlined, TeamOutlined,
} from '@ant-design/icons'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { fetchEmployeeClaimDetail, type ClaimRecord } from '../../../api/eam'

interface Props {
  claimant: string
  onBack: () => void
  onAddClaim: () => void
  onViewAsset: (assetNo: string) => void
}

/* ---- 状态标签 ---- */
const STATUS_META: Record<string, { label: string; color: string }> = {
  claimed:  { label: '使用中', color: 'success' },
  returned: { label: '已归还', color: 'default' },
}

export default function EmployeeAssetDetail({ claimant, onBack, onAddClaim, onViewAsset }: Props) {
  const [loading, setLoading] = useState(false)
  const [claimed, setClaimed] = useState<ClaimRecord[]>([])
  const [returned, setReturned] = useState<ClaimRecord[]>([])
  const [activeTab, setActiveTab] = useState('claimed')

  const empName = claimant.replace(/\(.+\)/, '')
  const empNo = claimant.match(/\((.+)\)/)?.[1] || ''
  const department = claimed[0]?.department || returned[0]?.department || ''

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchEmployeeClaimDetail(claimant)
      setClaimed(res.claimed)
      setReturned(res.returned)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '查询失败')
    } finally {
      setLoading(false)
    }
  }, [claimant])

  useEffect(() => { loadData() }, [loadData])

  /* ----- 在用资产列 ----- */
  const claimedColumns: TableColumnsType<ClaimRecord> = [
    {
      title: '资产编号', dataIndex: 'assetNo', key: 'assetNo', width: 150,
      render: (v: string) => (
        <Button type="link" size="small" style={{ padding: 0, fontFamily: 'monospace' }}
          onClick={() => onViewAsset(v)}
        >{v}</Button>
      ),
    },
    { title: '资产名称', dataIndex: 'assetName', key: 'assetName', width: 200, ellipsis: true },
    { title: '资产分类', dataIndex: 'assetType', key: 'assetType', width: 120 },
    { title: '品牌', dataIndex: 'brand', key: 'brand', width: 100 },
    { title: '领用日期', dataIndex: 'claimDate', key: 'claimDate', width: 120 },
    {
      title: '领用原因', dataIndex: 'claimReason', key: 'claimReason', width: 160, ellipsis: true,
      render: (v: string | undefined) => v || '—',
    },
    { title: '操作人', dataIndex: 'operator', key: 'operator', width: 120 },
    {
      title: '备注', dataIndex: 'remark', key: 'remark', width: 140, ellipsis: true,
      render: (v: string | undefined) => v || '—',
    },
    {
      title: '操作', key: 'action', width: 80, fixed: 'right',
      render: (_: unknown, record: ClaimRecord) => (
        <Button type="link" size="small" onClick={() => onViewAsset(record.assetNo)}>详情</Button>
      ),
    },
  ]

  /* ----- 已归还资产列 ----- */
  const returnedColumns: TableColumnsType<ClaimRecord> = [
    {
      title: '资产编号', dataIndex: 'assetNo', key: 'assetNo', width: 150,
      render: (v: string) => (
        <Button type="link" size="small" style={{ padding: 0, fontFamily: 'monospace' }}
          onClick={() => onViewAsset(v)}
        >{v}</Button>
      ),
    },
    { title: '资产名称', dataIndex: 'assetName', key: 'assetName', width: 200, ellipsis: true },
    { title: '资产分类', dataIndex: 'assetType', key: 'assetType', width: 120 },
    { title: '品牌', dataIndex: 'brand', key: 'brand', width: 100 },
    { title: '领用日期', dataIndex: 'claimDate', key: 'claimDate', width: 120 },
    {
      title: '归还日期', dataIndex: 'returnDate', key: 'returnDate', width: 120,
      render: (v: string | undefined) => v || '—',
    },
    {
      title: '归还原因', dataIndex: 'returnReason', key: 'returnReason', width: 160, ellipsis: true,
      render: (v: string | undefined) => v || '—',
    },
    {
      title: '备注', dataIndex: 'remark', key: 'remark', width: 140, ellipsis: true,
      render: (v: string | undefined) => v || '—',
    },
  ]

  /* ----- 员工信息卡 ----- */
  const renderInfoCard = () => (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '20px 24px', marginBottom: 16,
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {/* 头像 */}
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'linear-gradient(135deg, #E8720C, #FFB347)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 20, fontWeight: 700, flexShrink: 0,
        }}>
          {empName.charAt(0)}
        </div>
        {/* 基本信息 */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: '#262626', marginBottom: 4 }}>
            {empName}
            <span style={{ fontSize: 13, fontWeight: 400, color: '#8c8c8c', marginLeft: 8 }}>
              {empNo}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: '#595959' }}>
            <span><TeamOutlined style={{ marginRight: 4, color: '#8c8c8c' }} />{department || '—'}</span>
          </div>
        </div>
        {/* 统计指标 */}
        <div style={{ display: 'flex', gap: 32 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1890FF' }}>{claimed.length}</div>
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>在用资产</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#8c8c8c' }}>{returned.length}</div>
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>已归还</div>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      {/* ====== 顶部标题栏 ====== */}
      <DetailPageHeader
        title={`${empName} 的领用资产`}
        meta={`${empNo} · ${department}`}
        onBack={onBack}
      />

      <Spin spinning={loading}>
        {/* ====== 员工信息卡 ====== */}
        {renderInfoCard()}

        {/* ====== 白色主卡片（Tab 切换） ====== */}
        <div style={{
          background: '#fff', borderRadius: 12, padding: '20px 24px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'claimed',
                label: (
                  <span>
                    <UserOutlined style={{ marginRight: 4 }} />
                    在用资产
                    <Tag color="blue" style={{ marginLeft: 6, fontSize: 11, lineHeight: '18px', borderRadius: 4 }}>
                      {claimed.length}
                    </Tag>
                  </span>
                ),
                children: (
                  <>
                    {/* 操作区 */}
                    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button type="primary" icon={<PlusOutlined />} onClick={onAddClaim}>
                        继续领用
                      </Button>
                    </div>
                    <Table<ClaimRecord>
                      columns={claimedColumns}
                      dataSource={claimed}
                      rowKey="id"
                      size="middle"
                      pagination={false}
                      scroll={{ x: 1100 }}
                    />
                  </>
                ),
              },
              {
                key: 'returned',
                label: (
                  <span>
                    已归还资产
                    <Tag color="default" style={{ marginLeft: 6, fontSize: 11, lineHeight: '18px', borderRadius: 4 }}>
                      {returned.length}
                    </Tag>
                  </span>
                ),
                children: (
                  <Table<ClaimRecord>
                    columns={returnedColumns}
                    dataSource={returned}
                    rowKey="id"
                    size="middle"
                    pagination={false}
                    scroll={{ x: 1000 }}
                  />
                ),
              },
            ]}
          />
        </div>
      </Spin>
    </div>
  )
}
