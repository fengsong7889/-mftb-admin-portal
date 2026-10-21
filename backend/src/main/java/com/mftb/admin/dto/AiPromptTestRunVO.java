package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** 提示词试跑结果：完整 Prompt + 回答 + 工具轨迹 + tokens。 */
@Data
public class AiPromptTestRunVO {

    private String prompt;

    private String text;

    private String model;

    private long tokens;

    private String errorKind;

    private List<Map<String, Object>> traces = new ArrayList<>();
}
