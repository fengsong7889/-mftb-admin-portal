package com.mftb.admin.service;

import com.mftb.admin.dto.AttendanceGroupVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttGroupMember;

import java.util.List;
import java.util.Map;

/**
 * 考勤组服务（考勤结论的最小计算单位）。
 */
public interface AttendanceGroupService {

    /** 分页查询考勤组（带班次名与当前生效成员数） */
    PageResult<AttendanceGroupVO> list(long page, long size, String keyword, Integer groupType, String status);

    /** 考勤组详情 */
    AttendanceGroupVO detail(Long id);

    /**
     * 与列表同口径的统计（总数 / 启用 / 覆盖人数 / 未绑班次）。
     * <p>统计卡必须跟随筛选条件；分页后前端只有当页数据，自己求和会得到错误口径。
     */
    Map<String, Object> stats(String keyword, Integer groupType, String status);

    /** 新建或更新考勤组（带 id 即更新；编号由服务端生成，不接受前端传入） */
    AttGroup save(AttGroup group);

    /** 启停 */
    AttGroup changeStatus(Long id, String status);

    /** 删除（存在成员或排班时拒绝） */
    void delete(Long id);

    /** 当前生效成员清单 */
    List<AttGroupMember> currentMembers(Long groupId);

    /**
     * 差量维护成员：新增的开启新期间，移除的把生效止闭合（不物理删除）。
     * <p>返回 added / closed 两个计数，供界面提示"本次影响了多少人"。
     */
    Map<String, Object> syncMembers(Long groupId, List<Long> userIds);
}
