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

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h2 class="modal-title">Emitir Coima</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <form id="fineForm" class="modal-body">
                    
                    <div class="form-group">
                        <label for="finePlate">🚗 Matrícula *</label>
                        <input type="text" id="finePlate" required maxlength="8"
                               placeholder="AA-00-BB" style="text-transform: uppercase;">
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
                        <label for="finePhotos">📷 Fotos (1-3) *</label>
                        <input type="file" id="finePhotos" accept="image/*" capture="environment" 
                               multiple max="3" required>
                        <div id="photoPreview" class="photo-preview-container"></div>
                    </div>
                    
                    <div class="form-group">
                        <label for="fineObservations">💬 Observações</label>
                        <textarea id="fineObservations" rows="3" placeholder="Adicione detalhes relevantes (opcional)" style="resize: vertical;"></textarea>
                    </div>
                </form>
                
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                        Cancelar
                    </button>
                    <button class="btn btn-primary" onclick="UI.submitFine('${spotId}')">
                        Emitir Coima
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Auto-format license plate
        const plateInput = document.getElementById('finePlate');
        plateInput.addEventListener('input', this.formatPlate);

        // Photo preview handler
        document.getElementById('finePhotos').addEventListener('change', this.handlePhotoPreview);
    },

    /**
     * Auto-format license plate with hyphens
     */
    formatPlate(event) {
        let value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

        // Add hyphens automatically: AA-00-BB or 00-AA-00, etc.
        if (value.length > 2) {
            value = value.slice(0, 2) + '-' + value.slice(2);
        }
        if (value.length > 5) {
            value = value.slice(0, 5) + '-' + value.slice(5);
        }

        // Limit to 8 characters (6 + 2 hyphens)
        event.target.value = value.slice(0, 8);
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

        const statusColors = {
            'Emitida': '#dc2626',
            'Notificada': '#f59e0b',
            'Paga': '#10b981',
            'Em Recurso': '#f59e0b',
            'Anulada': '#6b7280'
        };

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal" style="max-width: 700px;">
                <div class="modal-header" style="background: linear-gradient(135deg, var(--gradient-primary)); color: white;">
                    <div>
                        <h2 class="modal-title" style="margin: 0; font-size: 1.5rem;">🚗 ${fine.plate}</h2>
                        <div style="opacity: 0.9; font-size: 0.9rem; margin-top: 4px;">Coima #${fine.fineId.slice(-8)}</div>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" style="color: white;">×</button>
                </div>
                
                <div class="modal-body" style="padding: 0;">
                    
                    <!-- Status Badge -->
                    <div style="padding: var(--spacing-lg); background: ${statusColors[fine.status]}15; border-bottom: 2px solid ${statusColors[fine.status]};">
                        <div style="display: flex; align-items: center; justify-content: center; gap: var(--spacing-sm);">
                            <div style="width: 12px; height: 12px; background: ${statusColors[fine.status]}; border-radius: 50%;"></div>
                            <strong style="color: ${statusColors[fine.status]}; font-size: 1.1rem;">${fine.status}</strong>
                        </div>
                    </div>

                    <!-- Informações Principais -->
                    <div style="padding: var(--spacing-lg); display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-md);">
                        <div>
                            <div style="color: var(--color-grey); font-size: var(--font-size-sm); margin-bottom: 4px;">📍 Lugar</div>
                            <div style="font-weight: 600; color: var(--color-grey-dark);">${fine.spotId}</div>
                            <div style="font-size: var(--font-size-sm); color: var(--color-grey); margin-top: 2px;">${fine.rua || 'Localização não especificada'}</div>
                        </div>
                        
                        <div>
                            <div style="color: var(--color-grey); font-size: var(--font-size-sm); margin-bottom: 4px;">🕐 Data/Hora</div>
                            <div style="font-weight: 600; color: var(--color-grey-dark);">${new Date(fine.timestamp).toLocaleDateString('pt-PT')}</div>
                            <div style="font-size: var(--font-size-sm); color: var(--color-grey); margin-top: 2px;">${new Date(fine.timestamp).toLocaleTimeString('pt-PT')}</div>
                        </div>
                        
                        <div>
                            <div style="color: var(--color-grey); font-size: var(--font-size-sm); margin-bottom: 4px;">👤 Fiscal</div>
                            <div style="font-weight: 600; color: var(--color-grey-dark);">${fine.fiscalNome}</div>
                            <div style="font-size: var(--font-size-sm); color: var(--color-grey); margin-top: 2px;">ID: ${fine.fiscalId}</div>
                        </div>
                        
                        <div>
                            <div style="color: var(--color-grey); font-size: var(--font-size-sm); margin-bottom: 4px;">💰 Valor</div>
                            <div style="font-weight: 600; color: var(--color-primary); font-size: 1.25rem;">50,00 €</div>
                        </div>
                    </div>

                    ${fine.gps && fine.gps.lat ? `
                        <div style="padding: 0 var(--spacing-lg) var(--spacing-md);">
                            <div style="background: var(--color-grey-light); padding: var(--spacing-sm); border-radius: var(--border-radius-sm); font-size: var(--font-size-sm);">
                                <strong>📍 GPS:</strong> ${fine.gps.lat.toFixed(6)}, ${fine.gps.lng.toFixed(6)}
                            </div>
                        </div>
                    ` : ''}

                    ${fine.observations ? `
                        <div style="padding: 0 var(--spacing-lg) var(--spacing-md);">
                            <div style="color: var(--color-grey); font-size: var(--font-size-sm); margin-bottom: 4px;">💬 Observações</div>
                            <div style="background: var(--color-grey-light); padding: var(--spacing-md); border-radius: var(--border-radius-sm); line-height: 1.5;">
                                ${fine.observations}
                            </div>
                        </div>
                    ` : ''}
                    
                    <!-- Fotografias -->
                    ${fine.photos && fine.photos.length > 0 ? `
                        <div style="padding: var(--spacing-lg); background: var(--color-grey-light); border-top: 1px solid var(--color-grey);">
                            <div style="color: var(--color-grey-dark); font-weight: 600; margin-bottom: var(--spacing-md); display: flex; align-items: center; gap: var(--spacing-xs);">
                                <span style="font-size: 1.25rem;">📷</span>
                                Fotografias (${fine.photos.length})
                            </div>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--spacing-md);">
                                ${fine.photos.map((photo, idx) => `
                                    <div onclick="UI.showPhotoFullscreen('${photo.dataUrl || photo}', ${idx})" 
                                         style="cursor: pointer; position: relative; border-radius: var(--border-radius-md); overflow: hidden; aspect-ratio: 4/3; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s, box-shadow 0.2s;"
                                         onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 4px 16px rgba(0,0,0,0.2)';"
                                         onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)';">
                                        <img src="${photo.dataUrl || photo}" 
                                             alt="Foto ${idx + 1}" 
                                             style="width: 100%; height: 100%; object-fit: cover;">
                                        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.6)); padding: var(--spacing-sm); color: white; font-size: var(--font-size-sm); text-align: center;">
                                            Foto ${idx + 1}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${fine.history && fine.history.length > 0 ? `
                        <div style="padding: var(--spacing-lg); border-top: 1px solid var(--color-grey);">
                            <div style="color: var(--color-grey-dark); font-weight: 600; margin-bottom: var(--spacing-md);">📋 Histórico</div>
                            <div style="display: flex; flex-direction: column; gap: var(--spacing-sm);">
                                ${fine.history.map(h => `
                                    <div style="display: flex; align-items: start; gap: var(--spacing-sm); padding: var(--spacing-sm); background: var(--color-grey-light); border-radius: var(--border-radius-sm); font-size: var(--font-size-sm);">
                                        <div style="min-width: 8px; height: 8px; background: var(--color-primary); border-radius: 50%; margin-top: 6px;"></div>
                                        <div style="flex: 1;">
                                            <div style="font-weight: 600; color: var(--color-grey-dark);">${h.action}</div>
                                            <div style="color: var(--color-grey); margin-top: 2px;">${new Date(h.timestamp).toLocaleString('pt-PT')}</div>
                                        </div>
                                    </div>
                                `).join('')}
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
     * Show photo in fullscreen viewer
     */
    showPhotoFullscreen(photoUrl, index) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.background = 'rgba(0, 0, 0, 0.95)';
        overlay.innerHTML = `
            <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: var(--spacing-lg);">
                <button onclick="this.closest('.modal-overlay').remove()" 
                        style="position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.2); border: none; color: white; font-size: 2rem; width: 50px; height: 50px; border-radius: 50%; cursor: pointer; backdrop-filter: blur(10px); transition: background 0.2s;"
                        onmouseover="this.style.background='rgba(255,255,255,0.3)'"
                        onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                    ×
                </button>
                <img src="${photoUrl}" 
                     alt="Foto ${index + 1}" 
                     style="max-width: 90%; max-height: 90%; border-radius: var(--border-radius-lg); box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
                <div style="position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: white; padding: var(--spacing-sm) var(--spacing-md); border-radius: var(--border-radius-lg); backdrop-filter: blur(10px);">
                    Foto ${index + 1}
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Close on click outside
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.tagName === 'DIV') {
                overlay.remove();
            }
        });
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
