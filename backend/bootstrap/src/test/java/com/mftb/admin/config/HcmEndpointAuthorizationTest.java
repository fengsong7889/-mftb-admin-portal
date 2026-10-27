package com.mftb.admin.config;

import com.mftb.admin.annotation.RequirePermission;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.type.AnnotationMetadata;
import org.springframework.core.type.MethodMetadata;
import org.springframework.core.type.classreading.MetadataReader;
import org.springframework.core.type.classreading.MetadataReaderFactory;
import org.springframework.core.type.classreading.SimpleMetadataReaderFactory;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * HCM 端点的 fail-closed 不变量：凡是挂在 {@code /api/hcm/**} 下的 Hcm* 控制器方法，
 * 必须显式标注 {@code @RequirePermission}。
 * <p>
 * 为什么用元数据扫描而不是手工列类名：手工列表会在新增控制器时静默失效，
 * 而这条用例的职责正是"新增端点忘标注就红"。扫描基于 class 元数据，不加载 Spring 上下文、不连库。
 */
class HcmEndpointAuthorizationTest {

    private static final String[] MAPPINGS = {
            "org.springframework.web.bind.annotation.GetMapping",
            "org.springframework.web.bind.annotation.PostMapping",
            "org.springframework.web.bind.annotation.PutMapping",
            "org.springframework.web.bind.annotation.DeleteMapping",
            "org.springframework.web.bind.annotation.PatchMapping",
            "org.springframework.web.bind.annotation.RequestMapping",
    };

    @Test
    @DisplayName("HCM 控制器每个映射方法都必须声明 @RequirePermission")
    void everyHcmHandlerDeclaresPermission() throws Exception {
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        MetadataReaderFactory factory = new SimpleMetadataReaderFactory();
        Resource[] resources = resolver.getResources("classpath*:com/mftb/admin/controller/Hcm*.class");
        assertTrue(resources.length > 0, "未扫描到任何 HCM 控制器，扫描路径可能失效");

        List<String> offenders = new ArrayList<>();
        int checked = 0;
        for (Resource resource : resources) {
            MetadataReader reader = factory.getMetadataReader(resource);
            AnnotationMetadata metadata = reader.getAnnotationMetadata();
            for (String mapping : MAPPINGS) {
                for (MethodMetadata method : metadata.getAnnotatedMethods(mapping)) {
                    checked++;
                    if (!method.isAnnotated(RequirePermission.class.getName())) {
                        offenders.add(metadata.getClassName() + "#" + method.getMethodName());
                    }
                }
            }
        }
        assertTrue(checked > 0, "HCM 控制器里没有扫描到任何映射方法");
        assertFalse(offenders.isEmpty() && checked == 0,
                "扫描结果异常：既无方法也无违规");
        assertTrue(offenders.isEmpty(),
                "以下 HCM 端点未声明 @RequirePermission，会被路径级兜底拦成 403：" + offenders);
    }
}
