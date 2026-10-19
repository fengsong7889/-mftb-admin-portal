package com.mftb.admin.dto;

import com.mftb.admin.entity.RdmAcceptance;
import com.mftb.admin.entity.RdmAcceptanceCase;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 业务验收记录（含逐条用例）——M3 验收历史与返工链路展示用。
 */
@Data
public class RdmAcceptanceVO {

    private Long id;

    /** 验收单号 */
    private String acceptNo;

    private Long reqId;

    /** 第几次验收（1=首次，>1=返工复验） */
    private Integer attempt;

    /** 验收人姓名 */
    private String acceptorName;

    /** 验收环境: prod/pre/uat */
    private String testEnv;

    /** 结论: pass/conditional/fail */
    private String result;

    /** 验收阶段: pre_release 上线前预验收 / post_release 上线后业务验收（阶段 4） */
    private String stage;

    /** 交付满意度 1-5 */
    private Integer score;

    /** 验收用例总数 */
    private Integer caseTotal;

    /** 通过用例数 */
    private Integer casePass;

    /** 本次缺陷数 */
    private Integer defectCount;

    /** 问题/遗留事项 */
    private String issues;

    /** 验收意见 */
    private String opinion;

    /** 验收时间 */
    private String acceptTime;

    /** 有条件通过时转出的后续需求编号 */
    private String followUpReqNo;

    /** 逐条用例（列表接口可省略，详情页返回） */
    private List<CaseItem> cases = new ArrayList<>();

    /**
     * 验收用例条目
     */
    @Data
    public static class CaseItem {
        private Long id;
        private Integer seq;
        private String title;
        private String expect;
        private String actual;
        private String result;
        private String severity;
        private String remark;
        /** 证据附件元信息（**不含 dataUrl 正文**）：首屏只需知道有几张、叫什么 */
        private List<EvidenceMeta> evidences = new ArrayList<>();
    }

    /**
     * 证据附件元信息。
     * <p>不随正文下发是刻意为之：一条用例可挂数张图，返工几轮累乘会把一次验收历史
     * 撑到几十 MB；正文由 GET .../acceptance/case/{caseId}/evidence/{index} 单张取回。
     */
    @Data
    public static class EvidenceMeta {

        /** 在证据数组中的下标，前端据此拼取正文的 URL */
        private Integer index;

        /** 文件名 */
        private String name;

        /** MIME 类型 */
        private String type;

        /** 字节数 */
        private Long size;
    }

    /**
     * 单张证据正文（仅在按需取图时返回）。
     * <p>dataUrl 已是完整的 {@code data:image/png;base64,...}，前端直接丢给 img src，
     * 沿用 EAM/资产照片同一口径。
     */
    @Data
    public static class EvidenceContent {

        /** 文件名 */
        private String name;

        /** MIME 类型 */
        private String type;

        /** Base64 Data URL 正文 */
        private String dataUrl;
    }

    /** 实体转 VO（不含用例，用例由调用方按需装配） */
    public static RdmAcceptanceVO from(RdmAcceptance a) {
        RdmAcceptanceVO vo = new RdmAcceptanceVO();
        vo.setId(a.getId());
        vo.setAcceptNo(a.getAcceptNo());
        vo.setReqId(a.getReqId());
        vo.setAttempt(a.getAttempt() == null ? 1 : a.getAttempt());
        vo.setAcceptorName(a.getAcceptorName());
        vo.setTestEnv(a.getTestEnv());
        vo.setResult(a.getResult());
        vo.setStage(a.getStage() == null ? "pre_release" : a.getStage());
        vo.setScore(a.getScore());
        vo.setCaseTotal(a.getCaseTotal());
        vo.setCasePass(a.getCasePass());
        vo.setDefectCount(a.getDefectCount());
        vo.setIssues(a.getIssues());
        vo.setOpinion(a.getOpinion());
        vo.setAcceptTime(DateTimeUtils.format(a.getAcceptTime()));
        vo.setFollowUpReqNo(a.getFollowUpReqNo());
        return vo;
    }

    /** 用例实体转条目 */
    public static CaseItem caseFrom(RdmAcceptanceCase c) {
        CaseItem item = new CaseItem();
        item.setId(c.getId());
        item.setSeq(c.getSeq());
        item.setTitle(c.getTitle());
        item.setExpect(c.getExpectResult());
        item.setActual(c.getActualResult());
        item.setResult(c.getResult());
        item.setSeverity(c.getSeverity());
        item.setRemark(c.getRemark());
        item.setEvidences(evidenceMetas(c.getEvidenceJson()));
        return item;
    }

    /**
     * 解析证据 JSON。
     * <p>读路径上空值/脏数据一律降级为「无附件」：不能让一行历史残留把整个验收历史接口打挂。
     * （与结构迁移的「不得吞异常」不同：那是不记版本会造成下次重跑缺列，这里是只读展示降级。）
     */
    public static List<RdmAcceptanceDTO.Evidence> parseEvidences(String evidenceJson) {
        if (evidenceJson == null || evidenceJson.isBlank()) {
            return List.of();
        }
        try {
            List<RdmAcceptanceDTO.Evidence> parsed =
                    JsonUtils.parseList(evidenceJson, RdmAcceptanceDTO.Evidence.class);
            return parsed == null ? List.of() : parsed;
        } catch (Exception ignored) {
            return List.of();
        }
    }

    /** 证据元信息列表：只拷 name/type/size，**不把 dataUrl 放进响应** */
    private static List<EvidenceMeta> evidenceMetas(String evidenceJson) {
        List<RdmAcceptanceDTO.Evidence> parsed = parseEvidences(evidenceJson);
        List<EvidenceMeta> metas = new ArrayList<>();
        for (int i = 0; i < parsed.size(); i++) {
            RdmAcceptanceDTO.Evidence e = parsed.get(i);
            EvidenceMeta meta = new EvidenceMeta();
            meta.setIndex(i);
            meta.setName(e.getName());
            meta.setType(e.getType());
            meta.setSize(e.getSize());
            metas.add(meta);
        }
        return metas;
    }
}
