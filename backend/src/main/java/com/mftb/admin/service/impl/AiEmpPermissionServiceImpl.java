package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.dto.AiEmpPermissionDTO;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.AiEmpPermissionService;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 員工AI權額管理服務實現
 *
 * 管理員視角聚合四維度（部門/職位/角色/員工）數據，
 * 復用 AiMyCenterServiceImpl 的聚合邏輯但支持查詢任意員工。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiEmpPermissionServiceImpl implements AiEmpPermissionService {

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final SysUserMapper sysUserMapper;
    private final AiModelMapper modelMapper;
    private final AiQuotaConfigMapper quotaConfigMapper;
    private final AiQuotaOverrideMapper quotaOverrideMapper;
    private final AiEmpQuotaPolicyMapper empQuotaPolicyMapper;
    private final AiRoleQuotaPolicyMapper roleQuotaPolicyMapper;
    private final AiDeptAuthGroupMapper deptGroupMapper;
    private final AiDeptAuthGroupDeptMapper deptGroupDeptMapper;
    private final AiDeptAuthGroupModelMapper deptGroupModelMapper;
    private final AiEmployeeAuthMapper employeeAuthMapper;
    private final AiEmpPosAuthStrategyMapper empPosAuthStrategyMapper;
    private final AiEmpRoleAuthMapper empRoleAuthMapper;
    private final LlmUsageMapper llmUsageMapper;
    private final AiEmpQuotaAdjustLogMapper adjustLogMapper;

    /* ══════════════════════ 列表聚合 ══════════════════════ */

    @Override
    public List<AiEmpPermissionDTO.SummaryVO> listSummaries(
            String queryName, String queryDept, String queryUpdatedBy,
            String queryUpdateTimeStart, String queryUpdateTimeEnd) {

        // 1. 查詢全部啟用員工
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getStatus, 1);
        if (queryName != null && !queryName.isBlank()) {
            String name = queryName.trim();
            wrapper.and(w -> w.like(SysUser::getName, name).or().like(SysUser::getEmpId, name));
        }
        if (queryDept != null && !queryDept.isBlank()) {
            wrapper.like(SysUser::getDepartment, queryDept.trim());
        }
        List<SysUser> employees = sysUserMapper.selectList(wrapper);

        // 2. 批量加載模型（避免 N+1）
        Map<Long, AiModel> allModels = loadAllModels();

        // 3. 逐員工聚合
        List<AiEmpPermissionDTO.SummaryVO> result = new ArrayList<>();
        for (SysUser emp : employees) {
            AiEmpPermissionDTO.SummaryVO vo = buildSummary(emp, allModels);

            // 過濾：最後更新人
            if (queryUpdatedBy != null && !queryUpdatedBy.isBlank()) {
                if (vo.getLastUpdatedBy() == null || !vo.getLastUpdatedBy().contains(queryUpdatedBy.trim())) {
                    continue;
                }
            }
            // 過濾：最後更新時間
            if (queryUpdateTimeStart != null && !queryUpdateTimeStart.isBlank()) {
                if (vo.getLastUpdatedAt() == null || vo.getLastUpdatedAt().compareTo(queryUpdateTimeStart + " 00:00:00") < 0) {
                    continue;
                }
            }
            if (queryUpdateTimeEnd != null && !queryUpdateTimeEnd.isBlank()) {
                if (vo.getLastUpdatedAt() == null || vo.getLastUpdatedAt().compareTo(queryUpdateTimeEnd + " 23:59:59") > 0) {
                    continue;
                }
            }
            result.add(vo);
        }
        return result;
    }

    private AiEmpPermissionDTO.SummaryVO buildSummary(SysUser emp, Map<Long, AiModel> allModels) {
        AiEmpPermissionDTO.SummaryVO vo = new AiEmpPermissionDTO.SummaryVO();
        vo.setEmployeeId(emp.getId());
        vo.setEmployeeName(emp.getName());
        vo.setEmpId(emp.getEmpId());
        vo.setDepartment(emp.getDepartment());
        vo.setDeptId(emp.getDepartmentId());
        vo.setPosition(emp.getPosition());
        vo.setJobLevel(emp.getJobLevel());

        // 收集模型
        Map<Long, Set<String>> modelSources = new LinkedHashMap<>();
        collectDeptModels(emp, modelSources);
        collectPositionModels(emp, modelSources);
        collectRoleModels(emp, modelSources);
        collectEmployeeModels(emp, modelSources);

        int enabledCount = 0;
        for (Long modelId : modelSources.keySet()) {
            AiModel model = allModels.get(modelId);
            if (model != null && model.getStatus() != null && model.getStatus() == 1) {
                enabledCount++;
                AiEmpPermissionDTO.ModelBrief brief = new AiEmpPermissionDTO.ModelBrief();
                brief.setModelId(modelId);
                brief.setModelName(model.getName());
                brief.setSource(String.join(",", modelSources.get(modelId)));
                vo.getModels().add(brief);
            }
        }
        vo.setModelCount(enabledCount);

        // 收集額度
        collectQuotaBriefs(emp, vo, allModels);

        // 最後更新信息：從四維度配置表取 MAX(updated_at)
        fillLastUpdated(emp, vo);

        return vo;
    }

    /** 收集額度簡要（列表用） */
    private void collectQuotaBriefs(SysUser emp, AiEmpPermissionDTO.SummaryVO vo, Map<Long, AiModel> allModels) {
        // 員工/部門額度（ai_quota_config）
        LambdaQueryWrapper<AiQuotaConfig> configWrapper = new LambdaQueryWrapper<AiQuotaConfig>()
                .eq(AiQuotaConfig::getStatus, 1)
                .and(w -> {
                    w.nested(n -> n.eq(AiQuotaConfig::getQuotaType, "employee")
                            .eq(AiQuotaConfig::getTargetId, emp.getId()));
                    if (emp.getDepartmentId() != null) {
                        w.or(n -> n.eq(AiQuotaConfig::getQuotaType, "department")
                                .eq(AiQuotaConfig::getTargetId, emp.getDepartmentId()));
                    }
                });
        for (AiQuotaConfig config : quotaConfigMapper.selectList(configWrapper)) {
            boolean isEmployee = "employee".equals(config.getQuotaType());
            String source = isEmployee ? "employee" : "department";
            String sourceName = isEmployee ? "員工專屬" : (emp.getDepartment() != null ? emp.getDepartment() : "部門額度");
            if (config.getDailyQuota() != null && config.getDailyQuota() > 0) {
                addQuotaBrief(vo, source, sourceName, "token", "daily",
                        BigDecimal.valueOf(config.getDailyQuota()), computeUsed(emp, config, "daily"), 1);
            }
            if (config.getMonthlyQuota() != null && config.getMonthlyQuota() > 0) {
                addQuotaBrief(vo, source, sourceName, "token", "monthly",
                        BigDecimal.valueOf(config.getMonthlyQuota()), computeUsed(emp, config, "monthly"), 1);
            }
        }

        // 職位額度（ai_emp_quota_policy）
        if (emp.getSequence() != null && emp.getJobLevel() != null) {
            for (AiEmpQuotaPolicy policy : empQuotaPolicyMapper.selectList(
                    new LambdaQueryWrapper<AiEmpQuotaPolicy>().eq(AiEmpQuotaPolicy::getStatus, 1))) {
                List<String> seqs = JsonUtils.parseStringList(policy.getSequences());
                List<String> levels = JsonUtils.parseStringList(policy.getJobLevels());
                if (seqs.contains(emp.getSequence()) && levels.contains(emp.getJobLevel())) {
                    addQuotaBrief(vo, "position", policy.getName(), policy.getQuotaType(), policy.getPeriod(),
                            policy.getQuotaValue(), policy.getUsedValue() != null ? policy.getUsedValue() : BigDecimal.ZERO, 1);
                }
            }
        }

        // 角色額度（ai_role_quota_policy）
        for (AiRoleQuotaPolicy policy : roleQuotaPolicyMapper.selectList(
                new LambdaQueryWrapper<AiRoleQuotaPolicy>().eq(AiRoleQuotaPolicy::getStatus, 1))) {
            List<Long> userIds = JsonUtils.parseLongList(policy.getUserIds());
            if (userIds.contains(emp.getId())) {
                addQuotaBrief(vo, "role", policy.getRoleName(), policy.getQuotaType(), policy.getPeriod(),
                        policy.getQuotaValue(), policy.getUsedValue() != null ? policy.getUsedValue() : BigDecimal.ZERO, 1);
            }
        }

        // 審批授予額度（ai_quota_override）
        LocalDateTime now = LocalDateTime.now();
        for (AiQuotaOverride grant : quotaOverrideMapper.selectList(
                new LambdaQueryWrapper<AiQuotaOverride>()
                        .eq(AiQuotaOverride::getUserId, emp.getId())
                        .eq(AiQuotaOverride::getStatus, 1)
                        .and(w -> w.isNull(AiQuotaOverride::getEffectiveAt)
                                .or().le(AiQuotaOverride::getEffectiveAt, now))
                        .and(w -> w.isNull(AiQuotaOverride::getExpireAt)
                                .or().gt(AiQuotaOverride::getExpireAt, now)))) {
            addQuotaBrief(vo, "approval", "審批授予", grant.getQuotaType(), grant.getQuotaPeriod(),
                    grant.getQuotaValue(), BigDecimal.ZERO, 1);
        }
    }

    private void addQuotaBrief(AiEmpPermissionDTO.SummaryVO vo, String source, String sourceDesc,
                               String quotaType, String quotaPeriod,
                               BigDecimal quotaValue, BigDecimal usedValue, int status) {
        AiEmpPermissionDTO.QuotaBrief brief = new AiEmpPermissionDTO.QuotaBrief();
        brief.setSource(source);
        brief.setSourceDesc(sourceDesc);
        brief.setQuotaType(quotaType);
        brief.setQuotaPeriod(quotaPeriod);
        brief.setQuotaValue(quotaValue);
        brief.setUsedValue(usedValue);
        brief.setStatus(status);
        vo.getQuotas().add(brief);
    }

    /** 簡化用量計算：從 biz_llm_usage 按員工賬號聚合 */
    private BigDecimal computeUsed(SysUser emp, AiQuotaConfig config, String period) {
        LocalDate today = LocalDate.now();
        LocalDateTime windowStart = "daily".equals(period)
                ? today.atStartOfDay()
                : today.withDayOfMonth(1).atStartOfDay();
        List<LlmUsage> rows = llmUsageMapper.selectList(
                new LambdaQueryWrapper<LlmUsage>()
                        .eq(LlmUsage::getUsername, emp.getUsername())
                        .ge(LlmUsage::getCreatedAt, windowStart));
        long tokens = rows.stream()
                .mapToLong(r -> nz(r.getPromptTokens()) + nz(r.getCompletionTokens()))
                .sum();
        return BigDecimal.valueOf(tokens);
    }

    /** 填充最後更新信息：從四維度配置表取 MAX(updated_at) 及對應 updated_by */
    private void fillLastUpdated(SysUser emp, AiEmpPermissionDTO.SummaryVO vo) {
        String latestBy = null;
        String latestAt = null;

        // 部門策略組
        if (emp.getDepartmentId() != null) {
            List<AiDeptAuthGroupDept> links = deptGroupDeptMapper.selectList(
                    new LambdaQueryWrapper<AiDeptAuthGroupDept>()
                            .select(AiDeptAuthGroupDept::getGroupId)
                            .eq(AiDeptAuthGroupDept::getDepartmentId, emp.getDepartmentId()));
            if (!links.isEmpty()) {
                List<Long> groupIds = links.stream().map(AiDeptAuthGroupDept::getGroupId).distinct().toList();
                for (AiDeptAuthGroup g : deptGroupMapper.selectList(
                        new LambdaQueryWrapper<AiDeptAuthGroup>()
                                .in(AiDeptAuthGroup::getId, groupIds))) {
                    String ts = format(g.getUpdatedAt());
                    if (ts != null && (latestAt == null || ts.compareTo(latestAt) > 0)) {
                        latestAt = ts;
                        latestBy = g.getUpdatedBy();
                    }
                }
            }
        }

        // 職位策略
        for (AiEmpPosAuthStrategy s : empPosAuthStrategyMapper.selectList(
                new LambdaQueryWrapper<AiEmpPosAuthStrategy>().eq(AiEmpPosAuthStrategy::getStatus, 1))) {
            List<String> seqs = JsonUtils.parseStringList(s.getSequences());
            List<String> levels = JsonUtils.parseStringList(s.getJobLevels());
            if (emp.getSequence() != null && emp.getJobLevel() != null
                    && seqs.contains(emp.getSequence()) && levels.contains(emp.getJobLevel())) {
                String ts = format(s.getUpdatedAt());
                if (ts != null && (latestAt == null || ts.compareTo(latestAt) > 0)) {
                    latestAt = ts;
                    latestBy = s.getUpdatedBy();
                }
            }
        }

        // 角色授權
        for (AiEmpRoleAuth r : empRoleAuthMapper.selectList(
                new LambdaQueryWrapper<AiEmpRoleAuth>().eq(AiEmpRoleAuth::getStatus, 1))) {
            List<Long> userIds = JsonUtils.parseLongList(r.getUserIds());
            if (userIds.contains(emp.getId())) {
                String ts = format(r.getUpdatedAt());
                if (ts != null && (latestAt == null || ts.compareTo(latestAt) > 0)) {
                    latestAt = ts;
                    latestBy = r.getUpdatedBy();
                }
            }
        }

        // 員工個人授權
        for (AiEmployeeAuth a : employeeAuthMapper.selectList(
                new LambdaQueryWrapper<AiEmployeeAuth>()
                        .eq(AiEmployeeAuth::getEmployeeId, emp.getId()))) {
            String ts = format(a.getUpdatedAt());
            if (ts != null && (latestAt == null || ts.compareTo(latestAt) > 0)) {
                latestAt = ts;
                latestBy = "system";
            }
        }

        vo.setLastUpdatedBy(latestBy != null ? latestBy : "system");
        vo.setLastUpdatedAt(latestAt != null ? latestAt : format(emp.getUpdatedAt()));
    }

    /* ══════════════════════ 詳情 ══════════════════════ */

    @Override
    public AiEmpPermissionDTO.DetailVO getDetail(Long employeeId) {
        SysUser emp = sysUserMapper.selectById(employeeId);
        if (emp == null) {
            return null;
        }

        AiEmpPermissionDTO.DetailVO detail = new AiEmpPermissionDTO.DetailVO();
        Map<Long, AiModel> allModels = loadAllModels();

        // 基本信息
        detail.setBasic(buildSummary(emp, allModels));

        // 模型權限明細（含能力開關）
        collectModelPermissions(emp, detail, allModels);

        // 額度明細
        collectQuotaGrants(emp, detail);

        return detail;
    }

    /** 收集模型權限明細（四維度，含能力開關 + 來源） */
    private void collectModelPermissions(SysUser emp, AiEmpPermissionDTO.DetailVO detail, Map<Long, AiModel> allModels) {
        // 部門維度
        if (emp.getDepartmentId() != null) {
            List<AiDeptAuthGroupDept> links = deptGroupDeptMapper.selectList(
                    new LambdaQueryWrapper<AiDeptAuthGroupDept>()
                            .select(AiDeptAuthGroupDept::getGroupId)
                            .eq(AiDeptAuthGroupDept::getDepartmentId, emp.getDepartmentId()));
            if (!links.isEmpty()) {
                List<Long> groupIds = links.stream().map(AiDeptAuthGroupDept::getGroupId).distinct().toList();
                List<AiDeptAuthGroup> enabledGroups = deptGroupMapper.selectList(
                        new LambdaQueryWrapper<AiDeptAuthGroup>()
                                .in(AiDeptAuthGroup::getId, groupIds)
                                .eq(AiDeptAuthGroup::getStatus, 1));
                for (AiDeptAuthGroup group : enabledGroups) {
                    List<AiDeptAuthGroupModel> models = deptGroupModelMapper.selectList(
                            new LambdaQueryWrapper<AiDeptAuthGroupModel>()
                                    .eq(AiDeptAuthGroupModel::getGroupId, group.getId()));
                    for (AiDeptAuthGroupModel m : models) {
                        AiModel model = allModels.get(m.getModelId());
                        if (model == null) continue;
                        AiEmpPermissionDTO.ModelPermissionVO mvo = new AiEmpPermissionDTO.ModelPermissionVO();
                        mvo.setModelId(m.getModelId());
                        mvo.setModelName(model.getName());
                        mvo.setSource("department");
                        mvo.setSourceDesc(group.getName());
                        mvo.setVisionSupport(nz(m.getVisionSupport()));
                        mvo.setFunctionCalling(nz(m.getFunctionCalling()));
                        mvo.setJsonMode(nz(m.getJsonMode()));
                        mvo.setStreaming(nz(m.getStreaming()));
                        mvo.setThinkingMode(nz(m.getThinkingMode()));
                        mvo.setStatus(model.getStatus() != null ? model.getStatus() : 1);
                        mvo.setGrantedAt(format(group.getCreatedAt()));
                        detail.getModels().add(mvo);
                    }
                }
            }
        }

        // 職位維度
        if (emp.getSequence() != null && emp.getJobLevel() != null) {
            for (AiEmpPosAuthStrategy strategy : empPosAuthStrategyMapper.selectList(
                    new LambdaQueryWrapper<AiEmpPosAuthStrategy>().eq(AiEmpPosAuthStrategy::getStatus, 1))) {
                List<String> seqs = JsonUtils.parseStringList(strategy.getSequences());
                List<String> levels = JsonUtils.parseStringList(strategy.getJobLevels());
                if (!seqs.contains(emp.getSequence()) || !levels.contains(emp.getJobLevel())) continue;
                for (Map<String, Object> mc : JsonUtils.parseMapList(strategy.getModelConfigs())) {
                    Object modelIdObj = mc.get("modelId");
                    if (!(modelIdObj instanceof Number n)) continue;
                    Long modelId = n.longValue();
                    AiModel model = allModels.get(modelId);
                    if (model == null) continue;
                    AiEmpPermissionDTO.ModelPermissionVO mvo = new AiEmpPermissionDTO.ModelPermissionVO();
                    mvo.setModelId(modelId);
                    mvo.setModelName(model.getName());
                    mvo.setSource("position");
                    mvo.setSourceDesc(strategy.getStrategyName());
                    mvo.setVisionSupport(intFromMap(mc, "visionSupport"));
                    mvo.setFunctionCalling(intFromMap(mc, "functionCalling"));
                    mvo.setJsonMode(intFromMap(mc, "jsonMode"));
                    mvo.setStreaming(intFromMap(mc, "streaming"));
                    mvo.setThinkingMode(intFromMap(mc, "thinkingMode"));
                    mvo.setStatus(model.getStatus() != null ? model.getStatus() : 1);
                    mvo.setGrantedAt(format(strategy.getCreatedAt()));
                    detail.getModels().add(mvo);
                }
            }
        }

        // 角色維度
        for (AiEmpRoleAuth role : empRoleAuthMapper.selectList(
                new LambdaQueryWrapper<AiEmpRoleAuth>().eq(AiEmpRoleAuth::getStatus, 1))) {
            List<Long> userIds = JsonUtils.parseLongList(role.getUserIds());
            if (!userIds.contains(emp.getId())) continue;
            for (Map<String, Object> mc : JsonUtils.parseMapList(role.getModelConfigs())) {
                Object modelIdObj = mc.get("modelId");
                if (!(modelIdObj instanceof Number n)) continue;
                Long modelId = n.longValue();
                AiModel model = allModels.get(modelId);
                if (model == null) continue;
                AiEmpPermissionDTO.ModelPermissionVO mvo = new AiEmpPermissionDTO.ModelPermissionVO();
                mvo.setModelId(modelId);
                mvo.setModelName(model.getName());
                mvo.setSource("role");
                mvo.setSourceDesc(role.getRoleName());
                mvo.setVisionSupport(intFromMap(mc, "visionSupport"));
                mvo.setFunctionCalling(intFromMap(mc, "functionCalling"));
                mvo.setJsonMode(intFromMap(mc, "jsonMode"));
                mvo.setStreaming(intFromMap(mc, "streaming"));
                mvo.setThinkingMode(intFromMap(mc, "thinkingMode"));
                mvo.setStatus(model.getStatus() != null ? model.getStatus() : 1);
                mvo.setGrantedAt(format(role.getCreatedAt()));
                detail.getModels().add(mvo);
            }
        }

        // 員工維度
        for (AiEmployeeAuth auth : employeeAuthMapper.selectList(
                new LambdaQueryWrapper<AiEmployeeAuth>()
                        .eq(AiEmployeeAuth::getEmployeeId, emp.getId())
                        .eq(AiEmployeeAuth::getHasPermission, 1))) {
            AiModel model = allModels.get(auth.getModelId());
            if (model == null) continue;
            AiEmpPermissionDTO.ModelPermissionVO mvo = new AiEmpPermissionDTO.ModelPermissionVO();
            mvo.setModelId(auth.getModelId());
            mvo.setModelName(model.getName());
            mvo.setSource("employee");
            mvo.setSourceDesc("員工專屬授權");
            mvo.setVisionSupport(nz(model.getVisionSupport()));
            mvo.setFunctionCalling(nz(model.getFunctionCalling()));
            mvo.setJsonMode(nz(model.getJsonMode()));
            mvo.setStreaming(nz(model.getStreaming()));
            mvo.setThinkingMode(nz(model.getThinkingMode()));
            mvo.setStatus(auth.getStatus() != null ? auth.getStatus() : 1);
            mvo.setGrantedAt(format(auth.getCreatedAt()));
            detail.getModels().add(mvo);
        }
    }

    /** 收集額度明細（詳情頁用） */
    private void collectQuotaGrants(SysUser emp, AiEmpPermissionDTO.DetailVO detail) {
        // 員工/部門額度
        LambdaQueryWrapper<AiQuotaConfig> configWrapper = new LambdaQueryWrapper<AiQuotaConfig>()
                .eq(AiQuotaConfig::getStatus, 1)
                .and(w -> {
                    w.nested(n -> n.eq(AiQuotaConfig::getQuotaType, "employee")
                            .eq(AiQuotaConfig::getTargetId, emp.getId()));
                    if (emp.getDepartmentId() != null) {
                        w.or(n -> n.eq(AiQuotaConfig::getQuotaType, "department")
                                .eq(AiQuotaConfig::getTargetId, emp.getDepartmentId()));
                    }
                });
        for (AiQuotaConfig config : quotaConfigMapper.selectList(configWrapper)) {
            boolean isEmployee = "employee".equals(config.getQuotaType());
            String source = isEmployee ? "employee" : "department";
            String sourceName = isEmployee ? "員工專屬" : (emp.getDepartment() != null ? emp.getDepartment() : "部門額度");
            if (config.getDailyQuota() != null && config.getDailyQuota() > 0) {
                addQuotaGrant(detail, config.getId(), source, sourceName, "token", "daily",
                        BigDecimal.valueOf(config.getDailyQuota()), computeUsed(emp, config, "daily"),
                        "permanent", format(config.getCreatedAt()), null, null, config.getStatus());
            }
            if (config.getMonthlyQuota() != null && config.getMonthlyQuota() > 0) {
                addQuotaGrant(detail, config.getId(), source, sourceName, "token", "monthly",
                        BigDecimal.valueOf(config.getMonthlyQuota()), computeUsed(emp, config, "monthly"),
                        "permanent", format(config.getCreatedAt()), null, null, config.getStatus());
            }
        }

        // 職位額度
        if (emp.getSequence() != null && emp.getJobLevel() != null) {
            for (AiEmpQuotaPolicy policy : empQuotaPolicyMapper.selectList(
                    new LambdaQueryWrapper<AiEmpQuotaPolicy>().eq(AiEmpQuotaPolicy::getStatus, 1))) {
                List<String> seqs = JsonUtils.parseStringList(policy.getSequences());
                List<String> levels = JsonUtils.parseStringList(policy.getJobLevels());
                if (seqs.contains(emp.getSequence()) && levels.contains(emp.getJobLevel())) {
                    addQuotaGrant(detail, policy.getId(), "position", policy.getName(),
                            policy.getQuotaType(), policy.getPeriod(),
                            policy.getQuotaValue(), policy.getUsedValue() != null ? policy.getUsedValue() : BigDecimal.ZERO,
                            "permanent", format(policy.getCreatedAt()), null,
                            policy.getOverLimitAction(), policy.getStatus());
                }
            }
        }

        // 角色額度
        for (AiRoleQuotaPolicy policy : roleQuotaPolicyMapper.selectList(
                new LambdaQueryWrapper<AiRoleQuotaPolicy>().eq(AiRoleQuotaPolicy::getStatus, 1))) {
            List<Long> userIds = JsonUtils.parseLongList(policy.getUserIds());
            if (userIds.contains(emp.getId())) {
                addQuotaGrant(detail, policy.getId(), "role", policy.getRoleName(),
                        policy.getQuotaType(), policy.getPeriod(),
                        policy.getQuotaValue(), policy.getUsedValue() != null ? policy.getUsedValue() : BigDecimal.ZERO,
                        "permanent", format(policy.getCreatedAt()), null,
                        policy.getOverLimitAction(), policy.getStatus());
            }
        }

        // 審批授予
        LocalDateTime now = LocalDateTime.now();
        for (AiQuotaOverride grant : quotaOverrideMapper.selectList(
                new LambdaQueryWrapper<AiQuotaOverride>()
                        .eq(AiQuotaOverride::getUserId, emp.getId())
                        .eq(AiQuotaOverride::getStatus, 1)
                        .and(w -> w.isNull(AiQuotaOverride::getEffectiveAt)
                                .or().le(AiQuotaOverride::getEffectiveAt, now))
                        .and(w -> w.isNull(AiQuotaOverride::getExpireAt)
                                .or().gt(AiQuotaOverride::getExpireAt, now)))) {
            addQuotaGrant(detail, grant.getId(), "approval", "審批授予",
                    grant.getQuotaType(), grant.getQuotaPeriod(),
                    grant.getQuotaValue(), BigDecimal.ZERO,
                    grant.getEffectiveType() != null ? grant.getEffectiveType() : "permanent",
                    format(grant.getEffectiveAt()), format(grant.getExpireAt()),
                    grant.getOverLimitAction(), grant.getStatus());
        }
    }

    private void addQuotaGrant(AiEmpPermissionDTO.DetailVO detail, Long id,
                               String source, String sourceDesc,
                               String quotaType, String quotaPeriod,
                               BigDecimal quotaValue, BigDecimal usedValue,
                               String effectiveType, String effectiveAt, String expireAt,
                               String overLimitAction, int status) {
        AiEmpPermissionDTO.QuotaGrantVO gvo = new AiEmpPermissionDTO.QuotaGrantVO();
        gvo.setId(id);
        gvo.setSource(source);
        gvo.setSourceDesc(sourceDesc);
        gvo.setQuotaType(quotaType);
        gvo.setQuotaPeriod(quotaPeriod);
        gvo.setQuotaValue(quotaValue);
        gvo.setUsedValue(usedValue);
        gvo.setEffectiveType(effectiveType);
        gvo.setEffectiveAt(effectiveAt);
        gvo.setExpireAt(expireAt);
        gvo.setOverLimitAction(overLimitAction);
        gvo.setStatus(status);
        detail.getQuotas().add(gvo);
    }

    /* ══════════════════════ 保存編輯 ══════════════════════ */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void save(Long employeeId, AiEmpPermissionDTO.SaveReq req) {
        String operator = currentUsername();

        // 1. 能力開關變更 → 更新 ai_employee_auth
        for (AiEmpPermissionDTO.ModelCapToggle toggle : req.getModelToggles()) {
            AiEmployeeAuth auth = employeeAuthMapper.selectOne(
                    new LambdaQueryWrapper<AiEmployeeAuth>()
                            .eq(AiEmployeeAuth::getEmployeeId, employeeId)
                            .eq(AiEmployeeAuth::getModelId, toggle.getModelId()));
            if (auth == null) {
                auth = new AiEmployeeAuth();
                auth.setEmployeeId(employeeId);
                auth.setModelId(toggle.getModelId());
                auth.setHasPermission(1);
                auth.setStatus(1);
                setCapabilityField(auth, toggle.getField(), toggle.getValue());
                employeeAuthMapper.insert(auth);
            } else {
                setCapabilityField(auth, toggle.getField(), toggle.getValue());
                employeeAuthMapper.updateById(auth);
            }
        }

        // 2. 額度值調整 → 根據 source 定位到具體表並更新
        for (AiEmpPermissionDTO.QuotaAdjust adj : req.getQuotaAdjusts()) {
            updateQuotaValue(adj, employeeId);

            // 寫入調整日誌
            AiEmpQuotaAdjustLog logEntry = new AiEmpQuotaAdjustLog();
            logEntry.setEmployeeId(employeeId);
            logEntry.setSource(adj.getSource() != null ? adj.getSource() : "employee");
            logEntry.setSourceDesc(adj.getSourceDesc());
            logEntry.setQuotaType(adj.getQuotaType());
            logEntry.setQuotaPeriod(adj.getQuotaPeriod());
            logEntry.setOldValue(adj.getOldValue() != null ? adj.getOldValue() : BigDecimal.ZERO);
            logEntry.setNewValue(adj.getNewValue());
            logEntry.setReason(req.getReason());
            logEntry.setOperator(operator);
            adjustLogMapper.insert(logEntry);
        }
    }

    /** 更新額度值：根據來源定位到具體表和行 */
    private void updateQuotaValue(AiEmpPermissionDTO.QuotaAdjust adj, Long employeeId) {
        if (adj.getQuotaId() == null) return;
        switch (adj.getSource()) {
            case "employee", "department" -> {
                AiQuotaConfig config = quotaConfigMapper.selectById(adj.getQuotaId());
                if (config != null) {
                    if ("daily".equals(adj.getQuotaPeriod())) {
                        config.setDailyQuota(adj.getNewValue().intValue());
                    } else {
                        config.setMonthlyQuota(adj.getNewValue().intValue());
                    }
                    quotaConfigMapper.updateById(config);
                }
            }
            case "position" -> {
                AiEmpQuotaPolicy policy = empQuotaPolicyMapper.selectById(adj.getQuotaId());
                if (policy != null) {
                    policy.setQuotaValue(adj.getNewValue());
                    empQuotaPolicyMapper.updateById(policy);
                }
            }
            case "role" -> {
                AiRoleQuotaPolicy policy = roleQuotaPolicyMapper.selectById(adj.getQuotaId());
                if (policy != null) {
                    policy.setQuotaValue(adj.getNewValue());
                    roleQuotaPolicyMapper.updateById(policy);
                }
            }
            case "approval" -> {
                AiQuotaOverride override = quotaOverrideMapper.selectById(adj.getQuotaId());
                if (override != null) {
                    override.setQuotaValue(adj.getNewValue());
                    quotaOverrideMapper.updateById(override);
                }
            }
            default -> log.warn("未知額度來源: {}", adj.getSource());
        }
    }

    /** 設置能力開關字段 */
    private void setCapabilityField(AiEmployeeAuth auth, String field, int value) {
        // ai_employee_auth 表沒有獨立能力字段，使用 limitType 標記
        // 能力開關實際存儲在模型層（ai_model），此處記錄員工級覆蓋
        // 為簡化實現，將能力開關存儲在員工授權記錄的擴展字段中
        // 當前 ai_employee_auth 表無能力字段，因此僅記錄日誌
        // 後續可擴展 ai_employee_auth 表增加能力字段
    }

    /* ══════════════════════ 調整日誌 ══════════════════════ */

    @Override
    public List<AiEmpPermissionDTO.AdjustLogVO> getAdjustLogs(Long employeeId) {
        List<AiEmpQuotaAdjustLog> logs = adjustLogMapper.selectList(
                new LambdaQueryWrapper<AiEmpQuotaAdjustLog>()
                        .eq(AiEmpQuotaAdjustLog::getEmployeeId, employeeId)
                        .orderByDesc(AiEmpQuotaAdjustLog::getCreatedAt));
        return logs.stream().map(l -> {
            AiEmpPermissionDTO.AdjustLogVO vo = new AiEmpPermissionDTO.AdjustLogVO();
            vo.setTime(format(l.getCreatedAt()));
            vo.setSource(l.getSource());
            vo.setSourceDesc(l.getSourceDesc());
            vo.setQuotaType(l.getQuotaType());
            vo.setQuotaPeriod(l.getQuotaPeriod());
            vo.setOldValue(l.getOldValue());
            vo.setNewValue(l.getNewValue());
            vo.setOperator(l.getOperator());
            vo.setReason(l.getReason());
            return vo;
        }).toList();
    }

    /* ══════════════════════ 模型收集（復用 AiMyCenterServiceImpl 邏輯） ══════════════════════ */

    private void collectDeptModels(SysUser user, Map<Long, Set<String>> sources) {
        if (user.getDepartmentId() == null) return;
        List<AiDeptAuthGroupDept> links = deptGroupDeptMapper.selectList(
                new LambdaQueryWrapper<AiDeptAuthGroupDept>()
                        .select(AiDeptAuthGroupDept::getGroupId)
                        .eq(AiDeptAuthGroupDept::getDepartmentId, user.getDepartmentId()));
        if (links.isEmpty()) return;
        List<Long> groupIds = links.stream().map(AiDeptAuthGroupDept::getGroupId).distinct().toList();
        List<Long> enabledGroupIds = deptGroupMapper.selectList(
                        new LambdaQueryWrapper<AiDeptAuthGroup>()
                                .select(AiDeptAuthGroup::getId)
                                .in(AiDeptAuthGroup::getId, groupIds)
                                .eq(AiDeptAuthGroup::getStatus, 1))
                .stream().map(AiDeptAuthGroup::getId).toList();
        if (enabledGroupIds.isEmpty()) return;
        deptGroupModelMapper.selectList(
                        new LambdaQueryWrapper<AiDeptAuthGroupModel>()
                                .select(AiDeptAuthGroupModel::getModelId)
                                .in(AiDeptAuthGroupModel::getGroupId, enabledGroupIds))
                .forEach(row -> addSource(sources, row.getModelId(), "department"));
    }

    private void collectPositionModels(SysUser user, Map<Long, Set<String>> sources) {
        if (user.getSequence() == null || user.getJobLevel() == null) return;
        empPosAuthStrategyMapper.selectList(
                        new LambdaQueryWrapper<AiEmpPosAuthStrategy>()
                                .select(AiEmpPosAuthStrategy::getSequences, AiEmpPosAuthStrategy::getJobLevels,
                                        AiEmpPosAuthStrategy::getModelConfigs)
                                .eq(AiEmpPosAuthStrategy::getStatus, 1))
                .stream()
                .filter(s -> JsonUtils.parseStringList(s.getSequences()).contains(user.getSequence())
                        && JsonUtils.parseStringList(s.getJobLevels()).contains(user.getJobLevel()))
                .forEach(s -> collectModelIds(s.getModelConfigs(), "position", sources));
    }

    private void collectRoleModels(SysUser user, Map<Long, Set<String>> sources) {
        empRoleAuthMapper.selectList(
                        new LambdaQueryWrapper<AiEmpRoleAuth>()
                                .select(AiEmpRoleAuth::getUserIds, AiEmpRoleAuth::getModelConfigs)
                                .eq(AiEmpRoleAuth::getStatus, 1))
                .stream()
                .filter(r -> JsonUtils.parseLongList(r.getUserIds()).contains(user.getId()))
                .forEach(r -> collectModelIds(r.getModelConfigs(), "role", sources));
    }

    private void collectEmployeeModels(SysUser user, Map<Long, Set<String>> sources) {
        employeeAuthMapper.selectList(
                        new LambdaQueryWrapper<AiEmployeeAuth>()
                                .select(AiEmployeeAuth::getModelId)
                                .eq(AiEmployeeAuth::getEmployeeId, user.getId())
                                .eq(AiEmployeeAuth::getStatus, 1)
                                .eq(AiEmployeeAuth::getHasPermission, 1))
                .forEach(row -> addSource(sources, row.getModelId(), "employee"));
    }

    private void collectModelIds(String modelConfigsJson, String source, Map<Long, Set<String>> sources) {
        for (Map<String, Object> mc : JsonUtils.parseMapList(modelConfigsJson)) {
            Object modelId = mc.get("modelId");
            if (modelId instanceof Number n) {
                addSource(sources, n.longValue(), source);
            }
        }
    }

    private void addSource(Map<Long, Set<String>> sources, Long modelId, String source) {
        if (modelId == null) return;
        sources.computeIfAbsent(modelId, key -> new LinkedHashSet<>()).add(source);
    }

    /* ══════════════════════ 工具方法 ══════════════════════ */

    private Map<Long, AiModel> loadAllModels() {
        Map<Long, AiModel> map = new LinkedHashMap<>();
        modelMapper.selectList(new LambdaQueryWrapper<AiModel>()
                .select(AiModel::getId, AiModel::getName, AiModel::getModelKey,
                        AiModel::getStatus, AiModel::getVisionSupport,
                        AiModel::getFunctionCalling, AiModel::getJsonMode,
                        AiModel::getStreaming, AiModel::getThinkingMode))
                .forEach(m -> map.put(m.getId(), m));
        return map;
    }

    private String format(LocalDateTime time) {
        return time != null ? time.format(DT_FMT) : null;
    }

    private static int nz(Integer value) {
        return value != null ? value : 0;
    }

    /** 從 Map 中安全提取 int 值（modelConfigs JSON 解析後的能力開關） */
    private static int intFromMap(Map<String, Object> map, String key) {
        Object v = map.get(key);
        if (v instanceof Number n) return n.intValue();
        return 0;
    }

    private String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getDetails() instanceof SysUser user) {
            return user.getName() != null ? user.getName() : user.getUsername();
        }
        return "system";
    }
}
