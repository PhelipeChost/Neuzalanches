// ─── Filtro de adicionais por categoria de produto ──────────────────────────
// Regra: quando o adicional tem `categorias_ids` (novo modelo multi), só aparece
// se catId estiver na lista. Se `categorias_ids` é null (adicional legacy do
// modelo antigo com uma categoria só), cai no comportamento anterior:
//   - categoria_id null → aparece em TODAS as categorias (compat)
//   - categoria_id igual → aparece só na categoria específica
export function adicionalCabeNaCategoria(adicional, catId) {
  if (!adicional) return false;
  // Novo modelo multi
  if (Array.isArray(adicional.categorias_ids)) {
    return catId && adicional.categorias_ids.includes(catId);
  }
  // Legacy: string categoria_id
  if (!adicional.categoria_id) return true;
  return adicional.categoria_id === catId;
}

export function filtrarAdicionaisPorCategoria(adicionais, catId) {
  return (adicionais || []).filter(a => adicionalCabeNaCategoria(a, catId));
}
