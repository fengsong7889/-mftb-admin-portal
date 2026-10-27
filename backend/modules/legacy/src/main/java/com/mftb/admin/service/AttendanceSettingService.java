package com.mftb.admin.service;

import com.mftb.admin.dto.AttendanceSettingItem;

import java.util.List;
import java.util.Map;

/**
 * 假勤设置服务（口径参数）。
 * <p>
 * 边界：只维护「考勤怎么算、什么时候交给薪酬」。审批节点、审批人、流程模板由
 * 流程审批系统的「流程配置」统一维护，这里不提供任何流程相关写入。
 */
public interface AttendanceSettingService {

    /**
     * 全部设置项（含只读口径说明）。
     * <p>只读项的 {@code value} 取自真值出处（代码口径 / 部署配置），不是可提交的配置。
     */
    List<AttendanceSettingItem> list();

    /**
     * 批量更新可编辑项。
     *
     * @param values 前端 key → 新值；含只读项或未知 key 一律整体拒绝（不做部分成功，
     *               否则用户以为全部生效）
     * @return updated / keys / needRecalculate
     */
    Map<String, Object> update(Map<String, String> values);
}
