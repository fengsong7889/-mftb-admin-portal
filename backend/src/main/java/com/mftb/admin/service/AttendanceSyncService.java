package com.mftb.admin.service;

import java.time.LocalDate;
import java.util.Map;

/**
 * 钉钉考勤同步服务。
 * <p>
 * 一期只接「拉取打卡流水」这一个方向：补卡/请假/加班的申请与审批留在流程审批系统，
 * 不把钉钉当成第二套审批引擎。
 */
public interface AttendanceSyncService {

    /**
     * 同步钉钉打卡记录。
     *
     * @param from    考勤日期起（含）
     * @param to      考勤日期止（含）
     * @param groupId 只同步某个考勤组；null 表示全部启用中的考勤组
     * @return 同步结果：pulled / inserted / duplicated / skippedUnbound / skippedNoShift
     */
    Map<String, Object> sync(LocalDate from, LocalDate to, Long groupId);
}
