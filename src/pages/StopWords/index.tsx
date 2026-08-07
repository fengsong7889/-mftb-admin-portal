import { useState } from 'react'
import { Card, Table, Button, Modal, Input, message, Popconfirm, Tag, Space } from 'antd'
import {
  PlusOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

interface StopWord {
  id: string
  word: string
  createTime: string
  creator: string
}

export default function StopWords() {
  const { t } = useTranslation()
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
      title: t('stopWords.colStopWord'),
      dataIndex: 'word',
      key: 'word',
      render: (text: string) => <Tag color="red">{text}</Tag>,
    },
    {
      title: t('common.colCreateTime'),
      dataIndex: 'createTime',
      key: 'createTime',
    },
    {
      title: t('common.colCreator'),
      dataIndex: 'creator',
      key: 'creator',
    },
    {
      title: t('common.colAction'),
      key: 'action',
      render: (_: unknown, record: StopWord) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            
            onClick={() => handleEdit(record)}
          >
            {t('common.edit')}
          </Button>
          <Popconfirm
            title={t('common.confirmDelete')}
            description={t('stopWords.deleteDesc')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button type="link" size="small" danger >
              {t('common.delete')}
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
    message.success(t('common.deleteSuccess'))
  }

  const handleAdd = () => {
    setEditingWord(null)
    setFormWord('')
    setIsModalOpen(true)
  }

  const handleSubmit = () => {
    if (!formWord.trim()) {
      message.warning(t('stopWords.wordRequired'))
      return
    }

    if (editingWord) {
      // 编辑模式
      setDataSource(dataSource.map(item =>
        item.id === editingWord.id
          ? { ...item, word: formWord.trim() }
          : item
      ))
      message.success(t('common.updateSuccess'))
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
      message.success(t('common.addSuccess'))
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
          <h2 style={{ marginBottom: 8 }}>{t('stopWords.title')}</h2>
          <p style={{ color: '#666', marginBottom: 16 }}>
            {t('stopWords.desc')}
          </p>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <Input.Search
              placeholder={t('stopWords.searchPlaceholder')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 300 }}
              allowClear
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              {t('stopWords.addStopWord')}
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
        title={editingWord ? `${t('common.edit')} ${t('stopWords.colStopWord')}` : t('stopWords.addStopWord')}
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setIsModalOpen(false)
          setFormWord('')
          setEditingWord(null)
        }}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 8 }}>{t('stopWords.wordLabel')}</div>
          <Input
            value={formWord}
            onChange={(e) => setFormWord(e.target.value)}
            placeholder={t('stopWords.wordPlaceholder')}
            onPressEnter={handleSubmit}
          />
        </div>
      </Modal>
    </div>
  )
}
