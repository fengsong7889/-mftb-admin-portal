package com.mftb.admin.dto;

import com.mftb.admin.entity.HrPerfAppeal;
import lombok.Data;
import org.springframework.beans.BeanUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 绩效申诉视图（HR 台账与员工自助共用；员工侧数据范围在服务端收敛到本人） */
@Data
public class HrPerfAppealVO {

    private Long id;
    private String reqNo;
    private Long assessmentId;
    private Long planId;
    private Long userId;
    private String empNo;
    private String empName;
    private String deptName;
    private String planName;
    private String reason;
    private String expectation;
    private String status;
    private Long handlerUserId;
    private String handlerName;
    private LocalDateTime handledAt;
    private String conclusion;
    private LocalDateTime createdAt;
    /** 关联考核单当前结果，便于受理时当场对照（由服务层补填，非申诉表字段） */
    private BigDecimal finalScore;
    private String finalGrade;
    /** 该申诉是否已触发过结果修订 */
    private Boolean revised;

    public static HrPerfAppealVO from(HrPerfAppeal e) {
        HrPerfAppealVO vo = new HrPerfAppealVO();
        BeanUtils.copyProperties(e, vo);
        return vo;
    }
}
