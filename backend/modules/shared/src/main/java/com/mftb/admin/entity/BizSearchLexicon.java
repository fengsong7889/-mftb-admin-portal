package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 搜索词库实体（方案 §11.1「业务词条」）。
 * <p>区分业务词/实体别名/有向同义词/纠错词/禁限词；别名须有唯一实体归属，同义词有方向，
 * 禁止「类目不相关却判为等价」的过宽扩展。真实生效由搜索执行内核消费（B1，依赖 ES）。
 */
@Data
@TableName("biz_search_lexicon")
public class BizSearchLexicon {

    @TableId
    private Long id;

    private String entryNo;

    /** 类型: 1=业务词 2=实体别名 3=有向同义 4=纠错 5=禁限 */
    private Integer wordType;

    /** 原词/别名 */
    private String sourceTerm;

    /** 标准词/实体 */
    private String targetTerm;

    /** 归属实体ID（别名/精确准入用） */
    private Long entityId;

    /** 实体类型: 1=门店 2=集团 3=品牌 */
    private Integer entityType;

    private String categoryId;

    private String brand;

    /** 来源依据（必填，供审核追溯） */
    private String evidence;

    /** 1=启用 2=停用 */
    private Integer status;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
