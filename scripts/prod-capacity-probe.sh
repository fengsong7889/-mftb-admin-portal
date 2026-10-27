#!/usr/bin/env bash
# 生产容量取证（只读，方案 P4）。不写集群、不重启、不改规格。
#
# 用法：
#   KUBECONFIG=/path/to/sealos-kubeconfig bash scripts/prod-capacity-probe.sh
#   NS=ns-xxxx DAYS=8 bash scripts/prod-capacity-probe.sh   # 手工指定命名空间
#
# 输出：命名空间 / Deployment 规格与副本 / HPA / Pod 重启与 OOM / 当前 CPU 与内存 /
#       最近一次启动耗时（创建 → Ready）/ 近期异常事件。
# 不含任何密钥；请把输出贴回会话即可。
set -uo pipefail

DAYS="${DAYS:-8}"
NS="${NS:-}"

command -v kubectl >/dev/null 2>&1 || { echo "❌ 缺少 kubectl，请先安装或改用 Sealos 控制台导图"; exit 2; }

if [ -z "$NS" ]; then
  NS=$(kubectl get deploy -A -o jsonpath='{range .items[*]}{.metadata.namespace}{"\t"}{.metadata.name}{"\n"}{end}' 2>/dev/null \
    | awk '$2 ~ /mftb-admin-backend/ {print $1; exit}')
fi
[ -n "$NS" ] || { echo "❌ 未找到 mftb-admin-backend 所在命名空间，请用 NS=xxx 指定"; exit 2; }

echo "== 命名空间: $NS"

echo
echo "== 1) Deployment 规格 / 副本 / 状态"
kubectl -n "$NS" get deploy -o json | python3 - <<'PY'
import json, sys
d = json.load(sys.stdin)
for it in d.get("items", []):
    m = it.get("metadata", {})
    s, t = it.get("spec", {}), it.get("status", {})
    print(f"- {m.get('name')}")
    print(f"    replicas: desired={s.get('replicas')} ready={t.get('readyReplicas')} "
          f"available={t.get('availableReplicas')} updated={t.get('updatedReplicas')}")
    for c in s.get("template", {}).get("spec", {}).get("containers", []):
        r = c.get("resources", {})
        print(f"    container={c.get('name')} requests={r.get('requests')} limits={r.get('limits')}")
PY

echo
echo "== 2) HPA"
kubectl -n "$NS" get hpa -o wide 2>/dev/null || echo "（无 HPA 或权限不足）"

echo
echo "== 3) Pod 重启 / OOM / 最近一次启动耗时（创建→Ready）"
kubectl -n "$NS" get pods -o json | python3 - <<'PY'
import json, sys
from datetime import datetime
d = json.load(sys.stdin)

def ts(s):
    if not s: return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))

for it in d.get("items", []):
    m = it.get("metadata", {})
    st = it.get("status", {})
    created = ts(m.get("creationTimestamp"))
    ready_at = None
    for cond in st.get("conditions", []):
        if cond.get("type") == "Ready" and cond.get("status") == "True":
            ready_at = ts(cond.get("lastTransitionTime"))
    startup = f"{(ready_at - created).total_seconds():.0f}s" if created and ready_at else "n/a"
    restarts = 0
    oom = []
    for cs in st.get("containerStatuses", []) or []:
        restarts += cs.get("restartCount", 0)
        last = (cs.get("lastState") or {}).get("terminated") or {}
        if last.get("reason") == "OOMKilled":
            oom.append(cs.get("name"))
    print(f"- {m.get('name')} phase={st.get('phase')} node={it.get('spec', {}).get('nodeName')} "
          f"restarts={restarts} oom={oom or '—'} startup={startup}")

# 统计
items = d.get("items", [])
total_restart = sum(cs.get("restartCount", 0) for it in items
                    for cs in (it.get("status", {}).get("containerStatuses") or []))
pods_oom = sum(1 for it in items
               for cs in (it.get("status", {}).get("containerStatuses") or [])
               if ((cs.get("lastState") or {}).get("terminated") or {}).get("reason") == "OOMKilled")
print(f"\n  小结：pods={len(items)} 累计重启={total_restart} OOMKilled 容器={pods_oom}")
PY

echo
echo "== 4) 当前 CPU / 内存（metrics-server 采样一次）"
kubectl -n "$NS" top pod --containers 2>/dev/null || echo "（metrics-server 不可用或权限不足）"

echo
echo "== 5) 近 ${DAYS} 天异常事件（OOMKilled / Evicted / Unhealthy / FailedMount / BackOff）"
kubectl -n "$NS" get events --sort-by=.lastTimestamp 2>/dev/null \
  | grep -Ei "oom|evicted|unhealthy|failedmount|backoff|failed" | tail -30 \
  || echo "（无匹配事件）"

echo
echo "== 6) 节点资源余量（若是共享节点，判断降配风险用）"
kubectl top node 2>/dev/null || echo "（无权限或 metrics-server 不可用）"

echo
echo "== 7) 只能从控制台/账单拿到的项（本脚本取不到）"
cat <<'TXT'
  a) 近 7 日 CPU / 内存曲线（工作集峰值、P95） → Sealos 监控面板截图
  b) 7 日内 HPA 扩容/缩容事件时间点          → HPA 事件列表截图
  c) 启动峰值内存（cold start）              → 监控面板 pod 启动窗口曲线
  d) 连接池使用率（HikariCP active/idle）     → 若 Actuator 未开放，用 DB 侧连接数
  e) 费用分项（CPU/内存/存储/流量/公网IP）     → Sealos 费用中心导出 CSV（≥7 天）
TXT
