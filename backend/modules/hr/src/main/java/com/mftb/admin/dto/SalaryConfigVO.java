package com.mftb.admin.dto;

import com.mftb.admin.entity.EmpSalaryConfig;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 费用信息-薪资配置视图对象
 */
@Data
public class SalaryConfigVO {

    private Long id;
    private Long userId;
    private String salaryStructure;
    private String paymentMethod;
    private Integer payDay;
    private String bankName;
    private String bankAccount;
    private String taxCity;
    private String updatedBy;
    private LocalDateTime updatedAt;

    public static SalaryConfigVO from(EmpSalaryConfig entity) {
        SalaryConfigVO vo = new SalaryConfigVO();
        vo.setId(entity.getId());
        vo.setUserId(entity.getUserId());
        vo.setSalaryStructure(entity.getSalaryStructure());
        vo.setPaymentMethod(entity.getPaymentMethod());
        vo.setPayDay(entity.getPayDay());
        vo.setBankName(entity.getBankName());
        vo.setBankAccount(entity.getBankAccount());
        vo.setTaxCity(entity.getTaxCity());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }
}
