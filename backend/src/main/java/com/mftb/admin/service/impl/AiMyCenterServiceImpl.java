package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.dto.AiMyCenterDTO;
import com.mftb.admin.entity.AiDeptAuthGroup;
import com.mftb.admin.entity.AiDeptAuthGroupDept;
import com.mftb.admin.entity.AiDeptAuthGroupModel;
import com.mftb.admin.entity.AiEmpPosAuthStrategy;
import com.mftb.admin.entity.AiEmpQuotaPolicy;
import com.mftb.admin.entity.AiEmpRoleAuth;
import com.mftb.admin.entity.AiEmployeeAuth;
import com.mftb.admin.entity.AiModel;
import com.mftb.admin.entity.AiPositionModelMapping;
import com.mftb.admin.entity.AiProvider;
import com.mftb.admin.entity.AiQuotaConfig;
import com.mftb.admin.entity.AiRoleModelMapping;
import com.mftb.admin.entity.AiRoleQuotaPolicy;
import com.mftb.admin.entity.LlmUsage;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiDeptAuthGroupDeptMapper;
import com.mftb.admin.mapper.AiDeptAuthGroupMapper;
import com.mftb.admin.mapper.AiDeptAuthGroupModelMapper;
import com.mftb.admin.mapper.AiEmpPosAuthStrategyMapper;
import com.mftb.admin.mapper.AiEmpQuotaPolicyMapper;
import com.mftb.admin.mapper.AiEmpRoleAuthMapper;
import com.mftb.admin.mapper.AiEmployeeAuthMapper;
import com.mftb.admin.mapper.AiModelMapper;
import com.mftb.admin.mapper.AiPositionModelMapper;
import com.mftb.admin.mapper.AiProviderMapper;
import com.mftb.admin.mapper.AiQuotaConfigMapper;
import com.mftb.admin.mapper.AiRoleModelMapper;
import com.mftb.admin.mapper.AiRoleQuotaPolicyMapper;
import com.mftb.admin.mapper.LlmUsageMapper;
import com.mftb.admin.service.AiMyCenterService;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 智能中心「我的」视图服务实现
 *
 * 我的用量：汇总当前账号在四个维度（员工/部门/职位/角色）生效的额度配置，
 * 已用量统一按 biz_llm_usage 请求明细实时聚合（与能耗统计同源），避免配置表冗余字段失真；
 * 我的授权模型：部门策略组、职位映射、角色映射、员工覆盖四个维度取并集，仅返回启用模型。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiMyCenterServiceImpl implements AiMyCenterService {

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ISO_LOCAL_DATE;

    /** 部门/员工额度配置表无软阈值字段，沿用全局默认 80% */
    private static final int DEFAULT_SOFT_THRESHOLD = 80;

    /** 最近使用记录条数 */
    private static final int RECENT_RECORD_LIMIT = 8;

    private final AiQuotaConfigMapper quotaConfigMapper;
    private final AiEmpQuotaPolicyMapper empQuotaPolicyMapper;
    private final AiRoleQuotaPolicyMapper roleQuotaPolicyMapper;
    private final LlmUsageMapper llmUsageMapper;
    private final AiModelMapper modelMapper;
    private final AiProviderMapper providerMapper;
    private final AiDeptAuthGroupMapper deptGroupMapper;
    private final AiDeptAuthGroupDeptMapper deptGroupDeptMapper;
    private final AiDeptAuthGroupModelMapper deptGroupModelMapper;
    private final AiPositionModelMapper positionModelMapper;
    private final AiRoleModelMapper roleModelMapper;
    private final AiEmployeeAuthMapper employeeAuthMapper;
    /** 员工模型权控（96_emp_pos_role_auth）：职位授权策略 + 自定义角色授权 */
    private final AiEmpPosAuthStrategyMapper empPosAuthStrategyMapper;
    private final AiEmpRoleAuthMapper empRoleAuthMapper;

    /** 额度维度内部载体：配置信息 + 本期统计窗口 */
    private record Dim(String source, String sourceName, Long modelId, String period, String quotaType,
                       BigDecimal quotaValue, String currency, Integer softThreshold,
                       LocalDateTime windowStart, LocalDate resetDate) {
    }

    /* ══════════════════════ 我的用量 ══════════════════════ */

    @Override
    public AiMyCenterDTO.MyQuotaUsageVO myQuotaUsage() {
        SysUser user = currentUser();
        if (user == null) {
            return null;
        }

        AiMyCenterDTO.MyQuotaUsageVO vo = new AiMyCenterDTO.MyQuotaUsageVO();
        vo.setUsername(user.getUsername());
        vo.setName(user.getName());
        vo.setEmpId(user.getEmpId());

        List<Dim> dims = new ArrayList<>();
        dims.addAll(collectConfigDimensions(user));
        dims.addAll(collectPositionDimensions(user));
        dims.addAll(collectRoleDimensions(user));

        // 模型限制展示与用量过滤需要 modelKey，批量加载维度引用的模型
        Map<Long, AiModel> modelMap = loadModels(dims.stream().map(Dim::modelId).toList());

        // 用量明细一次性取回（起点 = 各维度窗口/自然月的最早者），内存聚合
        LocalDate today = LocalDate.now();
        LocalDateTime earliest = today.withDayOfMonth(1).atStartOfDay();
        for (Dim dim : dims) {
            if (dim.windowStart().isBefore(earliest)) {
                earliest = dim.windowStart();
            }
        }
        List<LlmUsage> rows = llmUsageMapper.selectList(
                new LambdaQueryWrapper<LlmUsage>()
                        .eq(LlmUsage::getUsername, user.getUsername())
                        .ge(LlmUsage::getCreatedAt, earliest));

        for (Dim dim : dims) {
            AiModel model = dim.modelId() != null ? modelMap.get(dim.modelId()) : null;
            String modelKey = model != null ? model.getModelKey() : null;
            BigDecimal used = aggregateUsed(rows, dim, modelKey);

            AiMyCenterDTO.QuotaDimensionVO dvo = new AiMyCenterDTO.QuotaDimensionVO();
            dvo.setSource(dim.source());
            dvo.setSourceName(dim.sourceName());
            dvo.setModelId(dim.modelId());
            dvo.setModelKey(modelKey);
            dvo.setModelName(model != null ? model.getName() : null);
            dvo.setPeriod(dim.period());
            dvo.setQuotaType(dim.quotaType());
            dvo.setQuotaValue(dim.quotaValue());
            dvo.setCurrency(dim.currency());
            dvo.setUsedValue(used);
            dvo.setSoftThreshold(dim.softThreshold());
            dvo.setResetDate(dim.resetDate().format(DATE_FMT));
            vo.getDimensions().add(dvo);
        }

        fillUsageSummary(vo.getUsage(), rows, today);
        fillRecentRecords(vo, user.getUsername());
        return vo;
    }

    /** 员工/部门额度配置（ai_quota_config，token 口径，日/月双限额拆成两个维度） */
    private List<Dim> collectConfigDimensions(SysUser user) {
        LambdaQueryWrapper<AiQuotaConfig> wrapper = new LambdaQueryWrapper<AiQuotaConfig>()
                .eq(AiQuotaConfig::getStatus, 1)
                .and(w -> {
                    w.nested(n -> n.eq(AiQuotaConfig::getQuotaType, "employee")
                            .eq(AiQuotaConfig::getTargetId, user.getId()));
                    if (user.getDepartmentId() != null) {
                        w.or(n -> n.eq(AiQuotaConfig::getQuotaType, "department")
                                .eq(AiQuotaConfig::getTargetId, user.getDepartmentId()));
                    }
                });
        List<AiQuotaConfig> configs = quotaConfigMapper.selectList(wrapper);

        LocalDate today = LocalDate.now();
        List<Dim> dims = new ArrayList<>();
        for (AiQuotaConfig config : configs) {
            boolean employee = "employee".equals(config.getQuotaType());
            String source = employee ? "employee" : "department";
            String sourceName = employee ? "員工專屬" : (user.getDepartment() != null ? user.getDepartment() : "部門額度");
            int resetDay = config.getResetDayOfMonth() != null ? config.getResetDayOfMonth() : 1;
            if (config.getDailyQuota() != null && config.getDailyQuota() > 0) {
                dims.add(new Dim(source, sourceName, config.getModelId(), "daily", "token",
                        BigDecimal.valueOf(config.getDailyQuota()), null, DEFAULT_SOFT_THRESHOLD,
                        today.atStartOfDay(), today.plusDays(1)));
            }
            if (config.getMonthlyQuota() != null && config.getMonthlyQuota() > 0) {
                dims.add(new Dim(source, sourceName, config.getModelId(), "monthly", "token",
                        BigDecimal.valueOf(config.getMonthlyQuota()), null, DEFAULT_SOFT_THRESHOLD,
                        periodStart(today, resetDay).atStartOfDay(), nextResetDate(today, resetDay)));
            }
        }
        return dims;
    }

    /** 职位额度策略（ai_emp_quota_policy，按职级序列 + 职级匹配当前账号） */
    private List<Dim> collectPositionDimensions(SysUser user) {
        if (user.getSequence() == null || user.getJobLevel() == null) {
            return List.of();
        }
        List<AiEmpQuotaPolicy> policies = empQuotaPolicyMapper.selectList(
                new LambdaQueryWrapper<AiEmpQuotaPolicy>().eq(AiEmpQuotaPolicy::getStatus, 1));
        List<Dim> dims = new ArrayList<>();
        for (AiEmpQuotaPolicy policy : policies) {
            List<String> sequences = JsonUtils.parseStringList(policy.getSequences());
            List<String> jobLevels = JsonUtils.parseStringList(policy.getJobLevels());
            if (!sequences.contains(user.getSequence()) || !jobLevels.contains(user.getJobLevel())) {
                continue;
            }
            dims.add(toPolicyDim("position", policy.getName(), policy.getPeriod(), policy.getQuotaType(),
                    policy.getQuotaValue(), policy.getCurrency(), policy.getSoftThreshold()));
        }
        return dims;
    }

    /** 角色额度策略（ai_role_quota_policy，按绑定员工 ID 匹配当前账号） */
    private List<Dim> collectRoleDimensions(SysUser user) {
        List<AiRoleQuotaPolicy> policies = roleQuotaPolicyMapper.selectList(
                new LambdaQueryWrapper<AiRoleQuotaPolicy>().eq(AiRoleQuotaPolicy::getStatus, 1));
        List<Dim> dims = new ArrayList<>();
        for (AiRoleQuotaPolicy policy : policies) {
            if (!JsonUtils.parseLongList(policy.getUserIds()).contains(user.getId())) {
                continue;
            }
            dims.add(toPolicyDim("role", policy.getRoleName(), policy.getPeriod(), policy.getQuotaType(),
                    policy.getQuotaValue(), policy.getCurrency(), policy.getSoftThreshold()));
        }
        return dims;
    }

    /** 策略类维度（职位/角色）转内部载体：周期窗口按自然月/自然日 */
    private Dim toPolicyDim(String source, String sourceName, String period, String quotaType,
                            BigDecimal quotaValue, String currency, Integer softThreshold) {
        LocalDate today = LocalDate.now();
        boolean daily = "daily".equals(period);
        int resetDay = 1;
        return new Dim(source, sourceName, null, daily ? "daily" : "monthly", quotaType,
                quotaValue, currency, softThreshold != null ? softThreshold : DEFAULT_SOFT_THRESHOLD,
                daily ? today.atStartOfDay() : periodStart(today, resetDay).atStartOfDay(),
                daily ? today.plusDays(1) : nextResetDate(today, resetDay));
    }

    /** 按维度口径聚合本期已用：token=输入+输出、request=请求次数、cost=指定币种费用合计 */
    private BigDecimal aggregateUsed(List<LlmUsage> rows, Dim dim, String modelKey) {
        Predicate<LlmUsage> inWindow = row -> row.getCreatedAt() != null
                && !row.getCreatedAt().isBefore(dim.windowStart());
        Predicate<LlmUsage> inModel = row -> modelKey == null || modelKey.equals(row.getModel());

        switch (dim.quotaType()) {
            case "request":
                return BigDecimal.valueOf(rows.stream().filter(inWindow.and(inModel)).count());
            case "cost":
                BigDecimal cost = rows.stream()
                        .filter(inWindow.and(inModel))
                        .filter(row -> dim.currency() != null && dim.currency().equals(row.getCurrency()))
                        .map(row -> row.getCost() != null ? row.getCost() : BigDecimal.ZERO)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                return cost.setScale(4, RoundingMode.HALF_UP);
            default:
                long tokens = rows.stream()
                        .filter(inWindow.and(inModel))
                        .mapToLong(row -> nz(row.getPromptTokens()) + nz(row.getCompletionTokens()))
                        .sum();
                return BigDecimal.valueOf(tokens);
        }
    }

    /** 整体用量概览：今日/本月的 tokens、请求次数与分币种费用 */
    private void fillUsageSummary(AiMyCenterDTO.UsageSummaryVO usage, List<LlmUsage> rows, LocalDate today) {
        LocalDateTime dayStart = today.atStartOfDay();
        LocalDateTime monthStart = today.withDayOfMonth(1).atStartOfDay();
        Map<String, BigDecimal> todayCosts = new LinkedHashMap<>();
        Map<String, BigDecimal> monthCosts = new LinkedHashMap<>();

        for (LlmUsage row : rows) {
            if (row.getCreatedAt() == null) {
                continue;
            }
            long tokens = nz(row.getPromptTokens()) + nz(row.getCompletionTokens());
            boolean inMonth = !row.getCreatedAt().isBefore(monthStart);
            boolean inDay = !row.getCreatedAt().isBefore(dayStart);
            if (inMonth) {
                usage.setMonthTokens(usage.getMonthTokens() + tokens);
                usage.setMonthRequests(usage.getMonthRequests() + 1);
                mergeCost(monthCosts, row);
            }
            if (inDay) {
                usage.setTodayTokens(usage.getTodayTokens() + tokens);
                usage.setTodayRequests(usage.getTodayRequests() + 1);
                mergeCost(todayCosts, row);
            }
        }
        todayCosts.forEach((currency, cost) ->
                usage.getTodayCosts().add(new AiMyCenterDTO.CostEntry(currency, cost.setScale(4, RoundingMode.HALF_UP))));
        monthCosts.forEach((currency, cost) ->
                usage.getMonthCosts().add(new AiMyCenterDTO.CostEntry(currency, cost.setScale(4, RoundingMode.HALF_UP))));
    }

    /** 最近使用记录（最新 N 条） */
    private void fillRecentRecords(AiMyCenterDTO.MyQuotaUsageVO vo, String username) {
        Page<LlmUsage> page = llmUsageMapper.selectPage(new Page<>(1, RECENT_RECORD_LIMIT),
                new LambdaQueryWrapper<LlmUsage>()
                        .eq(LlmUsage::getUsername, username)
                        .orderByDesc(LlmUsage::getCreatedAt)
                        .orderByDesc(LlmUsage::getId));
        for (LlmUsage row : page.getRecords()) {
            AiMyCenterDTO.RecentRecordVO rvo = new AiMyCenterDTO.RecentRecordVO();
            rvo.setId(row.getId());
            rvo.setTime(row.getCreatedAt() != null ? row.getCreatedAt().format(DT_FMT) : null);
            rvo.setModel(row.getModel());
            rvo.setMode(row.getMode());
            rvo.setChannel(row.getChannel());
            rvo.setPromptTokens(nz(row.getPromptTokens()));
            rvo.setCompletionTokens(nz(row.getCompletionTokens()));
            rvo.setCost(row.getCost());
            rvo.setCurrency(row.getCurrency());
            vo.getRecentRecords().add(rvo);
        }
    }

    /* ══════════════════════ 我的授权模型 ══════════════════════ */

    @Override
    public List<AiMyCenterDTO.MyModelVO> myModels() {
        SysUser user = currentUser();
        if (user == null) {
            return List.of();
        }

        Map<Long, Set<String>> sources = new LinkedHashMap<>();
        collectDeptModels(user, sources);
        collectPositionModels(user, sources);
        collectRoleModels(user, sources);
        collectEmployeeModels(user, sources);
        if (sources.isEmpty()) {
            return List.of();
        }

        Map<Long, AiModel> modelMap = loadModels(new ArrayList<>(sources.keySet()));
        Set<Long> providerIds = new LinkedHashSet<>();
        modelMap.values().forEach(model -> {
            if (model.getProviderId() != null) {
                providerIds.add(model.getProviderId());
            }
        });
        Map<Long, String> providerNames = new LinkedHashMap<>();
        if (!providerIds.isEmpty()) {
            providerMapper.selectList(new LambdaQueryWrapper<AiProvider>()
                            .select(AiProvider::getId, AiProvider::getName)
                            .in(AiProvider::getId, providerIds))
                    .forEach(provider -> providerNames.put(provider.getId(), provider.getName()));
        }

        List<AiMyCenterDTO.MyModelVO> result = new ArrayList<>();
        modelMap.values().stream()
                .sorted(Comparator.comparing(AiModel::getSortOrder,
                                Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(AiModel::getId))
                .forEach(model -> {
                    AiMyCenterDTO.MyModelVO mvo = new AiMyCenterDTO.MyModelVO();
                    mvo.setModelId(model.getId());
                    mvo.setModelKey(model.getModelKey());
                    mvo.setModelName(model.getName());
                    mvo.setProviderName(providerNames.get(model.getProviderId()));
                    mvo.setDeployType(model.getDeployType());
                    mvo.setSources(new ArrayList<>(sources.getOrDefault(model.getId(), Set.of())));
                    result.add(mvo);
                });
        return result;
    }

    /** 部门维度：启用策略组关联了当前部门，则组内模型均授权 */
    private void collectDeptModels(SysUser user, Map<Long, Set<String>> sources) {
        if (user.getDepartmentId() == null) {
            return;
        }
        List<AiDeptAuthGroupDept> links = deptGroupDeptMapper.selectList(
                new LambdaQueryWrapper<AiDeptAuthGroupDept>()
                        .select(AiDeptAuthGroupDept::getGroupId)
                        .eq(AiDeptAuthGroupDept::getDepartmentId, user.getDepartmentId()));
        if (links.isEmpty()) {
            return;
        }
        List<Long> groupIds = links.stream().map(AiDeptAuthGroupDept::getGroupId).distinct().toList();
        List<Long> enabledGroupIds = deptGroupMapper.selectList(
                        new LambdaQueryWrapper<AiDeptAuthGroup>()
                                .select(AiDeptAuthGroup::getId)
                                .in(AiDeptAuthGroup::getId, groupIds)
                                .eq(AiDeptAuthGroup::getStatus, 1))
                .stream().map(AiDeptAuthGroup::getId).toList();
        if (enabledGroupIds.isEmpty()) {
            return;
        }
        deptGroupModelMapper.selectList(
                        new LambdaQueryWrapper<AiDeptAuthGroupModel>()
                                .select(AiDeptAuthGroupModel::getModelId)
                                .in(AiDeptAuthGroupModel::getGroupId, enabledGroupIds))
                .forEach(row -> addSource(sources, row.getModelId(), "dept"));
    }

    /** 职位维度：当前职位的启用映射（permission_level != none）+ 员工模型权控的职位授权策略（职级序列+职级范围命中） */
    private void collectPositionModels(SysUser user, Map<Long, Set<String>> sources) {
        if (user.getPositionId() != null) {
            positionModelMapper.selectList(
                            new LambdaQueryWrapper<AiPositionModelMapping>()
                                    .select(AiPositionModelMapping::getModelId, AiPositionModelMapping::getPermissionLevel)
                                    .eq(AiPositionModelMapping::getPositionId, user.getPositionId())
                                    .eq(AiPositionModelMapping::getStatus, 1))
                    .stream()
                    .filter(row -> !"none".equals(row.getPermissionLevel()))
                    .forEach(row -> addSource(sources, row.getModelId(), "position"));
        }
        // 职位授权策略：启用且当前账号的职级序列与职级同时命中，则策略内模型均授权
        if (user.getSequence() == null || user.getJobLevel() == null) {
            return;
        }
        empPosAuthStrategyMapper.selectList(
                        new LambdaQueryWrapper<AiEmpPosAuthStrategy>()
                                .select(AiEmpPosAuthStrategy::getSequences, AiEmpPosAuthStrategy::getJobLevels,
                                        AiEmpPosAuthStrategy::getModelConfigs)
                                .eq(AiEmpPosAuthStrategy::getStatus, 1))
                .stream()
                .filter(strategy -> JsonUtils.parseStringList(strategy.getSequences()).contains(user.getSequence())
                        && JsonUtils.parseStringList(strategy.getJobLevels()).contains(user.getJobLevel()))
                .forEach(strategy -> collectModelIds(strategy.getModelConfigs(), "position", sources));
    }

    /** 角色维度：当前账号绑定功能角色的启用映射（permission_level != none）+ 员工模型权控的自定义角色授权（绑定员工命中） */
    private void collectRoleModels(SysUser user, Map<Long, Set<String>> sources) {
        List<Long> roleIds = JsonUtils.parseLongList(user.getFunctionRoles());
        if (!roleIds.isEmpty()) {
            roleModelMapper.selectList(
                            new LambdaQueryWrapper<AiRoleModelMapping>()
                                    .select(AiRoleModelMapping::getModelId, AiRoleModelMapping::getPermissionLevel)
                                    .in(AiRoleModelMapping::getRoleId, roleIds)
                                    .eq(AiRoleModelMapping::getStatus, 1))
                    .stream()
                    .filter(row -> !"none".equals(row.getPermissionLevel()))
                    .forEach(row -> addSource(sources, row.getModelId(), "role"));
        }
        // 自定义角色授权：启用且绑定员工包含当前账号，则角色内模型均授权
        empRoleAuthMapper.selectList(
                        new LambdaQueryWrapper<AiEmpRoleAuth>()
                                .select(AiEmpRoleAuth::getUserIds, AiEmpRoleAuth::getModelConfigs)
                                .eq(AiEmpRoleAuth::getStatus, 1))
                .stream()
                .filter(role -> JsonUtils.parseLongList(role.getUserIds()).contains(user.getId()))
                .forEach(role -> collectModelIds(role.getModelConfigs(), "role", sources));
    }

    /** 从模型能力配置 JSON 中提取 modelId 集合（授权判定只需模型维度，能力开关由网关侧消费） */
    private void collectModelIds(String modelConfigsJson, String source, Map<Long, Set<String>> sources) {
        for (Map<String, Object> mc : JsonUtils.parseMapList(modelConfigsJson)) {
            Object modelId = mc.get("modelId");
            if (modelId instanceof Number n) {
                addSource(sources, n.longValue(), source);
            }
        }
    }

    /** 员工维度：员工覆盖授权（has_permission = 1） */
    private void collectEmployeeModels(SysUser user, Map<Long, Set<String>> sources) {
        employeeAuthMapper.selectList(
                        new LambdaQueryWrapper<AiEmployeeAuth>()
                                .select(AiEmployeeAuth::getModelId)
                                .eq(AiEmployeeAuth::getEmployeeId, user.getId())
                                .eq(AiEmployeeAuth::getStatus, 1)
                                .eq(AiEmployeeAuth::getHasPermission, 1))
                .forEach(row -> addSource(sources, row.getModelId(), "employee"));
    }

    /* ══════════════════════ 公共工具 ══════════════════════ */

    private void addSource(Map<Long, Set<String>> sources, Long modelId, String source) {
        if (modelId == null) {
            return;
        }
        sources.computeIfAbsent(modelId, key -> new LinkedHashSet<>()).add(source);
    }

    /** 批量加载模型（逻辑删除自动过滤） */
    private Map<Long, AiModel> loadModels(List<Long> modelIds) {
        List<Long> ids = modelIds.stream().filter(java.util.Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<Long, AiModel> map = new LinkedHashMap<>();
        modelMapper.selectList(new LambdaQueryWrapper<AiModel>()
                        .select(AiModel::getId, AiModel::getModelKey, AiModel::getName,
                                AiModel::getProviderId, AiModel::getDeployType, AiModel::getSortOrder)
                        .in(AiModel::getId, ids))
                .forEach(model -> map.put(model.getId(), model));
        return map;
    }

    private void mergeCost(Map<String, BigDecimal> costs, LlmUsage row) {
        String currency = row.getCurrency() != null ? row.getCurrency() : "";
        BigDecimal cost = row.getCost() != null ? row.getCost() : BigDecimal.ZERO;
        if (cost.signum() == 0 && currency.isEmpty()) {
            return;
        }
        costs.merge(currency, cost, BigDecimal::add);
    }

    /** 月周期起始日：重置日当天开始；今天早于重置日时回退上一个周期 */
    private static LocalDate periodStart(LocalDate today, int resetDay) {
        LocalDate candidate = clampToMonth(today, resetDay);
        return candidate.isAfter(today) ? clampToMonth(today.minusMonths(1), resetDay) : candidate;
    }

    /** 下一个重置日：严格晚于今天 */
    private static LocalDate nextResetDate(LocalDate today, int resetDay) {
        LocalDate candidate = clampToMonth(today.plusMonths(1), resetDay);
        return candidate.isAfter(today) ? candidate : clampToMonth(today.plusMonths(2), resetDay);
    }

    /** 将重置日钳制到目标月份的有效天数（如 31 号在 2 月按月末处理） */
    private static LocalDate clampToMonth(LocalDate month, int resetDay) {
        int day = Math.min(Math.max(resetDay, 1), month.lengthOfMonth());
        return month.withDayOfMonth(day);
    }

    private static long nz(Integer value) {
        return value != null ? value : 0L;
    }

    /** 当前登录账号（JWT 认证后由过滤器写入 SecurityContext） */
    private SysUser currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return (auth != null && auth.getDetails() instanceof SysUser user) ? user : null;
    }
}
