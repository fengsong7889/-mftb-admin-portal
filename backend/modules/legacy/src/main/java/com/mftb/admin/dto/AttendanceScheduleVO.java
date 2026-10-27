package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 排班周视图。
 * <p>
 * 一次请求返回整周矩阵，前端不再逐格查库；{@code cells} 的 key 为 {@code yyyy-MM-dd}，
 * value 为 null 表示**该人该日没有排班记录**（漏排），与 {@code rest=true}（排了休息）是两件事——
 * 前者要产生「未排班」异常，后者不该产生。
 */
@Data
public class AttendanceScheduleVO {

    private Long groupId;

    private String groupName;

    private String weekStart;

    private String weekEnd;

    private List<Row> rows;

    /** 整周没有任何排班记录的人数（页面「整週未排班」指标卡） */
    private long unscheduledCount;

    @Data
    public static class Row {
        private Long userId;
        private String empNo;
        private String empName;
        private String deptName;
        /** key = yyyy-MM-dd；null = 无排班记录 */
        private Map<String, Cell> cells;
    }

    @Data
    public static class Cell {
        private Long id;
        private Long shiftId;
        private String shiftCode;
        private String shiftName;
        /** true = 显式排休（shiftId 为空但记录存在） */
        private boolean rest;
        /** 1=手工 2=複製 3=導入 */
        private Integer source;
    }
}
