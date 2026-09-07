package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.dto.AiAccessRequestDTO;
import com.mftb.admin.entity.AiAccessRequest;
import com.mftb.admin.entity.AiQuotaOverride;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiAccessRequestMapper;
import com.mftb.admin.mapper.AiQuotaOverrideMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AiAccessRequestService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * AI 使用申請服務實現
 *
 * 審批即授權（Approve-as-Grant）：審批通過在同一事務內完成
 * ① ai_access_request 寫審批結果
 * ② ai_employee_auth upsert 員工模型權限（立即生效於「我的授權模型」）
 * ③ ai_quota_override 寫入員工獨立額度（覆蓋部門/職位/角色繼承維度，立即生效於額度計算）
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiAccessRequestServiceImpl implements AiAccessRequestService {

    private final AiAccessRequestMapper requestMapper;
    private final AiQuotaOverrideMapper quotaOverrideMapper;
    private final SysUserMapper sysUserMapper;
    private final OperatorResolver operatorResolver;
    private final JdbcTemplate jdbcTemplate;

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long submitRequest(AiAccessRequestDTO.SubmitRequest request, String operator) {
        SysUser user = operatorResolver.currentUser();
        if (user == null) {
            throw new RuntimeException("未登錄或登錄已過期");
        }

        AiAccessRequest entity = new AiAccessRequest();
        entity.setApplicantId(user.getId());
        entity.setApplicantName(StringUtils.hasText(user.getName()) ? user.getName() : user.getUsername());
        entity.setDepartmentId(user.getDepartmentId());
        entity.setDepartmentName(user.getDepartment());
        entity.setPositionId(user.getPositionId());
        entity.setPositionName(user.getPosition());
        entity.setRequestType(request.getRequestType());
        entity.setApplyReason(request.getApplyReason());
        entity.setRequestedModels(request.getRequestedModels() != null ? JsonUtils.toJson(request.getRequestedModels()) : null);
        entity.setUsageDescription(request.getUsageDescription());
        entity.setUsageScenarios(request.getUsageScenarios() != null ? JsonUtils.toJson(request.getUsageScenarios()) : null);
        entity.setUsageFrequency(request.getUsageFrequency());
        entity.setCredentials(request.getCredentials() != null ? JsonUtils.toJson(request.getCredentials()) : null);
        entity.setStatus("pending");
        entity.setCreatedBy(operator);
        entity.setUpdatedBy(operator);

        requestMapper.insert(entity);
        log.info("AI使用申請已提交: id={}, applicant={}, type={}, reason={}",
                entity.getId(), entity.getApplicantName(), entity.getRequestType(), entity.getApplyReason());
        return entity.getId();
    }

    @Override
    public List<AiAccessRequestDTO.RequestVO> listRequests(AiAccessRequestDTO.QueryRequest query) {
        LambdaQueryWrapper<AiAccessRequest> wrapper = buildQueryWrapper(query);
        wrapper.orderByDesc(AiAccessRequest::getUpdatedAt);
        return requestMapper.selectList(wrapper).stream().map(this::toVO).toList();
    }

    @Override
    public List<AiAccessRequestDTO.RequestVO> listMyRequests(AiAccessRequestDTO.QueryRequest query) {
        SysUser user = operatorResolver.currentUser();
        if (user == null) {
            throw new RuntimeException("未登錄或登錄已過期");
        }
        LambdaQueryWrapper<AiAccessRequest> wrapper = buildQueryWrapper(query);
        wrapper.eq(AiAccessRequest::getApplicantId, user.getId());
        wrapper.orderByDesc(AiAccessRequest::getUpdatedAt);
        return requestMapper.selectList(wrapper).stream().map(this::toVO).toList();
    }

    @Override
    public AiAccessRequestDTO.RequestVO getRequestById(Long id) {
        AiAccessRequest entity = requestMapper.selectById(id);
        return entity != null ? toVO(entity) : null;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approveRequest(Long id, AiAccessRequestDTO.ApproveRequest request, String operator) {
        AiAccessRequest entity = requestMapper.selectById(id);
        if (entity == null) {
            throw new RuntimeException("申請記錄不存在");
        }
        if (!"pending".equals(entity.getStatus())) {
            throw new RuntimeException("該申請已處理，不可重複審批");
        }

        SysUser approver = operatorResolver.currentUser();
        LocalDateTime now = LocalDateTime.now();

        /* ① 寫審批結果 */
        entity.setStatus("approved");
        entity.setApprovedModels(request.getApprovedModels() != null ? JsonUtils.toJson(request.getApprovedModels()) : null);
        entity.setApprovedModelConfigs(request.getApprovedModelConfigs() != null ? JsonUtils.toJson(request.getApprovedModelConfigs()) : null);
        entity.setApprovedQuotaType(request.getApprovedQuotaType());
        entity.setApprovedQuotaValue(request.getApprovedQuotaValue());
        entity.setApprovedQuotaPeriod(request.getApprovedQuotaPeriod());
        entity.setApprovedOverLimitAction(request.getApprovedOverLimitAction());
        entity.setQuotaEffectiveType(request.getQuotaEffectiveType());
        entity.setQuotaExpireAt(parseTime(request.getQuotaExpireAt()));
        entity.setApproverId(approver != null ? approver.getId() : null);
        entity.setApproverName(operator);
        entity.setApproveRemark(request.getApproveRemark());
        entity.setApprovedAt(now);
        entity.setUpdatedBy(operator);
        requestMapper.updateById(entity);

        /* ② 下發模型權限（審批勾選的模型立即對申請人生效） */
        if (request.getApprovedModelConfigs() != null && !request.getApprovedModelConfigs().isEmpty()) {
            for (AiAccessRequestDTO.ApprovedModelConfig config : request.getApprovedModelConfigs()) {
                grantEmployeeModel(entity.getApplicantId(), config.getModelId(), operator);
            }
            log.info("AI申請模型權限已下發: requestId={}, applicant={}, models={}",
                    id, entity.getApplicantId(),
                    request.getApprovedModelConfigs().stream().map(AiAccessRequestDTO.ApprovedModelConfig::getModelId).toList());
        }

        /* ③ 下發個人獨立額度（覆蓋繼承維度，臨時額度到期自動失效） */
        if (request.getApprovedQuotaValue() != null && request.getApprovedQuotaValue().signum() > 0) {
            grantQuotaOverride(entity, request, operator, now);
            log.info("AI申請個人額度已下發: requestId={}, applicant={}, type={}, value={}, period={}, effective={}",
                    id, entity.getApplicantId(), request.getApprovedQuotaType(), request.getApprovedQuotaValue(),
                    request.getApprovedQuotaPeriod(), request.getQuotaEffectiveType());
        }

        log.info("AI使用申請已審批通過並完成自動授權: id={}, approver={}", id, operator);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectRequest(Long id, String remark, String operator) {
        AiAccessRequest entity = requestMapper.selectById(id);
        if (entity == null) {
            throw new RuntimeException("申請記錄不存在");
        }
        if (!"pending".equals(entity.getStatus())) {
            throw new RuntimeException("該申請已處理，不可重複審批");
        }

        SysUser approver = operatorResolver.currentUser();
        entity.setStatus("rejected");
        entity.setApproverId(approver != null ? approver.getId() : null);
        entity.setApproverName(operator);
        entity.setApproveRemark(remark);
        entity.setApprovedAt(LocalDateTime.now());
        entity.setUpdatedBy(operator);

        requestMapper.updateById(entity);
        log.info("AI使用申請已駁回: id={}, approver={}", id, operator);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancelRequest(Long id, String operator) {
        AiAccessRequest entity = requestMapper.selectById(id);
        if (entity == null) {
            throw new RuntimeException("申請記錄不存在");
        }
        if (!"pending".equals(entity.getStatus())) {
            throw new RuntimeException("該申請已處理，不可撤銷");
        }
        SysUser user = operatorResolver.currentUser();
        if (user == null || !user.getId().equals(entity.getApplicantId())) {
            throw new RuntimeException("僅申請人本人可撤銷申請");
        }
        entity.setStatus("cancelled");
        entity.setUpdatedBy(operator);
        requestMapper.updateById(entity);
        log.info("AI使用申請已撤銷: id={}, operator={}", id, operator);
    }

    /* ==================== 私有方法：自動授權 ==================== */

    /**
     * 員工模型權限下發：upsert ai_employee_auth（含軟刪除行復活，避免唯一鍵衝突）
     */
    private void grantEmployeeModel(Long employeeId, Long modelId, String operator) {
        if (employeeId == null || modelId == null) {
            return;
        }
        jdbcTemplate.update(
                "INSERT INTO ai_employee_auth (employee_id, model_id, has_permission, status, created_at, updated_at) "
                        + "VALUES (?, ?, 1, 1, NOW(), NOW()) "
                        + "ON DUPLICATE KEY UPDATE has_permission = 1, status = 1, deleted = 0, updated_at = NOW()",
                employeeId, modelId);
    }

    /**
     * 個人獨立額度下發：寫入 ai_quota_override
     * - 額度類型 requests/tokens 統一映射為維度口徑 request/token；
     * - 同一申請重複下發時按唯一鍵（user_id, source_request_id）覆蓋更新。
     */
    private void grantQuotaOverride(AiAccessRequest entity, AiAccessRequestDTO.ApproveRequest request,
                                    String operator, LocalDateTime now) {
        SysUser applicant = sysUserMapper.selectById(entity.getApplicantId());
        String username = applicant != null ? applicant.getUsername() : operator;

        AiQuotaOverride override = new AiQuotaOverride();
        override.setUserId(entity.getApplicantId());
        override.setUsername(username != null ? username : "");
        override.setSourceRequestId(entity.getId());
        override.setModelId(null);
        override.setQuotaType(normalizeQuotaType(request.getApprovedQuotaType()));
        override.setQuotaValue(request.getApprovedQuotaValue());
        override.setQuotaPeriod(StringUtils.hasText(request.getApprovedQuotaPeriod()) ? request.getApprovedQuotaPeriod() : "daily");
        override.setEffectiveType(StringUtils.hasText(request.getQuotaEffectiveType()) ? request.getQuotaEffectiveType() : "permanent");
        override.setEffectiveAt(now);
        override.setExpireAt(parseTime(request.getQuotaExpireAt()));
        override.setOverLimitAction(request.getApprovedOverLimitAction());
        override.setStatus(1);
        override.setCreatedBy(operator);
        override.setUpdatedBy(operator);

        try {
            quotaOverrideMapper.insert(override);
        } catch (org.springframework.dao.DuplicateKeyException e) {
            // 同一申請重複下發：按唯一鍵覆蓋更新（審批狀態校驗下正常不會發生，兜底保證冪等）
            log.warn("額度授予記錄已存在，覆蓋更新: userId={}, requestId={}", entity.getApplicantId(), entity.getId());
            AiQuotaOverride existing = quotaOverrideMapper.selectOne(new LambdaQueryWrapper<AiQuotaOverride>()
                    .eq(AiQuotaOverride::getUserId, override.getUserId())
                    .eq(AiQuotaOverride::getSourceRequestId, override.getSourceRequestId()));
            if (existing != null) {
                override.setId(existing.getId());
                quotaOverrideMapper.updateById(override);
            }
        }
    }

    /** 額度類型正規化：審批端 requests/tokens → 維度口徑 request/token */
    private static String normalizeQuotaType(String quotaType) {
        if (!StringUtils.hasText(quotaType)) {
            return "token";
        }
        return switch (quotaType.trim().toLowerCase()) {
            case "requests", "request" -> "request";
            default -> "token";
        };
    }

    private static LocalDateTime parseTime(String text) {
        if (!StringUtils.hasText(text)) {
            return null;
        }
        try {
            return LocalDateTime.parse(text.trim(), DT_FMT);
        } catch (Exception e) {
            return null;
        }
    }

    /* ==================== 私有方法：查詢 ==================== */

    private LambdaQueryWrapper<AiAccessRequest> buildQueryWrapper(AiAccessRequestDTO.QueryRequest query) {
        LambdaQueryWrapper<AiAccessRequest> wrapper = new LambdaQueryWrapper<>();
        if (query != null) {
            if (StringUtils.hasText(query.getStatus())) {
                wrapper.eq(AiAccessRequest::getStatus, query.getStatus());
            }
            if (StringUtils.hasText(query.getRequestType())) {
                wrapper.eq(AiAccessRequest::getRequestType, query.getRequestType());
            }
            if (StringUtils.hasText(query.getApplicantName())) {
                wrapper.like(AiAccessRequest::getApplicantName, query.getApplicantName());
            }
        }
        return wrapper;
    }

    private AiAccessRequestDTO.RequestVO toVO(AiAccessRequest entity) {
        AiAccessRequestDTO.RequestVO vo = new AiAccessRequestDTO.RequestVO();
        vo.setId(entity.getId());
        vo.setApplicantId(entity.getApplicantId());
        vo.setApplicantName(entity.getApplicantName());
        vo.setDepartmentId(entity.getDepartmentId());
        vo.setDepartmentName(entity.getDepartmentName());
        vo.setPositionId(entity.getPositionId());
        vo.setPositionName(entity.getPositionName());
        vo.setRequestType(entity.getRequestType());
        vo.setApplyReason(entity.getApplyReason());
        vo.setRequestedModels(parseJsonArray(entity.getRequestedModels()));
        vo.setUsageDescription(entity.getUsageDescription());
        vo.setUsageScenarios(parseStringArray(entity.getUsageScenarios()));
        vo.setUsageFrequency(entity.getUsageFrequency());
        vo.setCredentials(parseCredentials(entity.getCredentials()));
        vo.setStatus(entity.getStatus());
        vo.setWorkflowInstanceId(entity.getWorkflowInstanceId());
        vo.setApprovedModels(parseJsonArray(entity.getApprovedModels()));
        vo.setApprovedModelConfigs(parseModelConfigs(entity.getApprovedModelConfigs()));
        vo.setApprovedQuotaType(entity.getApprovedQuotaType());
        vo.setApprovedQuotaValue(entity.getApprovedQuotaValue());
        vo.setApprovedQuotaPeriod(entity.getApprovedQuotaPeriod());
        vo.setApprovedOverLimitAction(entity.getApprovedOverLimitAction());
        vo.setQuotaEffectiveType(entity.getQuotaEffectiveType());
        vo.setQuotaExpireAt(entity.getQuotaExpireAt() != null ? entity.getQuotaExpireAt().format(DT_FMT) : null);
        vo.setApproverId(entity.getApproverId());
        vo.setApproverName(entity.getApproverName());
        vo.setApproveRemark(entity.getApproveRemark());
        vo.setApprovedAt(entity.getApprovedAt() != null ? entity.getApprovedAt().format(DT_FMT) : null);
        vo.setCreatedBy(entity.getCreatedBy());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(entity.getCreatedAt() != null ? entity.getCreatedAt().format(DT_FMT) : null);
        vo.setUpdatedAt(entity.getUpdatedAt() != null ? entity.getUpdatedAt().format(DT_FMT) : null);
        return vo;
    }

    private List<Long> parseJsonArray(String json) {
        if (!StringUtils.hasText(json)) return null;
        return JsonUtils.parseLongList(json);
    }

    private List<String> parseStringArray(String json) {
        if (!StringUtils.hasText(json)) return null;
        return JsonUtils.parseStringList(json);
    }

    private List<AiAccessRequestDTO.CredentialItem> parseCredentials(String json) {
        if (!StringUtils.hasText(json)) return null;
        return JsonUtils.parseList(json, AiAccessRequestDTO.CredentialItem.class);
    }

    private List<AiAccessRequestDTO.ApprovedModelConfig> parseModelConfigs(String json) {
        if (!StringUtils.hasText(json)) return null;
        return JsonUtils.parseList(json, AiAccessRequestDTO.ApprovedModelConfig.class);
    }
}
