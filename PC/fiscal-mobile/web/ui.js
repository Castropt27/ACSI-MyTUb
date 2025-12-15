/**
 * UI Module - Rendering functions for all tabs and modals
 */

const UI = {
    /**
     * Show toast notification
     */
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.remove('hidden');

        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    },

    /**
     * Render Map Tab
     */
    renderMapTab() {
        const content = document.getElementById('mainContent');
        content.innerHTML = '<div id="mapContainer"></div>';

        // Initialize map
        setTimeout(() => {
            MapModule.init('mapContainer');

            // Load and display all spots
            if (window.appState && window.appState.spots) {
                Object.values(window.appState.spots).forEach(spot => {
                    MapModule.updateSpotMarker(spot);
                });
            }
        }, 100);
    },

    /**
     * Render Irregularidades Tab
     */
    renderIrregularidadesTab() {
        const content = document.getElementById('mainContent');
        const irregularities = window.appState ? window.appState.irregularities : {};
        const irregList = Object.values(irregularities);

        // Sort by priority (longest duration first, then by distance)
        irregList.sort((a, b) => {
            const durationDiff = b.duration - a.duration;
            if (durationDiff !== 0) return durationDiff;

            // Secondary sort by distance if available
            const distA = MapModule.getDistanceToSpot(a.spotId);
            const distB = MapModule.getDistanceToSpot(b.spotId);
            return distA - distB;
        });


        if (irregList.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🎉</div>
                    <div class="empty-state-text">Tudo em ordem!</div>
                    <p style="color: var(--color-grey); margin-top: var(--spacing-sm); font-size: var(--font-size-sm);">Não há irregularidades neste momento</p>
                </div>
            `;
            return;
        }


        let html = '<div class="list-container">';

        irregList.forEach(irreg => {
            const spot = window.appState.spots[irreg.spotId];
            const minutes = Math.floor(irreg.duration / 60000);
            const seconds = Math.floor((irreg.duration % 60000) / 1000);
            const distance = MapModule.getDistanceToSpot(irreg.spotId);
            const distanceText = distance !== Infinity ? `${Math.round(distance)}m` : '';

            html += `
                <div class="card">
                    <div class="card-header">
                        <div>
                            <div class="card-title">${irreg.spotId}</div>
                            <div class="card-subtitle">📍 ${spot?.rua || 'Local não especificado'}</div>
                        </div>
                        <span class="badge badge-danger">Irregular</span>
                    </div>
                    
                    <div style="margin-bottom: var(--spacing-md); color: var(--color-grey-dark);">
                        <div style="display: flex; align-items: center; gap: var(--spacing-xs); margin-bottom: var(--spacing-xs);">
                            <span style="font-size: 1.25rem;">⏱️</span>
                            <strong>${minutes}min ${seconds}s</strong> sem pagamento
                        </div>
                        ${distanceText ? `
                        <div style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <span style="font-size: 1.25rem;">📏</span>
                            <span>${distanceText} de distância</span>
                        </div>` : ''}
                    </div>
                    
                    <div class="card-actions">
                        <button class="btn btn-secondary btn-sm" onclick="UI.viewSpotOnMap('${irreg.spotId}')">
                            🗺️ Ver Mapa
                        </button>
                        <button class="btn btn-primary btn-sm" onclick="UI.showFineModal('${irreg.spotId}')">
                            ⚡ Multar
                        </button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        content.innerHTML = html;
    },

    /**
     * View spot on map
     */
    viewSpotOnMap(spotId) {
        window.appRouter.navigateToTab('mapa');
        setTimeout(() => {
            MapModule.centerOnSpot(spotId);
        }, 200);
    },

    /**
     * Show fine issuance modal
     */
    async showFineModal(spotId) {
        const spot = window.appState.spots[spotId];
        const irreg = window.appState.irregularities[spotId];
        const fiscal = JSON.parse(localStorage.getItem('fiscal'));

        // Check tolerance (30 seconds)
        const seconds = Math.floor(irreg.duration / 1000);
        const withinTolerance = seconds <= 30;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h2 class="modal-title">Emitir Coima</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <form id="fineForm" class="modal-body">
                    ${withinTolerance ? `
                        <div style="background: var(--gradient-success); color: white; padding: var(--spacing-md); border-radius: var(--border-radius-md); margin-bottom: var(--spacing-md); text-align: center; font-weight: 600;">
                            ✋ Dentro da tolerância (${seconds}s)<br>
                            <small style="opacity: 0.9;">Necessário >30s para multar</small>
                        </div>
                    ` : ''}
                    
                    <div class="form-group">
                        <label for="finePlate">🚗 Matrícula *</label>
                        <input type="text" id="finePlate" required ${withinTolerance ? 'disabled' : ''} 
                               placeholder="AA-00-BB" pattern="[A-Z]{2}-[0-9]{2}-[A-Z]{2}">
                    </div>
                    
                    <div class="form-group">
                        <label>📍 Lugar</label>
                        <input type="text" value="${spotId} - ${spot?.rua || 'N/D'}" readonly style="background: var(--color-grey-light);">
                    </div>
                    
                    <div class="form-group">
                        <label>🕐 Data/Hora</label>
                        <input type="text" value="${new Date().toLocaleString('pt-PT')}" readonly style="background: var(--color-grey-light);">
                    </div>
                    
                    <div class="form-group">
                        <label>👤 Fiscal</label>
                        <input type="text" value="${fiscal.nome} (${fiscal.id})" readonly style="background: var(--color-grey-light);">
                    </div>
                    
                    <div class="form-group">
                        <label>📍 GPS</label>
                        <div id="gpsInfo" style="margin-bottom: var(--spacing-sm); padding: var(--spacing-sm); background: var(--color-grey-light); border-radius: var(--border-radius-sm); font-size: var(--font-size-sm);">
                            📡 A obter localização...
                        </div>
                        <button type="button" class="btn btn-secondary btn-sm" onclick="UI.refreshGPS()" ${withinTolerance ? 'disabled' : ''}>
                            🔄 Atualizar GPS
                        </button>
                    </div>
                    
                    <div class="form-group">
                        <label for="finePhotos">📷 Fotos (1-3) *</label>
                        <input type="file" id="finePhotos" accept="image/*" capture="environment" 
                               multiple max="3" ${withinTolerance ? 'disabled' : ''} required>
                        <div id="photoPreview" class="photo-preview-container"></div>
                    </div>
                    
                    <div class="form-group">
                        <label for="fineObservations">💬 Observações</label>
                        <textarea id="fineObservations" rows="3" ${withinTolerance ? 'disabled' : ''} placeholder="Adicione detalhes relevantes (opcional)" style="resize: vertical;"></textarea>
                    </div>
                </form>
                
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                        Cancelar
                    </button>
                    <button class="btn btn-primary" onclick="UI.submitFine('${spotId}')" 
                            ${withinTolerance ? 'disabled' : ''}>
                        Emitir Coima
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Get GPS immediately
        window.currentGPS = null;
        this.refreshGPS();

        // Photo preview handler
        document.getElementById('finePhotos').addEventListener('change', this.handlePhotoPreview);
    },

    /**
     * Refresh GPS location
     */
    async refreshGPS() {
        const gpsInfo = document.getElementById('gpsInfo');
        gpsInfo.textContent = 'A obter localização...';

        try {
            const position = await API.getCurrentPosition();
            window.currentGPS = position;
            gpsInfo.innerHTML = `
                Lat: ${position.lat.toFixed(6)}, Lng: ${position.lng.toFixed(6)}<br>
                Precisão: ${Math.round(position.accuracy)}m
            `;
        } catch (error) {
            gpsInfo.textContent = 'Erro ao obter GPS: ' + error.message;
            window.currentGPS = null;
        }
    },

    /**
     * Handle photo preview
     */
    handlePhotoPreview(event) {
        const files = Array.from(event.target.files).slice(0, 3);
        const container = document.getElementById('photoPreview');
        container.innerHTML = '';

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.className = 'photo-preview';
                img.alt = file.name;
                container.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    },

    /**
     * Submit fine
     */
    async submitFine(spotId) {
        const form = document.getElementById('fineForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const plate = document.getElementById('finePlate').value;
        const photosInput = document.getElementById('finePhotos');
        const observations = document.getElementById('fineObservations').value;
        const fiscal = JSON.parse(localStorage.getItem('fiscal'));

        if (!window.currentGPS) {
            UI.showToast('GPS não disponível. Obtenha a localização primeiro.', 'error');
            return;
        }

        if (!photosInput.files.length) {
            UI.showToast('Adicione pelo menos uma fotografia', 'error');
            return;
        }

        try {
            // Convert photos to base64
            const photos = [];
            const files = Array.from(photosInput.files).slice(0, 3);
            for (const file of files) {
                const dataUrl = await API.fileToDataUrl(file);
                photos.push({ name: file.name, dataUrl });
            }

            // Create fine object
            const fine = {
                fineId: API.generateId(),
                spotId,
                plate: plate.toUpperCase(),
                fiscalId: fiscal.id,
                fiscalNome: fiscal.nome,
                timestamp: new Date().toISOString(),
                gps: window.currentGPS,
                photos,
                observations,
                status: 'Emitida',
                history: []
            };

            // Save fine (async)
            const spot = window.appState.spots[spotId];
            fine.rua = spot?.rua || `Lugar ${spotId}`;

            await API.saveFine(fine);

            // Remove irregularity
            delete window.appState.irregularities[spotId];

            // Close modal
            document.querySelector('.modal-overlay').remove();

            // Show success
            UI.showToast('Coima emitida com sucesso', 'success');

            // Navigate to Coimas tab
            window.appRouter.navigateToTab('coimas');

        } catch (error) {
            UI.showToast('Erro ao emitir coima: ' + error.message, 'error');
        }
    },

    /**
     * Render Coimas Tab
     */
    async renderCoimasTab() {
        const content = document.getElementById('mainContent');
        const fiscal = JSON.parse(localStorage.getItem('fiscal'));

        // Load fines from backend
        const fines = await API.getFines(fiscal.id);

        if (fines.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <div class="empty-state-text">Sem coimas registadas</div>
                    <p style="color: var(--color-grey); margin-top: var(--spacing-sm); font-size: var(--font-size-sm);">As coimas emitidas aparecerão aqui</p>
                </div>
            `;
            return;
        }

        // Sort by newest first
        fines.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        let html = '<div class="list-container">';

        fines.forEach(fine => {
            const statusColors = {
                'Emitida': 'badge-danger',
                'Notificada': 'badge-warning',
                'Paga': 'badge-success',
                'Em Recurso': 'badge-warning',
                'Anulada': 'badge-secondary'
            };

            html += `
                <div class="card" onclick="UI.showFineDetail('${fine.fineId}')">
                    <div class="card-header">
                        <div>
                            <div class="card-title">${fine.plate}</div>
                            <div class="card-subtitle">${fine.spotId} - ${new Date(fine.timestamp).toLocaleString('pt-PT')}</div>
                        </div>
                        <span class="badge ${statusColors[fine.status] || 'badge-secondary'}">${fine.status}</span>
                    </div>
                    
                    <div>
                        <strong>Fiscal:</strong> ${fine.fiscalNome}<br>
                        <strong>ID Coima:</strong> ${fine.fineId}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        content.innerHTML = html;
    },

    /**
     * Show fine detail modal
     */
    async showFineDetail(fineId) {
        const fiscal = JSON.parse(localStorage.getItem('fiscal'));
        const fines = await API.getFines(fiscal.id);
        const fine = fines.find(f => f.fineId === fineId);

        if (!fine) return;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h2 class="modal-title">Detalhes da Coima</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <p><strong>ID:</strong> ${fine.fineId}</p>
                    <p><strong>Matrícula:</strong> ${fine.plate}</p>
                    <p><strong>Lugar:</strong> ${fine.spotId}</p>
                    <p><strong>Data/Hora:</strong> ${new Date(fine.timestamp).toLocaleString('pt-PT')}</p>
                    <p><strong>Fiscal:</strong> ${fine.fiscalNome} (${fine.fiscalId})</p>
                    <p><strong>GPS:</strong> ${fine.gps.lat.toFixed(6)}, ${fine.gps.lng.toFixed(6)}</p>
                    <p><strong>Status:</strong> ${fine.status}</p>
                    ${fine.observations ? `<p><strong>Observações:</strong> ${fine.observations}</p>` : ''}
                    
                    <p><strong>Fotografias:</strong></p>
                    <div class="photo-preview-container">
                        ${fine.photos.map(p => `<img src="${p.dataUrl}" alt="${p.name}" class="photo-preview">`).join('')}
                    </div>
                    
                    ${fine.history && fine.history.length > 0 ? `
                        <p><strong>Histórico:</strong></p>
                        <ul style="margin-left: var(--spacing-lg); font-size: var(--font-size-sm);">
                            ${fine.history.map(h => `
                                <li>${h.action} - ${new Date(h.timestamp).toLocaleString('pt-PT')}</li>
                            `).join('')}
                        </ul>
                    ` : ''}
                    
                    ${fine.status !== 'Anulada' && fine.status !== 'Paga' ? `
                        <div style="margin-top: var(--spacing-lg);">
                            <p><strong>Alterar Estado:</strong></p>
                            <div style="display: flex; gap: var(--spacing-sm); flex-wrap: wrap; margin-top: var(--spacing-sm);">
                                ${fine.status !== 'Notificada' ? `<button class="btn btn-secondary btn-sm" onclick="UI.updateFineStatus('${fineId}', 'Notificada')">Marcar Notificada</button>` : ''}
                                ${fine.status !== 'Paga' ? `<button class="btn btn-secondary btn-sm" onclick="UI.updateFineStatus('${fineId}', 'Paga')">Marcar Paga</button>` : ''}
                                ${fine.status !== 'Em Recurso' ? `<button class="btn btn-secondary btn-sm" onclick="UI.updateFineStatus('${fineId}', 'Em Recurso')">Marcar Em Recurso</button>` : ''}
                                <button class="btn btn-danger btn-sm" onclick="UI.updateFineStatus('${fineId}', 'Anulada')">Anular</button>
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
    },

    /**
     * Update fine status
     */
    async updateFineStatus(fineId, newStatus) {
        try {
            await API.updateFine(fineId, { status: newStatus });
            UI.showToast(`Status alterado para "${newStatus}"`, 'success');

            // Close modal and refresh
            document.querySelector('.modal-overlay').remove();
            UI.renderCoimasTab();
        } catch (error) {
            UI.showToast('Erro ao atualizar status: ' + error.message, 'error');
        }
    },

    /**
     * Render Perfil Tab
     */
    renderPerfilTab() {
        const content = document.getElementById('mainContent');
        const fiscal = JSON.parse(localStorage.getItem('fiscal'));

        content.innerHTML = `
            <div class="profile-container">
                <div class="profile-avatar">
                    ${fiscal.nome.charAt(0).toUpperCase()}
                </div>
                
                <div class="profile-name">${fiscal.nome}</div>
                <div class="profile-id">ID: ${fiscal.id}</div>
                
                <button class="btn btn-danger" onclick="UI.logout()">
                    Terminar Sessão
                </button>
            </div>
        `;
    },

    /**
     * Logout
     */
    logout() {
        if (confirm('Tem a certeza que deseja terminar a sessão?')) {
            localStorage.removeItem('fiscal');
            window.location.reload();
        }
    }
};
