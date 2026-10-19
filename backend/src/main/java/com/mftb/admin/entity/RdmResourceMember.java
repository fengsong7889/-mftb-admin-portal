package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * RDM 资源名册实体（阶段 B-2：团队负载纳入人员）。
 *
 * <p>为什么需要名册：B-1 的团队负载人员全集来自「在途项目成员 ∪ 各单据负责人」，
 * 仍无法纳入「已进研发协作名册、但当前无任何在途需求/任务/批次」的人——而这类
 * 「不忙的人」正是分派时最该被看见的。名册把「谁纳入团队负载」显式化，与是否有单据解耦。
 *
 * <p>纳入口径：status=1 在册、0 移出（名册记录不物理删，靠 status 管理，保留历史）。
 * 名册纳入 ≠ 授予业务权限：能否被派活仍由各来源单据的动作权限与资格守卫判定。
 */
@Data
@TableName("rdm_resource_member")
public class RdmResourceMember {

    @TableId
    private Long id;

    /** 员工 sys_user.id（一人一条，uk_rrm_user） */
    private Long userId;

    /** 工号快照 */
    private String empNo;

    /** 姓名快照 */
    private String userName;

    /** 部门快照 */
    private String dept;

    /** 岗位角色 JSON 数组：pm/product/dev/designer/qa/ops/pmo（一人可兼多岗） */
    private String roleCodes;

    /** 每周默认容量（人时）；空则按工作日 8h 推算，个人例外仍走 rdm_work_calendar */
    private BigDecimal weeklyCapacityHours;

    /** 状态：1=纳入名册 0=移出 */
    private Integer status;

    /** 备注 */
    private String remark;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
