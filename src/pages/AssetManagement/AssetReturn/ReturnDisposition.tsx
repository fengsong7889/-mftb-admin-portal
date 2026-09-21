/**
 * 归还处置/找回登记 — 接通真实后端 API
 */
import { Alert, Button, DatePicker, Descriptions, Form, Input, Radio, Spin } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { ReturnRow } from '../../../api/eamReturn'
import AssetParameters from '../../../components/AssetParameters'
import { ReturnHeader, ReturnSection } from './ReturnLayout'

const DISPOSITION_OPTIONS = [
  { value: 'idle', label: '收回閒置（可再次使用）' },
  { value: 'scrapped', label: '登記報廢' },
  { value: 'written_off', label: '遺失核銷' },
]

interface Props {
  record?: ReturnRow
  loading?: boolean
  canEdit?: boolean
  recover?: boolean
  onSubmit: (dto: { disposition: 'idle' | 'scrapped' | 'written_off'; dispositionDate: string }) => void
  onBack: () => void
}

interface DispositionValues {
  disposition: 'idle' | 'scrapped' | 'written_off'
  date: dayjs.Dayjs
}

interface RecoverValues {
  note: string
}

export default function ReturnDisposition({ record, loading = false, canEdit = false, recover = false, onSubmit, onBack }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [dispositionForm] = Form.useForm<DispositionValues>()
  const [recoverForm] = Form.useForm<RecoverValues>()

  if (!record) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }

  if (!canEdit) {
    return <Alert type="warning" showIcon message="無歸還辦理權限" />
  }

  const handleDispositionSubmit = async () => {
    try {
      const values = await dispositionForm.validateFields()
      onSubmit({
        disposition: values.disposition,
        dispositionDate: values.date.format('YYYY-MM-DD'),
      })
    } catch { /* validation */ }
  }

  const handleRecoverSubmit = async () => {
    try {
      const _values = await recoverForm.validateFields()
      // For recover, we reuse the disposition API with a special note
      onSubmit({
        disposition: 'idle',
        dispositionDate: dayjs().format('YYYY-MM-DD'),
      })
    } catch { /* validation */ }
  }

  if (recover) {
    return <>
      <ReturnHeader title={`遺失資產 · ${record.returnNo}`} onBack={onBack} />
      <Spin spinning={loading}>
        <ReturnSection title="歸還記錄">
          <Descriptions column={2}>
            <Descriptions.Item label="歸還單號">{record.returnNo}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colAssetName')}>{record.assetName} ({record.assetNo})</Descriptions.Item>
            <Descriptions.Item label="原持有人">{record.empName}</Descriptions.Item>
            <Descriptions.Item label="驗收狀況">遺失</Descriptions.Item>
          </Descriptions>
          <AssetParameters asset={record} current />
        </ReturnSection>
        <ReturnSection title="找回信息">
          <Alert className="claim-notice" showIcon type="info" message={
            <span>遺失資產功能已遷移至「遺失資產」模塊。請前往 <a onClick={() => navigate('/asset-loss')}>遺失資產</a> 菜單進行找回、驗收等操作。</span>
          } />
        </ReturnSection>
      </Spin>
      <div className="form-footer">
        <Button onClick={onBack}>返回</Button>
      </div>
    </>
  }

  return <>
    <ReturnHeader title={`處置登記 · ${record.returnNo}`} onBack={onBack} />
    <Spin spinning={loading}>
      <ReturnSection title="歸還記錄">
        <Descriptions column={2}>
          <Descriptions.Item label="歸還單號">{record.returnNo}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colAssetName')}>{record.assetName} ({record.assetNo})</Descriptions.Item>
          <Descriptions.Item label="原持有人">{record.empName}</Descriptions.Item>
          <Descriptions.Item label="驗收狀況">{record.assetCondition}</Descriptions.Item>
        </Descriptions>
        <AssetParameters asset={record} current />
      </ReturnSection>
      <ReturnSection title="處置結果">
        <Alert className="claim-notice" showIcon type="warning" message="登記實物處置結果。處置不影響已建立的責任賠付流程。" />
        <Form<DispositionValues> form={dispositionForm} layout="vertical" disabled={loading} initialValues={{ date: dayjs() }}>
          <Form.Item name="disposition" label="處置結果" rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid" options={DISPOSITION_OPTIONS} />
          </Form.Item>
          <Form.Item name="date" label="處置日期" rules={[{ required: true }]}>
            <DatePicker disabledDate={d => d.isAfter(dayjs(), 'day')} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </ReturnSection>
    </Spin>
    <div className="form-footer">
      <Button onClick={onBack}>取消</Button>
      <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={handleDispositionSubmit}>確認處置</Button>
    </div>
  </>
}
