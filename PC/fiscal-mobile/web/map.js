/**
 * Map Module - Leaflet map management and markers
 */

const MapModule = {
    map: null,
    fiscalMarker: null,
    spotMarkers: {},
    fiscalPosition: null,

    /**
     * Initialize the Leaflet map
     */
    init(containerId = 'mapContainer') {
        // Create map centered on Mercado de Braga (PC3)
        this.map = L.map(containerId).setView([41.553863, -8.427441], 19);

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(this.map);

        // Get and show fiscal position
        this.updateFiscalPosition();

        return this.map;
    },

    /**
     * Update fiscal's current position
     */
    async updateFiscalPosition() {
        try {
            const position = await API.getCurrentPosition();
            this.fiscalPosition = position;

            // Remove old marker if exists
            if (this.fiscalMarker) {
                this.map.removeLayer(this.fiscalMarker);
            }

            // Create custom icon for fiscal
            const fiscalIcon = L.divIcon({
                className: 'fiscal-marker',
                html: '<div style="background: #0066CC; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>',
                iconSize: [26, 26],
                iconAnchor: [13, 13]
            });

            // Add marker
            this.fiscalMarker = L.marker([position.lat, position.lng], { icon: fiscalIcon })
                .addTo(this.map)
                .bindPopup('A sua localização');

            // Don't recenter map - keep focused on parking spots

        } catch (error) {
            console.warn('Não foi possível obter localização:', error);
            // Continue without geolocation
        }
    },

    /**
     * Add or update a spot marker
     */
    updateSpotMarker(spot) {
        const { spotId, lat, lng, state, rua } = spot;

        // Determine marker color based on state
        let color = '#6C757D'; // grey (unknown)
        if (state === 'free') color = '#28A745'; // green
        if (state === 'occupied') color = '#DC3545'; // red

        // Create/update marker
        if (this.spotMarkers[spotId]) {
            console.log(`🔄 Updating existing marker for spot ${spotId} - New state: ${state}, Color: ${color}`);

            // Remove old marker
            this.map.removeLayer(this.spotMarkers[spotId].marker);

            // Create new marker with updated color
            const spotIcon = L.divIcon({
                className: 'spot-marker',
                html: `<div style="background: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            const marker = L.marker([lat, lng], { icon: spotIcon })
                .addTo(this.map)
                .bindPopup(`
                    <strong>${spotId}</strong><br>
                    ${rua || 'Sem rua'}<br>
                    Estado: <span style="color: ${color}; font-weight: bold;">${state || 'desconhecido'}</span>
                `);

            this.spotMarkers[spotId].marker = marker;
            this.spotMarkers[spotId].spot = spot;
            console.log(`✅ Marker updated!`);
        } else {
            // Create new marker
            const spotIcon = L.divIcon({
                className: 'spot-marker',
                html: `<div style="background: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            const marker = L.marker([lat, lng], { icon: spotIcon })
                .addTo(this.map)
                .bindPopup(`
                    <strong>${spotId}</strong><br>
                    ${rua || 'Sem rua'}<br>
                    Estado: <span style="color: ${color}; font-weight: bold;">${state || 'desconhecido'}</span>
                `);

            this.spotMarkers[spotId] = { marker, spot };
        }

        // Store updated spot data
        this.spotMarkers[spotId].spot = spot;
    },

    /**
     * Center map on a specific spot
     */
    centerOnSpot(spotId) {
        const spotData = this.spotMarkers[spotId];
        if (spotData) {
            this.map.setView([spotData.spot.lat, spotData.spot.lng], 17);
            spotData.marker.openPopup();
        }
    },

    /**
     * Calculate distance between two points (Haversine formula)
     */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371e3; // Earth radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lng2 - lng1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    },

    /**
     * Get distance from fiscal to spot
     */
    getDistanceToSpot(spotId) {
        if (!this.fiscalPosition) return Infinity;

        const spotData = this.spotMarkers[spotId];
        if (!spotData) return Infinity;

        return this.calculateDistance(
            this.fiscalPosition.lat,
            this.fiscalPosition.lng,
            spotData.spot.lat,
            spotData.spot.lng
        );
    }
};
