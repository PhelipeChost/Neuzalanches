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
export async function enviarMensagem(telefone, texto) {
  if (!telefone) return false;
  try {
    const numero = String(telefone).replace(/\D/g, '');
    if (numero.length < 10) {
      console.error(`[WhatsApp] Telefone inválido: ${telefone}`);
      return false;
    }
    const numeroCompleto = numero.startsWith('55') ? numero : `55${numero}`;

    const evo = evolutionCfg();
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
