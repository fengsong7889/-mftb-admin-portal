package com.mftb.admin.dto;

import lombok.Data;

/**
 * 交接记录查询参数
 */
@Data
public class EamHandoverQuery {
    /** 页码 */
    private Integer page = 1;
    /** 每页大小 */
    private Integer size = 10;
    /** 关键词（交接单号/交出人/接收人，保留兼容旧调用） */
    private String keyword;
    /** 部门（保留兼容旧调用） */
    private String department;
    /** 交接单号（模糊匹配） */
    private String handoverNo;
    /** 原使用人（交出人） */
    private String fromUserName;
    /** 目标使用人（接收人） */
    private String toUserName;
    /** 交接前部门（按部门名称快照精确匹配） */
    private String fromDepartment;
    /** 交接后部门（按部门名称快照精确匹配） */
    private String toDepartment;
    /** 交接时间起（yyyy-MM-dd） */
    private String handoverDateStart;
    /** 交接时间止（yyyy-MM-dd） */
    private String handoverDateEnd;
    /** 交接原因（resign/transfer/other） */
    private String reason;
    /** 经办人 */
    private String operatorName;
    /** 接收人类型（employee/department） */
    private String receiverType;
}
