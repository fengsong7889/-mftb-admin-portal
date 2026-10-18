package com.mftb.admin.dto;

import com.mftb.admin.common.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 授权配置载荷（form_data.approvedGrant）解析与合并测试。
 * <p>钉死三条口径：
 * <ol>
 *   <li>未配置授权时 read 返回 null、mergeGrant 原样返回既有 JSON（中间节点只写意见不该动 form_data）；</li>
 *   <li>合并只覆盖 approvedGrant 一个键，申请内容（系统/勾选菜单/说明）必须逐字保留——
 *       否则审批人可以借审批接口改写申请人的申请事实；</li>
 *   <li>配置存在但非法（类型不在白名单 / targetId 缺失或非正整数）必须抛错，
 *       不能静默丢弃：静默丢弃会让审批人以为配好了、终审兑现时才发现没配，
 *       结果是「流程已通过但权限没下发」，比当场拒绝难查得多。</li>
 * </ol>
 */
class SystemAccessGrantConfigTest {

    private static final String APPLY_FORM_DATA = "{\"systemCode\":\"eam\",\"systemName\":\"物資管理系統\","
            + "\"requestedMenus\":[{\"menuKey\":\"asset-list\",\"name\":\"資產台账\"}],"
            + "\"reason\":\"需要核对门店活动物资\",\"attachmentCount\":2}";

    @Test
    @DisplayName("未配置授权：read 返回 null，mergeGrant 不改写既有 form_data")
    void absentGrantLeavesFormDataUntouched() {
        assertNull(SystemAccessGrantConfig.read(APPLY_FORM_DATA));
        assertNull(SystemAccessGrantConfig.read(null));
        assertNull(SystemAccessGrantConfig.read(""));
        // 审批人只写了意见、没带 formData 时，OA 侧传入 null/空串，不能把申请内容抹掉
        assertEquals(APPLY_FORM_DATA, SystemAccessGrantConfig.mergeGrant(APPLY_FORM_DATA, null));
        assertEquals(APPLY_FORM_DATA, SystemAccessGrantConfig.mergeGrant(APPLY_FORM_DATA, "{}"));
    }

    @Test
    @DisplayName("合并只覆盖 approvedGrant：申请内容逐字保留")
    void mergeKeepsApplicationFactsIntact() {
        String incoming = "{\"approvedGrant\":{\"targetType\":\"role\",\"targetId\":7,\"targetName\":\"資產管理員\"},"
                // 审批人顺手改了申请说明与系统：这两个键必须被忽略，不能被写回 form_data
                + "\"reason\":\"审批人改写的内容\",\"systemCode\":\"finance\"}";

        String merged = SystemAccessGrantConfig.mergeGrant(APPLY_FORM_DATA, incoming);

        assertTrue(merged.contains("\"systemCode\":\"eam\""), "系统编码必须保持申请人提交的原值");
        assertTrue(merged.contains("需要核对门店活动物资"), "申请说明必须保持申请人提交的原值");
        assertTrue(merged.contains("\"menuKey\":\"asset-list\""), "勾选菜单必须保留");
        assertTrue(merged.contains("\"approvedGrant\""), "授权配置必须写入");
        assertTrue(merged.contains("\"targetId\":7"), "授权角色 ID 必须写入");
    }

    @Test
    @DisplayName("只传 targetId 也可解析：单一授权对象类型下按角色处理")
    void targetTypeDefaultsToRole() {
        SystemAccessGrantConfig config =
                SystemAccessGrantConfig.read("{\"approvedGrant\":{\"targetId\":3}}");
        assertEquals("role", config.targetType());
        assertEquals(3L, config.targetId());
        assertNull(config.targetName());
    }

    @Test
    @DisplayName("字符串形式的 targetId 也能解析（前端可能把数字序列化成字符串）")
    void numericStringTargetIdIsAccepted() {
        assertEquals(12L, SystemAccessGrantConfig.read("{\"approvedGrant\":{\"targetId\":\"12\"}}").targetId());
    }

    @Test
    @DisplayName("非法配置一律拒绝，不静默忽略")
    void malformedGrantIsRejected() {
        // 授权对象类型不在白名单（如伪造 department 走部门授权，本流程不支持）
        BusinessException wrongType = assertThrows(BusinessException.class,
                () -> SystemAccessGrantConfig.read("{\"approvedGrant\":{\"targetType\":\"department\",\"targetId\":5}}"));
        assertTrue(wrongType.getMessage().contains("不支持的授權對象類型"));

        // 缺 targetId / 非正整数 / 非数字：都视为「没选角色」
        assertThrows(BusinessException.class,
                () -> SystemAccessGrantConfig.read("{\"approvedGrant\":{\"targetType\":\"role\"}}"));
        assertThrows(BusinessException.class,
                () -> SystemAccessGrantConfig.read("{\"approvedGrant\":{\"targetId\":0}}"));
        assertThrows(BusinessException.class,
                () -> SystemAccessGrantConfig.read("{\"approvedGrant\":{\"targetId\":-3}}"));
        assertThrows(BusinessException.class,
                () -> SystemAccessGrantConfig.read("{\"approvedGrant\":{\"targetId\":\"abc\"}}"));

        // approvedGrant 不是对象（数组/字符串）→ 格式错误
        assertThrows(BusinessException.class,
                () -> SystemAccessGrantConfig.read("{\"approvedGrant\":[1,2]}"));
        assertThrows(BusinessException.class,
                () -> SystemAccessGrantConfig.read("{\"approvedGrant\":\"role:7\"}"));
    }

    @Test
    @DisplayName("脏 JSON 当未配置处理：解析失败不得让审批流程崩在 JSON 上")
    void brokenJsonIsTreatedAsAbsent() {
        assertNull(SystemAccessGrantConfig.read("not-a-json"));
        assertEquals(APPLY_FORM_DATA, SystemAccessGrantConfig.mergeGrant(APPLY_FORM_DATA, "not-a-json"));
    }

    @Test
    @DisplayName("toMap 键名与前端约定一致")
    void toMapUsesAgreedKeys() {
        Map<String, Object> map = new SystemAccessGrantConfig("role", 9L, "財務主管").toMap();
        assertEquals("role", map.get("targetType"));
        assertEquals(9L, map.get("targetId"));
        assertEquals("財務主管", map.get("targetName"));
    }
}
