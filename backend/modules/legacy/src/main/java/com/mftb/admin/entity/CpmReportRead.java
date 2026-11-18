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
 * CPM 汇报已读回执。
 * <p>打开详情且有查看权限时由服务端登记；重复打开不重写（唯一键兜底）。
 * 「送达 n / 已读 m」的统计口径只认本表，不做前端埋点。
 */
@Data
@TableName("biz_cpm_report_read")
public class CpmReportRead {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long reportId;

    private Long readerUserId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime readAt;
}
