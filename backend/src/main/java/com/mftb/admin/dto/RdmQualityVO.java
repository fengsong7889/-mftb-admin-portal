package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * RDM 质量口径（M3）——验收一次通过率 / 返工 / 缺陷 / 满意度。
 * <p>口径全部来自验收单与验收用例明细，不做事后补算：
 * <ul>
 *   <li>一次通过率 = 首次验收即 pass 的需求数 / 已验收需求数（attempt=1 且有验收记录）</li>
 *   <li>缺陷数 = 验收用例中 result 为 fail 的条数</li>
 *   <li>有条件通过计入通过，但保留遗留事项</li>
 * </ul>
 */
@Data
public class RdmQualityVO {

    /** 汇总指标 */
    private Summary summary = new Summary();

    /** 满意度分布（1~5 分） */
    private List<NameValue> scoreDist = new ArrayList<>();

    /** 缺陷按严重度分布 */
    private List<NameValue> defectBySeverity = new ArrayList<>();

    /** 返工 TOP 需求 */
    private List<ReworkItem> reworkRank = new ArrayList<>();

    /** 部门质量对比 */
    private List<DeptQuality> deptQuality = new ArrayList<>();

    /** 名称-数值对（图表直接可用，名称用中文标签而非编码，避免前端再翻译） */
    @Data
    public static class NameValue {
        private String name;
        private double value;

        public NameValue() {
        }

        public NameValue(String name, double value) {
            this.name = name;
            this.value = value;
        }
    }

    /** 返工排行条目 */
    @Data
    public static class ReworkItem {
        private Long reqId;
        private String reqNo;
        private String title;
        /** 返工次数（rework_count） */
        private Integer reworkCount;
        private String pmName;
        private String submitDeptName;
        /** 最近一次验收退回原因 */
        private String lastRejectReason;
    }

    /** 部门质量对比 */
    @Data
    public static class DeptQuality {
        private String deptName;
        /** 已验收需求数 */
        private Integer accepted;
        /** 一次通过率（0~1 小数，前端负责百分比展示） */
        private Double firstPassRate;
        /** 平均满意度 */
        private Double avgScore;
        /** 缺陷数 */
        private Integer defectCount;
    }

    /** 汇总指标 */
    @Data
    public static class Summary {
        /** 已验收需求数 */
        private Integer acceptedTotal;
        /** 验收一次通过率（0~1） */
        private Double firstPassRate;
        /** 平均满意度 */
        private Double avgScore;
        /** 返工总次数 */
        private Integer reworkTotal;
        /** 缺陷总数（用例未通过条数） */
        private Integer defectTotal;
        /** 致命/严重缺陷数 */
        private Integer majorDefectCount;
        /** 遗留事项转出的后续需求数 */
        private Integer followUpTotal;
        /** 有条件通过数 */
        private Integer conditionalTotal;
    }
}
