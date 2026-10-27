package com.mftb.admin.constant;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 人事异动动作 code 的判定测试（方案 §5.3「禁止用字符串判定状态」）。
 * <p>重点锁两件事：繁简体名称都能归一到同一个 code；未回填（NULL/OTHER）时退回名称判定
 * 而不是直接把历史数据判成在职或离职。
 */
class HrOperationCodeTest {

    @Test
    @DisplayName("简体与繁体名称归一到同一 code")
    void bothScriptsResolveToSameCode() {
        assertEquals(HrOperationCode.DIMISSION, HrOperationCode.resolve("离职"));
        assertEquals(HrOperationCode.DIMISSION, HrOperationCode.resolve("離職"));
        assertEquals(HrOperationCode.ONBOARD, HrOperationCode.resolve("入職"));
        assertEquals(HrOperationCode.REHIRE, HrOperationCode.resolve("重新入职"));
    }

    @Test
    @DisplayName("已经是 code 的输入原样返回，不重复归一")
    void codeInputPassesThrough() {
        assertEquals(HrOperationCode.TRANSFER, HrOperationCode.resolve("TRANSFER"));
    }

    @Test
    @DisplayName("无法识别的名称落 OTHER，而不是抛错或猜成某个动作")
    void unknownNameFallsBackToOther() {
        assertEquals(HrOperationCode.OTHER, HrOperationCode.resolve("停薪留職"));
        assertEquals(HrOperationCode.OTHER, HrOperationCode.resolve(null));
        assertEquals(HrOperationCode.OTHER, HrOperationCode.resolve("  "));
    }

    @Test
    @DisplayName("离职判定：code 优先，NULL/OTHER 退回名称")
    void resignationDetectionPrefersCode() {
        assertTrue(HrOperationCode.isResigned(HrOperationCode.DIMISSION, "任意名称"));
        assertFalse(HrOperationCode.isResigned(HrOperationCode.REHIRE, "離職"),
                "code 已归类时不能被名称翻案：重新入职不是离职");
        assertTrue(HrOperationCode.isResigned(null, "離職"), "未回填时要退回名称判定");
        assertTrue(HrOperationCode.isResigned(HrOperationCode.OTHER, "离职"));
        assertFalse(HrOperationCode.isResigned(HrOperationCode.OTHER, "调动"));
    }

    @Test
    @DisplayName("雇佣起点判定只认入职/重新入职，转正调动不算")
    void employmentStartAnchors() {
        assertTrue(HrOperationCode.isEmploymentStart(HrOperationCode.ONBOARD, null));
        assertTrue(HrOperationCode.isEmploymentStart(HrOperationCode.REHIRE, null));
        assertFalse(HrOperationCode.isEmploymentStart(HrOperationCode.REGULAR, "入职"));
        assertFalse(HrOperationCode.isEmploymentStart(null, "轉正"), "转正不开启新雇佣");
    }

    @Test
    @DisplayName("写库快照：能识别的写规范简体名，识别不了的保留原输入")
    void nameSnapshot() {
        assertEquals("离职", HrOperationCode.nameForWrite("離職"));
        assertEquals("停薪留職", HrOperationCode.nameForWrite("停薪留職"));
        assertEquals(HrOperationCode.OTHER, HrOperationCode.codeForWrite("停薪留職"));
    }

    @Test
    @DisplayName("code 全集与名称映射互相对应（漏一个就会有一类异动派生不出来）")
    void codeSetAndNameMapAreAligned() {
        for (String code : HrOperationCode.ALL_CODES) {
            assertTrue(HrOperationCode.CODE_TO_NAME.containsKey(code), "缺展示名: " + code);
        }
        for (String mapped : HrOperationCode.NAME_TO_CODE.values()) {
            assertTrue(HrOperationCode.isValid(mapped), "名称映射指向了不存在的 code: " + mapped);
        }
    }
}

