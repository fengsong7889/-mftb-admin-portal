package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 查閱審計留痕實體（培訓完成度與熱度統計的唯一口徑） */
@Data
@TableName("doc_view_log")
public class DocViewLog {

    @TableId
    private Long id;

    /** 文檔 ID */
    private Long nodeId;

    /** 查閱人用戶 ID */
    private Long userId;

    /** 查閱人姓名 */
    private String userName;

    /** 部門（快照） */
    private String department;

    /** 查閱時間 */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime viewedAt;

    /** 停留時長秒（頁面離開時上報，可空） */
    private Integer durationSec;
}
