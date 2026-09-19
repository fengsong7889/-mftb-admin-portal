import { Button, Empty, Card, Typography } from 'antd'
import {
  ExportOutlined,
  ImportOutlined,
  SyncOutlined,
  FileExcelOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

const { Title, Text } = Typography

/**
 * 导入导出 — 多语言管理模块
 * 第一阶段：占位页面，展示功能规划；第二阶段实现完整导入导出功能
 */
export default function ImportExport() {
  const { t: _t } = useTranslation()

  return (
    <div className="content-area" style={{ paddingTop: 40 }}>
      <Title level={4} style={{ marginBottom: 24 }}>
        <FileExcelOutlined style={{ color: '#E8720C', marginRight: 8 }} />
        翻譯導入導出
      </Title>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* 导出卡片 */}
        <Card
          style={{ borderRadius: 12, border: '1px solid #f0f0f0' }}
          styles={{ body: { padding: '24px' } }}
        >
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <ExportOutlined style={{ fontSize: 40, color: '#52C41A' }} />
          </div>
          <Title level={5} style={{ textAlign: 'center', marginBottom: 8 }}>導出翻譯</Title>
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 16, fontSize: 13 }}>
            選擇語言和分類，導出為 JSON 或 CSV 格式的翻譯文件，可用於備份或跨系統遷移。
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button icon={<ExportOutlined />} block>導出為 JSON</Button>
            <Button icon={<ExportOutlined />} block>導出為 CSV</Button>
          </div>
        </Card>

        {/* 导入卡片 */}
        <Card
          style={{ borderRadius: 12, border: '1px solid #f0f0f0' }}
          styles={{ body: { padding: '24px' } }}
        >
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <ImportOutlined style={{ fontSize: 40, color: '#1890FF' }} />
          </div>
          <Title level={5} style={{ textAlign: 'center', marginBottom: 8 }}>導入翻譯</Title>
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 16, fontSize: 13 }}>
            上傳 JSON 或 CSV 格式的翻譯文件，支持覆蓋、跳過、合併三種導入策略。
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button icon={<ImportOutlined />} block>上傳 JSON 文件</Button>
            <Button icon={<ImportOutlined />} block>上傳 CSV 文件</Button>
          </div>
        </Card>
      </div>

      {/* 前端 JSON 同步 */}
      <Card
        style={{ borderRadius: 12, border: '1px solid #f0f0f0', marginBottom: 24 }}
        styles={{ body: { padding: '24px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <SyncOutlined style={{ fontSize: 24, color: '#E8720C' }} />
          <div>
            <Title level={5} style={{ margin: 0 }}>前端 JSON 同步</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              一鍵將前端 zh-TW.json / en.json 的全量 i18n 鍵值同步到數據庫 sys_translation 表
            </Text>
          </div>
        </div>
        <Button type="primary" style={{ background: '#E8720C', borderColor: '#E8720C' }}>開始同步</Button>
      </Card>

      {/* 导入历史 */}
      <Card
        style={{ borderRadius: 12, border: '1px solid #f0f0f0' }}
        styles={{ body: { padding: '24px' } }}
      >
        <Title level={5} style={{ marginBottom: 16 }}>導入歷史</Title>
        <Empty description="暫無導入記錄" />
      </Card>
    </div>
  )
}
