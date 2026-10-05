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

    /** 全部策略（含停用的），按 toolKey 升序 */
    List<AiToolPolicy> listAll();

    /** 按 toolKey 取单条策略；toolKey 为空或未登记时返回 null（不抛异常） */
    AiToolPolicy find(String toolKey);

    /**
     * 按 toolKey upsert：存在则更新，不存在则插入。
     * <p>
     * 新建时未传的字段退为 enabled=0、riskLevel=low、requireApproval=0，
     * 即<b>新增策略默认不放行</b>，必须显式启用。toolKey 为空直接抛 IllegalArgumentException。
     */
    AiToolPolicy save(AiToolPolicy policy, String operator);

    /**
     * 写执行审计日志。失败时只记 error 日志不抛出，以免审计写入拖主链路；
     * 调用方不能把它当成“已留痕”的强保证。
     */
    void logExecution(AiToolExecLog logEntry);

    /** 分页查询执行审计日志（返回 Map 含 records 与 total） */
    Map<String, Object> queryExecLogs(long page, long size, String toolKey, String caller);
    /**
     * 网关执行前调用：允许则返回放行副本；拒绝抛 IllegalArgumentException。
     * require_approval=1 时必须传入非空 approvalToken。
     */
    AiToolPolicy enforce(String toolKey, String approvalToken, String caller, String argsDigest);
}
