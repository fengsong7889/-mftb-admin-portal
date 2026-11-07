/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.TranslationCoverageVO;
import com.mftb.admin.entity.SysTranslation;
import com.mftb.admin.mapper.SysLanguageMapper;
import com.mftb.admin.mapper.SysTranslationMapper;
import com.mftb.admin.service.I18nLocaleMirror;
import com.mftb.admin.service.impl.TranslationServiceImpl;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 翻译完成率的**分母口径**测试。
 * <p>
 * 2026-11-05 的根因之一就在这一处：旧实现把分母取成 {@code sys_translation} 的记录数，
 * 于是「前端有、但没同步入库」的词条根本不在分母里 —— 库里 8504 条全部翻完时，
 * 六种语言都显示 ~100%，而简体中文实际只能解析 51.4%，「翻译统计」页与顶部语言切换
 * 校验一起说谎，没有任何环节报警。本测试钉住三件事：
 * <ol>
 *   <li>分母必须是「镜像文案 key 全集 ∪ 库里字段」，库翻完但镜像还有新 key 时完成率不得是 100%；</li>
 *   <li>口径变化要真的改变状态判定（旧口径报 ready 的场景，全站口径必须报 partial）；</li>
 *   <li>镜像不可用（缺文件 / 解析失败）时必须退回旧口径而不是把分母拍成 0，
 *       否则「完成率」会凭空变成 0%，比虚高更容易被误读成翻译丢了。</li>
 * </ol>
 */
class TranslationCoverageDenominatorTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 库里一条记录：fieldKey → 各语言译文 */
    private static SysTranslation row(String fieldKey, Map<String, String> translations) {
        SysTranslation t = new SysTranslation();
        t.setFieldKey(fieldKey);
        try {
            t.setTranslationsJson(MAPPER.writeValueAsString(translations));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        return t;
    }

    /**
     * 组装被测服务。
     *
     * @param dbRows      sys_translation 记录
     * @param mirrorKeys  镜像文案 key 全集（空集代表镜像不可用）
     * @param registered  该语言是否已在 sys_language 注册
     */
    private static TranslationServiceImpl service(List<SysTranslation> dbRows,
                                                  Set<String> mirrorKeys,
                                                  boolean registered) {
        SysTranslationMapper translationMapper = mock(SysTranslationMapper.class);
        when(translationMapper.selectList(any())).thenReturn(new ArrayList<>(dbRows));

        SysLanguageMapper languageMapper = mock(SysLanguageMapper.class);
        when(languageMapper.selectCount(any())).thenReturn(registered ? 1L : 0L);

        I18nLocaleMirror mirror = mock(I18nLocaleMirror.class);
        when(mirror.textKeyCount()).thenReturn(mirrorKeys.size());
        when(mirror.textKeys()).thenReturn(mirrorKeys);
        Map<String, String> flat = new LinkedHashMap<>();
        for (String key : mirrorKeys) {
            flat.put(key, key);
        }
        when(mirror.textOf(I18nLocaleMirror.LANG_ZH_TW)).thenReturn(flat);

        return new TranslationServiceImpl(translationMapper, languageMapper,
                mock(OperatorResolver.class), MAPPER, mirror);
    }

    @Test
    @DisplayName("库里全翻完但镜像仍有未入库 key：完成率必须低于 100%")
    void unregisteredStaticKeysCountAgainstTheRate() {
        List<SysTranslation> db = List.of(
                row("common.add", Map.of("ja", "追加")),
                row("common.delete", Map.of("ja", "削除")));
        Set<String> mirror = Set.of("common.add", "common.delete",
                "rdm.colStatus", "rdm.colTitle", "hr.colEmpNo");

        TranslationCoverageVO vo = service(db, mirror, true).coverage("ja");

        assertEquals(5, vo.getTotal(), "分母是镜像 key 全集 ∪ 库字段，不是库里 2 条");
        assertEquals(2, vo.getTranslated());
        assertEquals(3, vo.getMissingInDb(), "前端加了文案但没跑同步，就该报 3 个未入库");
        assertEquals(2, vo.getDbTotal());
        assertEquals(5, vo.getMirrorTotal());
        // 旧口径在这里会算出 2/2 = 100%，正是本次事故的形态
        assertTrue(vo.getRate() < 1.0, "库里翻完不等于全站翻完");
        assertEquals(0.4, vo.getRate(), 1e-9);
    }

    @Test
    @DisplayName("口径变化要改变状态：旧口径报 ready 的，全站口径要报 partial")
    void statusFollowsTheHonestDenominator() {
        // 库里 6 条全翻完，镜像另有 10 个 key 未入库：旧口径 6/6=100% → ready，
        // 而按全站口径只有 6/16 = 37.5%，低于 60% 阈值 → partial
        List<SysTranslation> db = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            db.add(row("old.key" + i, Map.of("ja", "値" + i)));
        }
        Set<String> mirror = java.util.stream.IntStream.range(0, 10)
                .mapToObj(i -> "new.key" + i)
                .collect(java.util.stream.Collectors.toCollection(java.util.LinkedHashSet::new));

        TranslationCoverageVO vo = service(db, mirror, true).coverage("ja");

        assertEquals("partial", vo.getStatus());
        assertEquals(16, vo.getTotal());
        assertEquals(10, vo.getMissingInDb());
    }

    @Test
    @DisplayName("镜像不可用时退回「仅按库记录」口径，不能把分母拍成 0")
    void missingMirrorFallsBackToDbOnlyUniverse() {
        List<SysTranslation> db = List.of(
                row("common.add", Map.of("ja", "追加")),
                row("common.delete", Map.of("ja", "")));

        TranslationCoverageVO vo = service(db, Set.of(), true).coverage("ja");

        assertEquals(2, vo.getTotal(), "镜像缺席时退化为库里记录数，而不是 0");
        assertEquals(1, vo.getTranslated(), "空串算未译：旧版把「键在」当「翻好」");
        assertEquals(0, vo.getMissingInDb());
        assertEquals(0, vo.getMirrorTotal());
        assertEquals(0.5, vo.getRate(), 1e-9);
        assertEquals("partial", vo.getStatus(), "60% 阈值下 50% 仍是 partial");
    }

    @Test
    @DisplayName("库里独有 key（菜单名/业务字段）也要计入分母")
    void dbOnlyKeysAreStillRequiredToTranslate() {
        List<SysTranslation> db = List.of(
                row("menu.home", Map.of("ja", "ホーム")),
                row("asset.colStatus", Map.of()));
        // 镜像里只有 menu.home 那一条；asset.colStatus 是 sys_menu / 工作台独有
        Set<String> mirror = Set.of("menu.home");

        TranslationCoverageVO vo = service(db, mirror, true).coverage("ja");

        assertEquals(2, vo.getTotal(), "并集：库里独有 key 不能被镜像口径挤掉");
        assertEquals(1, vo.getTranslated());
        assertEquals(0, vo.getMissingInDb());
    }

    @Test
    @DisplayName("未注册语言仍判 not_configured，不受口径调整影响")
    void unregisteredLanguageStaysNotConfigured() {
        List<SysTranslation> db = List.of(row("common.add", Map.of("th", "เพิ่ม")));
        Set<String> mirror = Set.of("common.add");

        TranslationCoverageVO vo = service(db, mirror, false).coverage("th");

        assertEquals("not_configured", vo.getStatus());
        assertEquals(1, vo.getTotal());
        assertEquals(1, vo.getTranslated());
    }
}
