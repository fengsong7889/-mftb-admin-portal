package com.mftb.admin.dto;

import lombok.Data;

/**
 * 审批节点推进结果（与前端 ApproveNodeResult 一致）
 */
@Data
public class ApproveResultVO {

    /** 本次通过的节点名称 */
    private String nodeName;

    /** 是否全部节点已通过 */
    private boolean finished;

    /** 下一待审节点名称，全部通过时为空 */
    private String nextNode;

    public static ApproveResultVO of(String nodeName, boolean finished, String nextNode) {
        ApproveResultVO vo = new ApproveResultVO();
        vo.setNodeName(nodeName);
        vo.setFinished(finished);
        vo.setNextNode(nextNode);
        return vo;
    }
}
