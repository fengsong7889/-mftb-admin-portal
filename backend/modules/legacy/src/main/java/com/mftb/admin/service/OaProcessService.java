package com.mftb.admin.service;

import com.mftb.admin.dto.OaProcessVO;

import java.util.List;

/**
 * OA流程中心服务（流程定义查询）
 */
public interface OaProcessService {

    /**
     * 查询所有启用的流程定义列表
     */
    List<OaProcessVO> listProcesses();

    /**
     * 查询单个流程定义详情
     *
     * @param processCode 流程编码
     */
    OaProcessVO getProcess(String processCode);
}
