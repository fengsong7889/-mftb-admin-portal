package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * RDM 产出积分相关的出参（M4）。
 * <p>字段命名与前端 {@code src/api/rdm.ts} 的 RdmScore* 类型一一对应，改动需两侧同步。
 */
public final class RdmScoreVO {

    private RdmScoreVO() {
    }

    /** 规则行 */
    @Data
    public static class Rule {
        private Long id;
        private String ruleCode;
        private String reqType;
        private String roleCode;
        private BigDecimal priorityBonus;
        private BigDecimal onTimeBonus;
        private BigDecimal latePenalty;
        private BigDecimal firstPassBonus;
        private BigDecimal reworkPenalty;
        private BigDecimal reopenPenalty;
        private BigDecimal acceptanceFactor;
        private BigDecimal qualityFloor;
        private BigDecimal unitScore;
        private String allocMode;
        private Integer maxScorableRoles;
        private Integer version;
        private String effectiveFrom;
        private Boolean enabled;
        private String remark;
        private String updatedBy;
        private String updatedAt;
    }

    /** 逐项因子与成因（前端展开显示，也是绩效申诉依据） */
    @Data
    public static class Breakdown {
        private double base;
        private double typeFactor;
        private double priorityFactor;
        private double onTimeFactor;
        private double qualityFactor;
        private double roleFactor;
        private double rawScore;
        private BigDecimal finalScore;
        private List<Reason> reasons = new ArrayList<>();
    }

    /** 单项成因 */
    @Data
    public static class Reason {
        private String code;
        private String label;
        private BigDecimal score;
        private String memo;
    }

    /** 积分流水行（同时保留字段与访问器，便于服务层累加与 JSON 序列化） */
    @Data
    public static class Record {
        public Long id;
        public Long reqId;
        public String reqNo;
        public String reqTitle;
        public Long userId;
        public String userName;
        public String empNo;
        public String deptName;
        public String roleCode;
        public String reqType;
        public String priority;
        public String complexity;
        public String periodCode;
        public BigDecimal score;
        public Breakdown breakdown;
        public Integer ruleVersion;
        public Integer onTime;
        public Integer lateDays;
        public Integer reworkCount;
        public Integer acceptanceScore;
        public Integer firstPass;
        public String pushStatus;
        public String pushedAt;
        public String calculatedAt;
    }

    /** 个人汇总 */
    @Data
    public static class Person {
        public Long userId;
        public String userName;
        public String empNo;
        public String deptName;
        public String periodCode;
        public BigDecimal totalScore = BigDecimal.ZERO;
        public int reqCount;
        public int deliveredCount;
        public BigDecimal onTimeRate = BigDecimal.ZERO;
        public BigDecimal firstPassRate = BigDecimal.ZERO;
        public BigDecimal avgAcceptanceScore = BigDecimal.ZERO;
        public int reworkCount;
        public String pushStatus;
        /** 中间累加量（不出参） */
        public transient BigDecimal scoreSum = BigDecimal.ZERO;
        public transient BigDecimal onTimeSum = BigDecimal.ZERO;
        public transient BigDecimal passSum = BigDecimal.ZERO;
    }

    /** 部门汇总 */
    @Data
    public static class DeptRow {
        public String deptName;
        public BigDecimal totalScore = BigDecimal.ZERO;
        public int personCount;
        public BigDecimal avgScore = BigDecimal.ZERO;
        public BigDecimal onTimeRate = BigDecimal.ZERO;
        /** 参与人数去重用（不出参） */
        public transient Set<String> personSet = new HashSet<>();
        public transient int onTimeRows;
        public transient int totalRows;
    }

    /** 汇总指标 */
    @Data
    public static class Summary {
        private Integer personCount = 0;
        private BigDecimal totalScore = BigDecimal.ZERO;
        private BigDecimal avgScore = BigDecimal.ZERO;
        private Integer deliveredCount = 0;
        private BigDecimal onTimeRate = BigDecimal.ZERO;
        private BigDecimal firstPassRate = BigDecimal.ZERO;
        private Integer reworkTotal = 0;
        private Integer pushedCount = 0;
    }

    /** 周期 */
    public record Period(String code, String name, String startDate, String endDate) {
    }

    /** 产出看板 */
    @Data
    public static class Board {
        private Period period;
        private Integer ruleVersion;
        private String ruleEffectiveFrom;
        private String allocMode;
        private Summary summary = new Summary();
        private List<Person> ranking = new ArrayList<>();
        private List<DeptRow> deptRank = new ArrayList<>();
        private List<Record> records = new ArrayList<>();
        private List<Map<String, Object>> cycles = new ArrayList<>();
    }

    /** 效能量快照点 */
    @Data
    public static class MetricPoint {
        private String statDate;
        private Long dimId;
        private String dimName;
        private Integer reqTotal;
        private Integer submitted;
        private Integer accepted;
        private Integer released;
        private Integer overdue;
        private BigDecimal avgResponseHours;
        private BigDecimal avgDeliveryDays;
        private BigDecimal onTimeRate;
        private BigDecimal rejectRate;
        private BigDecimal firstPassRate;
        private Integer reworkCount;
        private Integer changeCount;
    }
}
