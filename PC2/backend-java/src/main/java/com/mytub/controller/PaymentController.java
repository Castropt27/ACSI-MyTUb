package com.mytub.controller;

import com.mytub.model.MbwayRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@RestController
public class PaymentController {

    @PostMapping("/api/pagamentos/mbway")
    public ResponseEntity<Map<String, Object>> payMbway(@Valid @RequestBody MbwayRequest request) {
        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        res.put("metodo", request.getMetodo());
        res.put("lugarId", request.getLugarId());
        res.put("valor", request.getValor());
        res.put("matricula", request.getMatricula());
        res.put("telemovel", request.getTelemovel());
        res.put("timestamp", Instant.now().toString());
        res.put("message", "Pagamento MB WAY simulado (stub)");
        return ResponseEntity.ok(res);
    }
}
