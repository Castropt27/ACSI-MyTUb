package com.mytub.model;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class MbwayRequest {
    @NotBlank
    @Pattern(regexp = "\\d{9}", message = "telemovel deve ter 9 digitos")
    private String telemovel;

    @NotBlank
    private String matricula;

    @DecimalMin(value = "0.01", message = "valor deve ser > 0")
    private Double valor;

    @NotBlank
    private String lugarId;

    @NotBlank
    private String metodo;
}
