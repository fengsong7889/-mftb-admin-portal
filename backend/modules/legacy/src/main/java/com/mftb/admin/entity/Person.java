package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 人员主数据（表 person）——C2 的根。
 * <p>
 * 与 sys_user 的关系：sys_user 只保留账号、凭据、角色与登录日志（IAM 职责）；
 * 人员身份在这里，通过 {@code sys_user_id} 显式映射关联。这样"没有账号的员工"也能建档，
 * 而不是被迫先开户（方案 5.1：无账号人员可以建档）。
 * <p>
 * 为什么不把员工字段继续挂在 sys_user 上：账号是登录凭据，人员是雇佣事实，
 * 两者的生命周期不同——离职停号但人员记录要留 10 年以上，混在一张表就只能软删整行。
 */
@Data
@TableName("person")
public class Person {

    @TableId
    private Long id;

    /** 集团工号（稳定业务键，全库唯一）；未分配时为空，不得用 sys_user.id 代替 */
    private String personNo;

    /** 姓名 */
    private String name;

    /** 英文名 */
    private String nameEn;

    /** 性别：M/F/UNKNOWN */
    private String gender;

    /** 出生日期（只用于法定计算，界面按字段权限脱敏） */
    private LocalDate birthDate;

    /** 手机号 */
    private String mobile;

    /** 邮箱 */
    private String email;

    /** 国籍（ISO 3166-1 alpha-2） */
    private String nationality;

    /**
     * 账号映射：sys_user.id。为空表示"无账号人员"；唯一，一个账号只能对应一个人。
     * 不复制凭据——认证仍只在 IAM。
     */
    private Long sysUserId;

    /** 状态：1=在职体系内 0=已退出（不等于离职日期，离职以 employment 为准） */
    private Integer status;

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
