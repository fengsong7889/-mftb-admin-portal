package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 考勤异常「确认无误」请求（批量）。
 * <p>
 * 确认等于承认这条异常真实存在且不抵扣，会直接影响薪酬扣减，因此 remark 是合规解释凭据，
 * 由服务层追加到异常明细尾部而不是另建一张备注表——查询异常时必须能一眼看到为什么被确认。
 */
@Data
public class AttendanceExceptionConfirmRequest {

    private List<Long> ids;

    private String remark;
}
