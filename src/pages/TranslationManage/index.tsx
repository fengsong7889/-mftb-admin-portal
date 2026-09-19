import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Popconfirm,
  Modal,
  Form,
  message,
  Empty,
} from 'antd'
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  DeleteOutlined,
  ExportOutlined,
  GlobalOutlined,
  ImportOutlined,
  SyncOutlined,
  TranslationOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  LANG_INFO,
  langNamesOf,
  langSysName,
} from '../../utils/translationConfig'
import {
  fetchTranslations,
  fetchLanguages,
  createTranslation,
  updateTranslation,
  deleteTranslation as deleteTranslationApi,
  createLanguage as createLanguageApi,
  deleteLanguage as deleteLanguageApi,
  machineTranslate as machineTranslateApi,
} from '../../api/translation'
import type { TranslationVO, LanguageVO } from '../../api/translation'
import { useTranslation } from 'react-i18next'
import { useCountUp } from '../../hooks/useCountUp'

/* ---- 动画数字组件 ---- */
function AnimatedNumber({ value }: { value: number }) {
  const animated = useCountUp(value)
  return <>{animated.toLocaleString()}</>
}

/* ---- 类型定义 ---- */
interface TranslationField {
  id: string
  fieldKey: string
  category: string
  description: string
  translations: Record<string, string> // langCode → translation text
  source?: 'manual' | 'sync' // 来源：手动新增 / 系统自动同步
}

interface Language {
  code: string
  name: string // 母语名称
  flag: string
  names?: Record<string, string> // 各系统语言下的显示名称
}

/* ---- 常量 ---- */
const CATEGORIES = [
  { value: 'common', labelKey: 'translationManage:catCommon' },
  { value: 'status', labelKey: 'translationManage:catStatus' },
  { value: 'action', labelKey: 'translationManage:catAction' },
  { value: 'menu', labelKey: 'translationManage:catMenu' },
  { value: 'biz', labelKey: 'translationManage:catBiz' },
]

const CATEGORY_COLOR: Record<string, string> = {
  common: 'blue',
  status: 'green',
  action: 'orange',
  menu: 'purple',
  biz: 'cyan',
}

/** 分类 → Key 前缀（选择分类后自动带出） */
const CATEGORY_KEY_PREFIX: Record<string, string> = {
  common: 'common.',
  status: 'status.',
  action: 'action.',
  menu: 'menu.',
  biz: 'biz.',
}
const ALL_KEY_PREFIXES = Object.values(CATEGORY_KEY_PREFIX)

/** 按分类前缀重写 Key：替换旧前缀为新分类前缀，保留用户自定义部分 */
function applyCategoryPrefix(category: string, currentKey: string): string {
  const prefix = CATEGORY_KEY_PREFIX[category] || ''
  let rest = (currentKey || '').trim()
  for (const p of ALL_KEY_PREFIXES) {
    if (rest.startsWith(p)) {
      rest = rest.slice(p.length)
      break
    }
  }
  return prefix + rest
}

/** 生成唯一 Key：前缀 + field 递增序号 */
function genUniqueKey(prefix: string, existingKeys: string[]): string {
  let i = 1
  let key = `${prefix}field${i}`
  while (existingKeys.includes(key)) {
    i += 1
    key = `${prefix}field${i}`
  }
  return key
}


/** 初始语言列表：默认展示语言代码库的所有语言 */
const _INITIAL_LANGUAGES: Language[] = Object.keys(LANG_INFO).map(code => ({
  code,
  name: LANG_INFO[code].native,
  flag: LANG_INFO[code].flag,
  names: langNamesOf(code),
}))

/** 国旗选项（可搜索下拉） */
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
  { value: '🇲🇽', label: '🇲🇽 墨西哥' },
  { value: '🇹🇭', label: '🇹🇭 泰国' },
  { value: '🇻🇳', label: '🇻🇳 越南' },
  { value: '🇮🇩', label: '🇮🇩 印尼' },
  { value: '🇲🇾', label: '🇲🇾 马来西亚' },
  { value: '🇸🇬', label: '🇸🇬 新加坡' },
  { value: '🇵🇭', label: '🇵🇭 菲律宾' },
  { value: '🇮🇳', label: '🇮🇳 印度' },
  { value: '🇵🇰', label: '🇵🇰 巴基斯坦' },
  { value: '🇸🇦', label: '🇸🇦 沙特阿拉伯' },
  { value: '🇦🇪', label: '🇦🇪 阿联酋' },
  { value: '🇹🇷', label: '🇹🇷 土耳其' },
  { value: '🇪🇬', label: '🇪🇬 埃及' },
  { value: '🇿🇦', label: '🇿🇦 南非' },
  { value: '🇳🇬', label: '🇳🇬 尼日利亚' },
  { value: '🇦🇺', label: '🇦🇺 澳大利亚' },
  { value: '🇳🇿', label: '🇳🇿 新西兰' },
  { value: '🇨🇦', label: '🇨🇦 加拿大' },
  { value: '🇸🇪', label: '🇸🇪 瑞典' },
  { value: '🇳🇴', label: '🇳🇴 挪威' },
  { value: '🇩🇰', label: '🇩🇰 丹麦' },
  { value: '🇫🇮', label: '🇫🇮 芬兰' },
  { value: '🇵🇱', label: '🇵🇱 波兰' },
  { value: '🇺🇦', label: '🇺🇦 乌克兰' },
  { value: '🇷🇴', label: '🇷🇴 罗马尼亚' },
  { value: '🇭🇺', label: '🇭🇺 匈牙利' },
  { value: '🇨🇿', label: '🇨🇿 捷克' },
  { value: '🇮🇱', label: '🇮🇱 以色列' },
  { value: '🇦🇷', label: '🇦🇷 阿根廷' },
  { value: '🇨🇱', label: '🇨🇱 智利' },
  { value: '🇨🇴', label: '🇨🇴 哥伦比亚' },
  { value: '🇵🇪', label: '🇵🇪 秘鲁' },
  { value: '🇲🇲', label: '🇲🇲 缅甸' },
  { value: '🇰🇭', label: '🇰🇭 柬埔寨' },
  { value: '🇱🇦', label: '🇱🇦 老挝' },
  { value: '🇧🇩', label: '🇧🇩 孟加拉' },
  { value: '🇱🇰', label: '🇱🇰 斯里兰卡' },
  { value: '🇳🇵', label: '🇳🇵 尼泊尔' },
  { value: '🌐', label: '🌐 全球（无国旗）' },
]

/* ---- 后端 VO ↔ 前端模型映射 ---- */
function voToField(vo: TranslationVO): TranslationField {
  return {
    id: String(vo.id),
    fieldKey: vo.fieldKey,
    category: vo.category,
    description: vo.fieldName,
    translations: vo.translations || {},
    source: vo.source === 'sync' ? 'sync' : 'manual',
  }
}

function voToLang(vo: LanguageVO): Language {
  return { code: vo.code, name: vo.name, flag: vo.flag, names: vo.names }
}

/** 合并语言列表与语言代码库（默认展示所有语言） */
function _mergeLangsWithLibrary(list: Language[]): Language[] {
  const merged = [...list]
  Object.keys(LANG_INFO).forEach(code => {
    if (!merged.some(l => l.code === code)) {
      merged.push({
        code,
        name: LANG_INFO[code].native,
        flag: LANG_INFO[code].flag,
        names: langNamesOf(code),
      })
    }
  })
  return merged
}

/* ---- 组件 ---- */
export default function TranslationManage() {
  const { t, i18n } = useTranslation()
  const sysLang = i18n.language || 'en'

  /** 语言代码下拉选项：括号内的名称跟随当前全局语言 */
  const langCodeOptions = useMemo(
    () =>
      Object.keys(LANG_INFO).map(code => ({
        value: code,
        label: `${code} — ${LANG_INFO[code].native}（${langSysName(code, sysLang)}）`,
      })),
    [sysLang]
  )

  /** 语言列标题：显示当前全局语言下的语言名称 */
  const getLangHeaderName = useCallback(
    (lang: Language) => lang.names?.[sysLang] || langSysName(lang.code, sysLang),
    [sysLang]
  )

  /* 状态 */
  const [data, setData] = useState<TranslationField[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [loading, setLoading] = useState(false)
  const [searchKey, setSearchKey] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [editingCell, setEditingCell] = useState<{ rowId: string; langCode: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // 新增字段弹窗
  const [addFieldOpen, setAddFieldOpen] = useState(false)
  const [addFieldForm] = Form.useForm()

  // 编辑字段弹窗
  const [editFieldOpen, setEditFieldOpen] = useState(false)
  const [editFieldForm] = Form.useForm()
  const [editingRecord, setEditingRecord] = useState<TranslationField | null>(null)

  // 新增语言弹窗
  const [addLangOpen, setAddLangOpen] = useState(false)
  const [addLangForm] = Form.useForm()

  // 后端对接模式（后端不可用时降级 localStorage）
  const [backendMode, setBackendMode] = useState(false)

  /* 从后端重新拉取数据 */
  const reloadFields = useCallback(async () => {
    const list = await fetchTranslations()
    if (list) setData(list.map(voToField))
  }, [])

  const reloadLanguages = useCallback(async () => {
    const list = await fetchLanguages()
    if (list) setLanguages(list.map(voToLang))
  }, [])

  /* 初始化：从后端加载数据 */
  useEffect(() => {
    setLoading(true)
    ;(async () => {
      try {
        const [fields, langs] = await Promise.all([fetchTranslations(), fetchLanguages()])
        if (fields && langs) {
          setData(fields.map(voToField))
          setLanguages(langs.map(voToLang))
          setBackendMode(true)
          return
        }
      } catch {
        /* 后端不可用，显示空状态 */
      }
      setData([])
      setLanguages([])
      setBackendMode(false)
    })().finally(() => setLoading(false))
  }, [])

  /* 数据更新 */
  const updateData = useCallback((newData: TranslationField[]) => {
    setData(newData)
  }, [])

  const updateLanguages = useCallback((newLangs: Language[]) => {
    setLanguages(newLangs)
  }, [])

  /* 过滤数据 */
  const filteredData = useMemo(() => {
    return data.filter(item => {
      if (filterCategory && item.category !== filterCategory) return false
      if (filterStatus === 'complete') {
        const isComplete = languages.every(l => item.translations[l.code]?.trim())
        if (!isComplete) return false
      } else if (filterStatus === 'incomplete') {
        const isComplete = languages.every(l => item.translations[l.code]?.trim())
        if (isComplete) return false
      }
      if (searchKey) {
        const kw = searchKey.toLowerCase()
        return (
          item.fieldKey.toLowerCase().includes(kw) ||
          item.description.toLowerCase().includes(kw) ||
          Object.values(item.translations).some(v => v.toLowerCase().includes(kw))
        )
      }
      return true
    })
  }, [data, filterCategory, filterStatus, searchKey, languages])

  const tCategories = useMemo(() => CATEGORIES.map(c => ({ value: c.value, label: t(c.labelKey) })), [t])

  /* 统计 */
  const stats = useMemo(() => {
    const total = data.length
    const complete = data.filter(f =>
      languages.every(l => f.translations[l.code]?.trim())
    ).length
    const incomplete = total - complete
    return { total, complete, incomplete }
  }, [data, languages])

  /* 字段名称重复温和提示（不拦截，仅提醒） */
  const addFieldName = Form.useWatch('description', addFieldForm)
  const addNameDup = useMemo(() => {
    const name = (addFieldName || '').trim()
    if (!name) return false
    return data.some(item => item.description.trim() === name)
  }, [addFieldName, data])

  const editFieldName = Form.useWatch('description', editFieldForm)
  const editNameDup = useMemo(() => {
    const name = (editFieldName || '').trim()
    if (!name || !editingRecord) return false
    return data.some(item => item.id !== editingRecord.id && item.description.trim() === name)
  }, [editFieldName, data, editingRecord])

  /* 编辑单元格 */
  const startEdit = (rowId: string, langCode: string, currentValue: string) => {
    setEditingCell({ rowId, langCode })
    setEditValue(currentValue || '')
  }

  const saveEdit = async () => {
    if (!editingCell) return
    const target = data.find(item => item.id === editingCell.rowId)
    if (backendMode && target) {
      await updateTranslation(Number(target.id), {
        fieldName: target.description,
        category: target.category,
        fieldKey: target.fieldKey,
        translations: { ...target.translations, [editingCell.langCode]: editValue },
      })
      await reloadFields()
    } else {
      const newData = data.map(item => {
        if (item.id === editingCell.rowId) {
          return {
            ...item,
            translations: { ...item.translations, [editingCell.langCode]: editValue },
          }
        }
        return item
      })
      updateData(newData)
    }
    setEditingCell(null)
    setEditValue('')
    message.success(t('translationManage:msgSaved'))
  }

  const cancelEdit = () => {
    setEditingCell(null)
    setEditValue('')
  }

  /* 删除字段 */
  const deleteField = async (id: string) => {
    if (backendMode) {
      await deleteTranslationApi(Number(id))
      await reloadFields()
    } else {
      updateData(data.filter(item => item.id !== id))
    }
    message.success(t('translationManage:msgDeleted'))
  }

  /* 编辑字段 */
  const openEditField = (record: TranslationField) => {
    setEditingRecord(record)
    const formValues: Record<string, string> = {
      fieldKey: record.fieldKey,
      category: record.category,
      description: record.description,
    }
    languages.forEach(l => {
      formValues[`lang_${l.code}`] = record.translations[l.code] || ''
    })
    editFieldForm.setFieldsValue(formValues)
    setEditFieldOpen(true)
  }

  const handleEditField = () => {
    if (!editingRecord) return
    editFieldForm.validateFields().then(values => {
      // Key：留空保持原值；填写则校验全局唯一（排除自身）
      let finalKey = (values.fieldKey || '').trim()
      if (!finalKey) {
        finalKey = editingRecord.fieldKey
      } else if (data.some(item => item.id !== editingRecord.id && item.fieldKey === finalKey)) {
        message.error(t('translationManage:msgKeyExists'))
        return
      }
      if (backendMode) {
        // 后端统一校验 Key 唯一性，报错信息直接展示
        const translations: Record<string, string> = {}
        languages.forEach(l => {
          translations[l.code] = values[`lang_${l.code}`] || ''
        })
        updateTranslation(Number(editingRecord.id), {
          fieldKey: finalKey,
          fieldName: (values.description || '').trim(),
          category: values.category,
          translations,
        })
          .then(() => {
            setEditFieldOpen(false)
            setEditingRecord(null)
            editFieldForm.resetFields()
            message.success(t('translationManage:msgSaved'))
            return reloadFields()
          })
          .catch(() => { /* 全局拦截器已提示 */ })
        return
      }
      const newData = data.map(item => {
        if (item.id === editingRecord.id) {
          const translations: Record<string, string> = {}
          languages.forEach(l => {
            translations[l.code] = values[`lang_${l.code}`] || ''
          })
          return {
            ...item,
            fieldKey: finalKey,
            category: values.category,
            description: (values.description || '').trim(),
            translations,
          }
        }
        return item
      })
      updateData(newData)
      setEditFieldOpen(false)
      setEditingRecord(null)
      editFieldForm.resetFields()
      message.success(t('translationManage:msgSaved'))
    })
  }

  /* 新增字段 */
  const handleAddField = () => {
    addFieldForm.validateFields().then(values => {
      const category = values.category || 'biz'
      const prefix = CATEGORY_KEY_PREFIX[category] || 'biz.'
      // Key：优先用用户填写的，留空则自动生成；Key 必须全局唯一
      let finalKey = (values.fieldKey || '').trim()
      if (!finalKey || finalKey === prefix) {
        finalKey = genUniqueKey(prefix, data.map(d => d.fieldKey))
      } else if (data.some(item => item.fieldKey === finalKey)) {
        message.error(t('translationManage:msgKeyExists'))
        return
      }
      if (backendMode) {
        const translations: Record<string, string> = {}
        languages.forEach(l => {
          translations[l.code] = values[`lang_${l.code}`] || ''
        })
        createTranslation({
          fieldKey: finalKey,
          fieldName: (values.description || '').trim(),
          category,
          translations,
          source: 'manual',
        })
          .then(() => {
            setAddFieldOpen(false)
            addFieldForm.resetFields()
            message.success(t('translationManage:msgFieldAdded'))
            return reloadFields()
          })
          .catch(() => { /* 全局拦截器已提示 */ })
        return
      }
      const newField: TranslationField = {
        id: String(Date.now()),
        fieldKey: finalKey,
        category,
        description: (values.description || '').trim(),
        translations: {},
        source: 'manual',
      }
      // 初始化各语言翻译
      languages.forEach(l => {
        newField.translations[l.code] = values[`lang_${l.code}`] || ''
      })
      updateData([...data, newField])
      setAddFieldOpen(false)
      addFieldForm.resetFields()
      message.success(t('translationManage:msgFieldAdded'))
    })
  }

  /* 新增语言 */
  const handleAddLanguage = () => {
    addLangForm.validateFields().then(values => {
      if (languages.some(l => l.code === values.code)) {
        message.error(t('translationManage:msgLangCodeExists'))
        return
      }
      const info = LANG_INFO[values.code]
      const newLang: Language = {
        code: values.code,
        name: info?.native || values.code,
        flag: values.flag || info?.flag || '🌐',
        names: langNamesOf(values.code),
      }
      if (backendMode) {
        createLanguageApi({ code: newLang.code, name: newLang.name, flag: newLang.flag, names: newLang.names })
          .then(() => {
            setAddLangOpen(false)
            addLangForm.resetFields()
            message.success(t('translationManage:msgLangAdded'))
            return reloadLanguages()
          })
          .catch(() => { /* 全局拦截器已提示 */ })
        return
      }
      updateLanguages([...languages, newLang])
      setAddLangOpen(false)
      addLangForm.resetFields()
      message.success(t('translationManage:msgLangAdded'))
    })
  }

  /* 删除语言 */
  const deleteLanguage = async (code: string) => {
    if (backendMode) {
      await deleteLanguageApi(code)
      await reloadLanguages()
      message.success(t('translationManage:msgLangRemoved'))
      return
    }
    const newLangs = languages.filter(l => l.code !== code)
    updateLanguages(newLangs)
    // 同时清除数据中该语言的翻译
    const newData = data.map(item => {
      const t = { ...item.translations }
      delete t[code]
      return { ...item, translations: t }
    })
    updateData(newData)
    message.success(t('translationManage:msgLangRemoved'))
  }

  /* 同步未翻译字段：已废弃，后端自动收集写入 */
  const handleSyncFields = async () => {
    message.info(t('translationManage:msgSyncComplete'))
  }

  /* 机翻单行：调用后端 MyMemory API 填充该字段所有空缺翻译 */
  const machineTranslateRow = async (record: TranslationField) => {
    try {
      const result = await machineTranslateApi({ ids: [Number(record.id)] })
      if (result.filled === 0) {
        message.info(t('translationManage:msgTranslationComplete'))
        return
      }
      await reloadFields()
      message.success(t('translationManage:msgMtCount', { count: result.filled }))
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && /timeout/i.test(err.message)
      message.error(isTimeout
        ? '機翻請求超時，請稍後重試或減少字段數量'
        : t('translationManage:msgMtFailed'))
    }
  }

  /* 一键机翻：分批调用后端 API，避免大量字段一次性超时 */
  const [mtProgress, setMtProgress] = useState<{ current: number; total: number; filled: number } | null>(null)

  const handleMachineTranslateAll = async () => {
    // 收集所有有空缺的字段 ID
    const incompleteIds = data
      .filter(item => languages.some(l => l.code !== 'zh-TW' && !item.translations[l.code]?.trim()))
      .map(item => Number(item.id))
    if (incompleteIds.length === 0) {
      message.info(t('translationManage:msgNoMachineTranslate'))
      return
    }

    const BATCH_SIZE = 30
    let totalFilled = 0
    setMtProgress({ current: 0, total: incompleteIds.length, filled: 0 })

    try {
      for (let i = 0; i < incompleteIds.length; i += BATCH_SIZE) {
        const batch = incompleteIds.slice(i, i + BATCH_SIZE)
        setMtProgress({ current: Math.min(i + BATCH_SIZE, incompleteIds.length), total: incompleteIds.length, filled: totalFilled })
        const result = await machineTranslateApi({ ids: batch })
        totalFilled += result.filled
        // 批次间短暂延迟，避免 MyMemory API 限流
        if (i + BATCH_SIZE < incompleteIds.length) {
          await new Promise(r => setTimeout(r, 300))
        }
      }
      await reloadFields()
      setMtProgress(null)
      if (totalFilled === 0) {
        message.info(t('translationManage:msgTranslationComplete'))
      } else {
        message.success(t('translationManage:msgBatchMtCount', { count: totalFilled }))
      }
    } catch (err: unknown) {
      setMtProgress(null)
      const isTimeout = err instanceof Error && /timeout/i.test(err.message)
      message.error(isTimeout
        ? `機翻請求超時（共 ${incompleteIds.length} 個字段），請稍後重試或分批處理`
        : t('translationManage:msgMtFailed'))
    }
  }

  /* 表格列 */
  const baseColumns = [
    {
      title: t('translationManage:colFieldName'),
      dataIndex: 'description',
      key: 'description',
      width: 200,
      fixed: 'left' as const,
      render: (desc: string, record: TranslationField) => (
        <div>
          <div style={{ fontWeight: 600, color: '#262626', fontSize: 13 }}>
            {desc || '-'}
            {record.source === 'sync' && (
              <Tag color="blue" style={{ marginLeft: 6, fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>{t('translationManage:syncTag')}</Tag>
            )}
          </div>
        </div>
      ),
    },
    {
      title: t('translationManage:colFieldKey'),
      dataIndex: 'fieldKey',
      key: 'fieldKey',
      width: 180,
      fixed: 'left' as const,
      render: (text: string) => <code style={{ color: '#E8720C', fontWeight: 600, fontSize: 12 }}>{text}</code>,
    },
    {
      title: t('translationManage:colCategory'),
      dataIndex: 'category',
      key: 'category',
      width: 100,
      fixed: 'left' as const,
      render: (cat: string) => {
        const catLabel = CATEGORIES.find(c => c.value === cat)
        const displayLabel = catLabel ? t(catLabel.labelKey) : cat
        return <Tag color={CATEGORY_COLOR[cat] || 'default'}>{displayLabel}</Tag>
      },
    },
  ]

  const langColumns = languages.map(lang => ({
    title: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>{lang.flag}</span>
        <span style={{ fontSize: 12 }}>{getLangHeaderName(lang)}</span>
        {lang.code !== 'zh-TW' && (
          <Popconfirm
            title={t('translationManage:confirmRemoveLang')}
            onConfirm={() => deleteLanguage(lang.code)}
            okText={t('common:confirm')}
            cancelText={t('common:cancel')}
          >
            <DeleteOutlined style={{ fontSize: 11, color: '#ff4d4f', marginLeft: 2 }} />
          </Popconfirm>
        )}
      </div>
    ),
    dataIndex: ['translations', lang.code],
    key: `lang_${lang.code}`,
    width: 180,
    render: (_: unknown, record: TranslationField) => {
      const value = record.translations[lang.code] || ''
      const isEditing = editingCell?.rowId === record.id && editingCell?.langCode === lang.code
      const isEmpty = !value.trim()

      if (isEditing) {
        return (
          <Input
            size="small"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onPressEnter={saveEdit}
            onBlur={saveEdit}
            onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
            autoFocus
            style={{ fontSize: 13 }}
          />
        )
      }

      return (
        <div
          onClick={() => startEdit(record.id, lang.code, value)}
          style={{
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: 4,
            minHeight: 28,
            display: 'flex',
            alignItems: 'center',
            background: isEmpty ? '#FFF7E6' : 'transparent',
            border: isEmpty ? '1px dashed #FAAD14' : '1px solid transparent',
            transition: 'all 0.2s',
          }}
          className="translation-cell"
        >
          {isEmpty ? (
            <span style={{ color: '#FAAD14', fontSize: 12, fontStyle: 'italic' }}>{t('translationManage:clickTranslate')}</span>
          ) : (
            <span style={{ fontSize: 13, color: '#262626' }}>{value}</span>
          )}
        </div>
      )
    },
  }))

  const actionColumn = {
    title: t('common:colAction'),
    key: 'action',
    width: 170,
    fixed: 'right' as const,
    render: (_: unknown, record: TranslationField) => (
      <Space size={0} split={<span className="action-split">|</span>}>
        <Button type="link" size="small" onClick={() => openEditField(record)}>{t('translationManage:btnEdit')}</Button>
        <Button type="link" size="small" onClick={() => machineTranslateRow(record)}>{t('translationManage:btnMachineTranslate')}</Button>
        <Popconfirm
          title={t('translationManage:confirmDeleteField')}
          onConfirm={() => deleteField(record.id)}
          okText={t('common:confirm')}
          cancelText={t('common:cancel')}
        >
          <Button type="link" danger size="small">{t('common:delete')}</Button>
        </Popconfirm>
      </Space>
    ),
  }

  const columns = [...baseColumns, ...langColumns, actionColumn]

  /* 列配置 */
  const columnMeta = useMemo(() => [
    { key: 'description', title: t('translationManage:colFieldName') },
    { key: 'fieldKey', title: t('translationManage:colFieldKey') },
    { key: 'category', title: t('translationManage:colCategory') },
    ...languages.map(lang => ({ key: `lang_${lang.code}`, title: `${lang.flag} ${getLangHeaderName(lang)}` })),
    { key: 'action', title: t('common:colAction') },
  ], [languages, sysLang])

  const { configComponent, applyConfig } = useColumnConfig('translation-manage', columnMeta, [
    { key: 'description', visible: true, locked: 'head' as const },
    { key: 'fieldKey', visible: true, locked: 'head' as const },
    { key: 'category', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const configuredColumns = applyConfig(columns)

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('translationManage:keywordLabel')}>
            <Input
              placeholder={t('translationManage:searchPlaceholder')}
              allowClear
              value={searchKey}
              onChange={e => setSearchKey(e.target.value)}
            />
          </Form.Item>
          <Form.Item label={t('translationManage:categoryLabel')}>
            <Select
              placeholder={t('common:all')}
              allowClear
              value={filterCategory || undefined}
              onChange={v => setFilterCategory(v || '')}
              options={tCategories}
            />
          </Form.Item>
          <Form.Item label={t('translationManage:statusLabel')}>
            <Select
              placeholder={t('common:all')}
              allowClear
              value={filterStatus || undefined}
              onChange={v => setFilterStatus(v || '')}
            >
              <Select.Option value="incomplete">{t('translationManage:statusIncomplete')}</Select.Option>
              <Select.Option value="complete">{t('translationManage:statusComplete')}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>{t('common:search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { setSearchKey(''); setFilterCategory(''); setFilterStatus('') }}>{t('common:reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        {[
          { label: t('translationManage:statTotalFields'), value: stats.total, color: '#1890FF', bgColor: '#E6F7FF' },
          { label: t('translationManage:statComplete'), value: stats.complete, color: '#52C41A', bgColor: '#F6FFED', icon: <CheckCircleOutlined /> },
          { label: t('translationManage:statIncomplete'), value: stats.incomplete, color: '#FAAD14', bgColor: '#FFF7E6', icon: <ExclamationCircleOutlined /> },
          { label: t('translationManage:statLanguages'), value: languages.length, color: '#722ED1', bgColor: '#F9F0FF' },
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
            <div style={{ fontSize: 20, color: card.color, marginBottom: 4 }}>{card.icon || <GlobalOutlined />}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}><AnimatedNumber value={card.value} /></div>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button icon={<TranslationOutlined />} onClick={handleMachineTranslateAll} disabled={mtProgress !== null}>
            {mtProgress
              ? `翻譯中… ${mtProgress.current}/${mtProgress.total}（已填充 ${mtProgress.filled}）`
              : t('translationManage:btnBatchTranslate')}
          </Button>
          <Button icon={<SyncOutlined />} onClick={handleSyncFields}>{t('translationManage:btnSyncFields')}</Button>
          <Button className="btn-export" icon={<ExportOutlined />}>{t('common:export')}</Button>
          <Button className="btn-import" icon={<ImportOutlined />}>{t('common:batchImport')}</Button>
        </div>
        <div className="action-section-right">
          <Button icon={<GlobalOutlined />} onClick={() => setAddLangOpen(true)}>{t('translationManage:btnAddLanguage')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            addFieldForm.setFieldsValue({ category: 'biz', fieldKey: 'biz.' })
            setAddFieldOpen(true)
          }}>{t('translationManage:btnAddField')}</Button>
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table
        columns={configuredColumns}
        dataSource={filteredData}
        rowKey="id"
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        loading={loading}
        scroll={{ x: 480 + languages.length * 180 + 220 }}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          pageSize: 20,
          showTotal: total => t('common:total', { count: total }),
        }}
        locale={{
          emptyText: <Empty description={t('translationManage:noData')} />,
        }}
        size="middle"
      />
      </div>

      {/* 新增字段弹窗 */}
      <Modal
        title={t('translationManage:addFieldTitle')}
        open={addFieldOpen}
        onOk={handleAddField}
        onCancel={() => { setAddFieldOpen(false); addFieldForm.resetFields() }}
        okText={t('common:confirm')}
        cancelText={t('common:cancel')}
        width={600}
      >
        <Form form={addFieldForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="category" label={t('translationManage:categoryLabel')} initialValue="biz">
            <Select
              options={tCategories}
              placeholder={t('translationManage:categoryPh')}
              onChange={(cat: string) => {
                const cur = addFieldForm.getFieldValue('fieldKey') || ''
                addFieldForm.setFieldsValue({ fieldKey: applyCategoryPrefix(cat, cur) })
              }}
            />
          </Form.Item>
          <Form.Item
            name="fieldKey"
            label={t('translationManage:fieldKeyLabel')}
            extra={t('translationManage:fieldKeyExtra')}
          >
            <Input placeholder={t('translationManage:selectPrefixPh')} />
          </Form.Item>
          <Form.Item
            name="description"
            label={t('translationManage:fieldNameLabel')}
            rules={[{ required: true, message: t('translationManage:fieldNameRequired') }]}
            validateStatus={addNameDup ? 'warning' : undefined}
            extra={addNameDup
              ? t('translationManage:dupNameWarning')
              : t('translationManage:fieldNameHint')}
          >
            <Input placeholder={t('translationManage:fieldNamePh')} />
          </Form.Item>
          <div style={{ borderTop: '1px dashed #f0f0f0', paddingTop: 12, marginTop: 4, marginBottom: 4 }}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>{t('translationManage:translationSectionHint')}</div>
          </div>
          {languages.map(lang => (
            <Form.Item key={lang.code} name={`lang_${lang.code}`} label={`${lang.flag} ${getLangHeaderName(lang)}`}>
              <Input placeholder={t('translationManage:langTranslationPh', { lang: getLangHeaderName(lang) })} />
            </Form.Item>
          ))}
        </Form>
      </Modal>

      {/* 编辑字段弹窗 */}
      <Modal
        title={t('translationManage:editFieldTitle')}
        open={editFieldOpen}
        onOk={handleEditField}
        onCancel={() => { setEditFieldOpen(false); setEditingRecord(null); editFieldForm.resetFields() }}
        okText={t('common:save')}
        cancelText={t('common:cancel')}
        width={600}
      >
        <Form form={editFieldForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="category" label={t('translationManage:categoryLabel')}>
            <Select
              options={tCategories}
              placeholder={t('translationManage:categoryEditPh')}
              onChange={(cat: string) => {
                const cur = editFieldForm.getFieldValue('fieldKey') || ''
                editFieldForm.setFieldsValue({ fieldKey: applyCategoryPrefix(cat, cur) })
              }}
            />
          </Form.Item>
          <Form.Item
            name="fieldKey"
            label={t('translationManage:fieldKeyLabel')}
            extra={t('translationManage:fieldKeyEditExtra')}
          >
            <Input placeholder={t('translationManage:fieldKeyPh')} />
          </Form.Item>
          <Form.Item
            name="description"
            label={t('translationManage:fieldNameLabel')}
            rules={[{ required: true, message: t('translationManage:fieldNameRequired') }]}
            validateStatus={editNameDup ? 'warning' : undefined}
            extra={editNameDup
              ? t('translationManage:dupNameWarning')
              : undefined}
          >
            <Input placeholder={t('translationManage:fieldNamePh')} />
          </Form.Item>
          {languages.map(lang => (
            <Form.Item key={lang.code} name={`lang_${lang.code}`} label={`${lang.flag} ${getLangHeaderName(lang)}`}>
              <Input placeholder={t('translationManage:langTranslationPh', { lang: getLangHeaderName(lang) })} />
            </Form.Item>
          ))}
        </Form>
      </Modal>

      {/* 新增语言弹窗 */}
      <Modal
        title={t('translationManage:addLangTitle')}
        open={addLangOpen}
        onOk={handleAddLanguage}
        onCancel={() => { setAddLangOpen(false); addLangForm.resetFields() }}
        okText={t('common:confirm')}
        cancelText={t('common:cancel')}
        width={420}
        okButtonProps={{ style: { borderRadius: 8, minWidth: 88 } }}
        cancelButtonProps={{ style: { borderRadius: 8, minWidth: 88 } }}
      >
        <Form form={addLangForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="code" label={t('translationManage:langCodeLabel')} rules={[{ required: true, message: t('translationManage:langCodeRequired') }]}>
            <Select
              showSearch
              placeholder={t('translationManage:langCodePh')}
              options={langCodeOptions}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              onChange={(code: string) => {
                const info = LANG_INFO[code]
                if (info) {
                  addLangForm.setFieldsValue({ flag: info.flag })
                }
              }}
            />
          </Form.Item>
          <Form.Item name="flag" label={t('translationManage:flagLabel')}>
            <Select
              showSearch
              placeholder={t('translationManage:flagPh')}
              allowClear
              options={FLAG_OPTIONS}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
