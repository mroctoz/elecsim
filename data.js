// data.js - Gerenciamento de Dados Geográficos e Socioeconômicos

const GameData = {
    municipalitiesData: {}, // Guardará os dados do CSV parseados pelo código do IBGE
    geoJSON: null,

    // Amostra do GeoJSON fornecido pelo usuário (Apenas AC/RO para teste de renderização imediata)
    // No projeto real hospedado, você faria um fetch('brasil_municipios.json')
    sampleGeoJSON: {
        "type": "FeatureCollection",
        "features":[
            {
                "type": "Feature",
                "geometry": { "type": "Polygon", "coordinates": [[[-62.417,-13.118],[-62.410,-13.107],[-62.387,-13.106],[-62.356,-13.083],[-62.417,-13.118]]] },
                "properties": { "CD_MUN": "1100015", "NM_MUN": "Alta Floresta D'Oeste", "SIGLA_UF": "RO" }
            },
            {
                "type": "Feature",
                "geometry": { "type": "Polygon", "coordinates": [[[-63.596,-10.000],[-63.355,-10.000],[-63.113,-10.000],[-63.596,-10.000]]] },
                "properties": { "CD_MUN": "1100023", "NM_MUN": "Ariquemes", "SIGLA_UF": "RO" }
            }
        ]
    },

    // Amostra do CSV transformada em Objeto JS para carregamento síncrono rápido.
    // Num deploy real, usaremos PapaParse (biblioteca) para ler o arquivo .csv e preencher isso.
    sampleCSVData: {
        "1200013": { uf: "AC", nome: "Acrelândia", popRural: 6256, popUrbana: 7765, popTotal: 14021, despesa: 9059573, arroz: 256, banana: 2640, cafe: 57, cana: 390, feijao: 133, laranja: 60, soja: 0, bovinos: 71801, vacas: 359, bolsaFamilia: 2356, renda: 303.76, analfabetismo: 11.65, ifdm: 0.4849, esgoto: 25.26 },
        "1200054": { uf: "AC", nome: "Assis Brasil", popRural: 3282, popUrbana: 4818, popTotal: 8100, despesa: 3971485, arroz: 490, banana: 1760, cafe: 189, cana: 300, feijao: 303, laranja: 139, soja: 0, bovinos: 352222, vacas: 3240, bolsaFamilia: 1730, renda: 291.33, analfabetismo: 14.7, ifdm: 0.2771, esgoto: 18.06 },
        "1100015": { uf: "RO", nome: "Alta Floresta D'Oeste", popRural: 10000, popUrbana: 15000, popTotal: 25000, despesa: 15000000, arroz: 1000, banana: 500, cafe: 1200, cana: 0, feijao: 400, laranja: 100, soja: 5000, bovinos: 500000, vacas: 10000, bolsaFamilia: 3000, renda: 600.00, analfabetismo: 8.5, ifdm: 0.6000, esgoto: 40.0 },
        "1100023": { uf: "RO", nome: "Ariquemes", popRural: 15000, popUrbana: 90000, popTotal: 105000, despesa: 85000000, arroz: 500, banana: 1000, cafe: 800, cana: 0, feijao: 200, laranja: 300, soja: 15000, bovinos: 800000, vacas: 25000, bolsaFamilia: 8000, renda: 850.00, analfabetismo: 6.2, ifdm: 0.7100, esgoto: 55.0 }
    },

    async init() {
        // Num cenário de produção real no Vercel:
        // this.geoJSON = await fetch('data/municipios.geojson').then(r => r.json());
        // Aqui usaremos a amostra para garantir que funcione imediatamente sem backend:
        this.geoJSON = this.sampleGeoJSON;
        this.municipalitiesData = this.sampleCSVData;
        console.log("Dados carregados com sucesso.");
    },

    getCityData(cd_mun) {
        return this.municipalitiesData[cd_mun] || null;
    }
};
