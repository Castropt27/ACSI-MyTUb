/**
 * API Layer - LocalStorage wrapper for fines management
 */

const API = {
    /**
     * Get all fines from localStorage
     */
    getFines() {
        const fines = localStorage.getItem('fines');
        return fines ? JSON.parse(fines) : [];
    },

    /**
     * Save a new fine
     */
    saveFine(fine) {
        const fines = this.getFines();

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
        return fine;
    },

    /**
     * Update an existing fine
     */
    updateFine(fineId, updates) {
        const fines = this.getFines();
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
                action: `Alterada de "${oldStatus}" para "${updates.status}"`
            });
        }

        localStorage.setItem('fines', JSON.stringify(fines));
        return fines[index];
    },

    /**
     * Delete a fine (for anular)
     */
    deleteFine(fineId) {
        const fines = this.getFines();
        const filtered = fines.filter(f => f.fineId !== fineId);
        localStorage.setItem('fines', JSON.stringify(filtered));
    },

    /**
     * Generate unique ID
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
    }
};
