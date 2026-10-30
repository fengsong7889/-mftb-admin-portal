package com.mftb.admin.service.minutes;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 模型内部输出（与正式保存 DTO 分离）：只承载文本与临时引用，不含 userId / 日历日期。
 *
 * <p>{@code ownerText}/{@code dueText} 是原文表达，真实身份与日期由服务端确定性解析补全；
 * {@code sourceRefs} 必须是后端编号过的段落标识（s1/s2…），不存在的引用会被判为结构无效。
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class MinutesAiModelOutput {

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Topic {
        private String ref;
        private String topic;
        private String discussion;
        private String conclusion;
        private String decisionStatus;
        private List<String> sourceRefs = new ArrayList<>();
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Action {
        private String ref;
        private String topicRef;
        private String content;
        private String ownerText;
        private String ownerMentionRef;
        private String dueText;
        private String deliverable;
        private List<String> sourceRefs = new ArrayList<>();
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class OpenIssue {
        private String ref;
        private String topicRef;
        private String content;
        private String ownerText;
        private String ownerMentionRef;
        private String dueText;
        private List<String> sourceRefs = new ArrayList<>();
    }

    private List<Topic> topics = new ArrayList<>();
    private List<Action> actions = new ArrayList<>();
    private List<OpenIssue> openIssues = new ArrayList<>();
}
