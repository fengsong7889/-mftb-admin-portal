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
 * 用户实体
 */
@Data
@TableName("sys_user")
public class SysUser {

    @TableId
    private Long id;

    /** 登录账号 */
    private String username;

    /** 密码(BCrypt加密) */
    private String password;

    /** 姓名 */
    private String name;

    /** 员工工号 */
    private String empId;

    /** 头像 */
    private String avatar;

    /** 角色: admin/guest */
    private String role;

    /** 绑定的功能角色ID JSON数组, 如 [1,3] */
    private String functionRoles;

    /** 所在部门ID (关联 sys_department) */
    private Long departmentId;

    /** 所在部门名称快照 */
    private String department;

    /** 所在部门英文名称快照 */
    private String departmentEn;

    /** 职位ID (关联 sys_position) */
    private Long positionId;

    /** 职位名称(中文)快照 */
    private String position;

    /** 职位名称(英文)快照 */
    private String positionEn;

    /** 职级序列快照 (M=管理 T=技术 P=专业, 随职位带出) */
    private String sequence;

    /** 职级快照 (如 M3 / T5 / P2, 随职位带出) */
    private String jobLevel;

    /** 职等 (R1~R5, 新增/编辑员工时选择); rank 为 MySQL 8.0 保留字, 需加反引号 */
    @TableField("`rank`")
    private String rank;

    /** 状态: 1=启用 0=停用 */
    private Integer status;

    /** 最后活跃时间 (空闲超时检测用) */
    private LocalDateTime lastActiveAt;

    /** 当前活跃 JWT Token（单设备登录校验） */
    private String activeToken;

    /** 当前活跃设备登录 IP（被顶下线时展示给旧设备） */
    private String activeLoginIp;

    /** 强制下线操作人姓名 */
    private String forceLogoutOperator;

    /** 强制下线操作人工号 */
    private String forceLogoutEmpId;

    /** 强制下线原因: operator=管理员操作, account_disabled=账号被停用 */
    private String forceLogoutReason;

    /** 快捷入口菜单 key 列表，JSON 数组格式如 ["account-balance","batch-query"] */
    private String quickFavorites;

    /** 用户选中的在线头像 URL（IconFont/DiceBear 等外部 URL） */
    private String avatarUrl;

    // ── 个人信息 ──

    /** 国籍 */
    private String nationality;

    /** 民族 */
    private String ethnicity;

    /** 出生日期 */
    private LocalDate birthDate;

    /** 婚姻状况 */
    private String maritalStatus;

    /** 政治面貌 */
    private String politicalStatus;

    /** 宗教信仰 */
    private String religion;

    // ── 证件信息 ──

    /** 证件类型 */
    private String idType;

    /** 证件号码 */
    private String idNumber;

    /** 证件地址 */
    private String idAddress;

    /** 户籍类型 */
    private String householdType;

    /** 户籍所在地 */
    private String householdLocation;

    /** 籍贯 */
    private String nativePlace;

    // ── 通讯信息 ──

    /** 住址-国家 */
    private String addressCountry;

    /** 住址-城市 */
    private String addressCity;

    /** 住址-详细地址 */
    private String addressDetail;

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
