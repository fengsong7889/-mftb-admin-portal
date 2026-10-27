package com.mftb.admin.service;

import com.mftb.admin.dto.MtEngineRequest;
import com.mftb.admin.dto.MtEngineVO;

import java.util.List;
import java.util.Map;

/**
 * 机翻引擎配置服务
 */
public interface MtEngineService {

    /** 引擎列表 */
    List<MtEngineVO> list();

    /** 更新引擎配置 */
    MtEngineVO update(Long id, MtEngineRequest request);

    /** 测试翻译 */
    Map<String, Object> testTranslate(Long id, String text, String targetLang);

    /** 获取当前启用的引擎（供 TranslationServiceImpl 调用） */
    MtEngineVO getActiveEngine();
}
