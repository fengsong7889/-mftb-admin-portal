package com.mftb.admin.dto;

import com.mftb.admin.entity.HrPerfAssessment;
import com.mftb.admin.entity.HrPerfScoreItem;
import lombok.Data;
import org.springframework.beans.BeanUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 考核单视图。
 * <p>
 * 注意：上级评分、校准与最终结果等敏感字段只在授权视图下填充；
 * 员工自助取未确认单据时由服务层调用 {@link #forSelf(HrPerfAssessment)} 生成，
 * 该方法刻意不复制敏感列，避免"忘了置空"导致提前泄露。
 */
@Data
public class HrPerfAssessmentVO {

    private Long id;
    private String reqNo;
    private Long planId;
    private String planName;
    private Long userId;
    private String empNo;
    private String empName;
    private Long deptId;
    private String deptName;
    private String sequenceType;
    private String positionName;
    private String positionLevel;
    private Long evaluatorUserId;
    private String evaluatorName;
    private String status;
    private BigDecimal selfScore;
    private String selfComment;
    private LocalDateTime selfAt;
    private BigDecimal supervisorScore;
    private String supervisorComment;
    private LocalDateTime supervisorAt;
    private BigDecimal calibratedScore;
    private String calibratedGrade;
    private String calibratedBy;
    private String calibratedReason;
    private BigDecimal finalScore;
    private String finalGrade;
    private LocalDateTime confirmedAt;
    private String appliedNote;
    private String remark;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<ItemVO> items;

    public static HrPerfAssessmentVO from(HrPerfAssessment e) {
        HrPerfAssessmentVO vo = new HrPerfAssessmentVO();
        BeanUtils.copyProperties(e, vo);
        return vo;
    }

    /** 员工自助视图：仅本人且已确认时可见评分与等级，未确认只回状态与自己的提交 */
    public static HrPerfAssessmentVO forSelf(HrPerfAssessment e) {
        HrPerfAssessmentVO vo = new HrPerfAssessmentVO();
        BeanUtils.copyProperties(e, vo, "supervisorScore", "supervisorComment", "supervisorAt",
                "calibratedScore", "calibratedGrade", "calibratedBy", "calibratedReason",
                "finalScore", "finalGrade", "confirmedAt", "appliedNote");
        return vo;
    }

    /** 指标打分明细视图 */
    @Data
    public static class ItemVO {
        private Long id;
        private Long indicatorId;
        private String indicatorName;
        private BigDecimal weight;
        private String targetValue;
        /** 系统建议分（RDM 推送写入，供 HR 校准参考；撤回后为空） */
        private BigDecimal suggestedScore;
        /** 建议值来源（如 RDM） */
        private String suggestedSource;
        /** 建议值写入时间 */
        private LocalDateTime suggestedAt;
        private BigDecimal selfScore;
        private BigDecimal supervisorScore;
        private BigDecimal finalScore;
        private String remark;

        public static ItemVO from(HrPerfScoreItem e) {
            ItemVO vo = new ItemVO();
            BeanUtils.copyProperties(e, vo);
            return vo;
        }
    }
}
