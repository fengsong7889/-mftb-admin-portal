package com.mftb.admin.service;

import com.mftb.admin.dto.LanguageVO;
import com.mftb.admin.dto.MachineTranslateRequest;
import com.mftb.admin.dto.TranslationCoverageVO;
import com.mftb.admin.dto.TranslationRequest;
import com.mftb.admin.dto.TranslationVO;

import java.util.List;
import java.util.Map;

/**
 * 多语言翻译管理服务
 * <p>
 * 统一翻译源: UI 文案/菜单名/状态值/业务术语均存 sys_translation,
 * 前端启动时拉取语言包注入 i18next, 静态 JSON 仅作兜底
 */
public interface TranslationService {

    /* ========== 翻译字段 ========== */

    /** 字段列表（可按关键词/分类过滤） */
    List<TranslationVO> list(String keyword, String category);

    /** 新增字段（fieldKey 留空自动生成，全局唯一校验） */
    TranslationVO create(TranslationRequest request);

    /** 编辑字段 */
    TranslationVO update(Long id, TranslationRequest request);

    /** 删除字段 */
    void delete(Long id);

    /**
     * 语言包: 返回指定语言的 {fieldKey: 译文} 平铺映射,
     * 已应用回退链 目标语言 → en → zh-TW → fieldName, 前端可直接注入 i18next
     */
    Map<String, String> bundle(String langCode);

    /** 语言翻译完成率统计 */
    TranslationCoverageVO coverage(String langCode);

    /* ========== 已注册语言 ========== */

    /** 语言列表 */
    List<LanguageVO> listLanguages();

    /** 注册新语言（code 全局唯一） */
    LanguageVO createLanguage(LanguageVO request);

    /** 删除语言 */
    void deleteLanguage(String code);

    /* ========== 机翻 ========== */

    /**
     * 调用 MyMemory 免费翻译 API 对指定字段进行机器翻译
     * <p>
     * 只填充空缺翻译，不覆盖已有内容；翻译结果自动持久化到 sys_translation
     *
     * @param request ids=字段ID列表, targetLangs=目标语言（留空=所有已注册语言）
     * @return 本次新增的翻译条数
     */
    int machineTranslate(MachineTranslateRequest request);
}
