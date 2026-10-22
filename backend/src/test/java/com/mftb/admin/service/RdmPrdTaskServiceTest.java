package com.mftb.admin.service;

import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 产品经理 PRD 任务的生命周期口径。
 * <p>钉死三件事：受理承诺日变成真实任务、提交评审即收口、已完成的不被重复改写。
 */
@ExtendWith(MockitoExtension.class)
class RdmPrdTaskServiceTest {

    @Mock
    private RdmWorkTaskMapper taskMapper;
    @Mock
    private SysUserMapper userMapper;
    @Mock
    private BizSeqService bizSeqService;
    @Mock
    private OperatorResolver operatorResolver;

    private RdmPrdTaskService service;

    @BeforeAll
    static void initTableInfo() {
        // 纯单测无 MyBatis 容器：LambdaUpdateWrapper 需要实体 TableInfo 才能把方法引用映射成列
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, RdmWorkTask.class);
    }

    @BeforeEach
    void setUp() {
        service = new RdmPrdTaskService(taskMapper, userMapper, bizSeqService, operatorResolver);
    }

    @Test
    @DisplayName("受理时生成 PRD 任务：负责人=产品经理，计划完成日=承诺日期，角色=PM")
    void ensureTaskCreatesPrdTask() {
        RdmRequirement req = requirement();
        SysUser pm = user(41L, "MF00041", "李四");
        when(userMapper.selectById(41L)).thenReturn(pm);
        when(taskMapper.selectOne(any())).thenReturn(null);
        when(bizSeqService.next(BizSeqService.RULE_RDM_WORK_TASK)).thenReturn("RT202610220001");
        when(operatorResolver.operatorSignature(pm)).thenReturn("MF00041|李四");

        service.ensureTask(req, pm);

        ArgumentCaptor<RdmWorkTask> captor = ArgumentCaptor.forClass(RdmWorkTask.class);
        verify(taskMapper).insert((RdmWorkTask) captor.capture());
        RdmWorkTask task = captor.getValue();
        assertEquals(RdmPrdTaskService.TASK_TYPE_PRD, task.getTaskType());
        assertEquals(RdmConstants.ROLE_PM, task.getRoleCode());
        assertEquals(41L, task.getOwnerUserId());
        assertEquals("MF00041", task.getOwnerEmpNo());
        assertEquals(LocalDate.of(2026, 10, 30), task.getPlanFinishDate());
        assertEquals("todo", task.getStatus());
        assertEquals(1, task.getPlanVersion());
        assertEquals("RT202610220001", task.getTaskNo());
    }

    @Test
    @DisplayName("已有未完成 PRD 任务：只同步负责人/承诺日，不再新建")
    void ensureTaskKeepsSingleOpenTask() {
        RdmRequirement req = requirement();
        SysUser pm = user(41L, "MF00041", "李四");
        RdmWorkTask existing = new RdmWorkTask();
        existing.setId(9L);
        existing.setStatus("doing");
        when(userMapper.selectById(41L)).thenReturn(pm);
        when(taskMapper.selectOne(any())).thenReturn(existing);
        when(operatorResolver.operatorSignature(pm)).thenReturn("MF00041|李四");

        service.ensureTask(req, pm);

        verify(taskMapper, never()).insert((RdmWorkTask) any());
        verify(taskMapper).update(isNull(), any());
    }

    @Test
    @DisplayName("已完成 PRD 任务不再改期：历史承诺不能被后续保存覆盖")
    void ensureTaskDoesNotTouchDoneTask() {
        RdmRequirement req = requirement();
        SysUser pm = user(41L, "MF00041", "李四");
        RdmWorkTask existing = new RdmWorkTask();
        existing.setId(9L);
        existing.setStatus("done");
        when(userMapper.selectById(41L)).thenReturn(pm);
        when(taskMapper.selectOne(any())).thenReturn(existing);

        service.ensureTask(req, pm);

        verify(taskMapper, never()).insert((RdmWorkTask) any());
        verify(taskMapper, never()).update(any(), any());
    }

    @Test
    @DisplayName("PRD 提交评审：未完成任务收口为 done 并写实际完成时间")
    void completeTaskClosesOpenTask() {
        SysUser actor = user(41L, "MF00041", "李四");
        when(operatorResolver.operatorSignature(actor)).thenReturn("MF00041|李四");
        when(taskMapper.update(isNull(), any())).thenReturn(1);

        assertEquals(1, service.completeTask(7L, actor));

        verify(taskMapper).update(isNull(), any());
    }

    @Test
    @DisplayName("评审退回：把已完成任务重新打开，甘特图不再显示已完成")
    void reopenTaskReopensDoneTask() {
        SysUser actor = user(41L, "MF00041", "李四");
        when(operatorResolver.operatorSignature(actor)).thenReturn("MF00041|李四");
        when(taskMapper.update(isNull(), any())).thenReturn(1);

        assertEquals(1, service.reopenTask(7L, actor));

        verify(taskMapper).update(isNull(), any());
    }

    @Test
    @DisplayName("缺承诺日期不生成任务：没有交付时点就不造一条假任务")
    void ensureTaskSkipsWithoutPromiseDate() {
        RdmRequirement req = requirement();
        req.setPromisedPrdDate(null);

        service.ensureTask(req, user(41L, "MF00041", "李四"));

        verify(taskMapper, never()).insert((RdmWorkTask) any());
        assertNull(req.getPromisedPrdDate());
    }

    private static RdmRequirement requirement() {
        RdmRequirement req = new RdmRequirement();
        req.setId(7L);
        req.setReqNo("XQ202610220001");
        req.setAssigneePmUserId(41L);
        req.setAssigneePmEmpNo("MF00041");
        req.setAssigneePmName("李四");
        req.setPromisedPrdDate(LocalDate.of(2026, 10, 30));
        req.setAcceptTime(LocalDate.of(2026, 10, 20).atStartOfDay());
        return req;
    }

    private static SysUser user(long id, String empId, String name) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setEmpId(empId);
        user.setName(name);
        return user;
    }
}
