package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 审批通过后兑现 AI 授权的实现，契约见 {@link AiGrantOnApprovalService}。整个 grant 在单事务内完成，靠 ai_grant_log 的 flow_no 唯一约束做幂等。
 * <p>
 * 事务边界：grant 标注 @Transactional(rollbackFor = Exception.class)，其余方法不开事务。
 * <p>
 * 协作依赖：SysUserMapper, AiEmployeeAuthMapper, AiQuotaOverrideMapper, AiGrantLogMapper。
 */

@Slf4j
@Service
@RequiredArgsConstructor
public class AiGrantOnApprovalServiceImpl implements AiGrantOnApprovalService {

    private final SysUserMapper sysUserMapper;
    private final AiEmployeeAuthMapper employeeAuthMapper;
    private final AiQuotaOverrideMapper quotaOverrideMapper;
    private final AiGrantLogMapper grantLogMapper;
    private final ObjectMapper objectMapper;

    /**
     * 审批人可以合并进 form_data 的授权键白名单。
     * <p>与前端 {@code buildApprovePayload} 的请求体一致；除这些键外的一切字段（申请理由、
     * 申请模型清单、使用说明、凭证…）都不允许经审批接口改写。
     */
    private static final Set<String> GRANT_KEYS = Set.of(
            "approvedModels", "approvedModelConfigs",
            "approvedQuotaType", "approvedQuotaValue", "approvedQuotaPeriod",
            "approvedOverLimitAction", "quotaEffectiveType", "quotaExpireAt",
            "approvedQuota", "approveRemark");

    private static final DateTimeFormatter SPACE_DATE_TIME =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Override
    @Transactional(rollbackFor = Exception.class, propagation = Propagation.REQUIRED)
    public void grant(OaRequest request, String approverUsername) {
        if (request == null || !StringUtils.hasText(request.getFlowNo())) {
            throw new IllegalArgumentException("审批请求不能为空");
        }
        /*
         * 幂等：同 flow_no 只保留一条发放记录（唯一的 uk_grant_flow 决定不可能有两条）。
         * 已 GRANTED 直接跳过；历史 FAILED（如上一版把申请人写成「姓名(工号)」导致解析失败）
         * 复用同一行更新为本次结果，避免重试时撞唯一键把审批再堵死一次。
         */
        AiGrantLog existing = grantLogMapper.selectOne(new LambdaQueryWrapper<AiGrantLog>()
                .eq(AiGrantLog::getFlowNo, request.getFlowNo())
                .last("LIMIT 1"));
        if (existing != null && "GRANTED".equals(existing.getStatus())) {
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
            recordGrant(existing, request, applicant, "GRANTED", modelIds, null, approverUsername);
            log.info("AI 使用申请审批已发放：flowNo={} user={} models={}",
                    request.getFlowNo(), applicant.getUsername(), modelIds.size());
        } catch (RuntimeException e) {
            // 失败必须落审计再向外传播（不吞异常）
            recordGrant(existing, request, null, "FAILED", List.of(), e.getMessage(), approverUsername);
            throw e;
        }
    }

    @Override
    public String mergeGrantFormData(OaRequest request, String approverFormData) {
        if (!StringUtils.hasText(approverFormData)) {
            return null;
        }
        JsonNode incoming;
        try {
            incoming = objectMapper.readTree(approverFormData);
        } catch (Exception e) {
            log.warn("AI 审批授权配置解析失败，按未提交处理: flowNo={}, error={}",
                    request != null ? request.getFlowNo() : null, e.getMessage());
            return null;
        }
        if (incoming == null || !incoming.isObject()) {
            return null;
        }
        ObjectNode merged;
        JsonNode base = parseFormData(request != null ? request.getFormData() : null);
        // form_data 非 JSON 对象（历史脏数据/数组）时以空对象为底，避免 deepCopy 抛 ClassCastException
        merged = base != null && base.isObject() ? ((ObjectNode) base).deepCopy() : objectMapper.createObjectNode();
        boolean changed = false;
        Iterator<String> names = incoming.fieldNames();
        while (names.hasNext()) {
            String key = names.next();
            if (!GRANT_KEYS.contains(key)) {
                continue;
            }
            JsonNode value = incoming.get(key);
            if (value == null || value.isNull()) {
                continue;
            }
            merged.set(key, value);
            changed = true;
        }
        if (!changed) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(merged);
        } catch (Exception e) {
            log.warn("AI 审批授权配置合并失败: flowNo={}, error={}",
                    request != null ? request.getFlowNo() : null, e.getMessage());
            return null;
        }
    }

    /**
     * 解析申请人。
     * <p>OA 提交侧写入的是 {@code OperatorResolver.operatorSignature} = 「姓名(工号)」，
     * 只有工号能唯一对应一个账号；旧实现直接拿整串去等值匹配 username/name，
     * 真实单据必然解析不到申请人，终审时抛 IllegalStateException 被兜底成「系統繁忙」。
     */
    private SysUser resolveApplicant(OaRequest request) {
        if (!StringUtils.hasText(request.getApplicant())) {
            return null;
        }
        String raw = request.getApplicant().trim();
        // 1) 签名里的工号最可靠
        String empId = extractEmpId(raw);
        if (StringUtils.hasText(empId)) {
            SysUser byEmpId = sysUserMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                    .eq(SysUser::getEmpId, empId).last("LIMIT 1"));
            if (byEmpId != null) return byEmpId;
        }
        // 2) 登录账号（历史单据可能直接存 username）
        SysUser byUsername = sysUserMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getUsername, raw).last("LIMIT 1"));
        if (byUsername != null) return byUsername;
        // 3) 姓名（历史单据可能只存姓名；签名形态先剥掉括号部分）
        String name = stripSignature(raw);
        if (!StringUtils.hasText(name)) return null;
        return sysUserMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getName, name).last("LIMIT 1"));
    }

    /** 从「姓名(工号)」签名中取工号：兼容半角/全角括号 */
    static String extractEmpId(String signature) {
        if (!StringUtils.hasText(signature)) return null;
        int start = signature.lastIndexOf('(');
        int end = signature.lastIndexOf(')');
        if (start < 0 || end < 0) {
            start = signature.lastIndexOf('（');
            end = signature.lastIndexOf('）');
        }
        if (start < 0 || end <= start) return null;
        String candidate = signature.substring(start + 1, end).trim();
        return StringUtils.hasText(candidate) ? candidate : null;
    }

    /** 去掉签名中的括号部分："冯松(MF00002)" → "冯松" */
    static String stripSignature(String signature) {
        if (!StringUtils.hasText(signature)) return null;
        String trimmed = signature.trim();
        int start = trimmed.indexOf('(');
        if (start < 0) start = trimmed.indexOf('（');
        return start > 0 ? trimmed.substring(0, start).trim() : trimmed;
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

    /**
     * 被授予的模型清单：以审批人实际勾选的 {@code approvedModels} 为准，
     * 未授权时回退申请人提交的 {@code requestedModels}（兼容旧单与无需审批人裁定的场景）。
     * <p>前端两份表单的字段名不同（申请用 requestedModels、审批用 approvedModels），
     * 只读前者会把审批人对授权范围的裁定完全忽略掉。
     */
    private List<Long> collectModelIds(JsonNode form) {
        Set<Long> ids = new LinkedHashSet<>();
        appendModelIds(ids, form.get("approvedModels"));
        if (ids.isEmpty()) {
            appendModelIds(ids, form.get("requestedModels"));
        }
        if (ids.isEmpty()) {
            appendModelIds(ids, form.get("approvedModelConfigs"));
        }
        return new ArrayList<>(ids);
    }

    /** 追加模型 ID：支持 [1,2] / [{modelId:1}] / [{id:1}] 三种历史形态 */
    private void appendModelIds(Set<Long> target, JsonNode arr) {
        if (arr == null || !arr.isArray()) return;
        for (JsonNode node : arr) {
            JsonNode idNode = node.get("modelId") != null ? node.get("modelId") : node.get("id");
            if (idNode != null && idNode.canConvertToLong()) {
                target.add(idNode.asLong());
            } else if (node.canConvertToLong()) {
                target.add(node.asLong());
            }
        }
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

    /**
     * 落审批人授予的个人额度。
     * <p>兼容两种表单形态：
     * <ul>
     *   <li>扁平字段（当前前端 {@code buildApprovePayload}）：approvedQuotaValue / approvedQuotaType /
     *       approvedQuotaPeriod / approvedOverLimitAction / quotaEffectiveType / quotaExpireAt；</li>
     *   <li>嵌套对象（早期约定）：{@code approvedQuota:{quotaValue,quotaType,quotaPeriod,…}}。</li>
     * </ul>
     * 只读嵌套对象会让审批人填的额度永远发不下去（旧实现即如此）。
     */
    private void maybeGrantQuota(SysUser user, JsonNode form, Long requestId, String operator) {
        JsonNode quota = form.get("approvedQuota");
        if (quota == null || !quota.isObject()) {
            quota = form;
        }
        JsonNode valueNode = quota.has("quotaValue") ? quota.get("quotaValue") : quota.get("approvedQuotaValue");
        if (valueNode == null || valueNode.isNull()) return;
        BigDecimal value;
        try {
            value = new BigDecimal(valueNode.asText());
        } catch (NumberFormatException e) {
            log.warn("AI 审批额度值不是合法数字，跳过额度发放: flowNo requestId={} value={}",
                    requestId, valueNode.asText());
            return;
        }
        if (value.compareTo(BigDecimal.ZERO) <= 0) return;

        AiQuotaOverride override = new AiQuotaOverride();
        override.setUserId(user.getId());
        override.setUsername(user.getUsername());
        override.setSourceRequestId(requestId);
        override.setModelId(quota.has("modelId") && quota.get("modelId").canConvertToLong()
                ? quota.get("modelId").asLong() : null);
        override.setQuotaType(normalizeQuotaType(text(quota, "quotaType", "approvedQuotaType", "token")));
        override.setQuotaPeriod(text(quota, "quotaPeriod", "approvedQuotaPeriod", "monthly"));
        override.setQuotaValue(value);
        override.setEffectiveType(text(quota, "effectiveType", "quotaEffectiveType", "permanent"));
        LocalDateTime effectiveAt = firstDateTime(quota, "effectiveAt");
        if (effectiveAt != null) {
            override.setEffectiveAt(effectiveAt);
        }
        LocalDateTime expireAt = firstDateTime(quota, "expireAt", "quotaExpireAt");
        if (expireAt != null) {
            override.setExpireAt(expireAt);
        }
        override.setOverLimitAction(text(quota, "overLimitAction", "approvedOverLimitAction", "reject"));
        override.setStatus(1);
        override.setCreatedBy(operator);
        quotaOverrideMapper.insert(override);
    }

    /** 取第一个非空文本字段，全空时回退默认值 */
    private static String text(JsonNode node, String primary, String fallback, String defaultValue) {
        JsonNode v = node.get(primary);
        if (v == null || v.isNull() || !StringUtils.hasText(v.asText())) {
            v = node.get(fallback);
        }
        return v == null || v.isNull() || !StringUtils.hasText(v.asText()) ? defaultValue : v.asText();
    }

    /** 额度类型归一：前端用复数（requests/tokens），计量侧只认单数（request/token） */
    static String normalizeQuotaType(String raw) {
        if (!StringUtils.hasText(raw)) return "token";
        String v = raw.trim().toLowerCase();
        return switch (v) {
            case "request", "requests" -> "request";
            case "cost" -> "cost";
            default -> "token";
        };
    }

    /** 宽松解析时间：ISO / yyyy-MM-dd HH:mm:ss / yyyy-MM-dd / 带时区偏移；解析不了记 warn 并跳过，不阻断审批 */
    private LocalDateTime firstDateTime(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode v = node.get(key);
            if (v == null || v.isNull() || !StringUtils.hasText(v.asText())) continue;
            LocalDateTime parsed = parseDateTime(v.asText());
            if (parsed != null) return parsed;
        }
        return null;
    }

    private LocalDateTime parseDateTime(String raw) {
        String v = raw.trim();
        try {
            return LocalDateTime.parse(v);
        } catch (Exception ignored) {
            // 继续尝试其它格式
        }
        try {
            return LocalDateTime.parse(v, SPACE_DATE_TIME);
        } catch (Exception ignored) {
            // 继续尝试其它格式
        }
        try {
            return OffsetDateTime.parse(v).toLocalDateTime();
        } catch (Exception ignored) {
            // 继续尝试其它格式
        }
        try {
            return LocalDate.parse(v).atStartOfDay();
        } catch (Exception ignored) {
            log.warn("AI 审批时间字段无法解析，已忽略: {}", raw);
            return null;
        }
    }

    /** 写发放审计：已有同 flow_no 记录时复用该行（uk_grant_flow 唯一），否则插入。 */
    private void recordGrant(AiGrantLog existing, OaRequest request, SysUser user, String status,
                             List<Long> modelIds, String err, String operator) {
        AiGrantLog log = existing != null ? existing : new AiGrantLog();
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
        if (log.getId() == null) {
            grantLogMapper.insert(log);
        } else {
            grantLogMapper.updateById(log);
        }
    }
}
