package com.mftb.admin.service;

import com.mftb.admin.dto.AttendanceHolidayVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AttHoliday;

import java.util.List;

/**
 * 考勤节假日日历服务。
 * <p>
 * 节假日改变「应出勤」基数与加班倍率，因此一天只允许一条结论；停用而非删除，
 * 已冻结月份不回溯重算。
 */
public interface AttendanceHolidayService {

    /** 分页查询日历（按年度/类型/关键字/状态） */
    PageResult<AttendanceHolidayVO> list(long page, long size, Integer yearNo, Integer holidayType, String keyword, String status,
                                         String sortField, String sortOrder);

    /** 详情（编辑/详情页取数） */
    AttendanceHolidayVO detail(Long id);

    /**
     * 与列表同口径的统计（总数 / 法定 / 调休上班 / 公司假期）。
     * <p>统计卡必须跟随筛选条件；分页后前端只有当页数据，自己求和会得到错误口径。
     */
    java.util.Map<String, Object> stats(Integer yearNo, Integer holidayType, String keyword, String status);

    /** 某年度全部日历（排班与汇总计算按年加载，避免逐日查库） */
    List<AttendanceHolidayVO> listByYear(Integer yearNo);

    /** 新建或更新（带 id 即更新；yearNo 由服务端按日期推导，不接受前端传入） */
    AttendanceHolidayVO save(AttHoliday holiday);

    /** 启停 */
    AttendanceHolidayVO changeStatus(Long id, String status);

    /** 删除 */
    void delete(Long id);
}
