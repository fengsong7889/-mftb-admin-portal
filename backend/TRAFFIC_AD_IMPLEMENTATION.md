# MFTB 搜广推系统 - 投流广告功能模块
## 后端开发与数据库设计完成报告

---

## 一、项目概述

本模块完成了 MFTB 搜广推系统中的**投流广告**功能，实现了从算法库管理、销售定价配置、广告销售到店铺推广的完整业务流程。

### 核心特性
- ✅ **算法库管理**: 支持投流广告算法的配置和管理（algo_type = 15）
- ✅ **销售定价**: 支持预设档位（流量包套餐）+ 自定义阶梯单价两种模式
- ✅ **广告销售**: 完整的下单、扣款、订单生成流程
- ✅ **店铺推广**: 门店可购买和查看历史订单
- ✅ **赠送抵扣**: 支持使用赠送天数抵扣订单金额
- ✅ **退款机制**: 按剩余未消耗曝光折算退款金额

---

## 二、数据库设计

### 2.1 新增表结构

#### (1) biz_ad_pricing_traffic_tier - 投流广告档位明细表
**用途**: 存储预设流量包套餐（如基础版/标准版/进阶版）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT | 主键 ID |
| pricing_id | BIGINT | 计价主表 ID |
| tier_name | VARCHAR(128) | 档位名称 |
| tier_code | VARCHAR(64) | 档位编码 |
| impressions | INT | 曝光次数 |
| price | DECIMAL(12,2) | 档位价格 (MOP) |
| sell_days | INT | 销售周期（多少天内有效） |
| on_sale | TINYINT | 售卖状态：1=在售 2=下架 |
| sort | INT | 排序号 |
| remark | VARCHAR(500) | 备注 |

**SQL 文件**: [`sql/70_traffic_pricing_tables.sql`](../sql/70_traffic_pricing_tables.sql)

#### (2) biz_ad_pricing_traffic_ladder - 投流广告阶梯单价表
**用途**: 存储自定义购买时的阶梯单价配置

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT | 主键 ID |
| pricing_id | BIGINT | 计价主表 ID |
| min_qty | INT | 最低数量（含） |
| max_qty | INT | 最高数量（含，NULL=无上限） |
| unit_price | DECIMAL(12,2) | 单价 (MOP/1000 次曝光) |
| sort | INT | 排序号 |

**SQL 文件**: [`sql/70_traffic_pricing_tables.sql`](../sql/70_traffic_pricing_tables.sql)

#### (3) biz_ad_order_item_traffic - 投流广告订单明细表
**用途**: 存储订单的流量包明细（一个订单一条记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT | 主键 ID |
| order_id | BIGINT | 订单主表 ID |
| order_no | VARCHAR(64) | 订单编号快照 |
| mode | VARCHAR(32) | 购买方式：tier/custom |
| package_name | VARCHAR(255) | 流量包名称 |
| impressions | INT | 购买曝光次数 |
| unit_price | DECIMAL(12,6) | 实际单价 |
| delivery_slot | VARCHAR(32) | 投流时段 |
| original_price | DECIMAL(12,2) | 订单原价 |
| sale_price | DECIMAL(12,2) | 实付金额 |
| refund_price | DECIMAL(12,2) | 已退款金额 |
| refund_fee_percent | INT | 退款手续费比例% |
| consumed_impressions | INT | 已消耗曝光次数 |
| delivery_status | TINYINT | 投放状态：1=投放中 2=已消耗完毕 3=已退款 |

**SQL 文件**: [`sql/72_traffic_order_item.sql`](../sql/72_traffic_order_item.sql)

### 2.2 现有表复用

| 表名 | 用途 |
|------|------|
| biz_ad_algorithm | 算法登记表（algo_type=15 为投流广告） |
| biz_ad_pricing_traffic | 投流广告计价主表 |
| biz_ad_order | 推广订单主表（通用） |

---

## 三、后端服务实现

### 3.1 控制器层（Controller）

#### 📋 AdPricingTrafficController.java
**路径**: [`src/main/java/com/mftb/admin/controller/AdPricingTrafficController.java`](../src/main/java/com/mftb/admin/controller/AdPricingTrafficController.java)

**接口列表**:
```
GET    /api/ad/pricing/traffic              分页查询定价配置列表
GET    /api/ad/pricing/traffic/{id}         获取定价详情（含档位 + 阶梯）
GET    /api/ad/pricing/traffic/active       按算法 + 频道查询启用的定价
GET    /api/ad/pricing/traffic/list-by-algo 按算法查询所有频道的定价
POST   /api/ad/pricing/traffic              创建定价配置
PUT    /api/ad/pricing/traffic/{id}         更新定价配置
PUT    /api/ad/pricing/traffic/{id}/status  启用/停用定价
DELETE /api/ad/pricing/traffic/{id}         删除定价配置
```

**权限要求**: 
- 查询类：`menu="ad-sales"`
- 写操作类：`menu="ad-sales", action="edit"`

#### 🛒 AdSalesTrafficController.java
**路径**: [`src/main/java/com/mftb/admin/controller/AdSalesTrafficController.java`](../src/main/java/com/mftb/admin/controller/AdSalesTrafficController.java)

**接口列表**:
```
POST   /api/ad/sales/traffic/order          下单购买投流广告
```

**请求参数**: `AdTrafficOrderRequest`
```java
{
  "pricingId": 1,              // 定价配置 ID（必填）
  "mode": "tier",              // 购买方式：tier/custom（必填）
  "tierId": 10,                // 档位 ID（mode=tier 时必填）
  "impressions": 50000,        // 自定义曝光次数（mode=custom 时必填）
  "deliverySlot": "business",  // 投流时段：business/allday
  "groupCode": "GRP001",       // 购买集团 ID（必填）
  "storeCode": "STO001",       // 购买门店编码
  "bdEmpId": "EMP001",         // 归属 BD
  "giftDays": 5,               // 赠送天数抵扣
  "remark": "备注信息"
}
```

### 3.2 服务层（Service）

#### 💰 AdPricingTrafficService
**路径**: [`src/main/java/com/mftb/admin/service/impl/AdPricingTrafficServiceImpl.java`](../src/main/java/com/mftb/admin/service/impl/AdPricingTrafficServiceImpl.java)

**核心功能**:
- 定价配置 CRUD 操作
- 预设档位的增删改查（整体替换）
- 阶梯单价的配置（自动推导区间上限）
- 折扣计算（限时折扣/常驻折扣）

**计价逻辑**:
1. **档位模式**: 读取档位价格 → 判断是否处于折扣期 → 计算折后价
2. **自定义模式**: 匹配阶梯单价区间 → 曝光次数 × 单价 → 计算总价

#### 🛒 AdSalesTrafficService
**路径**: [`src/main/java/com/mftb/admin/service/impl/AdSalesTrafficServiceImpl.java`](../src/main/java/com/mftb/admin/service/impl/AdSalesTrafficServiceImpl.java)

**下单流程**:
```
1. 校验定价配置是否存在且启用中
2. 选择计价模式：
   - tier: 读取档位曝光次数和价格
   - custom: 匹配阶梯单价并计算总价
3. 赠送天数抵扣：
   - 校验门店存在性
   - 检查可用赠送天数余额
   - 按每日折算价值（默认 150 MOP/天）抵扣
4. 推广金账户余额校验
5. 生成订单主表 + 订单明细表
6. 扣减赠送天数余额
7. 扣款并写入财务消费明细
```

**退款规则**（在 AdOrderService.refund 中实现）:
```
退款金额 = 剩余曝光 × 实际单价 × (1 - 退款手续费比例)
剩余曝光 = 购买曝光次数 - 已消耗曝光次数
```

### 3.3 实体类（Entity）

| 实体类 | 对应表 | 说明 |
|--------|--------|------|
| AdPricingTrafficTier | biz_ad_pricing_traffic_tier | 档位明细 |
| AdPricingTrafficLadder | biz_ad_pricing_traffic_ladder | 阶梯单价 |
| AdOrderItemTraffic | biz_ad_order_item_traffic | 订单明细 |

**路径**: [`src/main/java/com/mftb/admin/entity/`](../src/main/java/com/mftb/admin/entity/)

### 3.4 DTO（数据传输对象）

| DTO 类 | 说明 | 路径 |
|--------|------|------|
| AdPricingTrafficRequest | 定价配置新增/编辑请求 | [`dto/AdPricingTrafficRequest.java`](../src/main/java/com/mftb/admin/dto/AdPricingTrafficRequest.java) |
| AdPricingTrafficVO | 定价配置展示 VO（含档位 + 阶梯） | [`dto/AdPricingTrafficVO.java`](../src/main/java/com/mftb/admin/dto/AdPricingTrafficVO.java) |
| AdTrafficOrderRequest | 投流广告下单请求 | [`dto/AdTrafficOrderRequest.java`](../src/main/java/com/mftb/admin/dto/AdTrafficOrderRequest.java) |

---

## 四、数据库迁移脚本

### 执行顺序

请按照以下顺序执行 SQL 脚本：

1. **创建表结构**
   ```bash
   mysql -u username -p database_name < sql/70_traffic_pricing_tables.sql
   mysql -u username -p database_name < sql/72_traffic_order_item.sql
   ```

2. **初始化数据**
   ```bash
   mysql -u username -p database_name < sql/71_traffic_initial_data.sql
   ```

### SQL 文件清单

| 文件名 | 内容 | 说明 |
|--------|------|------|
| [70_traffic_pricing_tables.sql](file:///Users/yangjingjing/Desktop/SRAS/backend/sql/70_traffic_pricing_tables.sql) | 档位表 + 阶梯表定义 | 创建 biz_ad_pricing_traffic_tier 和 biz_ad_pricing_traffic_ladder |
| [71_traffic_initial_data.sql](file:///Users/yangjingjing/Desktop/SRAS/backend/sql/71_traffic_initial_data.sql) | 算法 + 定价 + 档位示例数据 | 初始化 TL00001-TL00004 算法及示例定价配置 |
| [72_traffic_order_item.sql](file:///Users/yangjingjing/Desktop/SRAS/backend/sql/72_traffic_order_item.sql) | 订单明细表 + 索引优化 | 创建 biz_ad_order_item_traffic 并添加性能索引 |

---

## 五、前端菜单对应关系

### 5.1 算法库菜单
- **前端菜单码**: `promotion-algorithm`
- **接口**: `GET /api/ad/algorithm?algoType=15`
- **功能**: 查询并管理投流广告算法（algo_type=15）

### 5.2 销售定价菜单
- **前端菜单码**: `ad-sales`
- **接口**: `GET/POST /api/ad/pricing/traffic`
- **功能**: 配置投流广告的定价方案、档位和阶梯单价

### 5.3 广告销售菜单
- **前端菜单码**: `ad-sales`
- **接口**: `POST /api/ad/sales/traffic/order`
- **功能**: 业务人员代商家下单或商家自助购买

### 5.4 店铺推广界面
- **前端菜单码**: `ad-sales` 或自定义
- **接口**: `GET /api/ad/orders?algoType=15&storeCode=xxx`
- **功能**: 门店查看可购买的投流广告和历史订单

---

## 六、业务规则说明

### 6.1 购买模式对比

| 特性 | 预设档位模式 | 自定义曝光数量模式 |
|------|------------|------------------|
| **适用场景** | 标准化产品 | 灵活定制需求 |
| **计价方式** | 档位标价（可打折） | 阶梯单价 |
| **起订量** | 档位定义的曝光次数 | 自定义起购量（默认 100 次） |
| **步长** | 固定档位 | 自定义步长（默认 100 次） |
| **优点** | 简单明了 | 灵活性强 |

### 6.2 折扣规则

**档位折扣**:
- 支持不限时间折扣（始终生效）
- 支持限定时间折扣（开始日期~结束日期）
- 折扣表示：8.5 表示 85 折

**阶梯优惠**:
- 买得越多单价越低
- 区间自动推导：第 N 档的上限 = 第 N+1 档的下限 - 1
- 最后一档上限为 0 表示无上限

### 6.3 赠送天数抵扣

- **折算价值**: 系统配置项 `payment_traffic_gift_day_value`，缺省 150 MOP/天
- **抵扣上限**: 不超过订单原价
- **使用条件**: 
  - 必须选择门店
  - 赠送天数不能超过可用余额
  - 不能超过购买天数（投流广告无天数维度，取订单ItemCount）
- **退款处理**: 赠送部分不退现、不返还

### 6.4 退款计算

```javascript
// 退款公式
const remainingImpressions = impressions - consumedImpressions;
const refundAmount = remainingImpressions × unitPrice × (1 - refundFeePercent/100);

// 示例
// 购买了 100000 次曝光，已消耗 60000 次，退款手续费 0%
// 退款金额 = (100000 - 60000) × 0.0110 × (1 - 0%) = 440.00 MOP
```

---

## 七、算法初始数据

### 7.1 预置算法列表

| 算法编码 | 算法名称 | 品牌 | 业务频道 |
|----------|---------|------|---------|
| TL00001 | 投流广告 - 美食外卖版 | flashBee | 1=美食外卖 |
| TL00002 | 投流广告 - 超市百货版 | flashBee | 2=超市百货 |
| TL00003 | 投流广告 - 团购到店版 | flashBee | 3=团购到店 |
| TL00004 | 投流广告 - mFood 美食版 | mFood | 1=美食外卖 |

### 7.2 示例定价配置

**TL00001（美食外卖版）定价**:
- **档位配置**:
  - 基础版：10,000 次曝光，150 MOP
  - 标准版：50,000 次曝光，600 MOP
  - 进阶版：100,000 次曝光，1,100 MOP

- **阶梯单价**:
  - 1,000-9,999 次：0.15 MOP/次
  - 10,000-49,999 次：0.12 MOP/次
  - 50,000-99,999 次：0.10 MOP/次
  - 100,000+ 次：0.08 MOP/次

---

## 八、开发进度总结

### ✅ 已完成功能

1. **数据库设计**
   - ✅ 档位明细表 (biz_ad_pricing_traffic_tier)
   - ✅ 阶梯单价表 (biz_ad_pricing_traffic_ladder)
   - ✅ 订单明细表 (biz_ad_order_item_traffic)
   - ✅ 索引优化与性能提升

2. **后端服务**
   - ✅ 定价配置管理服务 (AdPricingTrafficService/Controller)
   - ✅ 订单下单服务 (AdSalesTrafficService)
   - ✅ 算法库集成 (AdAlgorithmService 已支持 algo_type=15)
   - ✅ 订单查询退款 (AdOrderService 已支持 algo_type=15)

3. **代码文件**
   - ✅ 实体类 (Entity)
   - ✅ Mapper 接口
   - ✅ Service 服务实现
   - ✅ Controller 控制器
   - ✅ DTO 请求响应对象

4. **数据库脚本**
   - ✅ 表结构定义 SQL
   - ✅ 初始数据 SQL（4 个算法 + 示例定价）
   - ✅ 索引优化 SQL

### 📋 待前端配合事项

1. **菜单配置**
   - 在路由表中添加 `ad-sales` 菜单入口
   - 配置菜单权限码

2. **页面开发**
   - 算法库页面：增加筛选条件 `algoType=15`
   - 销售定价页面：开发档位表格 + 阶梯单价配置 UI
   - 广告购买页面：
     - 展示可购买的投流算法列表
     - 选择定价配置后加载档位/阶梯单价
     - 下单表单（支持档位选择/自定义输入）
   - 订单列表页面：增加 `algoType` 筛选条件
   - 订单详情页：展示流量包明细和消耗情况

3. **APP 端对接**
   - 回写已消耗曝光次数接口
   - 实时同步投放状态

---

## 九、测试建议

### 单元测试场景

1. **定价配置测试**
   - 创建定价配置（不同业务频道）
   - 添加/修改/删除档位
   - 添加/修改阶梯单价
   - 验证区间自动推导逻辑

2. **订单下单测试**
   - 档位模式下单
   - 自定义模式下单
   - 赠送天数抵扣
   - 推广金余额不足校验
   - 退款开关配置测试

3. **退款测试**
   - 未消耗退款
   - 部分消耗退款
   - 全额消耗不可退款
   - 退款手续费计算

### 集成测试建议

- 使用 Postman 或 JMeter 进行 API 压力测试
- 模拟高并发下单场景
- 测试分布式环境下的事务一致性

---

## 十、运维部署指南

### 数据库部署步骤

```bash
# 1. 备份现有数据
mysqldump -u root -p --database=mftb_admin > backup_$(date +%Y%m%d).sql

# 2. 执行表结构变更
mysql -u root -p mftb_admin < sql/70_traffic_pricing_tables.sql
mysql -u root -p mftb_admin < sql/72_traffic_order_item.sql

# 3. 初始化数据（可选）
mysql -u root -p mftb_admin < sql/71_traffic_initial_data.sql

# 4. 验证表创建成功
SHOW TABLES LIKE 'biz_ad_pricing_traffic_%';
SHOW TABLES LIKE 'biz_ad_order_item_traffic';

# 5. 验证初始数据
SELECT * FROM biz_ad_algorithm WHERE algo_type = 15;
SELECT * FROM biz_ad_pricing_traffic;
```

### Spring Boot 启动检查

- ✅ 确认所有新表已被 MyBatis-Plus 自动扫描
- ✅ 检查 Mapper 接口是否正确注册
- ✅ 观察应用日志无报错

### 版本控制

建议在 Git 中标记本次发布：
```bash
git tag -a v1.0.0-traffic-ad -m "投流广告功能模块上线"
git push origin v1.0.0-traffic-ad
```

---

## 十一、常见问题解答

### Q1: 为什么投流广告没有商圈/日期/餐段维度？
A: 投流广告采用**预付流量包**模式，购买的是曝光次数，而非特定时间段的展示位。因此不需要像无敌星星那样按「商圈×日期×餐段」售卖。

### Q2: 赠送天数如何应用到无天数维度的投流广告？
A: 赠送天数按固定价值折算（默认 150 MOP/天），直接抵扣订单金额，不使用完不退还。

### Q3: 退款时消耗的曝光次数从哪里来？
A: APP 端每次投放曝光后需调用接口回写 `consumed_impressions` 字段。

### Q4: 能否同时购买多个档位的流量包？
A: 可以。每个订单独立记录，后台累计曝光次数用于效果统计。

### Q5: 阶梯单价能否动态调整？
A: 可以。但会影响已有订单的退款金额计算，建议谨慎操作。

---

## 十二、技术债务与优化建议

### 当前实现的技术债务

1. **消耗回写性能**: 若 APP 高频回写消耗数据，建议增加消息队列异步处理
2. **订单分表**: 当订单量达到百万级时，考虑按 `order_time` 分表
3. **缓存策略**: 定价配置可加入 Redis 缓存，减少数据库查询

### 未来优化方向

1. **智能推荐**: 根据门店历史行为推荐合适的流量包档位
2. **A/B 测试**: 支持同一算法不同定价策略的 A/B 测试
3. **预算控制**: 为商家设置月度/周度预算上限
4. **ROI 分析**: 结合门店转化率计算广告 ROI

---

## 十三、联系方式

如有问题或建议，请联系项目负责人：

- **Backend Lead**: [你的名字]
- **Email**: your.email@example.com
- **Date**: 2026-09-03

---

**🎉 投流广告模块开发完成！**
