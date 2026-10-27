package com.mftb.admin.dto;

import lombok.Data;

import java.time.LocalDate;
import java.util.List;

/**
 * 排班保存请求（批量 UPSERT）。
 * <p>
 * 一次提交一格没有意义（矩阵页按周编辑），但整周全量覆盖会踩坑：两个人同时编辑同一周时，
 * 后保存的人会把自己没看到的格子"覆盖成没有"。所以按条目提交，服务端逐条按
 * {@code (userId, workDate)} 唯一键 upsert，未提及的格子不动。
 */
@Data
public class AttendanceScheduleSaveRequest {

    private Long groupId;

    /** 复制上一周期时使用：源周起始日 */
    private LocalDate sourceWeekStart;

    /** 目标周起始日（保存 entries 时可空，复制时必填） */
    private LocalDate weekStart;

    private List<Entry> entries;

    @Data
    public static class Entry {
        private Long userId;
        private LocalDate workDate;
        /** null = 排休（显式落一行 rest）；不传该 entry 表示不改动 */
        private Long shiftId;
    }
}
