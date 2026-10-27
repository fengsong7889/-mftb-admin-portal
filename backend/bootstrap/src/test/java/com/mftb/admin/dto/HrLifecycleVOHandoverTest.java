package com.mftb.admin.dto;

import com.mftb.admin.entity.HrLifecycleRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 离职单据视图必须带出「交接接收人」。
 * <p>真实缺陷：`hr_lifecycle_request` 早已有 handover_to_user_id / handover_to_name 两列，
 * 联动执行也读它们找人，但 VO 没映射 → 详情页只能显示三个「-」，HR 以为交接已安排好，
 * 实际两条任务永远停在待处理。列在表里而视图里没有，是最容易骗过所有人的一种缺失。
 */
class HrLifecycleVOHandoverTest {

    @Test
    @DisplayName("接收人已指定时视图带出 id 与姓名快照")
    void carriesAssignedReceiver() {
        HrLifecycleRequest entity = new HrLifecycleRequest();
        entity.setId(88L);
        entity.setReqNo("RS202610180088");
        entity.setHandoverToUserId(22L);
        entity.setHandoverToName("王小美");

        HrLifecycleVO vo = HrLifecycleVO.from(entity);

        assertEquals(22L, vo.getHandoverToUserId());
        assertEquals("王小美", vo.getHandoverToName());
    }

    @Test
    @DisplayName("未指定时保持 null，让前端显示「尚未指定」而不是空串")
    void unsetReceiverStaysNull() {
        HrLifecycleRequest entity = new HrLifecycleRequest();
        entity.setId(89L);

        HrLifecycleVO vo = HrLifecycleVO.from(entity);

        assertNull(vo.getHandoverToUserId());
        assertNull(vo.getHandoverToName());
    }
}
