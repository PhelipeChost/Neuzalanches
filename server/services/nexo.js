// Reporta uma receita para a NEXO (calcula comissão automaticamente)
export async function reportarReceitaNexo({ amount, description, source = 'venda' }) {
  const NEXO_WEBHOOK_URL = process.env.NEXO_WEBHOOK_URL;
  // Ex: https://nexo.com.br/api/public/webhook/SEU-TOKEN-AQUI

  if (!NEXO_WEBHOOK_URL) return; // silencioso se não configurado

  const period = new Date().toISOString().slice(0, 7); // "2026-04"

  try {
    await fetch(NEXO_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, period, source, description }),
    });
  } catch (err) {
    console.error('[NEXO] Falha ao reportar receita:', err.message);
    // Não relança — não deve afetar o fluxo de venda do cliente
  }
}
