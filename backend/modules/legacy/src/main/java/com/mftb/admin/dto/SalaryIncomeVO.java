package com.mftb.admin.dto;

import com.mftb.admin.entity.EmpSalaryIncome;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 费用信息-收入项视图对象
 */
@Data
public class SalaryIncomeVO {

    private Long id;
    private Long userId;
    private String name;
    private BigDecimal amount;
    private String type;
    private String remark;
    private String createdBy;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static SalaryIncomeVO from(EmpSalaryIncome entity) {
        SalaryIncomeVO vo = new SalaryIncomeVO();
        vo.setId(entity.getId());
        vo.setUserId(entity.getUserId());
        vo.setName(entity.getName());
        vo.setAmount(entity.getAmount());
        vo.setType(entity.getType());
        vo.setRemark(entity.getRemark());
        vo.setCreatedBy(entity.getCreatedBy());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }
}
