package com.mftb.admin.dto;

import com.mftb.admin.entity.RdmAcceptance;
import com.mftb.admin.entity.RdmAcceptanceCase;
import com.mftb.admin.util.DateTimeUtils;
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
        return item;
    }
}
