package com.mftb.admin.service;

/**
 * 考勤域的 OA 审批回调服务。
 * <p>
 * 独立成接口有两个原因：
 * ① 与 {@code HrLeaveCallbackService} 一样打断 {@code OaRequestServiceImpl} 与业务域的构造器循环依赖，
 *    本实现只依赖数据层与考勤域服务，不反向依赖 OA 引擎；
 * ② 考勤侧「哪些流程编码会影响考勤结论」只在这一处声明，避免审批回调散落在多个 service 里各自判断。
 * <p>
 * 一期只接请假：补卡与加班申请尚无独立流程编码（走通用审批），等流程中心把两类单据接进来后
 * 再在此扩展 {@code isReissueProcess}/{@code isOvertimeProcess}，不在没有调用方时预埋死代码。
 */
public interface AttendanceCallbackService {

    /**
     * 请假审批全部通过：抵扣区间内的缺勤类异常并重算受影响日期的考勤结论。
     * <p>幂等：异常行只在「待處理」时被推进，回调重放不会重复抵扣。
     */
    void onLeaveApproved(String flowNo);
}
