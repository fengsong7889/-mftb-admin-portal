package com.mftb.admin.dto;

import lombok.Data;

/**
 * 有机评分规则分值更新请求体（表格内联编辑）
 */
@Data
public class RuleScoreUpdateDTO {

    /** 规则分值 */
    private Integer score;
}
