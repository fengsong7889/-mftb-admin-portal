package com.mftb.admin.dto;

import com.mftb.admin.entity.EmpSalaryDeduction;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 费用信息-扣除项视图对象
 */
@Data
public class SalaryDeductionVO {

    private Long id;
    private Long userId;
    private String name;
    private BigDecimal rate;
    private BigDecimal amount;
    private String remark;
    private String createdBy;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static SalaryDeductionVO from(EmpSalaryDeduction entity) {
        SalaryDeductionVO vo = new SalaryDeductionVO();
        vo.setId(entity.getId());
        vo.setUserId(entity.getUserId());
        vo.setName(entity.getName());
        vo.setRate(entity.getRate());
        vo.setAmount(entity.getAmount());
        vo.setRemark(entity.getRemark());
        vo.setCreatedBy(entity.getCreatedBy());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }
}
