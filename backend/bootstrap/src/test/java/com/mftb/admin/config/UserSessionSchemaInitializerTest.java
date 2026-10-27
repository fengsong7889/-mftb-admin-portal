package com.mftb.admin.config;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 空库基座回归：sys_user 必须由应用自愈补齐会话/部门快照列，且不能引用后补列。 */
class UserSessionSchemaInitializerTest {

    @Test
    void addsAllSessionColumnsWithoutLaterColumnDependencies() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any())).thenReturn(0);
        UserSessionSchemaInitializer initializer =
                new UserSessionSchemaInitializer(jdbc, mock(SchemaVersionTracker.class));

        ReflectionTestUtils.invokeMethod(initializer, "doMigrate");
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc, org.mockito.Mockito.atLeastOnce()).execute(sql.capture());
        List<String> statements = sql.getAllValues();
        for (String column : List.of("department_en", "last_active_at", "active_token", "active_login_ip",
                "force_logout_operator", "force_logout_emp_id", "force_logout_reason")) {
            assertTrue(statements.stream().anyMatch(item -> item.contains("ADD COLUMN " + column)),
                    "必须补列 " + column);
        }
        assertTrue(statements.stream().noneMatch(item -> item.contains(" AFTER ")),
                "基座补列不能依赖后续初始化的列");
    }
}
