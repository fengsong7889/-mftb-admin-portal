# 投流广告模块 - SQL 执行清单

## 📋 数据库迁移脚本顺序

请按照以下顺序执行 SQL 文件：

### 1️⃣ 第一步：创建表结构

```bash
# 创建档位表和阶梯单价表
mysql -u your_username -p your_database < sql/70_traffic_pricing_tables.sql

# 创建订单明细表和索引优化
mysql -u your_username -p your_database < sql/72_traffic_order_item.sql
```

**创建的表**:
- `biz_ad_pricing_traffic_tier` - 投流广告档位明细表
- `biz_ad_pricing_traffic_ladder` - 投流广告阶梯单价表  
- `biz_ad_order_item_traffic` - 投流广告订单明细表（如果不存在）

---

### 2️⃣ 第二步：初始化数据（可选）

```bash
# 初始化算法、定价配置和示例数据
mysql -u your_username -p your_database < sql/71_traffic_initial_data.sql
```

**初始化的数据**:
- **4 个投流广告算法**: TL00001 ~ TL00004
- **3 个定价配置**: TL00001 的美食外卖版、TL00002 的超市百货版、TL00003 的团购到店版
- **档位数据**: 基础版/标准版/进阶版（仅针对 TL00001）
- **阶梯单价**: 4 个价格区间（仅针对 TL00001）

---

## ✅ 验证步骤

执行以下 SQL 验证表和数据是否正确创建：

```sql
-- 1. 检查新表是否存在
SHOW TABLES LIKE 'biz_ad_pricing_traffic_%';
SHOW TABLES LIKE 'biz_ad_order_item_traffic';

-- 2. 检查算法是否初始化成功
SELECT algo_code, algo_name, algo_type, brand, status 
FROM biz_ad_algorithm 
WHERE algo_type = 15;

-- 3. 检查定价配置
SELECT p.id, p.pricing_no, a.algo_name, p.biz_channel, p.status
FROM biz_ad_pricing_traffic p
JOIN biz_ad_algorithm a ON p.algo_id = a.id
WHERE a.algo_type = 15;

-- 4. 检查档位数据
SELECT pricing_id, tier_name, impressions, price, on_sale
FROM biz_ad_pricing_traffic_tier
ORDER BY pricing_id, sort;

-- 5. 检查阶梯单价
SELECT pricing_id, min_qty, max_qty, unit_price
FROM biz_ad_pricing_traffic_ladder
ORDER BY pricing_id, sort;
```

**预期输出**:
- 应该看到 4 条算法记录（algo_type = 15）
- 应该看到至少 1 条定价配置
- 应该看到 3 个档位记录（基础版/标准版/进阶版）
- 应该看到 4 个阶梯单价区间

---

## 🔄 回滚方案

如果需要回滚，执行以下操作：

```sql
-- 1. 删除示例数据（如果有）
DELETE FROM biz_ad_pricing_traffic_ladder WHERE pricing_id IN (SELECT id FROM biz_ad_pricing_traffic WHERE algo_id IN (SELECT id FROM biz_ad_algorithm WHERE algo_code LIKE 'TL%'));
DELETE FROM biz_ad_pricing_traffic_tier WHERE pricing_id IN (SELECT id FROM biz_ad_pricing_traffic WHERE algo_id IN (SELECT id FROM biz_ad_algorithm WHERE algo_code LIKE 'TL%'));
DELETE FROM biz_ad_pricing_traffic WHERE algo_id IN (SELECT id FROM biz_ad_algorithm WHERE algo_code LIKE 'TL%');
DELETE FROM biz_ad_algorithm WHERE algo_code LIKE 'TL%';

-- 2. 删除表
DROP TABLE IF EXISTS biz_ad_order_item_traffic;
DROP TABLE IF EXISTS biz_ad_pricing_traffic_ladder;
DROP TABLE IF EXISTS biz_ad_pricing_traffic_tier;
```

---

## 📌 注意事项

1. **备份**: 执行前务必备份数据库
2. **权限**: 确保数据库用户有 CREATE 和 INSERT 权限
3. **字符集**: 确保数据库使用 utf8mb4 字符集
4. **外键约束**: 初始化数据依赖已存在的算法 ID，请先创建算法再插入定价数据
5. **幂等性**: 所有 SQL 都使用了 `INSERT ... WHERE NOT EXISTS` 或 `CREATE TABLE IF NOT EXISTS`，可以安全重复执行

---

## 🚀 后续步骤

完成数据库迁移后：

1. ✅ 重启 Spring Boot 应用
2. ✅ 检查日志是否有表不存在的错误
3. ✅ 测试 API 接口是否正常
4. ⚠️ 通知前端团队数据库已就绪，可以开始页面开发

---

**更新时间**: 2026-09-03
