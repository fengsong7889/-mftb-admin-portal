package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.LlmUsageRecordRequest;
import com.mftb.admin.dto.LlmUsageRecordVO;
import com.mftb.admin.dto.LlmUsageSummaryVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.LlmUsage;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.LlmUsageMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.LlmUsageService;
import com.mftb.admin.service.SysConfigService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 助手使用统计服务实现
 * 计价单价来自 sys_config（key=llm_model_prices，5 分钟缓存），费用按请求时刻快照入库
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LlmUsageServiceImpl implements LlmUsageService {

    /** 模型单价配置的 sys_config key */
    private static final String KEY_MODEL_PRICES = "llm_model_prices";

    /** 单价计量单位：元（或美元）/ 百万 tokens */
    private static final BigDecimal MILLION = BigDecimal.valueOf(1_000_000);

    private final LlmUsageMapper llmUsageMapper;
    private final SysUserMapper sysUserMapper;
    private final SysConfigService sysConfigService;
    private final ObjectMapper objectMapper;

    /** 单个模型的计价条目（来自官方价目表，只读配置） */
    @Data
    public static class ModelPrice {
        /** 输入单价（/百万tokens） */
        private BigDecimal input;
        /** 输出单价（/百万tokens） */
        private BigDecimal output;
        /** 缓存命中输入单价（可选，未配置时按输入单价计） */
        private BigDecimal cachedInput;
        /** 币种: CNY/USD */
        private String currency;
    }

    @Override
    public void record(String username, LlmUsageRecordRequest request) {
        LlmUsage usage = new LlmUsage();
        usage.setUsername(username);
        usage.setMode(request.getMode());
        usage.setChannel(request.getChannel());
        usage.setModel(request.getModel());
        usage.setPromptTokens(request.getPromptTokens());
        usage.setCompletionTokens(request.getCompletionTokens());
        usage.setCachedTokens(Math.max(0, request.getCachedTokens()));

        ModelPrice price = loadPrices().get(request.getModel());
        if (price != null && price.getInput() != null && price.getOutput() != null) {
            int cached = Math.min(Math.max(0, request.getCachedTokens()), Math.max(0, request.getPromptTokens()));
            int nonCachedInput = Math.max(0, request.getPromptTokens()) - cached;
            BigDecimal cachedUnit = price.getCachedInput() != null ? price.getCachedInput() : price.getInput();
            BigDecimal cost = price.getInput().multiply(BigDecimal.valueOf(nonCachedInput))
                    .add(cachedUnit.multiply(BigDecimal.valueOf(cached)))
                    .add(price.getOutput().multiply(BigDecimal.valueOf(Math.max(0, request.getCompletionTokens()))))
                    .divide(MILLION, 6, RoundingMode.HALF_UP);
            usage.setCost(cost);
            usage.setCurrency(price.getCurrency() != null ? price.getCurrency() : "");
        } else {
            // 无单价配置的模型照常记录用量，费用记 0（币种为空，前端显示 --）
            usage.setCost(BigDecimal.ZERO);
            usage.setCurrency("");
            log.warn("LLM 用量计价缺少模型 [{}] 的单价配置，费用按 0 记录", request.getModel());
        }
        llmUsageMapper.insert(usage);
    }

    @Override
    public LlmUsageSummaryVO summary(LocalDate startDate, LocalDate endDate, String username) {
        List<LlmUsage> rows = llmUsageMapper.selectList(buildWrapper(startDate, endDate, username));

        LlmUsageSummaryVO vo = new LlmUsageSummaryVO();
        Map<String, BigDecimal> totalCost = new LinkedHashMap<>();
        Map<String, LlmUsageSummaryVO.ModelRow> modelRows = new LinkedHashMap<>();
        Map<String, LlmUsageSummaryVO.UserRow> userRows = new LinkedHashMap<>();

        for (LlmUsage row : rows) {
            vo.setTotalRequests(vo.getTotalRequests() + 1);
            vo.setTotalPromptTokens(vo.getTotalPromptTokens() + nz(row.getPromptTokens()));
            vo.setTotalCompletionTokens(vo.getTotalCompletionTokens() + nz(row.getCompletionTokens()));
            String currency = row.getCurrency() != null ? row.getCurrency() : "";

            if (row.getCost() != null && row.getCost().signum() != 0 || !currency.isEmpty()) {
                totalCost.merge(currency, nzDec(row.getCost()), BigDecimal::add);
            }

            LlmUsageSummaryVO.ModelRow modelRow = modelRows.computeIfAbsent(row.getModel(), m -> {
                LlmUsageSummaryVO.ModelRow r = new LlmUsageSummaryVO.ModelRow();
                r.setModel(m);
                return r;
            });
            modelRow.setRequests(modelRow.getRequests() + 1);
            modelRow.setPromptTokens(modelRow.getPromptTokens() + nz(row.getPromptTokens()));
            modelRow.setCompletionTokens(modelRow.getCompletionTokens() + nz(row.getCompletionTokens()));
            mergeCost(modelRow.getCosts(), currency, nzDec(row.getCost()));

            LlmUsageSummaryVO.UserRow userRow = userRows.computeIfAbsent(row.getUsername(), u -> {
                LlmUsageSummaryVO.UserRow r = new LlmUsageSummaryVO.UserRow();
                r.setUsername(u);
                return r;
            });
            userRow.setRequests(userRow.getRequests() + 1);
            userRow.setPromptTokens(userRow.getPromptTokens() + nz(row.getPromptTokens()));
            userRow.setCompletionTokens(userRow.getCompletionTokens() + nz(row.getCompletionTokens()));
            mergeCost(userRow.getCosts(), currency, nzDec(row.getCost()));
            if (row.getCreatedAt() != null
                    && (userRow.getLastUsedAt() == null || row.getCreatedAt().isAfter(userRow.getLastUsedAt()))) {
                userRow.setLastUsedAt(row.getCreatedAt());
            }
        }

        totalCost.forEach((currency, cost) ->
                vo.getCostByCurrency().add(new LlmUsageSummaryVO.CostEntry(currency, cost.setScale(4, RoundingMode.HALF_UP))));
        vo.setByModel(modelRows.values().stream()
                .sorted(Comparator.comparingLong(LlmUsageSummaryVO.ModelRow::getRequests).reversed())
                .toList());
        // 填充员工姓名/工号（前端展示「姓名（工号）」）
        Map<String, SysUser> userMap = loadUsers(userRows.keySet());
        userRows.values().forEach(row -> {
            SysUser user = userMap.get(row.getUsername());
            if (user != null) {
                row.setName(user.getName());
                row.setEmpId(user.getEmpId());
            }
        });
        vo.setByUser(userRows.values().stream()
                .sorted(Comparator.comparingLong(LlmUsageSummaryVO.UserRow::getRequests).reversed())
                .toList());
        return vo;
    }

    @Override
    public PageResult<LlmUsageRecordVO> records(long page, long size, String username, LocalDate startDate, LocalDate endDate) {
        Page<LlmUsage> pageParam = new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size));
        LambdaQueryWrapper<LlmUsage> wrapper = buildWrapper(startDate, endDate, username)
                .orderByDesc(LlmUsage::getCreatedAt)
                .orderByDesc(LlmUsage::getId);
        Page<LlmUsage> result = llmUsageMapper.selectPage(pageParam, wrapper);
        Map<String, SysUser> userMap = loadUsers(result.getRecords().stream().map(LlmUsage::getUsername).toList());
        List<LlmUsageRecordVO> records = result.getRecords().stream().map(row -> {
            LlmUsageRecordVO vo = new LlmUsageRecordVO();
            vo.setId(row.getId());
            vo.setUsername(row.getUsername());
            SysUser user = userMap.get(row.getUsername());
            if (user != null) {
                vo.setName(user.getName());
                vo.setEmpId(user.getEmpId());
            }
            vo.setMode(row.getMode());
            vo.setChannel(row.getChannel());
            vo.setModel(row.getModel());
            vo.setPromptTokens(row.getPromptTokens());
            vo.setCompletionTokens(row.getCompletionTokens());
            vo.setCachedTokens(row.getCachedTokens());
            vo.setCost(row.getCost());
            vo.setCurrency(row.getCurrency());
            vo.setCreatedAt(row.getCreatedAt());
            return vo;
        }).toList();
        return new PageResult<>(records, result.getTotal());
    }

    /** 批量查用户名→员工信息映射（仅取展示所需字段） */
    private Map<String, SysUser> loadUsers(Collection<String> usernames) {
        if (usernames == null || usernames.isEmpty()) {
            return Map.of();
        }
        List<SysUser> users = sysUserMapper.selectList(
                new LambdaQueryWrapper<SysUser>()
                        .in(SysUser::getUsername, usernames)
                        .select(SysUser::getUsername, SysUser::getName, SysUser::getEmpId));
        Map<String, SysUser> map = new LinkedHashMap<>();
        users.forEach(user -> map.put(user.getUsername(), user));
        return map;
    }

    /** 组装日期/账号过滤条件 */
    private LambdaQueryWrapper<LlmUsage> buildWrapper(LocalDate startDate, LocalDate endDate, String username) {
        LambdaQueryWrapper<LlmUsage> wrapper = new LambdaQueryWrapper<>();
        if (startDate != null) {
            wrapper.ge(LlmUsage::getCreatedAt, startDate.atStartOfDay());
        }
        if (endDate != null) {
            wrapper.lt(LlmUsage::getCreatedAt, endDate.plusDays(1).atStartOfDay());
        }
        if (StringUtils.hasText(username)) {
            wrapper.eq(LlmUsage::getUsername, username);
        }
        return wrapper;
    }

    /** 读取并解析模型单价配置（5 分钟缓存，解析失败视为未配置） */
    private Map<String, ModelPrice> loadPrices() {
        String raw = sysConfigService.getConfigValueCached(KEY_MODEL_PRICES);
        if (!StringUtils.hasText(raw)) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(raw, new TypeReference<Map<String, ModelPrice>>() { });
        } catch (Exception e) {
            log.warn("模型单价配置解析失败，本次按未配置处理: {}", e.getMessage());
            return Map.of();
        }
    }

    /** 将某币种费用累加进行的 costs 列表 */
    private void mergeCost(List<LlmUsageSummaryVO.CostEntry> costs, String currency, BigDecimal amount) {
        if (amount.signum() == 0 && currency.isEmpty()) {
            return;
        }
        for (LlmUsageSummaryVO.CostEntry entry : costs) {
            if (entry.getCurrency().equals(currency)) {
                entry.setCost(entry.getCost().add(amount));
                return;
            }
        }
        costs.add(new LlmUsageSummaryVO.CostEntry(currency, amount));
    }

    private static long nz(Integer value) {
        return value != null ? value : 0L;
    }

    private static BigDecimal nzDec(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }
}
