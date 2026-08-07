package com.mftb.admin.dto;

import java.util.List;

/**
 * 机翻请求 DTO
 * <p>
 * 支持单条与批量两种模式：
 * <ul>
 *   <li>单条：ids 放一个 id，对该记录空缺语言调用 MyMemory 机翻</li>
 *   <li>批量：ids 放多个 id，逐条机翻并持久化</li>
 * </ul>
 * targetLangs 留空则自动翻译该记录所有空缺语言
 */
public class MachineTranslateRequest {

    /** 翻译字段 ID 列表 */
    private List<Long> ids;

    /** 目标语言代码列表（留空 = 所有已注册语言） */
    private List<String> targetLangs;

    public List<Long> getIds() {
        return ids;
    }

    public void setIds(List<Long> ids) {
        this.ids = ids;
    }

    public List<String> getTargetLangs() {
        return targetLangs;
    }

    public void setTargetLangs(List<String> targetLangs) {
        this.targetLangs = targetLangs;
    }
}
