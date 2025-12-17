package com.mytub.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Fine {
    private String fineId;
    private String spotId;
    private String fiscalId;
    private String fiscalName;
    private String licensePlate;
    private LocalDateTime issueTimestamp;
    private String status; // Emitida, Notificada, Paga, Em Recurso, Anulada
    private String reason;
    private Double amount;
    private String photoUrl;
    private List<String> photos; // JSON array
    private String notes;
    private Double gpsLat;
    private Double gpsLng;
    private String locationAddress;
    private String history; // JSON
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
