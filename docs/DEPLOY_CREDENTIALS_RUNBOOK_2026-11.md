# 部署凭据待办 Runbook（2026-11）

> 适用场景：后端改动已合并 `main`，CI 全绿，但**生产后端没有变化**。
> 本文只写「如何判定」与「如何做」；凭据本体一律不入库、不落日志、不进 issue。

## 1. 现象与根因

`.github/workflows/backend-docker.yml` 的 `deploy` job 用仓库 Secret 做**步骤级门控**：

```yaml
HAS_SEALOS: ${{ secrets.SEALOS_KUBECONFIG != '' && 'true' || 'false' }}
```

`SEALOS_KUBECONFIG` 未配置时，`Set up kubectl` / `Configure kubeconfig` /
`Rollout restart deployment` / `Post-deploy verification` 全部 `skipped`，
但 **job 与整个 run 仍判定 `success`**。前端 `deploy.yml` 的 Pages 发布使用内置
`GITHUB_TOKEN`，不需要仓库 Secret，因此会出现「前端已上线、后端从未上线」的错位。

## 2. 判定口径（重要，别再只看绿灯）

区分两种「没执行」，含义完全不同：

| 情形 | 触发条件 | 结论 |
|---|---|---|
| job 级 `skipping` | PR 事件（job 带 `if: github.event_name == 'push'`） | 预期行为，PR 复核阶段本就不该部署 |
| **步骤级 `skipped`** | push 事件但 Secret 缺失 | **部署没发生**，job 的 `success` 是空壳 |

核实命令（必须取到 step 粒度）：

```bash
RUN=<run-id>
gh run view $RUN --json jobs | python3 -c "
import sys,json
for j in json.load(sys.stdin)['jobs']:
    print(j['name'],'=>',j.get('conclusion'),'| id',j['databaseId'])"
# 再取 deploy job 的每个步骤
gh api repos/<owner>/<repo>/actions/jobs/<deploy-job-id> | python3 -c "
import sys,json
for s in json.load(sys.stdin).get('steps',[]): print(' ',s['name'],'=>',s['conclusion'])"
```

Secrets 是否配置的自查（只返回名称与数量，不含值）：

```bash
gh api repos/<owner>/<repo>/actions/secrets --jq '.total_count'
```

## 3. 待办清单（按顺序执行）

1. **在 Sealos 生成 kubeconfig**，遵循最小权限：只授予目标 namespace 下
   `mftb-admin-backend` Deployment 的读写，**不要用 cluster-admin**。
2. 仓库 `Settings → Secrets and variables → Actions` 新增 Secret，名称必须精确为
   `SEALOS_KUBECONFIG`。
3. 可选（不配则对应步骤仍跳过或用默认值）：
   - `SEALOS_DEPLOYMENT`（默认 `mftb-admin-backend`）
   - `SEALOS_NAMESPACE`（默认 `mftb-admin`）
   - `VERIFY_BASE_URL` / `VERIFY_USER` / `VERIFY_PASS`：供 `scripts/verify-deploy.sh`
     做部署后验收；验收账号请用最小权限专用账号，不要用管理员。
4. **配置后必须再有一次 push 到 `main` 才会部署**：`deploy` job 同样带
   `if: github.event_name == 'push'`，因此 `workflow_dispatch` 手动触发**不会**部署。
   触发方式：正常提交并推送 `main`，或推一个说明性 docs 提交。
5. 部署后核对（任一不达标即视为未部署，不要凭 CI 绿灯放行）：
   - `/api/health/ready` 返回 200（迁移与结构契约校验通过才 200）
   - `Rollout restart deployment` 与 `Post-deploy verification` 两步为 `success`（不是 skipped）
   - 业务侧真值抽查：如菜单改名看 `sys_menu` 目标行与 `sys_schema_version` 记账行；
     新增列看 `INFORMATION_SCHEMA.COLUMNS`

## 4. 手工止血（不等 CI 的应急路径）

镜像已由 `build-and-push` 推到 GHCR，tag 就是该次 push 的**完整提交 SHA**
（`IMAGE: ghcr.io/${owner}/mftb-admin-backend`，见工作流第 27 与 146 行）：

```bash
git rev-parse main   # 得到 40 位 SHA，即镜像 tag
```

在 Sealos 控制台把 Deployment 的镜像改为
`ghcr.io/<owner>/mftb-admin-backend:<完整 SHA>`。

代价：跳过 `scripts/verify-deploy.sh` 的业务接口验收，需自行确认就绪探针。
注意：新实例启动会执行未跑过的一次性迁移与契约自愈补列，`SCHEMA_STRICT=true` 下
残余漂移会中止启动，`maxUnavailable: 0` 保证未就绪实例不接流量、旧版本保留。

## 5. 回滚

- 代码：`git revert` 合并提交后推 `main`。
- 后端：`kubectl rollout undo deployment/<name> -n <namespace>` 回上一个不可变 SHA tag。
- **库侧不会自动还原**：`sys_schema_version` 一旦记账即不再重放。**禁止删除生产记账行**；
  要修正只能手工修数据，或新增更高版本的 versionKey 重跑。

## 6. 相关约束（只写要求，不登记实况）

- 本仓库为公开仓：**不在入库文件里逐项登记「哪条凭据尚未作废 / 哪个控制当前缺失」**，
  实况台账留在仓库外（见 `AGENTS.md`「参考文档索引 · 环境与运维」与
  `docs/OFFLINE_DELIVERY_CHECKLIST_2026-10.md` 第七节）。
- 任何受版本控制的文件、日志、提交信息、issue 均禁止出现明文凭据、kubeconfig 内容、
  内网地址（由 `npm run secret-scan` 拦截）。
- AI 供应商 API Key 的独立加密密钥与 `JWT_SECRET` 轮换存在**硬性先后顺序**：
  先配置独立密钥 → 再重填存量 API Key → 才允许轮换 JWT；顺序颠倒会使密文不可逆失效。
  环境变量矩阵见 `ENVIRONMENT-REFERENCE.md`，处置进度见仓库外运维台账。

---

Copyright (c) 2026 fengsong7889. All Rights Reserved.
本文档属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
