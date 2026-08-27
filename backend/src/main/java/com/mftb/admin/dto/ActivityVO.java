package com.mftb.admin.dto;

import lombok.Data;

/**
 * 活动信息 VO（自然流量「活动加分」配置回显用）
 */
@Data
public class ActivityVO {

    /** 活动ID（业务编号） */
    private String activityNo;

    /** 活动名称 */
    private String name;

    /** 活动状态: 1=启动 2=停用 */
    private Integer status;

    /** 活动开始时间 */
    private String startTime;

    /** 活动结束时间 */
    private String endTime;
}
