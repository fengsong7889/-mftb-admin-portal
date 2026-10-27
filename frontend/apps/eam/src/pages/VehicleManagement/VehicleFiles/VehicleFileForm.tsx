/**
 * 车辆档案 — 新增/编辑表单页（独立页面，禁止 Modal）
 *
 * 字段分组：基础信息 / 归属与可用范围 / 运行与合规核验
 * 校验口径：前端只做 UX 校验（必填、区间、格式），后端 B1 必须重验车牌唯一、
 * 法人主体存在、EAM 资产可关联、有效期合法。
 */
import { useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select, Switch, TreeSelect, message } from 'antd'
import {
  CarOutlined, DatabaseOutlined, SaveOutlined, SafetyCertificateOutlined, TeamOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import {
  BODY_TYPE_OPTIONS, ENERGY_TYPE_OPTIONS, VEHICLE_STATUS_LABEL, VEHICLE_STATUS_OPTIONS,
} from '../vehicleMeta'
import { fetchBrands, fetchModels, fetchSeries, type BrandVO, type ModelVO, type SeriesVO } from '@/api/vehicleMaster'
import RemarkTextArea from '@/components/RemarkTextArea'
import { validatePlate } from '../vehicleRules'
import { PROVINCE_ABBREVIATIONS } from '../vehicleMeta'
import { VEHICLE_STATUS, type VehicleFile, type VehicleFileFormValues } from '../vehicleTypes'
import { usePurchaseCompanies, useVehicleDeptTree } from '../vehicleOptions'
import {
  VehicleFormPageHeader, VehicleSection,
} from '../VehicleModuleLayout'

/**
 * 表单内部状态：DatePicker 交回 Dayjs 对象，而领域模型存 'YYYY-MM-DD' 字符串。
 * 单独开一个类型而不是把 form 直接声明为 VehicleFileFormValues，
 * 是为了避免用 as 掩盖真实运行时形状（会导致提交时静默存错类型）。
 */
/** 内地牌分段录入的两个字段只在界面存在，提交前合成 plateNo 后剔除 */
type FormState = Omit<VehicleFileFormValues, 'insuranceValidUntil' | 'inspectionValidUntil'> & {
  province?: string
  plateBody?: string
}
  & { insuranceValidUntil?: Dayjs; inspectionValidUntil?: Dayjs }

interface Props {
  record?: VehicleFile
  /** 详情加载中标记：编辑页直接刷 URL 时先转圈，避免表单以“新增”空态闪一下 */
  loading?: boolean
  saving: boolean
  onSubmit: (values: VehicleFileFormValues, editing?: VehicleFile) => void
  onBack: () => void
}

export default function VehicleFileForm({ record, loading = false, saving, onSubmit, onBack }: Props) {
  const isEdit = !!record
  const [form] = Form.useForm<FormState>()
  const dept = useVehicleDeptTree()
  const companies = usePurchaseCompanies()
  const [allowDirect, setAllowDirect] = useState(!!record?.allowDirectRegister)

  useEffect(() => {
    if (!record) return
    form.setFieldsValue({
      plateNo: record.plateNo,
      registerRegion: record.registerRegion,
      vehicleType: record.vehicleType,
      // 主数据与车身/能源必须一并回填：漏填会让编辑保存时把这些字段当“未选”提交为空，
      // 后端按全量覆盖就把品牌/车系/年款/车身形式清空（F6 根因）
      brandId: record.brandId,
      seriesId: record.seriesId,
      modelId: record.modelId,
      bodyType: record.bodyType,
      energyType: record.energyType,
      vin: record.vin,
      eamAssetNo: record.eamAssetNo,
      seatCount: record.seatCount,
      currentOdometer: record.currentOdometer,
      ownerCompanyId: record.ownerCompanyId || undefined,
      companyBrand: record.companyBrand,
      manageDeptId: record.manageDeptId || undefined,
      allowedDeptIds: record.allowedDepts.map(d => d.deptId),
      status: record.status,
      allowDirectRegister: record.allowDirectRegister,
      insuranceValidUntil: record.insuranceValidUntil ? dayjs(record.insuranceValidUntil) : undefined,
      inspectionValidUntil: record.inspectionValidUntil ? dayjs(record.inspectionValidUntil) : undefined,
      remark: record.remark,
    })
    setAllowDirect(record.allowDirectRegister)
  }, [record, form])

  /** 关闭「授权直接登记」需要确认：这会收窄该车可用路径，不影响已有在途单据 */
  const handleDirectChange = (checked: boolean) => {
    if (!checked) {
      Modal.confirm({
        title: '確定要停用「授權直接登記」？',
        className: 'custom-confirm-modal',
        icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
        okText: '確認',
        cancelText: '取消',
        content: (
          <div className="confirm-info-card">
            <div className="confirm-info-row"><span>車輛：</span><b>{record?.plateNo ?? '尚未選擇'}</b></div>
            <div className="confirm-info-row"><span>影響：</span><b>此後該車僅能走審批用車流程</b></div>
            <div className="confirm-info-row"><span>在途單據：</span><b>已完成安排與行車不受影響</b></div>
          </div>
        ),
        onOk: () => { setAllowDirect(false); form.setFieldValue('allowDirectRegister', false) },
      })
      return
    }
    setAllowDirect(true)
    form.setFieldValue('allowDirectRegister', true)
  }

  /* ==================== 车辆参数库级联 ==================== */

  const [brands, setBrands] = useState<BrandVO[]>([])
  const [seriesOptions, setSeriesOptions] = useState<SeriesVO[]>([])
  const [modelOptions, setModelOptions] = useState<ModelVO[]>([])
  const watchedRegion = Form.useWatch('registerRegion', form)
  const watchedBrandId = Form.useWatch('brandId', form)
  const watchedSeriesId = Form.useWatch('seriesId', form)
  const watchedEnergy = Form.useWatch('energyType', form)
  const watchedProvince = Form.useWatch('province', form)
  const watchedPlateNo = Form.useWatch('plateNo', form)
  const watchedPlateBody = Form.useWatch('plateBody', form)
  const mainland = watchedRegion === '中國內地'

  useEffect(() => {
    let alive = true
    void fetchBrands().then(b => { if (alive) setBrands(b) }).catch(() => {})
    return () => { alive = false }
  }, [])

  // 品牌变了才重拉车系：不依赖 seriesId，否则选完车系会把下拉再刷一遍
  useEffect(() => {
    if (watchedBrandId == null) { setSeriesOptions([]); return }
    let alive = true
    void fetchSeries(watchedBrandId).then(x => { if (alive) setSeriesOptions(x) }).catch(() => {})
    return () => { alive = false }
  }, [watchedBrandId])

  useEffect(() => {
    if (watchedSeriesId == null) { setModelOptions([]); return }
    let alive = true
    void fetchModels(watchedSeriesId).then(x => { if (alive) setModelOptions(x) }).catch(() => {})
    return () => { alive = false }
  }, [watchedSeriesId])

  /**
   * 选到车系就带出车身形式与能源类型。
   *
   * 覆盖规则：只在用户没手工改过时覆盖？不必——车系就是这两项的真值来源，
   * 手工覆盖反而会让"同一车系的车"在统计里分裂成两类，所以这里直接覆盖。
   */
  const onSeriesChange = (seriesId?: number) => {
    const hit = seriesOptions.find(x => x.id === seriesId)
    if (!hit) return
    const patch: Record<string, unknown> = { bodyType: hit.bodyType, energyType: hit.energyType }
    // 座位数只在没填过时补默认，避免覆盖已录入的真实核定载客
    if (!form.getFieldValue('seatCount')) patch.seatCount = hit.seatCount
    form.setFieldsValue(patch)
  }

  /**
   * 车牌实时校验。
   *
   * 依赖必须走 useWatch：用 form.getFieldValue 当依赖不会触发重算，
   * 结果是用户改完牌体，红字提示仍停留在上一次的判断——比没有提示更糟。
   */
  const plateBlockers = useMemo(() => {
    const composed = mainland
      ? `${watchedProvince ?? ''}${watchedPlateBody ?? ''}`
      : (watchedPlateNo ?? '')
    if (!composed) return []
    return validatePlate(composed, mainland ? watchedEnergy : null)
  }, [mainland, watchedProvince, watchedPlateBody, watchedPlateNo, watchedEnergy])

  const handleSubmit = async () => {
    let raw: FormState
    try {
      raw = await form.validateFields()
    } catch (err) {
      // antd 已在字段下方标红，不双弹；手动校验流程补滚动定位到首个错误字段（§F.4）
      const firstField = (err as { errorFields?: { name: (string | number)[] }[] }).errorFields?.[0]?.name
      if (firstField) form.scrollToField(firstField, { behavior: 'smooth', block: 'center' })
      return
    }
    // 内地牌由「省份简称 + 牌体」两段录入，提交前合成完整车牌：唯一键与展示仍是一列
    const plateNo = raw.registerRegion === '中國內地'
      ? `${raw.province ?? ''}${raw.plateBody ?? ''}`
      : (raw.plateNo ?? '')
    const plateError = validatePlate(plateNo, raw.registerRegion === '中國內地' ? raw.energyType : null)[0]
    if (plateError) {
      message.warning(plateError.message)
      return
    }
    if (raw.registerRegion === '中國內地' && raw.plateBody) {
      const body = String(raw.plateBody).toUpperCase()
      if (!/^[A-Z][A-Z0-9]{4,6}$/.test(body)) {
        message.warning('車牌主體應為「1位字母 + 5~6位字母數字」，如 B12345（新能源）/ B12345（燃油）')
        return
      }
    }
    const values: VehicleFileFormValues = {
      ...raw,
      plateNo,
      insuranceValidUntil: raw.insuranceValidUntil?.format('YYYY-MM-DD'),
      inspectionValidUntil: raw.inspectionValidUntil?.format('YYYY-MM-DD'),
    }
    onSubmit(values, record)
  }

  return (
    <div className="content-area">
      <VehicleFormPageHeader
        title={isEdit ? '編輯車輛檔案' : '新增車輛檔案'}
        onBack={onBack}
        meta={isEdit ? `${record?.plateNo} · ${record?.vehicleCode}` : '新車可先建運行檔案，EAM 資產關聯為可選項'}
      />

      {(record || !loading) && (
      <Form form={form} layout="vertical" initialValues={{ status: VEHICLE_STATUS.NORMAL, registerRegion: '澳門', allowDirectRegister: false }}>
        {/* ====== 基础信息 ====== */}
        <VehicleSection icon={<CarOutlined />} title="基礎信息">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label="登記地區" name="registerRegion" rules={[{ required: true, message: '請選擇登記地區' }]}>
              <Select
                options={[{ value: '澳門', label: '澳門' }, { value: '中國內地', label: '中國內地' }, { value: '香港', label: '香港' }]}
                onChange={() => form.setFieldsValue({ plateNo: undefined, province: undefined, plateBody: undefined })}
              />
            </Form.Item>
            {mainland ? (
              <>
                <Form.Item label="車牌號碼（省份簡稱）" name="province" rules={[{ required: true, message: '請選擇省份簡稱' }]}>
                  <Select
                    showSearch optionFilterProp="label" placeholder="如 粵 / 京"
                    options={Array.from(PROVINCE_ABBREVIATIONS).map(ch => ({ value: ch, label: ch }))}
                  />
                </Form.Item>
                <Form.Item label="車牌號碼（主體）" name="plateBody" rules={[{ required: true, message: '請填寫車牌主體' }]}
                  extra={watchedEnergy === 'ev' || watchedEnergy === 'phev'
                    ? '新能源連省份共 8 位'
                    : '燃油連省份共 7 位'}>
                  <Input placeholder="如 B12345" maxLength={8} style={{ textTransform: 'uppercase' }} />
                </Form.Item>
              </>
            ) : (
              <Form.Item
                label="車牌號碼" name="plateNo" rules={[{ required: true, message: '請輸入車牌號碼' }]}
                extra={plateBlockers.length
                  ? <span style={{ color: '#FF4D4F' }}>{plateBlockers[0].message}</span>
                  : '同一登記地區內唯一'}
              >
                <Input placeholder="如 MT-88-01 / MX-12-34" maxLength={20} style={{ textTransform: 'uppercase' }} />
              </Form.Item>
            )}
            <Form.Item label="車輛品牌" name="brandId">
              <Select
                allowClear showSearch optionFilterProp="label" placeholder="請選擇品牌"
                options={brands.map(b => ({ value: b.id, label: b.brandName }))}
                onChange={() => form.setFieldsValue({ seriesId: undefined, modelId: undefined })}
              />
            </Form.Item>
            <Form.Item label="車系" name="seriesId" extra={watchedBrandId == null ? '先選品牌' : undefined}>
              <Select
                allowClear showSearch optionFilterProp="label" placeholder={watchedBrandId == null ? '請先選擇品牌' : '請選擇車系'}
                disabled={watchedBrandId == null}
                options={seriesOptions.map(x => ({ value: x.id, label: x.seriesName }))}
                onChange={onSeriesChange}
              />
            </Form.Item>
            <Form.Item label="年款車型" name="modelId" extra={watchedSeriesId == null ? '先選車系' : undefined}>
              <Select
                allowClear showSearch optionFilterProp="label" placeholder={watchedSeriesId == null ? '請先選擇車系' : '請選擇年款車型'}
                disabled={watchedSeriesId == null}
                options={modelOptions.map(x => ({
                  value: x.id, label: x.yearLabel ? `${x.yearLabel} ${x.modelName}` : x.modelName,
                }))}
              />
            </Form.Item>
            {/* 車身類型由车系带出：原「車型」字段名不准确，5系/7系 属车系，轿车/SUV 属车身形式 */}
            <Form.Item label="車身類型" name="bodyType" rules={[{ required: true, message: '請選擇車身類型' }]}>
              <Select options={BODY_TYPE_OPTIONS} placeholder="請選擇車身類型" />
            </Form.Item>
            <Form.Item label="能源類型" name="energyType" rules={[{ required: true, message: '請選擇能源類型' }]}>
              <Select options={ENERGY_TYPE_OPTIONS} placeholder="請選擇能源類型" />
            </Form.Item>
            <Form.Item label="VIN / 底盤號" name="vin">
              <Input placeholder="選填" maxLength={30} />
            </Form.Item>
            <Form.Item
              label="核定載客（含駕駛人）" name="seatCount"
              rules={[{ required: true, message: '請輸入核定載客人數' }]}
              extra="超員將被拒絕"
            >
              <InputNumber min={1} max={60} style={{ width: '100%' }} placeholder="如 7" />
            </Form.Item>
            <Form.Item
              label="當前里程（km）" name="currentOdometer"
              rules={[{ required: true, message: '請輸入當前里程' }]}
              extra="出車起始里程默認值"
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="如 42180" />
            </Form.Item>
          </div>
        </VehicleSection>

        {/* ====== 归属与可用范围 ====== */}
        <VehicleSection icon={<TeamOutlined />} tone="config" title="歸屬與可用範圍">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item
              label="所屬法人" name="ownerCompanyId"
              rules={[{ required: true, message: '請選擇所屬法人' }]}
            >
              <Select options={companies.options} placeholder="請選擇法人主體" showSearch optionFilterProp="label" />
            </Form.Item>
            <Form.Item label="所屬品牌" name="companyBrand" rules={[{ required: true, message: '請選擇所屬品牌' }]}>
              <Select options={[{ value: 1, label: '閃蜂' }, { value: 2, label: 'mFood' }]} placeholder="請選擇品牌" />
            </Form.Item>
            <Form.Item
              label="管理部門" name="manageDeptId"
              rules={[{ required: true, message: '請選擇管理部門' }]}
            >
              <TreeSelect
                treeData={dept.treeData} treeDefaultExpandAll showSearch treeNodeFilterProp="title"
                placeholder="請選擇管理部門"
              />
            </Form.Item>
            <Form.Item
              label="可使用部門" name="allowedDeptIds"
              extra="不含子部門"
              style={{ gridColumn: 'span 2' }}
            >
              <TreeSelect
                multiple treeData={dept.treeData} treeDefaultExpandAll showSearch treeNodeFilterProp="title"
                placeholder="可選擇多個部門" allowClear
              />
            </Form.Item>
            <Form.Item label="EAM 資產編號" name="eamAssetNo">
              <Input placeholder="如 TB-ZC-000128" maxLength={40} />
            </Form.Item>
          </div>
        </VehicleSection>

        {/* ====== 运行与合规核验 ====== */}
        <VehicleSection icon={<SafetyCertificateOutlined />} tone="success" title="運行與合規核驗">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label="運行狀態" name="status" rules={[{ required: true, message: '請選擇運行狀態' }]}>
              <Select options={VEHICLE_STATUS_OPTIONS} placeholder="請選擇狀態" />
            </Form.Item>
            <Form.Item
              label="保險有效期" name="insuranceValidUntil"
              extra="過期禁止出車"
            >
              <DatePicker style={{ width: '100%' }} placeholder="選擇日期" />
            </Form.Item>
            <Form.Item
              label="檢驗（年檢）有效期" name="inspectionValidUntil"
              extra="過期禁止出車"
            >
              <DatePicker style={{ width: '100%' }} placeholder="選擇日期" />
            </Form.Item>
            <Form.Item
              label="授權直接登記" name="allowDirectRegister" valuePropName="checked"
              extra="開啟需填原因"
            >
              <Switch checked={allowDirect} checkedChildren="啟用" unCheckedChildren="停用" onChange={handleDirectChange} />
            </Form.Item>
            {/* 備註獨占整行 + 統一尺寸：見 RemarkTextArea 的尺寸依據說明 */}
            <Form.Item label="備註" name="remark" style={{ gridColumn: '1 / -1' }}>
              <RemarkTextArea />
            </Form.Item>
          </div>
          {record && (
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>
              當前狀態：{VEHICLE_STATUS_LABEL[record.status]} · 最後更新 {record.updatedBy} / {record.updatedAt}
            </div>
          )}
        </VehicleSection>

        {/* ====== 关联资产提示（一期不做深耦合） ====== */}
        <VehicleSection icon={<DatabaseOutlined />} tone="special" title="與資產台賬的邊界">
          <div style={{ fontSize: 12, color: '#595959', lineHeight: 1.9 }}>
            同屬物資管理系統，但職責分開：車輛的購置價值、採購入庫、長期領用保管、報廢
            由資產台賬（EAM）負責；此處只維護運行檔案。
            一次用車出還不會改動資產持有人，EAM 對已關聯且存在有效預約或行車中記錄的
            車輛做報廢/調撥時，需先處置用車單據。
          </div>
        </VehicleSection>

        <div className="form-footer">
          <Button onClick={onBack}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>保存</Button>
        </div>
      </Form>
      )}
    </div>
  )
}
