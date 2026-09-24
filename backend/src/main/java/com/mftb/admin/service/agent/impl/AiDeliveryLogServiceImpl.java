package com.mftb.admin.service.agent.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.entity.AiDeliveryLog;
import com.mftb.admin.mapper.AiDeliveryLogMapper;
import com.mftb.admin.service.agent.AiDeliveryLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiDeliveryLogServiceImpl implements AiDeliveryLogService {

    private final AiDeliveryLogMapper mapper;

    @Override
    public AiDeliveryLog record(AiDeliveryLog entry) {
        try {
            if (entry.getAttempts() == null) entry.setAttempts(1);
            mapper.insert(entry);
            return entry;
        } catch (Exception e) {
            // 投递日志写失败不影响业务；主链路已经拿到渠道响应
            log.error("ai_delivery_log 写入失败 toolKey={} status={}: {}",
                    entry.getToolKey(), entry.getStatus(), e.getMessage());
            return entry;
        }
    }

    @Override
    public Map<String, Object> query(long page, long size, String toolKey, String status, String caller) {
        LambdaQueryWrapper<AiDeliveryLog> wrapper = new LambdaQueryWrapper<AiDeliveryLog>()
                .orderByDesc(AiDeliveryLog::getId);
        if (StringUtils.hasText(toolKey)) wrapper.eq(AiDeliveryLog::getToolKey, toolKey);
        if (StringUtils.hasText(status)) wrapper.eq(AiDeliveryLog::getStatus, status);
        if (StringUtils.hasText(caller)) wrapper.eq(AiDeliveryLog::getCaller, caller);
        Page<AiDeliveryLog> result = mapper.selectPage(new Page<>(page, size), wrapper);
        return Map.of("records", result.getRecords(), "total", result.getTotal());
    }
}
