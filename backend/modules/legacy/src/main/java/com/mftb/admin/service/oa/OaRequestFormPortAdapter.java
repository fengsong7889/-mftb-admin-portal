package com.mftb.admin.service.oa;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.contracts.oa.OaRequestFormPort;
import com.mftb.admin.entity.OaRequest;
import com.mftb.admin.mapper.OaRequestMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * {@link OaRequestFormPort} 的 OA 侧实现（表与事务语义归 OA 所有）。
 *
 * <p>为什么实现放在 legacy：{@code oa_request} 是 OA 引擎的事务表，只有 OA 知道
 * 流程编码、表单字段的写入时机；域模块拿契约只读取数，不碰表。
 */
@Component
@RequiredArgsConstructor
public class OaRequestFormPortAdapter implements OaRequestFormPort {

    private final OaRequestMapper oaRequestMapper;

    @Override
    public Map<String, String> findFormDataByFlowNos(String processCode, Collection<String> flowNos) {
        if (flowNos == null || flowNos.isEmpty()) {
            return Map.of();
        }
        // 只取调用方需要的两列：表单原文可能很大（TEXT），不要顺手把整行带出来
        Map<String, String> result = new LinkedHashMap<>();
        oaRequestMapper.selectList(new LambdaQueryWrapper<OaRequest>()
                        .eq(OaRequest::getProcessCode, processCode)
                        .in(OaRequest::getFlowNo, flowNos)
                        .select(OaRequest::getFlowNo, OaRequest::getFormData))
                .forEach(oa -> {
                    if (oa.getFlowNo() != null && oa.getFormData() != null) {
                        result.put(oa.getFlowNo(), oa.getFormData());
                    }
                });
        return result;
    }
}
