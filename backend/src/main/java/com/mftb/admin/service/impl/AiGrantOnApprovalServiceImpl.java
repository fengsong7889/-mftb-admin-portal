package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.entity.AiEmployeeAuth;
import com.mftb.admin.entity.AiGrantLog;
import com.mftb.admin.entity.AiQuotaOverride;
import com.mftb.admin.entity.OaRequest;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiEmployeeAuthMapper;
import com.mftb.admin.mapper.AiGrantLogMapper;
import com.mftb.admin.mapper.AiQuotaOverrideMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AiGrantOnApprovalService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiGrantOnApprovalServiceImpl implements AiGrantOnApprovalService {

    private final SysUserMapper sysUserMapper;
    private final AiEmployeeAuthMapper employeeAuthMapper;
    private final AiQuotaOverrideMapper quotaOverrideMapper;
    private final AiGrantLogMapper grantLogMapper;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class, propagation = Propagation.REQUIRED)
    public void grant(OaRequest request, String approverUsername) {
        if (request == null || !StringUtils.hasText(request.getFlowNo())) {
            throw new IllegalArgumentException("审批请求不能为空");
        }
        // 幂等：同 flow_no 已 GRANTED 则跳过（防重放）
        AiGrantLog existing = grantLogMapper.selectOne(new LambdaQueryWrapper<AiGrantLog>()
                .eq(AiGrantLog::getFlowNo, request.getFlowNo())
                .eq(AiGrantLog::getStatus, "GRANTED")
                .last("LIMIT 1"));
        if (existing != null) {
            log.info("AI 发放已执行过，跳过：flowNo={}", request.getFlowNo());
            return;
        }
        try {
            SysUser applicant = resolveApplicant(request);
            if (applicant == null) {
                throw new IllegalStateException("无法解析申请人");
            }
            JsonNode form = parseFormData(request.getFormData());
            List<Long> modelIds = collectModelIds(form);
            grantModels(applicant, modelIds, request.getFlowNo());
            maybeGrantQuota(applicant, form, request.getId(), approverUsername);
            recordGrant(request, applicant, "GRANTED", modelIds, null, approverUsername);
            log.info("AI 使用申请审批已发放：flowNo={} user={} models={}",
                    request.getFlowNo(), applicant.getUsername(), modelIds.size());
        } catch (RuntimeException e) {
            // 失败必须落审计再向外传播（不吞异常）
            recordGrant(request, null, "FAILED", List.of(), e.getMessage(), approverUsername);
            throw e;
        }
    }

    private SysUser resolveApplicant(OaRequest request) {
        // 无 applicantEmpId 字段；根据 applicant 优先匹配 username，回退匹配 name
        if (StringUtils.hasText(request.getApplicant())) {
            SysUser u = sysUserMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                    .eq(SysUser::getUsername, request.getApplicant()).last("LIMIT 1"));
            if (u != null) return u;
            return sysUserMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                    .eq(SysUser::getName, request.getApplicant()).last("LIMIT 1"));
        }
        return null;
    }

    private JsonNode parseFormData(String raw) {
        if (!StringUtils.hasText(raw)) return objectMapper.createObjectNode();
        try {
            return objectMapper.readTree(raw);
        } catch (Exception e) {
            log.warn("AI 申请 formData 解析失败，视为空对象: {}", e.getMessage());
            return objectMapper.createObjectNode();
        }
    }

    private List<Long> collectModelIds(JsonNode form) {
        List<Long> ids = new ArrayList<>();
        JsonNode arr = form.get("requestedModels");
        if (arr == null || !arr.isArray()) return ids;
        for (JsonNode node : arr) {
            JsonNode idNode = node.get("modelId") != null ? node.get("modelId") : node.get("id");
            if (idNode != null && idNode.canConvertToLong()) {
                ids.add(idNode.asLong());
            } else if (node.canConvertToLong()) {
                ids.add(node.asLong());
            }
        }
        return ids;
    }

    private void grantModels(SysUser user, List<Long> modelIds, String flowNo) {
        for (Long modelId : modelIds) {
            AiEmployeeAuth existing = employeeAuthMapper.selectOne(new LambdaQueryWrapper<AiEmployeeAuth>()
                    .eq(AiEmployeeAuth::getEmployeeId, user.getId())
                    .eq(AiEmployeeAuth::getModelId, modelId)
                    .last("LIMIT 1"));
            if (existing == null) {
                AiEmployeeAuth auth = new AiEmployeeAuth();
                auth.setEmployeeId(user.getId());
                auth.setModelId(modelId);
                auth.setHasPermission(1);
                auth.setLimitType("none");
                auth.setStatus(1);
                employeeAuthMapper.insert(auth);
            } else if (existing.getHasPermission() == null || existing.getHasPermission() != 1
                    || existing.getStatus() == null || existing.getStatus() != 1) {
                existing.setHasPermission(1);
                existing.setStatus(1);
                employeeAuthMapper.updateById(existing);
            }
        }
    }

    /** 审批人若在 formData 追加了 approvedQuota 字段，落 ai_quota_override；缺省不写。 */
    private void maybeGrantQuota(SysUser user, JsonNode form, Long requestId, String operator) {
        JsonNode quota = form.get("approvedQuota");
        if (quota == null || quota.isNull() || !quota.has("quotaValue")) return;
        AiQuotaOverride override = new AiQuotaOverride();
        override.setUserId(user.getId());
        override.setUsername(user.getUsername());
        override.setSourceRequestId(requestId);
        override.setModelId(quota.has("modelId") && quota.get("modelId").canConvertToLong()
                ? quota.get("modelId").asLong() : null);
        override.setQuotaType(quota.path("quotaType").asText("token"));
        override.setQuotaPeriod(quota.path("quotaPeriod").asText("monthly"));
        override.setQuotaValue(new BigDecimal(quota.path("quotaValue").asText("0")));
        override.setEffectiveType(quota.path("effectiveType").asText("permanent"));
        String effectiveAt = quota.path("effectiveAt").asText(null);
        if (StringUtils.hasText(effectiveAt)) {
            override.setEffectiveAt(LocalDateTime.parse(effectiveAt));
        }
        String expireAt = quota.path("expireAt").asText(null);
        if (StringUtils.hasText(expireAt)) {
            override.setExpireAt(LocalDateTime.parse(expireAt));
        }
        override.setOverLimitAction(quota.path("overLimitAction").asText("reject"));
        override.setStatus(1);
        override.setCreatedBy(operator);
        quotaOverrideMapper.insert(override);
    }

    private void recordGrant(OaRequest request, SysUser user, String status,
                             List<Long> modelIds, String err, String operator) {
        AiGrantLog log = new AiGrantLog();
        log.setFlowNo(request.getFlowNo());
        log.setRequestId(request.getId());
        if (user != null) {
            log.setUserId(user.getId());
            log.setUsername(user.getUsername());
        } else {
            log.setUserId(0L);
            log.setUsername(request.getApplicant() == null ? "unknown" : request.getApplicant());
        }
        log.setGrantType(modelIds.isEmpty() ? "quota" : "model_auth");
        try {
            log.setPayloadJson(objectMapper.writeValueAsString(
                    java.util.Map.of("modelIds", modelIds, "status", status)));
        } catch (Exception ignored) {
            log.setPayloadJson("{}");
        }
        log.setStatus(status);
        log.setErrorMessage(err == null ? null : err.substring(0, Math.min(err.length(), 255)));
        log.setOperator(operator);
        grantLogMapper.insert(log);
    }
}
