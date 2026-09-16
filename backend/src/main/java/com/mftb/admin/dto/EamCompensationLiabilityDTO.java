package com.mftb.admin.dto;

import lombok.Data;

/**
 * 赔付定责请求 DTO
 */
@Data
public class EamCompensationLiabilityDTO {
    /** 赔付记录 ID */
    private Long compensationId;
    /** 责任对象：employee/department/company/none */
    private String party;
    /** 责任人 ID */
    private Long responsibleId;
    /** 责任人姓名 */
    private String responsibleName;
    /** 责任部门 */
    private String department;
    /** 原因：human/natural/third_party/quality */
    private String cause;
    /** 应赔金额（分） */
    private Long amount;
    /** 定责依据 */
    private String basis;
}
