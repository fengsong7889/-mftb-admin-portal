package com.mftb.admin.dto;

import com.mftb.admin.entity.HrPerfCycle;
import lombok.Data;
import org.springframework.beans.BeanUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 考核周期视图 */
@Data
public class HrPerfCycleVO {

    private Long id;
    private String reqNo;
    private String code;
    private String name;
    private String cycleType;
    private LocalDate periodStart;
    private LocalDate periodEnd;
    private String status;
    private String remark;
    private Integer planCount;
    private String createdBy;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static HrPerfCycleVO from(HrPerfCycle e) {
        HrPerfCycleVO vo = new HrPerfCycleVO();
        BeanUtils.copyProperties(e, vo);
        return vo;
    }
}
