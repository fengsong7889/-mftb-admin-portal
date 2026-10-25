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

    public LocalDocObjectStorage(@Value("${doc.storage.local-root:./.local/doc-assets}") String root) {
        this.root = Paths.get(root).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.root);
            Files.createDirectories(this.root.resolve("tmp"));
        } catch (IOException e) {
            throw new IllegalStateException("文档对象存储目录初始化失败: " + this.root, e);
        }
        log.info("文档本地对象存储根目录: {}", this.root);
    }

    @Override
    public String provider() {
        return "local";
    }

    @Override
    public Path newTempFile() {
        try {
            return Files.createTempFile(root.resolve("tmp"), "upload-", ".part");
        } catch (IOException e) {
            throw new IllegalStateException("创建上传临时文件失败", e);
        }
    }

    @Override
    public void put(String objectKey, Path source) {
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
        try {
            return Files.newInputStream(resolve(objectKey));
        } catch (IOException e) {
            throw new IllegalStateException("读取文档对象失败", e);
        }
    }

    @Override
    public long size(String objectKey) {
        try {
            return Files.size(resolve(objectKey));
        } catch (IOException e) {
            throw new IllegalStateException("读取文档对象大小失败", e);
        }
    }

    @Override
    public void delete(String objectKey) {
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
