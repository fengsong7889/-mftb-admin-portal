package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * OA 流程 workflow_type 對齊修復
 *
 * 根因：前端工作流編輯器以 process_code（如 oa_purchase）為 key 保存配置到 biz_workflow_config，
 *       但後端 resolveDynamicNodes 使用 biz_oa_process.workflow_type（統一為 oa_general）查找配置，
 *       導致前後端 key 不一致，配置永遠讀不到最新值。
 *
 * 修復：將每個 OA 流程的 workflow_type 改為其自身的 process_code，並為各流程建立 biz_workflow_config 記錄。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OaWorkflowTypeFixDataInitializer implements CommandLineRunner {

    private static final String INIT_SCRIPT = "127_oa_workflow_type_fix.sql";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce("oa_workflow_type:" + INIT_SCRIPT + ":v1", () -> {
                try {
                    executeSqlScript(INIT_SCRIPT);
                } catch (java.io.IOException e) {
                    throw new IllegalStateException("讀取初始化腳本失敗: " + INIT_SCRIPT, e);
                }
            });
        } catch (Exception e) {
            log.error("OA流程workflow_type對齊修復失敗: {}", e.getMessage(), e);
        }
    }

    private void executeSqlScript(String scriptName) throws java.io.IOException {
        ClassPathResource resource = new ClassPathResource(scriptName);
        if (!resource.exists()) {
            log.warn("未找到 {}，跳過初始化", scriptName);
            return;
        }
        try (InputStream is = resource.getInputStream()) {
            String raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
            String noComment = raw.replaceAll("(?m)^\\s*--.*$", "");
            for (String stmt : noComment.split(";")) {
                String trimmed = stmt.trim();
                if (!trimmed.isEmpty()) {
                    jdbcTemplate.execute(trimmed);
                }
            }
            log.info("已執行 {} — OA流程workflow_type對齊修復完成", scriptName);
        }
    }
}
