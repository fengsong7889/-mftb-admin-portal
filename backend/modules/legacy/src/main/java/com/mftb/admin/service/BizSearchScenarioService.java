package com.mftb.admin.service;

import com.mftb.admin.entity.BizSearchScenario;

import java.util.List;

/** 搜索场景策略服务 */
public interface BizSearchScenarioService {

    List<BizSearchScenario> list(Integer surface, Integer bizChannel, Integer status);

    long create(BizSearchScenario scenario);

    void update(Long id, BizSearchScenario scenario);

    void updateStatus(Long id, Integer status);

    void delete(Long id);
}
