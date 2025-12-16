/**
 * Map Module - Leaflet map management for client parking interface
 */

const MapModule = {
    map: null,
    spotMarkers: {},

    /**
     * Initialize the Leaflet map centered on Praça do Comércio, Braga
     */
    init(containerId = 'map') {
        // Create map centered on Praça do Comércio, Braga
        this.map = L.map(containerId, {
            zoomControl: true,
            attributionControl: true
        }).setView([41.553863, -8.427441], 19);

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
            minZoom: 15
        }).addTo(this.map);

        return this.map;
    },

    /**
     * Add or update a parking spot marker
     */
    updateSpotMarker(spot) {
        const { id, nome, lat, lng, estado } = spot;

        // Determine marker color based on state
        let color = '#6C757D'; // grey (unknown)
        if (estado === 'LIVRE') color = '#4CAF50'; // green
        if (estado === 'OCUPADO') color = '#F44336'; // red

        // Create/update marker
        if (this.spotMarkers[id]) {
            // Update existing marker
            this.spotMarkers[id].marker.setLatLng([lat, lng]);
            this.spotMarkers[id].marker.getElement().querySelector('div').style.background = color;
        } else {
            // Create new marker with number label
            const spotIcon = L.divIcon({
                className: 'spot-marker',
                html: `
                    <div style="
                        position: relative;
                        width: 32px;
                        height: 32px;
                        background: ${color};
                        border-radius: 50%;
                        border: 3px solid white;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">
                        <span style="
                            color: white;
                            font-weight: 700;
                            font-size: 14px;
                            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                        ">${id}</span>
                    </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            const marker = L.marker([lat, lng], { icon: spotIcon })
                .addTo(this.map);

            // Store marker and spot data
            this.spotMarkers[id] = { marker, spot };
        }

        // Update stored spot data
        this.spotMarkers[id].spot = spot;
    },

    /**
     * Remove all markers from map
     */
    clearMarkers() {
        Object.values(this.spotMarkers).forEach(({ marker }) => {
            this.map.removeLayer(marker);
        });
        this.spotMarkers = {};
    },

    /**
     * Get map instance
     */
    getMap() {
        return this.map;
    },

    /**
     * Add click handler to marker
     */
    addMarkerClickHandler(spotId, callback) {
        const spotData = this.spotMarkers[spotId];
        if (spotData) {
            spotData.marker.on('click', () => callback(spotData.spot));
        }
    }
};
