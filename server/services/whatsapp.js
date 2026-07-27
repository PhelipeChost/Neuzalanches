// ─── WhatsApp via Evolution API ──────────────────────────────────────────────
import { obterConfig } from '../database.js';

// Config da Evolution API: primeiro a config salva no banco (editável na
// seção Configurações da plataforma online), depois env var, depois default.
// Lida a cada chamada — mudar na UI passa a valer sem reiniciar o servidor.
export function evolutionCfg() {
  return {
    url: (obterConfig('evolution_url') || process.env.EVOLUTION_URL || 'http://localhost:8080').replace(/\/+$/, ''),
    key: obterConfig('evolution_key') || process.env.EVOLUTION_KEY || '',
    instance: obterConfig('evolution_instance') || process.env.EVOLUTION_INSTANCE || '',
  };
}

// Identidade do estabelecimento — SEMPRE das Configurações da plataforma
function nomeEstab() {
  return obterConfig('nome_estabelecimento') || 'nosso estabelecimento';
}
function linhaLink(prefixo = '') {
  const link = (obterConfig('link_exibicao') || '').trim();
  return link ? `\n${prefixo}🌐 ${link}` : '';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function primeiroNome(nomeCompleto) {
  if (!nomeCompleto || typeof nomeCompleto !== 'string') return 'Cliente';
  const nome = nomeCompleto.trim().split(/\s+/)[0];
  return nome || 'Cliente';
}

function pedidoCurto(pedido) {
  return `#${String(pedido.id || '').slice(0, 6).toUpperCase()}`;
}

function isRetiradaPedido(pedido) {
  if (pedido.tipo_entrega === 'retirada') return true;
  if (pedido.tipo_entrega === 'entrega') return false;
  // Fallback para pedidos antigos sem tipo_entrega
  return !pedido.endereco_rua;
}

function formatarEndereco(pedido) {
  const partes = [];
  if (pedido.endereco_rua) partes.push(pedido.endereco_rua);
  if (pedido.endereco_numero) partes[partes.length - 1] += `, ${pedido.endereco_numero}`;
  let linha = partes.join('');
  if (pedido.endereco_bairro) linha += linha ? ` — ${pedido.endereco_bairro}` : pedido.endereco_bairro;
  return linha || 'Endereço não informado';
}

function descreverPagamento(pedido) {
  const labels = {
    pix: 'PIX ⚡',
    dinheiro: 'Dinheiro 💵',
    cartao: 'Cartão 💳',
    credito: 'Cartão de Crédito 💳',
    debito: 'Cartão de Débito 💳',
  };
  let texto = labels[pedido.metodo_pagamento] || pedido.metodo_pagamento || 'A combinar';

  if (pedido.metodo_pagamento === 'dinheiro') {
    const troco = Number(pedido.troco_para);
    const total = Number(pedido.total);
    if (troco > 0 && troco > total) {
      texto += ` (troco para ${fmtBRL(troco)} — devolver ${fmtBRL(troco - total)})`;
    } else {
      texto += ' (sem troco)';
    }
  }
  return texto;
}

function listarItens(pedido) {
  if (!pedido.itens || pedido.itens.length === 0) return '';
  return pedido.itens.map(item => {
    const linha = `• ${item.quantidade}x ${item.produto_nome}`;
    const adicionais = (item.adicionais || [])
      .map(a => `   + ${a.nome}${(a.quantidade || 1) > 1 ? ` (${a.quantidade}x)` : ''}`)
      .join('\n');
    return adicionais ? `${linha}\n${adicionais}` : linha;
  }).join('\n');
}

// ─── Envio ───────────────────────────────────────────────────────────────────
// No desktop, o servidor local não tem as credenciais da Evolution (elas só
// existem no banco da nuvem do estabelecimento). Sem instância local
// configurada, repassamos o envio pra nuvem via /api/bot/enviar (mesma rota
// que o n8n já usa como proxy da Evolution) em vez de tentar falar direto
// com a Evolution a partir da máquina do lojista — assim o app desktop nunca
// precisa guardar a chave da Evolution. A URL da nuvem vem de `sync_url`
// (config local, a mesma usada pela sincronização de pedidos/catálogo em
// server/index.js — iniciarSyncPedidos) — é o dado que realmente existe no
// banco do desktop, ao contrário do sync.json (mecanismo separado, não usado
// na prática pelos clientes atuais). VPS_PROXY_URL (env var setada pelo
// desktop/main.js a partir do sync.json) fica como fallback secundário.
function baseProxyNuvem() {
  const syncUrl = (obterConfig('sync_url') || '').trim();
  if (syncUrl) return syncUrl.replace(/\/+$/, '');
  if (process.env.VPS_PROXY_URL) return process.env.VPS_PROXY_URL.replace(/\/+$/, '');
  return '';
}

export async function enviarMensagem(telefone, texto) {
  if (!telefone) return false;
  const numero = String(telefone).replace(/\D/g, '');
  if (numero.length < 10) {
    console.error(`[WhatsApp] Telefone inválido: ${telefone}`);
    return false;
  }
  const numeroCompleto = numero.startsWith('55') ? numero : `55${numero}`;

  const evo = evolutionCfg();
  if (!evo.instance) {
    const base = baseProxyNuvem();
    if (base) return enviarViaProxyNuvem(numeroCompleto, texto, base);
  }

  try {
    const resp = await fetch(`${evo.url}/message/sendText/${evo.instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': evo.key },
      body: JSON.stringify({ number: numeroCompleto, text: texto }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`[WhatsApp] Erro ao enviar para ${numeroCompleto}:`, err);
      return false;
    }

    console.log(`[WhatsApp] Mensagem enviada para ${numeroCompleto}`);
    return true;
  } catch (err) {
    console.error('[WhatsApp] Falha ao conectar na Evolution API:', err.message);
    return false;
  }
}

async function enviarViaProxyNuvem(numeroCompleto, texto, base) {
  try {
    const resp = await fetch(`${base}/api/bot/enviar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: numeroCompleto, text: texto }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error(`[WhatsApp] Erro ao enviar (via nuvem) para ${numeroCompleto}:`, err);
      return false;
    }
    console.log(`[WhatsApp] Mensagem enviada (via nuvem) para ${numeroCompleto}`);
    return true;
  } catch (err) {
    console.error('[WhatsApp] Falha ao repassar envio pra nuvem:', err.message);
    return false;
  }
}

// Bloco de instruções de Pix — só quando forma de pagamento é Pix e a chave
// está configurada. Mostra a chave copiável e o nome do recebedor.
function blocoPix(pedido) {
  if (pedido.metodo_pagamento !== 'pix') return '';
  const chave = (obterConfig('pix_key') || '').trim();
  if (!chave) return '';
  const nomeRec = (obterConfig('pix_nome') || obterConfig('nome_estabelecimento') || '').trim();
  return (
    `\n\n💠 *Pague pelo Pix — copie a chave abaixo:*\n` +
    `\`${chave}\`\n` +
    (nomeRec ? `_Recebedor:_ ${nomeRec}\n` : '') +
    `\n_Envie o comprovante por aqui pra confirmarmos o pedido._ 🙏`
  );
}

// ─── Mensagem 1: Pedido recebido (status pendente) ───────────────────────────
export async function notificarPedidoConfirmado(pedido) {
  if (!pedido.cliente_telefone) return;

  const nome = primeiroNome(pedido.cliente_nome);
  const codigo = pedidoCurto(pedido);
  const itens = listarItens(pedido);
  const isRetirada = isRetiradaPedido(pedido);
  const pagamento = descreverPagamento(pedido);

  const linhaEntrega = isRetirada
    ? '🏪 *Retirada no estabelecimento*'
    : `🏠 *Entrega:* ${formatarEndereco(pedido)}`;

  const texto =
    `✅ *Pedido recebido, ${nome}!*\n` +
    `📋 ${codigo} — *${nomeEstab()}*\n` +
    `\n` +
    (itens ? `*Itens:*\n${itens}\n\n` : '') +
    `💰 *Total:* ${fmtBRL(pedido.total)}\n` +
    `💳 *Pagamento:* ${pagamento}\n` +
    `${linhaEntrega}` +
    blocoPix(pedido) +
    (linhaLink() ? `\n\n_Acompanhe seu pedido em:_${linhaLink()}` : '');

  await enviarMensagem(pedido.cliente_telefone, texto);
}

// ─── Mensagens 2+: Atualizações de status ────────────────────────────────────
export async function notificarStatusPedido(pedido, status) {
  if (!pedido.cliente_telefone) return;

  const nome = primeiroNome(pedido.cliente_nome);
  const codigo = pedidoCurto(pedido);
  const isRetirada = isRetiradaPedido(pedido);

  const mensagens = {
    // 'confirmado' não envia mensagem — cliente já recebeu "Pedido recebido"
    // ao criar (status pendente). Confirmar só atualiza estado interno.
    confirmado: null,

    preparando:
      `🍳 *${nome}*, seu pedido ${codigo} já está *na chapa!* 🔥\n` +
      `\n` +
      `Estamos preparando tudo com carinho — em breve fica pronto.`,

    pronto: isRetirada
      ? `✅ *${nome}*, seu pedido ${codigo} está *pronto pra retirada!* 🎉\n` +
        `\n` +
        `🏪 Pode vir buscar no estabelecimento. Te esperamos!`
      : `✅ *${nome}*, seu pedido ${codigo} está *pronto* e já está *saindo para entrega!* 🛵💨\n` +
        `\n` +
        `Em instantes chega aí.`,

    entregue:
      `🎉 *Pedido entregue!*\n` +
      `\n` +
      `Obrigado pela preferência, *${nome}*! ❤️\n` +
      `\n` +
      `A *${nomeEstab()}* espera que tenha gostado. Volte sempre! 🍔` +
      linhaLink('\n'),

    cancelado:
      `❌ *${nome}*, infelizmente seu pedido ${codigo} foi *cancelado*.\n` +
      `\n` +
      `Se ficou alguma dúvida, é só responder esta mensagem que te ajudamos.` +
      linhaLink('\n'),
  };

  const texto = mensagens[status];
  if (texto) {
    await enviarMensagem(pedido.cliente_telefone, texto);
  }
}

// ─── Venda por peso: notifica o cliente do ajuste de peso da peça ────────────
// Duas modalidades: AVISO (dentro da tolerância — segue o pedido) e ESPERA
// (fora da tolerância — o pedido está travado esperando resposta do cliente).
const fmtKg = (kg) => Number(kg || 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export async function notificarPesoAjustado(pedido, ajuste) {
  if (!pedido?.cliente_telefone) return;
  const nome = primeiroNome(pedido.cliente_nome);
  const codigo = pedidoCurto(pedido);
  const produto = ajuste.item?.produto_nome || "seu produto";
  const desejado = fmtKg(ajuste.peso_desejado_kg);
  const real = fmtKg(ajuste.peso_real_kg);
  const diferencaPct = Math.round((ajuste.diferenca_pct || 0) * 100);
  const ehAjuste = !!ajuste.eh_ajuste; // já tinha sido pesado antes — isso é uma correção do lojista

  if (ajuste.dentro_tolerancia) {
    // Reajuste que destrava um pedido que estava preso esperando confirmação
    // (o lojista corrigiu o peso e agora está dentro da tolerância de novo).
    if (ehAjuste && ajuste.novo_status === "confirmado") {
      const texto =
        `⚖️ *${nome}*, atualização do pedido ${codigo}\n` +
        `\n` +
        `Reajustamos o peso da peça de *${produto}* — agora está em *${real} kg* (você pediu ${desejado} kg).\n` +
        `\n` +
        `💰 Novo total: *${fmtBRL(ajuste.total_novo)}* (era ${fmtBRL(ajuste.total_anterior)}).\n` +
        `\n` +
        `✅ Seu pedido está liberado e seguimos com o preparo — qualquer coisa, é só responder aqui.` +
        linhaLink('\n');
      await enviarMensagem(pedido.cliente_telefone, texto);
      return;
    }
    // Aviso simples: peso corrigido, pedido já seguia normalmente e continua.
    const texto = ehAjuste
      ? `⚖️ *${nome}*, aviso do pedido ${codigo}\n` +
        `\n` +
        `O peso da peça de *${produto}* foi reajustado — o disponível agora é *${real} kg* (você pediu ${desejado} kg).\n` +
        `\n` +
        `💰 Novo total: *${fmtBRL(ajuste.total_novo)}* (era ${fmtBRL(ajuste.total_anterior)}).\n` +
        `\n` +
        `Seguimos com o preparo normalmente — qualquer coisa, é só responder aqui.` +
        linhaLink('\n')
      : `⚖️ *${nome}*, atualização do pedido ${codigo}\n` +
        `\n` +
        `A peça de *${produto}* ficou em *${real} kg* (você pediu ${desejado} kg).\n` +
        `\n` +
        `💰 Novo total: *${fmtBRL(ajuste.total_novo)}* (era ${fmtBRL(ajuste.total_anterior)}).\n` +
        `\n` +
        `Estamos seguindo com o preparo — qualquer coisa, é só responder aqui.` +
        linhaLink('\n');
    await enviarMensagem(pedido.cliente_telefone, texto);
    return;
  }

  const texto = ehAjuste
    ? `⚖️ *${nome}*, reajuste no pedido ${codigo}\n` +
      `\n` +
      `O peso da peça de *${produto}* foi reajustado — o disponível agora é *${real} kg* (você pediu ${desejado} kg — diferença de ${diferencaPct}%).\n` +
      `\n` +
      `💰 Novo total: *${fmtBRL(ajuste.total_novo)}* (era ${fmtBRL(ajuste.total_anterior)}).\n` +
      `\n` +
      `Podemos seguir com esse peso? Responda *sim* pra confirmar ou *não* pra cancelar. Seu pedido está *aguardando sua resposta* pra continuar.` +
      linhaLink('\n')
    : `⚖️ *${nome}*, precisamos da sua confirmação no pedido ${codigo}\n` +
      `\n` +
      `A peça de *${produto}* disponível ficou em *${real} kg* (você pediu ${desejado} kg — diferença de ${diferencaPct}%).\n` +
      `\n` +
      `💰 Novo total: *${fmtBRL(ajuste.total_novo)}* (era ${fmtBRL(ajuste.total_anterior)}).\n` +
      `\n` +
      `Podemos seguir com esse ajuste? Responda *sim* pra confirmar ou *não* pra cancelar. Seu pedido está *aguardando sua resposta* pra continuar.` +
      linhaLink('\n');
  await enviarMensagem(pedido.cliente_telefone, texto);
}
