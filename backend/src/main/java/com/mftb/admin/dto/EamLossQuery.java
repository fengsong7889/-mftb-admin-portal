package com.mftb.admin.dto;

import lombok.Data;

/**
 * 遗失单查询参数
 */
@Data
public class EamLossQuery {
    /** 页码 */
    private Integer page = 1;
    /** 每页大小 */
    private Integer size = 10;
    /** 关键词（遗失单号/资产编号/资产名称/原持有人） */
    private String keyword;
    /** 遗失单号（模糊） */
    private String lossNo;
    /** 资产编号或名称（模糊） */
    private String assetKeyword;
    /** 原持有人姓名（模糊） */
    private String originalHolderName;
    /** 来源类型：claim/borrow/return/direct */
    private String sourceType;
    /** 状态：searching/found_pending/recovered/written_off */
    private String status;
    /** 赔付状态（关联赔付记录的状态） */
    private String compensationStatus;
    /** 归属部门（模糊） */
    private String department;
    /** 开始日期 yyyy-MM-dd（登记日期） */
    private String startDate;
    /** 结束日期 yyyy-MM-dd（登记日期） */
    private String endDate;
    /** 最后更新人（模糊） */
    private String updatedBy;
    /** 最后更新开始日期 yyyy-MM-dd */
    private String updateStartDate;
    /** 最后更新结束日期 yyyy-MM-dd */
    private String updateEndDate;
    /** 所属品牌（sys_company_brand.id） */
    private Integer companyBrand;
}
