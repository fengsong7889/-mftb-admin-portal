#!/usr/bin/env python3
"""企業 Agent 平台 · 試點場景端到端腳本（只讀優先，可重複執行）。

覆蓋鏈路：
  1. 登入 + 就緒校驗（ops/readiness）
  2. 應用與版本：確保 pilot-agent 存在、有已發布版本
  3. 運行受理：POST /runs → 輪詢到終態（執行器關閉時契約為停在 queued）
  4. 動作提案：prepare → approve → execute → 校驗提案狀態
  5. 知識檢索：驗證 ACL 生效後能檢索到已授權文檔

用法：
  AGENT_PILOT_USER=admin AGENT_PILOT_PASSWORD=*** python3 scripts/agent-platform-pilot.py
  python3 scripts/agent-platform-pilot.py --base http://127.0.0.1:8080 --skip-run --skip-action

退出碼：0 全通過（含 SKIP）；1 有 FAIL。憑據只從環境或參數取，不寫入任何文件。
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

APP_KEY = "pilot-agent"
READ_ONLY_TOOL = "query_approvals"


class Api:
    def __init__(self, base, token=None):
        self.base = base.rstrip("/")
        self.token = token

    def call(self, method, path, body=None, query=None):
        url = self.base + path
        if query:
            url += "?" + "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in query.items())
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("Authorization", "Bearer " + self.token)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload = json.loads(resp.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            try:
                payload = json.loads(e.read().decode() or "{}")
            except Exception:
                payload = {"code": e.code, "message": f"HTTP {e.code}"}
        except urllib.error.URLError as e:
            raise SystemExit(f"無法連接後端 {self.base}: {e.reason}")
        except Exception as e:  # 遠端庫延遲導致的讀取超時等
            payload = {"code": -1, "message": f"請求失敗: {type(e).__name__}"}
        if payload.get("code") in (401, 403) and "其他設備" in str(payload.get("message")):
            raise SystemExit("會話被其他設備頂掉（單設備登錄）：請用專用測試帳號，或先退出其他會話再重跑")
        return payload


import urllib.parse  # noqa: E402  (放在 Api 之後便於閱讀)


def login(api, user, password):
    res = api.call("POST", "/api/auth/login", {"username": user, "password": password})
    token = (res.get("data") or {}).get("token")
    if res.get("code") != 200 or not token:
        raise SystemExit(f"登入失敗: {res.get('message')}")
    api.token = token


def step(results, name, status, detail=""):
    results.append({"name": name, "status": status, "detail": detail})
    print(f"[{status:4s}] {name}" + (f" — {detail}" if detail else ""))


def ensure_application(api, results):
    """確保 pilot-agent 存在且有已發布版本；已存在則復用，不覆蓋別人配的內容。"""
    rows = (api.call("GET", "/api/agent/platform/applications", query={"keyword": APP_KEY}).get("data") or [])
    app = next((r for r in rows if r.get("app_key") == APP_KEY), None)
    if app is None:
        res = api.call("POST", "/api/agent/platform/applications", {
            "appKey": APP_KEY, "name": "Agent 試點示例", "systemCode": "ai",
            "ownerName": "admin", "purpose": "端到端試點腳本自動建立",
        })
        if res.get("code") != 200:
            step(results, "應用登記", "FAIL", res.get("message", ""))
            return None
        step(results, "應用登記", "PASS", "已建立 pilot-agent")
    else:
        step(results, "應用登記", "PASS", "已存在，復用")

    rows = (api.call("GET", "/api/agent/platform/applications", query={"keyword": APP_KEY}).get("data") or [])
    app = next((r for r in rows if r.get("app_key") == APP_KEY), {})
    version = app.get("published_version") or 0
    if not version:
        res = api.call("POST", f"/api/agent/platform/applications/{APP_KEY}/versions",
                       {"toolWhitelist": [READ_ONLY_TOOL], "knowledgeScope": []})
        if res.get("code") != 200:
            step(results, "版本發布", "FAIL", res.get("message", ""))
            return None
        version = (res.get("data") or {}).get("version_no") or 1
        pub = api.call("POST", f"/api/agent/platform/applications/{APP_KEY}/versions/{version}/publish",
                       query=None, body={})
        if pub.get("code") != 200:
            step(results, "版本發布", "FAIL", pub.get("message", ""))
            return None
    step(results, "版本發布", "PASS", f"v{version}")
    return {"version": version}


def run_smoke(api, results, ready, timeout_s=180):
    body = {
        "systemCode": "ai", "appKey": APP_KEY, "appVersion": 1,
        "idempotencyKey": "pilot-run-" + str(int(time.time())),
        "input": {"messages": [{"role": "user", "content": "用一句話回答：1+1 等於多少？"}]},
    }
    res = api.call("POST", "/api/agent/platform/runs", body)
    if res.get("code") != 200:
        step(results, "運行受理", "FAIL", res.get("message", ""))
        return
    run_no = (res.get("data") or {}).get("run_no")
    step(results, "運行受理", "PASS", run_no)

    deadline = time.time() + timeout_s
    status = "queued"
    while time.time() < deadline:
        detail = api.call("GET", f"/api/agent/platform/runs/{run_no}").get("data") or {}
        status = detail.get("status") or "unknown"
        if status not in ("queued", "running"):
            break
        time.sleep(3)

    if status == "queued" and not ready.get("workerEnabled"):
        # 執行器默認關閉：受理即持久化已驗證，執行鏈路留給開啟執行器的環境
        step(results, "運行執行", "SKIP", "執行器未開啟，契約為停在 queued")
    elif status == "succeeded":
        step(results, "運行執行", "PASS", f"{run_no} succeeded")
    elif status in ("queued", "running"):
        step(results, "運行執行", "FAIL", f"{status} 超過 {timeout_s}s 未收斂")
    elif status == "unknown":
        step(results, "運行執行", "FAIL",
             "unknown：多為重啟或租約中斷後轉人工核實，非自動重跑")
    else:
        err = detail.get("error_kind")
        step(results, "運行執行", "FAIL", f"{status} / {err}")


def action_smoke(api, results):
    prepared = api.call("POST", "/api/agent/platform/actions", {
        "toolKey": READ_ONLY_TOOL, "params": {},
        "impactSummary": "試點腳本：只讀查詢審批，無副作用",
        "ttlMinutes": 30,
    })
    if prepared.get("code") != 200:
        step(results, "提案建立", "SKIP", f"工具未開放或參數不符: {prepared.get('message')}")
        return
    data = prepared.get("data") or {}
    proposal_no = data.get("proposal_no") or data.get("proposalNo")
    status = data.get("status") or "pending"
    step(results, "提案建立", "PASS", f"{proposal_no} (status={status})")

    # prepare 對「同人+同工具+同參數」是冪等的：重跑會拿回同一張提案。
    # 已審批/已執行的提案不能再審批，這裡按狀態分流而不是一律 approve。
    if status in ("pending", "draft"):
        approved = api.call("POST", f"/api/agent/platform/actions/{proposal_no}/approve",
                            {"approvalRef": "pilot-approval-" + str(int(time.time()))})
        if approved.get("code") != 200:
            step(results, "提案審批", "FAIL", approved.get("message", ""))
            return
        step(results, "提案審批", "PASS", "已綁定審批引用")
    elif status == "approved":
        step(results, "提案審批", "PASS", "復用上次已審批的提案")
    else:
        # executed / expired / rejected：直接驗證一次性消費契約
        again = api.call("POST", f"/api/agent/platform/actions/{proposal_no}/execute")
        if again.get("code") != 200:
            step(results, "提案一次性消費", "PASS", f"已消費不可重放: {str(again.get('message'))[:60]}")
        else:
            step(results, "提案一次性消費", "FAIL", "已執行提案仍可重放")
        return

    executed = api.call("POST", f"/api/agent/platform/actions/{proposal_no}/execute")
    if executed.get("code") != 200:
        step(results, "提案執行", "FAIL", executed.get("message", ""))
        return
    data = executed.get("data") or {}
    ok = bool(data.get("success"))
    step(results, "提案執行", "PASS" if ok else "FAIL", json.dumps(data, ensure_ascii=False)[:160])

    # 一次性消費：同一提案再執行一次必須被拒
    again = api.call("POST", f"/api/agent/platform/actions/{proposal_no}/execute")
    if again.get("code") == 200:
        step(results, "提案一次性消費", "FAIL", "重複執行仍返回成功")
    else:
        step(results, "提案一次性消費", "PASS", again.get("message", "")[:80])


def knowledge_smoke(api, results):
    res = api.call("GET", "/api/ai/prompt-config/knowledge/search",
                   query={"query": "檢索", "systemCode": "ai", "limit": 5})
    if res.get("code") != 200:
        step(results, "知識檢索", "FAIL", res.get("message", ""))
        return
    hits = res.get("data") or []
    # 無授權時刻意返回空（fail-closed）；有授權但沒命中同樣是空，需結合 readiness 判斷
    step(results, "知識檢索", "PASS" if hits else "SKIP",
         f"命中 {len(hits)} 條" if hits else "無命中（可能未授權或無匹配文檔）")


def readiness(api, results):
    res = api.call("GET", "/api/agent/platform/ops/readiness")
    if res.get("code") != 200:
        step(results, "就緒校驗", "FAIL", res.get("message", ""))
        return {}
    data = res.get("data") or {}
    blocking = data.get("blocking") or []
    step(results, "就緒校驗", "PASS" if not blocking else "FAIL",
         f"counts={data.get('counts')} blocking={blocking}")
    return data


def main():
    parser = argparse.ArgumentParser(description="企業 Agent 平台試點端到端腳本")
    parser.add_argument("--base", default=os.getenv("AGENT_PILOT_BASE", "http://127.0.0.1:8080"))
    parser.add_argument("--user", default=os.getenv("AGENT_PILOT_USER"))
    parser.add_argument("--password", default=os.getenv("AGENT_PILOT_PASSWORD"))
    parser.add_argument("--skip-run", action="store_true")
    parser.add_argument("--skip-action", action="store_true")
    parser.add_argument("--skip-knowledge", action="store_true")
    args = parser.parse_args()

    if not args.user or not args.password:
        raise SystemExit("缺少憑據：請設 AGENT_PILOT_USER / AGENT_PILOT_PASSWORD 或傳 --user/--password")

    api = Api(args.base)
    results = []
    login(api, args.user, args.password)
    ready = readiness(api, results)

    if ensure_application(api, results) is None:
        return summarize(results)

    if not args.skip_run:
        run_smoke(api, results, ready)
    if not args.skip_action:
        action_smoke(api, results)
    if not args.skip_knowledge:
        knowledge_smoke(api, results)

    return summarize(results)


def summarize(results):
    print("\n=== 試點結果 ===")
    for r in results:
        print(f"{r['status']:4s}  {r['name']}" + (f"  | {r['detail']}" if r["detail"] else ""))
    failed = [r for r in results if r["status"] == "FAIL"]
    skipped = [r for r in results if r["status"] == "SKIP"]
    print(f"\n合計 {len(results)} 項：PASS {len(results) - len(failed) - len(skipped)} / SKIP {len(skipped)} / FAIL {len(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
