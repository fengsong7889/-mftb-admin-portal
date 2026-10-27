package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 组织编制-职位职级（表 org_job_grade）。
 * <p>
 * 职位是工作内容（薪酬核算专员），职级是相对层级（P5）。两者合成一条记录而不是
 * 拆成职位表 + 职级表：本项目的职级是挂在具体职位上的（同族内不同职位可有不同带宽），
 * 拆开会产生大量「职位×职级」空组合，反而让编制与定薪选错。
 * <p>
 * job_family_id 用外键而非软引用：职位脱离职务族就套不上能力模型与薪酬带宽，
 * 由数据库兜住比只靠服务层检查可靠。
 */
@Data
@TableName("org_job_grade")
public class OrgJobGrade {

    @TableId
    private Long id;

    /** 职位编码（稳定业务键，全库唯一） */
    private String code;

    /** 职位名称 */
    private String name;

    /** 英文名称 */
    private String nameEn;

    /** 所属职务族 ID */
    private Long jobFamilyId;

    /** 职级序号（同族内升序比较，数字越大层级越高） */
    private Integer gradeLevel;

    /** 状态：1=启用 0=停用 */
    private Integer status;

    /** 排序（升序） */
    private Integer sortOrder;

    /** 备注 */
    private String remark;

    /** 最后更新人（服务层按登录账号覆盖） */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
