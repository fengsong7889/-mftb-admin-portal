package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.BuiltinAccounts;
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
 * 员工AI权额管理服务实现
 *
 * 管理员视角聚合四维度（部门/职位/角色/员工）数据，
 * 复用 AiMyCenterServiceImpl 的聚合逻辑但支持查询任意员工。
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

        // 1. 查询全部启用员工（排除内置系统管理员：它不是员工，不参与 AI 额度授予与用量统计）
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getStatus, 1)
                .ne(SysUser::getUsername, BuiltinAccounts.ADMIN_USERNAME);
        if (queryName != null && !queryName.isBlank()) {
            String name = queryName.trim();
            wrapper.and(w -> w.like(SysUser::getName, name).or().like(SysUser::getEmpId, name));
        }
        if (queryDept != null && !queryDept.isBlank()) {
            wrapper.like(SysUser::getDepartment, queryDept.trim());
        }
        List<SysUser> employees = sysUserMapper.selectList(wrapper);

        // 2. 批量加载模型（避免 N+1）
        Map<Long, AiModel> allModels = loadAllModels();

        // 3. 一次性预加载四维授权/额度/用量数据。
        //    旧实现把这几张小策略表按「每个员工整表重扫一遍」（约 13+ 次查询/人），
        //    在远端共享库上 25 人就放大成 300+ 次网络往返（实测 ~11.7s，逼近前端 15s 超时）。
        AuthContext ctx = loadAuthContext();

        // 4. 逐员工聚合（纯内存匹配，不再查库）
        List<AiEmpPermissionDTO.SummaryVO> result = new ArrayList<>();
        for (SysUser emp : employees) {
            AiEmpPermissionDTO.SummaryVO vo = buildSummary(emp, allModels, ctx);

            // 过滤：最后更新人
            if (queryUpdatedBy != null && !queryUpdatedBy.isBlank()) {
                if (vo.getLastUpdatedBy() == null || !vo.getLastUpdatedBy().contains(queryUpdatedBy.trim())) {
                    continue;
                }
            }
            // 过滤：最后更新时间
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

    private AiEmpPermissionDTO.SummaryVO buildSummary(SysUser emp, Map<Long, AiModel> allModels, AuthContext ctx) {
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
        collectDeptModels(emp, modelSources, ctx);
        collectPositionModels(emp, modelSources, ctx);
        collectRoleModels(emp, modelSources, ctx);
        collectEmployeeModels(emp, modelSources, ctx);

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

        // 收集额度
        collectQuotaBriefs(emp, vo, ctx);

        // 最后更新信息：从四维度配置表取 MAX(updated_at)
        fillLastUpdated(emp, vo, ctx);

        return vo;
    }

    /** 收集额度简要（列表用）——数据全部来自 ctx，匹配口径与旧逐员工查询逐条等价 */
    private void collectQuotaBriefs(SysUser emp, AiEmpPermissionDTO.SummaryVO vo, AuthContext ctx) {
        // 员工/部门额度（ai_quota_config）：保持表序，等价于旧的一条 OR 查询
        for (AiQuotaConfig config : ctx.quotaConfigs) {
            boolean isEmployee = "employee".equals(config.getQuotaType());
            boolean isDepartment = "department".equals(config.getQuotaType());
            if (!isEmployee && !isDepartment) continue;
            if (isEmployee && !emp.getId().equals(config.getTargetId())) continue;
            if (isDepartment
                    && (emp.getDepartmentId() == null || !emp.getDepartmentId().equals(config.getTargetId()))) continue;

            String source = isEmployee ? "employee" : "department";
            String sourceName = isEmployee ? "員工專屬" : (emp.getDepartment() != null ? emp.getDepartment() : "部門額度");
            if (config.getDailyQuota() != null && config.getDailyQuota() > 0) {
                addQuotaBrief(vo, source, sourceName, "token", "daily",
                        BigDecimal.valueOf(config.getDailyQuota()), ctx.tokensOf(emp.getUsername(), "daily"), 1);
            }
            if (config.getMonthlyQuota() != null && config.getMonthlyQuota() > 0) {
                addQuotaBrief(vo, source, sourceName, "token", "monthly",
                        BigDecimal.valueOf(config.getMonthlyQuota()), ctx.tokensOf(emp.getUsername(), "monthly"), 1);
            }
        }

        // 职位额度（ai_emp_quota_policy）
        if (emp.getSequence() != null && emp.getJobLevel() != null) {
            for (AiEmpQuotaPolicy policy : ctx.empQuotaPolicies) {
                List<String> seqs = JsonUtils.parseStringList(policy.getSequences());
                List<String> levels = JsonUtils.parseStringList(policy.getJobLevels());
                if (seqs.contains(emp.getSequence()) && levels.contains(emp.getJobLevel())) {
                    addQuotaBrief(vo, "position", policy.getName(), policy.getQuotaType(), policy.getPeriod(),
                            policy.getQuotaValue(), policy.getUsedValue() != null ? policy.getUsedValue() : BigDecimal.ZERO, 1);
                }
            }
        }

        // 角色额度（ai_role_quota_policy）
        for (AiRoleQuotaPolicy policy : ctx.roleQuotaPolicies) {
            List<Long> userIds = JsonUtils.parseLongList(policy.getUserIds());
            if (userIds.contains(emp.getId())) {
                addQuotaBrief(vo, "role", policy.getRoleName(), policy.getQuotaType(), policy.getPeriod(),
                        policy.getQuotaValue(), policy.getUsedValue() != null ? policy.getUsedValue() : BigDecimal.ZERO, 1);
            }
        }

        // 审批授予额度（ai_quota_override，生效窗口已在预加载时筛过）
        for (AiQuotaOverride grant : ctx.overridesByUser.getOrDefault(emp.getId(), List.of())) {
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

    /**
     * 简化用量计算：从 biz_llm_usage 按员工账号聚合。
     *
     * <p>仅详情页使用：详情是单员工，最多两次查询，开销有界；
     * 列表路径已改走 {@link AuthContext#tokensOf}，不得再回到逐员工查询。</p>
     */
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

    /** 填充最后更新信息：从四维度配置表取 MAX(updated_at) 及对应 updated_by（均读 ctx） */
    private void fillLastUpdated(SysUser emp, AiEmpPermissionDTO.SummaryVO vo, AuthContext ctx) {
        String latestBy = null;
        String latestAt = null;

        // 部门策略组（注意：这里与模型收集不同，旧实现不筛 status，保持原样）
        for (Long groupId : ctx.deptGroupIdsByDept.getOrDefault(emp.getDepartmentId(), Set.of())) {
            AiDeptAuthGroup g = ctx.deptGroupById.get(groupId);
            if (g == null) continue;
            String ts = format(g.getUpdatedAt());
            if (ts != null && (latestAt == null || ts.compareTo(latestAt) > 0)) {
                latestAt = ts;
                latestBy = g.getUpdatedBy();
            }
        }

        // 职位策略
        for (AiEmpPosAuthStrategy s : ctx.posAuthStrategies) {
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

        // 角色授权
        for (AiEmpRoleAuth r : ctx.roleAuths) {
            List<Long> userIds = JsonUtils.parseLongList(r.getUserIds());
            if (userIds.contains(emp.getId())) {
                String ts = format(r.getUpdatedAt());
                if (ts != null && (latestAt == null || ts.compareTo(latestAt) > 0)) {
                    latestAt = ts;
                    latestBy = r.getUpdatedBy();
                }
            }
        }

        // 员工个人授权（旧实现不筛 status，且操作人一律记为 system）
        for (AiEmployeeAuth a : ctx.employeeAuthById.getOrDefault(emp.getId(), List.of())) {
            String ts = format(a.getUpdatedAt());
            if (ts != null && (latestAt == null || ts.compareTo(latestAt) > 0)) {
                latestAt = ts;
                latestBy = "system";
            }
        }

        vo.setLastUpdatedBy(latestBy != null ? latestBy : "system");
        vo.setLastUpdatedAt(latestAt != null ? latestAt : format(emp.getUpdatedAt()));
    }

    /* ══════════════════════ 详情 ══════════════════════ */

    @Override
    public AiEmpPermissionDTO.DetailVO getDetail(Long employeeId) {
        SysUser emp = sysUserMapper.selectById(employeeId);
        if (emp == null) {
            return null;
        }

        AiEmpPermissionDTO.DetailVO detail = new AiEmpPermissionDTO.DetailVO();
        Map<Long, AiModel> allModels = loadAllModels();
        AuthContext ctx = loadAuthContext();

        // 基本信息（与列表同一套聚合口径，保证两页数字一致）
        detail.setBasic(buildSummary(emp, allModels, ctx));

        // 模型权限明细（含能力开关）
        collectModelPermissions(emp, detail, allModels);

        // 额度明细
        collectQuotaGrants(emp, detail);

        return detail;
    }

    /** 收集模型权限明细（四维度，含能力开关 + 来源） */
    private void collectModelPermissions(SysUser emp, AiEmpPermissionDTO.DetailVO detail, Map<Long, AiModel> allModels) {
        // 部门维度
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

        // 职位维度
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

        // 角色维度
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

        // 员工维度
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

    /** 收集额度明细（详情页用） */
    private void collectQuotaGrants(SysUser emp, AiEmpPermissionDTO.DetailVO detail) {
        // 员工/部门额度
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

        // 职位额度
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

        // 角色额度
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

        // 审批授予
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

    /* ══════════════════════ 保存编辑 ══════════════════════ */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void save(Long employeeId, AiEmpPermissionDTO.SaveReq req) {
        String operator = currentUsername();

        // 1. 能力开关变更 → 更新 ai_employee_auth
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

        // 2. 额度值调整 → 根据 source 定位到具体表并更新
        for (AiEmpPermissionDTO.QuotaAdjust adj : req.getQuotaAdjusts()) {
            updateQuotaValue(adj, employeeId);

            // 写入调整日志
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

    /** 更新额度值：根据来源定位到具体表和行 */
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
                    // 详情页直接调整额度也属于「改额度」，同步刷新最后更新人
                    config.setUpdatedBy(currentUsername());
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

    /** 设置能力开关字段 */
    private void setCapabilityField(AiEmployeeAuth auth, String field, int value) {
        // ai_employee_auth 表没有独立能力字段，使用 limitType 标记
        // 能力开关实际存储在模型层（ai_model），此处记录员工级覆盖
        // 为简化实现，将能力开关存储在员工授权记录的扩展字段中
        // 当前 ai_employee_auth 表无能力字段，因此仅记录日志
        // 后续可扩展 ai_employee_auth 表增加能力字段
    }

    /* ══════════════════════ 调整日志 ══════════════════════ */

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

    /* ══════════════════════ 模型收集（复用 AiMyCenterServiceImpl 逻辑） ══════════════════════ */

    /** 部门维度：策略组关联与组内模型清单取自 ctx，匹配口径与旧逐员工查询一致（组需 status=1） */
    private void collectDeptModels(SysUser user, Map<Long, Set<String>> sources, AuthContext ctx) {
        if (user.getDepartmentId() == null) return;
        for (Long groupId : ctx.deptGroupIdsByDept.getOrDefault(user.getDepartmentId(), Set.of())) {
            AiDeptAuthGroup group = ctx.deptGroupById.get(groupId);
            if (group == null || group.getStatus() == null || group.getStatus() != 1) continue;
            ctx.groupModelIds.getOrDefault(groupId, List.of())
                    .forEach(modelId -> addSource(sources, modelId, "department"));
        }
    }

    /** 职位维度：按 (sequence, jobLevel) 命中已启用策略；策略表已在 ctx 里按 status=1 预筛 */
    private void collectPositionModels(SysUser user, Map<Long, Set<String>> sources, AuthContext ctx) {
        if (user.getSequence() == null || user.getJobLevel() == null) return;
        for (AiEmpPosAuthStrategy s : ctx.posAuthStrategies) {
            if (JsonUtils.parseStringList(s.getSequences()).contains(user.getSequence())
                    && JsonUtils.parseStringList(s.getJobLevels()).contains(user.getJobLevel())) {
                collectModelIds(s.getModelConfigs(), "position", sources);
            }
        }
    }

    /** 角色维度：userIds JSON 包含该员工即命中（无部门/职位前置条件，与旧实现一致） */
    private void collectRoleModels(SysUser user, Map<Long, Set<String>> sources, AuthContext ctx) {
        for (AiEmpRoleAuth r : ctx.roleAuths) {
            if (JsonUtils.parseLongList(r.getUserIds()).contains(user.getId())) {
                collectModelIds(r.getModelConfigs(), "role", sources);
            }
        }
    }

    /** 员工个人维度：只认 status=1 且 hasPermission=1 的显式授权行 */
    private void collectEmployeeModels(SysUser user, Map<Long, Set<String>> sources, AuthContext ctx) {
        for (AiEmployeeAuth a : ctx.employeeAuthById.getOrDefault(user.getId(), List.of())) {
            if (isGranted(a)) {
                addSource(sources, a.getModelId(), "employee");
            }
        }
    }

    /** 员工个人授权行是否构成有效授权（等价于旧 SQL 的 eq(status,1).eq(hasPermission,1)） */
    private static boolean isGranted(AiEmployeeAuth a) {
        return a.getStatus() != null && a.getStatus() == 1
                && a.getHasPermission() != null && a.getHasPermission() == 1;
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

    /* ══════════════════════ 列表预加载上下文 ══════════════════════ */

    /**
     * 列表/详情聚合共用的一次性预加载上下文。
     *
     * <p>只负责「把小策略表整表读一次 + 按关联键分组」，不改变任何匹配口径；
     * 具体命中判断仍由各 collect* 方法在内存里完成，以便与旧逐员工查询逐条对账。</p>
     */
    private static final class AuthContext {
        /** departmentId -> 关联的策略组 id（已去重） */
        final Map<Long, Set<Long>> deptGroupIdsByDept = new HashMap<>();
        /** 策略组 id -> 组本身（含 status / updatedAt / updatedBy，不预筛，由调用方按需筛） */
        final Map<Long, AiDeptAuthGroup> deptGroupById = new HashMap<>();
        /** 策略组 id -> 组内模型 id */
        final Map<Long, List<Long>> groupModelIds = new HashMap<>();
        /** 已启用的职位授权策略 */
        List<AiEmpPosAuthStrategy> posAuthStrategies = List.of();
        /** 已启用的角色授权 */
        List<AiEmpRoleAuth> roleAuths = List.of();
        /** employeeId -> 该员工全部个人授权行（不筛 status，供 lastUpdated 使用） */
        final Map<Long, List<AiEmployeeAuth>> employeeAuthById = new HashMap<>();
        /** 已启用的员工/部门额度配置（保持表序） */
        List<AiQuotaConfig> quotaConfigs = List.of();
        List<AiEmpQuotaPolicy> empQuotaPolicies = List.of();
        List<AiRoleQuotaPolicy> roleQuotaPolicies = List.of();
        /** userId -> 当前生效的审批授予额度 */
        final Map<Long, List<AiQuotaOverride>> overridesByUser = new HashMap<>();
        /** username -> {当日 tokens, 当月 tokens} */
        final Map<String, long[]> tokensByUser = new HashMap<>();

        /** 与旧 computeUsed 同口径：prompt + completion 求和，无记录时返回 0 */
        BigDecimal tokensOf(String username, String period) {
            long[] tokens = tokensByUser.get(username);
            if (tokens == null) return BigDecimal.ZERO;
            return BigDecimal.valueOf("daily".equals(period) ? tokens[0] : tokens[1]);
        }
    }

    /**
     * 一次性加载聚合所需的全部策略表：查询次数从「13+ × 员工数」固定为 11 次。
     *
     * <p>这些都是管理后台维护的小表（个位至几十行），全量读一次的代价远低于
     * 在远端共享库上按员工循环往返；用量表只取当月窗口且只选 4 列。</p>
     */
    private AuthContext loadAuthContext() {
        AuthContext ctx = new AuthContext();
        LocalDateTime now = LocalDateTime.now();

        // 部门策略组：关联表 / 组本身 / 组内模型（原本每员工 3 次查询）
        deptGroupDeptMapper.selectList(new LambdaQueryWrapper<AiDeptAuthGroupDept>()
                        .select(AiDeptAuthGroupDept::getDepartmentId, AiDeptAuthGroupDept::getGroupId))
                .forEach(link -> ctx.deptGroupIdsByDept
                        .computeIfAbsent(link.getDepartmentId(), k -> new LinkedHashSet<>())
                        .add(link.getGroupId()));
        deptGroupMapper.selectList(new LambdaQueryWrapper<AiDeptAuthGroup>()
                        .select(AiDeptAuthGroup::getId, AiDeptAuthGroup::getStatus,
                                AiDeptAuthGroup::getUpdatedAt, AiDeptAuthGroup::getUpdatedBy))
                .forEach(group -> ctx.deptGroupById.put(group.getId(), group));
        deptGroupModelMapper.selectList(new LambdaQueryWrapper<AiDeptAuthGroupModel>()
                        .select(AiDeptAuthGroupModel::getGroupId, AiDeptAuthGroupModel::getModelId))
                .forEach(row -> ctx.groupModelIds
                        .computeIfAbsent(row.getGroupId(), k -> new ArrayList<>())
                        .add(row.getModelId()));

        // 职位/角色授权策略（列表只关心已启用行）
        ctx.posAuthStrategies = empPosAuthStrategyMapper.selectList(
                new LambdaQueryWrapper<AiEmpPosAuthStrategy>()
                        .select(AiEmpPosAuthStrategy::getSequences, AiEmpPosAuthStrategy::getJobLevels,
                                AiEmpPosAuthStrategy::getModelConfigs,
                                AiEmpPosAuthStrategy::getUpdatedAt, AiEmpPosAuthStrategy::getUpdatedBy)
                        .eq(AiEmpPosAuthStrategy::getStatus, 1));
        ctx.roleAuths = empRoleAuthMapper.selectList(
                new LambdaQueryWrapper<AiEmpRoleAuth>()
                        .select(AiEmpRoleAuth::getUserIds, AiEmpRoleAuth::getModelConfigs,
                                AiEmpRoleAuth::getUpdatedAt, AiEmpRoleAuth::getUpdatedBy)
                        .eq(AiEmpRoleAuth::getStatus, 1));

        // 员工个人授权：全量取回后内存分组（lastUpdated 需要未筛 status 的行）
        employeeAuthMapper.selectList(new LambdaQueryWrapper<AiEmployeeAuth>()
                        .select(AiEmployeeAuth::getEmployeeId, AiEmployeeAuth::getModelId,
                                AiEmployeeAuth::getStatus, AiEmployeeAuth::getHasPermission,
                                AiEmployeeAuth::getUpdatedAt))
                .forEach(row -> ctx.employeeAuthById
                        .computeIfAbsent(row.getEmployeeId(), k -> new ArrayList<>())
                        .add(row));

        // 额度：员工/部门额度配置 + 职位/角色额度策略 + 审批授予
        ctx.quotaConfigs = quotaConfigMapper.selectList(
                new LambdaQueryWrapper<AiQuotaConfig>()
                        .select(AiQuotaConfig::getQuotaType, AiQuotaConfig::getTargetId,
                                AiQuotaConfig::getDailyQuota, AiQuotaConfig::getMonthlyQuota)
                        .eq(AiQuotaConfig::getStatus, 1));
        ctx.empQuotaPolicies = empQuotaPolicyMapper.selectList(
                new LambdaQueryWrapper<AiEmpQuotaPolicy>()
                        .select(AiEmpQuotaPolicy::getSequences, AiEmpQuotaPolicy::getJobLevels,
                                AiEmpQuotaPolicy::getName, AiEmpQuotaPolicy::getQuotaType,
                                AiEmpQuotaPolicy::getPeriod, AiEmpQuotaPolicy::getQuotaValue,
                                AiEmpQuotaPolicy::getUsedValue)
                        .eq(AiEmpQuotaPolicy::getStatus, 1));
        ctx.roleQuotaPolicies = roleQuotaPolicyMapper.selectList(
                new LambdaQueryWrapper<AiRoleQuotaPolicy>()
                        .select(AiRoleQuotaPolicy::getUserIds, AiRoleQuotaPolicy::getRoleName,
                                AiRoleQuotaPolicy::getQuotaType, AiRoleQuotaPolicy::getPeriod,
                                AiRoleQuotaPolicy::getQuotaValue, AiRoleQuotaPolicy::getUsedValue)
                        .eq(AiRoleQuotaPolicy::getStatus, 1));
        quotaOverrideMapper.selectList(
                new LambdaQueryWrapper<AiQuotaOverride>()
                        .select(AiQuotaOverride::getUserId, AiQuotaOverride::getQuotaType,
                                AiQuotaOverride::getQuotaPeriod, AiQuotaOverride::getQuotaValue)
                        .eq(AiQuotaOverride::getStatus, 1)
                        .and(w -> w.isNull(AiQuotaOverride::getEffectiveAt)
                                .or().le(AiQuotaOverride::getEffectiveAt, now))
                        .and(w -> w.isNull(AiQuotaOverride::getExpireAt)
                                .or().gt(AiQuotaOverride::getExpireAt, now)))
                .forEach(row -> ctx.overridesByUser
                        .computeIfAbsent(row.getUserId(), k -> new ArrayList<>())
                        .add(row));

        // 用量：整月窗口一次查出，日窗口在内存里再切（月起始日必然不晚于今日）
        LocalDate today = LocalDate.now();
        LocalDateTime dayStart = today.atStartOfDay();
        llmUsageMapper.selectList(new LambdaQueryWrapper<LlmUsage>()
                        .select(LlmUsage::getUsername, LlmUsage::getPromptTokens,
                                LlmUsage::getCompletionTokens, LlmUsage::getCreatedAt)
                        .ge(LlmUsage::getCreatedAt, today.withDayOfMonth(1).atStartOfDay()))
                .forEach(row -> {
                    long sum = (long) nz(row.getPromptTokens()) + nz(row.getCompletionTokens());
                    long[] acc = ctx.tokensByUser.computeIfAbsent(row.getUsername(), k -> new long[2]);
                    acc[1] += sum;
                    if (row.getCreatedAt() != null && !row.getCreatedAt().isBefore(dayStart)) {
                        acc[0] += sum;
                    }
                });
        return ctx;
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

    /** 从 Map 中安全提取 int 值（modelConfigs JSON 解析后的能力开关） */
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
