package com.mftb.admin.service;

import com.mftb.admin.entity.AiToolExecLog;
import com.mftb.admin.entity.AiToolPolicy;

import java.util.List;
import java.util.Map;

/**
 * AI 工具执行授权与审计（V0 §B.2）。
 * <p>广场管「安装」（mcp_tool.installed），本服务管「放行」（enabled/风险/审批/数据范围）；
 * 未登记的 toolKey 视为默认拒绝，避免「装了就等于有权限」。
 */
public interface AiToolPolicyService {
    List<AiToolPolicy> listAll();
    AiToolPolicy find(String toolKey);
    AiToolPolicy save(AiToolPolicy policy, String operator);
    void logExecution(AiToolExecLog logEntry);
    Map<String, Object> queryExecLogs(long page, long size, String toolKey, String caller);
    /**
     * 网关执行前调用：允许则返回放行副本；拒绝抛 IllegalArgumentException。
     * require_approval=1 时必须传入非空 approvalToken。
     */
    AiToolPolicy enforce(String toolKey, String approvalToken, String caller, String argsDigest);
}
