package com.mytub.model;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

@Data
public class FineRequest {
    @NotBlank
    private String spotId;
    
    @NotBlank
    private String fiscalId;
    
    @NotBlank
    private String fiscalName;
    
    @NotBlank
    private String licensePlate;
    
    @NotBlank
    private String reason;
    
    @DecimalMin("0.01")
    private Double amount;
    
    private String photoBase64;
    private List<String> photos;
    private String notes;
}
