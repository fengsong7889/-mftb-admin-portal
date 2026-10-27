package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 项目成员实体
 */
@Data
@TableName("rdm_project_member")
public class RdmProjectMember {

    @TableId
    private Long id;

    /** 项目ID */
    private Long projectId;

    /** 用户ID */
    private Long userId;

    /** 工号 */
    private String empNo;

    /** 姓名 */
    private String userName;

    /** 角色:pm/product/dev_lead/dev/qa/designer/pmo */
    private String roleCode;

    /** 加入时间 */
    private LocalDateTime joinTime;

    /** 离开时间 */
    private LocalDateTime leaveTime;
}
