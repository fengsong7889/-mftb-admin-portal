---
description: 后端服务重启策略规则。当需要启动、重启、停止后端服务时，必须遵循此规则选择正确的重启方式。
globs:
  - "backend/**/*.java"
  - "backend/**/*.yml"
  - "backend/**/*.yaml"
  - "backend/**/*.properties"
  - "backend/pom.xml"
alwaysApply: false
---

# 后端服务重启规则

## 核心原则

**禁止默认使用 `bash run-local.sh` 重启后端**（每次全量编译耗时 2~3 分钟）。应使用增量重启脚本 `backend/restart-service.sh` 按需选择方式。

## 强制命令选择

| 场景 | 必须使用的命令 |
|------|--------------|
| 修改了 Java 源码后重启 | `bash restart-service.sh --rebuild` |
| 修改了 `pom.xml` 后重启 | `bash restart-service.sh --rebuild` |
| 修改了 `application.yml` 后重启 | `bash restart-service.sh --rebuild` |
| 未修改代码，仅重启服务 | `bash restart-service.sh --fast` |
| 不确定变更类型 | `bash restart-service.sh`（自动检测） |
| 查看后端运行状态 | `bash restart-service.sh --status` |
| 停止后端服务 | `bash restart-service.sh --stop` |

## 禁止行为

- 禁止在 AI Agent 重启后端时默认执行 `bash run-local.sh`（除非用户明确要求全量启动）
- 禁止在重启前手动执行 `lsof -ti:8080 | xargs kill -9`（脚本会自动处理端口释放）
- 禁止在重启后不验证服务状态（必须确认 HTTP 200 或脚本输出成功提示）

## 启动后验证

启动完成后必须验证：

```bash
# 方式 1：使用脚本自带状态检查
bash restart-service.sh --status

# 方式 2：直接 HTTP 检查
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/

# 方式 3：查看日志末尾确认启动成功
tail -20 backend/backend-service.log
```

## 启动失败处理

1. 脚本会自动输出日志末尾 20 行，优先据此排查
2. 编译失败：改用 `bash restart-service.sh --full` 看完整 Maven 输出
3. 端口占用：脚本会自动 kill，若仍失败则手动 `lsof -ti:8080 | xargs kill -9` 后重试
4. 数据库连接失败：确认 `backend/.env.local` 存在且内容正确（凭据不得写入脚本/仓库），再检查 `DB_URL` 与网络连通性
5. 提示「缺少必需环境变量」：脚本不再内置凭据默认值，`cp backend/.env.local.example backend/.env.local` 后填写
   `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` / `JWT_SECRET`（HS256 要求 ≥ 32 字节）

## 参考文档

- 详细指南：`backend/SERVICE-RESTART-GUIDE.md`
- 快速参考：`AGENTS.md` -> 后端重启策略章节
- 脚本源码：`backend/restart-service.sh`
