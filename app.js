// app.js - Motor principal do Jogo Político

const state = {
    date: new Date(2023, 0, 1), // Começa em 1 de Janeiro
    party: {
        name: "",
        sigla: "",
        ideology: "",
        color: "",
        money: 500000, // Caixa inicial de meio milhão
        members: 150,
        nationalApproval: 5 // Aprovação nacional em %
    },
    cityInfluence: {}, // Salva a popularidade do partido por município { '1100015': 12.5 }
    selectedCityCd: null,
    mapInstance: null,
    geoJsonLayer: null
};

const UI = {
    screens: {
        creation: document.getElementById('creation-screen'),
        game: document.getElementById('game-screen')
    },
    updateTopBar() {
        document.getElementById('ui-party-name').innerText = state.party.sigla;
        document.getElementById('ui-party-color').style.backgroundColor = state.party.color;
        
        // Formatar Moeda
        const moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(state.party.money);
        document.getElementById('ui-money').innerText = moneyFmt;
        
        document.getElementById('ui-members').innerText = state.party.members.toLocaleString('pt-BR');
        document.getElementById('ui-approval').innerText = state.party.nationalApproval.toFixed(1) + '%';
        
        // Formatar Data
        const options = { day: '2-digit', month: 'short', year: 'numeric' };
        document.getElementById('ui-date').innerText = state.date.toLocaleDateString('pt-BR', options);
    },
    showEventModal(title, description, optionsHtml) {
        document.getElementById('event-title').innerHTML = title;
        document.getElementById('event-desc').innerText = description;
        document.getElementById('event-options').innerHTML = optionsHtml;
        document.getElementById('event-modal').classList.remove('hidden');
    },
    closeModal() {
        document.getElementById('event-modal').classList.add('hidden');
    }
};

const gameEngine = {
    async start() {
        // Coleta dados do form
        state.party.name = document.getElementById('party-name').value || "Partido Independente";
        state.party.sigla = document.getElementById('party-sigla').value || "PIN";
        state.party.ideology = document.getElementById('party-ideology').value;
        state.party.color = document.getElementById('party-color').value;

        // Troca de tela
        UI.screens.creation.classList.remove('active');
        UI.screens.game.classList.add('active');

        // Inicializa dependências
        await GameData.init();
        UI.updateTopBar();
        this.initMap();
    },

    initMap() {
        // Centralizado no Brasil
        state.mapInstance = L.map('map', { zoomControl: false }).setView([-14.235, -51.925], 4);
        
        // Camada base escura para combinar com o tema
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(state.mapInstance);

        // Adiciona controles de zoom no canto inferior direito
        L.control.zoom({ position: 'bottomright' }).addTo(state.mapInstance);

        this.renderGeoJSON();
    },

    renderGeoJSON() {
        if(state.geoJsonLayer) {
            state.mapInstance.removeLayer(state.geoJsonLayer);
        }

        state.geoJsonLayer = L.geoJSON(GameData.geoJSON, {
            style: this.getMapStyle,
            onEachFeature: this.onEachCity
        }).addTo(state.mapInstance);
    },

    getMapStyle(feature) {
        const cdMun = feature.properties.CD_MUN;
        const influence = state.cityInfluence[cdMun] || 0;
        
        // Pinta a cidade com a cor do partido se a influência for > 0, 
        // a opacidade depende da força da influência.
        return {
            fillColor: influence > 0 ? state.party.color : '#334155',
            weight: 1,
            opacity: 1,
            color: '#1e293b', // Borda
            fillOpacity: influence > 0 ? 0.2 + (influence / 100) : 0.4
        };
    },

    onEachCity(feature, layer) {
        layer.on({
            mouseover: (e) => {
                const layer = e.target;
                layer.setStyle({ weight: 3, color: '#f8fafc' });
                layer.bringToFront();
            },
            mouseout: (e) => {
                state.geoJsonLayer.resetStyle(e.target);
            },
            click: (e) => {
                const cdMun = feature.properties.CD_MUN;
                gameEngine.selectCity(cdMun, feature.properties.NM_MUN);
                state.mapInstance.fitBounds(e.target.getBounds());
            }
        });
    },

    selectCity(cdMun, fallbackName) {
        state.selectedCityCd = cdMun;
        const data = GameData.getCityData(cdMun);
        
        document.getElementById('no-city-selected').classList.add('hidden');
        const infoPanel = document.getElementById('city-info');
        infoPanel.classList.remove('hidden');

        document.getElementById('city-name').innerText = data ? data.nome : fallbackName;
        document.getElementById('city-uf').innerText = data ? data.uf : "BR";

        if(data) {
            // Atualiza UI com dados do CSV
            document.getElementById('data-pop').innerText = data.popTotal.toLocaleString();
            document.getElementById('data-ur').innerText = `${data.popUrbana.toLocaleString()} / ${data.popRural.toLocaleString()}`;
            document.getElementById('data-renda').innerText = `R$ ${data.renda}`;
            document.getElementById('data-bolsa').innerText = data.bolsaFamilia.toLocaleString();
            document.getElementById('data-analfabetismo').innerText = `${data.analfabetismo}%`;
            document.getElementById('data-esgoto').innerText = `${data.esgoto}%`;
            document.getElementById('data-soja').innerText = data.soja.toLocaleString();
            document.getElementById('data-gado').innerText = data.bovinos.toLocaleString();
        }

        // Atualiza Influência
        const influence = state.cityInfluence[cdMun] || 0;
        document.getElementById('city-influence-bar').style.width = `${influence}%`;
        document.getElementById('city-influence-bar').style.backgroundColor = state.party.color;
        document.getElementById('city-influence-text').innerText = `${influence.toFixed(1)}% de apoio local`;
    },

    // --- AÇÕES DO JOGADOR ---

    advanceTurn() {
        // Avança 7 dias
        state.date.setDate(state.date.getDate() + 7);
        
        // Custos semanais
        const partyMaintenance = state.party.members * 10; 
        state.party.money -= partyMaintenance;

        // Variação orgânica de aprovação
        if (state.party.nationalApproval > 1) {
            state.party.nationalApproval += (Math.random() - 0.5) * 0.5; 
        }

        UI.updateTopBar();
        this.renderGeoJSON(); // Atualiza o mapa caso influências tenham mudado

        // Game Over Check
        if(state.party.money < 0) {
            UI.showEventModal("<i class='fas fa-skull'></i> Falência Política", "Seu partido não conseguiu arcar com as despesas e foi extinto pela Justiça Eleitoral.", "<button class='btn-danger' onclick='location.reload()'>Recomeçar</button>");
            return;
        }

        // Random Events (10% de chance por turno)
        if(Math.random() < 0.1) this.triggerRandomEvent();
    },

    investInCity() {
        if(!state.selectedCityCd) return;
        const cost = 50000;
        
        if(state.party.money < cost) {
            alert("Fundos insuficientes! Requer R$ 50.000.");
            return;
        }

        const cityData = GameData.getCityData(state.selectedCityCd);
        if(!cityData) {
            alert("Sem dados suficientes para operar nesta cidade ainda.");
            return;
        }

        state.party.money -= cost;
        
        // O efeito depende da realidade da cidade. 
        // Exemplo: Investimento em cidade pobre (Renda < 500) gera mais aprovação se for partido de esquerda.
        let boost = 2.0 + (Math.random() * 3.0); 

        // Lógica Socioeconômica Complexa (exemplo)
        if(state.party.ideology === 'esquerda' && cityData.renda < 500) boost *= 1.5;
        if(state.party.ideology === 'direita' && cityData.soja > 1000) boost *= 1.5; // Apelo ao Agronegócio

        if(!state.cityInfluence[state.selectedCityCd]) state.cityInfluence[state.selectedCityCd] = 0;
        state.cityInfluence[state.selectedCityCd] += boost;
        
        if(state.cityInfluence[state.selectedCityCd] > 100) state.cityInfluence[state.selectedCityCd] = 100;

        UI.updateTopBar();
        this.selectCity(state.selectedCityCd, document.getElementById('city-name').innerText);
        this.renderGeoJSON();
    },

    triggerRally() {
        const cost = 25000;
        if(state.party.money >= cost) {
            state.party.money -= cost;
            state.party.nationalApproval += 0.5;
            UI.updateTopBar();
        } else {
            alert("Fundos insuficientes para comício.");
        }
    },

    fundraise() {
        // Arrecadação baseada na aprovação e membros
        const gained = (state.party.members * 50) + (state.party.nationalApproval * 1000);
        state.party.money += gained;
        UI.updateTopBar();
    },

    recruit() {
        const cost = 10000;
        if(state.party.money >= cost) {
            state.party.money -= cost;
            const newMembers = Math.floor(Math.random() * 50) + (state.party.nationalApproval * 2);
            state.party.members += parseInt(newMembers);
            UI.updateTopBar();
        }
    },

    // --- SISTEMA DE EVENTOS ---
    triggerRandomEvent() {
        const events =[
            {
                title: "<i class='fas fa-microphone-lines'></i> Entrevista Polêmica",
                desc: "O presidente do partido deu uma declaração polêmica na TV aberta.",
                options: `
                    <button class='btn-primary full-width' onclick='gameEngine.resolveEvent(0, 10000, -2)'>Pedir Desculpas (-2% Aprovação, Custa R$10k)</button>
                    <button class='btn-secondary full-width' onclick='gameEngine.resolveEvent(0, 0, 3)'>Dobrar a aposta (+3% Aprovação em nichos, mas alto risco)</button>
                `
            },
            {
                title: "<i class='fas fa-handshake'></i> Proposta de Doação",
                desc: "Um grande empresário do agronegócio quer fazer uma doação generosa para a campanha.",
                options: `
                    <button class='btn-primary full-width' onclick='gameEngine.resolveEvent(200000, 0, -1)'>Aceitar R$ 200.000 (Risco à imagem: -1% Apr.)</button>
                    <button class='btn-secondary full-width' onclick='gameEngine.resolveEvent(0, 0, +1)'>Recusar (+1% Aprovação por ética)</button>
                `
            }
        ];

        const ev = events[Math.floor(Math.random() * events.length)];
        UI.showEventModal(ev.title, ev.desc, ev.options);
    },

    resolveEvent(moneyChange, approvalChange, arg3) {
        state.party.money += moneyChange;
        state.party.nationalApproval += approvalChange;
        UI.updateTopBar();
        UI.closeModal();
    }
};

// Listeners
document.getElementById('btn-start-game').addEventListener('click', () => gameEngine.start());
document.getElementById('btn-next-turn').addEventListener('click', () => gameEngine.advanceTurn());
