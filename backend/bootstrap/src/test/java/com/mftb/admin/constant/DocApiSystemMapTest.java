package com.mftb.admin.constant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 接口清單系統歸屬：左側只能出現正式中文系統名，禁止英文代碼回退。 */
class DocApiSystemMapTest {

    @Test
    void routesToOfficialSystems() {
        assertEquals("doc", DocApiSystemMap.code("/api/doc/v3/system-plans"));
        assertEquals("doc", DocApiSystemMap.code("/api/word-library/items"));
        assertEquals("hr", DocApiSystemMap.code("/api/department/tree"));
        assertEquals("hr", DocApiSystemMap.code("/api/position/list"));
        assertEquals("eam", DocApiSystemMap.code("/api/consumable/orders"));
        assertEquals("ai", DocApiSystemMap.code("/api/agent/tools"));
        assertEquals("iam", DocApiSystemMap.code("/api/menus"));
        assertEquals("platform", DocApiSystemMap.code("/api/unknown/whatever"));
    }

    @Test
    void namesAlwaysChinese() {
        for (String code : DocApiSystemMap.codes()) {
            String name = DocApiSystemMap.name(code);
            assertTrue(name != null && name.codePoints()
                            .anyMatch(cp -> Character.UnicodeScript.of(cp) == Character.UnicodeScript.HAN),
                    "系统名称必须是中文: " + code);
        }
        assertEquals("平台支撐系統", DocApiSystemMap.displayName("legacy-ad", "legacy-ad"));
        assertEquals("平台支撐系統", DocApiSystemMap.displayName("legacy-ad", null));
        assertEquals("人力資源系統", DocApiSystemMap.displayName("hr", "HR"));
    }

    @Test
    void manualChineseNameWinsForExternalSystem() {
        assertEquals("外部系統", DocApiSystemMap.displayName("external", "外部系統"));
        assertEquals("人工智能系統", DocApiSystemMap.displayName("ai", "人工智能系統"));
        assertEquals(16, DocApiSystemMap.codes().size());
    }
}
