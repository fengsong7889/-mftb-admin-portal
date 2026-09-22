import { useEffect, useRef, useState } from 'react'
import { message, type FormInstance } from 'antd'
import { useTranslation } from 'react-i18next'
import { appTypeToBrand, brandToAppType, createAdAlgorithm, fetchAdAlgorithmDetail, updateAdAlgorithm, type AdAlgorithmRequest } from '../../../api/adPromotion'
import { AlgorithmType } from '../constants'
import { isParamsObject, readTrafficParams, serializeTrafficParams, TRAFFIC_FIELD_NAMES, type TrafficFormIssue } from './config'

interface Options {
  enabled: boolean
  algorithmId: string
  readOnly: boolean
  form: FormInstance
  onLoaded: (data: { updatedBy?: string; updatedAt?: string } | null) => void
  onSaved: () => void
}

/** 与其他算法分开管理加载与保存，避免一次投流调整改变其他业务分支。 */
export default function useTrafficAlgorithmForm({ enabled, algorithmId, readOnly, form, onLoaded, onSaved }: Options) {
  const { t } = useTranslation()
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(enabled && algorithmId ? 'loading' : 'ready')
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<TrafficFormIssue[]>([])
  const submitting = useRef(false)
  const originalParams = useRef<Record<string, unknown>>({})
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (!enabled) return
    let active = true
    setErrors([])
    setLoadError('')
    onLoaded(null)
    originalParams.current = {}
    form.resetFields([...TRAFFIC_FIELD_NAMES, 'name', 'brand'])
    if (!algorithmId) {
      form.setFieldsValue(readTrafficParams({}))
      setLoadState('ready')
      return
    }
    setLoadState('loading')
    const fetchConfig = async () => {
      try {
        const id = Number(algorithmId)
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('算法编号无效')
        const detail = await fetchAdAlgorithmDetail(id)
        if (!active) return
        if (detail.algoType !== AlgorithmType.TRAFFIC_AD) throw new Error('当前记录不是投流算法，不能在此页面编辑')
        const raw: unknown = detail.params ? JSON.parse(detail.params) : {}
        const restored = readTrafficParams(raw)
        if (!isParamsObject(raw)) throw new Error('投流配置格式无效')
        originalParams.current = raw
        form.setFieldsValue({ ...restored, name: detail.algoName, brand: brandToAppType(detail.brand) })
        onLoaded({ updatedBy: detail.updatedBy, updatedAt: detail.updatedAt })
        setLoadState('ready')
      } catch (error) {
        if (!active) return
        setLoadError(error instanceof Error ? error.message : '投流配置加载失败，请重试')
        setLoadState('error')
      }
    }
    void fetchConfig()
    return () => { active = false }
  }, [enabled, algorithmId, form, onLoaded, reloadKey])

  const handleSave = async () => {
    if (!enabled || readOnly || loadState !== 'ready' || submitting.current) return
    // 同步锁覆盖异步校验阶段，按钮 loading 仅提供反馈，不替代后端幂等。
    submitting.current = true
    setSaving(true)
    setErrors([])
    try {
      await form.validateFields()
      const values = form.getFieldsValue(true)
      const payload: AdAlgorithmRequest = {
        algoName: values.name,
        algoType: AlgorithmType.TRAFFIC_AD,
        brand: appTypeToBrand(values.brand),
        // 仅覆写投流字段，保留接口可能附带的历史扩展配置。
        params: { ...originalParams.current, ...serializeTrafficParams(values) },
      }
      if (algorithmId) await updateAdAlgorithm(Number(algorithmId), payload)
      else await createAdAlgorithm(payload)
      if (!mounted.current) return
      message.success(t(algorithmId ? 'recommend.algoUpdateSuccess' : 'recommend.algoAddSuccess'))
      onSaved()
    } catch (error) {
      if (!mounted.current) return
      const fieldErrors = form.getFieldsError().filter(field => field.errors.length > 0).map(field => ({
        name: String(field.name[0]), message: field.errors[0],
      }))
      if (fieldErrors.length > 0) setErrors(fieldErrors)
      // 算法 API 使用静默请求头，由此处统一提示一次。
      else message.error(error instanceof Error ? error.message : '保存失败，请检查配置并重试')
    } finally {
      submitting.current = false
      if (mounted.current) setSaving(false)
    }
  }

  return {
    loadState, loadError, saving, errors, handleSave,
    retry: () => setReloadKey(key => key + 1),
    clearErrors: () => setErrors([]),
  }
}
