package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 推广词库实体
 */
@Data
@TableName("prom_word_library")
public class PromWordLibrary {

    @TableId
    private Long id;

    /** 词条 */
    private String word;

    /** 所属频道: takeaway/supermarket/groupBuy */
    private String channel;

    /** 状态: 1=啟用 2=停用 */
    private Integer status;

    /** 匹配次数 */
    private Integer matchCount;

    /** 最后更新人 */
    private String updatedBy;

    /** 备注 */
    private String remark;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
