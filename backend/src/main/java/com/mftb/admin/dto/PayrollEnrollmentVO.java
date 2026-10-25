package com.mftb.admin.dto;

import com.mftb.admin.entity.PayrollEnrollment;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 人員參保列表视图：在参保行上补「谁的哪段雇佣 + 哪个方案」。
 * <p>
 * 列表只给 employmentId/planId 是不可用的——人事看到一串数字无法核对是谁、参加了什么。
 * 这些字段只用于展示，不参与任何鉴权判断。
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class PayrollEnrollmentVO extends PayrollEnrollment {

    /** 人員姓名 */
    private String personName;

    /** 工號（人員主檔編號） */
    private String personNo;

    /** 雇傭編號 */
    private String employmentNo;

    /** 方案名稱 */
    private String planName;

    /** 方案類型 */
    private String planType;
}
