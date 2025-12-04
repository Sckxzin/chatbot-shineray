const qrcode = require('qrcode-terminal');
const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
  headless: false, // deixa visível para login
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--ignore-certificate-errors'
  ]
}
});
['Midias', 'backups', 'logs'].forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

// === Estruturas ===
const SESSOES = new Map();
const FILAS = new Map();

let MONITOR_NUMBER = null;
const GESTOR_NUMBER = "5581985206212@c.us";
const delay = ms => new Promise(res => setTimeout(res, ms));

// === Configurações de horário ===
const HORARIO_ABERTURA = 8;
const HORARIO_FECHAMENTO = 18;

const MSG_AUSENCIA = `🏍️ *Shineray RIBEIRÃO*\n
Nosso horário de atendimento é de *segunda a sexta das 08h às 18h*
e *sábado das 08h às 12h*.

Recebemos sua mensagem e entraremos em contato assim que possível!`;

const MSG_ABERTURA = `☀️ *Bom dia!*
A *Shineray RIBEIRÃO* abriu e já estamos prontos pra te atender! 🚀`;

function dentroDoHorarioComercial() {
  const agora = new Date();
  const hora = agora.getHours();
  const dia = agora.getDay();
  if (dia === 0) return false;
  if (dia === 6) return hora >= HORARIO_ABERTURA && hora < 12;
  return hora >= HORARIO_ABERTURA && hora < HORARIO_FECHAMENTO;
}

// === outras configurações ===
const EXPIRACAO_MINUTOS = 30;

// === Arquivos ===
const ARQUIVOS = {
  catalogo: './Midias/catalogo.jpg',
  JEF150: './Midias/JEF150.jpg',
  JET50: './Midias/JET50.jpg',
  STORM200: './Midias/STORM200.jpg',
  JET125SS: './Midias/JET125SS.jpg',
  ATV200: './Midias/ATV200.jpg',
  SHI175EFI: './Midias/SHI175EFI.jpg'
};

// === Menu ===
const MENU_TEXT = `📋 *MENU PRINCIPAL*\n
1️⃣ Sobre nós
2️⃣ Catálogo
3️⃣ Métodos de pagamento
4️⃣ Simular financiamento
5️⃣ Outros assuntos

Responda com o número ou nome da opção.`;

// === Descrições ===
const SOBRE_NOS = `🏍️ *Shineray RIBEIRÃO*\n
Paixão por duas rodas! Oferecemos motos com excelente custo-benefício, tecnologia e assistência dedicada.`;

// === Modelos ===
const MODELOS = [
  { id: '1', key: 'JEF150', nome: 'JEF 150' },
  { id: '2', key: 'JET50', nome: 'JET 50' },
  { id: '3', key: 'STORM200', nome: 'STORM 200' },
  { id: '4', key: 'JET125SS', nome: 'JET 125 SS' },
  { id: '5', key: 'ATV200', nome: 'ATV 200' },
  { id: '6', key: 'SHI175EFI', nome: 'SHI 175 EFI' }
];

const DESCRICOES = {
  SHI175EFI: `🛵 *SHI 175 EFI*\n\nInjeção eletrônica\nEntrada USB\nFreio a disco\nPainel digital completo`,
  STORM200: `🔥 *STORM 200*\n\nFreio ABS\nInjeção Eletrônica\nCabo USB`,
  ATV200: `🛞 *ATV 200*\n\nQuadriciclo automático\nPainel digital\nTanque 5L`,
  JET125SS: `🏍️ *JET 125 SS*\n\nPainel digital\nPartida elétrica/pedal`,
  JEF150: `⚡ *JEF 150*\n\nCabo USB\nPainel digital`,
  JET50: `💨 *JET 50*\n\nCompacta\nÁgil\nEconômica`
};

// === AUXILIARES ===
function isUserChat(msg) {
  return msg.from && msg.from.endsWith('@c.us');
}

function somenteDigitos(s) {
  return (s || '').replace(/\D/g, '');
}

function getModelByText(text) {
  const t = (text || '').toLowerCase();
  const byId = MODELOS.find(m => m.id === somenteDigitos(t));
  if (byId) return byId;

  return MODELOS.find(m =>
    t.includes(m.nome.toLowerCase()) ||
    t.includes(m.key.toLowerCase())
  );
}

async function enviarMidiaIfExists(dest, caminho, caption = '') {
  try {
    const media = MessageMedia.fromFilePath(caminho);
    await client.sendMessage(dest, media, { caption });
  } catch {
    await client.sendMessage(dest, caption);
  }
}

async function sendWithPause(dest, msgs, delayMs = 600) {
  for (const m of msgs) {
    await client.sendMessage(dest, m);
    await delay(delayMs);
  }
}
// === SESSÕES ===
function atualizarSessao(from, update) {
  const atual = SESSOES.get(from) || { step: 'MENU', dados: {} };
  SESSOES.set(from, { ...atual, ...update, timestamp: Date.now() });
}

// === LIMPAR SESSÕES ANTIGAS ===
function limparSessoesAntigas() {
  const agora = Date.now();
  for (const [num, sess] of SESSOES.entries()) {
    if (agora - sess.timestamp > EXPIRACAO_MINUTOS * 60000) {
      SESSOES.delete(num);
    }
  }
}
setInterval(limparSessoesAntigas, 300000);

// === Verificar duplicidade de leads ===
function clienteJaMandouProposta(from) {
  try {
    const file = path.join(__dirname, 'leads.txt');
    if (!fs.existsSync(file)) return false;

    const txt = fs.readFileSync(file, 'utf8');
    const hoje = new Date().toLocaleDateString('pt-BR');
    return txt.includes(from.replace('@c.us','')) && txt.includes(hoje);

  } catch { return false; }
}

// === QR CODE ===
client.on('qr', qr => qrcode.generate(qr, { small: true }));

// === Cliente pronto ===
client.on('ready', () => {
  console.log('✅ WhatsApp conectado.');

  try {
    const me = client.info && (client.info.me || client.info.wid);
    const user = me && (me.user || me._serialized) ? (me.user || me._serialized) : null;

    if (user) MONITOR_NUMBER = `${user}@c.us`;
    console.log('📱 Número monitor definido como:', MONITOR_NUMBER);

  } catch {
    console.warn('⚠️ Não foi possível definir MONITOR_NUMBER automaticamente.');
  }
});

// === Fila para evitar conflitos ===
async function processarMensagem(from, handler) {
  const anterior = FILAS.get(from) || Promise.resolve();
  const proxima = anterior.finally(() => handler());
  FILAS.set(from, proxima);
}

// =======================================================
// 🔥 COMANDO DO ATENDENTE: PARAR / REATIVAR
// =======================================================
client.on('message_create', async (msg) => {
  try {
    if (!msg.fromMe) return;

    const texto = (msg.body || '').trim().toLowerCase();

    // ——— PAUSAR ———
    if (texto === 'parar' && msg.to && msg.to.endsWith('@c.us')) {
      const destino = msg.to;
      const sess = SESSOES.get(destino) || { dados: {} };

      SESSOES.set(destino, {
        step: 'HUMANO',
        dados: sess.dados,
        timestamp: Date.now()
      });

      console.log(`⛔ Bot PAUSADO para ${destino}`);

      if (MONITOR_NUMBER) {
        await client.sendMessage(
          MONITOR_NUMBER,
          `🛑 BOT PAUSADO pelo atendente\nCliente: ${destino}`
        );
      }
      return;
    }

    // ——— REATIVAR ———
    if (texto === 'reativar' && msg.to && msg.to.endsWith('@c.us')) {
      const destino = msg.to;
''
      SESSOES.set(destino, {
        step: 'MENU',
        dados: {},
        timestamp: Date.now()
      });

      console.log(`✅ Bot REATIVADO para ${destino}`);

      await client.sendMessage(destino, "🤖 Atendimento automático reativado!");
      await client.sendMessage(destino, MENU_TEXT);
      return;
    }

  } catch (err) {
    console.error("❌ Erro no comando PARAR/REATIVAR:", err.message);
  }
});


// =======================================================
// 🟢 COMANDOS DO ATENDENTE: APROVADO / REPROVADO
// =======================================================
client.on('message_create', async (msg) => {
  try {
    if (!msg.fromMe) return;

    const texto = (msg.body || '').trim().toLowerCase();

    // --- APROVADO ---
    if (texto === 'aprovado' && msg.to && msg.to.endsWith('@c.us')) {
      const destino = msg.to;

      await client.sendMessage(destino,
        "🎉 *Parabéns!* Sua análise foi *APROVADA*! Em instantes daremos continuidade ao atendimento 🚀"
      );

      salvarStatusLead(destino, "APROVADO");

      if (MONITOR_NUMBER) {
        await client.sendMessage(
          MONITOR_NUMBER,
          `🟢 CLIENTE APROVADO\n📞 ${destino.replace('@c.us','')}`
        );
      }

      console.log(`🟢 Status APROVADO enviado para ${destino}`);
      return;
    }

    // --- REPROVADO ---
    if (texto === 'reprovado' && msg.to && msg.to.endsWith('@c.us')) {
      const destino = msg.to;

      await client.sendMessage(destino,
        "❌ Sua análise *não foi aprovada*. Caso deseje tentar novamente, estou à disposição!"
      );

      salvarStatusLead(destino, "REPROVADO");

      if (MONITOR_NUMBER) {
        await client.sendMessage(
          MONITOR_NUMBER,
          `🔴 CLIENTE REPROVADO\n📞 ${destino.replace('@c.us','')}`
        );
      }

      console.log(`🔴 Status REPROVADO enviado para ${destino}`);
      return;
    }

  } catch (err) {
    console.error("❌ Erro comando APROVADO/REPROVADO:", err.message);
  }
});

// =======================================================
// 📢 DETECÇÃO AUTOMÁTICA DE ANÚNCIO (Instagram/Facebook)
// =======================================================
client.on('message', async msg => {

  if (msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;

  const texto = (msg.body || '').toLowerCase();

  const palavrasAnuncio = [
    'como podemos ajudar','como podemos te ajudar','em que posso ajudar',
    'anúncio','anuncio','vi o anúncio','vim pelo anuncio','quero saber mais',
    'interesse na moto','gostei da moto','enviar mensagem','oi! vi o anúncio'
  ];

  const veioDoAnuncio = palavrasAnuncio.some(p => texto.includes(p));

  if (veioDoAnuncio) {

    atualizarSessao(msg.from, { step: 'MENU', dados: {} });

    const contact = await msg.getContact();
    const nomeContato = (contact.pushname || 'cliente').split(' ')[0];

    // Fora do horário
    if (!dentroDoHorarioComercial()) {
      await client.sendMessage(msg.from, MSG_AUSENCIA);
      return;
    }

    // Mensagem de boas-vindas
    await sendWithPause(msg.from, [
      `Olá ${nomeContato}! 👋 Sou o *EDUARDO*, atendente virtual da Shineray RIBEIRÃO.`,
      `Seja bem-vindo(a)! 🚀`,
      MENU_TEXT
    ]);

    console.log(`📢 Fluxo iniciado via anúncio (${nomeContato})`);
  }
});


// =======================================================
// 📸 TRATAMENTO DE MÍDIAS (FOTO/ÁUDIO/DOCUMENTO)
// =======================================================
client.on('message', async msg => {

  if (msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;
  if (!msg.hasMedia) return;

  // NÃO RESPONDER NADA SE O BOT ESTIVER EM HUMANO
  const sess = SESSOES.get(msg.from);
  if (sess && sess.step === 'HUMANO') {
    console.log("📵 Mídia recebida mas bot está em HUMANO → ignorado.");
    return;
  }

  try {
    const media = await msg.downloadMedia();
    const contact = await msg.getContact();
    const nome = (contact.pushname || 'cliente').split(' ')[0];
    const link = `https://wa.me/${msg.from.replace('@c.us','')}`;

    // Mensagem automática ao cliente
    await client.sendMessage(
      msg.from,
      `📨 *${nome}*, recebemos sua mídia! Ela será analisada pela nossa equipe.`
    );

    // Enviar ao atendente
    if (MONITOR_NUMBER) {
      await client.sendMessage(
        MONITOR_NUMBER,
        `📩 Mídia recebida de ${nome}\n📞 ${link}`
      );

      await client.sendMessage(MONITOR_NUMBER, media, {
        caption: `🖼️ Arquivo enviado por ${nome}`
      });
    }

    // === NOVO ===
    // Depois de mídia → entrar automaticamente em HUMANO
    SESSOES.set(msg.from, {
      step: 'HUMANO',
      dados: sess ? sess.dados : {},
      timestamp: Date.now()
    });

    console.log("📸 Mídia recebida e bot desativado até atendente assumir.");

  } catch (err) {
    console.error("❌ Erro ao processar mídia:", err.message);
  }
});


// =======================================================
// 🔒 BLOQUEIO DO BOT QUANDO O HUMANO ASSUMIU
// =======================================================
client.on('message', async msg => {
    // Bloquear bot para contatos com etiquetas
   try {
    const chat = await msg.getChat();
    if (chat.labels && chat.labels.length > 0) {
      SESSOES.set(msg.from, { step: 'HUMANO' });
      console.log(`🎯 Etiqueta detectada → Bot desligado para ${msg.from}`);
      return;
    }
  } catch (err) {
    console.error("Erro ao verificar etiquetas:", err.message);
  }


  if (msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;

  const sess = SESSOES.get(msg.from);

  // Se humano assumiu → bot NÃO responde absolutamente nada
  if (sess && sess.step === 'HUMANO') {
    console.log(`⛔ Chat com atendente: ${msg.from} → bot desligado`);
    return;
  }

  
  // Ignorar mídias — já tratadas acima
  if (msg.hasMedia) return;

  // Enviar para a fila
  processarMensagem(msg.from, () => tratarMensagem(msg));
});
// =======================================================
// 🤖 LÓGICA PRINCIPAL DO BOT
// =======================================================
async function tratarMensagem(msg) {
  try {
    if (!isUserChat(msg)) return;
    if (msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;

    // ▬▬▬▬▬▬▬▬▬▬▬▬ HORÁRIO FECHADO ▬▬▬▬▬▬▬▬▬▬▬▬
    if (!dentroDoHorarioComercial()) {

      const from = msg.from;
      const ultima = SESSOES.get(from);
      const hoje = new Date().toDateString();

      // Envia aviso 1 vez por dia
      if (!ultima || ultima.ultimaMensagemAusencia !== hoje) {
        await client.sendMessage(from, MSG_AUSENCIA);
        SESSOES.set(from, { step: 'HUMANO', ultimaMensagemAusencia: hoje });
      }
      return;
    }

    // ▬▬▬▬▬▬▬▬▬▬▬▬ VARIÁVEIS ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
    const textoRaw = (msg.body || '').trim();
    const texto = textoRaw.toLowerCase();
    const from = msg.from;

    const contact = await msg.getContact();
    const nomeContato = (contact.pushname || 'cliente').split(' ')[0];

    let sess = SESSOES.get(from) || { step: 'MENU', dados: {} };

    // ▬▬▬▬▬▬▬▬▬▬▬▬ CHECAR PROPOSTA DO DIA ▬▬▬▬▬▬▬▬▬▬▬▬
    if (clienteJaMandouProposta(from) && sess.step !== 'JA_PROPOSTA') {
      await sendWithPause(from, [
        `📋 *${nomeContato}*, percebi que você já fez uma simulação hoje.`,
        `O que deseja agora?`,
        `1️⃣ Falar com atendente`,
        `2️⃣ Fazer nova simulação`
      ]);
      atualizarSessao(from, { step: 'JA_PROPOSTA', dados: sess.dados });
      return;
    }

    // ▬▬▬▬▬▬▬▬▬▬▬▬ SAUDAÇÕES ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
    if (texto.match(/^(menu|oi|olá|ola|bom dia|boa tarde|boa noite|inicio|start|help)/i)) {
      atualizarSessao(from, { step: 'MENU', dados: {} });

      await sendWithPause(from, [
        `Olá ${nomeContato}! 👋 Sou o *EDUARDO*, atendente virtual da Shineray RIBEIRÃO.`,
        MENU_TEXT
      ]);
      return;
    }

    if (texto === "menu") {
      atualizarSessao(from, { step: "MENU", dados: {} });
      await client.sendMessage(from, MENU_TEXT);
      return;
    }

    // ============================================================
    // 🟣 ROTAS DO FLUXO
    // ============================================================
    switch (sess.step) {

      // ============================================================
      // 0 — JA_PROPOSTA
      // ============================================================
      case 'JA_PROPOSTA': {

        if (texto === '1' || texto.includes('atendente')) {

          await client.sendMessage(from, "👩‍💼 Certo! Um atendente vai te chamar.");

          if (MONITOR_NUMBER) {
            const link = `https://wa.me/${from.replace('@c.us','')}`;
            await client.sendMessage(
              MONITOR_NUMBER,
              `👤 Cliente pedindo atendente:\n${nomeContato}\n${link}`
            );
          }

          atualizarSessao(from, { step: 'HUMANO' });
          return;
        }

        if (texto === '2') {
          await client.sendMessage(from, "🏍️ Ok! Envie o modelo desejado.");
          atualizarSessao(from, { step: 'ESCOLHER_MODELO', dados: {} });
          return;
        }

        await client.sendMessage(from, "Responda 1 ou 2.");
        return;
      }

      // ============================================================
      // 1 — MENU
      // ============================================================
      case 'MENU': {

        // === SOBRE NÓS ===
        if (texto === '1' || texto.includes('sobre')) {
          await client.sendMessage(from, SOBRE_NOS);
          return;
        }

        // === CATÁLOGO ===
        if (texto === '2' || texto.includes('catalog')) {

          await enviarMidiaIfExists(
            from,
            ARQUIVOS.catalogo,
            "📘 *Catálogo Shineray RIBEIRÃO*"
          );

          const lista = MODELOS.map(m => `• ${m.id} — ${m.nome}`).join("\n");

          await sendWithPause(from, [
            `Escolha um modelo para ver detalhes:\n\n${lista}`
          ]);

          atualizarSessao(from, { step: 'CATALOGO' });
          return;
        }

        // === MÉTODOS DE PAGAMENTO ===
        if (texto === '3' || texto.includes('pagamento')) {

          await sendWithPause(from, [
            `💳 *Formas de pagamento:*`,
            `1️⃣ Simular financiamento`,
            `2️⃣ À vista (encaminhar atendente)`
          ]);

          atualizarSessao(from, { step: 'ESCOLHER_TIPO_PAGAMENTO' });
          return;
        }

        // === SIMULAR FINANCIAMENTO ===
        if (texto === '4') {
          const lista = MODELOS.map(m => `• ${m.id} — ${m.nome}`).join("\n");

          await sendWithPause(from, [
            "🏍️ Vamos simular!",
            `Escolha um modelo:\n\n${lista}`
          ]);

          atualizarSessao(from, { step: 'ESCOLHER_MODELO' });
          return;
        }

        // === OUTROS ASSUNTOS ===
        if (texto === '5') {

          await client.sendMessage(from, "🔄 Encaminhando para um atendente...");

          if (MONITOR_NUMBER) {
            const link = `https://wa.me/${from.replace('@c.us','')}`;
            await client.sendMessage(
              MONITOR_NUMBER,
              `📞 Cliente quer atendimento\n👤 ${nomeContato}\n${link}`
            );
          }

          atualizarSessao(from, { step: 'HUMANO' });
          return;
        }

        // === Cliente digitou modelo direto ===
        const modeloDireto = getModelByText(texto);

        if (modeloDireto) {

          await enviarMidiaIfExists(
            from,
            ARQUIVOS[modeloDireto.key],
            DESCRICOES[modeloDireto.key]
          );

          await client.sendMessage(
            from,
            "1️⃣ À vista\n2️⃣ Simular financiamento"
          );

          atualizarSessao(from, {
            step: 'ESCOLHER_FORMA',
            dados: { modelo: modeloDireto.nome }
          });

          return;
        }

       // Contabilizar erro do cliente no menu
let erros = (sess.errosMenu || 0) + 1;

if (erros >= 2) {
  await client.sendMessage(from,
    "🤖 Percebi que talvez esteja com dificuldade no menu.\nVou te encaminhar para um *atendente humano* agora."
  );

  if (MONITOR_NUMBER) {
    const link = `https://wa.me/${from.replace('@c.us','')}`;
    await client.sendMessage(
      MONITOR_NUMBER,
      `⚠️ Cliente perdido no MENU\n📞 ${link}\nEncaminhado automaticamente para atendimento humano.`
    );
  }

  atualizarSessao(from, { step: 'HUMANO', errosMenu: 0 });
  return;
}

// Ainda tenta orientar o cliente normalmente (1ª tentativa)
atualizarSessao(from, { errosMenu: erros });
await client.sendMessage(from, "Não entendi. Digite 1–5 ou um modelo.");
return;

      }
      // ============================================================
      // 2 — ESCOLHER TIPO DE PAGAMENTO
      // ============================================================
      case 'ESCOLHER_TIPO_PAGAMENTO': {

        // 1 — SIMULAR FINANCIAMENTO
        if (texto === '1') {

          const lista = MODELOS.map(m => `• ${m.id} — ${m.nome}`).join("\n");

          await client.sendMessage(from, `Escolha o modelo:\n\n${lista}`);

          atualizarSessao(from, { step: 'ESCOLHER_MODELO' });
          return;
        }

        // 2 — À VISTA → encaminha atendente
        if (texto === '2') {

          await client.sendMessage(from, "Certo! Vou te encaminhar para um atendente.");

          if (MONITOR_NUMBER) {
            const link = `https://wa.me/${from.replace('@c.us','')}`;
            await client.sendMessage(
              MONITOR_NUMBER,
              `💸 Cliente quer preço À VISTA\n👤 ${nomeContato}\n${link}`
            );
          }

          atualizarSessao(from, { step: 'HUMANO' });
          return;
        }

        await client.sendMessage(from, "Responda somente:\n1️⃣ Simular\n2️⃣ À vista");
        return;
      }

      // ============================================================
      // 3 — ESCOLHER MODELO (Simulação)
      // ============================================================
      case 'ESCOLHER_MODELO': {

        const modelo = getModelByText(texto);

        if (!modelo) {
          await client.sendMessage(from, "Envie o número ou nome do modelo.");
          return;
        }

        // Envia foto e descrição do modelo
        await enviarMidiaIfExists(from, ARQUIVOS[modelo.key], DESCRICOES[modelo.key]);

        await client.sendMessage(from, "Agora envie seu *CPF* (somente números).");

        atualizarSessao(from, {
          step: 'CPF',
          dados: { modelo: modelo.nome }
        });

        return;
      }

      // ============================================================
      // 4 — CATÁLOGO (Escolhendo modelo dentro do catálogo)
      // ============================================================
      case 'CATALOGO': {

        const modelo = getModelByText(texto);

        if (!modelo) {
          await client.sendMessage(from, "Envie o número ou nome do modelo.");
          return;
        }

        await enviarMidiaIfExists(from, ARQUIVOS[modelo.key], DESCRICOES[modelo.key]);

        await client.sendMessage(from, "Deseja:\n1️⃣ À vista\n2️⃣ Simular financiamento");

        atualizarSessao(from, {
          step: 'ESCOLHER_FORMA',
          dados: { modelo: modelo.nome }
        });

        return;
      }

      // ============================================================
      // 5 — ESCOLHER FORMA (À vista / Simular)
      // ============================================================
      case 'ESCOLHER_FORMA': {

        // 1 — À VISTA → encaminhar atendente
        if (texto === '1') {

          await client.sendMessage(from, "Encaminhando você para um atendente…");

          if (MONITOR_NUMBER) {
            const link = `https://wa.me/${from.replace('@c.us','')}`;
            await client.sendMessage(
              MONITOR_NUMBER,
              `💸 Interesse À VISTA\n👤 ${nomeContato}\nModelo: ${sess.dados.modelo}\n${link}`
            );
          }

          atualizarSessao(from, { step: 'HUMANO' });
          return;
        }

        // 2 — Simular → pede CPF
        if (texto === '2') {

          await client.sendMessage(from, "Envie seu *CPF* (somente números).");

          atualizarSessao(from, {
            step: 'CPF',
            dados: { modelo: sess.dados.modelo }
          });

          return;
        }

        await client.sendMessage(from, "Responda somente 1 ou 2.");
        return;
      }

      // ============================================================
      // 6 — CPF
      // ============================================================
      case 'CPF': {

        const cpf = somenteDigitos(textoRaw);

        if (!/^\d{11}$/.test(cpf)) {
          await client.sendMessage(from, "CPF inválido. Envie 11 números.");
          return;
        }

        atualizarSessao(from, {
          step: 'NASC',
          dados: { ...sess.dados, cpf }
        });

        await client.sendMessage(from, "Agora envie sua *data de nascimento* (dd/mm/aaaa).");
        return;
      }

      // ============================================================
      // 7 — DATA DE NASCIMENTO
      // ============================================================
      case 'NASC': {

        const d = textoRaw.replace(/\D/g, '');

        if (d.length !== 8) {
          await client.sendMessage(from, "Formato inválido! Use: dd/mm/aaaa");
          return;
        }

        const formatada = `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;

        atualizarSessao(from, {
          step: 'CNH',
          dados: { ...sess.dados, nascimento: formatada }
        });

        await client.sendMessage(from, "Você possui CNH? (sim/não)");
        return;
      }

      // ============================================================
      // 8 — CNH
      // ============================================================
      case 'CNH': {

        let r = null;
        if (texto.startsWith('s')) r = "Sim";
        if (texto.startsWith('n')) r = "Não";

        if (!r) {
          await client.sendMessage(from, "Responda: *sim* ou *não*.");
          return;
        }

        const dados = { ...sess.dados, possuiCNH: r };

        // Encerrar fluxo → passar para atendente
        atualizarSessao(from, { step: 'HUMANO', dados });

        await client.sendMessage(
          from,
          "✅ Dados enviados! Um atendente finalizará sua simulação."
        );

        // ===========================
        // Enviar para o atendente
        // ===========================
        const link = `https://wa.me/${from.replace('@c.us','')}`;

        const mensagem =
          `📩 *Nova simulação recebida!*\n` +
          `👤 ${nomeContato}\n` +
          `📞 ${link}\n` +
          `🏍️ Modelo: ${dados.modelo}\n` +
          `🧾 CPF: ${dados.cpf}\n` +
          `🎂 Nascimento: ${dados.nascimento}\n` +
          `🪪 CNH: ${dados.possuiCNH}\n` +
          `🕒 ${new Date().toLocaleString('pt-BR')}`;

        if (MONITOR_NUMBER) {
          await client.sendMessage(MONITOR_NUMBER, mensagem);
        }

        // ===========================
        // SALVAR LEAD (sem duplicar)
        // ===========================
        try {

          const hoje = new Date().toLocaleDateString('pt-BR');
          const arquivo = path.join(__dirname, "leads.txt");

          const txt = fs.existsSync(arquivo)
            ? fs.readFileSync(arquivo, "utf8")
            : "";

          const duplicado = txt.includes(from) && txt.includes(hoje);

          if (!duplicado) {
            fs.appendFileSync(arquivo, mensagem + "\n---\n", "utf8");
          }

        } catch (err) {
          console.error("Erro ao salvar lead:", err.message);
        }

        return;
      }

      // ============================================================
      // HUMANO — bot não responde
      // ============================================================
      case 'HUMANO':
        return;

      default:
        await client.sendMessage(from, "Digite *menu* para reiniciar.");
        return;
    }

  } catch (err) {
    console.error("❌ Erro no fluxo principal:", err.message);
  }
}
// =======================================================
// 📌 Função para salvar o status (APROVADO / REPROVADO)
// =======================================================
function salvarStatusLead(from, status) {
  try {
    const arquivo = path.join(__dirname, "leads.txt");
    const hoje = new Date().toLocaleDateString('pt-BR');
    const txt = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, "utf8") : "";

    const blocos = txt.split('---').map(b => b.trim()).filter(b => b);
    let novoTxt = "";

    blocos.forEach(bloco => {
      const numero = from.replace('@c.us','');

      if (bloco.includes(numero) && bloco.includes(hoje)) {
        bloco += `\n📌 Status: ${status}\n`;
      }

      novoTxt += bloco + "\n---\n";
    });

    fs.writeFileSync(arquivo, novoTxt, "utf8");

  } catch (err) {
    console.error("❌ Erro ao salvar status:", err.message);
  }
}

// =======================================================
// 🌅 MENSAGEM AUTOMÁTICA DE ABERTURA (todos os dias às 08h)
// =======================================================
setInterval(() => {
  const agora = new Date();
  const h = agora.getHours();
  const m = agora.getMinutes();

  // dispara exatamente às 8:00
  if (h === HORARIO_ABERTURA && m === 0) {

    for (const [num, sess] of SESSOES.entries()) {

      // envia apenas para quem estava fora do horário
      if (sess.step === 'HUMANO' && sess.ultimaMensagemAusencia) {

        client.sendMessage(num, MSG_ABERTURA);
        client.sendMessage(num, MENU_TEXT);

        atualizarSessao(num, {
          step: 'MENU',
          ultimaMensagemAusencia: null
        });
      }
    }
  }
}, 60000); // checa a cada minuto



// =======================================================
// 📊 CHECK-UP AUTOMÁTICO DE LEADS (17h) + BACKUP
// =======================================================
setInterval(async () => {
  try {
    const agora = new Date();
    const h = agora.getHours();
    const m = agora.getMinutes();

    if (h !== 17 || m !== 0 || !MONITOR_NUMBER) return;

    const hojeStr = agora.toLocaleDateString('pt-BR');
    const isoDate = agora.toISOString().slice(0, 10);

    const leadsPath = path.join(__dirname, 'leads.txt');

    const conteudo = fs.existsSync(leadsPath)
      ? fs.readFileSync(leadsPath, 'utf8')
      : '';

    const blocos = conteudo.split('---').map(b => b.trim()).filter(b => b);

    const leadsHoje = blocos.filter(b => b.includes(hojeStr));
    const totalHoje = leadsHoje.length;


    // ------------------------------
    // 📌 Cálculo da semana ISO
    // ------------------------------
    const tmp = new Date(agora.getTime());
    tmp.setHours(0, 0, 0, 0);
    tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));

    const anoInicio = new Date(tmp.getFullYear(), 0, 1);

    const week = Math.ceil((((tmp - anoInicio) / 86400000) + 1) / 7);
    const weekLabel = `${tmp.getFullYear()}-W${String(week).padStart(2, '0')}`;


    // ------------------------------
    // 📁 pasta backups
    // ------------------------------
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);


    // ------------------------------
    // 📌 Se não houver leads
    // ------------------------------
    if (totalHoje === 0) {
      await client.sendMessage(
        MONITOR_NUMBER,
        `📊 *Relatório de Leads — ${hojeStr}*\n\nNenhum lead registrado hoje.`
      );

    } else {

      // ------------------------------
      // 📁 Backup diário
      // ------------------------------
      const dailyFile = path.join(backupDir, `daily_${isoDate}.txt`);

      fs.writeFileSync(
        dailyFile,
        leadsHoje.map(l => l + "\n---\n").join(''),
        'utf8'
      );

      // ------------------------------
      // 📁 Backup semanal
      // ------------------------------
      const weeklyFile = path.join(backupDir, `weekly_${weekLabel}.txt`);

      fs.appendFileSync(
        weeklyFile,
        `\n\n# Dia: ${hojeStr}\n\n` +
        leadsHoje.map(l => l + "\n---\n").join(''),
        'utf8'
      );

      // ------------------------------
      // 🧾 Último lead
      // ------------------------------
      const ultimo = leadsHoje[leadsHoje.length - 1];

      const nome =
        (ultimo.match(/👤 (.+)/) || [])[1] || "Não identificado";

      const modelo =
        (ultimo.match(/🏍️ (.+)/) || [])[1] || "Não informado";

      const horaLead =
        (ultimo.match(/🕒 (.+)/) || [])[1] || "--:--";

      // ------------------------------
      // 📌 Resumo
      // ------------------------------
      const resumo =
        `📊 *Relatório de Leads — ${hojeStr}*\n\n` +
        `Total de leads hoje: *${totalHoje}*\n\n` +
        `📍 Último lead:\n` +
        `👤 ${nome}\n` +
        `🏍️ ${modelo}\n` +
        `🕒 ${horaLead}\n\n` +
        `📁 Backups criados:\n` +
        `• Diário: ${path.basename(dailyFile)}\n` +
        `• Semanal: ${path.basename(weeklyFile)}`;

      await client.sendMessage(GESTOR_NUMBER, resumo);

    }

    // ------------------------------
    // 🔄 Reset diário
    // ------------------------------
    fs.writeFileSync(leadsPath, '', 'utf8');

  } catch (err) {
    console.error("❌ Erro no relatório diário:", err.message);
  }

}, 60000); // roda a cada minuto



// =======================================================
// 📝 SISTEMA DE LOGS
// =======================================================
function registrarLog(msg) {
  const data = new Date();
  const logFile = path.join(
    __dirname,
    'logs',
    `${data.toISOString().slice(0, 10)}.log`
  );

  const linha = `[${data.toLocaleString('pt-BR')}] ${msg}\n`;
  fs.appendFileSync(logFile, linha, 'utf8');
}

client.on('ready',        () => registrarLog("✅ WhatsApp conectado"));
client.on('disconnected', () => registrarLog("⚠️ Cliente desconectado"));
client.on('auth_failure', e => registrarLog("❌ Falha de autenticação: " + e));
client.on('message',      msg => registrarLog(`📩 Mensagem recebida de ${msg.from}`));



// =======================================================
// 🚀 INICIALIZAÇÃO FINAL DO BOT
// =======================================================
client.initialize();
