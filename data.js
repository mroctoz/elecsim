// data.js - Gerenciamento de Dados Geográficos e Socioeconômicos via CSV/GeoJSON

const GameData = {
    municipalitiesData: {}, // Dicionário que servirá como nosso "Banco de Dados" em memória
    geoJSON: null,          // Armazenará os polígonos do mapa

    /**
     * Função inicializadora chamada pelo app.js ao iniciar o jogo.
     * Ela fará o download do Mapa e do CSV de forma assíncrona.
     */
    async init() {
        try {
            console.log("Iniciando o carregamento dos bancos de dados...");

            // 1. Baixar o arquivo de Mapa (GeoJSON)
            const geoResponse = await fetch('municipios.geojson');
            if (!geoResponse.ok) {
                throw new Error("Arquivo municipios.geojson não encontrado. Verifique se ele está na pasta do projeto.");
            }
            this.geoJSON = await geoResponse.json();
            console.log("Mapa (GeoJSON) carregado com sucesso!");

            // 2. Baixar o arquivo de Dados (CSV)
            const csvResponse = await fetch('dados.csv');
            if (!csvResponse.ok) {
                throw new Error("Arquivo dados.csv não encontrado. Verifique se ele está na pasta do projeto.");
            }
            const csvText = await csvResponse.text();

            // 3. Fazer o Parse (Leitura) do CSV usando a biblioteca PapaParse
            return new Promise((resolve, reject) => {
                Papa.parse(csvText, {
                    header: true,          // Usa a primeira linha como chave das colunas
                    skipEmptyLines: true,  // Ignora linhas em branco no fim do arquivo
                    dynamicTyping: true,   // Converte números automaticamente (de texto para int/float)
                    complete: (results) => {
                        this.processCSV(results.data);
                        console.log("Dados socioeconômicos (CSV) processados com sucesso!");
                        resolve();
                    },
                    error: (error) => {
                        console.error("Falha ao processar o arquivo CSV:", error);
                        reject(error);
                    }
                });
            });

        } catch (error) {
            console.error("Erro crítico de inicialização:", error);
            alert("Atenção: Não foi possível carregar os dados do jogo. Certifique-se de que os arquivos 'dados.csv' e 'municipios.geojson' estão na raiz do projeto e que você está rodando o jogo em um servidor local (Live Server/Vercel).");
        }
    },

    /**
     * Pega o Array puro gerado pelo PapaParse e transforma em um Dicionário de busca O(1)
     * onde a chave é o Código do Município (CD_MUN) para cruzarmos perfeitamente com o mapa.
     */
    processCSV(rawData) {
        rawData.forEach(row => {
            // Tenta pegar o código do município. O .toString() garante que será uma string padronizada.
            const cdMunRaw = row['CD_MUN'] || row['CD_MUN ']; // Trata possíveis espaços invisíveis no cabeçalho
            
            if (!cdMunRaw) return; // Pula a linha se não houver código do município

            const cdMun = cdMunRaw.toString().trim();

            // Mapeamento exato das colunas fornecidas no seu prompt
            // Usamos || 0 (ou null) como fallback (defesa) caso o dado esteja em branco naquela célula do Excel.
            this.municipalitiesData[cdMun] = {
                uf: row['Sigla'] || "?",
                nome: row['NM_MUN'] || "Desconhecido",
                
                // Demografia
                popTotal: row['pop. Total'] || 0,
                popUrbana: row['pop. Urbana'] || 0,
                popRural: row['pop. Rural'] || 0,
                
                // Socioeconomia
                renda: row['Renda per capita média (2010)'] || 0,
                bolsaFamilia: row['Beneficiários do Bolsa Família'] || 0,
                analfabetismo: row['Taxa de analfabetismo'] || 0,
                ifdm: row['IFDM'] || 0,
                esgoto: row['Domicílios com rede de esgoto e/ou fossa séptica'] || 0,
                
                // Finanças Públicas
                despesa: row['despesa de custeio'] || 0,
                
                // Agronegócio
                soja: row['Produção - soja (2022)'] || 0,
                arroz: row['Produção - arroz (2022)'] || 0,
                banana: row['Produção - banana (2022)'] || 0,
                cafe: row['Produção - café (2022)'] || 0,
                cana: row['Produção - cana-de-açúcar (2022)'] || 0,
                feijao: row['Produção - feijão (2022)'] || 0,
                laranja: row['Produção - laranja (2022)'] || 0,
                
                // Pecuária
                bovinos: row['Efetivo - bovinos - quantidade (2022)'] || 0,
                vacas: row['Efetivo - vacas ordenhadas - quantidade (2022)'] || 0
            };
        });
    },

    /**
     * Função chamada pelo app.js para buscar os dados de uma cidade quando o jogador clica nela
     */
    getCityData(cd_mun) {
        if (!cd_mun) return null;
        return this.municipalitiesData[cd_mun.toString()] || null;
    }
};
