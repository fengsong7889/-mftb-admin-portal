package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 組織編制-職務族（表 {@code org_job_family}）。
 * <p>
 * 職務族是「同類工作」的歸類（職能/研發/銷售/門店營運），職位職級挂在族下，
 * 崗位實例再挂到職位職級上。三層分開而不是一張萬能「職位字典」的原因：
 * 族決定能力模型與發展通道，職級決定薪酬帶寬，崗位決定編制占用，三者的變更節奏完全不同。
 */
@Data
@TableName("org_job_family")
public class OrgJobFamily {

    @TableId
    private Long id;

    /** 職務族編碼（穩定業務鍵，全庫唯一） */
    private String code;

    /** 職務族名稱 */
    private String name;

    /** 英文名稱 */
    private String nameEn;

    /** 狀態：1=啟用 0=停用 */
    private Integer status;

    /** 排序（升序） */
    private Integer sortOrder;

    /** 備註 */
    private String remark;

    /** 最後更新人（服務層按登錄帳號覆蓋） */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
