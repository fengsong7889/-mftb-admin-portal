package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.dto.HrOffboardingTaskVO;
import com.mftb.admin.entity.HrOffboardingTask;
import com.mftb.admin.service.HrOffboardingTaskService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;

import java.lang.reflect.Method;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 离职联动接口的映射与权限边界。
 * <p>三个写入口（指定接收人、重试）都必须挂 edit，读入口挂 view；漏挂等于
 * 「任何登录用户都能把别人的资产与待办转给自己指定的人」——这是权限注解最容易漏的一类端点。
 */
class HrOffboardingControllerMappingTest {

    private final HrOffboardingTaskService taskService = mock(HrOffboardingTaskService.class);
    private final OperatorResolver operatorResolver = mock(OperatorResolver.class);

    private MockMvc mockMvc() {
        return MockMvcBuilders.standaloneSetup(new HrOffboardingController(taskService, operatorResolver)).build();
    }

    @Test
    @DisplayName("任务列表已映射，并把等待原因一并带出")
    void taskListIsMapped() throws Exception {
        HrOffboardingTask task = new HrOffboardingTask();
        task.setId(1L);
        task.setRequestId(88L);
        task.setTaskType(HrOffboardingTask.TYPE_ASSET_HANDOVER);
        task.setStatus(HrOffboardingTask.STATUS_FAILED);
        task.setAttempts(1);
        task.setLastError("尚未指定交接接收人");
        task.setEffectiveDate(LocalDate.of(2026, 10, 18));
        when(taskService.listByRequest(88L)).thenReturn(List.of(task));

        mockMvc().perform(get("/api/hr/offboarding/requests/88/tasks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].taskType").value("EAM_ASSET_HANDOVER"))
                .andExpect(jsonPath("$.data[0].status").value("FAILED"))
                .andExpect(jsonPath("$.data[0].attempts").value(1))
                .andExpect(jsonPath("$.data[0].lastError").value("尚未指定交接接收人"));
    }

    @Test
    @DisplayName("指定接收人与重试都走服务层，操作人取当前登录人")
    void writeEndpointsDelegate() throws Exception {
        when(operatorResolver.currentOperatorName()).thenReturn("HR專員");

        mockMvc().perform(post("/api/hr/offboarding/requests/88/receiver")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"receiverUserId\":22}"))
                .andExpect(status().isOk());
        verify(taskService).assignReceiver(eq(88L), eq(22L), eq("HR專員"));

        mockMvc().perform(post("/api/hr/offboarding/tasks/7/retry"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
        verify(taskService).execute(anyLong(), anyString());
    }

    @Test
    @DisplayName("每个 handler 都带 @RequirePermission，且写动作用 edit、读动作用 view")
    void everyHandlerCarriesPermission() {
        Method[] handlers = Arrays.stream(HrOffboardingController.class.getDeclaredMethods())
                .filter(m -> !m.isSynthetic() && !m.getName().startsWith("$"))
                .filter(m -> m.isAnnotationPresent(GetMapping.class) || m.isAnnotationPresent(PostMapping.class)
                        || m.isAnnotationPresent(PutMapping.class))
                .toArray(Method[]::new);
        assertEquals(4, handlers.length, "任务列表 / 类型清单 / 指定接收人 / 重试");

        for (Method method : handlers) {
            RequirePermission permission = method.getAnnotation(RequirePermission.class);
            assertNotNull(permission, "端点漏挂 @RequirePermission: " + method.getName());
            assertEquals("hr-dimission", permission.menu());
            boolean writable = method.isAnnotationPresent(PostMapping.class)
                    || method.isAnnotationPresent(PutMapping.class);
            assertEquals(writable ? "edit" : "view", permission.action(),
                    "权限动作与读写性质不匹配: " + method.getName());
        }
    }

    @Test
    @DisplayName("视图不回传跨模块内部结构，只回传可读摘要")
    void viewKeepsBusinessFields() {
        HrOffboardingTask task = new HrOffboardingTask();
        task.setId(3L);
        task.setTaskType(HrOffboardingTask.TYPE_OA_TODO_TRANSFER);
        task.setStatus(HrOffboardingTask.STATUS_DONE);
        task.setResultSummary("已改派待辦 2 個節點 → 王小美");
        task.setTargetRef("11,12");

        HrOffboardingTaskVO vo = HrOffboardingTaskVO.from(task);
        assertEquals("11,12", vo.getTargetRef());
        assertEquals("已改派待辦 2 個節點 → 王小美", vo.getResultSummary());
    }
}
