package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 組織編制-管理組織（表 {@code org_unit}）。
 * <p>
 * 與 {@code sys_department} 的關係：舊部門表被權限（部門授權、數據範圍）與大量業務
 * 直接引用，本批不動它；{@code org_unit} 是「管理組織」的新模型，帶法人歸屬與物化路徑，
 * 供後續 Person/Employment/Assignment 使用。切換期採「舊域寫 + 新域影子校驗」，
 * 不雙寫兩份主檔（方案 8.2 / 13.3）。
 * <p>
 * {@code path} 存形如 {@code /1/5/9} 的祖先鏈：子樹查詢一條 SQL 即可，不必遞歸回查；
 * 移動組織時必須同時刷新子樹 path，服務層用「舊前綴 → 新前綴」批量替換。
 */
@Data
@TableName("org_unit")
public class OrgUnit {

    @TableId
    private Long id;

    /** 組織編碼（穩定業務鍵，全庫唯一） */
    private String code;

    /** 組織名稱 */
    private String name;

    /** 英文名稱 */
    private String nameEn;

    /** 上級組織 ID（頂級為 null） */
    private Long parentId;

    /** 所屬法人 ID：組織必須落在某個雇主法人下，禁止跨法人共享同一棵樹 */
    private Long legalEntityId;

    /** 組織類型：COMPANY / DEPARTMENT / BUSINESS_UNIT */
    private String unitType;

    /** 負責人姓名（人員主檔就緒前先存姓名，避免用 sys_user 冒充負責人） */
    private String leaderName;

    /** 物化祖先路徑：/1/5/9，含自身 ID */
    private String path;

    /** 狀態：1=啟用 0=停用 */
    private Integer status;

    /** 排序（同級升序） */
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
