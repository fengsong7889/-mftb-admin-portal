/**
 * 仓库维护列表（全宽表格布局）
 *
 * - 无左右分栏，纯列表展示
 * - 搜索区省/市/区 Select 下拉联动
 * - 表格列：编码、仓库名称、省份、城市、区县、详细地址、更新人、更新时间、备注、操作
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Form, Input, Select, Table, Modal, message, Space } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined, ExportOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchLocationList, deleteLocation, type AssetLocation } from '../../../api/eam'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { regionData, getProvinces, getCities, getDistricts } from '../../../constants/regionData'
import '../AssetCategory/index.css'

type LocationRow = AssetLocation

interface Props {
  onAdd: () => void
  onEdit: (id: number) => void
  onView: (id: number) => void
}

interface SearchFormValues {
  name?: string
  code?: string
  province?: string
  city?: string
  district?: string
  address?: string
  updatedBy?: string
}

export default function LocationList({ onAdd, onEdit, onView }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<SearchFormValues>()
  const [loading, setLoading] = useState(false)
  const [locations, setLocations] = useState<LocationRow[]>([])

  // 搜索条件
  const [searchName, setSearchName] = useState<string>()
  const [searchCode, setSearchCode] = useState<string>()
  const [searchProvince, setSearchProvince] = useState<string>()
  const [searchCity, setSearchCity] = useState<string>()
  const [searchDistrict, setSearchDistrict] = useState<string>()
  const [searchAddress, setSearchAddress] = useState<string>()
  const [searchUpdatedBy, setSearchUpdatedBy] = useState<string>()

  // 省市区联动选项
  const provinceOptions = useMemo(() => getProvinces(regionData).map(p => ({ label: p, value: p })), [])
  const cityOptions = useMemo(
    () => (searchProvince ? getCities(regionData, searchProvince).map(c => ({ label: c, value: c })) : []),
    [searchProvince],
  )
  const districtOptions = useMemo(
    () => (searchProvince && searchCity ? getDistricts(regionData, searchProvince, searchCity).map(d => ({ label: d, value: d })) : []),
    [searchProvince, searchCity],
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchLocationList({})
      setLocations(list)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { loadData() }, [loadData])

  /** 省份变更时清空市/区县 */
  const handleProvinceChange = (value: string | undefined) => {
    form.setFieldsValue({ city: undefined, district: undefined })
    setSearchProvince(value)
    setSearchCity(undefined)
    setSearchDistrict(undefined)
  }

  /** 城市变更时清空区县 */
  const handleCityChange = (value: string | undefined) => {
    form.setFieldsValue({ district: undefined })
    setSearchCity(value)
    setSearchDistrict(undefined)
  }

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setSearchName(v.name || undefined)
    setSearchCode(v.code || undefined)
    setSearchProvince(v.province || undefined)
    setSearchCity(v.city || undefined)
    setSearchDistrict(v.district || undefined)
    setSearchAddress(v.address || undefined)
    setSearchUpdatedBy(v.updatedBy || undefined)
  }

  const handleReset = () => {
    form.resetFields()
    setSearchName(undefined)
    setSearchCode(undefined)
    setSearchProvince(undefined)
    setSearchCity(undefined)
    setSearchDistrict(undefined)
    setSearchAddress(undefined)
    setSearchUpdatedBy(undefined)
  }

  /** 表格数据：按搜索条件过滤 */
  const tableData = useMemo(() => {
    let list = locations
    if (searchName) {
      list = list.filter(loc => loc.name.toLowerCase().includes(searchName.toLowerCase()))
    }
    if (searchCode) {
      list = list.filter(loc => loc.code.toLowerCase().includes(searchCode.toLowerCase()))
    }
    if (searchProvince) {
      list = list.filter(loc => (loc.province ?? '') === searchProvince)
    }
    if (searchCity) {
      list = list.filter(loc => (loc.city ?? '') === searchCity)
    }
    if (searchDistrict) {
      list = list.filter(loc => (loc.district ?? '') === searchDistrict)
    }
    if (searchAddress) {
      list = list.filter(loc => (loc.address ?? '').toLowerCase().includes(searchAddress.toLowerCase()))
    }
    if (searchUpdatedBy) {
      list = list.filter(loc => (loc.updatedBy ?? '').toLowerCase().includes(searchUpdatedBy.toLowerCase()))
    }
    return list
  }, [locations, searchName, searchCode, searchProvince, searchCity, searchDistrict, searchAddress, searchUpdatedBy])

  const handleDelete = (record: LocationRow) => {
    Modal.confirm({
      title: t('asset.confirmDeleteTitle'),
      content: `${record.name}（${record.code}）`,
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteLocation(record.id)
          message.success(t('asset.deleteSuccess'))
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('asset.deleteFailed'))
        }
      },
    })
  }

  const handleExport = () => {
    if (tableData.length === 0) {
      message.warning('暂无数据可导出')
      return
    }
    message.success('导出功能开发中')
  }

  /* ── 列字段配置 ── */
  const columnMeta = useMemo(() => [
    { key: 'code', title: '編碼' },
    { key: 'name', title: '倉庫名稱' },
    { key: 'province', title: '省份' },
    { key: 'city', title: '城市' },
    { key: 'district', title: '區縣' },
    { key: 'address', title: '詳細地址' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'remark', title: '備註' },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-location', columnMeta)

  const columns: TableColumnsType<LocationRow> = [
    {
      title: '編碼', dataIndex: 'code', key: 'code', width: 120, ellipsis: true,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: '倉庫名稱', dataIndex: 'name', key: 'name', width: 140, ellipsis: true,
    },
    {
      title: '省份', dataIndex: 'province', key: 'province', width: 140, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '城市', dataIndex: 'city', key: 'city', width: 100, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '區縣', dataIndex: 'district', key: 'district', width: 100, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '詳細地址', dataIndex: 'address', key: 'address', width: 180, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 110, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 170, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '備註', dataIndex: 'remark', key: 'remark', width: 140, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('common.colAction'), key: 'action', width: 160, fixed: 'right' as const,
      render: (_: unknown, record: LocationRow) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onView(record.id)}>
            {t('common.detail')}
          </Button>
          <Button type="link" size="small" onClick={() => onEdit(record.id)}>
            {t('common.edit')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      {/* 搜索区 */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label="仓库名称" name="name">
            <Input placeholder="请输入仓库名称" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="编码" name="code">
            <Input placeholder="请输入编码" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="省份" name="province">
            <Select
              placeholder="请选择省份"
              allowClear
              showSearch
              options={provinceOptions}
              onChange={handleProvinceChange}
              style={{ minWidth: 140 }}
            />
          </Form.Item>
          <Form.Item label="城市" name="city">
            <Select
              placeholder={searchProvince ? '请选择城市' : '请先选择省份'}
              allowClear
              showSearch
              disabled={!searchProvince}
              options={cityOptions}
              onChange={handleCityChange}
              style={{ minWidth: 140 }}
            />
          </Form.Item>
          <Form.Item label="区县" name="district">
            <Select
              placeholder={searchCity ? '请选择区县' : '请先选择城市'}
              allowClear
              showSearch
              disabled={!searchCity}
              options={districtOptions}
              onChange={(v) => setSearchDistrict(v)}
              style={{ minWidth: 140 }}
            />
          </Form.Item>
          <Form.Item label="详细地址" name="address">
            <Input placeholder="请输入详细地址" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="最后更新人" name="updatedBy">
            <Input placeholder="请输入更新人" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
            新增倉庫
          </Button>
          {configComponent}
        </div>
      </div>

      {/* 表格 */}
      <Table<LocationRow>
        columns={applyConfig(columns)}
        dataSource={tableData}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1320 }}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条`,
        }}
      />
    </>
  )
}
