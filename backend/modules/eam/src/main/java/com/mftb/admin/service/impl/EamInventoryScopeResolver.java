package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.InventoryScope;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.EamCategory;
import com.mftb.admin.entity.EamLocation;
import com.mftb.admin.mapper.EamCategoryMapper;
import com.mftb.admin.mapper.EamLocationMapper;
import com.mftb.admin.service.EamTransferLookup;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * 盘点范围解析器：把 {@link InventoryScope} 展开为台账查询条件、名称摘要与范围指纹。
 * <p>维度之间 AND，同维度多值 OR，父节点选择展开为子节点集合。</p>
 */
@Component
@RequiredArgsConstructor
public class EamInventoryScopeResolver {

    private final EamLocationMapper locationMapper;
    private final EamCategoryMapper categoryMapper;
    private final EamTransferLookup lookup;

    /** 默认适用状态（不含已遗失；已报废/核销永不纳入） */
    public static final List<String> DEFAULT_STATUSES = List.of("idle", "in_use", "in_repair", "pending_inspection");
    /** 允许显式纳入的状态上界（排除 scrapped/written_off） */
    private static final Set<String> ALLOWED_STATUSES =
            Set.of("idle", "in_use", "in_repair", "pending_inspection", "lost");

    /** 解析后的范围（含展开后的 ID/名称集合） */
    public record ResolvedScope(
            String scopeMode,
            List<Long> locationIds,
            List<Long> categoryIds,
            List<String> departmentNames,
            Integer companyBrand,
            List<String> statuses,
            List<String> locationNames,
            List<String> categoryNames) {
    }

    public boolean isAll(InventoryScope scope) {
        return scope != null && "ALL".equalsIgnoreCase(trim(scope.getScopeMode()));
    }

    /** CONDITION 模式必须至少一个条件，防止漏填变全盘 */
    public void validate(InventoryScope scope) {
        if (scope == null) throw new BusinessException("請選擇盤點範圍模式");
        if (isAll(scope)) return;
        boolean empty = isEmpty(scope.getLocationIds()) && isEmpty(scope.getCategoryIds())
                && scope.getDepartmentId() == null && scope.getCompanyBrand() == null;
        if (empty) throw new BusinessException("按條件盤點時至少需選擇一項範圍條件，如需全盤請選擇「全部適用資產」");
    }

    /** 展开范围为具体查询条件（校验条件有效性；非法/失效条件直接报错，不静默扩大） */
    public ResolvedScope resolve(InventoryScope scope) {
        boolean all = isAll(scope);
        List<Long> locationIds = all ? List.of() : expandLocations(scope.getLocationIds());
        List<Long> categoryIds = all ? List.of() : expandCategories(scope.getCategoryIds());
        List<String> deptNames = (all || scope.getDepartmentId() == null)
                ? List.of() : lookup.departmentNames(scope.getDepartmentId());
        if (!all && scope.getDepartmentId() != null && deptNames.isEmpty()) {
            throw new BusinessException("所選部門在資產台賬中無法唯一匹配，請先整理組織資料");
        }
        Integer brand = all ? null : scope.getCompanyBrand();
        List<String> statuses = resolveStatuses(scope.getStatuses(), all);
        List<String> locationNames = all ? List.of() : namesOfLocations(locationIds);
        List<String> categoryNames = all ? List.of() : namesOfCategories(categoryIds);
        return new ResolvedScope(all ? "ALL" : "CONDITION", locationIds, categoryIds, deptNames, brand,
                statuses, locationNames, categoryNames);
    }

    /** 构造台账查询条件（排除逻辑删除由 @TableLogic 自动处理） */
    public LambdaQueryWrapper<EamAsset> toWrapper(ResolvedScope r) {
        LambdaQueryWrapper<EamAsset> w = new LambdaQueryWrapper<>();
        w.in(!r.statuses().isEmpty(), EamAsset::getStatus, r.statuses());
        if (!"ALL".equals(r.scopeMode())) {
            if (!r.locationIds().isEmpty()) w.in(EamAsset::getLocationId, r.locationIds());
            if (!r.categoryIds().isEmpty()) w.in(EamAsset::getCategoryId, r.categoryIds());
            if (!r.departmentNames().isEmpty()) w.in(EamAsset::getDepartment, r.departmentNames());
            if (r.companyBrand() != null) w.eq(EamAsset::getCompanyBrand, r.companyBrand());
        }
        return w;
    }

    /** 范围指纹：模式 + 展开后有序 ID/名称/状态集合 */
    public String fingerprint(ResolvedScope r) {
        StringBuilder sb = new StringBuilder(r.scopeMode()).append('|');
        appendSorted(sb, r.locationIds());
        sb.append('|');
        appendSortedStrings(sb, r.statuses());
        sb.append('|');
        appendSortedStrings(sb, new ArrayList<>(r.departmentNames()));
        sb.append('|');
        appendSorted(sb, new ArrayList<>(r.categoryIds()));
        sb.append('|').append(r.companyBrand());
        return md5(sb.toString());
    }

    private List<String> resolveStatuses(List<String> requested, boolean all) {
        List<String> base = all ? DEFAULT_STATUSES : (isEmpty(requested) ? DEFAULT_STATUSES : requested);
        List<String> out = new ArrayList<>();
        for (String s : base) {
            if ("scrapped".equals(s) || "written_off".equals(s)) {
                throw new BusinessException("已報廢/已核銷資產不納入盤點範圍");
            }
            if (!ALLOWED_STATUSES.contains(s)) throw new BusinessException("無效的資產狀態：" + s);
            if (!out.contains(s)) out.add(s);
        }
        return out;
    }

    private List<Long> expandLocations(List<Long> roots) {
        if (isEmpty(roots)) return List.of();
        List<EamLocation> all = locationMapper.selectList(new LambdaQueryWrapper<EamLocation>()
                .orderByAsc(EamLocation::getId));
        Map<Long, List<Long>> children = all.stream()
                .collect(Collectors.groupingBy(l -> l.getParentId() == null ? 0L : l.getParentId(),
                        Collectors.mapping(EamLocation::getId, Collectors.toList())));
        Set<Long> ids = new LinkedHashSet<>();
        for (Long root : roots) {
            if (all.stream().noneMatch(l -> l.getId().equals(root))) throw new BusinessException("所選倉庫不存在或已失效");
            Deque<Long> stack = new ArrayDeque<>();
            stack.push(root);
            Set<Long> seen = new HashSet<>();
            while (!stack.isEmpty()) {
                Long cur = stack.pop();
                if (seen.add(cur)) {
                    ids.add(cur);
                    children.getOrDefault(cur, List.of()).forEach(stack::push);
                }
            }
        }
        return new ArrayList<>(new TreeSet<>(ids));
    }

    private List<Long> expandCategories(List<Long> roots) {
        if (isEmpty(roots)) return List.of();
        Set<Long> ids = new LinkedHashSet<>();
        for (Long root : roots) ids.addAll(lookup.categoryIds(root));
        return new ArrayList<>(new TreeSet<>(ids));
    }

    private List<String> namesOfLocations(List<Long> ids) {
        if (ids.isEmpty()) return List.of();
        return locationMapper.selectList(new LambdaQueryWrapper<EamLocation>().in(EamLocation::getId, ids))
                .stream().map(EamLocation::getName).filter(StringUtils::hasText).toList();
    }

    private List<String> namesOfCategories(List<Long> ids) {
        if (ids.isEmpty()) return List.of();
        return categoryMapper.selectList(new LambdaQueryWrapper<EamCategory>().in(EamCategory::getId, ids))
                .stream().map(EamCategory::getName).filter(StringUtils::hasText).toList();
    }

    private void appendSorted(StringBuilder sb, List<Long> ids) {
        new TreeSet<>(ids).forEach(id -> sb.append(id).append(','));
    }

    private void appendSortedStrings(StringBuilder sb, List<String> values) {
        new TreeSet<>(values).forEach(v -> sb.append(v).append(','));
    }

    private boolean isEmpty(List<?> list) {
        return list == null || list.isEmpty();
    }

    private String trim(String s) {
        return s == null ? null : s.trim();
    }

    private String md5(String raw) {
        try {
            byte[] digest = MessageDigest.getInstance("MD5").digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("指紋計算失敗", e);
        }
    }
}
