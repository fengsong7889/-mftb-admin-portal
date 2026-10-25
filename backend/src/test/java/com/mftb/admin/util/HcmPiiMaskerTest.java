package com.mftb.admin.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** 敏感字段脱敏的口径（字段级权限兜底） */
class HcmPiiMaskerTest {

    @Test
    @DisplayName("手机号保留前3后4，其余掩码")
    void masksMobile() {
        assertEquals("138****8000", HcmPiiMasker.mobile("13800138000"));
        assertEquals("****", HcmPiiMasker.mobile("123"));
        assertNull(HcmPiiMasker.mobile(null));
    }

    @Test
    @DisplayName("邮箱保留首字符与域名")
    void masksEmail() {
        assertEquals("z***@example.com", HcmPiiMasker.email("zhangsan@example.com"));
        assertEquals("***", HcmPiiMasker.email("not-an-email"));
        assertEquals("", HcmPiiMasker.email(""));
    }
}
