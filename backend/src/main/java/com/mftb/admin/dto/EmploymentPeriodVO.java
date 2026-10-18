package com.mftb.admin.dto;

import com.mftb.admin.entity.HrEmploymentPeriod;
import lombok.Data;

import java.time.LocalDate;

/**
 * 雇佣期间视图。
 * <p>{@code startDateSource} 必须一路带到界面：没有它，「入职日期」这一列就分不清
 * 是任职事实、HR 确认值，还是根本还没核实。
 */
@Data
public class EmploymentPeriodVO {

    private Long id;
    private Long userId;
    private Integer periodSeq;
    private String employerCompany;
    private String workLocation;
    private String employeeCategory;
    private LocalDate startDate;
    private String startDateSource;
    private LocalDate probationEndDate;
    private LocalDate regularDate;
    private LocalDate endDate;
    private String endReason;
    private String status;
    private String sourceReqNo;

    public static EmploymentPeriodVO from(HrEmploymentPeriod entity) {
        if (entity == null) {
            return null;
        }
        EmploymentPeriodVO vo = new EmploymentPeriodVO();
        vo.setId(entity.getId());
        vo.setUserId(entity.getUserId());
        vo.setPeriodSeq(entity.getPeriodSeq());
        vo.setEmployerCompany(entity.getEmployerCompany());
        vo.setWorkLocation(entity.getWorkLocation());
        vo.setEmployeeCategory(entity.getEmployeeCategory());
        vo.setStartDate(entity.getStartDate());
        vo.setStartDateSource(entity.getStartDateSource());
        vo.setProbationEndDate(entity.getProbationEndDate());
        vo.setRegularDate(entity.getRegularDate());
        vo.setEndDate(entity.getEndDate());
        vo.setEndReason(entity.getEndReason());
        vo.setStatus(entity.getStatus());
        vo.setSourceReqNo(entity.getSourceReqNo());
        return vo;
    }
}
