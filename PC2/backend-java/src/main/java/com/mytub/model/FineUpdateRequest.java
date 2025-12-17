package com.mytub.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class FineUpdateRequest {
    @NotBlank
    @Pattern(regexp = "Emitida|Notificada|Paga|Em Recurso|Anulada")
    private String status;
    
    private String note;
}
