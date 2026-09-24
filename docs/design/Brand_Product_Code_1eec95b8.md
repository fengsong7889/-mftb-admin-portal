# 资产品牌产品库编码列新增

## 编码规则

| 类型 | 格式 | 示例 | 说明 |
|------|------|------|------|
| 资产品牌 | `AB` + 2位全局序号 | AB01, AB02 | 已有存量数据，新增自动生成 |
| 产品 | 品牌编码 + `-` + 3位品牌内序号 | AB01-001, AB01-002 | 新建列，新增自动生成 |

---

## 1. 数据库变更

### 新建 SQL 迁移脚本 `backend/sql/165_brand_product_code.sql`（序号按实际递增）

- `biz_eam_model` 表新增 `code VARCHAR(32) DEFAULT NULL COMMENT '产品编码（品牌编码-3位序号）'`
- 存量产品回填：JOIN `biz_eam_brand` 取品牌 code，按品牌分组生成 `{brand_code}-{3位序号}`
- 添加索引 `KEY idx_code (code)`

---

## 2. 后端变更

### 2.1 Entity — `EamModel.java`
- 新增 `private String code;` 字段

### 2.2 DTO — `EamModelSaveDTO.java`
- 新增 `private String code;`（供前端传入或后端自动生成后填充）

### 2.3 Service — `EamBasicDataServiceImpl.java`

**品牌编码自动生成**（`createBrand` 方法）：
- 若 `dto.getCode()` 为空，调用 `bizSeqService.getRule("eam_brand_code")` 获取前缀和位数
- 简化实现：直接查 `SELECT MAX(code) FROM biz_eam_brand WHERE code LIKE 'AB%'`，取最大序号 +1，格式 `AB%02d`

**产品编码自动生成**（`createModel` 方法）：
- 查询所属品牌的 `code`（从 `EamBrand` 表）
- 查该品牌下最大产品序号：`SELECT MAX(code) FROM biz_eam_model WHERE code LIKE '{brandCode}-%'`
- 生成新 code：`{brandCode}-{3位序号}`，如 `AB01-001`

**`modelToMap` 方法**：
- 新增 `map.put("code", model.getCode())`

### 2.4 后端 Schema 初始化
- 在 `ConsumableSchemaInitializer` 或新建迁移逻辑中执行 ALTER TABLE + 存量回填

---

## 3. 前端变更

### 3.1 API 类型 — `src/api/eam.ts`
- `AssetModel` 接口新增 `code?: string`

### 3.2 品牌列表 — `src/pages/AssetManagement/AssetModel/ModelList.tsx`

**品牌表格列**（`brandColumns`）：
- 在"资产品牌"列前新增编码列：`{ title: '编码', dataIndex: 'code', key: 'code', width: 100 }`

**产品表格列**（`productColumns`）：
- 在"产品名称"列前新增编码列：`{ title: '编码', dataIndex: 'code', key: 'code', width: 130 }`

### 3.3 品牌详情 — `src/pages/AssetManagement/AssetModel/ModelDetail.tsx`
- 品牌 Descriptions 中新增"编码"字段展示
- 产品 Descriptions 中新增"编码"字段展示

### 3.4 表单页 — `src/pages/AssetManagement/AssetModel/ModelForm.tsx`
- 品牌/产品表单均不需要手动输入编码（后端自动生成）
- 编辑模式下可展示只读编码（可选）

---

## 4. 验证

- `cd backend && mvn compile -q` — 后端编译通过
- `npm run typecheck` — 前端类型检查通过
- `npm run lint` — Lint 检查通过
