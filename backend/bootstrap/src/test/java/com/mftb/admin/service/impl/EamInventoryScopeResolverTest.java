package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.InventoryScope;
import com.mftb.admin.mapper.EamCategoryMapper;
import com.mftb.admin.mapper.EamLocationMapper;
import com.mftb.admin.service.EamTransferLookup;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** 盘点范围解析器单元测试 */
@ExtendWith(MockitoExtension.class)
class EamInventoryScopeResolverTest {

    @Mock private EamLocationMapper locationMapper;
    @Mock private EamCategoryMapper categoryMapper;
    @Mock private EamTransferLookup lookup;

    @InjectMocks private EamInventoryScopeResolver resolver;

    @Test
    void conditionModeWithoutAnyConditionRejected() {
        InventoryScope scope = new InventoryScope();
        scope.setScopeMode("CONDITION");
        assertThrows(BusinessException.class, () -> resolver.validate(scope));
    }

    @Test
    void allModeResolvesDefaultStatusesAndStableFingerprint() {
        InventoryScope scope = new InventoryScope();
        scope.setScopeMode("ALL");
        resolver.validate(scope);
        var r1 = resolver.resolve(scope);
        var r2 = resolver.resolve(scope);
        assertEquals("ALL", r1.scopeMode());
        assertEquals(List.of("idle", "in_use", "in_repair", "pending_inspection"), r1.statuses());
        assertEquals(resolver.fingerprint(r1), resolver.fingerprint(r2));
    }

    @Test
    void scrappedStatusNeverAllowed() {
        InventoryScope scope = new InventoryScope();
        scope.setScopeMode("CONDITION");
        scope.setStatuses(List.of("scrapped"));
        assertThrows(BusinessException.class, () -> resolver.resolve(scope));
    }
}
