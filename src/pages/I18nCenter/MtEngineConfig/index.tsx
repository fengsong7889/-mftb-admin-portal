import { useCallback, useEffect, useState } from 'react'
import {
  Card,
  Typography,
  Tag,
  Progress,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  message,
  Spin,
  Descriptions,
  Switch,
} from 'antd'
import {
  ToolOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
  EditOutlined,
  SendOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  fetchMtEngines,
  updateMtEngine,
  testMtEngineTranslate,
  type MtEngineVO,
  type MtEngineUpdatePayload,
} from '../../../api/mtEngine'
import { fetchLanguages, type LanguageVO } from '../../../api/translation'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

/** 引擎描述信息 */
const ENGINE_DESC: Record<string, string> = {
  mymemory: '免費開源翻譯引擎，基於 Translation Memory 技術，無需 API Key 即可使用',
  deepl: '高品質翻譯引擎，支持 30+ 語言，翻譯質量業界領先，需付費 API Key',
  openai: '基於 GPT 模型的上下文感知翻譯，適合專業術語和複雜語境，需付費 API Key',
}

/**
 * 机翻引擎配置 — 多语言管理模块
 */
export default function MtEngineConfig() {
  const [engines, setEngines] = useState<MtEngineVO[]>([])
  const [languages, setLanguages] = useState<LanguageVO[]>([])
  const [loading, setLoading] = useState(true)
  const [editingEngine, setEditingEngine] = useState<MtEngineVO | null>(null)
  const [editForm] = Form.useForm()
  const [editLoading, setEditLoading] = useState(false)

  // 翻译测试
  const [testEngineId, setTestEngineId] = useState<number | null>(null)
  const [testText, setTestText] = useState('')
  const [testTargetLang, setTestTargetLang] = useState('en')
  const [testResult, setTestResult] = useState<{
    success: boolean
    translatedText?: string
    error?: string
  } | null>(null)
  const [testLoading, setTestLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [engineData, langData] = await Promise.all([
        fetchMtEngines(),
        fetchLanguages(),
      ])
      setEngines(engineData)
      if (langData) setLanguages(langData)
      // 默认选中第一个启用的引擎
      const active = engineData.find((e) => e.status === 1)
      if (active && !testEngineId) {
        setTestEngineId(active.id)
      }
    } catch {
      message.error('載入引擎配置失敗')
    } finally {
      setLoading(false)
    }
  }, [testEngineId])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 打开编辑弹窗
  const handleEdit = (engine: MtEngineVO) => {
    setEditingEngine(engine)
    editForm.setFieldsValue({
      engineName: engine.engineName,
      apiUrl: engine.apiUrl,
      apiKey: '',
      dailyLimit: engine.dailyLimit,
      timeoutMs: engine.timeoutMs,
      configJson: engine.configJson,
    })
  }

  // 保存编辑
  const handleSave = async () => {
    if (!editingEngine) return
    try {
      const values = await editForm.validateFields()
      setEditLoading(true)
      const payload: MtEngineUpdatePayload = {
        engineName: values.engineName,
        apiUrl: values.apiUrl,
        dailyLimit: values.dailyLimit,
        timeoutMs: values.timeoutMs,
        configJson: values.configJson,
      }
      // API Key 留空不覆盖
      if (values.apiKey) {
        payload.apiKey = values.apiKey
      }
      await updateMtEngine(editingEngine.id, payload)
      message.success('引擎配置已更新')
      setEditingEngine(null)
      loadData()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return // form validation
      message.error('保存失敗')
    } finally {
      setEditLoading(false)
    }
  }

  // 切换启停
  const handleToggleStatus = async (engine: MtEngineVO, checked: boolean) => {
    try {
      await updateMtEngine(engine.id, { status: checked ? 1 : 0 })
      message.success(checked ? '已啟用' : '已停用')
      loadData()
    } catch {
      message.error('操作失敗')
    }
  }

  // 翻译测试
  const handleTest = async () => {
    if (!testEngineId) {
      message.warning('請選擇一個引擎')
      return
    }
    if (!testText.trim()) {
      message.warning('請輸入待翻譯文本')
      return
    }
    if (testTargetLang === 'zh-TW') {
      message.warning('目標語言不能與源語言（繁中）相同')
      return
    }
    setTestLoading(true)
    setTestResult(null)
    try {
      const result = await testMtEngineTranslate(testEngineId, testText.trim(), testTargetLang)
      setTestResult({
        success: result.success,
        translatedText: result.translatedText,
        error: result.error,
      })
    } catch (err: unknown) {
      const errorMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message || '請求失敗'
          : '請求失敗'
      setTestResult({ success: false, error: errorMsg })
    } finally {
      setTestLoading(false)
    }
  }

  // 计算用量百分比
  const getUsagePercent = (engine: MtEngineVO) => {
    if (!engine.dailyLimit || engine.dailyLimit === 0) return 0
    return Math.min(100, Math.round(((engine.todayUsage || 0) / engine.dailyLimit) * 100))
  }

  const activeEngine = engines.find((e) => e.status === 1)

  if (loading && engines.length === 0) {
    return (
      <div className="content-area" style={{ textAlign: 'center', padding: '80px 0' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="content-area">
      <Title level={4} style={{ marginBottom: 20 }}>
        <ToolOutlined style={{ color: '#E8720C', marginRight: 8 }} />
        機翻引擎配置
      </Title>

      {/* 当前活跃引擎 */}
      {activeEngine && (
        <Card
          style={{
            borderRadius: 12,
            border: '1px solid #E8720C',
            marginBottom: 16,
            background: 'linear-gradient(135deg, #FFF7E6 0%, #FFFFFF 50%)',
          }}
          styles={{ body: { padding: '24px' } }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ThunderboltOutlined style={{ fontSize: 24, color: '#E8720C' }} />
              <div>
                <Title level={5} style={{ margin: 0 }}>
                  {activeEngine.engineName}
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {ENGINE_DESC[activeEngine.engineKey] || '當前使用的機器翻譯引擎'}
                </Text>
              </div>
            </div>
            <Tag color="success" icon={<CheckCircleOutlined />}>
              啟用中
            </Tag>
          </div>

          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="API 地址">
              <code style={{ fontSize: 12 }}>{activeEngine.apiUrl}</code>
            </Descriptions.Item>
            <Descriptions.Item label="每日額度">
              {activeEngine.dailyLimit?.toLocaleString()} 字符/天
            </Descriptions.Item>
            <Descriptions.Item label="請求超時">
              {((activeEngine.timeoutMs || 10000) / 1000).toFixed(0)} 秒
            </Descriptions.Item>
            <Descriptions.Item label="API Key">
              <Text type="secondary">{activeEngine.apiKey || '未設置'}</Text>
            </Descriptions.Item>
          </Descriptions>

          {/* 用量进度条 */}
          <div style={{ marginTop: 16, maxWidth: 500 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <Text style={{ fontSize: 13 }}>今日用量</Text>
              <Text strong style={{ fontSize: 13 }}>
                {(activeEngine.todayUsage || 0).toLocaleString()} /{' '}
                {activeEngine.dailyLimit?.toLocaleString()} 字符
              </Text>
            </div>
            <Progress
              percent={getUsagePercent(activeEngine)}
              status={getUsagePercent(activeEngine) >= 90 ? 'exception' : 'normal'}
              strokeColor={getUsagePercent(activeEngine) >= 90 ? '#ff4d4f' : '#E8720C'}
            />
          </div>
        </Card>
      )}

      {/* 所有引擎列表 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginBottom: 24 }}>
        {engines.map((engine) => {
          const isActive = engine.status === 1
          const isOnlyActive = isActive && engines.filter((e) => e.status === 1).length === 1
          return (
            <Card
              key={engine.id}
              style={{
                borderRadius: 12,
                border: isActive ? '1px solid #E8720C' : '1px dashed #d9d9d9',
                opacity: isActive ? 1 : 0.75,
              }}
              styles={{ body: { padding: '20px' } }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ThunderboltOutlined
                    style={{ fontSize: 18, color: isActive ? '#E8720C' : '#bfbfbf' }}
                  />
                  <Title level={5} style={{ margin: 0 }}>
                    {engine.engineName}
                  </Title>
                </div>
                <Space>
                  <Switch
                    checked={isActive}
                    onChange={(checked) => handleToggleStatus(engine, checked)}
                    disabled={isOnlyActive && isActive}
                    size="small"
                  />
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(engine)}
                  />
                </Space>
              </div>

              <Paragraph
                type="secondary"
                style={{ fontSize: 13, marginBottom: 12, minHeight: 40 }}
              >
                {ENGINE_DESC[engine.engineKey] || engine.engineName}
              </Paragraph>

              <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    API:{' '}
                  </Text>
                  <code style={{ fontSize: 11 }}>{engine.apiUrl}</code>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    額度:{' '}
                  </Text>
                  <Text style={{ fontSize: 12 }}>
                    {engine.dailyLimit?.toLocaleString()} 字符/天
                  </Text>
                </div>
              </div>

              {!isActive && (
                <Tag
                  color="default"
                  icon={<CloseCircleOutlined />}
                  style={{ marginTop: 8 }}
                >
                  未啟用
                </Tag>
              )}
            </Card>
          )
        })}
      </div>

      {/* 翻译测试区 */}
      <Card
        style={{ borderRadius: 12, border: '1px solid #f0f0f0' }}
        styles={{ body: { padding: '24px' } }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <Title level={5} style={{ margin: 0 }}>
            <SendOutlined style={{ marginRight: 8, color: '#E8720C' }} />
            翻譯測試
          </Title>
          <Button icon={<ReloadOutlined />} onClick={loadData} size="small">
            刷新
          </Button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* 左侧: 输入区 */}
          <div>
            <div style={{ marginBottom: 8 }}>
              <Text strong style={{ fontSize: 13 }}>
                選擇引擎
              </Text>
            </div>
            <Select
              value={testEngineId}
              onChange={setTestEngineId}
              style={{ width: '100%', marginBottom: 12 }}
              options={engines
                .filter((e) => e.status === 1)
                .map((e) => ({ label: e.engineName, value: e.id }))}
              placeholder="選擇啟用的引擎"
            />

            <div style={{ marginBottom: 8 }}>
              <Text strong style={{ fontSize: 13 }}>
                目標語言
              </Text>
            </div>
            <Select
              value={testTargetLang}
              onChange={setTestTargetLang}
              style={{ width: '100%', marginBottom: 12 }}
              options={languages.map((l) => ({
                label: `${l.flag} ${l.name}`,
                value: l.code,
              }))}
              showSearch
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
              }
            />

            <div style={{ marginBottom: 8 }}>
              <Text strong style={{ fontSize: 13 }}>
                源文本（繁中）
              </Text>
            </div>
            <TextArea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="輸入待翻譯的繁體中文文本..."
              rows={4}
              style={{ marginBottom: 12 }}
            />

            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleTest}
              loading={testLoading}
              disabled={!testEngineId || !testText.trim()}
              style={{ background: '#E8720C', borderColor: '#E8720C' }}
            >
              測試翻譯
            </Button>
          </div>

          {/* 右侧: 结果区 */}
          <div>
            <div style={{ marginBottom: 8 }}>
              <Text strong style={{ fontSize: 13 }}>
                翻譯結果
              </Text>
            </div>
            <Card
              style={{
                borderRadius: 8,
                border: '1px solid #f0f0f0',
                background: testResult?.success ? '#F6FFED' : testResult?.success === false ? '#FFF2F0' : '#fafafa',
                minHeight: 180,
              }}
              styles={{ body: { padding: '16px' } }}
            >
              {testLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <Spin />
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary">翻譯中...</Text>
                  </div>
                </div>
              ) : testResult ? (
                testResult.success ? (
                  <div>
                    <Tag color="success" icon={<CheckCircleOutlined />} style={{ marginBottom: 8 }}>
                      翻譯成功
                    </Tag>
                    <Paragraph style={{ fontSize: 16, margin: '12px 0 0' }}>
                      {testResult.translatedText}
                    </Paragraph>
                  </div>
                ) : (
                  <div>
                    <Tag color="error" icon={<CloseCircleOutlined />} style={{ marginBottom: 8 }}>
                      翻譯失敗
                    </Tag>
                    <Paragraph type="danger" style={{ fontSize: 13, margin: '12px 0 0' }}>
                      {testResult.error}
                    </Paragraph>
                  </div>
                )
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <Text type="secondary">輸入文本並點擊「測試翻譯」查看結果</Text>
                </div>
              )}
            </Card>
          </div>
        </div>
      </Card>

      {/* 编辑弹窗 */}
      <Modal
        title={`編輯引擎配置 — ${editingEngine?.engineName || ''}`}
        open={!!editingEngine}
        onOk={handleSave}
        onCancel={() => setEditingEngine(null)}
        confirmLoading={editLoading}
        okText="保存"
        cancelText="取消"
        width={560}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="引擎名稱" name="engineName" rules={[{ required: true, message: '請輸入引擎名稱' }]}>
            <Input placeholder="如: MyMemory 免費翻譯" />
          </Form.Item>
          <Form.Item label="API 地址" name="apiUrl" rules={[{ required: true, message: '請輸入 API 地址' }]}>
            <Input placeholder="如: https://api.mymemory.translated.net/get" />
          </Form.Item>
          <Form.Item
            label="API Key"
            name="apiKey"
            extra="留空保持原值不變；僅在需要更換 Key 時填寫"
          >
            <Input.Password placeholder="留空保持原值" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item label="每日額度（字符）" name="dailyLimit" rules={[{ required: true, message: '請輸入額度' }]}>
              <InputNumber min={1000} max={10000000} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="請求超時（毫秒）" name="timeoutMs" rules={[{ required: true, message: '請輸入超時' }]}>
              <InputNumber min={1000} max={60000} step={1000} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item label="擴展配置（JSON）" name="configJson">
            <TextArea rows={3} placeholder='如: {"email":"user@example.com"}' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
