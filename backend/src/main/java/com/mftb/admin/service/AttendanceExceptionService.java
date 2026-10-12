package com.mftb.admin.service;

import com.mftb.admin.dto.AttendanceExceptionVO;
import com.mftb.admin.dto.PageResult;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 考勤异常服务。
 * <p>
 * 边界：本页只做「发现异常 + 关闭异常」，申请与审批留在流程审批系统。
 * 补卡/请假/加班的正规路径是发起 OA 流程，审批通过后由 {@link #markHandledByFlow}
 * 回写状态；{@link #reissue} 是管理员人工补录的兜底通道，来源码单独记为「补录」，
 * 保证事后能区分"真打的卡"与"人工补的卡"。
 */
public interface AttendanceExceptionService {

    /** 分页列表 */
    PageResult<AttendanceExceptionVO> page(long page, long size, LocalDate from, LocalDate to, Long groupId, Long deptId,
                                           Integer exceptionType, Integer status);

    /** 与列表同口径的统计 */
    Map<String, Object> stats(LocalDate from, LocalDate to, Long groupId, Long deptId, Integer exceptionType,
                              Integer status);

    /**
     * 异常详情（处理页按 id 取数）。
     * <p>必须单独开一个端点：让前端拉列表再挑一条，分页一开就拿不到目标行。
     */
    AttendanceExceptionVO detail(Long id);

    /**
     * 用一张已核准的假单抵扣异常（管理员在异常处理页手工关联）。
     * <p>与 {@link #deductByLeave} 的区别：那个是审批回调自动按区间批量抵扣，
     * 本方法是人工指定单据，因此校验更严：假单必须已核准、必须属于同一人、
     * 必须覆盖该考勤日——否则可以用别人的假单把自己的旷工抹掉。
     *
     * @param exceptionId 异常 ID
     * @param leaveId     请假单 ID（hr_leave_request.id）
     */
    AttendanceExceptionVO deductByLeaveRequest(Long exceptionId, Long leaveId);

    /**
     * 可抵扣该异常的候选假单（同一人 + 已核准/已完成 + 区间覆盖该考勤日）。
     * <p>为什么不开一个「查全部假单」的口子：异常处理人不应因为要抵扣一次缺卡
     * 就得持有「請假管理」菜单权限（最小权限），也不该看到与本次处理无关的全公司假单。
     * 本方法只回能合法抵扣这一条异常的单据，且只给出选择所需的字段。
     */
    List<Map<String, Object>> leaveCandidates(Long exceptionId);

    /** 确认异常无误（不抵扣），仅待处理状态可确认 */
    Map<String, Object> confirm(List<Long> ids, String remark);

    /** 管理员人工补录打卡并关闭异常（补录后自动重算当日结论） */
    AttendanceExceptionVO reissue(Long id, LocalDateTime onTime, LocalDateTime offTime, String reason);

    /**
     * OA 审批通过后的回写入口（供流程回调调用，不对外开 HTTP 端点）。
     *
     * @param flowNo 流程编号
     * @param status 目标状态：已補卡 / 已請假抵扣 / 已加班抵扣
     */
    int markHandledByFlow(String flowNo, int status);

    /**
     * 假单审批通过后抵扣区间内的缺勤类异常。
     * <p>
     * 只抵扣「缺卡 / 曠工」两类：迟到早退是分钟级偏差，请假一天并不等于当天不迟到，
     * 混在一起抵扣会让薪酬侧的迟到扣减凭空消失。已处理行（补卡/确认）一律不动，
     * 保证同一异常不会被两条路径重复关闭。
     *
     * @return 实际抵扣的异常条数
     */
    int deductByLeave(Long userId, LocalDate from, LocalDate to, String flowNo);

    /** 待处理异常数（工作台预警用） */
    long pendingCount(LocalDate from, LocalDate to);
}
