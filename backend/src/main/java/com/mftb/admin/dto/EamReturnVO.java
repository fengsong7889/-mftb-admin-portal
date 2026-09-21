package com.mftb.admin.dto;

import lombok.Data;
import java.util.Map;

/**
 * 归还记录视图 VO
 */
@Data
public class EamReturnVO {
    private Long id;
    private String returnNo;
    private String sourceType;
    private Long sourceId;
    private Long claimId;
    private Long borrowId;
    private Long assetId;
    private String assetNo;
    private String assetName;
    /** 当前台账配置，只读。 */
    private Map<String, Object> params;
    private String categoryCode;
    private Long employeeId;
    private String empName;
    /** 领用人工号 */
    private String empNo;
    /** 领用时部门 */
    private String department;
    private String operatorName;
    private Long operatorId;
    /** 归还接收人工号 */
    private String operatorNo;
    private String returnDate;
    private String returnReason;
    private String conditionNote;
    private String returnStatus;
    private String assetCondition;
    private String exceptionReason;
    private String disposition;
    private String dispositionDate;
    private Integer recovered;
    private String recoveredDate;
    private String recoveredNote;
    private Long actualReturneeId;
    private String actualReturneeName;
    /** 实际归还人工号 */
    private String actualReturneeNo;
    private Long compensationId;
    /** 关联维修记录 ID */
    private Long repairId;
    private String createdAt;
    private String updatedAt;
    /** 凭证 Data URL */
    private String evidenceImageUrl;
}
