package com.mftb.admin.dto;

import lombok.Data;

/**
 * 归还请求 DTO
 */
@Data
public class EamReturnDTO {
    /** 领用 ID（与 borrowId 二选一） */
    private Long claimId;
    /** 借用 ID（与 claimId 二选一） */
    private Long borrowId;
    /** 归还日期 yyyy-MM-dd */
    private String returnDate;
    /** 归还原因 */
    private String returnReason;
    /** 资产状况说明 */
    private String conditionNote;
    /** 资产状况：normal/damaged/lost */
    private String assetCondition;
    /** 异常原因说明（assetCondition != normal 时必填） */
    private String exceptionReason;
    /** 实际归还人 ID（代还场景） */
    private Long actualReturneeId;
    /** 实际归还人姓名 */
    private String actualReturneeName;
    /** 凭证 Data URL */
    private String evidenceDataUrl;
    /** 凭证文件名 */
    private String evidenceFileName;
    /** 接收管理部门（正常归还归位用，空则保持原归属部门） */
    private String receiveDepartment;
    /** 归还位置 ID（空则保持原位置） */
    private Long receiveLocationId;
}
