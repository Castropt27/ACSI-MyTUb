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
            // PC2 backend endpoint: GET /api/fines (returns all fines, not filtered by fiscal)
            const response = await fetch(`${this.config.BACKEND_URL}/api/fines/fiscal/45`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // 🔍 DEBUG: Ver dados brutos do backend
            console.log('📦 [API] Raw data from PC2:', data);
            console.log('📦 [API] data.fines:', data.fines);
            console.log('📦 [API] Is array?', Array.isArray(data));
            console.log('📦 [API] First item:', data.fines ? data.fines[0] : data[0]);

            // Transform backend format to frontend format
            // PC2 sends in camelCase!
            const allFines = (data.fines || data || []).map(fine => {
                // Parse history if it's a JSON string
                let history = [];
                try {
                    if (typeof fine.history === 'string') {
                        history = JSON.parse(fine.history);
                    } else if (Array.isArray(fine.history)) {
                        history = fine.history;
                    }
                } catch (e) {
                    console.warn('Failed to parse history:', fine.history);
                    history = [];
                }

                return {
                    fineId: fine.fineId,          // PC2 usa camelCase!
                    spotId: fine.spotId,
                    plate: fine.licensePlate || 'N/D',
                    fiscalId: fine.fiscalId,
                    fiscalNome: fine.fiscalName,
                    timestamp: fine.issueTimestamp,
                    gps: {
                        lat: fine.gpsLat,
                        lng: fine.gpsLng,
                        accuracy: 10 // Default value
                    },
                    photos: fine.photos ? fine.photos.map(url => {
                        console.log('📸 [API] Photo URL:', url);
                        return {
                            name: 'photo.jpg',
                            dataUrl: url  // URL from PC2 upload
                        };
                    }) : [],
                    observations: fine.reason || fine.notes || '',
                    status: fine.status,
                    history: history,  // Parsed array
                    rua: fine.locationAddress || ''
                };
            });

            // Filter by fiscalId on frontend (if PC2 doesn't filter)
            // return fiscalId ? allFines.filter(f => f.fiscalId === fiscalId) : allFines;
            console.log('✅ [API] Transformed fines:', allFines);
            return allFines;  // Return all for now

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
        console.log('📤 [API] saveFine() INICIADO');
        console.log('📋 [API] Dados recebidos:', fine);

        try {
            // Step 1: Upload images to PC2 if there are photos
            let imageUrls = [];

            if (fine.photos && fine.photos.length > 0) {
                console.log(`🖼️ [API] Uploading ${fine.photos.length} foto(s) para PC2...`);

                try {
                    // Convert dataURLs to Blobs and create FormData
                    const formData = new FormData();

                    for (let i = 0; i < fine.photos.length; i++) {
                        const photo = fine.photos[i];
                        // Convert base64 dataURL to Blob
                        const blob = await fetch(photo.dataUrl).then(r => r.blob());
                        formData.append('files', blob, `photo_${i}.jpg`);
                    }

                    console.log(`📤 [API] Enviando imagens para ${this.config.BACKEND_URL}/api/images/upload`);

                    const uploadResponse = await fetch(`${this.config.BACKEND_URL}/api/images/upload`, {
                        method: 'POST',
                        body: formData  // Don't set Content-Type - browser sets it with boundary
                    });

                    if (!uploadResponse.ok) {
                        throw new Error(`Image upload failed: ${uploadResponse.status}`);
                    }

                    const uploadResult = await uploadResponse.json();
                    imageUrls = uploadResult.urls || [];

                    console.log(`✅ [API] Imagens uploaded com sucesso:`, imageUrls);

                } catch (uploadError) {
                    console.error('❌ [API] Erro ao fazer upload de imagens:', uploadError);
                    // Continue sem imagens se o upload falhar
                    imageUrls = [];
                }
            }

            // Step 2: Create fine with image URLs
            const payload = {
                spotId: fine.spotId,
                fiscalId: fine.fiscalId,
                fiscalName: fine.fiscalNome,
                licensePlate: fine.plate,
                reason: fine.observations || "Estacionamento sem sessão de pagamento válida",
                amount: this.config.DEFAULT_FINE_AMOUNT,
                photoBase64: imageUrls.length > 0 ? imageUrls[0] : null,  // First URL for backward compatibility
                photos: imageUrls,  // Array of URLs (not base64!)
                notes: fine.observations || null
            };

            console.log('📦 [API] Payload preparado:', {
                ...payload,
                photos: `[${payload.photos.length} URL(s)]`
            });
            console.log(`🌐 [API] Enviando POST para: ${this.config.BACKEND_URL}/api/fines`);

            const response = await fetch(`${this.config.BACKEND_URL}/api/fines`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            console.log(`📡 [API] Resposta recebida - Status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                const errorText = await response.text();

                // Try to parse JSON error
                let errorDetail = errorText;
                try {
                    const errorJson = JSON.parse(errorText);
                    errorDetail = errorJson;
                    console.error('❌ [API] Erro HTTP (parsed):', errorJson);
                } catch (e) {
                    console.error('❌ [API] Erro HTTP (raw):', errorText);
                }

                console.error('❌ [API] Full error:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorDetail
                });

                throw new Error(`HTTP ${response.status}: ${errorDetail.error || errorDetail.message || response.statusText}`);
            }

            const createdFine = await response.json();
            console.log('✅ [API] Coima criada com sucesso no backend:', createdFine);

            // Transform backend response to frontend format
            const transformedFine = {
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

            console.log('🔄 [API] Coima transformada para formato frontend:', transformedFine);
            return transformedFine;

        } catch (error) {
            console.error('❌ [API] ERRO ao guardar coima:', error);
            console.error('📍 [API] Stack trace:', error.stack);
            console.warn('⚠️ [API] A usar fallback para localStorage...');
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
            action: 'Criada'
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
