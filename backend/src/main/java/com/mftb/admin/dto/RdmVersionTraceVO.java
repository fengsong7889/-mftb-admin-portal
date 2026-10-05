package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * RDM 版本追溯（M3）——需求 ↔ 版本 双向可查。
 * <p>版本基本信息来自 {@code sys_version_history}，需求清单来自
 * {@code rdm_requirement.version_no}，两侧口径同源，不另建副本表。
 */
@Data
public class RdmVersionTraceVO {

    /** 版本号；需求未关联版本时为 null（前端必须如实显示"还没上车"） */
    private String versionNo;

    /** 版本发布日期 */
    private String releaseDate;

    /** 发布类型: major/minor/patch/frontend */
    private String releaseType;

    /** 版本变更摘要 */
    private String summary;

    /** 提交号 */
    private String commitHash;

    /** 该版本承载的需求 */
    private List<Item> requirements = new ArrayList<>();

    /** 统计（前端摘要条直接可用） */
    private Stats stats = new Stats();

    /** 版本下的需求条目 */
    @Data
    public static class Item {
        private Long reqId;
        private String reqNo;
        private String title;
        private String status;
        private String reqType;
        private String priority;
        private String submitDeptName;
        private String submitterName;
        private String pmName;
        private String planReleaseDate;
        private String actualReleaseDate;
        /** 验收结论: pass/conditional/fail */
        private String acceptanceResult;
        /** 验收满意度 1-5 */
        private Integer acceptanceScore;
        /** 返工次数 */
        private Integer reworkCount;
        /** 第几次验收（当前最新一次） */
        private Integer attempt;
        /** 遗留事项转出的后续需求编号 */
        private String followUpReqNo;
    }

    /** 版本统计 */
    @Data
    public static class Stats {
        private Integer total;
        private Integer released;
        private Integer acceptancePass;
        private Double avgScore;
    }
}
