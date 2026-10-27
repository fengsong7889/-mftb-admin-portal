package com.mftb.admin.service.doc;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;

/**
 * 本地磁盘对象存储：开发/测试默认实现。
 *
 * <p>对象键由服务端生成，不接受用户输入；每次解析都做 normalize + startsWith 校验，
 * 防止 {@code ../} 路径穿越。生产多实例部署必须切换到共享对象存储。
 */
@Slf4j
@Component
public class LocalDocObjectStorage implements DocObjectStorage {
    private final Path root;
    /** 存储根目录是否可用；不可用时只让文档相关操作失败，不让整个应用启动失败 */
    private final boolean available;

    public LocalDocObjectStorage(@Value("${doc.storage.local-root:./.local/doc-assets}") String root) {
        this.root = Paths.get(root).toAbsolutePath().normalize();
        boolean ready;
        try {
            Files.createDirectories(this.root);
            Files.createDirectories(this.root.resolve("tmp"));
            ready = true;
        } catch (IOException e) {
            // 目录不可写（典型场景：容器以非 root 用户运行而 /app 归 root）
            // 不能让文档存储把整个后台拖进 CrashLoopBackOff：工资、审批、人事都不该因它停机。
            // 这里降级为「文档功能不可用」，由 ensureAvailable 在真正读写文档时抛出可读错误。
            ready = false;
            log.error("文档对象存储目录不可写: {}（原因: {}）。文档中心功能将不可用；"
                    + "请把 DOC_STORAGE_LOCAL_ROOT 指向可写目录，或在镜像中预建该目录并授权给运行用户。",
                    this.root, e.toString());
        }
        this.available = ready;
        if (ready) {
            log.info("文档本地对象存储根目录: {}", this.root);
        }
    }

    private void ensureAvailable() {
        if (!available) {
            throw new IllegalStateException("文档对象存储不可用（目录不可写）: " + root
                    + "；请配置 DOC_STORAGE_LOCAL_ROOT 指向可写目录");
        }
    }

    @Override
    public String provider() {
        return "local";
    }

    @Override
    public Path newTempFile() {
        ensureAvailable();
        try {
            return Files.createTempFile(root.resolve("tmp"), "upload-", ".part");
        } catch (IOException e) {
            throw new IllegalStateException("创建上传临时文件失败", e);
        }
    }

    @Override
    public void put(String objectKey, Path source) {
        ensureAvailable();
        Path target = resolve(objectKey);
        try {
            Files.createDirectories(target.getParent());
            try {
                Files.move(source, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException atomicFailure) {
                Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new IllegalStateException("写入文档对象失败", e);
        }
    }

    @Override
    public InputStream open(String objectKey) {
        ensureAvailable();
        try {
            return Files.newInputStream(resolve(objectKey));
        } catch (IOException e) {
            throw new IllegalStateException("读取文档对象失败", e);
        }
    }

    @Override
    public long size(String objectKey) {
        ensureAvailable();
        try {
            return Files.size(resolve(objectKey));
        } catch (IOException e) {
            throw new IllegalStateException("读取文档对象大小失败", e);
        }
    }

    @Override
    public void delete(String objectKey) {
        ensureAvailable();
        try {
            Files.deleteIfExists(resolve(objectKey));
        } catch (IOException e) {
            throw new IllegalStateException("删除文档对象失败", e);
        }
    }

    private Path resolve(String objectKey) {
        if (objectKey == null || objectKey.isBlank() || objectKey.contains("\0")) {
            throw new IllegalArgumentException("非法对象键");
        }
        Path target = root.resolve(objectKey).normalize();
        if (!target.startsWith(root)) throw new IllegalArgumentException("对象键越界");
        return target;
    }
}
