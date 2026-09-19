import { useState, useEffect, useCallback } from 'react'
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  message,
  Progress,
  Popconfirm,
  Tag,
  Empty,
} from 'antd'
import {
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  GlobalOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  LANG_INFO,
  langSysName,
  langNamesOf,
} from '../../../utils/translationConfig'
import {
  fetchLanguages,
  fetchTranslations,
  createLanguage as createLanguageApi,
  deleteLanguage as deleteLanguageApi,
} from '../../../api/translation'
import type { LanguageVO, TranslationVO } from '../../../api/translation'
import { useCountUp } from '../../../hooks/useCountUp'

/* ---- 动画数字组件 ---- */
function AnimatedNumber({ value }: { value: number }) {
  const animated = useCountUp(value)
  return <>{animated.toLocaleString()}</>
}

/* ---- 类型 ---- */
interface LanguageItem {
  code: string
  name: string
  flag: string
  names?: Record<string, string>
  total: number
  translated: number
  rate: number
}

/* ---- 国旗选项（与 TranslationManage 共用数据源） ---- */
const FLAG_OPTIONS = [
  { value: '🇹🇼', label: '🇹🇼 台湾' },
  { value: '🇺🇸', label: '🇺🇸 美国' },
  { value: '🇯🇵', label: '🇯🇵 日本' },
  { value: '🇰🇷', label: '🇰🇷 韩国' },
  { value: '🇷🇺', label: '🇷🇺 俄罗斯' },
  { value: '🇨🇳', label: '🇨🇳 中国' },
  { value: '🇬🇧', label: '🇬🇧 英国' },
  { value: '🇫🇷', label: '🇫🇷 法国' },
  { value: '🇩🇪', label: '🇩🇪 德国' },
  { value: '🇪🇸', label: '🇪🇸 西班牙' },
  { value: '🇮🇹', label: '🇮🇹 意大利' },
  { value: '🇵🇹', label: '🇵🇹 葡萄牙' },
  { value: '🇧🇷', label: '🇧🇷 巴西' },
  { value: '🇹🇭', label: '🇹🇭 泰国' },
  { value: '🇻🇳', label: '🇻🇳 越南' },
  { value: '🇮🇩', label: '🇮🇩 印尼' },
  { value: '🇲🇾', label: '🇲🇾 马来西亚' },
  { value: '🇸🇬', label: '🇸🇬 新加坡' },
  { value: '🇮🇳', label: '🇮🇳 印度' },
  { value: '🇦🇺', label: '🇦🇺 澳大利亚' },
  { value: '🇨🇦', label: '🇨🇦 加拿大' },
  { value: '🌐', label: '🌐 全球（无国旗）' },
]

/** 内置不可删除的语言 */
const BUILTIN_LANGS = new Set(['zh-TW', 'en'])

export default function LanguageConfig() {
  const { t: _t, i18n } = useTranslation()
  const sysLang = i18n.language || 'en'

  const [data, setData] = useState<LanguageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm] = Form.useForm()
  const [editOpen, setEditOpen] = useState(false)
  const [editForm] = Form.useForm()
  const [_editingRecord, setEditingRecord] = useState<LanguageItem | null>(null)

  /* 加载语言列表 + 计算完成率 */
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [langs, fields] = await Promise.all([fetchLanguages(), fetchTranslations()])
      if (langs) {
        const totalFields = fields?.length ?? 0
        const items: LanguageItem[] = langs.map((vo: LanguageVO) => {
          const translated = fields
            ? fields.filter((f: TranslationVO) => (f.translations?.[vo.code] ?? '').trim()).length
            : 0
          return {
            code: vo.code,
            name: vo.name,
            flag: vo.flag,
            names: vo.names,
            total: totalFields,
            translated,
            rate: totalFields > 0 ? Math.round((translated / totalFields) * 100) : 0,
          }
        })
        setData(items)
      }
    } catch {
      /* 全局拦截器已提示 */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  /* 语言代码下拉 */
  const langCodeOptions = Object.keys(LANG_INFO).map(code => ({
    value: code,
    label: `${code} — ${LANG_INFO[code].native}（${langSysName(code, sysLang)}）`,
  }))

  /* 新增语言 */
  const handleAdd = () => {
    addForm.validateFields().then(values => {
      if (data.some(l => l.code === values.code)) {
        message.error('該語言代碼已存在')
        return
      }
      const info = LANG_INFO[values.code]
      createLanguageApi({
        code: values.code,
        name: info?.native || values.code,
        flag: values.flag || info?.flag || '🌐',
        names: langNamesOf(values.code),
      }).then(() => {
        setAddOpen(false)
        addForm.resetFields()
        message.success('語言已添加')
        loadData()
      }).catch(() => { /* 全局拦截器已提示 */ })
    })
  }

  /* 编辑语言 */
  const openEdit = (record: LanguageItem) => {
    setEditingRecord(record)
    editForm.setFieldsValue({ name: record.name, flag: record.flag })
    setEditOpen(true)
  }

  /* 删除语言 */
  const handleDelete = async (code: string) => {
    await deleteLanguageApi(code)
    message.success('語言已移除')
    loadData()
  }

  /* 表格列 */
  const columns = [
    {
      title: '國旗',
      key: 'flag',
      width: 60,
      render: (_: unknown, r: LanguageItem) => <span style={{ fontSize: 20 }}>{r.flag}</span>,
    },
    {
      title: '語言代碼',
      dataIndex: 'code',
      key: 'code',
      width: 120,
      render: (code: string) => <code style={{ color: '#E8720C', fontWeight: 600 }}>{code}</code>,
    },
    {
      title: '母語名稱',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '系統顯示名',
      key: 'sysName',
      width: 150,
      render: (_: unknown, r: LanguageItem) => langSysName(r.code, sysLang),
    },
    {
      title: '翻譯完成率',
      key: 'rate',
      width: 240,
      render: (_: unknown, r: LanguageItem) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Progress
            percent={r.rate}
            size="small"
            status={r.rate >= 60 ? 'success' : r.rate > 0 ? 'normal' : 'exception'}
            style={{ flex: 1, margin: 0 }}
          />
          <span style={{ fontSize: 12, color: '#8C8C8C', whiteSpace: 'nowrap' }}>
            {r.translated}/{r.total}
          </span>
        </div>
      ),
    },
    {
      title: '狀態',
      key: 'status',
      width: 100,
      render: (_: unknown, r: LanguageItem) => {
        if (r.rate >= 60) return <Tag color="success">就緒</Tag>
        if (r.rate > 0) return <Tag color="warning">部分完成</Tag>
        return <Tag color="error">未配置</Tag>
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right' as const,
      render: (_: unknown, r: LanguageItem) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
            編輯
          </Button>
          {!BUILTIN_LANGS.has(r.code) && (
            <Popconfirm
              title="確定要移除此語言嗎？移除後該語言的所有翻譯將被清除。"
              onConfirm={() => handleDelete(r.code)}
              okText="確認"
              cancelText="取消"
            >
              <Button type="link" size="small" danger>移除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  /* 统计 */
  const totalLangs = data.length
  const readyLangs = data.filter(d => d.rate >= 60).length
  const avgRate = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.rate, 0) / data.length) : 0

  return (
    <div className="content-area">
      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        {[
          { label: '已註冊語言', value: totalLangs, color: '#1890FF', bgColor: '#E6F7FF' },
          { label: '就緒語言', value: readyLangs, color: '#52C41A', bgColor: '#F6FFED' },
          { label: '平均完成率', value: avgRate, color: '#FA8C16', bgColor: '#FFF7E6', suffix: '%' },
          { label: '待完善語言', value: totalLangs - readyLangs, color: '#722ED1', bgColor: '#F9F0FF' },
        ].map((card, i) => (
          <div
            key={i}
            className="home-section"
            style={{
              padding: 16,
              textAlign: 'center',
              cursor: 'default',
              background: card.bgColor,
              border: `1px solid ${card.color}22`,
              borderRadius: 12,
              position: 'relative',
              overflow: 'hidden',
              transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div style={{ fontSize: 20, color: card.color, marginBottom: 4 }}><GlobalOutlined /></div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>
              <AnimatedNumber value={card.value} />{card.suffix || ''}
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            新增語言
          </Button>
        </div>
      </div>

      {/* 列表 */}
      <div className="table-section">
        <Table
          columns={columns}
          dataSource={data}
          rowKey="code"
          loading={loading}
          pagination={false}
          locale={{ emptyText: <Empty description="暫無已註冊語言" /> }}
          size="middle"
        />
      </div>

      {/* 新增语言弹窗 */}
      <Modal
        title="新增語言"
        open={addOpen}
        onOk={handleAdd}
        onCancel={() => { setAddOpen(false); addForm.resetFields() }}
        okText="確認"
        cancelText="取消"
        width={420}
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="code"
            label="語言代碼"
            rules={[{ required: true, message: '請選擇語言代碼' }]}
          >
            <Select
              showSearch
              placeholder="請選擇語言"
              options={langCodeOptions}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              onChange={(code: string) => {
                const info = LANG_INFO[code]
                if (info) addForm.setFieldsValue({ flag: info.flag })
              }}
            />
          </Form.Item>
          <Form.Item name="flag" label="國旗">
            <Select
              showSearch
              placeholder="請選擇國旗"
              allowClear
              options={FLAG_OPTIONS}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑语言弹窗（暂保留，后续可扩展） */}
      <Modal
        title="編輯語言"
        open={editOpen}
        onCancel={() => { setEditOpen(false); setEditingRecord(null); editForm.resetFields() }}
        footer={null}
        width={420}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="母語名稱">
            <Input disabled />
          </Form.Item>
          <Form.Item name="flag" label="國旗">
            <Select options={FLAG_OPTIONS} placeholder="請選擇國旗" allowClear />
          </Form.Item>
          <div style={{ textAlign: 'right' }}>
            <Button onClick={() => { setEditOpen(false); setEditingRecord(null) }}>取消</Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
