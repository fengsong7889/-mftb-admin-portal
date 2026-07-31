import { useCallback, useEffect, useState } from 'react'
import { Button, Modal, Popconfirm, Space, Table, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import RemoteSearchSelect from '../../components/RemoteSearchSelect'
import { fetchEmployeeOptions } from '../../api/employee'
import { fetchStoreBds, addStoreBd, removeStoreBd } from '../../api/store'
import type { StoreBdItem, StoreItem } from '../../api/store'

interface StoreBindBdModalProps {
  open: boolean
  /** 待绑定BD的门店 */
  record: StoreItem | null
  onClose: () => void
  /** 绑定关系有变更时关闭回调（父列表需刷新） */
  onSuccess: () => void
}

/**
 * 门店绑定BD弹窗：展示当前已绑定的BD列表（含部门/职位/职级），支持新增绑定与删除解绑
 */
export default function StoreBindBdModal({ open, record, onClose, onSuccess }: StoreBindBdModalProps) {
  const [bdList, setBdList] = useState<StoreBdItem[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [selectedEmpId, setSelectedEmpId] = useState<string>()
  // 弹窗内是否发生过增删（关闭时决定父列表是否刷新）
  const [changed, setChanged] = useState(false)

  const loadBds = useCallback(async (storeId: number) => {
    setLoading(true)
    try {
      const list = await fetchStoreBds(storeId)
      setBdList(list || [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加載BD列表失敗'
      message.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  // 打开时加载当前已绑定的BD列表
  useEffect(() => {
    if (open && record) {
      setBdList([])
      setSelectedEmpId(undefined)
      setChanged(false)
      loadBds(record.id)
    }
  }, [open, record, loadBds])

  const handleAdd = async () => {
    if (!record || !selectedEmpId) return
    setAdding(true)
    try {
      await addStoreBd(record.id, selectedEmpId)
      message.success('BD綁定成功')
      setSelectedEmpId(undefined)
      setChanged(true)
      loadBds(record.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '綁定失敗'
      message.error(msg)
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (bind: StoreBdItem) => {
    if (!record) return
    try {
      await removeStoreBd(record.id, bind.id)
      message.success('BD已解綁')
      setChanged(true)
      loadBds(record.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '解綁失敗'
      message.error(msg)
    }
  }

  /** 关闭：有增删变更时通知父列表刷新 */
  const handleClose = () => {
    if (changed) {
      onSuccess()
    } else {
      onClose()
    }
  }

  const columns: ColumnsType<StoreBdItem> = [
    {
      title: 'BD員工',
      dataIndex: 'bdName',
      key: 'bdName',
      render: (val: string, row) => `${val || row.bdEmpId}(${row.bdEmpId})`,
    },
    {
      title: '部門',
      dataIndex: 'department',
      key: 'department',
      render: (val: string) => val || '-',
    },
    {
      title: '職位',
      dataIndex: 'position',
      key: 'position',
      render: (val: string) => val || '-',
    },
    {
      title: '職級',
      dataIndex: 'jobLevel',
      key: 'jobLevel',
      width: 70,
      render: (val: string) => val || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 70,
      render: (_, row) => (
        <Popconfirm title="確認解除該BD綁定？" onConfirm={() => handleRemove(row)}>
          <Button type="link" size="small" danger>刪除</Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <Modal
      title={`綁定BD${record ? ` - ${record.storeName}` : ''}`}
      open={open}
      onCancel={handleClose}
      footer={[
        <Button key="close" onClick={handleClose}>關閉</Button>,
      ]}
      destroyOnClose
      width={640}
    >
      {/* 新增绑定：选择员工 + 新增按钮 */}
      <Space.Compact block style={{ margin: '16px 0' }}>
        <RemoteSearchSelect
          key={record?.id}
          placeholder="搜索員工姓名/工號"
          fetchOptions={fetchEmployeeOptions}
          value={selectedEmpId}
          onChange={setSelectedEmpId}
          style={{ flex: 1 }}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          loading={adding}
          disabled={!selectedEmpId}
          onClick={handleAdd}
        >
          新增
        </Button>
      </Space.Compact>

      {/* 已绑定BD列表 */}
      <Table<StoreBdItem>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={bdList}
        loading={loading}
        pagination={false}
        locale={{ emptyText: '暫未綁定BD' }}
      />
    </Modal>
  )
}
