package com.mftb.admin.dto;

import com.mftb.admin.entity.HrPerfCalibrationLog;
import lombok.Data;
import org.springframework.beans.BeanUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 改判留痕视图（只读流水，供留痕追溯页与考核单详情时间线共用） */
@Data
public class HrPerfCalibrationLogVO {

    private Long id;
    private Long assessmentId;
    private Long planId;
    private Long userId;
    private String empNo;
    private String empName;
    private String deptName;
    private String action;
    private BigDecimal beforeScore;
    private String beforeGrade;
    private BigDecimal afterScore;
    private String afterGrade;
    private String reason;
    private Long refAppealId;
    private Long operatorUserId;
    private String operatorName;
    private LocalDateTime createdAt;
    /** 关联计划名称（由服务层补填，非流水表字段） */
    private String planName;

    public static HrPerfCalibrationLogVO from(HrPerfCalibrationLog e) {
        HrPerfCalibrationLogVO vo = new HrPerfCalibrationLogVO();
        BeanUtils.copyProperties(e, vo);
        return vo;
    }
}
