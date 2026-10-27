package com.mftb.admin.service;

import java.time.LocalDate;
import java.util.Map;

/**
 * 假勤工作台指标服务（只读聚合）。
 * <p>
 * 预警只返回**结构化数据**（key + level + path + params），不返回成品文案：
 * 界面文本必须走 i18n 五语言，后端拼句子会让翻译工作台永远覆盖不到这几条。
 */
public interface AttendanceWorkbenchService {

    /**
     * 工作台总览。
     *
     * @param date      指标基准日（默认今天）
     * @param rangeFrom 异常区间起（默认本月 1 日）
     * @param rangeTo   异常区间止（默认基准日）
     * @return stats（当日出勤/区间异常）+ alerts（结构化预警）+ groups（考勤组概况）
     */
    Map<String, Object> overview(LocalDate date, LocalDate rangeFrom, LocalDate rangeTo);
}
