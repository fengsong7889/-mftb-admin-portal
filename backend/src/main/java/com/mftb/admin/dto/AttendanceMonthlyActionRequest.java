package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 月度考勤汇总的批量状态推进请求（冻结 / 同步薪酬）。
 * <p>
 * 只收 id 列表，不收月份与工时等任何数值：冻结的语义是「把已经算好的这份数据定稿」，
 * 允许前端带数值就等于允许在冻结瞬间改数，薪酬对账会失去基准。
 */
@Data
public class AttendanceMonthlyActionRequest {

    private List<Long> ids;
}
