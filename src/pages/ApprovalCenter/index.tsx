import { useState , useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, DatePicker, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

const { RangePicker } = DatePicker

/** 所屬品牌 */
const brandOptions = [
  { label: '全部', value: 'all' },
  { label: 'mFood', value: 'mFood' },
  { label: '閃蜂', value: 'flashBee' },
]

/** 審批類型 */
const approvalTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '充值', value: 'recharge' },
  { label: '扣款', value: 'deduct' },
  { label: '轉賬', value: 'transfer' },
  { label: '合併', value: 'merge' },
]

/** 流程狀態 */
const flowStatusOptions = [
  { label: '全部', value: 'all' },
  { label: '審批中', value: 'pending' },
  { label: '已通過', value: 'approved' },
  { label: '已駁回', value: 'rejected' },
  { label: '已撤銷', value: 'cancelled' },
]

/** 當前節點 */
const currentNodeOptions = [
  { label: '全部', value: 'all' },
  { label: '業務主管審批', value: 'business' },
  { label: '運營主管審批', value: 'operation' },
  { label: '財務主管審批', value: 'finance' },
]

/** 審批狀態 */
const approvalStatusOptions = [
  { label: '全部', value: 'all' },
  { label: '通過', value: 'approved' },
  { label: '駁回', value: 'rejected' },
  { label: '待審批', value: 'pending' },
]

const brandMap: Record<string, string> = { mFood: 'mFood', flashBee: '閃蜂' }
const approvalTypeMap: Record<string, string> = { recharge: '充值', deduct: '扣款', transfer: '轉賬', merge: '合併' }
const flowStatusMap: Record<string, string> = { pending: '審批中', approved: '已通過', rejected: '已駁回', cancelled: '已撤銷' }
const approvalStatusMap: Record<string, string> = { approved: '通過', rejected: '駁回', pending: '待審批' }

interface ApprovalRecord {
  key: string
  groupId: string
  groupName: string
  brand: string
  flowNo: string
  approvalType: string
  applicant: string
  applyTime: string
  // 業務主管
  bizApprover: string
  bizApproveTime: string
  bizApproveStatus: string
  // 運營主管
  opsApprover: string
  opsApproveTime: string
  opsApproveStatus: string
  // 財務主管
  finApprover: string
  finApproveTime: string
  finApproveStatus: string
  // 流程
  flowStatus: string
  rejectReason: string
}

const mockData: ApprovalRecord[] = [
  { key: '1', groupId: '1001', groupName: '廣州酒家', brand: 'flashBee', flowNo: '20261001001', approvalType: 'recharge', applicant: '朱棣(002)', applyTime: '2026-01-16 09:16:21', bizApprover: '朱元璋(001)', bizApproveTime: '2026-01-16 09:16:21', bizApproveStatus: 'approved', opsApprover: '朱標(003)', opsApproveTime: '2026-01-16 10:20:15', opsApproveStatus: 'approved', finApprover: '朱棟(004)', finApproveTime: '2026-01-16 14:30:22', finApproveStatus: 'approved', flowStatus: 'approved', rejectReason: '' },
  { key: '2', groupId: '1002', groupName: '1mFood', brand: 'mFood', flowNo: '20261001002', approvalType: 'deduct', applicant: '朱棣(002)', applyTime: '2026-01-16 09:16:21', bizApprover: '朱元璋(001)', bizApproveTime: '2026-01-16 09:16:21', bizApproveStatus: 'approved', opsApprover: '朱標(003)', opsApproveTime: '2026-01-16 10:20:15', opsApproveStatus: 'rejected', finApprover: '--', finApproveTime: '--', finApproveStatus: 'pending', flowStatus: 'rejected', rejectReason: '混合支付營業額佔比太高' },
  { key: '3', groupId: '1003', groupName: '海底撈', brand: 'flashBee', flowNo: '20261001003', approvalType: 'transfer', applicant: '朱棣(002)', applyTime: '2026-01-16 09:16:21', bizApprover: '朱元璋(001)', bizApproveTime: '2026-01-16 09:16:21', bizApproveStatus: 'rejected', opsApprover: '--', opsApproveTime: '--', opsApproveStatus: 'pending', finApprover: '--', finApproveTime: '--', finApproveStatus: 'pending', flowStatus: 'rejected', rejectReason: '營收不足以抵扣該營業額支付' },
  { key: '4', groupId: '1004', groupName: '麥當勞', brand: 'mFood', flowNo: '20261001004', approvalType: 'merge', applicant: '朱棣(002)', applyTime: '2026-01-16 09:16:21', bizApprover: '朱元璋(001)', bizApproveTime: '2026-01-16 09:16:21', bizApproveStatus: 'approved', opsApprover: '朱標(003)', opsApproveTime: '2026-01-16 10:20:15', opsApproveStatus: 'approved', finApprover: '朱棟(004)', finApproveTime: '--', finApproveStatus: 'pending', flowStatus: 'pending', rejectReason: '' },
  { key: '5', groupId: '1005', groupName: '星巴克', brand: 'flashBee', flowNo: '20261001005', approvalType: 'recharge', applicant: '朱棣(002)', applyTime: '2026-01-16 09:16:21', bizApprover: '朱元璋(001)', bizApproveTime: '2026-01-16 09:16:21', bizApproveStatus: 'approved', opsApprover: '朱標(003)', opsApproveTime: '2026-01-16 10:20:15', opsApproveStatus: 'approved', finApprover: '朱棟(004)', finApproveTime: '2026-01-16 14:30:22', finApproveStatus: 'approved', flowStatus: 'approved', rejectReason: '' },
  { key: '6', groupId: '1006', groupName: '肯德基', brand: 'mFood', flowNo: '20261001006', approvalType: 'deduct', applicant: '朱棣(002)', applyTime: '2026-01-16 09:16:21', bizApprover: '朱元璋(001)', bizApproveTime: '2026-01-16 09:16:21', bizApproveStatus: 'approved', opsApprover: '--', opsApproveTime: '--', opsApproveStatus: 'pending', finApprover: '--', finApproveTime: '--', finApproveStatus: 'pending', flowStatus: 'pending', rejectReason: '' },
  { key: '7', groupId: '1007', groupName: '必勝客', brand: 'flashBee', flowNo: '20261001007', approvalType: 'transfer', applicant: '朱棣(002)', applyTime: '2026-01-16 09:16:21', bizApprover: '朱元璋(001)', bizApproveTime: '2026-01-16 09:16:21', bizApproveStatus: 'approved', opsApprover: '朱標(003)', opsApproveTime: '2026-01-16 10:20:15', opsApproveStatus: 'approved', finApprover: '朱棟(004)', finApproveTime: '2026-01-16 14:30:22', finApproveStatus: 'approved', flowStatus: 'approved', rejectReason: '' },
  { key: '8', groupId: '1008', groupName: '漢堡王', brand: 'mFood', flowNo: '20261001008', approvalType: 'recharge', applicant: '朱棣(002)', applyTime: '2026-01-16 09:16:21', bizApprover: '朱元璋(001)', bizApproveTime: '2026-01-16 09:16:21', bizApproveStatus: 'approved', opsApprover: '朱標(003)', opsApproveTime: '2026-01-16 10:20:15', opsApproveStatus: 'rejected', finApprover: '--', finApproveTime: '--', finApproveStatus: 'pending', flowStatus: 'rejected', rejectReason: '不符合推廣金使用規範' },
  { key: '9', groupId: '1009', groupName: '必勝客旗艦店', brand: 'flashBee', flowNo: '20261001009', approvalType: 'merge', applicant: '朱棣(002)', applyTime: '2026-01-16 09:16:21', bizApprover: '朱元璋(001)', bizApproveTime: '2026-01-16 09:16:21', bizApproveStatus: 'approved', opsApprover: '朱標(003)', opsApproveTime: '2026-01-16 10:20:15', opsApproveStatus: 'approved', finApprover: '朱棟(004)', finApproveTime: '2026-01-16 14:30:22', finApproveStatus: 'approved', flowStatus: 'cancelled', rejectReason: '' },
  { key: '10', groupId: '1010', groupName: '喜茶', brand: 'mFood', flowNo: '20261001010', approvalType: 'deduct', applicant: '朱棣(002)', applyTime: '2026-01-16 09:16:21', bizApprover: '朱元璋(001)', bizApproveTime: '2026-01-16 09:16:21', bizApproveStatus: 'approved', opsApprover: '朱標(003)', opsApproveTime: '2026-01-16 10:20:15', opsApproveStatus: 'approved', finApprover: '--', finApproveTime: '--', finApproveStatus: 'pending', flowStatus: 'pending', rejectReason: '' },
  { key: '11', groupId: '1011', groupName: '奈雪的茶', brand: 'flashBee', flowNo: '20261001011', approvalType: 'transfer', applicant: '朱棣(002)', applyTime: '2026-01-16 09:16:21', bizApprover: '--', bizApproveTime: '--', bizApproveStatus: 'pending', opsApprover: '--', opsApproveTime: '--', opsApproveStatus: 'pending', finApprover: '--', finApproveTime: '--', finApproveStatus: 'pending', flowStatus: 'pending', rejectReason: '' },
  { key: '12', groupId: '1012', groupName: '瑞幸咖啡', brand: 'mFood', flowNo: '20261001012', approvalType: 'recharge', applicant: '朱棣(002)', applyTime: '2026-01-16 09:16:21', bizApprover: '朱元璋(001)', bizApproveTime: '2026-01-16 09:16:21', bizApproveStatus: 'approved', opsApprover: '朱標(003)', opsApproveTime: '2026-01-16 10:20:15', opsApproveStatus: 'approved', finApprover: '朱棟(004)', finApproveTime: '2026-01-16 14:30:22', finApproveStatus: 'approved', flowStatus: 'approved', rejectReason: '' },
]

export default function ApprovalCenter() {
  const navigate = useNavigate()
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [detailRecord, setDetailRecord] = useState<ApprovalRecord | null>(null)
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false)
  const [approveRecord, setApproveRecord] = useState<ApprovalRecord | null>(null)
  const [form] = Form.useForm()

  const handleDetail = (record: ApprovalRecord) => {
    navigate(`/approval-detail?type=${record.approvalType}`)
  }

  const handleApprove = (record: ApprovalRecord) => {
    navigate(`/approval-detail?type=${record.approvalType}`)
  }

  const handleCancel = (record: ApprovalRecord) => {
    Modal.confirm({
      title: '確認撤銷',
      content: `確定要撤銷流程編號「${record.flowNo}」的審批嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => message.success('撤銷成功'),
    })
  }

  const handleApproveSubmit = (action: 'approve' | 'reject') => {
    form.validateFields().then((values) => {
      if (action === 'reject' && !values.rejectReason) {
        message.error('駁回時必須填寫駁回理由')
        return
      }
      message.success(action === 'approve' ? '審批通過成功' : '審批駁回成功')
      setIsApproveModalOpen(false)
    })
  }

  const handleNotify = () => {
    message.success('已向審批人發送通知')
  }

  /** 審批狀態渲染 */
  const renderApprovalStatus = (status: string) => {
    if (status === 'approved') return <Tag color="green">通過</Tag>
    if (status === 'rejected') return <Tag color="red">駁回</Tag>
    if (status === 'pending') return <span style={{ color: '#999' }}>--</span>
    return '--'
  }

  /** 流程狀態渲染 */
  const renderFlowStatus = (status: string) => {
    const colorMap: Record<string, string> = {
      pending: 'processing',
      approved: 'success',
      rejected: 'error',
      cancelled: 'default',
    }
    return <Tag color={colorMap[status]}>{flowStatusMap[status]}</Tag>
  }
  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'groupId', title: '集團ID' },
    { key: 'groupName', title: '集團名稱' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'flowNo', title: '流程編號' },
    { key: 'approvalType', title: '審批類型' },
    { key: 'applicant', title: '申請人' },
    { key: 'applyTime', title: '申請時間' },
    { key: 'biz', title: '業務主管審批' },
    { key: 'ops', title: '運營主管審批' },
    { key: 'fin', title: '財務主管審批' },
    { key: 'flowStatus', title: '流程狀態' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('approval-center', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const }
  ])

  

  const columns: TableColumnsType<ApprovalRecord> = [
    { title: '集團ID', dataIndex: 'groupId', key: 'groupId', width: 80, fixed: 'left' },
    { title: '集團名稱', dataIndex: 'groupName', key: 'groupName', width: 110 },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 80,
      render: (v: string) => brandMap[v] || v,
    },
    { title: '流程編號', dataIndex: 'flowNo', key: 'flowNo', width: 130 },
    {
      title: '審批類型',
      dataIndex: 'approvalType',
      key: 'approvalType',
      width: 80,
      render: (v: string) => approvalTypeMap[v] || v,
    },
    { title: '申請人', dataIndex: 'applicant', key: 'applicant', width: 100 },
    { title: '申請時間', dataIndex: 'applyTime', key: 'applyTime', width: 160 },
    // 業務主管審批 - 藍色
    {
      title: '業務主管審批',
      key: 'biz',
      children: [
        { title: '審批人', dataIndex: 'bizApprover', key: 'bizApprover', width: 110 },
        { title: '審批時間', dataIndex: 'bizApproveTime', key: 'bizApproveTime', width: 160 },
        {
          title: '審批狀態',
          dataIndex: 'bizApproveStatus',
          key: 'bizApproveStatus',
          width: 90,
          render: renderApprovalStatus,
        },
      ],
    },
    // 運營主管審批 - 橙色
    {
      title: '運營主管審批',
      key: 'ops',
      children: [
        { title: '審批人', dataIndex: 'opsApprover', key: 'opsApprover', width: 110 },
        { title: '審批時間', dataIndex: 'opsApproveTime', key: 'opsApproveTime', width: 160 },
        {
          title: '審批狀態',
          dataIndex: 'opsApproveStatus',
          key: 'opsApproveStatus',
          width: 90,
          render: renderApprovalStatus,
        },
      ],
    },
    // 財務主管審批 - 紅色
    {
      title: '財務主管審批',
      key: 'fin',
      children: [
        { title: '審批人', dataIndex: 'finApprover', key: 'finApprover', width: 110 },
        { title: '審批時間', dataIndex: 'finApproveTime', key: 'finApproveTime', width: 160 },
        {
          title: '審批狀態',
          dataIndex: 'finApproveStatus',
          key: 'finApproveStatus',
          width: 90,
          render: renderApprovalStatus,
        },
      ],
    },
    {
      title: '流程狀態',
      dataIndex: 'flowStatus',
      key: 'flowStatus',
      width: 100,
      render: renderFlowStatus,
    },
    {
      title: '駁回理由',
      dataIndex: 'rejectReason',
      key: 'rejectReason',
      width: 180,
      ellipsis: true,
      render: (v: string) => v || <span style={{ color: '#999' }}>--</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleDetail(record)}>詳情</Button>
          {record.flowStatus === 'pending' && (
            <>
              <Button type="link" size="small" onClick={() => handleApprove(record)}>審批</Button>
              <Button type="link" size="small" danger onClick={() => handleCancel(record)}>撤銷</Button>
            </>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="集團ID">
            <Input placeholder="請輸入集團ID" allowClear />
          </Form.Item>
          <Form.Item label="集團名稱">
            <Input placeholder="請輸入集團名稱" allowClear />
          </Form.Item>
          <Form.Item label="所屬品牌">
            <Select placeholder="全部" options={brandOptions} />
          </Form.Item>
          <Form.Item label="審批類型">
            <Select placeholder="全部" options={approvalTypeOptions} />
          </Form.Item>
          <Form.Item label="流程編號">
            <Input placeholder="請輸入流程編號" allowClear />
          </Form.Item>
          <Form.Item label="流程狀態">
            <Select placeholder="全部" options={flowStatusOptions} />
          </Form.Item>
          <Form.Item label="當前節點">
            <Select placeholder="全部" options={currentNodeOptions} />
          </Form.Item>
          <Form.Item label="申請時間">
            <RangePicker placeholder={['開始時間', '結束時間']} />
          </Form.Item>
          <Form.Item label="申請人">
            <Input placeholder="請輸入申請人姓名/工號" allowClear />
          </Form.Item>
          <Form.Item label="審批人">
            <Input placeholder="請輸入審批人姓名/工號" allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>搜尋</Button>
              <Button icon={<ReloadOutlined />}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <Space>
          <Button icon={<ExportOutlined />}>數據導出</Button>
          <Button icon={<UserOutlined />} onClick={handleNotify}>審批人通知</Button>
        </Space>
              {configComponent}
      </div>

      {/* 列表区域 */}
      <div className="table-section approval-table">
        <Table<ApprovalRecord>
          columns={applyConfig(columns)}
          dataSource={mockData}
          rowSelection={{}}
          pagination={{
            total: 200,
            pageSize: 20,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showQuickJumper: true,
          }}
          size="middle"
          bordered
          scroll={{ x: 2000 }}
        />
      </div>

      {/* 详情弹窗 */}
      <Modal
        title="審批詳情"
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={null}
        width={720}
      >
        {detailRecord && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
              <div><span style={{ color: '#999' }}>集團ID：</span>{detailRecord.groupId}</div>
              <div><span style={{ color: '#999' }}>集團名稱：</span>{detailRecord.groupName}</div>
              <div><span style={{ color: '#999' }}>所屬品牌：</span>{brandMap[detailRecord.brand]}</div>
              <div><span style={{ color: '#999' }}>流程編號：</span>{detailRecord.flowNo}</div>
              <div><span style={{ color: '#999' }}>審批類型：</span>{approvalTypeMap[detailRecord.approvalType]}</div>
              <div><span style={{ color: '#999' }}>申請人：</span>{detailRecord.applicant}</div>
              <div><span style={{ color: '#999' }}>申請時間：</span>{detailRecord.applyTime}</div>
              <div><span style={{ color: '#999' }}>流程狀態：</span>{renderFlowStatus(detailRecord.flowStatus)}</div>
            </div>

            <h4 style={{ marginTop: 20, marginBottom: 12, fontSize: 14, color: '#333', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>審批流程</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              {/* 業務主管 */}
              <div style={{ padding: 12, background: '#E3F2FD', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, color: '#1565C0', marginBottom: 8 }}>業務主管審批</div>
                <div style={{ fontSize: 12, color: '#666', lineHeight: 2 }}>
                  <div>審批人：{detailRecord.bizApprover}</div>
                  <div>時間：{detailRecord.bizApproveTime}</div>
                  <div>狀態：{renderApprovalStatus(detailRecord.bizApproveStatus)}</div>
                </div>
              </div>
              {/* 運營主管 */}
              <div style={{ padding: 12, background: '#FFF3E0', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, color: '#E65100', marginBottom: 8 }}>運營主管審批</div>
                <div style={{ fontSize: 12, color: '#666', lineHeight: 2 }}>
                  <div>審批人：{detailRecord.opsApprover}</div>
                  <div>時間：{detailRecord.opsApproveTime}</div>
                  <div>狀態：{renderApprovalStatus(detailRecord.opsApproveStatus)}</div>
                </div>
              </div>
              {/* 財務主管 */}
              <div style={{ padding: 12, background: '#FFEBEE', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, color: '#C62828', marginBottom: 8 }}>財務主管審批</div>
                <div style={{ fontSize: 12, color: '#666', lineHeight: 2 }}>
                  <div>審批人：{detailRecord.finApprover}</div>
                  <div>時間：{detailRecord.finApproveTime}</div>
                  <div>狀態：{renderApprovalStatus(detailRecord.finApproveStatus)}</div>
                </div>
              </div>
            </div>

            {detailRecord.rejectReason && (
              <>
                <h4 style={{ marginTop: 20, marginBottom: 8, fontSize: 14, color: '#E53935' }}>駁回理由</h4>
                <div style={{ padding: 12, background: '#FFF8F8', borderRadius: 8, color: '#666', fontSize: 13 }}>
                  {detailRecord.rejectReason}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 审批弹窗 */}
      <Modal
        title="審批操作"
        open={isApproveModalOpen}
        onCancel={() => setIsApproveModalOpen(false)}
        footer={null}
        width={500}
      >
        {approveRecord && (
          <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 16, padding: 12, background: '#F8F8F8', borderRadius: 8 }}>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 2 }}>
                <div><span style={{ color: '#999' }}>流程編號：</span>{approveRecord.flowNo}</div>
                <div><span style={{ color: '#999' }}>審批類型：</span>{approvalTypeMap[approveRecord.approvalType]}</div>
                <div><span style={{ color: '#999' }}>申請人：</span>{approveRecord.applicant}</div>
              </div>
            </div>
            <Form.Item label="審批意見" name="remark">
              <Input.TextArea rows={3} placeholder="請輸入審批意見（選填）" maxLength={200} showCount />
            </Form.Item>
            <Form.Item label="駁回理由" name="rejectReason">
              <Input.TextArea rows={3} placeholder="如選擇駁回，請輸入駁回理由" maxLength={200} showCount />
            </Form.Item>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
              <Button onClick={() => setIsApproveModalOpen(false)}>取消</Button>
              <Button danger onClick={() => handleApproveSubmit('reject')}>駁回</Button>
              <Button type="primary" onClick={() => handleApproveSubmit('approve')}>通過</Button>
            </div>
          </Form>
        )}
      </Modal>
    </div>
  )
}
