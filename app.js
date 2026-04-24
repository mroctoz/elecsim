/**
 * E-Sim Brasil - Core Engine
 * Arquitetura baseada nas especificações de simulação política hiper-realista.
 */

// --- DADOS ESTÁTICOS BASE ---
const PARTIES_DB =[
    { id: 'pt', sigla: 'PT', nome: 'Partido dos Trabalhadores', espectro: 'Esquerda', color: '#dc2626' }, // Red
    { id: 'pl', sigla: 'PL', nome: 'Partido Liberal', espectro: 'Direita', color: '#1d4ed8' }, // Blue
    { id: 'mdb', sigla: 'MDB', nome: 'Movimento Democrático Brasileiro', espectro: 'Centro', color: '#16a34a' }, // Green
    { id: 'psdb', sigla: 'PSDB', nome: 'Partido da Social Democracia', espectro: 'Centro-Direita', color: '#0ea5e9' }, // Light Blue
    { id: 'psol', sigla: 'PSOL', nome: 'Partido Socialismo e Liberdade', espectro: 'Extrema-Esquerda', color: '#fbbf24' }, // Yellow/Orange
    { id: 'uniao', sigla: 'UNIÃO', nome: 'União Brasil', espectro: 'Centro-Direita', color: '#0284c7' }
];

const EVENTS_DB =[
    { id: 'operacao_pf', name: 'Operação da Polícia Federal', effect: 'Vaza áudio de corrupção. Aprovação cai 10%.', impactApproval: -10, impactBudget: 0 },
    { id: 'crise_global', name: 'Crise Econômica Global', effect: 'Inflação afeta a economia. Orçamento apertado.', impactApproval: -15, impactBudget: -500000000 },
    { id: 'boom_commodities', name: 'Superciclo das Commodities', effect: 'Arrecadação recorde de impostos de exportação.', impactApproval: +5, impactBudget: +800000000 }
];

// --- CLASSES PRINCIPAIS ---

class GameState {
    constructor() {
        this.date = new Date(2026, 0, 1); // 1 Jan 2026
        this.budget = 1500000000000; // 1.5 Trilhão
        this.approval = 45.0; // 45%
        this.parties = JSON.parse(JSON.stringify(PARTIES_DB));
        this.deputies = [];
        this.lawsInQueue =[];
        this.turn = 1;
    }

    // Exportação em Base64 para Save Local/Cloud
    exportSave() {
        const json = JSON.stringify(this);
        return btoa(unescape(encodeURIComponent(json)));
    }

    importSave(base64Str) {
        try {
            const json = decodeURIComponent(escape(atob(base64Str)));
            const data = JSON.parse(json);
            Object.assign(this, data);
            this.date = new Date(this.date); // Restore Date object
            return true;
        } catch (e) {
            console.error("Save corrompido", e);
            return false;
        }
    }
}

class UIManager {
    constructor() {
        this.formatCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' });
    }

    updateTopBar(state) {
        document.getElementById('ui-date').textContent = state.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
        document.getElementById('ui-budget').textContent = this.formatCurrency.format(state.budget);
        
        const approvalEl = document.getElementById('ui-approval');
        approvalEl.textContent = state.approval.toFixed(1) + '%';
        approvalEl.className = `font-mono text-sm font-medium ${state.approval >= 50 ? 'text-green-400' : 'text-red-400'}`;
    }

    switchView(viewId) {
        // Handle Sidebar active state
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        event.currentTarget.classList.add('active');

        // Handle Panels
        document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));
        document.getElementById(`view-${viewId}`).classList.add('active');

        // Se mudou pro mapa, redesenhar para evitar bugs de tiles do Leaflet no display:none
        if(viewId === 'map') {
            setTimeout(() => mapSystem.map.invalidateSize(), 100);
        }
    }

    showEventModal(eventData) {
        document.getElementById('event-title').textContent = eventData.name;
        document.getElementById('event-desc').textContent = eventData.effect;
        document.getElementById('modal-event').classList.remove('hidden');
    }

    hideEventModal() {
        document.getElementById('modal-event').classList.add('hidden');
    }
}

class MapSystem {
    constructor() {
        this.map = L.map('leaflet-map', { zoomControl: false }).setView([-14.2350, -51.9253], 4);
        this.geojsonLayer = null;
        this.statesData = null;
        this.currentLayerMode = 'political';

        // Estilos de mapa escuro (Tiles do CartoDB Dark)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors & CartoDB',
            subdomains: 'abcd',
            maxZoom: 10
        }).addTo(this.map);

        this.initGeoJSON();
    }

    async initGeoJSON() {
        try {
            // Buscando malha de estados do Brasil open source
            const response = await fetch('https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson');
            this.statesData = await response.json();
            
            // Injetar dados simulados em cada estado
            this.statesData.features.forEach(f => {
                const randomParty = PARTIES_DB[Math.floor(Math.random() * PARTIES_DB.length)];
                f.properties.party = randomParty;
                f.properties.idh = (0.6 + Math.random() * 0.25).toFixed(3); // 0.600 a 0.850
                f.properties.approval = Math.floor(Math.random() * 100);
            });

            this.renderLayer();
        } catch(e) {
            console.error("Erro ao carregar mapa do IBGE:", e);
        }
    }

    getColor(feature) {
        if(this.currentLayerMode === 'political') return feature.properties.party.color;
        if(this.currentLayerMode === 'idh') {
            const idh = parseFloat(feature.properties.idh);
            return idh > 0.8 ? '#16a34a' : idh > 0.7 ? '#facc15' : '#dc2626';
        }
        if(this.currentLayerMode === 'approval') {
            const a = feature.properties.approval;
            return a > 60 ? '#3b82f6' : a > 40 ? '#94a3b8' : '#ef4444';
        }
        return '#334155';
    }

    renderLayer() {
        if(this.geojsonLayer) this.map.removeLayer(this.geojsonLayer);

        this.geojsonLayer = L.geoJSON(this.statesData, {
            style: (feature) => ({
                fillColor: this.getColor(feature),
                weight: 1,
                opacity: 1,
                color: '#1e293b',
                fillOpacity: 0.7
            }),
            onEachFeature: (feature, layer) => {
                const p = feature.properties;
                layer.bindPopup(`
                    <div class="text-sm">
                        <strong class="text-base">${p.name} (${p.sigla})</strong><br/>
                        <hr class="border-gov-600 my-1"/>
                        <span class="text-slate-400">Governador:</span> <span style="color:${p.party.color}" class="font-bold">${p.party.sigla}</span><br/>
                        <span class="text-slate-400">IDH:</span> ${p.idh}<br/>
                        <span class="text-slate-400">Aprovação:</span> ${p.approval}%
                    </div>
                `);
                layer.on({
                    mouseover: (e) => {
                        const l = e.target;
                        l.setStyle({ weight: 2, color: '#10b981', fillOpacity: 0.9 });
                    },
                    mouseout: (e) => {
                        this.geojsonLayer.resetStyle(e.target);
                    }
                });
            }
        }).addTo(this.map);
    }

    changeLayer(mode) {
        this.currentLayerMode = mode;
        this.renderLayer();
    }
}

class ParliamentSystem {
    constructor(gameState) {
        this.state = gameState;
        this.generateDeputies();
        this.renderHemiciclo();
    }

    // Gera 513 deputados fictícios distribuídos nos partidos
    generateDeputies() {
        if(this.state.deputies.length > 0) return; // Se já foi carregado via save

        const firstNames =["Carlos", "João", "Maria", "Ana", "Marcos", "Eduardo", "Fernanda", "Sônia", "Roberto", "Luís", "Jair", "Ciro", "Guilherme", "Marina"];
        const lastNames =["Silva", "Gomes", "Bolsonaro", "Lula", "Rousseff", "Neves", "Maia", "Lira", "Pacheco", "Alckmin", "Tebet", "Moro"];

        for(let i=0; i<513; i++) {
            // Distribuição de partidos enviesada (Centrão/MDB/PL/PT tem mais)
            const partyWeights =['pt','pt','pl','pl','mdb','mdb','mdb','psdb','uniao','uniao','psol'];
            const randPId = partyWeights[Math.floor(Math.random() * partyWeights.length)];
            const party = this.state.parties.find(p => p.id === randPId) || this.state.parties[0];

            this.state.deputies.push({
                id: i,
                name: `${firstNames[Math.floor(Math.random()*firstNames.length)]} ${lastNames[Math.floor(Math.random()*lastNames.length)]}`,
                party: party,
                ideology: party.espectro,
                integrity: Math.floor(Math.random() * 100),
                oratory: Math.floor(Math.random() * 100)
            });
        }

        // Ordenar os deputados por espectro político para o hemiciclo ficar com as cores agrupadas (Esquerda -> Direita)
        const specOrder = {"Extrema-Esquerda":1, "Esquerda":2, "Centro-Esquerda":3, "Centro":4, "Centro-Direita":5, "Direita":6, "Extrema-Direita":7};
        this.state.deputies.sort((a,b) => specOrder[a.ideology] - specOrder[b.ideology]);
    }

    renderHemiciclo() {
        const container = document.getElementById("hemiciclo-container");
        container.innerHTML = ""; // Clear

        const width = 600;
        const height = 300;
        const svg = d3.select("#hemiciclo-container").append("svg")
            .attr("width", width)
            .attr("height", height)
            .style("overflow", "visible");

        const totalDots = this.state.deputies.length;
        const rows = 9;
        const radiusMin = 80;
        const radiusMax = 280;
        const radStep = (radiusMax - radiusMin) / rows;

        let dotIndex = 0;
        
        // Distribuição de assentos por linha (forma de semi-círculo)
        const dotsPerRow =[];
        let totalAssigned = 0;
        for (let i = 0; i < rows; i++) {
            if (i === rows - 1) {
                dotsPerRow.push(totalDots - totalAssigned);
            } else {
                let amount = Math.floor(totalDots * (i + 1) / ((rows * (rows + 1)) / 2));
                dotsPerRow.push(amount);
                totalAssigned += amount;
            }
        }

        for (let r = 0; r < rows; r++) {
            const currentRadius = radiusMin + (r * radStep);
            const spots = dotsPerRow[r];
            const angleStep = Math.PI / (spots - 1 || 1);

            for (let s = 0; s < spots; s++) {
                if (dotIndex >= totalDots) break;
                
                const angle = Math.PI - (s * angleStep); // Da esquerda para direita (180 a 0)
                const cx = width / 2 + currentRadius * Math.cos(angle);
                const cy = height - 20 - currentRadius * Math.sin(angle); // origin at bottom center

                const dep = this.state.deputies[dotIndex];

                svg.append("circle")
                    .attr("cx", cx)
                    .attr("cy", cy)
                    .attr("r", 4.5)
                    .attr("fill", dep.party.color)
                    .attr("class", "deputy-dot")
                    .on("mouseover", (event) => this.showTooltip(event, dep))
                    .on("mouseout", () => this.hideTooltip());

                dotIndex++;
            }
        }
    }

    showTooltip(event, deputy) {
        const tt = document.getElementById('deputy-tooltip');
        tt.style.left = (event.pageX) + 'px';
        tt.style.top = (event.pageY) + 'px';
        
        document.getElementById('tt-name').textContent = deputy.name;
        document.getElementById('tt-party').textContent = deputy.party.sigla;
        document.getElementById('tt-party').style.backgroundColor = deputy.party.color;
        document.getElementById('tt-party').style.color = '#fff';
        document.getElementById('tt-ideology').textContent = deputy.ideology;
        document.getElementById('tt-integrity').textContent = deputy.integrity + '%';
        document.getElementById('tt-oratory').textContent = deputy.oratory + '%';
        
        tt.classList.remove('hidden');
    }

    hideTooltip() {
        document.getElementById('deputy-tooltip').classList.add('hidden');
    }

    openLawModal() {
        document.getElementById('modal-law').classList.remove('hidden');
    }

    closeLawModal() {
        document.getElementById('modal-law').classList.add('hidden');
    }

    submitLaw() {
        const type = document.getElementById('law-type').value;
        const title = document.getElementById('law-title').value;
        const align = document.getElementById('law-alignment').value;

        if(!title) return alert("Insira um título para a pauta.");

        const law = { id: Date.now(), type, title, align, status: 'Em Tramitação' };
        this.state.lawsInQueue.push(law);
        
        this.closeLawModal();
        this.updateVotingQueue();
    }

    updateVotingQueue() {
        const queueDiv = document.getElementById('voting-queue');
        if(this.state.lawsInQueue.length === 0) {
            queueDiv.innerHTML = '<p class="text-sm text-slate-400 italic text-center py-4">Nenhum projeto em pauta no momento.</p>';
            return;
        }

        queueDiv.innerHTML = this.state.lawsInQueue.map(law => `
            <div class="bg-gov-900 border border-gov-700 p-3 rounded flex justify-between items-center shadow-sm">
                <div>
                    <span class="text-xs font-bold text-gov-accent uppercase">${law.type}</span>
                    <h4 class="font-bold text-sm">${law.title}</h4>
                    <p class="text-[10px] text-slate-400">Alinhamento: ${law.align}</p>
                </div>
                <button onclick="parliamentSystem.voteLaw(${law.id})" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-bold transition-all"><i class="fa-solid fa-check-to-slot"></i> Pautar Votação</button>
            </div>
        `).join('');
    }

    voteLaw(lawId) {
        const law = this.state.lawsInQueue.find(l => l.id === lawId);
        
        // Simulação complexa de votação baseada em alinhamento
        let favor = 0, against = 0, abstain = 0;

        this.state.deputies.forEach(dep => {
            const rng = Math.random();
            let probabilityFavor = 0.5;

            // Lógica de IA política (Afinidade Ideológica)
            if (law.align === 'esquerda' && (dep.ideology.includes('Esquerda'))) probabilityFavor = 0.9;
            if (law.align === 'direita' && (dep.ideology.includes('Direita'))) probabilityFavor = 0.9;
            if (law.align === 'centro' && (dep.ideology.includes('Centro'))) probabilityFavor = 0.8;
            if (law.align === 'esquerda' && (dep.ideology.includes('Direita'))) probabilityFavor = 0.1;
            
            // Suborno/Articulação (Mecânica de Integridade)
            if (dep.integrity < 40) probabilityFavor += 0.2; // Centrão fisiológico aceita base mais fácil

            if (rng < probabilityFavor) favor++;
            else if (rng > 0.9) abstain++;
            else against++;
        });

        // Verificação de Quórum
        let requiredVotes = 257; // Maioria Simples
        if (law.type === 'pec') requiredVotes = 308; // 3/5 da Câmara

        const passed = favor >= requiredVotes;

        alert(`Votação Concluída: ${law.title}\n\nSim: ${favor}\nNão: ${against}\nAbstenções: ${abstain}\n\nResultado: ${passed ? 'APROVADA!' : 'REJEITADA.'}`);
        
        // Efeitos da Lei (Simplificado)
        if(passed) {
            if(law.align === 'esquerda') gameEngine.state.approval += 2;
            if(law.align === 'direita') gameEngine.state.budget += 100000000; // Corte de gastos liberais
        }

        // Remover da fila
        this.state.lawsInQueue = this.state.lawsInQueue.filter(l => l.id !== lawId);
        this.updateVotingQueue();
        uiManager.updateTopBar(this.state);
    }
}

class ModSystem {
    constructor(state) {
        this.state = state;
    }

    loadMod(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const modData = JSON.parse(e.target.result);
                
                // Aplicar Mod (Exemplo: Adicionando/Sobrescrevendo Partido)
                if(modData.sigla && modData.nome && modData.cor_hex) {
                    const newParty = {
                        id: modData.id,
                        sigla: modData.sigla,
                        nome: modData.nome,
                        espectro: modData.espectro || 'Centro',
                        color: modData.cor_hex
                    };
                    this.state.parties.push(newParty);
                    alert(`Mod Carregado com Sucesso!\nNovo Partido Adicionado: ${newParty.sigla}`);
                    
                    // Recalcular ou forçar refresh do parlamento se quiser
                } else {
                    alert("Formato de Mod não reconhecido.");
                }
            } catch(err) {
                alert("Erro ao ler o arquivo JSON do mod.");
            }
        };
        reader.readAsText(file);
    }
}

class GameEngine {
    constructor() {
        this.state = new GameState();
        this.loadGame(); // Tenta carregar do localStorage no inicio

        // Injetar dependências
        window.uiManager = new UIManager();
        window.mapSystem = new MapSystem();
        window.parliamentSystem = new ParliamentSystem(this.state);
        window.modSystem = new ModSystem(this.state);
        
        // Initial Render
        uiManager.updateTopBar(this.state);
        parliamentSystem.updateVotingQueue();
    }

    nextTurn() {
        // Avançar o tempo (1 Semana por turno)
        this.state.date.setDate(this.state.date.getDate() + 7);
        this.state.turn++;

        // Dinâmicas Econômicas (Pagamento de folha/dívida diminui caixa)
        this.state.budget -= 20000000000; // Custo do Estado por semana

        // Eventos Aleatórios (10% de chance por turno)
        if (Math.random() < 0.10) {
            this.triggerRandomEvent();
        }

        // Auto-save e update UI
        this.saveGame(true);
        uiManager.updateTopBar(this.state);
    }

    triggerRandomEvent() {
        const ev = EVENTS_DB[Math.floor(Math.random() * EVENTS_DB.length)];
        this.state.approval += ev.impactApproval;
        this.state.budget += ev.impactBudget;
        
        // Normalização de Limites
        if(this.state.approval > 100) this.state.approval = 100;
        if(this.state.approval < 0) this.state.approval = 0;

        uiManager.showEventModal(ev);
    }

    closeEvent() {
        uiManager.hideEventModal();
        uiManager.updateTopBar(this.state);
    }

    saveGame(auto = false) {
        const b64 = this.state.exportSave();
        localStorage.setItem('esim_save', b64);
        if(!auto) alert("Jogo salvo com sucesso localmente!");
    }

    loadGame() {
        const b64 = localStorage.getItem('esim_save');
        if(b64) {
            this.state.importSave(b64);
            console.log("Save recuperado.");
        }
    }
}

// Inicialização Global Pós-Carregamento do DOM
window.addEventListener('DOMContentLoaded', () => {
    window.gameEngine = new GameEngine();
});
