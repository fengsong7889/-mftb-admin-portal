package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

/**
 * 职务记录新增/编辑请求
 */
@Data
public class PositionRecordRequest {

    // 变动信息
    @NotNull(message = "生效日期不能为空")
    private LocalDate effectiveDate;

    @NotBlank(message = "操作类型不能为空")
    private String operation;

    private String reason;

    // 任职信息
    private String serviceDept;
    private String sequenceType;
    private String positionLevel;
    private String rankCode;
    private String company;
    private String employeeCategory;
    private String workSystem;
    private String positionName;
    private String directSuperior;
    private String mentor;

    // 工作信息
    private String workCountry;
    private String workCity;
    private String officeAddress;
    private String contractLocation;
}
