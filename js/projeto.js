// INTEGRAÇÃO WEB SERIAL API + GRÁFICO - IFSP CONNECT

const btnConectar = document.getElementById("btnConectar");
const btnPausar = document.getElementById("btnPausar");
const btnDemo = document.getElementById("btnDemo");
const statusConexao = document.getElementById("statusConexao");
const valorLampada = document.getElementById("valorLampada");
const serialOutput = document.getElementById("serialOutput");

let portaSerial = null;
let leitorSerial = null;
let intervaloDemo = null;
let modoDemoAtivo = false;
let medicaoPausada = false;

let meuGrafico = null;
const MAX_PONTOS_GRAFICO = 20;

// 1. INICIALIZAÇÃO DO GRÁFICO DINÂMICO (CHART.JS)
function inicializarGrafico() {
    const ctx = document.getElementById("graficoIrradiancia");
    if (!ctx || typeof Chart === "undefined") return;

    meuGrafico = new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                {
                    label: "💡 Irradiância Lâmpada (W/m²)",
                    data: [],
                    borderColor: "#10B981",
                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                    borderWidth: 3,
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
            animation: false,
            scales: {
                x: {
                    title: { display: true, text: "Horário da Leitura", color: "#64748B" },
                    grid: { color: "#F1F5F9" }
                },
                y: {
                    title: { display: true, text: "Irradiância (W/m²)", color: "#64748B" },
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
                }
            }
        }
    });
}

inicializarGrafico();

function atualizarDadosGrafico(valor) {
    if (!meuGrafico) inicializarGrafico();
    if (!meuGrafico) return;

    const horaAtual = new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });

    const labels = meuGrafico.data.labels;
    const dadosLampada = meuGrafico.data.datasets[0].data;

    labels.push(horaAtual);
    dadosLampada.push(valor);

    if (labels.length > MAX_PONTOS_GRAFICO) {
        labels.shift();
        dadosLampada.shift();
    }

    meuGrafico.update();
}

// 2. CONTROLE DE PAUSAR / RETOMAR E WEB SERIAL API
if (btnConectar) btnConectar.addEventListener("click", conectarPortaSerial);
if (btnDemo) btnDemo.addEventListener("click", alternarModoDemo);

if (btnPausar) {
    btnPausar.addEventListener("click", () => {
        medicaoPausada = !medicaoPausada;

        if (medicaoPausada) {
            btnPausar.textContent = "▶️ Retomar Medição";
            btnPausar.classList.add("pausado");
            statusConexao.textContent = "⏸️ Medição Pausada";
            statusConexao.className = "badge-status demo";
            adicionarLinhaTerminal(">>> Medição pausada para análise do gráfico.");
        } else {
            btnPausar.textContent = "⏸️ Pausar Medição";
            btnPausar.classList.remove("pausado");
            statusConexao.textContent = modoDemoAtivo ? "🟡 Modo Demo Ativo" : "🟢 Conectado ao Piranômetro";
            statusConexao.className = modoDemoAtivo ? "badge-status demo" : "badge-status conectado";
            adicionarLinhaTerminal(">>> Medição retomada.");
        }
    });
}

async function conectarPortaSerial() {
    if (modoDemoAtivo) pararModoDemo();

    if (!("serial" in navigator)) {
        statusConexao.textContent = "❌ Navegador Incompatível (Use Chrome ou Edge)";
        statusConexao.className = "badge-status desconectado";
        adicionarLinhaTerminal("ERRO: Este navegador não suporta a Web Serial API.");
        return;
    }

    try {
        statusConexao.textContent = "🟡 Selecionando porta...";
        statusConexao.className = "badge-status demo";

        portaSerial = await navigator.serial.requestPort();
        await portaSerial.open({ baudRate: 9600 });

        medicaoPausada = false;
        if (btnPausar) {
            btnPausar.textContent = "⏸️ Pausar Medição";
            btnPausar.classList.remove("pausado");
        }

        statusConexao.textContent = "🟢 Conectado ao Piranômetro";
        statusConexao.className = "badge-status conectado";
        adicionarLinhaTerminal(">>> Conexão serial estabelecida a 9600 baud.");

        const decoder = new TextDecoderStream();
        portaSerial.readable.pipeTo(decoder.writable);
        leitorSerial = decoder.readable.getReader();

        let bufferTexto = "";

        while (true) {
            const { value, done } = await leitorSerial.read();
            if (done) {
                leitorSerial.releaseLock();
                break;
            }
            if (value) {
                bufferTexto += value;
                const linhas = bufferTexto.split("\n");
                bufferTexto = linhas.pop();

                for (const linha of linhas) {
                    processarMedicao(linha);
                }
            }
        }
    } catch (erro) {
        statusConexao.textContent = "🔴 Falha / Desconectado";
        statusConexao.className = "badge-status desconectado";
        adicionarLinhaTerminal("ERRO: " + erro.message);
    }
}

function processarMedicao(linha) {
    if (medicaoPausada) return;

    const textoLimpo = linha.replace(/[\r\n\x00-\x1F\x7F]/g, "").trim();
    if (!textoLimpo) return;

    adicionarLinhaTerminal(textoLimpo);

    // 1. Formato Padrão ("LAMPADA, 650.0")
    if (textoLimpo.includes(",")) {
        const partes = textoLimpo.split(",");
        if (partes.length === 2) {
            const valor = parseFloat(partes[1].trim());
            if (!isNaN(valor)) {
                if (valorLampada) valorLampada.textContent = valor.toFixed(1);
                atualizarDadosGrafico(valor);
            }
        }
        return;
    }

    // 2. Formato Atual do Arduino ("Leitura ADC: 928 | Tensao: 4.54 V")
    if (textoLimpo.includes("Tensao:")) {
        const matchTensao = textoLimpo.match(/Tensao:\s*([0-9.]+)/i);
        if (matchTensao && matchTensao[1]) {
            const tensao = parseFloat(matchTensao[1]);
            if (!isNaN(tensao)) {
                const irradianciaCalculada = Number((tensao * 200.0).toFixed(1));
                if (valorLampada) valorLampada.textContent = irradianciaCalculada.toFixed(1);
                atualizarDadosGrafico(irradianciaCalculada);
            }
        }
    }
}

function adicionarLinhaTerminal(texto) {
    if (!serialOutput) return;
    const p = document.createElement("div");
    p.textContent = texto;
    serialOutput.appendChild(p);
    serialOutput.scrollTop = serialOutput.scrollHeight;

    if (serialOutput.children.length > 50) {
        serialOutput.removeChild(serialOutput.firstChild);
    }
}

// 3. MODO DEMONSTRAÇÃO (SIMULAÇÃO SEM HARDWARE)
function alternarModoDemo() {
    modoDemoAtivo ? pararModoDemo() : iniciarModoDemo();
}

function iniciarModoDemo() {
    modoDemoAtivo = true;
    medicaoPausada = false;
    btnDemo.textContent = "⏹️ Parar Modo Demo";
    if (btnPausar) {
        btnPausar.textContent = "⏸️ Pausar Medição";
        btnPausar.classList.remove("pausado");
    }
    statusConexao.textContent = "🟡 Modo Demo Ativo";
    statusConexao.className = "badge-status demo";
    serialOutput.innerHTML = "";
    adicionarLinhaTerminal(">>> Modo de simulação ativado.");

    intervaloDemo = setInterval(() => {
        if (medicaoPausada) return;
        const valLamp = (600 + Math.random() * 80).toFixed(1);
        processarMedicao(`LAMPADA, ${valLamp}`);
    }, 2000);
}

function pararModoDemo() {
    modoDemoAtivo = false;
    medicaoPausada = false;
    if (intervaloDemo) clearInterval(intervaloDemo);
    btnDemo.textContent = "🎮 Ativar Modo Demo";
    if (btnPausar) {
        btnPausar.textContent = "⏸️ Pausar Medição";
        btnPausar.classList.remove("pausado");
    }
    statusConexao.textContent = "🔴 Desconectado";
    statusConexao.className = "badge-status desconectado";
    adicionarLinhaTerminal(">>> Modo demo finalizado.");
}

function copiarCodigo() {
    const codeBlock = document.getElementById("codeBlock");
    if (!codeBlock) return;
    navigator.clipboard.writeText(codeBlock.innerText).then(() => {
        alert("Código C/C++ copiado para a área de transferência!");
    });
}

// 4. MODAL DOS COMPONENTES E GUIA PINOUT
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

const dadosPinout = {
    arduino: {
        badge: "Microcontrolador",
        titulo: "Arduino Uno R3",
        descricao: "Placa principal de processamento. Executa o conversor Analógico-Digital (ADC) de 10 bits no pino A0, convertendo a tensão recebida (0V a 5V) em um valor numérico de 0 a 1023 para transmissão via porta serial.",
        specs: ["⚡ <strong>Alimentação:</strong> USB 5V ou Vin 7-12V", "📊 <strong>Resolução ADC:</strong> 10 bits (4,88 mV por divisão)", "📡 <strong>Comunicação:</strong> Serial UART (Baudrate 9600 bps)"]
    },
    ldr: {
        badge: "Sensor Fotosensível",
        titulo: "Fotoresistor LDR GL5528",
        descricao: "Componente semicondutor de Sulfeto de Cádmio (CdS). Sua resistência diminui exponencialmente à medida que a iluminação aumenta (de ~1 MΩ no escuro até ~15 kΩ a 10 Lux).",
        specs: ["☀️ <strong>Faixa de Trabalho:</strong> 0 a 1000 Lux", "⚡ <strong>Conexão:</strong> Ligado entre VCC (+5V) e a saída do divisor (Pino A0)", "💡 <strong>Função:</strong> Variador de resistência proporcional à luz"]
    },
    resistor: {
        badge: "Carga Fixa",
        titulo: "Resistor de Carga (100 kΩ)",
        descricao: "Resistor fixo dimensionado por meio da média geométrica entre os extremos de resistência do LDR. Garante a máxima sensibilidade de saída no divisor de tensão e impede a saturação precoce do sinal.",
        specs: ["📐 <strong>Valor Nominal:</strong> 100 kΩ (1/4 W)", "⚡ <strong>Conexão:</strong> Ligado entre a saída do divisor (Pino A0) e o GND (0V)", "🎯 <strong>Cálculo:</strong> R = √(R_escuro × R_10Lux)"]
    },
    vcc: {
        badge: "Alimentação 5V",
        titulo: "Barramento VCC (+5V)",
        descricao: "Pino de saída de alimentação contínua de +5 Volts do Arduino. Fornece a tensão de referência fixa (VCC) para o topo da malha do divisor de tensão.",
        specs: ["⚡ <strong>Tensão:</strong> +5,0 V DC (estabilizada)", "🔗 <strong>Ligação:</strong> Conectado diretamente a um dos terminais do LDR"]
    },
    a0: {
        badge: "Entrada Analógica",
        titulo: "Pino Analógico A0 (Vout)",
        descricao: "Nó central do divisor de tensão situado entre o LDR e o Resistor de 100 kΩ. A tensão neste ponto varia continuamente entre 0,45V e 4,86V conforme a irradiância incidente.",
        specs: ["📉 <strong>Fórmula de Tensão:</strong> Vout = VCC × (R / (RLDR + R))", "📊 <strong>Leitura ADC:</strong> Convertido internamente de 0 a 1023"]
    },
    gnd: {
        badge: "Referência 0V",
        titulo: "Barramento GND (Terra)",
        descricao: "Pino de referência comum de zero Volts (0V). Fecha o circuito elétrico conectando a base do resistor de carga fixo ao terra do barramento.",
        specs: ["⚡ <strong>Potencial:</strong> 0 Volts", "🔗 <strong>Ligação:</strong> Conectado à perna inferior do resistor de 100 kΩ"]
    }
};

function mostrarInfoPino(pinoId) {
    const dados = dadosPinout[pinoId];
    if (!dados) return;

    const botoes = document.querySelectorAll(".btn-pinout");
    botoes.forEach(btn => btn.classList.remove("active"));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add("active");
    }

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

    const cardInfo = document.getElementById("cardInfoPinout");
    cardInfo.style.borderColor = "var(--accent-green)";
    setTimeout(() => {
        cardInfo.style.borderColor = "var(--border-color)";
    }, 300);
}
