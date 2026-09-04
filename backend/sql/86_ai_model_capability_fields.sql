-- 86_ai_model_capability_fields.sql
-- AI 模型表增加能力维度与限流字段
-- 依据：DeepSeek/Qwen/OpenAI 官方文档 + LLM 网关管理最佳实践
-- 设计目标：让管理后台能完整展示模型能力矩阵、计费规则、限流策略

-- 1. 模型版本（如 DeepSeek-V4-Flash-0731）
ALTER TABLE ai_model
  ADD COLUMN version VARCHAR(64) DEFAULT NULL COMMENT '模型版本号（如 DeepSeek-V4-Flash-0731）' AFTER name;

-- 2. API 兼容格式：openai / anthropic / gemini
ALTER TABLE ai_model
  ADD COLUMN api_compat VARCHAR(20) DEFAULT 'openai' COMMENT 'API 兼容格式：openai/anthropic/gemini' AFTER description;

-- 3. 多模态支持：text,image,audio,video 逗号分隔
ALTER TABLE ai_model
  ADD COLUMN modalities VARCHAR(100) DEFAULT 'text' COMMENT '支持模态：text,image,audio,video' AFTER api_compat;

-- 4. 视觉理解（图像输入）
ALTER TABLE ai_model
  ADD COLUMN vision_support TINYINT(1) DEFAULT 0 COMMENT '是否支持图像理解（视觉）' AFTER modalities;

-- 5. 工具调用（Function Calling / Tool Use）
ALTER TABLE ai_model
  ADD COLUMN function_calling TINYINT(1) DEFAULT 0 COMMENT '是否支持工具调用（Function Calling）' AFTER vision_support;

-- 6. JSON 结构化输出
ALTER TABLE ai_model
  ADD COLUMN json_mode TINYINT(1) DEFAULT 0 COMMENT '是否支持 JSON 模式结构化输出' AFTER function_calling;

-- 7. 流式响应（SSE）
ALTER TABLE ai_model
  ADD COLUMN streaming TINYINT(1) DEFAULT 1 COMMENT '是否支持流式响应' AFTER json_mode;

-- 8. 思考模式（深度思考 / Reasoning）
ALTER TABLE ai_model
  ADD COLUMN thinking_mode TINYINT(1) DEFAULT 0 COMMENT '是否支持思考模式（如 o1/o3/DeepSeek-R1）' AFTER streaming;

-- 9. 缓存命中输入价（部分模型支持）
ALTER TABLE ai_model
  ADD COLUMN cached_input_price DECIMAL(10,4) DEFAULT NULL COMMENT '缓存命中输入价（每百万 tokens）' AFTER output_price;

-- 10. 计费币种
ALTER TABLE ai_model
  ADD COLUMN currency VARCHAR(10) DEFAULT 'CNY' COMMENT '计费币种：CNY/USD' AFTER cached_input_price;

-- 11. 并发限制（TPM 量级）
ALTER TABLE ai_model
  ADD COLUMN concurrency_limit INT DEFAULT NULL COMMENT '并发限制（TPM 总量）' AFTER currency;

-- 12. 最后更新人
ALTER TABLE ai_model
  ADD COLUMN updated_by VARCHAR(50) DEFAULT NULL COMMENT '最后更新人' AFTER sort_order;
