package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.HrProfileItem;
import com.mftb.admin.entity.Person;
import com.mftb.admin.mapper.HrProfileItemMapper;
import com.mftb.admin.mapper.PersonMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 档案扩展的拒绝性用例：类型白名单、标题必填、区间不倒挂、人员必须存在。
 * 这些是"证据行"的最低可信门槛——错一条就会让档案看起来比事实更完整。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class HrProfileGuardTest {

    @Mock private HrProfileItemMapper itemMapper;
    @Mock private PersonMapper personMapper;
    @Mock private OperatorResolver operatorResolver;

    private HrProfileServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new HrProfileServiceImpl(itemMapper, personMapper, operatorResolver);
        when(operatorResolver.currentOperatorAccount()).thenReturn("tester");
        Person person = new Person();
        person.setId(1L);
        when(personMapper.selectById(1L)).thenReturn(person);
    }

    @Test
    @DisplayName("档案类型不在白名单时拒绝")
    void rejectsUnknownItemType() {
        HrProfileItem item = baseItem();
        item.setItemType("TRAINING");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveItem(item));
        assertEquals("档案类型只能是 EDUCATION / WORK / QUALIFICATION / REWARD / PUNISH", ex.getMessage());
        verify(itemMapper, never()).insert(any(HrProfileItem.class));
    }

    @Test
    @DisplayName("标题必填")
    void rejectsMissingTitle() {
        HrProfileItem item = baseItem();
        item.setTitle("  ");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveItem(item));
        assertEquals("标题不能为空", ex.getMessage());
    }

    @Test
    @DisplayName("结束日期早于开始日期时拒绝")
    void rejectsEndBeforeStart() {
        HrProfileItem item = baseItem();
        item.setStartDate(LocalDate.of(2026, 6, 1));
        item.setEndDate(LocalDate.of(2026, 5, 1));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveItem(item));
        assertEquals("结束日期不能早于开始日期", ex.getMessage());
    }

    @Test
    @DisplayName("人员不存在时拒绝（避免产生孤儿证据行）")
    void rejectsMissingPerson() {
        when(personMapper.selectById(1L)).thenReturn(null);
        HrProfileItem item = baseItem();

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveItem(item));
        assertEquals("人员不存在", ex.getMessage());
    }

    private HrProfileItem baseItem() {
        HrProfileItem item = new HrProfileItem();
        item.setPersonId(1L);
        item.setItemType("EDUCATION");
        item.setTitle("中山大学");
        return item;
    }
}
