package com.mftb.admin.dto;

import lombok.Data;

/**
 * 归还记录查询参数
 */
@Data
public class EamReturnQuery {
    /** 页码 */
    private Integer page = 1;
    /** 每页大小 */
    private Integer size = 10;
    /** 关键词（归还单号/资产编号/归还人） */
    private String keyword;
    /** 归还单号（精确/模糊） */
    private String returnNo;
    /** 资产编号或名称（模糊） */
    private String assetKeyword;
    /** 领用人姓名（模糊） */
    private String empName;
    /** 实际归还人姓名（模糊） */
    private String actualReturneeName;
    /** 来源类型：claim/borrow */
    private String sourceType;
    /** 归还状态：completed/exception_pending/exception_closed */
    private String returnStatus;
    /** 资产状况：normal/damaged/lost */
    private String assetCondition;
    /** 开始日期 yyyy-MM-dd */
    private String startDate;
    /** 结束日期 yyyy-MM-dd */
    private String endDate;
    /** 领用时部门 ID（通过员工部门过滤） */
    private Long departmentId;
}
