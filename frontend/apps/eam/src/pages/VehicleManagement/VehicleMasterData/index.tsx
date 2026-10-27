/**
 * 车辆参数库（基础数据 → 車輛參數庫）
 *
 * 三级主数据：品牌 → 车系 → 年款车型，对齐懂车帝/汽车之家的层级口径。
 * 车辆档案从这里逐级选择，不再手打品牌与车型文本。
 *
 * 为什么不做成三个菜单：三者是同一套主数据的三个层级，拆成三个菜单会让人
 * 在"加一个车系"时先要找对菜单，而车系必须先有品牌——一个页面内三级切换
 * 才能表达这种依赖。
 *
 *   /vehicle-master-data                    → 列表（Tab 切三级）
 *   /vehicle-master-data/add?type=brand     → 新增（type=brand|series|model）
 *   /vehicle-master-data/edit?id=           → 编辑（配合 type 参数）
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Alert, Button, Empty, Form, Input, InputNumber, Modal, Select, Space, Spin, Switch, Table, Tabs, Tag, message,
} from 'antd'
import { ClusterOutlined, ExportOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import {
  createBrand, createModel, createSeries, deleteBrand, deleteModel, deleteSeries,
  fetchBrands, fetchModels, fetchSeries, updateBrand, updateModel, updateSeries,
  type BrandSave, type BrandVO, type ModelSave, type ModelVO, type SeriesSave, type SeriesVO,
} from '@/api/vehicleMaster'
import { BODY_TYPE_OPTIONS, ENERGY_TYPE_LABEL } from '../vehicleMeta'
import RemarkTextArea from '@/components/RemarkTextArea'

type Level = 'brand' | 'series' | 'model'

const LEVEL_LABEL: Record<Level, string> = { brand: '品牌', series: '車系', model: '年款車型' }

interface Filters { keyword?: string; brandId?: number; seriesId?: number }

export default function VehicleMasterData() {
  const { pathname } = useLocation()
  const mode = pathname.split('/')[2] || 'list'
  if (mode === 'add' || mode === 'edit') return <MasterFormView editing={mode === 'edit'} />
  return <MasterList />
}

/* ==================== 列表 ==================== */

function MasterList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, hasPermission } = useAuth()

  const [level, setLevel] = useState<Level>((searchParams.get('level') as Level) || 'brand')
  const [brands, setBrands] = useState<BrandVO[]>([])
  const [series, setSeries] = useState<SeriesVO[]>([])
  const [models, setModels] = useState<ModelVO[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [filters, setFilters] = useState<Filters>({})
  const [includeDisabled, setIncludeDisabled] = useState(false)

  const canEdit = user?.role === 'admin' || hasPermission('vehicle-master-data:edit')

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const [b, s, m] = await Promise.all([
        fetchBrands(includeDisabled),
        fetchSeries(undefined, includeDisabled),
        fetchModels(undefined, includeDisabled),
      ])
      setBrands(b); setSeries(s); setModels(m)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加載失敗')
      setBrands([]); setSeries([]); setModels([])
    } finally {
      setLoading(false)
    }
  }, [includeDisabled])

  useEffect(() => { void load() }, [load])

  const switchLevel = (key: string) => {
    const next = key as Level
    setLevel(next)
    setFilters({})
    setSearchParams({ level: next })
  }

  /** 删除前给得出"为什么不能删"：被引用时后端会拒，这里先说清后果而不是让人撞上去 */
  const handleDelete = (row: BrandVO | SeriesVO | ModelVO) => {
    const id = row.id
    const referenced = ((row as BrandVO).vehicleCount ?? 0) > 0
    const children = level === 'brand' ? (row as BrandVO).seriesCount ?? 0
      : level === 'series' ? (row as SeriesVO).modelCount ?? 0 : 0
    Modal.confirm({
      title: `確定刪除該${LEVEL_LABEL[level]}？`,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: '確認刪除', cancelText: '取消',
      okButtonProps: { danger: true },
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>名稱：</span><b>{nameOf(level, row)}</b></div>
          {children > 0 && (
            <div className="confirm-info-row"><span>下級：</span>
              <b style={{ color: '#FF4D4F' }}>仍有 {children} 個下級記錄，需先處理後才能刪除</b></div>
          )}
          {referenced && (
            <div className="confirm-info-row"><span>引用：</span>
              <b style={{ color: '#FF4D4F' }}>已有 {(row as BrandVO).vehicleCount} 台車引用，建議改為「停用」而非刪除</b></div>
          )}
          <div className="confirm-info-row"><span>影響：</span><b>刪除後歷史車輛仍保留名稱快照，但無法再按此級別統計</b></div>
        </div>
      ),
      onOk: async () => {
        try {
          if (level === 'brand') await deleteBrand(id)
          else if (level === 'series') await deleteSeries(id)
          else await deleteModel(id)
          message.success('已刪除')
          void load()
        } catch (e) {
          // 拦截器已弹错，这里保持弹框关闭即可，不重复提示
          console.error(e)
        }
      },
    })
  }

  const toggleStatus = (row: BrandVO | SeriesVO | ModelVO, enabled: boolean) => {
    const id = row.id
    Modal.confirm({
      title: `確定要${enabled ? '啟用' : '停用'}該記錄？`,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: '確認', cancelText: '取消',
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>名稱：</span><b>{nameOf(level, row)}</b></div>
          <div className="confirm-info-row"><span>影響：</span>
            <b>{enabled ? '恢復後可被車輛檔案選用' : '停用後不再出現在車輛檔案的級聯選項中，歷史車不受影響'}</b></div>
        </div>
      ),
      onOk: async () => {
        const status = enabled ? 'enabled' : 'disabled'
        try {
          if (level === 'brand') {
            const b = row as BrandVO
            await updateBrand(id, {
              brandName: b.brandName, brandNameEn: b.brandNameEn ?? undefined,
              countryOrigin: b.countryOrigin ?? undefined, sortOrder: b.sortOrder, status,
            })
          } else if (level === 'series') {
            const s = row as SeriesVO
            await updateSeries(id, {
              brandId: s.brandId, seriesName: s.seriesName, bodyType: s.bodyType,
              energyType: s.energyType, seatCount: s.seatCount, status,
            })
          } else {
            const m = row as ModelVO
            await updateModel(id, {
              seriesId: m.seriesId, modelName: m.modelName, yearLabel: m.yearLabel,
              displacement: m.displacement ?? undefined, gearbox: m.gearbox ?? undefined,
              seatCount: m.seatCount ?? undefined, basePrice: m.basePrice ?? undefined, status,
            })
          }
          message.success(enabled ? '已啟用' : '已停用')
          void load()
        } catch (e) {
          console.error(e)
        }
      },
    })
  }

  const kw = filters.keyword?.trim().toLowerCase()
  const brandRows = useMemo(() => brands.filter(b => !kw || b.brandName.toLowerCase().includes(kw)), [brands, kw])
  const seriesRows = useMemo(() => series
    .filter(x => !kw || x.seriesName.toLowerCase().includes(kw) || (x.brandName ?? '').toLowerCase().includes(kw))
    .filter(x => !filters.brandId || x.brandId === filters.brandId), [series, kw, filters.brandId])
  const modelRows = useMemo(() => models
    .filter(x => !kw || x.modelName.toLowerCase().includes(kw) || (x.seriesName ?? '').toLowerCase().includes(kw))
    .filter(x => !filters.seriesId || x.seriesId === filters.seriesId), [models, kw, filters.seriesId])

  const statusCol = {
    key: 'status', title: '狀態', width: 110,
    render: (_: unknown, row: BrandVO | SeriesVO | ModelVO) => (
      <Switch
        checked={row.status === 'enabled'}
        checkedChildren="啟用" unCheckedChildren="停用"
        disabled={!canEdit}
        onChange={checked => toggleStatus(row, checked)}
      />
    ),
  }
  const auditCol = {
    key: 'updated', title: '最後更新', width: 190,
    render: (_: unknown, row: BrandVO | SeriesVO | ModelVO) => (
      <>{row.updatedBy}<div style={{ fontSize: 12, color: '#8C8C8C' }}>{row.updatedAt}</div></>
    ),
  }
  const actionCol = {
    key: 'action', title: t('common.colAction'), width: 150, fixed: 'right' as const,
    render: (_: unknown, row: BrandVO | SeriesVO | ModelVO) => (
      <Space size={0} split={<span className="action-split">|</span>}>
        <Button type="link" size="small" onClick={() => navigate(`/vehicle-files?keyword=${encodeURIComponent(nameOf(level, row))}`)}>查看引用</Button>
        {canEdit && <Button type="link" size="small" onClick={() => navigate(`/vehicle-master-data/edit?type=${level}&id=${row.id}`)}>編輯</Button>}
        {canEdit && <Button type="link" size="small" danger onClick={() => handleDelete(row)}>刪除</Button>}
      </Space>
    ),
  }

  const columns = level === 'brand'
    ? [
        { key: 'brandName', title: '品牌名稱', dataIndex: 'brandName', width: 170 },
        { key: 'brandNameEn', title: '英文名', dataIndex: 'brandNameEn', width: 160, render: (v?: string) => v ?? '—' },
        { key: 'countryOrigin', title: '產地板塊', dataIndex: 'countryOrigin', width: 120, render: (v?: string) => v ?? '—' },
        { key: 'seriesCount', title: '車系數', dataIndex: 'seriesCount', width: 100, align: 'center' as const },
        { key: 'vehicleCount', title: '引用車輛', dataIndex: 'vehicleCount', width: 100, align: 'center' as const },
        statusCol, auditCol, actionCol,
      ]
    : level === 'series'
      ? [
          { key: 'brandName', title: '所屬品牌', dataIndex: 'brandName', width: 150 },
          { key: 'seriesName', title: '車系名稱', dataIndex: 'seriesName', width: 170 },
          {
            key: 'bodyType', title: '車身形式', dataIndex: 'bodyType', width: 120,
            render: (v: string) => BODY_TYPE_OPTIONS.find(o => o.value === v)?.label ?? v,
          },
          {
            key: 'energyType', title: '能源類型', dataIndex: 'energyType', width: 140,
            render: (v: string) => <Tag color={v === 'ev' || v === 'phev' ? 'green' : 'default'}>{ENERGY_TYPE_LABEL[v] ?? v}</Tag>,
          },
          { key: 'seatCount', title: '預設載客', dataIndex: 'seatCount', width: 100, align: 'center' as const, render: (v: number) => `${v} 人` },
          { key: 'modelCount', title: '年款數', dataIndex: 'modelCount', width: 90, align: 'center' as const },
          { key: 'vehicleCount', title: '引用車輛', dataIndex: 'vehicleCount', width: 100, align: 'center' as const },
          statusCol, auditCol, actionCol,
        ]
      : [
          { key: 'brandName', title: '品牌', dataIndex: 'brandName', width: 130 },
          { key: 'seriesName', title: '車系', dataIndex: 'seriesName', width: 140 },
          { key: 'yearLabel', title: '年款', dataIndex: 'yearLabel', width: 100, render: (v: string) => v || '—' },
          { key: 'modelName', title: '車型名稱', dataIndex: 'modelName', width: 200 },
          { key: 'displacement', title: '排量', dataIndex: 'displacement', width: 100, render: (v?: string) => v ?? '—' },
          { key: 'gearbox', title: '變速箱', dataIndex: 'gearbox', width: 120, render: (v?: string) => v ?? '—' },
          {
            key: 'basePrice', title: '建議價', dataIndex: 'basePrice', width: 130, align: 'right' as const,
            render: (v?: number) => (v == null ? '—' : Number(v).toLocaleString()),
          },
          { key: 'vehicleCount', title: '引用車輛', dataIndex: 'vehicleCount', width: 100, align: 'center' as const },
          statusCol, auditCol, actionCol,
        ]

  const dataSource = level === 'brand' ? brandRows : level === 'series' ? seriesRows : modelRows

  return (
    <div className="content-area">
      {error && (
        <Alert
          type="error" showIcon style={{ marginBottom: 16 }}
          message={`加載失敗：${error}`}
          description="三級主數據一起載入，任一接口不可用都會讓級聯不完整；這裡明確區分故障與『真的沒數據』。"
          action={<a onClick={() => void load()}>重試</a>}
        />
      )}

      <div className="search-section">
        <Form layout="inline" onFinish={v => setFilters(v)}>
          <Form.Item label="關鍵詞" name="keyword">
            <Input placeholder={level === 'brand' ? '品牌名稱 / 英文名' : level === 'series' ? '車系 / 品牌' : '車型 / 車系'} allowClear style={{ width: '100%' }} />
          </Form.Item>
          {level === 'series' && (
            <Form.Item label="所屬品牌" name="brandId">
              <Select allowClear placeholder={t('common.all')} style={{ width: '100%' }}
                options={brands.map(b => ({ value: b.id, label: b.brandName }))} />
            </Form.Item>
          )}
          {level === 'model' && (
            <Form.Item label="所屬車系" name="seriesId">
              <Select allowClear showSearch optionFilterProp="label" placeholder={t('common.all')} style={{ width: '100%' }}
                options={series.map(s0 => ({ value: s0.id, label: `${s0.brandName ?? ''} ${s0.seriesName}` }))} />
            </Form.Item>
          )}
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { setFilters({}); void load() }}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <Tabs
        activeKey={level}
        onChange={switchLevel}
        style={{ marginBottom: 16 }}
        items={([
          { key: 'brand', label: `車輛品牌（${brands.length}）` },
          { key: 'series', label: `車系（${series.length}）` },
          { key: 'model', label: `年款車型（${models.length}）` },
        ])}
      />

      <div className="action-section">
        <div className="action-section-left">
          <Switch
            checked={includeDisabled} unCheckedChildren="啟用" checkedChildren="全部"
            onChange={setIncludeDisabled}
          />
          <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 8 }}>顯示含已停用的主數據</span>
          <Button className="btn-export" icon={<ExportOutlined />} disabled style={{ marginLeft: 12 }}>
            導出（主數據量小，暫未開放）
          </Button>
        </div>
        <div className="action-section-right">
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/vehicle-master-data/add?level=${level}`)}>
              新增{LEVEL_LABEL[level]}
            </Button>
          )}
        </div>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={dataSource}
        loading={loading}
        size="middle"
        scroll={{ x: 1500 }}
        locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        pagination={{
          showSizeChanger: true, showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (count) => t('common.total', { count }),
        }}
      />
    </div>
  )
}

function nameOf(level: Level, row: BrandVO | SeriesVO | ModelVO): string {
  if (level === 'brand') return (row as BrandVO).brandName
  if (level === 'series') return (row as SeriesVO).seriesName
  const m = row as ModelVO
  return m.yearLabel ? `${m.yearLabel} ${m.modelName}` : m.modelName
}

/* ==================== 新增 / 编辑（独立页面） ==================== */

function MasterFormView({ editing }: { editing: boolean }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const level = (searchParams.get('type') ?? searchParams.get('level') ?? 'brand') as Level
  const recordId = Number(searchParams.get('id')) || undefined

  const [brands, setBrands] = useState<BrandVO[]>([])
  const [series, setSeries] = useState<SeriesVO[]>([])
  const [models, setModels] = useState<ModelVO[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const back = useCallback(() => navigate(`/vehicle-master-data?level=${level}`), [navigate, level])

  useEffect(() => {
    let alive = true
    setLoading(true)
    void Promise.all([fetchBrands(true), fetchSeries(undefined, true), fetchModels(undefined, true)])
      .then(([b, s, m]) => { if (alive) { setBrands(b); setSeries(s); setModels(m) } })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [level])

  /** 编辑态回填：三级各自的字段集不同，按 level 组一份即可 */
  useEffect(() => {
    if (!editing || recordId == null) { form.resetFields(); return }
    if (level === 'brand') {
      const row = brands.find(b => b.id === recordId)
      if (row) form.setFieldsValue({ ...row, status: row.status === 'enabled' })
    } else if (level === 'series') {
      const row = series.find(x => x.id === recordId)
      if (row) form.setFieldsValue({ ...row, status: row.status === 'enabled' })
    } else if (level === 'model') {
      // 年款回填此前缺失：编辑年款进页面表单全空，保存会把 seriesId 等必填项判空（F5）
      const row = models.find(m => m.id === recordId)
      if (row) form.setFieldsValue({ ...row, status: row.status === 'enabled' })
    }
  }, [editing, recordId, level, brands, series, models, form])

  /** 新增车系/年款时带上来源行的品牌或车系：从列表页"新增"进入会经 query 传上下文 */
  const presetBrandId = Number(searchParams.get('brandId')) || undefined
  const presetSeriesId = Number(searchParams.get('seriesId')) || undefined

  const watchedEnergy = Form.useWatch('energyType', form)

  const handleSubmit = async () => {
    let raw: Record<string, unknown>
    try {
      raw = await form.validateFields()
    } catch {
      return // 字段下方已有红字
    }
    const status = raw.status === false ? 'disabled' : 'enabled'
    setSaving(true)
    try {
      if (level === 'brand') {
        const payload: BrandSave = {
          brandName: String(raw.brandName), brandNameEn: raw.brandNameEn as string | undefined,
          countryOrigin: raw.countryOrigin as string | undefined, sortOrder: raw.sortOrder as number | undefined,
          remark: raw.remark as string | undefined, status,
        }
        if (editing && recordId) await updateBrand(recordId, payload); else await createBrand(payload)
      } else if (level === 'series') {
        const payload: SeriesSave = {
          brandId: Number(raw.brandId), seriesName: String(raw.seriesName),
          bodyType: String(raw.bodyType), energyType: String(raw.energyType),
          seatCount: Number(raw.seatCount), remark: raw.remark as string | undefined, status,
        }
        if (editing && recordId) await updateSeries(recordId, payload); else await createSeries(payload)
      } else {
        const payload: ModelSave = {
          seriesId: Number(raw.seriesId), modelName: String(raw.modelName),
          yearLabel: (raw.yearLabel as string | undefined) ?? '', displacement: raw.displacement as string | undefined,
          gearbox: raw.gearbox as string | undefined, seatCount: raw.seatCount as number | undefined,
          basePrice: raw.basePrice as number | undefined, remark: raw.remark as string | undefined, status,
        }
        if (editing && recordId) await updateModel(recordId, payload); else await createModel(payload)
      }
      message.success(editing ? '已保存' : '已新增')
      back()
    } catch (e) {
      console.error(e) // 拦截器已提示，保留表单内容让用户改
    } finally {
      setSaving(false)
    }
  }

  const bodyTypeExtra = level === 'series'
    ? '選車系時自動帶出到車輛檔案'
    : undefined
  const energyExtra = level === 'series'
    ? (watchedEnergy === 'ev' || watchedEnergy === 'phev'
      ? '內地須 8 位新能源號牌'
      : '內地須 7 位普通號牌')
    : undefined

  return (
    <div className="content-area">
      {editing && level === 'model' && (
        <Alert
          type="info" showIcon style={{ marginBottom: 16 }}
          message="年款車型不可跨車系改歸屬"
          description="需要挪到別的車系時，請在目標車系下新建並刪除本條；否則歷史用車單的車型快照會與車系對不上。"
        />
      )}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16, borderRadius: 12,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ClusterOutlined />} onClick={back}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8 }}>返回</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
            {editing ? '編輯' : '新增'}{LEVEL_LABEL[level]}
          </h2>
        </div>
      </div>

      {loading ? <Spin /> : (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            status: true, sortOrder: 0, seatCount: level === 'series' ? 5 : undefined,
            brandId: presetBrandId, seriesId: presetSeriesId, energyType: 'petrol', bodyType: 'sedan',
          }}
        >
          <MasterSection title={`${LEVEL_LABEL[level]}信息`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {level === 'brand' && (
                <>
                  <Form.Item label="品牌名稱" name="brandName" rules={[{ required: true, message: '請填寫品牌名稱' }]}
                    extra="同品牌僅留一種正式寫法">
                    <Input placeholder="如 寶馬 / 保時捷" maxLength={60} />
                  </Form.Item>
                  <Form.Item label="英文名稱" name="brandNameEn">
                    <Input placeholder="選填，供多語言展示" maxLength={60} />
                  </Form.Item>
                  <Form.Item label="產地板塊" name="countryOrigin">
                    <Input placeholder="如 德國 / 日本" maxLength={30} />
                  </Form.Item>
                  <Form.Item label="展示順序" name="sortOrder" extra="數字越小越靠前">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </>
              )}

              {level === 'series' && (
                <>
                  <Form.Item label="所屬品牌" name="brandId" rules={[{ required: true, message: '請選擇品牌' }]}>
                    <Select showSearch optionFilterProp="label" placeholder="請選擇品牌"
                      disabled={editing}
                      options={brands.map(b => ({ value: b.id, label: b.brandName }))} />
                  </Form.Item>
                  <Form.Item label="車系名稱" name="seriesName" rules={[{ required: true, message: '請填寫車系名稱' }]}
                    extra="此處指車系，非車身形式">
                    <Input placeholder="如 5系" maxLength={80} />
                  </Form.Item>
                  <Form.Item label="車身形式" name="bodyType" rules={[{ required: true, message: '請選擇車身形式' }]} extra={bodyTypeExtra}>
                    <Select options={BODY_TYPE_OPTIONS} />
                  </Form.Item>
                  <Form.Item label="能源類型" name="energyType" rules={[{ required: true, message: '請選擇能源類型' }]} extra={energyExtra}>
                    <Select options={Object.entries(ENERGY_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
                  </Form.Item>
                  <Form.Item label="預設載客人數" name="seatCount" rules={[{ required: true, message: '請填寫載客人數' }]}
                    extra="含駕駛人">
                    <InputNumber min={1} max={60} style={{ width: '100%' }} />
                  </Form.Item>
                </>
              )}

              {level === 'model' && (
                <>
                  <Form.Item label="所屬車系" name="seriesId" rules={[{ required: true, message: '請選擇車系' }]}>
                    <Select showSearch optionFilterProp="label" placeholder="請選擇車系"
                      disabled={editing}
                      options={series.map(s0 => ({ value: s0.id, label: `${s0.brandName ?? ''} ${s0.seriesName}` }))} />
                  </Form.Item>
                  <Form.Item label="年款" name="yearLabel" extra="留空為未知年款">
                    <Input placeholder="如 2024款" maxLength={16} />
                  </Form.Item>
                  <Form.Item label="車型名稱" name="modelName" rules={[{ required: true, message: '請填寫車型名稱' }]}>
                    <Input placeholder="如 530Li 領先型" maxLength={80} />
                  </Form.Item>
                  <Form.Item label="排量" name="displacement" extra="純電可留空">
                    <Input placeholder="如 2.0T" maxLength={20} />
                  </Form.Item>
                  <Form.Item label="變速箱" name="gearbox">
                    <Input placeholder="如 手自一體 / 單速變速器" maxLength={20} />
                  </Form.Item>
                  <Form.Item label="座位數" name="seatCount" extra="留空沿用車系預設值">
                    <InputNumber min={1} max={60} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item label="廠商建議價" name="basePrice" extra="僅作資產原值參考">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </>
              )}

              <Form.Item label="備註" name="remark" style={{ gridColumn: 'span 3' }}>
                <RemarkTextArea />
              </Form.Item>
              <Form.Item label="狀態" name="status" valuePropName="checked" extra="停用後不進級聯選項">
                <Switch checkedChildren="啟用" unCheckedChildren="停用" />
              </Form.Item>
            </div>
          </MasterSection>

          <div className="form-footer">
            <Button onClick={back}>取消</Button>
            <Button type="primary" loading={saving} onClick={handleSubmit}>保存</Button>
          </div>
        </Form>
      )}
    </div>
  )
}

function MasterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <ClusterOutlined style={{ fontSize: 14, color: '#1890ff' }} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      </div>
      {children}
    </div>
  )
}
