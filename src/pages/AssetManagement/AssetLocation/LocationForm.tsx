/**
 * 仓库维护 新增/編輯獨立表單頁
 *
 * - 按省-市-区-详细地址维度管理仓库位置
 * - 编码由人工手动填写，全局唯一
 * - 省/市/区 Select 三级联动
 * - 底部「取消 + 保存」（全局表單規範）
 */
import { useState, useEffect, useMemo } from 'react'
import {
  Button, Form, Input, Select, Spin, message, Space,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchLocationList, createLocation, updateLocation,
} from '../../../api/eam'
import { regionData, getProvinces, getCities, getDistricts } from '../../../constants/regionData'

interface FormValues {
  code: string
  name: string
  province?: string
  city?: string
  district?: string
  address?: string
  remark?: string
}

interface Props {
  id?: number
  onBack: () => void
}

export default function LocationForm({ id, onBack }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const isEdit = id != null
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)

  // 省市区联动：用 state 追踪已选值（比 Form.useWatch 更稳定）
  const [selectedProvince, setSelectedProvince] = useState<string>()
  const [selectedCity, setSelectedCity] = useState<string>()

  const provinceOptions = useMemo(() => getProvinces(regionData).map(p => ({ label: p, value: p })), [])
  const cityOptions = useMemo(
    () => (selectedProvince ? getCities(regionData, selectedProvince).map(c => ({ label: c, value: c })) : []),
    [selectedProvince],
  )
  const districtOptions = useMemo(
    () => (selectedProvince && selectedCity ? getDistricts(regionData, selectedProvince, selectedCity).map(d => ({ label: d, value: d })) : []),
    [selectedProvince, selectedCity],
  )

  useEffect(() => {
    let alive = true
    if (isEdit && id) {
      setLoading(true)
      fetchLocationList()
        .then((list) => {
          if (!alive) return
          const cur = list.find((l) => l.id === id)
          if (cur) {
            form.setFieldsValue({
              code: cur.code,
              name: cur.name,
              province: cur.province || undefined,
              city: cur.city || undefined,
              district: cur.district || undefined,
              address: cur.address,
              remark: cur.remark,
            })
            setSelectedProvince(cur.province || undefined)
            setSelectedCity(cur.city || undefined)
          }
        })
        .catch((e: Error) => message.error(e.message))
        .finally(() => { if (alive) setLoading(false) })
    }
    return () => { alive = false }
  }, [form, id, isEdit])

  /** 省份变更时清空市/区县 */
  const handleProvinceChange = (value: string | undefined) => {
    setSelectedProvince(value)
    setSelectedCity(undefined)
    form.setFieldsValue({ city: undefined, district: undefined })
  }

  /** 城市变更时清空区县 */
  const handleCityChange = (value: string | undefined) => {
    setSelectedCity(value)
    form.setFieldsValue({ district: undefined })
  }

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      const payload = {
        code: v.code.trim(),
        name: v.name.trim(),
        parentId: 0,
        sort: 1,
        province: v.province?.trim(),
        city: v.city?.trim(),
        district: v.district?.trim(),
        address: v.address?.trim(),
        remark: v.remark,
      }
      setSubmitting(true)
      if (isEdit && id) {
        await updateLocation(id, payload)
        message.success(t('asset.locationUpdateSuccess'))
      } else {
        await createLocation(payload)
        message.success(t('asset.locationCreateSuccess'))
      }
      onBack()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Spin spinning={loading}>
      {/* ====== 頂部標題欄（橙色漸變頂條） ====== */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
            {isEdit ? '編輯倉庫' : '新增倉庫'}
          </h2>
        </div>
      </div>

      {/* ====== 基本信息 ====== */}
      <div style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 14, color: '#1890ff' }}>📍</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基本信息</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        <Form<FormValues> form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item
              label="編碼"
              name="code"
              rules={[{ required: true, message: '請輸入編碼' }]}
            >
              <Input
                placeholder="請輸入編碼（全局唯一）"
                style={{ fontFamily: 'monospace' }}
              />
            </Form.Item>
            <Form.Item
              label="倉庫名稱" name="name"
              rules={[{ required: true, message: t('asset.nameRequired') }]}
            >
              <Input placeholder="請輸入倉庫名稱" allowClear />
            </Form.Item>
            <div /> {/* 占位空行 */}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <Form.Item
              label="省份" name="province"
              rules={[{ required: true, message: '請選擇省份' }]}
            >
              <Select
                placeholder="請選擇省份"
                allowClear
                showSearch
                options={provinceOptions}
                onChange={handleProvinceChange}
              />
            </Form.Item>
            <Form.Item
              label="城市" name="city"
              rules={[{ required: true, message: '請選擇城市' }]}
            >
              <Select
                placeholder={selectedProvince ? '請選擇城市' : '請先選擇省份'}
                allowClear
                showSearch
                disabled={!selectedProvince}
                options={cityOptions}
                onChange={handleCityChange}
              />
            </Form.Item>
            <Form.Item
              label="區縣" name="district"
              rules={[{ required: true, message: '請選擇區縣' }]}
            >
              <Select
                placeholder={selectedCity ? '請選擇區縣' : '請先選擇城市'}
                allowClear
                showSearch
                disabled={!selectedCity}
                options={districtOptions}
              />
            </Form.Item>
            <Form.Item label="詳細地址" name="address">
              <Input placeholder="請輸入完整詳細地址（街道、門牌號等）" allowClear />
            </Form.Item>
          </div>

          <Form.Item label="備註" name="remark" style={{ marginBottom: 0 }}>
            <Input.TextArea
              placeholder="請輸入備註"
              maxLength={300}
              showCount
              rows={4}
            />
          </Form.Item>
        </Form>
      </div>

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </Space>
      </div>
    </Spin>
  )
}
