import { useState, useMemo, useCallback, useEffect } from 'react'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, DatePicker, Switch, Radio, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ExportOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useTranslation } from 'react-i18next'
import {
  fetchWordLibraryList,
  createWordLibraryItem,
  updateWordLibraryItem,
  toggleWordLibraryStatus,
  deleteWordLibraryItem,
  segmentWords,
} from '../../api/wordLibrary'
import type { WordLibraryItem } from '../../api/wordLibrary'

const { RangePicker } = DatePicker
const { TextArea } = Input

/* ──────────── 常量定义 ──────────── */

/* ──────────── 组件 ──────────── */

export default function PromotionWordLibrary() {
  const { t } = useTranslation()
  /** 业务频道选项（依赖 t，定义在组件内以便响应语言切换） */
  const CHANNEL_OPTIONS = [
    { label: t('promotionWordLibrary.chTakeaway'), value: 'takeaway' },
    { label: t('promotionWordLibrary.chSupermarket'), value: 'supermarket' },
    { label: t('promotionWordLibrary.chGroupBuy'), value: 'groupBuy' },
  ]
  const CHANNEL_LABEL: Record<string, string> = {
    takeaway: t('promotionWordLibrary.chTakeaway'),
    supermarket: t('promotionWordLibrary.chSupermarket'),
    groupBuy: t('promotionWordLibrary.chGroupBuy'),
  }
  /** 状态选项 — 值对应后端 1=啟用 2=停用 */
  const statusOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('common.enable'), value: 1 },
    { label: t('common.disable'), value: 2 },
  ]
  /** 频道选项 */
  const channelFilterOptions = [
    { label: t('common.all'), value: 'all' },
    ...CHANNEL_OPTIONS,
  ]
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<WordLibraryItem | null>(null)
  const [form] = Form.useForm()
  const [searchForm] = Form.useForm()
  const [data, setData] = useState<WordLibraryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  /* ---- 分词相关状态 ---- */
  const [segmentInput, setSegmentInput] = useState('')
  const [segmentResults, setSegmentResults] = useState<string[]>([])
  const [selectedWords, setSelectedWords] = useState<string[]>([])
  const [segmentLoading, setSegmentLoading] = useState(false)

  /* ---- 数据加载 ---- */
  const loadData = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true)
    try {
      const values = searchForm.getFieldsValue()
      const params: Record<string, unknown> = { page: p, size: ps }
      if (values.keyword) params.keyword = values.keyword
      if (values.status && values.status !== 'all') params.status = values.status
      if (values.channel && values.channel !== 'all') params.channel = values.channel
      if (values.updatedBy) params.updatedBy = values.updatedBy
      if (values.remark) params.remark = values.remark
      if (values.dateRange?.[0]) params.startDate = values.dateRange[0].format('YYYY-MM-DD')
      if (values.dateRange?.[1]) params.endDate = values.dateRange[1].format('YYYY-MM-DD')
      const res = await fetchWordLibraryList(params as Parameters<typeof fetchWordLibraryList>[0])
      setData(res.records)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchForm])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- 排名数据（按匹配数降序，跨页连续排名） ---- */
  const rankedData = useMemo(() =>
    [...data]
      .sort((a, b) => b.matchCount - a.matchCount)
      .map((item, idx) => ({ ...item, rank: (page - 1) * pageSize + idx + 1 }))
  , [data, page, pageSize])

  /* ---- 列配置 ---- */
  const columnMeta = useMemo(() => [
    { key: 'rank', title: t('promotionWordLibrary.colRank') },
    { key: 'word', title: t('promotionWordLibrary.colWord') },
    { key: 'channel', title: t('promotionWordLibrary.colChannel') },
    { key: 'matchCount', title: t('promotionWordLibrary.colMatchCount') },
    { key: 'updatedBy', title: t('promotionWordLibrary.colUpdatedBy') },
    { key: 'updateTime', title: t('promotionWordLibrary.colUpdateTime') },
    { key: 'status', title: t('common.colStatus') },
    { key: 'remark', title: t('promotionWordLibrary.colRemark') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('promotion-word-library', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ---- 事件处理 ---- */
  const handleSearch = () => {
    setPage(1)
    loadData(1, pageSize)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setPage(1)
    loadData(1, pageSize)
  }

  const handleAdd = () => {
    setEditingRecord(null)
    form.resetFields()
    form.setFieldsValue({ status: true })
    // 重置分词状态
    setSegmentInput('')
    setSegmentResults([])
    setSelectedWords([])
    setIsModalOpen(true)
  }

  const handleEdit = (record: WordLibraryItem) => {
    setEditingRecord(record)
    form.setFieldsValue({
      word: record.word,
      channel: record.channel,
      status: record.status === 1,
      remark: record.remark,
    })
    setIsModalOpen(true)
  }

  const handleDelete = (record: WordLibraryItem) => {
    Modal.confirm({
      title: t('common.confirmDelete'),
      content: t('promotionWordLibrary.deleteWordContent', { word: record.word }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteWordLibraryItem(record.id)
        message.success(t('common.deleteSuccess'))
        loadData()
      },
    })
  }

  const handleToggleStatus = (record: WordLibraryItem) => {
    const actionText = record.status === 1 ? t('common.disable') : t('common.enable')
    const confirmTitle = record.status === 1
      ? t('promotionWordLibrary.disableWordContent', { word: record.word })
      : t('promotionWordLibrary.enableWordContent', { word: record.word })
    Modal.confirm({
      title: confirmTitle,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await toggleWordLibraryStatus(record.id)
        message.success(t('promotionWordLibrary.toggleWordSuccess', { action: actionText, word: record.word }))
        loadData()
      },
    })
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    const channel = values.channel
    const status = values.status ? 1 : 2
    const remark = values.remark

    if (!editingRecord) {
      // 新增模式：收集所有待创建的词条（智能分词与手动输入已合并为同一输入框）
      let wordsToCreate: string[] = []

      if (segmentResults.length > 0) {
        // 已分词：仅创建选中的词条
        wordsToCreate = [...selectedWords]
      } else if (segmentInput.trim()) {
        // 未分词：将输入内容整体作为词条（手动输入模式）
        wordsToCreate = [segmentInput.trim()]
      }

      // 去重
      const uniqueWords = [...new Set(wordsToCreate)]

      if (uniqueWords.length === 0) {
        message.warning(t('promotionWordLibrary.wordRequired'))
        return
      }

      if (uniqueWords.length === 1) {
        // 单条新增
        await createWordLibraryItem({ word: uniqueWords[0], channel, status, remark })
        message.success(t('promotionWordLibrary.addSuccess'))
      } else {
        // 批量新增（逐条创建，跳过已存在的重复词）
        let successCount = 0
        let skipCount = 0
        for (const word of uniqueWords) {
          try {
            await createWordLibraryItem({ word, channel, status, remark })
            successCount++
          } catch {
            skipCount++
          }
        }
        if (skipCount > 0) {
          message.info(t('promotionWordLibrary.batchAddPartial', { success: successCount, skip: skipCount }))
        } else {
          message.success(t('promotionWordLibrary.batchAddSuccess', { count: successCount }))
        }
      }
    } else {
      // 编辑模式：单条更新
      const payload = {
        word: values.word,
        channel,
        status,
        remark,
      }
      await updateWordLibraryItem(editingRecord.id, payload)
      message.success(t('promotionWordLibrary.editSuccess'))
    }
    setIsModalOpen(false)
    loadData()
  }

  /* ---- 分词操作 ---- */
  const handleSegment = async () => {
    if (!segmentInput.trim()) {
      message.warning(t('promotionWordLibrary.segmentInputEmpty'))
      return
    }
    setSegmentLoading(true)
    try {
      const results = await segmentWords(segmentInput)
      setSegmentResults(results)
      setSelectedWords([...results]) // 默认全选
      if (results.length === 0) {
        message.info(t('promotionWordLibrary.segmentNoResult'))
      }
    } catch {
      message.error(t('promotionWordLibrary.segmentError'))
    } finally {
      setSegmentLoading(false)
    }
  }

  const handleToggleWord = (word: string) => {
    setSelectedWords(prev =>
      prev.includes(word) ? prev.filter(w => w !== word) : [...prev, word]
    )
  }

  const handleSelectAllWords = () => {
    if (selectedWords.length === segmentResults.length) {
      setSelectedWords([])
    } else {
      setSelectedWords([...segmentResults])
    }
  }

  const handleExport = () => {
    message.success(t('common.exportSuccess'))
  }

  /* ---- 表格列定义 ---- */
  const columns: TableColumnsType<WordLibraryItem & { rank: number }> = [
    {
      title: t('promotionWordLibrary.colRank'),
      dataIndex: 'rank',
      key: 'rank',
      width: 70,
      align: 'center',
      render: (v: number) => {
        const colors = ['#ff4d4f', '#fa8c16', '#fadb14']
        if (v <= 3) return <Tag color={colors[v - 1]} style={{ fontWeight: 'bold', minWidth: 32, textAlign: 'center' }}>{v}</Tag>
        return <span style={{ color: '#999' }}>{v}</span>
      },
    },
    {
      title: t('promotionWordLibrary.colWord'),
      dataIndex: 'word',
      key: 'word',
      width: 150,
    },
    {
      title: t('promotionWordLibrary.colChannel'),
      dataIndex: 'channel',
      key: 'channel',
      width: 120,
      render: (ch: string) => <Tag>{CHANNEL_LABEL[ch] || ch}</Tag>,
    },
    {
      title: t('promotionWordLibrary.colMatchCount'),
      dataIndex: 'matchCount',
      key: 'matchCount',
      width: 100,
      sorter: (a, b) => a.matchCount - b.matchCount,
      render: (val: number) => <span>{val.toLocaleString()}</span>,
    },
    { title: t('promotionWordLibrary.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 150 },
    { title: t('promotionWordLibrary.colUpdateTime'), dataIndex: 'updateTime', key: 'updateTime', width: 180, render: (v: string) => v ? <span style={{ whiteSpace: 'nowrap' }}>{v}</span> : '-' },
    {
      title: t('common.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (_: unknown, record: WordLibraryItem) => (
        <Switch
          checked={record.status === 1}
          checkedChildren={t('common.enable')}
          unCheckedChildren={t('common.disable')}
          onChange={() => handleToggleStatus(record)}
        />
      ),
    },
    {
      title: t('promotionWordLibrary.colRemark'),
      dataIndex: 'remark',
      key: 'remark',
      width: 200,
      ellipsis: true,
      render: (val: string) =>
        val ? <span title={val}>{val}</span> : <span style={{ color: '#BFBFBF' }}>—</span>,
    },
    {
      title: t('common.colAction'),
      key: 'action',
      width: 80,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>{t('common.edit')}</Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label={t('promotionWordLibrary.keywordLabel')} name="keyword">
            <Input placeholder={t('promotionWordLibrary.placeholderKeyword')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colStatus')} name="status">
            <Select options={statusOptions} defaultValue="all" placeholder={t('common.all')} allowClear />
          </Form.Item>
          <Form.Item label={t('promotionWordLibrary.colChannel')} name="channel">
            <Select options={channelFilterOptions} defaultValue="all" placeholder={t('common.all')} allowClear />
          </Form.Item>
          <Form.Item label={t('promotionWordLibrary.dateRangeLabel')} name="dateRange">
            <RangePicker />
          </Form.Item>
          <Form.Item label={t('promotionWordLibrary.updatedByLabel')} name="updatedBy">
            <Input placeholder={t('promotionWordLibrary.placeholderUpdater')} allowClear />
          </Form.Item>
          <Form.Item label={t('promotionWordLibrary.remarkLabel')} name="remark">
            <Input placeholder={t('promotionWordLibrary.placeholderRemarkKeyword')} allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>{t('common.export')}</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('promotionWordLibrary.addWord')}</Button>
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<WordLibraryItem>
          columns={applyConfig(columns)}
          dataSource={rankedData}
          rowKey="id"
          loading={loading}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showTotal: (total) => t('common.total', { count: total }),
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showQuickJumper: true,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
              loadData(p, ps)
            },
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 1250 }}
        />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? t('promotionWordLibrary.editWord') : t('promotionWordLibrary.addWord')}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {/* 编辑模式：单条词条输入 */}
          {editingRecord && (
            <Form.Item
              label={t('promotionWordLibrary.colWord')}
              name="word"
              rules={[{ required: true, message: t('promotionWordLibrary.placeholderWord') }]}
            >
              <Input placeholder={t('promotionWordLibrary.placeholderWordExample')} />
            </Form.Item>
          )}

          {/* 新增模式：统一输入框（支持直接输入词条 / 输入文本后智能分词多选） */}
          {!editingRecord && (
            <Form.Item label={t('promotionWordLibrary.colWord')} required>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Input.TextArea
                  rows={3}
                  value={segmentInput}
                  onChange={e => setSegmentInput(e.target.value)}
                  placeholder={t('promotionWordLibrary.segmentPlaceholder')}
                  style={{ borderRadius: 6 }}
                />
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={segmentLoading}
                  disabled={!segmentInput.trim()}
                  onClick={handleSegment}
                  style={{ alignSelf: 'flex-end' }}
                >
                  {t('promotionWordLibrary.doSegment')}
                </Button>

                {segmentResults.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, color: '#595959' }}>
                        {t('promotionWordLibrary.segmentResult')}
                        <span style={{ color: '#8C8C8C', marginLeft: 4 }}>
                          ({t('promotionWordLibrary.segmentSelected', { count: selectedWords.length, total: segmentResults.length })})
                        </span>
                      </span>
                      <Button type="link" size="small" onClick={handleSelectAllWords}>
                        {selectedWords.length === segmentResults.length
                          ? t('promotionWordLibrary.segmentDeselectAll')
                          : t('promotionWordLibrary.segmentSelectAll')}
                      </Button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {segmentResults.map(word => {
                        const isSelected = selectedWords.includes(word)
                        return (
                          <Tag
                            key={word}
                            color={isSelected ? '#E8720C' : undefined}
                            style={{
                              cursor: 'pointer',
                              padding: '4px 10px',
                              fontSize: 13,
                              borderRadius: 4,
                              transition: 'all 0.2s',
                              borderColor: isSelected ? '#E8720C' : '#d9d9d9',
                              color: isSelected ? '#fff' : '#595959',
                              backgroundColor: isSelected ? '#E8720C' : '#fafafa',
                            }}
                            onClick={() => handleToggleWord(word)}
                          >
                            {word}
                          </Tag>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </Form.Item>
          )}

          <Form.Item
            label={t('promotionWordLibrary.colChannel')}
            name="channel"
            rules={[{ required: true, message: t('promotionWordLibrary.placeholderSelectChannel') }]}
          >
            <Radio.Group optionType="button" buttonStyle="solid">
              {CHANNEL_OPTIONS.map(opt => (
                <Radio.Button key={opt.value} value={opt.value}>{opt.label}</Radio.Button>
              ))}
            </Radio.Group>
          </Form.Item>
          <Form.Item label={t('common.colStatus')} name="status" valuePropName="checked">
            <Switch checkedChildren={t('common.enable')} unCheckedChildren={t('common.disable')} defaultChecked />
          </Form.Item>
          <Form.Item label={t('promotionWordLibrary.remarkLabel')} name="remark">
            <TextArea placeholder={t('promotionWordLibrary.placeholderRemark')} rows={2} maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>

    </div>
  )
}
