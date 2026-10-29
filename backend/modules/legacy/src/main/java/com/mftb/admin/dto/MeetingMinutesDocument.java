package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 正式纪要的完整文档快照：发布后只读，查看时不得用当前会议/员工资料补写历史。
 * 文档只保存发布时的约定，不保存事项当前办理结果或通知收件人名单。
 */
@Data
public class MeetingMinutesDocument {
    private Integer schemaVersion = MeetingMinutesContent.DOCUMENT_SCHEMA;
    private String minutesNo;
    private String bookingNo;
    private String meetingTitle;
    private String meetingTimeText;
    private String roomText;
    private String meetingType;
    private String organizerName;
    private String organizerEmpNo;
    private String recorderName;
    private String recorderEmpNo;
    private String externalAttendees;
    private Integer revisionNo;
    private String publisherName;
    private String publisherEmpNo;
    private String publishedAt;
    private String changeNote;
    private MeetingMinutesContent content;
    private List<Reference> references = new ArrayList<>();

    /** 来源信息同样冻结；公开页只展示引用，不以当前文档的令牌授权来源全文。 */
    @Data
    public static class Reference {
        private Long minutesId;
        private String minutesNo;
        private String bookingNo;
        private String title;
        private String timeText;
    }
}
