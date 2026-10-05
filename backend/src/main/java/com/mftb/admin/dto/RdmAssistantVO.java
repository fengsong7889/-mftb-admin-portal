package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * RDM AI 辅助出参（M4+）：相似需求查重、PRD 草稿、逾期风险摘要。
 *
 * <p>三者的可信度等级不同，出参结构也不同，这是刻意区分的：
 * <ul>
 *   <li>查重：确定性算法，结果不含 AI 生成内容，可直接作为决策依据；</li>
 *   <li>PRD 草稿：AI 生成，必须带 {@code aiGenerated=true} 与模型标识，前端要标注「待人工确认」；</li>
 *   <li>风险摘要：数据部分是确定性统计，文字部分才是 AI；AI 不可用时 {@code aiUsed=false}
 *       仍返回结构化摘要，绝不让整块功能因为大模型挂掉而空白。</li>
 * </ul>
 */
public final class RdmAssistantVO {

    private RdmAssistantVO() {
    }

    /** 相似需求候选 */
    @Data
    public static class SimilarItem {
        private Long reqId;
        private String reqNo;
        private String title;
        private String status;
        private String reqType;
        private String priority;
        private String submitterName;
        private String submitDeptName;
        private String pmName;
        private String submitTime;
        /** 相似度 0~1（Dice 系数 + 锚点/同提出人加权） */
        private Double similarity;
        /** 命中的关键词（让"为什么判它相似"可见，不报黑箱分数） */
        private List<String> matchedTerms = new ArrayList<>();
        /** 是否同一提出人（重复提交的高发场景） */
        private Boolean sameSubmitter;
        /** 该需求是否仍在途（终态的相似项不该阻止新需求，只需参考） */
        private Boolean inProgress;
    }

    /** 查重结果 */
    @Data
    public static class SimilarResult {
        private String queryTitle;
        private List<SimilarItem> items = new ArrayList<>();
        /** 是否建议先复用/追加评论而不是新建 */
        private Boolean duplicateSuspect;
        /** 算法与阈值说明（可解释） */
        private String method;
    }

    /** PRD 草稿（AI 生成，需人工确认） */
    @Data
    public static class PrdDraft {
        private Long reqId;
        private String title;
        private String targetUsers;
        private List<String> featureList = new ArrayList<>();
        private List<String> acceptanceCriteria = new ArrayList<>();
        private String boundary;
        private String risks;
        /** 是否由大模型生成（前端据此显示「AI 草稿待确认」徽标） */
        private Boolean aiGenerated;
        /** 实际使用的模型，便于追溯 */
        private String model;
        /** 本次消耗 tokens（与 AI 使用统计同一账本） */
        private Long tokens;
        /** AI 不可用时的提示语（前端原样展示，不静默） */
        private String notice;
    }

    /** 风险摘要 */
    @Data
    public static class RiskSummary {
        /** 统计窗口天数 */
        private Integer days;
        /** AI 生成的管理摘要文本（可能为模板文字） */
        private String narrative;
        /** 是否用了大模型（false 表示降级为模板拼接） */
        private Boolean aiUsed;
        private String model;
        /** 结构化要点（无论 AI 是否可用都有值，是真正可行动的部分） */
        private List<String> highlights = new ArrayList<>();
        /** 需要点名跟进的风险需求 */
        private List<RiskItem> topRisks = new ArrayList<>();
        private String notice;
    }

    /** 风险条目 */
    @Data
    public static class RiskItem {
        private Long reqId;
        private String reqNo;
        private String title;
        private String status;
        private String handler;
        private Integer days;
        private String riskType;
    }
}
