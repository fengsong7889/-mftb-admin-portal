/**
 * 资产新增/编辑独立页
 *
 * - 通过 URL ?id= 区分模式：无 id = 新增模式，有 id = 编辑模式
 * - 物资部可直接在此完成资产新增或编辑，无需走流程
 * - 顶部"返回"按钮，底部"取消+保存"按钮（符合全局规范）
 *
 * 表单字段：资产编号（唯一性校验）、名称、类型、品牌、单位、数量、来源、价值、
 * 购买日期、使用日期、所属公司、地点、所在部门、使用人、图片、备注
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button, Form, Input, Select, DatePicker, InputNumber, Upload, message, Row, Col, Image, Spin,
} from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, CloseOutlined, UploadOutlined,
  CheckCircleFilled, CloseCircleFilled,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import {
  createAsset, updateAsset, fetchAssetDetail, checkAssetNoUnique,
  type AssetItem, type AssetSource,
} from '../../../api/asset'

const { TextArea } = Input

const ASSET_TYPE_OPTIONS = ['电子设备', '办公家具', '办公设备', '交通工具', '其他']
const UNIT_OPTIONS = ['台', '套', '件', '把', '张', '辆', '个']
const COMPANY_OPTIONS = ['澳觅科技', '闪蜂', 'mFood']
const DEPARTMENT_OPTIONS = ['研发部', '产品部', '市场部', '设计部', '技术部', '人事部', '财务部', '行政部', '运营部']

interface FormValues {
  assetNo: string
  assetName: string
  assetType: string
  brand?: string
  unit: string
  quantity: number
  purchaseValue?: number
  purchaseDate?: Dayjs
  usageDate?: Dayjs
  source: AssetSource
  company: string
  location?: string
  department?: string
  userName?: string
  remark?: string
}

export default function AssetAdd() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editingId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const isEdit = editingId !== null

  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [assetNoStatus, setAssetNoStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [loading, setLoading] = useState(false)

  /** 加载编辑数据 */
  useEffect(() => {
    if (!isEdit || !editingId) return
    setLoading(true)
    fetchAssetDetail(editingId)
      .then((data: AssetItem) => {
        form.setFieldsValue({
          assetNo: data.assetNo,
          assetName: data.assetName,
          assetType: data.assetType,
          brand: data.brand,
          unit: data.unit,
          quantity: data.quantity,
          purchaseValue: data.purchaseValue,
          purchaseDate: data.purchaseDate ? dayjs(data.purchaseDate) : undefined,
          usageDate: data.usageDate ? dayjs(data.usageDate) : undefined,
          source: data.source,
          company: data.company,
          location: data.location,
          department: data.department,
          userName: data.userName,
          remark: data.remark || undefined,
        } as Partial<FormValues>)
        if (data.images) setImages(data.images.split(',').filter(Boolean))
        setAssetNoStatus('available')
      })
      .catch((err: Error) => message.error(err.message))
      .finally(() => setLoading(false))
  }, [isEdit, editingId, form])

  /** 资产编号实时唯一性校验 */
  const handleAssetNoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.trim()
    if (!v) { setAssetNoStatus('idle'); return }
    if (isEdit && form.getFieldValue('assetNo') === v) { setAssetNoStatus('available'); return }
    setAssetNoStatus('checking')
    try {
      const ok = await checkAssetNoUnique(v, editingId || undefined)
      setAssetNoStatus(ok ? 'available' : 'taken')
    } catch {
      setAssetNoStatus('idle')
    }
  }, [editingId, isEdit, form])

  /** 图片上传（转 base64） */
  const handleImageUpload = useCallback((file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      message.warning(t('asset.imageTooLarge'))
      return false
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImages((prev) => [...prev, dataUrl])
    }
    reader.readAsDataURL(file)
    return false
  }, [t])

  const handleRemoveImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx))
  }

  /** 保存 */
  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      if (!isEdit && assetNoStatus === 'taken') {
        message.error(t('asset.assetNoTaken'))
        return
      }
      setSubmitting(true)
      const payload = {
        assetNo: v.assetNo,
        assetName: v.assetName,
        assetType: v.assetType,
        brand: v.brand || '',
        unit: v.unit,
        quantity: v.quantity,
        purchaseValue: v.purchaseValue || 0,
        purchaseDate: v.purchaseDate ? v.purchaseDate.format('YYYY-MM-DD') : null,
        usageDate: v.usageDate ? v.usageDate.format('YYYY-MM-DD') : null,
        source: v.source,
        company: v.company,
        location: v.location || '',
        department: v.department || '',
        userName: v.userName || '',
        status: 'idle' as const,
        images: images.length ? images.join(',') : null,
        remark: v.remark || null,
        applicant: t('asset.currentOperator'),
        scrapTime: null,
      }
      if (isEdit && editingId) {
        await updateAsset(editingId, payload)
        message.success(t('asset.updateSuccess'))
      } else {
        await createAsset(payload)
        message.success(t('asset.createSuccess'))
      }
      navigate('/asset-list')
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  /** 取消：返回列表 */
  const handleCancel = () => {
    navigate('/asset-list')
  }

  const renderAssetNoSuffix = () => {
    if (assetNoStatus === 'checking') return <span style={{ color: '#1890ff' }}>校验中...</span>
    if (assetNoStatus === 'available') return <CheckCircleFilled style={{ color: '#52C41A' }} />
    if (assetNoStatus === 'taken') return <CloseCircleFilled style={{ color: '#FF4D4F' }} />
    return null
  }

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {/* ====== 顶部标题栏 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={handleCancel}>
            {t('common.back')}
          </Button>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            {isEdit ? t('asset.editTitle') : t('asset.addTitle')}
          </h2>
        </div>
      </div>

      {/* ====== 表单区 ====== */}
      <Spin spinning={loading}>
        <div style={{
          background: '#fff', borderRadius: 8, padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <Form<FormValues> form={form} layout="vertical" disabled={loading}>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item
                  label={t('asset.colAssetNo')}
                  name="assetNo"
                  rules={[
                    { required: true, message: t('asset.assetNoRequired') },
                    { pattern: /^[A-Za-z0-9\-_]+$/, message: t('asset.assetNoFormat') },
                  ]}
                  hasFeedback
                >
                  <Input
                    placeholder={t('asset.assetNoPh')}
                    allowClear
                    onChange={handleAssetNoChange}
                    suffix={renderAssetNoSuffix()}
                    disabled={isEdit}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label={t('asset.colAssetName')}
                  name="assetName"
                  rules={[{ required: true, message: t('asset.assetNameRequired') }]}
                >
                  <Input placeholder={t('asset.assetNamePh')} allowClear />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label={t('asset.colAssetType')}
                  name="assetType"
                  rules={[{ required: true, message: t('asset.assetTypeRequired') }]}
                >
                  <Select placeholder={t('asset.assetTypePh')} allowClear>
                    {ASSET_TYPE_OPTIONS.map((o) => <Select.Option key={o} value={o}>{o}</Select.Option>)}
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label={t('asset.colBrand')} name="brand">
                  <Input placeholder={t('asset.brandPh')} allowClear />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item
                  label={t('asset.colUnit')}
                  name="unit"
                  rules={[{ required: true, message: t('asset.unitRequired') }]}
                >
                  <Select placeholder={t('asset.unitPh')} allowClear>
                    {UNIT_OPTIONS.map((o) => <Select.Option key={o} value={o}>{o}</Select.Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item
                  label={t('asset.colQuantity')}
                  name="quantity"
                  rules={[{ required: true, message: t('asset.quantityRequired') }]}
                  initialValue={1}
                >
                  <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item label={t('asset.colSource')} name="source" initialValue="self" rules={[{ required: true }]}>
                  <Select>
                    <Select.Option value="self">{t('asset.sourceSelf')}</Select.Option>
                    <Select.Option value="lease">{t('asset.sourceLease')}</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item label={t('asset.colPurchaseValue')} name="purchaseValue">
                  <InputNumber
                    min={0}
                    step={100}
                    precision={2}
                    placeholder="MOP"
                    style={{ width: '100%' }}
                    addonAfter="MOP"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label={t('asset.colPurchaseDate')} name="purchaseDate">
                  <DatePicker style={{ width: '100%' }} placeholder={t('asset.purchaseDatePh')} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label={t('asset.colUsageDate')} name="usageDate">
                  <DatePicker style={{ width: '100%' }} placeholder={t('asset.usageDatePh')} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label={t('asset.colCompany')}
                  name="company"
                  rules={[{ required: true, message: t('asset.companyRequired') }]}
                  initialValue="澳觅科技"
                >
                  <Select placeholder={t('asset.companyPh')}>
                    {COMPANY_OPTIONS.map((o) => <Select.Option key={o} value={o}>{o}</Select.Option>)}
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label={t('asset.colLocation')} name="location">
                  <Input placeholder={t('asset.locationPh')} allowClear />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label={t('asset.colDepartment')} name="department">
                  <Select placeholder={t('asset.departmentPh')} allowClear>
                    {DEPARTMENT_OPTIONS.map((o) => <Select.Option key={o} value={o}>{o}</Select.Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label={t('asset.colUserName')} name="userName">
                  <Input placeholder={t('asset.userNamePh')} allowClear />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={24}>
                <Form.Item label={t('asset.colImages')} name="images">
                  <div>
                    <Upload
                      accept="image/*"
                      multiple
                      showUploadList={false}
                      beforeUpload={handleImageUpload}
                    >
                      <Button icon={<UploadOutlined />}>{t('asset.uploadImage')}</Button>
                    </Upload>
                    <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                      {t('asset.uploadImageTip')}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                      {images.map((src, idx) => (
                        <div key={idx} style={{ position: 'relative', width: 80, height: 80 }}>
                          <Image
                            src={src}
                            width={80}
                            height={80}
                            style={{ objectFit: 'cover', borderRadius: 4 }}
                          />
                          <Button
                            type="primary"
                            danger
                            size="small"
                            icon={<CloseOutlined />}
                            onClick={() => handleRemoveImage(idx)}
                            style={{
                              position: 'absolute', top: -6, right: -6, width: 20, height: 20,
                              padding: 0, minWidth: 20, borderRadius: '50%',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={24}>
                <Form.Item label={t('asset.colRemark')} name="remark">
                  <TextArea rows={3} placeholder={t('asset.remarkPh')} maxLength={500} showCount />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </div>
      </Spin>

      {/* ====== 底部操作栏（取消+保存，符合全局规范） ====== */}
      <div className="form-footer">
        <Button onClick={handleCancel}>{t('common.cancel')}</Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSubmit}
          loading={submitting}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
