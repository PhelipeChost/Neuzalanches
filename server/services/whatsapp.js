// ─── WhatsApp via Evolution API ──────────────────────────────────────────────
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'http://localhost:8080';
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'neuzalanches-secret-key-2024';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'neuzalanches';

async function enviarMensagem(telefone, texto) {
  try {
    const numero = telefone.replace(/\D/g, '');
    const numeroCompleto = numero.startsWith('55') ? numero : `55${numero}`;

    const resp = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_KEY,
      },
      body: JSON.stringify({
        number: numeroCompleto,
        text: texto,
      }),
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

export async function notificarPedidoConfirmado(pedido) {
  if (!pedido.cliente_telefone) return;

  let metodoPag = {
    pix: 'PIX ⚡',
    dinheiro: 'Dinheiro 💵',
    cartao: 'Cartão 💳',
    credito: 'Cartão de Crédito 💳',
    debito: 'Cartão de Débito 💳',
  }[pedido.metodo_pagamento] || pedido.metodo_pagamento || 'A combinar';

  // Se for dinheiro com troco, anexa a info de troco
  if (pedido.metodo_pagamento === 'dinheiro') {
    const troco = Number(pedido.troco_para);
    const total = Number(pedido.total);
    if (troco > 0 && troco > total) {
      const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      metodoPag += ` (troco para ${fmt(troco)} — devolver ${fmt(troco - total)})`;
    } else {
      metodoPag += ' (sem troco)';
    }
  }

  const isRetirada = pedido.tipo_entrega === 'retirada' || (!pedido.endereco_rua && pedido.tipo_entrega !== 'entrega');
  const tipoEntrega = isRetirada
    ? '🏪 *Retirada no estabelecimento*'
    : `🏠 *Entrega:* ${pedido.endereco_rua}, ${pedido.endereco_numero} — ${pedido.endereco_bairro}`;

  // Lista de itens do pedido
  let linhasItens = '';
  if (pedido.itens && pedido.itens.length > 0) {
    linhasItens = pedido.itens.map(item => {
      const adicionais = (item.adicionais || []).map(a => `   + ${a.nome}`).join('\n');
      const linha = `• ${item.quantidade}x ${item.produto_nome}`;
      return adicionais ? `${linha}\n${adicionais}` : linha;
    }).join('\n');
  }

  const texto =
    `✅ *Pedido recebido, ${pedido.cliente_nome}!*\n\n` +
    `📋 *Pedido #${pedido.id.slice(0, 6).toUpperCase()}*\n` +
    `🔄 *Status:* Pendente — aguardando confirmação\n\n` +
    (linhasItens ? `*Itens:*\n${linhasItens}\n\n` : '') +
    `💰 *Total: R$ ${Number(pedido.total).toFixed(2)}*\n` +
    `💳 *Pagamento:* ${metodoPag}\n` +
    `${tipoEntrega}\n\n` +
    `⏱️ Previsão: 30–45 minutos\n\n` +
    `_Acompanhe seu pedido em:_\n` +
    `🌐 neuzalanches.com.br`;

  await enviarMensagem(pedido.cliente_telefone, texto);
}

export async function notificarStatusPedido(pedido, status) {
  if (!pedido.cliente_telefone) return;

  const mensagens = {
    confirmado: `🍳 *${pedido.cliente_nome}*, seu pedido *#${pedido.id.slice(0, 6).toUpperCase()}* foi *confirmado* e está sendo preparado agora! 🔥\n\nEm breve estará pronto!`,
    preparando: `🍳 *${pedido.cliente_nome}*, seu pedido *#${pedido.id.slice(0, 6).toUpperCase()}* está sendo *preparado agora*! 🔥\n\nEm breve estará pronto!`,
    pronto: `✅ *${pedido.cliente_nome}*, seu pedido *#${pedido.id.slice(0, 6).toUpperCase()}* está *pronto*! 🎉\n\n${(pedido.tipo_entrega === 'retirada' || (!pedido.endereco_rua && pedido.tipo_entrega !== 'entrega')) ? 'Pode vir retirar! 🏪' : 'Saindo para entrega em instantes! 🛵'}`,
    entregue: `🎉 *Pedido entregue!*\n\nObrigado pela preferência, *${pedido.cliente_nome}*! ❤️\n\n_Volte sempre à Neuzalanches!_ 🍔\n🌐 neuzalanches.com.br`,
    cancelado: `❌ *${pedido.cliente_nome}*, infelizmente seu pedido *#${pedido.id.slice(0, 6).toUpperCase()}* foi *cancelado*.\n\nEntre em contato conosco para mais informações.\n🌐 neuzalanches.com.br`,
  };

  const texto = mensagens[status];
  if (texto) {
    await enviarMensagem(pedido.cliente_telefone, texto);
  }
}
