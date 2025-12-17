package com.mytub.model;

import jakarta.validation.constraints.*;
import lombok.Data;

@Data
public class SessionRequest {
    @NotBlank
    private String spotId;

    @NotBlank
    private String licensePlate;

    @Min(5)
    @Max(1440)
    private int durationMinutes; // minutos

    @DecimalMin("0.00")
    private Double valor; // amount paid

    @NotBlank
    private String metodo; // payment method

    @Pattern(regexp = "\\d{9}", message = "telemovel deve ter 9 digitos")
    private String telemovel; // phone number

    private String userName; // opcional
}
