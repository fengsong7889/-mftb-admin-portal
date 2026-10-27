package com.mftb.admin.dto;

import com.mftb.admin.entity.HrPerfPlan;
import lombok.Data;
import org.springframework.beans.BeanUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 考核计划视图（附各阶段人数统计，供进度看板使用） */
@Data
public class HrPerfPlanVO {

    private Long id;
    private String reqNo;
    private Long cycleId;
    private String cycleName;
    private Long templateId;
    private String templateName;
    private String name;
    private String scopeJson;
    private LocalDate selfStart;
    private LocalDate selfEnd;
    private LocalDate supStart;
    private LocalDate supEnd;
    private LocalDate calibEnd;
    private String status;
    private String flowNo;
    private String summary;
    private Integer total;
    private Integer selfPending;
    private Integer supervisorPending;
    private Integer calibrationPending;
    private Integer confirmPending;
    private Integer confirmed;
    /** 未指派评估人数量：发起后必须让 HR 看到这个缺口，否则会静默卡住流程 */
    private Integer unassigned;
    private String updatedBy;
    private LocalDateTime updatedAt;

    public static HrPerfPlanVO from(HrPerfPlan e) {
        HrPerfPlanVO vo = new HrPerfPlanVO();
        BeanUtils.copyProperties(e, vo);
        return vo;
    }
}
