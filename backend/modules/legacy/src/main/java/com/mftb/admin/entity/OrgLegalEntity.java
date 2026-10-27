package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 組織編制-法人主體（表 {@code org_legal_entity}）。
 * <p>
 * 為什麼要與 {@code sys_hr_dict.EMPLOYER_COMPANY} 分開：字典只是下拉選項，
 * 沒有法域、註冊號、核實狀態，也掛不了組織、合同與薪資規則。法人主體是雇佣關係的
 * 法律一方（Employment 的雇主），必須獨立成表並可追溯到登記證照。
 * <p>
 * 購買公司、品牌、商家集團都不能直接當法人使用；舊字典數據遷入時一律
 * {@code verify_status=0}（待核實），不冒充已核實的法定事實。
 */
@Data
@TableName("org_legal_entity")
public class OrgLegalEntity {

    @TableId
    private Long id;

    /** 法人編碼（穩定業務鍵，全庫唯一） */
    private String code;

    /** 法人全稱（與營業執照一致） */
    private String name;

    /** 英文名稱 */
    private String nameEn;

    /** 法域：CN / HK / MO，不等於工作地或國籍 */
    private String jurisdiction;

    /** 登記證照號：內地統一社會信用代碼 / 香港商業登記號 / 澳門商業登記編號 */
    private String registrationNo;

    /** 註冊地址 */
    private String registeredAddress;

    /** 核實狀態：0=待核實 1=已核實；未核實不得用於正式計薪 */
    private Integer verifyStatus;

    /** 狀態：1=啟用 0=停用 */
    private Integer status;

    /** 排序（升序） */
    private Integer sortOrder;

    /** 備註 */
    private String remark;

    /** 最後更新人（寫入時由服務層按登錄帳號覆蓋，不接受前端傳入） */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
