/**
 * API Layer - Backend integration (PC2)
 * Replaces localStorage with real API calls
 */

const API = {
    /**
     * Get config from window.APP_CONFIG
     */
    get config() {
        return window.APP_CONFIG || {
            BACKEND_URL: 'http://localhost:8000',
            DEFAULT_FINE_AMOUNT: 50.00
        };
    },

    /**
     * Get all fines for a specific fiscal
     */
    async getFines(fiscalId) {
        try {
            const response = await fetch(`${this.config.BACKEND_URL}/api/fines/fiscal/${fiscalId}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // Transform backend format to frontend format
            return data.fines.map(fine => ({
                fineId: fine.fine_id,
                spotId: fine.spot_id,
                plate: fine.license_plate || 'N/D',
                fiscalId: fine.fiscal_id,
                fiscalNome: fine.fiscal_name,
                timestamp: fine.issue_timestamp,
                gps: {
                    lat: fine.gps_lat,
                    lng: fine.gps_lng,
                    accuracy: 10 // Default value
                },
                photos: fine.photo_url ? [{
                    name: 'photo.jpg',
                    dataUrl: fine.photo_url
                }] : [],
                observations: fine.reason || '',
                status: fine.status,
                history: fine.history || [],
                rua: fine.location_address || ''
            }));
        } catch (error) {
            console.error('Error fetching fines:', error);
            // Fallback to localStorage if backend fails
            return this.getFinesFromLocalStorage();
        }
    },

    /**
     * Save a new fine to backend
     */
    async saveFine(fine) {
        try {
            // Convert photos to base64 array (extract data URLs)
            const photosBase64 = fine.photos && fine.photos.length > 0
                ? fine.photos.map(photo => photo.dataUrl)
                : [];

            const payload = {
                spot_id: fine.spotId,
                fiscal_id: fine.fiscalId,
                fiscal_name: fine.fiscalNome,
                license_plate: fine.plate,
                reason: fine.observations || "Estacionamento sem sessão de pagamento válida",
                amount: this.config.DEFAULT_FINE_AMOUNT,
                photos: photosBase64,
                notes: fine.observations || null
                // GPS e location_address são buscados automaticamente pelo backend via spot_id
            };

            const response = await fetch(`${this.config.BACKEND_URL}/api/fines`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const createdFine = await response.json();

            // Transform backend response to frontend format
            return {
                fineId: createdFine.fine_id,
                spotId: createdFine.spot_id,
                plate: createdFine.license_plate,
                fiscalId: createdFine.fiscal_id,
                fiscalNome: createdFine.fiscal_name,
                timestamp: createdFine.issue_timestamp,
                gps: {
                    lat: createdFine.gps_lat,
                    lng: createdFine.gps_lng
                },
                photos: createdFine.photos || [],
                observations: createdFine.reason,
                status: createdFine.status,
                history: createdFine.history || [],
                rua: createdFine.location_address
            };
        } catch (error) {
            console.error('Error saving fine:', error);
            // Fallback to localStorage
            return this.saveFineToLocalStorage(fine);
        }
    },

    /**
     * Update fine status in backend
     */
    async updateFine(fineId, updates) {
        try {
            // If updating status, use the status update endpoint
            if (updates.status) {
                const payload = {
                    status: updates.status,
                    note: updates.note || null
                };

                const response = await fetch(`${this.config.BACKEND_URL}/api/fines/${fineId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const updatedFine = await response.json();

                // Transform to frontend format
                return {
                    fineId: updatedFine.fine_id,
                    spotId: updatedFine.spot_id,
                    plate: updatedFine.license_plate,
                    fiscalId: updatedFine.fiscal_id,
                    fiscalNome: updatedFine.fiscal_name,
                    timestamp: updatedFine.issue_timestamp,
                    gps: {
                        lat: updatedFine.gps_lat,
                        lng: updatedFine.gps_lng
                    },
                    photos: updatedFine.photo_url ? [{ dataUrl: updatedFine.photo_url }] : [],
                    observations: updatedFine.reason,
                    status: updatedFine.status,
                    history: updatedFine.history || [],
                    rua: updatedFine.location_address
                };
            }
        } catch (error) {
            console.error('Error updating fine:', error);
            // Fallback to localStorage
            return this.updateFineInLocalStorage(fineId, updates);
        }
    },

    /**
     * Delete a fine (not used, but kept for compatibility)
     */
    async deleteFine(fineId) {
        // Backend doesn't have delete endpoint
        // Just mark as Anulada
        return this.updateFine(fineId, { status: 'Anulada' });
    },

    // ============================================================================
    // FALLBACK: LocalStorage methods (in case backend is down)
    // ============================================================================

    getFinesFromLocalStorage() {
        const fines = localStorage.getItem('fines');
        return fines ? JSON.parse(fines) : [];
    },

    saveFineToLocalStorage(fine) {
        const fines = this.getFinesFromLocalStorage();

        // Add ID if not present
        if (!fine.fineId) {
            fine.fineId = this.generateId();
        }

        // Add history entry
        if (!fine.history) {
            fine.history = [];
        }
        fine.history.push({
            status: fine.status,
            timestamp: new Date().toISOString(),
            action: 'Criada (localStorage fallback)'
        });

        fines.push(fine);
        localStorage.setItem('fines', JSON.stringify(fines));
        console.warn('⚠️ Fine saved to localStorage (backend unavailable)');
        return fine;
    },

    updateFineInLocalStorage(fineId, updates) {
        const fines = this.getFinesFromLocalStorage();
        const index = fines.findIndex(f => f.fineId === fineId);

        if (index === -1) {
            throw new Error('Coima não encontrada');
        }

        const oldStatus = fines[index].status;
        fines[index] = { ...fines[index], ...updates };

        // Add history entry if status changed
        if (updates.status && updates.status !== oldStatus) {
            if (!fines[index].history) {
                fines[index].history = [];
            }
            fines[index].history.push({
                status: updates.status,
                timestamp: new Date().toISOString(),
                action: `Alterada de "${oldStatus}" para "${updates.status}" (localStorage)`
            });
        }

        localStorage.setItem('fines', JSON.stringify(fines));
        console.warn('⚠️ Fine updated in localStorage (backend unavailable)');
        return fines[index];
    },

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================

    /**
     * Generate unique ID (for localStorage fallback)
     */
    generateId() {
        return `F${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * Convert file input to base64 data URL
     */
    async fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    /**
     * Get current geolocation
     */
    async getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocalização não suportada'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    });
                },
                (error) => {
                    reject(new Error('Erro ao obter localização: ' + error.message));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    },

    // ============================================================================
    // BACKEND-SPECIFIC: Spots & Irregularities
    // ============================================================================

    /**
     * Load all parking spots from backend
     */
    async loadSpots() {
        try {
            const response = await fetch(`${this.config.BACKEND_URL}/api/fiscal/spots`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // Transform to frontend format
            return data.spots.map(spot => ({
                spotId: spot.spot_id,
                rua: spot.rua || `Lugar ${spot.spot_id}`,
                lat: parseFloat(spot.gps_lat),
                lng: parseFloat(spot.gps_lng),
                zone: spot.zone || 'unknown',
                state: spot.ocupado ? 'occupied' : 'free',
                hasValidSession: spot.has_valid_session,
                lastUpdate: spot.last_update
            }));
        } catch (error) {
            console.error('Error loading spots from backend:', error);
            // Fallback: load from spots.sample.json
            return this.loadSpotsFromFile();
        }
    },

    /**
     * Fallback: Load spots from local JSON file
     */
    async loadSpotsFromFile() {
        try {
            const response = await fetch('spots.sample.json');
            const spots = await response.json();
            console.warn('⚠️ Loaded spots from spots.sample.json (backend unavailable)');
            return spots;
        } catch (error) {
            console.error('Error loading spots.sample.json:', error);
            return [];
        }
    },


};
