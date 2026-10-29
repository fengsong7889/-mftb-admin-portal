package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 会议纪要附件元数据（二进制只进对象存储，本表不落文件内容）。
 *
 * <p>三条硬口径：
 * <ul>
 *   <li><b>对外只认 attachment_no</b>：自增 id 不出接口，枚举 id 拿不到任何东西；</li>
 *   <li><b>文件名与摘要入库后不可变</b>：下载展示与历史快照引用同一份事实，
 *      改名/换内容必须重新上传成新附件，否则"发给我的那一版"就自相矛盾；</li>
 *   <li><b>状态只前进不回退到可删</b>：1=未绑定（仅上传人可删）→ 2=已绑定草稿 →
 *      3=已进入正式发布快照（永不物理删除）；从草稿移除只回退到 1，已发布(3)的不动。</li>
 * </ul>
 */
@Data
@TableName("biz_meeting_minutes_attachment")
public class MeetingMinutesAttachment {

    /** 未绑定：刚上传、还没随纪要保存，仅上传人可删除 */
    public static final int STATUS_UNBOUND = 1;
    /** 已绑定草稿：被某份纪要的当前正文引用 */
    public static final int STATUS_BOUND = 2;
    /** 已进入正式发布快照：历史完整性优先，禁止物理删除 */
    public static final int STATUS_PUBLISHED = 3;

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 对外附件标识：服务端生成的 32 位 hex */
    private String attachmentNo;

    private Long bookingId;

    /** 绑定的纪要 id；NULL=尚未随纪要保存 */
    private Long minutesId;

    private String requestKey;

    private String requestHash;

    private Long uploadUserId;

    private String uploadName;

    private String originalName;

    private String mime;

    private Long sizeBytes;

    private String sha256;

    private String storageProvider;

    private String objectKey;

    private Integer status;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
