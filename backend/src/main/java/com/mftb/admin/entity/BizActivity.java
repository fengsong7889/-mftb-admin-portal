package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 系统活动实体
 * <p>
 * 活动会定期启动/停用，自然流量「活动加分」规则通过活动ID关联活动名称与状态。
 */
@Data
@TableName("biz_activity")
public class BizActivity {

    @TableId
    private Long id;

    /** 活动ID（业务编号，如 HD000001） */
    private String activityNo;

    /** 活动名称 */
    private String name;

    /** 活动状态: 1=启动 2=停用 */
    private Integer status;

    /** 活动开始时间 */
    private LocalDateTime startTime;

    /** 活动结束时间 */
    private LocalDateTime endTime;

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
