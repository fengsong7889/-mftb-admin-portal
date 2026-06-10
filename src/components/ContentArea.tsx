import { Button, Space, Input, Select, DatePicker, Table } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ExportOutlined,
} from '@ant-design/icons'

const { RangePicker } = DatePicker

export default function ContentArea() {
  const columns = [
    { title: '序號', dataIndex: 'id', key: 'id', width: 80 },
    { title: '名稱', dataIndex: 'name', key: 'name' },
    { title: '狀態', dataIndex: 'status', key: 'status', width: 100 },
    { title: '金額', dataIndex: 'amount', key: 'amount', width: 150 },
    { title: '創建時間', dataIndex: 'createTime', key: 'createTime', width: 180 },
    { title: '操作', key: 'action', width: 150, render: () => <a>查看</a> },
  ]

  const dataSource = Array.from({ length: 10 }, (_, i) => ({
    key: String(i + 1),
    id: i + 1,
    name: '-',
    status: '-',
    amount: '-',
    createTime: '-',
  }))

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <div className="search-fields">
          <Input placeholder="請輸入名稱" allowClear style={{ width: 200 }} />
          <Select placeholder="請選擇狀態" allowClear style={{ width: 160 }} options={[]} />
          <RangePicker placeholder={['開始日期', '結束日期']} />
          <Input placeholder="請輸入金額" allowClear style={{ width: 160 }} />
        </div>
        <div className="search-actions">
          <Button type="primary" icon={<SearchOutlined />}>
            查詢
          </Button>
          <Button icon={<ReloadOutlined />}>
            重置
          </Button>
        </div>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <Space>
          <Button type="primary" icon={<PlusOutlined />}>
            新增
          </Button>
          <Button icon={<ExportOutlined />}>
            導出
          </Button>
        </Space>
      </div>

      {/* 数据列表区域 */}
      <div className="table-section">
        <Table
          columns={columns}
          dataSource={dataSource}
          pagination={{
            total: 50,
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            showQuickJumper: true,
          }}
          size="middle"
          bordered={false}
        />
      </div>
    </div>
  )
}
