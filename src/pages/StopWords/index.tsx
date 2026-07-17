import { useState } from 'react'
import { Card, Table, Button, Modal, Input, message, Popconfirm, Tag, Space } from 'antd'
import {
  PlusOutlined,
} from '@ant-design/icons'

interface StopWord {
  id: string
  word: string
  createTime: string
  creator: string
}

export default function StopWords() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingWord, setEditingWord] = useState<StopWord | null>(null)
  const [searchText, setSearchText] = useState('')

  // Mock 数据
  const [dataSource, setDataSource] = useState<StopWord[]>([
    { id: '1', word: '的', createTime: '2024-01-15 10:30:00', creator: '系统管理员' },
    { id: '2', word: '了', createTime: '2024-01-15 10:30:00', creator: '系统管理员' },
    { id: '3', word: '是', createTime: '2024-01-15 10:30:00', creator: '系统管理员' },
    { id: '4', word: '在', createTime: '2024-01-15 10:30:00', creator: '系统管理员' },
    { id: '5', word: '有', createTime: '2024-01-15 10:30:00', creator: '系统管理员' },
    { id: '6', word: '和', createTime: '2024-01-15 10:30:00', creator: '系统管理员' },
    { id: '7', word: '就', createTime: '2024-01-15 10:30:00', creator: '系统管理员' },
    { id: '8', word: '不', createTime: '2024-01-15 10:30:00', creator: '系统管理员' },
    { id: '9', word: '也', createTime: '2024-01-15 10:30:00', creator: '系统管理员' },
    { id: '10', word: '很', createTime: '2024-01-15 10:30:00', creator: '系统管理员' },
  ])

  const [formWord, setFormWord] = useState('')

  const columns = [
    {
      title: '停用詞',
      dataIndex: 'word',
      key: 'word',
      render: (text: string) => <Tag color="red">{text}</Tag>,
    },
    {
      title: '創建時間',
      dataIndex: 'createTime',
      key: 'createTime',
    },
    {
      title: '創建人',
      dataIndex: 'creator',
      key: 'creator',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: StopWord) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            
            onClick={() => handleEdit(record)}
          >
            編輯
          </Button>
          <Popconfirm
            title="確認刪除"
            description="刪除後將無法恢復,確認刪除該停用詞?"
            onConfirm={() => handleDelete(record.id)}
            okText="確認"
            cancelText="取消"
          >
            <Button type="link" size="small" danger >
              刪除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleEdit = (record: StopWord) => {
    setEditingWord(record)
    setFormWord(record.word)
    setIsModalOpen(true)
  }

  const handleDelete = (id: string) => {
    setDataSource(dataSource.filter(item => item.id !== id))
    message.success('刪除成功')
  }

  const handleAdd = () => {
    setEditingWord(null)
    setFormWord('')
    setIsModalOpen(true)
  }

  const handleSubmit = () => {
    if (!formWord.trim()) {
      message.warning('請輸入停用詞')
      return
    }

    if (editingWord) {
      // 编辑模式
      setDataSource(dataSource.map(item =>
        item.id === editingWord.id
          ? { ...item, word: formWord.trim() }
          : item
      ))
      message.success('更新成功')
    } else {
      // 新增模式
      const newWord: StopWord = {
        id: String(Date.now()),
        word: formWord.trim(),
        createTime: new Date().toLocaleString('zh-TW', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).replace(/\//g, '-'),
        creator: '当前用户',
      }
      setDataSource([newWord, ...dataSource])
      message.success('添加成功')
    }

    setIsModalOpen(false)
    setFormWord('')
    setEditingWord(null)
  }

  const filteredData = dataSource.filter(item =>
    item.word.includes(searchText)
  )

  return (
    <div className="content-area">
      <Card>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ marginBottom: 8 }}>停用詞庫管理</h2>
          <p style={{ color: '#666', marginBottom: 16 }}>
            管理搜索時需要過濾的停用詞,不分品牌,2個APP同時使用
          </p>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <Input.Search
              placeholder="搜索停用詞"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 300 }}
              allowClear
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新增停用詞
            </Button>
          </div>
        </div>

        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingWord ? '編輯停用詞' : '新增停用詞'}
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setIsModalOpen(false)
          setFormWord('')
          setEditingWord(null)
        }}
        okText="確認"
        cancelText="取消"
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 8 }}>停用詞:</div>
          <Input
            value={formWord}
            onChange={(e) => setFormWord(e.target.value)}
            placeholder="請輸入停用詞"
            onPressEnter={handleSubmit}
          />
        </div>
      </Modal>
    </div>
  )
}
