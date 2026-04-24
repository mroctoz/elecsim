const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================================
// 1. ESTADO GLOBAL DO JOGO (GAME STATE)
// ============================================================================
let GameState = {
    year: 2026, month: 1,
    treasury: 850.0,
    happiness: 65.0,
    growth: 2.1,
    security: 55.0,
    pp: 100, // Poder Político
    partyFunds: 45.0, // Fundo Partidário (Milhões)
    personalFunds: 2.5,
    approval: 45.0,
    govStatus: 'Média',
    
    // Modificadores dinâmicos causados por leis aprovadas
    govModifiers: {
        poorAppeal: 1.0, // Apelo com os mais pobres
        richAppeal: 1.0, // Apelo com os mais ricos
        ruralAppeal: 1.0 // Apelo com o agronegócio
    }
};

let ElectionsCache = {
    national:[],
    states: {},
    municipalities: {}
};

// Banco de dados em memória do CSV
let SocioData = {}; 

// Partidos e suas bases eleitorais teóricas
const Parties =[
    { id: 'PT', basePoor: 1.8, baseRich: 0.5, baseRural: 0.7, regional: { 'NE': 2.0, 'S': 0.6 } },
    { id: 'PL', basePoor: 0.6, baseRich: 1.7, baseRural: 1.8, regional: { 'S': 1.8, 'CO': 1.9, 'NE': 0.5 } },
    { id: 'MDB', basePoor: 1.1, baseRich: 1.1, baseRural: 1.2, regional: {} }, // Centrão tradicional
    { id: 'UNIAO', basePoor: 1.0, baseRich: 1.3, baseRural: 1.4, regional: { 'CO': 1.5 } },
    { id: 'PSD', basePoor: 1.1, baseRich: 1.2, baseRural: 1.1, regional: { 'SE': 1.3 } },
    { id: 'PSOL', basePoor: 1.5, baseRich: 0.8, baseRural: 0.4, regional: { 'SE': 1.5, 'N': 0.5 } },
    { id: 'NOVO', basePoor: 0.3, baseRich: 2.0, baseRural: 0.9, regional: { 'SE': 1.6, 'S': 1.5, 'NE': 0.3 } }
];

// O Partido do Jogador (Assume-se que o jogador lidera o governo, ex: PT ou PL)
const PLAYER_PARTY = 'PT'; 

// ============================================================================
// 2. INICIALIZAÇÃO E PARSER DO CSV
// ============================================================================
function loadCSV() {
    console.log("Iniciando leitura do arquivo dados.csv...");
    return new Promise((resolve, reject) => {
        fs.createReadStream('dados.csv')
            .pipe(csv({ separator: ';' }))
            .on('data', (row) => {
                const id = row['CD_MUN_I'];
                if (id) {
                    // Limpeza e conversão de dados do CSV (substitui vírgula por ponto)
                    const parseNum = (val) => parseFloat((val || '0').replace(',', '.')) || 0;
                    
                    SocioData[id] = {
                        uf: row['Sigla'],
                        nome: row['MUN_NOME'],
                        popRural: parseNum(row['pop. Rural']),
                        popUrbana: parseNum(row['pop. Urbana']),
                        popTotal: parseNum(row['pop. Total']),
                        renda: parseNum(row['Renda per capita média (2010)']),
                        analfabetismo: parseNum(row['Taxa de analfabetismo']),
                        ifdm: parseNum(row['IFDM']),
                        esgoto: parseNum(row['Domicílios com rede de esgoto e/ou fossa séptica']),
                        bolsaFamilia: parseNum(row['Beneficiários do Bolsa Família'])
                    };
                }
            })
            .on('end', () => {
                console.log(`CSV Carregado com sucesso! ${Object.keys(SocioData).length} municípios processados.`);
                simulateElections(); // Roda a primeira eleição
                resolve();
            })
            .on('error', reject);
    });
}

// ============================================================================
// 3. MOTOR ELEITORAL (SOCIOECONÔMICO)
// ============================================================================
const UfToRegion = {
    'AC':'N','AP':'N','AM':'N','PA':'N','RO':'N','RR':'N','TO':'N',
    'AL':'NE','BA':'NE','CE':'NE','MA':'NE','PB':'NE','PE':'NE','PI':'NE','RN':'NE','SE':'NE',
    'DF':'CO','GO':'CO','MT':'CO','MS':'CO',
    'ES':'SE','MG':'SE','RJ':'SE','SP':'SE',
    'PR':'S','RS':'S','SC':'S'
};

function simulateElections() {
    console.log("Calculando eleições baseadas em dados socioeconômicos reais...");
    
    // Zera os contadores
    ElectionsCache.municipalities = {};
    ElectionsCache.states = {};
    let partyTotalVotes = {};
    Parties.forEach(p => partyTotalVotes[p.id] = 0);

    // Estrutura temporária para os estados
    let stateVotes = {};

    // Iterar sobre TODOS os municípios carregados do CSV
    for (const [cityId, city] of Object.entries(SocioData)) {
        let region = UfToRegion[city.uf] || 'SE';
        
        // --- ANÁLISE SOCIOECONÔMICA DA CIDADE ---
        let isPoor = city.renda < 350 || city.ifdm < 0.5;
        let isRich = city.renda > 700 && city.ifdm > 0.7;
        let isRural = city.popRural > city.popUrbana;
        
        let cityVotes = {};
        let totalValidos = 0;

        // Distribui votos para os partidos baseado no perfil da cidade
        Parties.forEach(party => {
            let score = 1.0;
            
            // Aplica os vieses econômicos
            if (isPoor) score *= party.basePoor;
            if (isRich) score *= party.baseRich;
            if (isRural) score *= party.baseRural;
            
            // Aplica viés regional
            if (party.regional[region]) score *= party.regional[region];

            // Se for o partido do jogador, aplica o efeito de Leis aprovadas
            if (party.id === PLAYER_PARTY) {
                if (isPoor) score *= GameState.govModifiers.poorAppeal;
                if (isRich) score *= GameState.govModifiers.richAppeal;
                if (isRural) score *= GameState.govModifiers.ruralAppeal;
            }

            // Adiciona fator aleatório local (ruído de campanha)
            score *= (0.7 + Math.random() * 0.6);

            // Transforma o score em votos absolutos proporcionais à população
            let votes = Math.floor(city.popTotal * 0.7 * (score / 10)); // ~70% de comparecimento
            if (votes < 0) votes = 0;

            cityVotes[party.id] = votes;
            totalValidos += votes;
            
            // Soma nos totais nacionais e estaduais
            partyTotalVotes[party.id] += votes;
            
            if (!stateVotes[city.uf]) stateVotes[city.uf] = { total: 0, parties: {} };
            if (!stateVotes[city.uf].parties[party.id]) stateVotes[city.uf].parties[party.id] = 0;
            
            stateVotes[city.uf].parties[party.id] += votes;
            stateVotes[city.uf].total += votes;
        });

        // Formata o ranking Municipal
        let ranking = Object.entries(cityVotes)
            .map(([id, v]) => ({ id, votes: v, pct: (v / totalValidos) * 100 }))
            .sort((a, b) => b.votes - a.votes);

        ElectionsCache.municipalities[cityId] = {
            total: totalValidos,
            winner: ranking[0],
            ranking: ranking
        };
    }

    // --- PROCESSAMENTO DOS ESTADOS ---
    // (A malha do IBGE usa IDs estaduais, precisamos mapear a UF para o ID do IBGE)
    const ufMap = {'RO':'11','AC':'12','AM':'13','RR':'14','PA':'15','AP':'16','TO':'17','MA':'21','PI':'22','CE':'23','RN':'24','PB':'25','PE':'26','AL':'27','SE':'28','BA':'29','MG':'31','ES':'32','RJ':'33','SP':'35','PR':'41','SC':'42','RS':'43','MS':'50','MT':'51','GO':'52','DF':'53'};
    
    for (const [uf, data] of Object.entries(stateVotes)) {
        let ibgeId = ufMap[uf];
        if(!ibgeId) continue;

        let ranking = Object.entries(data.parties)
            .map(([id, v]) => ({ id, votes: v, pct: (v / data.total) * 100 }))
            .sort((a, b) => b.votes - a.votes);

        ElectionsCache.states[ibgeId] = {
            total: data.total,
            winner: ranking[0],
            ranking: ranking
        };
    }

    // --- PROCESSAMENTO NACIONAL (CÂMARA DOS DEPUTADOS) ---
    // Cálculo D'Hondt Simplificado (Proporcional)
    let nationalSeats = 513;
    let natTotalVotes = Object.values(partyTotalVotes).reduce((a, b) => a + b, 0);
    let distributed = 0;
    
    let natRanking = Parties.map(p => {
        let pct = partyTotalVotes[p.id] / natTotalVotes;
        let seats = Math.floor(pct * nationalSeats);
        distributed += seats;
        return { id: p.id, votes: partyTotalVotes[p.id], pct: pct * 100, seats: seats };
    });
    
    // Distribui sobras para o vencedor
    natRanking.sort((a, b) => b.votes - a.votes);
    natRanking[0].seats += (nationalSeats - distributed);

    ElectionsCache.national = natRanking.sort((a, b) => b.seats - a.seats);

    // Calcula a Governabilidade (Se o jogador tem maioria)
    let playerSeats = natRanking.find(p => p.id === PLAYER_PARTY)?.seats || 0;
    // Assume que MDB e UNIAO compram-se facilmente para a base aliada
    let centraoSeats = (natRanking.find(p => p.id === 'MDB')?.seats || 0) + (natRanking.find(p => p.id === 'UNIAO')?.seats || 0);
    
    let baseGoverno = playerSeats + centraoSeats;
    if (baseGoverno > 308) GameState.govStatus = 'Alta (Maioria Constitucional)';
    else if (baseGoverno > 257) GameState.govStatus = 'Média (Maioria Simples)';
    else GameState.govStatus = 'Baixa (Minoria/Crise)';

    console.log("Eleições concluídas.");
}

// ============================================================================
// 4. BANCO DE LEIS E LÓGICA
// ============================================================================
const LawsDB =[
    { 
        id: 'law_bolsa', name: 'Bolsa Família Expandido (PEC)', 
        desc: 'Injeta rios de dinheiro nas camadas mais baixas. Custo alto para os cofres públicos, mas garante extrema fidelidade do Norte e Nordeste.',
        costPP: 40, costM: 15,
        effect: () => {
            GameState.treasury -= 120;
            GameState.happiness += 10;
            GameState.approval += 15;
            // Modificador CRÍTICO: aumenta brutalmente o apelo entre os pobres na próxima eleição
            GameState.govModifiers.poorAppeal += 0.8; 
            GameState.govModifiers.richAppeal -= 0.2; // Ricos não gostam do gasto fiscal
        }
    },
    { 
        id: 'law_agro', name: 'Subsídio ao Agronegócio', 
        desc: 'Reduz impostos para ruralistas. O PIB cresce, mas a oposição faz barulho.',
        costPP: 30, costM: 5,
        effect: () => {
            GameState.treasury -= 40;
            GameState.growth += 1.5;
            GameState.govModifiers.ruralAppeal += 0.6; // O Centro-Oeste e Sul vão te amar
            GameState.govModifiers.poorAppeal -= 0.1;
        }
    },
    {
        id: 'law_tributaria', name: 'Nova Reforma Tributária',
        desc: 'Aumenta significativamente a arrecadação. O povo vai odiar, mas salva o Tesouro.',
        costPP: 50, costM: 20,
        effect: () => {
            GameState.treasury += 250;
            GameState.growth -= 0.8;
            GameState.approval -= 20;
            GameState.govModifiers.richAppeal -= 0.4;
            GameState.govModifiers.poorAppeal -= 0.4;
        }
    }
];


// ============================================================================
// 5. ROTAS DA API REST
// ============================================================================

// 1. Pega estado global
app.get('/api/state', (req, res) => {
    res.json(GameState);
});

// 2. Pega resultados das eleições completas (Nacional, Estados e todos os Municípios)
app.get('/api/elections', (req, res) => {
    res.json(ElectionsCache);
});

// 3. Pega dados socioeconômicos de uma cidade específica (Direto do CSV em memória)
app.get('/api/municipality/:id', (req, res) => {
    const data = SocioData[req.params.id];
    if (data) res.json(data);
    else res.status(404).json({ error: "Município não encontrado" });
});

// 4. Avança o mês
app.post('/api/turn', (req, res) => {
    GameState.month++;
    if (GameState.month > 12) {
        GameState.month = 1;
        GameState.year++;
        if (GameState.year % 4 === 2) { // De 4 em 4 anos tem eleição
            simulateElections();
        }
    }
    
    // Economia básica
    GameState.pp += 10;
    GameState.partyFunds += 2.5;
    GameState.treasury += (GameState.growth * 3) - 2; // Crescimento afeta o caixa
    GameState.approval = Math.max(0, Math.min(100, GameState.approval + (Math.random() * 6 - 3)));

    res.json({ success: true, state: GameState });
});

// 5. Retorna as leis disponíveis
app.get('/api/laws', (req, res) => {
    // Retorna sem a função 'effect' para não dar erro no JSON
    res.json(LawsDB.map(l => ({ id: l.id, name: l.name, desc: l.desc, costPP: l.costPP, costM: l.costM })));
});

// 6. Propor Lei (Plenário Virtual)
app.post('/api/laws/propose', (req, res) => {
    const { id } = req.body;
    const law = LawsDB.find(l => l.id === id);
    
    if (!law) return res.status(404).json({ error: 'Lei não encontrada.' });
    if (GameState.pp < law.costPP || GameState.partyFunds < law.costM) {
        return res.status(400).json({ error: 'Recursos insuficientes.' });
    }

    // Calcula os votos baseados na Governabilidade atual
    let baseWinChance = GameState.govStatus.includes('Alta') ? 0.8 : (GameState.govStatus.includes('Média') ? 0.5 : 0.2);
    // Aplica o peso do dinheiro gasto
    baseWinChance += (Math.random() * 0.2); 

    let passed = baseWinChance > 0.5;
    let total = 513;
    let abs = 10 + Math.floor(Math.random() * 30);
    let sim = passed ? Math.floor(total * baseWinChance) : Math.floor(total * (baseWinChance * 0.8));
    if(sim > total - abs) sim = total - abs;
    let nao = total - sim - abs;

    if (passed) {
        GameState.pp -= law.costPP;
        GameState.partyFunds -= law.costM;
        law.effect(); // Aplica os impactos!
    }

    res.json({ passed, sim, nao, abs });
});

// 7. Forçar Eleição Instantânea (Para testes e para refletir os impactos das leis)
app.post('/api/elections/force', (req, res) => {
    simulateElections();
    res.json({ success: true, message: 'Eleições recalculadas com os novos bônus socioeconômicos.' });
});

// ============================================================================
// INICIA O SERVIDOR
// ============================================================================
const PORT = 3000;
loadCSV().then(() => {
    app.listen(PORT, () => {
        console.log(`\n=== LawGivers II - Brasil Back-end ===`);
        console.log(`Servidor rodando na porta ${PORT}`);
        console.log(`Aguardando conexões do Front-end (index.html)...\n`);
    });
}).catch(err => {
    console.error("Erro fatal ao carregar o CSV. Verifique se o arquivo dados.csv está na mesma pasta.", err);
});
