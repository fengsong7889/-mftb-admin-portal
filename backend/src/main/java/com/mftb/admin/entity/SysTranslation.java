package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 多语言配置-翻译字段实体
 * <p>
 * field_key 全局唯一（程序匹配依据）; field_name 仅业务识别用, 允许重复
 */
@Data
@TableName("sys_translation")
public class SysTranslation {

    @TableId
    private Long id;

    /** 字段Key, 全局唯一, 如 common.add / biz.coupon / menu.home */
    private String fieldKey;

    /** 字段名称（业务人员识别用，允许重复） */
    private String fieldName;

    /** 分类: common/status/action/menu/biz/ui */
    private String category;

    /** 翻译 JSON: {"zh-TW":"新增","en":"Add","ja":"追加"} */
    private String translationsJson;

    /** 来源: manual=手动新增 sync=系统同步 */
    private String source;

    /** 最后更新人 */
    private String updatedBy;

    /** 保留列, 恒为 0; 配置表采用物理删除, 避免逻辑删除行占用 field_key 唯一键导致重建冲突 */
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
