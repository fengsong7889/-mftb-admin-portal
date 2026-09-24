package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.entity.AiToolExecLog;
import com.mftb.admin.entity.AiToolPolicy;
import com.mftb.admin.mapper.AiToolExecLogMapper;
import com.mftb.admin.mapper.AiToolPolicyMapper;
import com.mftb.admin.service.AiToolPolicyService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiToolPolicyServiceImpl implements AiToolPolicyService {

    private final AiToolPolicyMapper policyMapper;
    private final AiToolExecLogMapper execLogMapper;
    private final OperatorResolver operatorResolver;

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
        return Map.of("records", result.getRecords(), "total", result.getTotal());
    }

    @Override
    public AiToolPolicy enforce(String toolKey, String approvalToken, String caller, String argsDigest) {
        AiToolPolicy policy = find(toolKey);
        if (policy == null) {
            recordReject(toolKey, caller, argsDigest, "policy_not_registered");
            throw new IllegalArgumentException("工具未授权：" + toolKey + "（默认拒绝）");
        }
        if (policy.getEnabled() == null || policy.getEnabled() != 1) {
            recordReject(toolKey, caller, argsDigest, "policy_disabled");
            throw new IllegalArgumentException("工具已停用：" + toolKey);
        }
        if (policy.getRequireApproval() != null && policy.getRequireApproval() == 1
                && !StringUtils.hasText(approvalToken)) {
            recordReject(toolKey, caller, argsDigest, "approval_required");
            throw new IllegalArgumentException("工具需审批凭证：" + toolKey);
        }
        return policy;
    }

    private void recordReject(String toolKey, String caller, String argsDigest, String reason) {
        AiToolExecLog logEntry = new AiToolExecLog();
        logEntry.setToolKey(toolKey);
        logEntry.setCaller(caller);
        logEntry.setArgsDigest(argsDigest);
        logEntry.setDecision("approval_required".equals(reason) ? "approval_required" : "reject");
        logEntry.setRejectReason(reason);
        logEntry.setSuccess(0);
        logExecution(logEntry);
    }
}
