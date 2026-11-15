// INTEGRACAO WEB SERIAL API - IFSP CONNECT

// Elementos HTML do DOM
const btnConectar = document.getElementById("btnConectar");
const btnDemo = document.getElementById("btnDemo");
const statusConexao = document.getElementById("statusConexao");
const valorLampada = document.getElementById("valorLampada");
const valorSolar = document.getElementById("valorSolar");
const serialOutput = document.getElementById("serialOutput");

let portaSerial = null;
let leitorSerial = null;
let intervaloDemo = null;
let modoDemoAtivo = false;

// Event Listener para Conexão Real via Web Serial API
if (btnConectar) {
    btnConectar.addEventListener("click", conectarPortaSerial);
}

// Event Listener para Modo Demo
if (btnDemo) {
    btnDemo.addEventListener("click", alternarModoDemo);
}

// Função Principal: Conecta à Porta USB do Arduino / ESP32
async function conectarPortaSerial() {
    // Para o modo demo se estiver ativo
    if (modoDemoAtivo) {
        pararModoDemo();
    }

    // Verifica se o navegador suporta Web Serial API
    if (!("serial" in navigator)) {
        statusConexao.textContent = "❌ Navegador Incompatível (Use Chrome ou Edge)";
        statusConexao.className = "badge-status desconectado";
        adicionarLinhaTerminal("ERRO: Este navegador não suporta a Web Serial API.");
        return;
    }

    try {
        statusConexao.textContent = "🟡 Selecionando porta...";
        statusConexao.className = "badge-status demo";

        // Solicita autorização de porta serial ao usuário
        portaSerial = await navigator.serial.requestPort();
        
        // Abre conexão com BaudRate 9600 bps
        await portaSerial.open({ baudRate: 9600 });

        statusConexao.textContent = "🟢 Conectado ao Piranômetro";
        statusConexao.className = "badge-status conectado";
        adicionarLinhaTerminal(">>> Conexão serial estabelecida a 9600 baud.");

        // Inicia fluxo de leitura de dados
        const decoder = new TextDecoderStream();
        const inputDone = portaSerial.readable.pipeTo(decoder.writable);
        const inputStream = decoder.readable;

        leitorSerial = inputStream.getReader();

        let bufferTexto = "";

        // Loop contínuo de recepção de dados
        while (true) {
            const { value, done } = await leitorSerial.read();
            if (done) {
                leitorSerial.releaseLock();
                break;
            }
            if (value) {
                bufferTexto += value;
                const linhas = bufferTexto.split("\n");
                bufferTexto = linhas.pop(); // Guarda pedaço incompleto

                for (const linha of linhas) {
                    processarMedicao(linha);
                }
            }
        }

    } catch (erro) {
        statusConexao.textContent = "🔴 Falha / Desconectado";
        statusConexao.className = "badge-status desconectado";
        adicionarLinhaTerminal("ERRO: " + erro.message);
        console.error("Erro na comunicação serial:", erro);
    }
}

// Função para Processar as Linhas Recebidas (Ex: "LAMPADA, 650.0")
function processarMedicao(linha) {
    linha = linha.trim();
    if (!linha) return;

    adicionarLinhaTerminal(linha);

    // 1. Verifica se é o formato novo ("LAMPADA, 650.0" ou "SOLAR, 820.0")
    if (linha.includes(",")) {
        const partes = linha.split(",");
        if (partes.length === 2) {
            const tipo = partes[0].trim().toUpperCase();
            const valor = parseFloat(partes[1].trim());

            if (!isNaN(valor)) {
                if (tipo === "LAMPADA") {
                    valorLampada.textContent = valor.toFixed(1);
                    atualizarDadosGrafico("LAMPADA", valor);
                } else if (tipo === "SOLAR") {
                    valorSolar.textContent = valor.toFixed(1);
                    atualizarDadosGrafico("SOLAR", valor);
                }
            }
        }
        return;
    }

    // 2. Verifica se é o formato atual da placa ("Leitura ADC: 922 | Tensao: 4.51 V")
    if (linha.includes("Tensao:")) {
        const matchTensao = linha.match(/Tensao:\s*([0-9.]+)/i);
        if (matchTensao && matchTensao[1]) {
            const tensao = parseFloat(matchTensao[1]);
            if (!isNaN(tensao)) {
                // Converte a tensão (0 a 5V) para Irradiância estimada (W/m²)
                const irradianciaCalculada = tensao * 200.0;

                // Atualiza o card e o gráfico da Lâmpada
                valorLampada.textContent = irradianciaCalculada.toFixed(1);
                atualizarDadosGrafico("LAMPADA", irradianciaCalculada);
            }
        }
    }
}

// Utilitário para Exibir Mensagens no Terminal Emulado
function adicionarLinhaTerminal(texto) {
    if (!serialOutput) return;
    const p = document.createElement("div");
    p.textContent = texto;
    serialOutput.appendChild(p);

    // Mantém o scroll sempre no final do terminal
    serialOutput.scrollTop = serialOutput.scrollHeight;

    // Limite máximo de linhas para evitar sobrecarga de memória
    if (serialOutput.children.length > 50) {
        serialOutput.removeChild(serialOutput.firstChild);
    }
}

// Alterna Simulação (Para Apresentações sem a Placa Física)
function alternarModoDemo() {
    if (modoDemoAtivo) {
        pararModoDemo();
    } else {
        iniciarModoDemo();
    }
}

function iniciarModoDemo() {
    modoDemoAtivo = true;
    btnDemo.textContent = "⏹️ Parar Modo Demo";
    statusConexao.textContent = "🟡 Modo Demo Ativo";
    statusConexao.className = "badge-status demo";
    serialOutput.innerHTML = "";
    adicionarLinhaTerminal(">>> Modo de simulação ativado.");

    intervaloDemo = setInterval(() => {
        const valLamp = (600 + Math.random() * 80).toFixed(1);
        const valSol = (800 + Math.random() * 100).toFixed(1);

        processarMedicao(`LAMPADA, ${valLamp}`);
        processarMedicao(`SOLAR, ${valSol}`);
    }, 2000);
}

function pararModoDemo() {
    modoDemoAtivo = false;
    if (intervaloDemo) clearInterval(intervaloDemo);
    btnDemo.textContent = "🎮 Ativar Modo Demo";
    statusConexao.textContent = "🔴 Desconectado";
    statusConexao.className = "badge-status desconectado";
    adicionarLinhaTerminal(">>> Modo demo finalizado.");
}

// Função de Copiar Código
function copiarCodigo() {
    const codeBlock = document.getElementById("codeBlock");
    if (!codeBlock) return;
    navigator.clipboard.writeText(codeBlock.innerText).then(() => {
        alert("Código C/C++ copiado para a área de transferência!");
    });
}

// FUNÇÕES DE MODAL DOS COMPONENTES (MANTER EXISTENTE)
const componentesDados = {
    arduino: {
        titulo: "Arduino Uno R3",
        imagem: "../imagens/Arduino.png",
        descricao: "Placa de microcontrolador baseada no ATmega328P. Responsável por ler a tensão analógica do divisor de tensão no pino A0 e converter para um valor de 10 bits (0-1023).",
        specs: ["Microcontrolador: ATmega328P", "Tensão de Operação: 5V", "Resolução ADC: 10 bits (1024 níveis)", "Comunicação: USB Serial (UART)"]
    },
    resistor: {
        titulo: "Resistor 100 kΩ",
        imagem: "../imagens/Resistor.png",
        descricao: "Resistor de filme de carbão utilizado na topologia de divisor de tensão junto ao LDR GL5528 para maximizar a sensibilidade de leitura na faixa de 0 a 1000 Lux.",
        specs: ["Resistência Nominal: 100 kΩ", "Tolerância: ±5%", "Potência: 1/4 W (0.25W)", "Dimensionamento: Média Geométrica"]
    },
    ldr: {
        titulo: "Fotoresistor LDR GL5528",
        imagem: "../imagens/LDR.png",
        descricao: "Sensor fotosensível de Sulfeto de Cádmio (CdS) cuja resistência elétrica diminui à medida que a intensidade de luz (iluminância) incidente aumenta.",
        specs: ["Diâmetro: 5mm", "Resistência na Luz (10 Lux): 8 a 20 kΩ", "Resistência no Escuro: 1 MΩ (mínimo)", "Pico de Espectro: 540nm"]
    }
};

function abrirModal(idComponente) {
    const modal = document.getElementById("modalComponente");
    const dados = componentesDados[idComponente];
    if (!dados || !modal) return;

    document.getElementById("modalTitulo").textContent = dados.titulo;
    document.getElementById("modalImagem").src = dados.imagem;
    document.getElementById("modalDescricao").textContent = dados.descricao;

    const listaSpecs = document.getElementById("modalEspecificacoes");
    listaSpecs.innerHTML = "";
    dados.specs.forEach(spec => {
        const li = document.createElement("li");
        li.textContent = spec;
        listaSpecs.appendChild(li);
    });

    modal.style.display = "flex";
}

function fecharModal() {
    const modal = document.getElementById("modalComponente");
    if (modal) modal.style.display = "none";
}

function fecharModalFora(event) {
    const modal = document.getElementById("modalComponente");
    if (event.target === modal) fecharModal();
}

// CONFIGURAÇÃO DO GRÁFICO DINÂMICO COM CHART.JS

let meuGrafico = null;
const MAX_PONTOS_GRAFICO = 20; // Quantidade de pontos visíveis no eixo X

// Função para inicializar o gráfico ao carregar a página
function inicializarGrafico() {
    const ctx = document.getElementById("graficoIrradiancia");
    if (!ctx) return;

    meuGrafico = new Chart(ctx, {
        type: "line",
        data: {
            labels: [], // Horários das leituras
            datasets: [
                {
                    label: "💡 Lâmpada (W/m²)",
                    data: [],
                    borderColor: "#10B981", // Verde de destaque do projeto
                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3, // Curva suave na linha
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: "☀️ Luz Solar (W/m²)",
                    data: [],
                    borderColor: "#1E3A8A", // Azul primário do projeto
                    backgroundColor: "rgba(30, 58, 138, 0.1)",
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: "Horário da Leitura",
                        color: "#64748B"
                    },
                    grid: { color: "#F1F5F9" }
                },
                y: {
                    title: {
                        display: true,
                        text: "Irradiância (W/m²)",
                        color: "#64748B"
                    },
                    beginAtZero: true,
                    grid: { color: "#E2E8F0" }
                }
            },
            plugins: {
                legend: {
                    position: "top",
                    labels: {
                        font: { family: "Quicksand", size: 13, weight: "bold" },
                        usePointStyle: true
                    }
                },
                tooltip: {
                    mode: "index",
                    intersect: false
                }
            }
        }
    });
}

// Função para adicionar novos pontos no gráfico dinamicamente
function atualizarDadosGrafico(tipo, valor) {
    if (!meuGrafico) return;

    const horaAtual = new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });

    const datasetIndex = tipo === "LAMPADA" ? 0 : tipo === "SOLAR" ? 1 : -1;
    if (datasetIndex === -1) return;

    // Adiciona o rótulo da hora apenas se ainda não existir para esta rodada
    const labels = meuGrafico.data.labels;
    if (labels.length === 0 || labels[labels.length - 1] !== horaAtual) {
        labels.push(horaAtual);
    }

    // Adiciona o novo valor ao conjunto de dados correspondente
    meuGrafico.data.datasets[datasetIndex].data.push(valor);

    // Mantém o gráfico rolando removendo pontos antigos quando ultrapassa o limite
    if (labels.length > MAX_PONTOS_GRAFICO) {
        labels.shift();
        meuGrafico.data.datasets[0].data.shift();
        meuGrafico.data.datasets[1].data.shift();
    }

    // Atualiza a renderização do gráfico sem redesenhar do zero
    meuGrafico.update("none");
}

// Inicializa o gráfico assim que o DOM estiver pronto
document.addEventListener("DOMContentLoaded", inicializarGrafico);

// GUIA INTERATIVO DO CIRCUITO E PINOUT
const dadosPinout = {
    arduino: {
        badge: "Microcontrolador",
        titulo: "Arduino Uno R3",
        descricao: "Placa principal de processamento. Executa o conversor Analógico-Digital (ADC) de 10 bits no pino A0, convertendo a tensão recebida (0V a 5V) em um valor numérico de 0 a 1023 para transmissão via porta serial.",
        specs: [
            "⚡ **Alimentação:** USB 5V ou Vin 7-12V",
            "📊 **Resolução ADC:** 10 bits (4,88 mV por divisão)",
            "📡 **Comunicação:** Serial UART (Baudrate 9600 bps)"
        ]
    },
    ldr: {
        badge: "Sensor Fotosensível",
        titulo: "Fotoresistor LDR GL5528",
        descricao: "Componente semicondutor de Sulfeto de Cádmio (CdS). Sua resistência diminui exponencialmente à medida que a iluminação aumenta (de ~1 MΩ no escuro até ~15 kΩ a 10 Lux).",
        specs: [
            "☀️ **Faixa de Trabalho:** 0 a 1000 Lux",
            "⚡ **Conexão:** Ligado entre VCC (+5V) e a saída do divisor (Pino A0)",
            "💡 **Função:** Variador de resistência proporcional à luz"
        ]
    },
    resistor: {
        badge: "Carga Fixa",
        titulo: "Resistor de Carga (100 kΩ)",
        descricao: "Resistor fixo dimensionado por meio da média geométrica entre os extremos de resistência do LDR. Garante a máxima sensibilidade de saída no divisor de tensão e impede a saturação precoce do sinal.",
        specs: [
            "📐 **Valor Nominal:** 100 kΩ (1/4 W)",
            "⚡ **Conexão:** Ligado entre a saída do divisor (Pino A0) e o GND (0V)",
            "🎯 **Cálculo:** $R = \\sqrt{R_{escuro} \\times R_{10Lux}}$"
        ]
    },
    vcc: {
        badge: "Alimentação 5V",
        titulo: "Barramento VCC (+5V)",
        descricao: "Pino de saída de alimentação contínua de +5 Volts do Arduino. Fornece a tensão de referência fixa (VCC) para o topo da malha do divisor de tensão.",
        specs: [
            "⚡ <strong>Tensão:</strong> +5,0 V DC (estabilizada)",
            "🔗 <strong>Ligação:</strong> Conectado diretamente a um dos terminais do LDR"
        ]
    },
    a0: {
        badge: "Entrada Analógica",
        titulo: "Pino Analógico A0 ($V_{out}$)",
        descricao: "Nó central do divisor de tensão situado entre o LDR e o Resistor de 100 kΩ. A tensão neste ponto varia continuamente entre 0,45V e 4,86V conforme a irradiância incidente.",
        specs: [
            "📉 **Fórmula de Tensão:** $V_{out} = V_{CC} \\times \\left(\\frac{R}{R_{LDR} + R}\\right)$",
            "📊 **Leitura ADC:** Convertido internamente de 0 a 1023"
        ]
    },
    gnd: {
        badge: "Referência 0V",
        titulo: "Barramento GND (Terra)",
        descricao: "Pino de referência comum de zero Volts (0V). Fecha o circuito elétrico conectando a base do resistor de carga fixo ao terra do barramento.",
        specs: [
            "⚡ **Potencial:** 0 Volts",
            "🔗 **Ligação:** Conectado à perna inferior do resistor de 100 kΩ"
        ]
    }
};

function mostrarInfoPino(pinoId) {
    const dados = dadosPinout[pinoId];
    if (!dados) return;

    // Atualiza o estado visual dos botões
    const botoes = document.querySelectorAll(".btn-pinout");
    botoes.forEach(btn => btn.classList.remove("active"));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add("active");
    }

    // Atualiza os dados do Card Informativo
    document.getElementById("badgePinout").textContent = dados.badge;
    document.getElementById("tituloPinout").textContent = dados.titulo;
    document.getElementById("descPinout").textContent = dados.descricao;

    const listaSpecs = document.getElementById("specsPinout");
    listaSpecs.innerHTML = "";
    dados.specs.forEach(spec => {
        const li = document.createElement("li");
        li.innerHTML = spec;
        listaSpecs.appendChild(li);
    });

    // Destaque visual suave no card
    const cardInfo = document.getElementById("cardInfoPinout");
    cardInfo.style.borderColor = "var(--accent-green)";
    setTimeout(() => {
        cardInfo.style.borderColor = "var(--border-color)";
    }, 300);
}
