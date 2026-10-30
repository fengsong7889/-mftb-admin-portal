package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 个人会议笔记（自由文本录入的原始来源，按「会议 + 当前用户」隔离）。
 *
 * <p>与正式纪要的关系是「草稿池」而非「正文」：
 * <ul>
 *   <li>不进 {@code biz_meeting_minutes.content_json}、不发通知、不进发布快照与免登链接；</li>
 *   <li>发布正式纪要后仍保留，供同一人下次进入继续记录；</li>
 *   <li>{@code version} 是笔记自己的乐观锁（与纪要 version 无关），多设备编辑靠它防覆盖。</li>
 * </ul>
 *
 * <p>{@code rawText} 是用户可控文本，只在受控渲染下展示，禁止当 HTML；
 * 长度上限由数据库 CHECK 与服务层双重把守，AI 提取按 {@code version} 读取指定快照。
 */
@Data
@TableName("biz_meeting_minutes_note")
public class MeetingMinutesNote {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long bookingId;

    private Long ownerUserId;

    private String rawText;

    /** @员工标记的 JSON 数组（mentionRef/userId/name/位置），二进制与真实身份以服务端回查为准 */
    private String mentionsJson;

    private Integer version;

    private String contentHash;

    private String lastRequestKey;

    private String lastRequestHash;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
