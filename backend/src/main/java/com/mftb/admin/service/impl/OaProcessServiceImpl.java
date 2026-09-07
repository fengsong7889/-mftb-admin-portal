package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.OaProcessVO;
import com.mftb.admin.entity.OaProcess;
import com.mftb.admin.mapper.OaProcessMapper;
import com.mftb.admin.service.OaProcessService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * OA流程中心服务实现
 */
@Service
@RequiredArgsConstructor
public class OaProcessServiceImpl implements OaProcessService {

    private final OaProcessMapper oaProcessMapper;

    @Override
    public List<OaProcessVO> listProcesses() {
        List<OaProcess> processes = oaProcessMapper.selectList(
                new LambdaQueryWrapper<OaProcess>()
                        .eq(OaProcess::getStatus, 1)
                        .orderByAsc(OaProcess::getSortOrder));
        return processes.stream().map(OaProcessVO::from).toList();
    }

    @Override
    public OaProcessVO getProcess(String processCode) {
        OaProcess process = oaProcessMapper.selectOne(
                new LambdaQueryWrapper<OaProcess>()
                        .eq(OaProcess::getProcessCode, processCode)
                        .eq(OaProcess::getStatus, 1));
        if (process == null) {
            throw new BusinessException("流程类型不存在或已停用: " + processCode);
        }
        return OaProcessVO.from(process);
    }
}
