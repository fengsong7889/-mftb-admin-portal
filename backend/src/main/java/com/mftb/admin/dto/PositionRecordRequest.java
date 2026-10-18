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
    @NotNull(message = "生效日期不能為空")
    private LocalDate effectiveDate;

    /**
     * 异动动作名称（中文，展示与历史快照）。
     * <p>与 {@link #operationCode} 至少给一个：code 缺失时服务端按名称归一出 code，
     * 两者都不给则拒绝——因为「在职/离职」完全由这个动作派生。
     */
    private String operation;

    /**
     * 异动动作 code（真值见 {@link com.mftb.admin.constant.HrOperationCode}）。
     * <p>新前端优先传 code；传 code 时以 code 为准（名称仅作展示快照）。
     */
    private String operationCode;

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
