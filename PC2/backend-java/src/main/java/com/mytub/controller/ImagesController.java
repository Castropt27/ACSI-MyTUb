package com.mytub.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@RestController
@RequestMapping("/api/images")
public class ImagesController {

    @Value("${upload.dir:uploads}")
    private String uploadDir;

    @Value("${server.base-url:http://192.168.21.227:8000}")
    private String baseUrl;

    @PostMapping("/upload")
    public ResponseEntity<?> uploadImages(@RequestParam("files") MultipartFile[] files) {
        try {
            // Criar diretório se não existir
            Path uploadPath = Paths.get(uploadDir);
            if (!Files.exists(uploadPath)) {
                Files.createDirectories(uploadPath);
            }

            List<String> urls = new ArrayList<>();
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss");
            String timestamp = LocalDateTime.now().format(formatter);

            for (int i = 0; i < files.length; i++) {
                MultipartFile file = files[i];
                
                if (file.isEmpty()) {
                    continue;
                }

                // Validar tipo de ficheiro
                String contentType = file.getContentType();
                if (contentType == null || !contentType.startsWith("image/")) {
                    return ResponseEntity.badRequest()
                        .body(Map.of("error", "Ficheiro " + file.getOriginalFilename() + " não é uma imagem"));
                }

                // Gerar nome único: timestamp_index_random.ext
                String originalFilename = file.getOriginalFilename();
                String extension = "";
                if (originalFilename != null && originalFilename.contains(".")) {
                    extension = originalFilename.substring(originalFilename.lastIndexOf("."));
                }
                
                String filename = timestamp + "_" + i + "_" + UUID.randomUUID().toString().substring(0, 8) + extension;
                Path filePath = uploadPath.resolve(filename);

                // Guardar ficheiro
                Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);

                // Adicionar URL à lista
                String url = baseUrl + "/uploads/" + filename;
                urls.add(url);
            }

            if (urls.isEmpty()) {
                return ResponseEntity.badRequest()
                    .body(Map.of("error", "Nenhuma imagem válida foi enviada"));
            }

            return ResponseEntity.ok(Map.of("urls", urls));

        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "Erro ao guardar imagens: " + e.getMessage()));
        }
    }

    @GetMapping("/health")
    public ResponseEntity<?> health() {
        return ResponseEntity.ok(Map.of(
            "status", "ok",
            "uploadDir", uploadDir,
            "baseUrl", baseUrl
        ));
    }
}
