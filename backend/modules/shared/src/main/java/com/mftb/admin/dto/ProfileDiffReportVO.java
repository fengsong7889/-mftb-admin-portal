package com.mftb.admin.dto;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 雇佣数据差异报告（方案 §7.1 要求的历史数据迁移前置产物）。
 */
@Data
public class ProfileDiffReportVO {

    /** 报告口径日：所有「当前」判定都以此为准 */
    private LocalDate asOf;

    private LocalDateTime generatedAt;

    /** 本次扫描的人数（已按操作者人员范围收敛） */
    private int scannedUsers;

    /** 存在差异的人数 */
    private int diffUsers;

    /** 类别码 → 命中人数（按严重度倒序、命中数倒序排列，便于界面直接渲染汇总条） */
    private Map<String, Long> countsByCategory = new LinkedHashMap<>();

    /** 差异明细（最多 {@code MAX_ITEMS} 行，超出时 {@link #truncated} 为 true） */
    private List<ProfileDiffItemVO> items = new ArrayList<>();

    /** 明细是否被截断：截断只影响展示，计数仍是全量 */
    private boolean truncated;

    /**
     * 可一键「按任职事实登记雇佣期间」的人数。
     * <p>只统计「派生得出但还没登记」的人：已登记但段数不符、缺锚点这类行必须人工判定，
     * 不能被一个批量按钮顺手盖掉。
     */
    private int registerableUsers;
}
