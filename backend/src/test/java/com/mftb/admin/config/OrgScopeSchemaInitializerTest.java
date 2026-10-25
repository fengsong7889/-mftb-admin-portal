package com.mftb.admin.config;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 空库启动顺序回归：@Order(2) 的 data_scope 迁移不能依赖 @Order(5) 才补的 permissions 列。 */
class OrgScopeSchemaInitializerTest {

    @Test
    void dataScopeAlterMustNotReferencePermissionsAddedLater() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any())).thenReturn(0);
        OrgScopeSchemaInitializer initializer = new OrgScopeSchemaInitializer(jdbc, mock(SchemaVersionTracker.class));

        ReflectionTestUtils.invokeMethod(initializer, "doMigrate");

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc, org.mockito.Mockito.atLeastOnce()).execute(sql.capture());
        List<String> statements = sql.getAllValues();
        assertTrue(statements.stream().anyMatch(item -> item.contains("ADD COLUMN data_scope")),
                "必须补 data_scope 列");
        assertFalse(statements.stream().anyMatch(item -> item.contains("AFTER permissions")),
                "全新库此时 sys_role 尚无 permissions 列，AFTER permissions 会让空库启动失败");
    }
}
