package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.entity.AiToolExecLog;
import com.mftb.admin.entity.AiToolPolicy;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiToolExecLogMapper;
import com.mftb.admin.mapper.AiToolPolicyMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AiToolPolicyService;
import com.mftb.admin.service.agent.AiToolVisibility;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 工具执行授权策略与执行审计的实现，契约见 {@link AiToolPolicyService}。除 save 外其余方法不开事务（含只读查询与单条日志写入）。
 * <p>
 * 事务边界：save 标注 @Transactional(rollbackFor = Exception.class)，其余方法不开事务。
 * <p>
 * 协作依赖：AiToolPolicyMapper, AiToolExecLogMapper。
 */

@Slf4j
@Service
@RequiredArgsConstructor
public class AiToolPolicyServiceImpl implements AiToolPolicyService {

    private final AiToolPolicyMapper policyMapper;
    private final AiToolExecLogMapper execLogMapper;
    private final OperatorResolver operatorResolver;
    private final SysUserMapper sysUserMapper;
    /** WP07：需要审批的工具必须以已审批且未消费的动作提案放行。 */
    private final com.mftb.admin.service.agent.platform.AiActionProposalService proposalService;

    @Override
    public List<AiToolPolicy> listAll() {
        return policyMapper.selectList(new LambdaQueryWrapper<AiToolPolicy>()
                .orderByAsc(AiToolPolicy::getToolKey));
    }

    @Override
    public AiToolPolicy find(String toolKey) {
        if (!StringUtils.hasText(toolKey)) return null;
        return policyMapper.selectOne(new LambdaQueryWrapper<AiToolPolicy>()
                .eq(AiToolPolicy::getToolKey, toolKey).last("LIMIT 1"));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AiToolPolicy save(AiToolPolicy policy, String operator) {
        if (!StringUtils.hasText(policy.getToolKey())) {
            throw new IllegalArgumentException("toolKey 不能为空");
        }
        AiToolPolicy existing = find(policy.getToolKey());
        policy.setUpdatedBy(StringUtils.hasText(operator) ? operator : operatorResolver.currentOperatorName());
        if (existing == null) {
            if (policy.getEnabled() == null) policy.setEnabled(0);
            if (policy.getRiskLevel() == null) policy.setRiskLevel("low");
            if (policy.getRequireApproval() == null) policy.setRequireApproval(0);
            policyMapper.insert(policy);
            return policy;
        }
        policy.setId(existing.getId());
        policyMapper.updateById(policy);
        return policy;
    }

    @Override
    public void logExecution(AiToolExecLog logEntry) {
        try {
            execLogMapper.insert(logEntry);
        } catch (Exception e) {
            log.error("AI 工具执行审计写入失败 toolKey={} decision={}: {}",
                    logEntry.getToolKey(), logEntry.getDecision(), e.getMessage());
        }
    }

    @Override
    public Map<String, Object> queryExecLogs(long page, long size, String toolKey, String caller) {
        LambdaQueryWrapper<AiToolExecLog> wrapper = new LambdaQueryWrapper<AiToolExecLog>()
                .orderByDesc(AiToolExecLog::getId);
        if (StringUtils.hasText(toolKey)) wrapper.eq(AiToolExecLog::getToolKey, toolKey);
        if (StringUtils.hasText(caller)) wrapper.eq(AiToolExecLog::getCaller, caller);
        Page<AiToolExecLog> result = execLogMapper.selectPage(new Page<>(page, size), wrapper);
        // 附人可读姓名：日志里的 caller 是登录账号，纯账号列审计时认不出是谁；
        // 不统一格式会因历史写入过姓名而“一列里混工号与姓名”（深度测试实测报出）
        return Map.of("records", withCallerName(result.getRecords()), "total", result.getTotal());
    }

    /** 把 caller（登录账号）解析成「姓名(工号)」；解析不到时退回原值，绝编造一个名字。 */
    private List<Map<String, Object>> withCallerName(List<AiToolExecLog> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        List<String> accounts = rows.stream().map(AiToolExecLog::getCaller)
                .filter(StringUtils::hasText).distinct().toList();
        Map<String, String> nameByAccount = new HashMap<>();
        if (!accounts.isEmpty()) {
            sysUserMapper.selectList(new LambdaQueryWrapper<SysUser>()
                            .select(SysUser::getUsername, SysUser::getName, SysUser::getEmpId)
                            .in(SysUser::getUsername, accounts))
                    .forEach(user -> nameByAccount.put(user.getUsername(),
                            StringUtils.hasText(user.getName())
                                    ? user.getName() + "（" + (StringUtils.hasText(user.getEmpId()) ? user.getEmpId() : user.getUsername()) + "）"
                                    : user.getUsername()));
        }
        List<Map<String, Object>> records = new ArrayList<>();
        for (AiToolExecLog row : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.getId());
            item.put("toolKey", row.getToolKey());
            item.put("caller", row.getCaller());
            item.put("callerName", nameByAccount.getOrDefault(row.getCaller(), row.getCaller()));
            item.put("conversationId", row.getConversationId());
            item.put("argsDigest", row.getArgsDigest());
            item.put("decision", row.getDecision());
            item.put("rejectReason", row.getRejectReason());
            item.put("elapsedMs", row.getElapsedMs());
            item.put("success", row.getSuccess());
            item.put("createdAt", row.getCreatedAt());
            records.add(item);
        }
        return records;
    }

    @Override
    public AiToolPolicy enforce(String toolKey, String approvalToken, String caller, String argsDigest) {
        return enforce(toolKey, approvalToken, caller, argsDigest, null);
    }

    @Override
    public AiToolPolicy enforce(String toolKey, String approvalToken, String caller, String argsDigest,
                                java.util.Map<String, Object> args) {
        AiToolPolicy policy = find(toolKey);
        if (policy == null) {
            recordReject(toolKey, caller, argsDigest, "policy_not_registered");
            throw new IllegalArgumentException("工具未授权：" + toolKey + "（默认拒绝）");
        }
        if (policy.getEnabled() == null || policy.getEnabled() != 1) {
            recordReject(toolKey, caller, argsDigest, "policy_disabled");
            throw new IllegalArgumentException("工具已停用：" + toolKey);
        }
        SysUser user = operatorResolver.currentUser();
        if (user == null || !StringUtils.hasText(caller) || !caller.equals(user.getUsername())) {
            recordReject(toolKey, caller, argsDigest, "caller_not_authenticated");
            throw new IllegalArgumentException("登录身份无效，不能执行工具");
        }
        if (!AiToolVisibility.visible(policy, user)) {
            recordReject(toolKey, caller, argsDigest, "tool_scope_denied");
            throw new IllegalArgumentException("当前账号无权使用该工具");
        }
        if (Integer.valueOf(1).equals(policy.getRequireApproval())) {
            // WP07：审批必须绑定到具体提案与冻结参数；字符串凭证不再具备授权效力。
            if (!StringUtils.hasText(approvalToken) || args == null) {
                recordReject(toolKey, caller, argsDigest, "approval_required");
                throw new IllegalArgumentException("該工具需要已綁定本次參數的審批提案，請先生成提案並完成審批");
            }
            try {
                proposalService.consume(approvalToken, caller, toolKey,
                        proposalService.sha256(proposalService.canonicalJson(args)));
            } catch (RuntimeException e) {
                recordReject(toolKey, caller, argsDigest, "approval_invalid");
                throw new IllegalArgumentException("審批提案無效或已過期：" + e.getMessage());
            }
        }
        return policy;
    }

    private void recordReject(String toolKey, String caller, String argsDigest, String reason) {
        AiToolExecLog logEntry = new AiToolExecLog();
        logEntry.setToolKey(toolKey);
        logEntry.setCaller(caller);
        logEntry.setArgsDigest(argsDigest);
        logEntry.setDecision("approval_invalid".equals(reason)
                ? "reject" : ("approval_required".equals(reason) ? "approval_required" : "reject"));
        logEntry.setRejectReason(reason);
        logEntry.setSuccess(0);
        logExecution(logEntry);
    }
}
