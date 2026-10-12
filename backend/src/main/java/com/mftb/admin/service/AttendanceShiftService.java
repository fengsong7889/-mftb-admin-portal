package com.mftb.admin.service;

import com.mftb.admin.dto.AttendanceShiftVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AttShift;

import java.util.List;
import java.util.Map;

/**
 * 考勤班次服务（假勤基础数据）。
 * <p>
 * 班次是排班与考勤判定的时间基准：停用不删历史，只是不能再被新排班引用。
 */
public interface AttendanceShiftService {

    /** 分页查询班次 */
    PageResult<AttendanceShiftVO> list(long page, long size, String keyword, Integer flexFlag, String status);

    /**
     * 与列表同口径的统计（总数 / 启用 / 弹性 / 标准工时合计）。
     * <p>统计卡必须跟随筛选条件，因此与列表共用同一条件构造器；
     * 分页后前端只有当页数据，自己求和会得到错误口径。
     */
    Map<String, Object> stats(String keyword, Integer flexFlag, String status);

    /**
     * 班次详情（编辑/详情页取数）。
     * <p>必须单独开一个端点：让前端拉全量列表再挑一条，分页一开就拿不到目标行。
     */
    AttendanceShiftVO detail(Long id);

    /** 启用中的班次下拉（排班/考勤组表单用） */
    List<Map<String, Object>> options();

    /** 新建或更新班次（带 id 即更新；编辑时 shiftCode 为稳定身份，不接受改写） */
    AttendanceShiftVO save(AttShift shift);

    /** 启停班次 */
    AttendanceShiftVO changeStatus(Long id, String status);

    /** 删除班次（被考勤组或排班引用时拒绝） */
    void delete(Long id);
}
