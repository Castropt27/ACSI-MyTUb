package com.mytub.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Spot {
    private String spotId;
    private boolean ocupado;
    private Double minutesSinceChange;
    private Double gpsLat;
    private Double gpsLng;
    private String rua;
    private String zone;
    private boolean hasValidSession;
    private String activeSessionId;
}
