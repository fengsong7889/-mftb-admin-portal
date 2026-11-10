/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 纪要事项的负责人（一条事项可以有多个）。
 *
 * <p>它是负责人关系的唯一真源：事项行上的 {@code owner_user_id/owner_name/owner_emp_no}
 * 只是 {@code seq=1} 那一行的缓存，供旧查询与旧版本服务继续使用，不再单独代表"唯一负责人"。
 *
 * <p>{@code userName/empNo} 是服务端按 {@code userId} 回查 sys_user 得到的快照：
 * 员工改名不能改写历史纪要上"当时交给谁"的事实，前端自报的姓名一律不采信。
 */
@Data
@TableName("biz_meeting_minutes_item_owner")
public class MeetingMinutesItemOwner {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 事项 biz_meeting_minutes_item.id */
    private Long itemId;

    /** 负责人 sys_user.id */
    private Long userId;

    private String userName;

    private String empNo;

    /** 本事项内的负责人顺序，从 1 起；1 即事项行三列缓存的来源 */
    private Integer seq;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
