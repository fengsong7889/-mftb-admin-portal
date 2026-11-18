/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.CpmItemUpdate;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.mapper.CpmItemUpdateMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 确定性聚合器：周期 → 汇报快照（预览与发布共用同一函数）。
 *
 * <p>不可让第 2 处实现存在的理由（口径单点，同 RdmDailyReportService）：
 * 「用户在生成页看到的数字」与「上级收到的快照数字」一旦分叉，汇报就变成了罗生门。
 *
 * <p>三条收敛规则：
 * 1) 按 itemId 去重——同一长期事项期间更新 4 次也只算 1 项；
 * 2) 期末状态取「期间内最后一条流水」（同日多条取后写的 id），无流水回退条目缓存；
 * 3) 轨迹保留期间内每日百分比序列，报告页展示 30% → 70%，不改写任何数字。
 */
@Component
@RequiredArgsConstructor
public class CpmSnapshotBuilder {

    private final CpmItemMapper itemMapper;
    private final CpmItemUpdateMapper updateMapper;
    private final CpmItemService itemService;

    public CpmDto.Snapshot build(long userId, String periodType, LocalDate start, LocalDate end) {
        Map<String, String> labels = itemService.categoryLabels();
        CpmDto.Snapshot snapshot = new CpmDto.Snapshot();
        snapshot.setPeriodType(periodType);
        snapshot.setPeriodStart(start.toString());
        snapshot.setPeriodEnd(end.toString());

        List<Long> activeIds = updateMapper.listActiveItemIds(userId, start, end);
        if (activeIds.isEmpty()) {
            return snapshot;
        }
        List<CpmItem> items = itemMapper.selectBatchIds(activeIds).stream()
                .filter(i -> i.getDeleted() == null || i.getDeleted() == 0)
                .toList();
        Map<Long, List<CpmItemUpdate>> updatesByItem = new LinkedHashMap<>();
        for (CpmItemUpdate u : updateMapper.listByUserAndRange(userId, start, end)) {
            updatesByItem.computeIfAbsent(u.getItemId(), k -> new ArrayList<>()).add(u);
        }

        Map<String, CpmDto.Snapshot.Group> groups = new LinkedHashMap<>();
        CpmDto.Snapshot.Totals totals = snapshot.getTotals();
        for (CpmItem item : items) {
            List<CpmItemUpdate> trail = updatesByItem.getOrDefault(item.getId(), List.of());
            CpmDto.Snapshot.Entry entry = new CpmDto.Snapshot.Entry();
            entry.setItemId(item.getId());
            entry.setTitle(item.getTitle());
            entry.setWorkDate(item.getWorkDate() == null ? null : item.getWorkDate().toString());
            entry.setSourceType(item.getSourceType());
            entry.setSourceLabel(item.getSourceLabel());
            if (trail.isEmpty()) {
                // 无流水：回退条目缓存（历史数据/异常兜底；正常路径首条流水与条目同事务写入）
                entry.setStatus(item.getStatus());
                entry.setProgress(item.getProgress());
            } else {
                CpmItemUpdate last = trail.get(trail.size() - 1);
                entry.setStatus(last.getStatus());
                entry.setProgress(last.getProgress());
                trail.forEach(u -> entry.getTrail().add(u.getProgress()));
            }
            countStatus(totals, entry.getStatus());
            CpmDto.Snapshot.Group group = groups.computeIfAbsent(nullSafe(item.getCategory()), k -> {
                CpmDto.Snapshot.Group g = new CpmDto.Snapshot.Group();
                g.setCategory(k);
                g.setCategoryLabel(labels.getOrDefault(k, k));
                return g;
            });
            group.getItems().add(entry);
        }
        totals.setTotal(items.size());
        snapshot.setGroups(new ArrayList<>(groups.values()));
        return snapshot;
    }

    private static void countStatus(CpmDto.Snapshot.Totals totals, String status) {
        switch (status == null ? "" : status) {
            case "done" -> totals.setDone(totals.getDone() + 1);
            case "doing" -> totals.setDoing(totals.getDoing() + 1);
            case "todo" -> totals.setTodo(totals.getTodo() + 1);
            case "blocked" -> totals.setBlocked(totals.getBlocked() + 1);
            default -> { /* 未知状态不计入分桶，但 total 仍按条目数收口，口径差异如实暴露 */ }
        }
    }

    private static String nullSafe(String value) {
        return value == null || value.isBlank() ? "general" : value;
    }
}
