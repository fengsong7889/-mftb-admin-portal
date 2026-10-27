package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 需求关联对象实体（定位到系统/菜单/页面/功能点）
 */
@Data
@TableName("rdm_requirement_target")
public class RdmRequirementTarget {

    @TableId
    private Long id;

    /** 需求ID */
    private Long reqId;

    /** 业务系统编码 sys_system.code */
    private String systemCode;

    /** 系统名称快照 */
    private String systemName;

    /** 菜单标识 sys_menu.menu_key */
    private String menuKey;

    /** 菜单名称快照 */
    private String menuName;

    /** 页面路由路径 */
    private String pagePath;

    /** 定位粒度: NONE/SYSTEM/MENU/PAGE/FUNCTION/FIELD/BUTTON/REPORT */
    private String anchorType;

    /** 定位对象名称 */
    private String anchorName;

    /** 定位补充说明 */
    private String anchorDesc;

    /** 现状截图 */
    private String screenshotPath;

    /** 圈选标注 JSON */
    private String annotationJson;

    /** 排序 */
    private Integer sortOrder;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
