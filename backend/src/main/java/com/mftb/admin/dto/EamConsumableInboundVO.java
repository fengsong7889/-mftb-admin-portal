package com.mftb.admin.dto;

import lombok.Data;
import java.time.LocalDate;
import java.util.List;

/** 入库单展示 VO */
@Data
public class EamConsumableInboundVO {
    private Long id;
    private String inboundNo;
    private String inboundType;
    private Long companyBrand;
    private String companyBrandName;
    private Long purchaseCompanyId;
    private String purchaseCompany;
    private Long supplierId;
    private String supplierName;
    private Long poId;
    private String poNo;
    private LocalDate bizDate;
    private String remark;
    private String createdBy;
    private String createdAt;
    /** 入库明细 */
    private List<EamConsumableInboundItemVO> items;
    /** 入库总数量（合计） */
    private Integer totalQty;
    /** 入库总金额 */
    private java.math.BigDecimal totalAmount;
}
