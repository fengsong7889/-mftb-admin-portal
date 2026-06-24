# 表格列配置组件使用指南

## 📦 功能特性

- ✅ **抽屉形式**：从右侧滑出，不遮挡主内容
- ✅ **拖拽排序**：支持字段拖拽调整顺序
- ✅ **显示/隐藏**：自由选择需要展示的字段
- ✅ **字段锁定**：支持头部/尾部锁定区域
- ✅ **本地存储**：配置自动保存到 localStorage
- ✅ **公共组件**：一次集成，处处使用

## 🚀 快速开始

### 最简用法（3步完成）

```tsx
import { useMemo } from 'react'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

export default function MyPage() {
  // 1. 定义列元数据
  const columnMeta = useMemo(() => [
    { key: 'id', title: 'ID' },
    { key: 'name', title: '名称' },
    { key: 'status', title: '状态' },
    { key: 'action', title: '操作' },
  ], [])

  // 2. 使用 Hook（返回配置组件和自动处理好的 columns）
  const { columns, configComponent } = useColumnConfig('my-page', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' }, // 锁定操作列到右侧
  ])

  return (
    <div>
      {/* 3. 在按钮区域放置配置组件 */}
      <Button type="primary">新增</Button>
      {configComponent}

      {/* 4. 直接使用 columns，已自动应用配置 */}
      <Table columns={columns} dataSource={data} />
    </div>
  )
}
```

### 完整用法（自定义列渲染）

```tsx
import { useMemo } from 'react'
import { Tag, Badge } from 'antd'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

export default function MyPage() {
  const columnMeta = useMemo(() => [
    { key: 'id', title: 'ID' },
    { key: 'name', title: '名称' },
    { key: 'type', title: '类型' },
    { key: 'status', title: '状态' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('my-page', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  // 自定义完整的 columns 定义（带 render）
  const columns = [
    { 
      title: 'ID', 
      dataIndex: 'id', 
      key: 'id',
      render: (id: number) => `#${id}`
    },
    { 
      title: '名称', 
      dataIndex: 'name', 
      key: 'name' 
    },
    { 
      title: '类型', 
      dataIndex: 'type', 
      key: 'type',
      render: (type: string) => <Tag color="blue">{type}</Tag>
    },
    { 
      title: '状态', 
      dataIndex: 'status', 
      key: 'status',
      render: (status: string) => (
        <Badge 
          status={status === 'active' ? 'success' : 'default'} 
          text={status === 'active' ? '启用' : '停用'} 
        />
      )
    },
    { 
      title: '操作', 
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="link">编辑</Button>
          <Button type="link" danger>删除</Button>
        </Space>
      )
    },
  ]

  return (
    <div>
      <Button type="primary">新增</Button>
      {configComponent}
      
      {/* 使用 applyConfig 应用配置到自定义 columns */}
      <Table columns={applyConfig(columns)} dataSource={data} />
    </div>
  )
}
```

## 📖 API

### useColumnConfig Hook

```typescript
const { config, configComponent, columns, applyConfig } = useColumnConfig(
  pageKey: string,              // 页面唯一标识，用于 localStorage
  allColumns: ColumnMeta[],     // 列元数据数组
  defaultConfig?: DefaultConfig[] // 可选的默认配置
)
```

#### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pageKey` | `string` | ✅ | 页面唯一标识，如 `'waterfall'`、`'algorithm'` |
| `allColumns` | `{ key: string; title: string }[]` | ✅ | 列元数据，定义所有可用字段 |
| `defaultConfig` | `Partial<ColumnConfig>[]` | ❌ | 默认配置，可设置字段锁定和可见性 |

#### 返回值

| 返回值 | 类型 | 说明 |
|--------|------|------|
| `config` | `ColumnConfig[]` | 当前配置状态 |
| `configComponent` | `ReactNode` | 配置抽屉组件，放置在按钮区域 |
| `columns` | `any[]` | 自动应用配置后的列定义（简单用法） |
| `applyConfig` | `(columns: any[]) => any[]` | 手动应用配置的函数（自定义列渲染时使用） |

### ColumnConfig 接口

```typescript
interface ColumnConfig {
  key: string                    // 字段唯一标识
  title: string                  // 字段显示名称
  visible: boolean               // 是否可见
  locked: 'head' | 'tail' | null // 锁定位置：头部、尾部、不锁定
}
```

## 🎯 使用场景

### 场景1：简单列表（无需自定义渲染）

```tsx
const columnMeta = useMemo(() => [
  { key: 'id', title: 'ID' },
  { key: 'name', title: '名称' },
  { key: 'action', title: '操作' },
], [])

const { columns, configComponent } = useColumnConfig('simple-list', columnMeta)

return (
  <>
    <Button>新增</Button>
    {configComponent}
    <Table columns={columns} dataSource={data} />
  </>
)
```

### 场景2：复杂列表（需要自定义渲染）

```tsx
const columnMeta = useMemo(() => [
  { key: 'id', title: 'ID' },
  { key: 'name', title: '名称' },
  { key: 'status', title: '状态' },
  { key: 'action', title: '操作' },
], [])

const { configComponent, applyConfig } = useColumnConfig('complex-list', columnMeta, [
  { key: 'action', visible: true, locked: 'tail' },
])

const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id', render: (id) => `#${id}` },
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '状态', dataIndex: 'status', key: 'status', render: (s) => <Tag>{s}</Tag> },
  { title: '操作', key: 'action', render: () => <Button>编辑</Button> },
]

return (
  <>
    <Button>新增</Button>
    {configComponent}
    <Table columns={applyConfig(columns)} dataSource={data} />
  </>
)
```

### 场景3：带锁定字段

```tsx
const { configComponent, applyConfig } = useColumnConfig('with-lock', columnMeta, [
  { key: 'id', visible: true, locked: 'head' },      // 锁定到左侧
  { key: 'action', visible: true, locked: 'tail' },   // 锁定到右侧
])
```

## 💡 最佳实践

1. **pageKey 命名**：使用页面相关的唯一标识，如 `'waterfall'`、`'algorithm-order'`
2. **columnMeta 用 useMemo**：避免不必要的重新计算
3. **操作列锁定**：建议将操作列锁定到右侧 `locked: 'tail'`
4. **ID列锁定**：如有ID列，建议锁定到左侧 `locked: 'head'`
5. **配置组件位置**：放在操作按钮区域的最后

## 🎨 效果展示

- 点击设置图标按钮 → 右侧滑出抽屉
- 拖拽字段调整顺序
- 勾选/取消勾选控制显示
- 拖拽到头部/尾部区域实现锁定
- 配置自动保存到本地存储

## 📝 已集成页面

- ✅ Recommend/Waterfall（瀑布流配置）
- ✅ Recommend/Algorithm（算法配置）
- ✅ Recommend/Order（订单管理）
- ✅ AccountBalance（账户余额）
- ✅ ApprovalCenter（审批中心）
- ✅ HotSearchConfig（热搜配置）
- 等待更多页面集成...
