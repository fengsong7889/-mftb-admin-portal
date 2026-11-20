/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useEffect, useRef, useState } from 'react'
import { message, type FormInstance } from 'antd'
import { useTranslation } from 'react-i18next'
import { AlgorithmType } from '@mftb/contracts/recommendConstants'
import { appTypeToBrand, brandToAppType, createAdAlgorithm, fetchAdAlgorithmDetail, updateAdAlgorithm, type AdAlgorithmRequest } from '@/api/adPromotion'
import { StarTarget, isStarParams, makeStarProductParams, type StarProductParams } from '@mftb/contracts/starAlgorithm'
import { PRODUCT_STAR_PREVIEW_DEFAULTS, type ProductStarPreviewValues } from './preview'

interface Options {
  algorithmId: string
  readOnly: boolean
  form: FormInstance<ProductStarPreviewValues>
  onLoaded: (data: { updatedBy?: string; updatedAt?: string } | null) => void
  onSaved: () => void
}

/** 商品星星配置的真实读写：版本化参数 + revision 并发保护，与门店旧协议完全隔离。 */
export default function useStarProductForm({ algorithmId, readOnly, form, onLoaded, onSaved }: Options) {
  const { t } = useTranslation()
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(algorithmId ? 'loading' : 'ready')
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const revision = useRef(0)
  const submitting = useRef(false)
  const mounted = useRef(true)
  const onLoadedRef = useRef(onLoaded)
  onLoadedRef.current = onLoaded
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved
  // t 用 ref 持有：测试 mock 每次渲染重建 t，若放进 effect 依赖会触发无限重渲染。
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    let active = true
    setLoadError('')
    onLoadedRef.current(null)
    revision.current = 0
    form.resetFields()
    if (!algorithmId) {
      form.setFieldsValue(PRODUCT_STAR_PREVIEW_DEFAULTS)
      setLoadState('ready')
      return
    }
    setLoadState('loading')
    const load = async () => {
      try {
        const id = Number(algorithmId)
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error(tRef.current('recommend.starProduct.invalidId'))
        const detail = await fetchAdAlgorithmDetail(id)
        if (!active) return
        if (detail.algoType !== AlgorithmType.INVINCIBLE_STAR) throw new Error(tRef.current('recommend.starProduct.wrongType'))
        const raw: unknown = detail.params ? JSON.parse(detail.params) : {}
        if (!isStarParams(raw) || raw.targetType !== StarTarget.PRODUCT) throw new Error(tRef.current('recommend.starProduct.invalidParams'))
        const params = raw as StarProductParams
        revision.current = params.revision
        form.setFieldsValue({
          name: detail.algoName,
          brand: brandToAppType(detail.brand),
          consistencyCheckInterval: params.productRules.consistencyCheckInterval,
          exposureStrategy: params.productRules.exposureStrategy,
        })
        onLoadedRef.current({ updatedBy: detail.updatedBy, updatedAt: detail.updatedAt })
        setLoadState('ready')
      } catch (error) {
        if (!active) return
        setLoadError(error instanceof Error ? error.message : tRef.current('recommend.starProduct.loadFailed'))
        setLoadState('error')
      }
    }
    void load()
    return () => { active = false }
  }, [algorithmId, form, reloadKey])

  const handleSave = async () => {
    if (readOnly || loadState !== 'ready' || submitting.current) return
    submitting.current = true
    setSaving(true)
    try {
      const values = await form.validateFields()
      const params = makeStarProductParams({
        consistencyCheckInterval: values.consistencyCheckInterval as number,
        exposureStrategy: values.exposureStrategy,
      }, revision.current)
      const payload: AdAlgorithmRequest = {
        algoName: (values.name ?? '').trim(),
        algoType: AlgorithmType.INVINCIBLE_STAR,
        brand: appTypeToBrand(values.brand),
        params,
      }
      if (algorithmId) await updateAdAlgorithm(Number(algorithmId), payload)
      else await createAdAlgorithm(payload)
      if (!mounted.current) return
      message.success(t(algorithmId ? 'recommend.algoUpdateSuccess' : 'recommend.algoAddSuccess'))
      onSavedRef.current()
    } catch (error) {
      if (!mounted.current) return
      // 表单校验失败由 antd 标红，不重复弹 toast。
      if (form.getFieldsError().some(field => field.errors.length > 0)) return
      const code = (error as Error & { code?: number }).code
      if (code === 409) {
        // 并发冲突：禁止用旧 revision 覆盖，强制重新加载最新配置。
        setLoadError(t('recommend.starProduct.conflict'))
        setLoadState('error')
        message.error(t('recommend.starProduct.conflict'))
      } else {
        message.error(error instanceof Error ? error.message : t('recommend.saveFailed'))
      }
    } finally {
      submitting.current = false
      if (mounted.current) setSaving(false)
    }
  }

  return {
    loadState, loadError, saving, handleSave,
    retry: () => setReloadKey(key => key + 1),
  }
}
