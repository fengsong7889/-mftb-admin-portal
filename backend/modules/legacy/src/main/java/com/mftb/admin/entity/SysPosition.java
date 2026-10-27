package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 集团人事-职位实体
 */
@Data
@TableName("sys_position")
public class SysPosition {

    @TableId
    private Long id;

    /** 职位ID（按编号生成规则 position_id 生成，如 ZW00001） */
    private String code;

    /** 职位名称 */
    private String name;

    /** 职位英文名称 */
    private String nameEn;

    /** 职级序列: M=管理 T=技术 P=专业 */
    private String sequence;

    /** 职级 (如 M3 / T5 / P2) */
    private String jobLevel;

    /** 职等 (R1~R5, R1最低 R5最高); rank 为 MySQL 8.0 保留字, 需加反引号 */
    @TableField("`rank`")
    private String rank;

    /** 最后更新人 */
    private String updatedBy;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
