# 部署信息

## 最近部署记录

### 2026-06-22 - 商户推广工具菜单UI样式统一与白板修复

**提交信息:**
- feat: 商户推广工具菜单UI样式统一与白板修复 (67e89ee)
- fix: 修复PageDescriptionEditor prdContent类型错误 (aa339d5)

**主要变更:**
1. 统一推荐管理下所有页面搜索区域和功能区域样式(与底纹配置一致)
2. 修复坑位配置页面Tag组件缺失导致的白板问题
3. 修复RevenueReport和SlotRule页面算法类型枚举值错误
4. 清理EffectReport未使用的SERVICE_STATUS_OPTIONS导入
5. 所有页面使用content-area、search-section、action-section、table-section统一类名
6. 扩展算法配置、订单列表、销售价格、效果报表数据至15条
7. 算法配置新增时段字段支持多时段算法配置
8. 订单列表新增所属品牌字段和日期范围筛选

**访问地址:**
- GitHub Pages: https://fengsong7889.github.io/-mftb-admin-portal
- 仓库地址: https://github.com/fengsong7889/-mftb-admin-portal

**部署方式:**
- 使用 `npm run deploy` 命令部署到 gh-pages 分支
- 构建产物: dist/ 目录

**部署状态:** ✅ 成功 Published
