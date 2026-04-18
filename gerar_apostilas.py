#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gerador de Apostilas — Plataforma Neuzalanches
Gera PDFs de manual para cada seção do painel administrativo
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT

# ─── CORES ───────────────────────────────────────────────────────────────────
VERDE       = colors.HexColor('#15803d')
VERDE_ESC   = colors.HexColor('#166534')
VERDE_CL    = colors.HexColor('#f0fdf4')
VERDE_BD    = colors.HexColor('#bbf7d0')
LARANJA     = colors.HexColor('#f38c24')
LARANJA_CL  = colors.HexColor('#fff7ed')
LARANJA_BD  = colors.HexColor('#fed7aa')
CINZA_TXT   = colors.HexColor('#1c1917')
CINZA_SUB   = colors.HexColor('#78716c')
CINZA_CL    = colors.HexColor('#f5f5f4')
CINZA_BD    = colors.HexColor('#e7e5e4')
VERMELHO    = colors.HexColor('#dc2626')
VERMELHO_CL = colors.HexColor('#fef2f2')
VERMELHO_BD = colors.HexColor('#fecaca')
AZUL        = colors.HexColor('#2563eb')
AZUL_CL     = colors.HexColor('#eff6ff')
AMARELO     = colors.HexColor('#d97706')
AMARELO_CL  = colors.HexColor('#fffbeb')
BRANCO      = colors.white

OUTPUT_DIR = "/var/www/neuzalanches/apostilas"

# ─── ESTILOS ─────────────────────────────────────────────────────────────────
def estilos():
    s = {}

    s['titulo_capa'] = ParagraphStyle('titulo_capa',
        fontName='Helvetica-Bold', fontSize=30, textColor=BRANCO,
        alignment=TA_CENTER, spaceAfter=6, leading=36)

    s['sub_capa'] = ParagraphStyle('sub_capa',
        fontName='Helvetica', fontSize=14, textColor=colors.HexColor('#dcfce7'),
        alignment=TA_CENTER, spaceAfter=4)

    s['num_capa'] = ParagraphStyle('num_capa',
        fontName='Helvetica-Bold', fontSize=11, textColor=colors.HexColor('#86efac'),
        alignment=TA_CENTER, spaceAfter=0)

    s['h1'] = ParagraphStyle('h1',
        fontName='Helvetica-Bold', fontSize=17, textColor=VERDE,
        spaceBefore=18, spaceAfter=6, leading=22,
        borderPad=0)

    s['h2'] = ParagraphStyle('h2',
        fontName='Helvetica-Bold', fontSize=13, textColor=CINZA_TXT,
        spaceBefore=14, spaceAfter=4, leading=18)

    s['body'] = ParagraphStyle('body',
        fontName='Helvetica', fontSize=10.5, textColor=CINZA_TXT,
        spaceAfter=6, leading=16, alignment=TA_JUSTIFY)

    s['body_left'] = ParagraphStyle('body_left',
        fontName='Helvetica', fontSize=10.5, textColor=CINZA_TXT,
        spaceAfter=4, leading=16, alignment=TA_LEFT)

    s['passo_num'] = ParagraphStyle('passo_num',
        fontName='Helvetica-Bold', fontSize=13, textColor=BRANCO,
        alignment=TA_CENTER, leading=16)

    s['passo_titulo'] = ParagraphStyle('passo_titulo',
        fontName='Helvetica-Bold', fontSize=11, textColor=VERDE_ESC,
        spaceAfter=3, leading=15)

    s['passo_desc'] = ParagraphStyle('passo_desc',
        fontName='Helvetica', fontSize=10, textColor=CINZA_TXT,
        spaceAfter=0, leading=15, alignment=TA_LEFT)

    s['dica_txt'] = ParagraphStyle('dica_txt',
        fontName='Helvetica', fontSize=10, textColor=VERDE_ESC,
        leading=15, alignment=TA_LEFT)

    s['atencao_txt'] = ParagraphStyle('atencao_txt',
        fontName='Helvetica', fontSize=10, textColor=colors.HexColor('#92400e'),
        leading=15, alignment=TA_LEFT)

    s['info_txt'] = ParagraphStyle('info_txt',
        fontName='Helvetica', fontSize=10, textColor=colors.HexColor('#1e40af'),
        leading=15, alignment=TA_LEFT)

    s['faq_p'] = ParagraphStyle('faq_p',
        fontName='Helvetica-Bold', fontSize=10.5, textColor=CINZA_TXT,
        spaceAfter=3, leading=15)

    s['faq_r'] = ParagraphStyle('faq_r',
        fontName='Helvetica', fontSize=10, textColor=CINZA_SUB,
        spaceAfter=10, leading=15, alignment=TA_JUSTIFY)

    s['rodape'] = ParagraphStyle('rodape',
        fontName='Helvetica', fontSize=8, textColor=CINZA_SUB,
        alignment=TA_CENTER)

    s['destaque'] = ParagraphStyle('destaque',
        fontName='Helvetica-Bold', fontSize=10, textColor=CINZA_TXT,
        leading=15, spaceAfter=3)

    s['lista'] = ParagraphStyle('lista',
        fontName='Helvetica', fontSize=10, textColor=CINZA_TXT,
        leading=15, spaceAfter=2, leftIndent=12)

    return s


# ─── HELPERS ─────────────────────────────────────────────────────────────────
ST = estilos()

def doc(nome_arquivo, titulo_secao):
    caminho = os.path.join(OUTPUT_DIR, nome_arquivo)
    return SimpleDocTemplate(
        caminho,
        pagesize=A4,
        rightMargin=2.2*cm, leftMargin=2.2*cm,
        topMargin=2*cm, bottomMargin=2.2*cm,
        title=titulo_secao,
        author="Plataforma Neuzalanches"
    )

def capa(el, numero, titulo, subtitulo, descricao):
    """Página de capa colorida"""
    W = 16.6*cm
    data = [[
        Paragraph(f"MÓDULO {numero:02d}", ST['num_capa']),
        Paragraph(titulo, ST['titulo_capa']),
        Paragraph(subtitulo, ST['sub_capa']),
    ]]
    t = Table(data, colWidths=[W])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), VERDE),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,0), 14),
        ('BOTTOMPADDING', (0,0), (-1,0), 8),
        ('TOPPADDING', (0,1), (-1,1), 8),
        ('BOTTOMPADDING', (0,1), (-1,1), 8),
        ('TOPPADDING', (0,2), (-1,2), 4),
        ('BOTTOMPADDING', (0,2), (-1,2), 16),
        ('ROUNDEDCORNERS', [10]),
    ]))
    el.append(t)
    el.append(Spacer(1, 0.5*cm))

    # Descrição introdutória
    desc_data = [[Paragraph(descricao, ST['body'])]]
    desc_t = Table(desc_data, colWidths=[W])
    desc_t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), CINZA_CL),
        ('LEFTPADDING', (0,0), (-1,-1), 16),
        ('RIGHTPADDING', (0,0), (-1,-1), 16),
        ('TOPPADDING', (0,0), (-1,-1), 14),
        ('BOTTOMPADDING', (0,0), (-1,-1), 14),
        ('ROUNDEDCORNERS', [8]),
        ('BOX', (0,0), (-1,-1), 1, CINZA_BD),
    ]))
    el.append(desc_t)
    el.append(Spacer(1, 0.4*cm))
    el.append(HRFlowable(width="100%", thickness=1, color=CINZA_BD))
    el.append(Spacer(1, 0.3*cm))

def h1(el, texto):
    el.append(Paragraph(texto, ST['h1']))
    el.append(HRFlowable(width="100%", thickness=1.5, color=VERDE_BD))
    el.append(Spacer(1, 0.2*cm))

def h2(el, texto):
    el.append(Spacer(1, 0.2*cm))
    el.append(Paragraph(texto, ST['h2']))

def p(el, texto):
    el.append(Paragraph(texto, ST['body']))

def p_left(el, texto):
    el.append(Paragraph(texto, ST['body_left']))

def li(el, itens):
    for item in itens:
        el.append(Paragraph(f"• {item}", ST['lista']))
    el.append(Spacer(1, 0.2*cm))

def passo(el, numero, titulo, descricao, sub_itens=None):
    W = 16.6*cm
    num_col = 1.0*cm
    txt_col = W - num_col - 0.3*cm

    num_cell = Table([[Paragraph(str(numero), ST['passo_num'])]], colWidths=[num_col])
    num_cell.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), VERDE),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('ROUNDEDCORNERS', [6]),
    ]))

    txt_items = [Paragraph(titulo, ST['passo_titulo']),
                 Paragraph(descricao, ST['passo_desc'])]
    if sub_itens:
        for si in sub_itens:
            txt_items.append(Paragraph(f"  → {si}", ST['passo_desc']))

    txt_cell = Table([[item] for item in txt_items], colWidths=[txt_col])
    txt_cell.setStyle(TableStyle([
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 1),
        ('BOTTOMPADDING', (0,0), (-1,-1), 1),
    ]))

    row = Table([[num_cell, txt_cell]], colWidths=[num_col + 0.2*cm, txt_col])
    row.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (0,-1), 0),
        ('RIGHTPADDING', (0,0), (0,-1), 8),
        ('LEFTPADDING', (1,0), (1,-1), 0),
    ]))

    container = Table([[row]], colWidths=[W])
    container.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), VERDE_CL),
        ('BOX', (0,0), (-1,-1), 1, VERDE_BD),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('ROUNDEDCORNERS', [6]),
    ]))

    el.append(KeepTogether([container, Spacer(1, 0.25*cm)]))

def dica(el, texto):
    W = 16.6*cm
    conteudo = Paragraph(f"<b>💡 Dica:</b> {texto}", ST['dica_txt'])
    t = Table([[conteudo]], colWidths=[W])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), VERDE_CL),
        ('BOX', (0,0), (-1,-1), 1.5, VERDE),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('ROUNDEDCORNERS', [6]),
    ]))
    el.append(KeepTogether([t, Spacer(1, 0.25*cm)]))

def atencao(el, texto):
    W = 16.6*cm
    conteudo = Paragraph(f"<b>⚠ Atenção:</b> {texto}", ST['atencao_txt'])
    t = Table([[conteudo]], colWidths=[W])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), AMARELO_CL),
        ('BOX', (0,0), (-1,-1), 1.5, AMARELO),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('ROUNDEDCORNERS', [6]),
    ]))
    el.append(KeepTogether([t, Spacer(1, 0.25*cm)]))

def info(el, texto):
    W = 16.6*cm
    conteudo = Paragraph(f"<b>ℹ Saiba mais:</b> {texto}", ST['info_txt'])
    t = Table([[conteudo]], colWidths=[W])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), AZUL_CL),
        ('BOX', (0,0), (-1,-1), 1.5, AZUL),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('ROUNDEDCORNERS', [6]),
    ]))
    el.append(KeepTogether([t, Spacer(1, 0.25*cm)]))

def faq(el, pares):
    h1(el, "Perguntas Frequentes (FAQ)")
    for pergunta, resposta in pares:
        el.append(Paragraph(f"❓ {pergunta}", ST['faq_p']))
        el.append(Paragraph(resposta, ST['faq_r']))

def tabela_status(el, dados, cabecalho=None):
    W = 16.6*cm
    n_cols = len(dados[0])
    col_w = [W / n_cols] * n_cols

    rows = []
    if cabecalho:
        rows.append(cabecalho)
    rows.extend(dados)

    cells = [[Paragraph(str(c), ParagraphStyle('tc', fontName='Helvetica' if i > 0 or not cabecalho else 'Helvetica-Bold',
        fontSize=9.5, textColor=BRANCO if (cabecalho and i == 0) else CINZA_TXT, leading=14))
        for c in row] for i, row in enumerate(rows)]

    t = Table(cells, colWidths=col_w, repeatRows=1 if cabecalho else 0)
    style = [
        ('GRID', (0,0), (-1,-1), 0.5, CINZA_BD),
        ('TOPPADDING', (0,0), (-1,-1), 7),
        ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROUNDEDCORNERS', [4]),
    ]
    if cabecalho:
        style += [
            ('BACKGROUND', (0,0), (-1,0), VERDE),
            ('TEXTCOLOR', (0,0), (-1,0), BRANCO),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ]
        for i in range(1, len(rows), 2):
            style.append(('BACKGROUND', (0,i), (-1,i), CINZA_CL))
    t.setStyle(TableStyle(style))
    el.append(t)
    el.append(Spacer(1, 0.3*cm))

def rodape_pagina(canvas, doc_obj):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(CINZA_SUB)
    canvas.drawCentredString(A4[0]/2, 1.2*cm, f"Plataforma Neuzalanches  •  Página {doc_obj.page}")
    canvas.restoreState()

def build(documento, elements):
    documento.build(elements, onFirstPage=rodape_pagina, onLaterPages=rodape_pagina)
    print(f"✓ Gerado: {documento.filename}")


# ═══════════════════════════════════════════════════════════════════════════════
# APOSTILA 01 — PEDIDOS
# ═══════════════════════════════════════════════════════════════════════════════
def apostila_pedidos():
    el = []
    d = doc("01-pedidos.pdf", "Módulo 01 — Pedidos")

    capa(el, 1, "PEDIDOS",
        "Gerenciamento completo de pedidos",
        "Nesta seção você acompanha em tempo real todos os pedidos feitos pelos seus clientes — "
        "tanto pelo cardápio online quanto os pedidos feitos presencialmente no balcão. "
        "Você confirma, avança o status e registra a entrega de cada pedido.")

    h1(el, "O que você encontra nesta tela")
    p(el, "A aba <b>Pedidos</b> é a central de operações do seu negócio. Assim que um cliente faz um pedido "
        "pelo cardápio online, ele aparece aqui automaticamente com um alerta no menu. "
        "Você também pode criar pedidos manualmente para atendimentos presenciais.")

    li(el, [
        "Lista de todos os pedidos do dia",
        "Status de cada pedido em tempo real",
        "Detalhes completos: itens, valores, endereço e forma de pagamento",
        "Botão para criar pedido manual (balcão)",
        "Opção de cancelar pedidos",
    ])

    h1(el, "Pipeline de Status dos Pedidos")
    p(el, "Cada pedido passa por uma sequência de etapas. Você avança o status conforme vai atendendo:")

    tabela_status(el,
        [
            ["Pendente", "O cliente acabou de fazer o pedido. Aguardando sua confirmação."],
            ["Confirmado", "Você confirmou o pedido. O cliente é notificado."],
            ["Preparando", "O pedido está sendo produzido na cozinha."],
            ["Pronto", "O pedido está pronto para retirada ou entrega."],
            ["Entregue", "Pedido entregue. O valor é automaticamente lançado no financeiro."],
        ],
        cabecalho=["Status", "O que significa"]
    )

    info(el, "Quando o pedido muda para <b>Entregue</b>, o sistema automaticamente registra a receita "
        "no Fluxo de Caixa e calcula o CMV (custo de produção) para o relatório financeiro.")

    h1(el, "Passo a Passo — Gerenciar um Pedido Online")

    passo(el, 1, "Identifique o pedido novo",
        "Quando chegar um pedido, o número em vermelho no menu 'Pedidos' vai aparecer. "
        "Clique na aba Pedidos para ver a lista.",
        ["O número em vermelho indica quantos pedidos estão aguardando sua ação"])

    passo(el, 2, "Abra os detalhes do pedido",
        "Clique no botão 'Ver detalhes' ou no cartão do pedido para visualizar todos os itens, "
        "o endereço de entrega e a forma de pagamento escolhida pelo cliente.")

    passo(el, 3, "Confirme o pedido",
        "Clique no botão 'Confirmar'. O status muda de Pendente para Confirmado. "
        "O cliente recebe a confirmação pelo sistema.",
        ["Se não puder atender, clique em 'Cancelar' neste momento"])

    passo(el, 4, "Marque como Preparando",
        "Quando começar a produzir, clique em 'Preparando' para atualizar o status.")

    passo(el, 5, "Marque como Pronto",
        "Quando o pedido estiver finalizado e pronto para sair, clique em 'Pronto'.")

    passo(el, 6, "Confirme a entrega",
        "Após o cliente receber ou retirar o pedido, clique em 'Entregue'. "
        "Este é o passo mais importante — é ele que registra a receita no financeiro automaticamente.")

    dica(el, "Mantenha o status sempre atualizado. Isso ajuda os clientes a saberem "
        "onde está o pedido deles em tempo real.")

    h1(el, "Passo a Passo — Criar Pedido Manual (Presencial)")
    p(el, "Para pedidos feitos diretamente no balcão, use o botão de pedido manual.")

    passo(el, 1, "Clique em '+ Novo Pedido'",
        "O botão fica no canto superior direito da tela de Pedidos.")

    passo(el, 2, "Informe o nome do cliente",
        "Digite o nome de quem está fazendo o pedido presencial.")

    passo(el, 3, "Adicione os itens",
        "Clique nos produtos para adicioná-los ao pedido. Use o '+' e '-' para ajustar quantidades. "
        "Se o produto tiver adicionais (ex: cheddar, bacon), selecione neste momento.",
        ["Você pode adicionar vários produtos diferentes no mesmo pedido"])

    passo(el, 4, "Escolha a forma de pagamento",
        "Selecione: PIX, Cartão de Crédito ou Cartão de Débito.")

    passo(el, 5, "Confirme o pedido",
        "Clique em 'Confirmar Pedido'. O pedido entra na lista automaticamente como presencial.")

    passo(el, 6, "Avance normalmente",
        "A partir daí, siga o mesmo fluxo: Preparando → Pronto → Entregue.")

    atencao(el, "Não esqueça de clicar em 'Entregue' ao final — é esse clique que lança a receita "
        "no financeiro. Um pedido que fica parado em 'Pronto' não é contabilizado.")

    h1(el, "Cancelar um Pedido")
    passo(el, 1, "Abra os detalhes do pedido",
        "Clique no pedido que deseja cancelar.")
    passo(el, 2, "Clique em 'Cancelar'",
        "Confirme o cancelamento. O pedido fica marcado como Cancelado e não é contabilizado no financeiro.")

    dica(el, "Cancele o mais rápido possível ao perceber um problema — o cliente fica aguardando "
        "enquanto o pedido está em aberto.")

    faq(el, [
        ("O pedido sumiu da lista, o que aconteceu?",
         "Pedidos entregues ou cancelados ficam no histórico. Use o filtro de status para visualizar todos."),
        ("Posso editar os itens de um pedido depois de confirmado?",
         "Não. Uma vez confirmado, os itens não podem ser alterados. Cancele e crie um novo pedido se necessário."),
        ("O financeiro não registrou a receita de um pedido. O que fazer?",
         "Verifique se o pedido foi marcado como 'Entregue'. Apenas pedidos com status Entregue são contabilizados. "
         "Se esqueceu, ainda é possível avançar o status manualmente."),
        ("Posso ver pedidos de dias anteriores?",
         "Sim. Todos os pedidos ficam salvos no histórico. Você pode buscar por nome do cliente ou filtrar por data."),
        ("O cliente informou endereço errado. O que fazer?",
         "Entre em contato com o cliente pelo telefone informado no pedido e confirme o endereço antes de enviar."),
    ])

    build(d, el)


# ═══════════════════════════════════════════════════════════════════════════════
# APOSTILA 02 — PRODUTOS
# ═══════════════════════════════════════════════════════════════════════════════
def apostila_produtos():
    el = []
    d = doc("02-produtos.pdf", "Módulo 02 — Produtos")

    capa(el, 2, "PRODUTOS",
        "Cardápio digital e gestão de produtos",
        "Aqui você cadastra e gerencia todos os produtos do seu cardápio. "
        "O que você cadastrar aqui aparece para os clientes no cardápio online. "
        "Você também configura os custos de cada produto para que o sistema calcule "
        "automaticamente o CMV (Custo da Mercadoria Vendida).")

    h1(el, "O que você encontra nesta tela")
    li(el, [
        "Lista de todos os produtos cadastrados",
        "Filtros por categoria e disponibilidade",
        "Botão para criar novo produto",
        "Opção de editar, ativar/desativar e excluir produtos",
        "Ficha técnica (composição de insumos) de cada produto",
    ])

    h1(el, "Passo a Passo — Cadastrar um Novo Produto")

    passo(el, 1, "Clique em '+ Novo Produto'",
        "O botão fica no canto superior direito da lista de produtos.")

    passo(el, 2, "Preencha o nome do produto",
        "Digite o nome como ele vai aparecer no cardápio do cliente. Seja claro e atrativo.",
        ["Exemplos: 'X-Bacon Duplo', 'Coxinha de Frango', 'Suco de Laranja Natural'"])

    passo(el, 3, "Adicione uma descrição (opcional)",
        "Uma breve descrição ajuda o cliente a entender o que vai no produto. "
        "Ex: 'Hambúrguer artesanal com bacon crocante, cheddar e molho especial da casa.'")

    passo(el, 4, "Defina o preço de venda",
        "Digite o valor que o cliente vai pagar. Use ponto como separador decimal.",
        ["Exemplo: 18.90 para R$ 18,90"])

    passo(el, 5, "Informe o custo (opcional)",
        "O custo é o valor gasto para produzir o produto. Se você configurar a Ficha Técnica "
        "(veja adiante), o custo é calculado automaticamente. Caso contrário, digite manualmente.")

    passo(el, 6, "Selecione a categoria",
        "Escolha entre as categorias cadastradas (ex: Lanches, Bebidas). "
        "Isso organiza o cardápio para o cliente.")

    passo(el, 7, "Adicione uma imagem",
        "Clique em 'Selecionar imagem' e escolha uma foto do produto. "
        "Produtos com imagem vendem mais — use fotos bem iluminadas e apetitosas.",
        ["Tamanho recomendado: quadrada, mínimo 400x400 pixels"])

    passo(el, 8, "Ative o produto",
        "Certifique-se de que a opção 'Disponível' está marcada para que apareça no cardápio.")

    passo(el, 9, "Salve o produto",
        "Clique em 'Salvar'. O produto aparece imediatamente no cardápio online.")

    dica(el, "Produtos com boa descrição e foto de qualidade aumentam muito as vendas. "
        "Tire fotos com boa iluminação e fundo limpo.")

    h1(el, "Passo a Passo — Editar um Produto")

    passo(el, 1, "Encontre o produto na lista",
        "Use a barra de busca para encontrar rapidamente pelo nome.")
    passo(el, 2, "Clique em 'Editar'",
        "O formulário abre com os dados atuais preenchidos.")
    passo(el, 3, "Faça as alterações necessárias",
        "Altere o que precisar: nome, preço, descrição, imagem, etc.")
    passo(el, 4, "Salve as alterações",
        "Clique em 'Salvar'. As mudanças refletem imediatamente no cardápio.")

    h1(el, "Ativar e Desativar Produtos")
    p(el, "Quando um produto está temporariamente indisponível (falta de ingrediente, "
        "fora da estação, etc.), você pode desativá-lo sem precisar excluir.")

    passo(el, 1, "Encontre o produto",
        "Use a busca ou navegue pela lista.")
    passo(el, 2, "Clique em 'Desativar' ou 'Ativar'",
        "O produto desativado some do cardápio do cliente mas continua salvo no sistema.",
        ["Um produto desativado aparece com a tag 'Inativo' na lista do painel"])

    h1(el, "Ficha Técnica — Como configurar o CMV automaticamente")
    p(el, "A Ficha Técnica é a lista de ingredientes (insumos) que compõem cada produto "
        "e suas quantidades. Com ela configurada, o sistema calcula o custo de cada produto "
        "automaticamente toda vez que o preço de um insumo mudar.")

    passo(el, 1, "Abra o produto",
        "Clique em 'Editar' no produto que deseja configurar.")
    passo(el, 2, "Clique em 'Ficha Técnica'",
        "A seção de composição aparece abaixo do formulário.")
    passo(el, 3, "Adicione os ingredientes",
        "Selecione cada insumo e informe a quantidade usada por unidade do produto.",
        ["Exemplo: 'Pão de hambúrguer — 1 un', 'Carne bovina — 150 g', 'Queijo cheddar — 30 g'"])
    passo(el, 4, "Salve a ficha técnica",
        "O custo do produto é recalculado automaticamente com base nos preços dos insumos.")

    info(el, "Os insumos são cadastrados separadamente na aba <b>Insumos</b>. "
        "Certifique-se de cadastrar todos os ingredientes antes de montar a ficha técnica.")

    faq(el, [
        ("O produto não aparece no cardápio, o que fazer?",
         "Verifique se o produto está com status 'Disponível' (ativo). Também verifique "
         "se a categoria do produto está ativa nas Configurações."),
        ("Posso ter o mesmo produto em duas categorias?",
         "Não. Cada produto pertence a uma categoria apenas. Se precisar, crie uma cópia do produto."),
        ("Como atualizo o preço de vários produtos de uma vez?",
         "Por enquanto, a atualização é feita individualmente em cada produto. "
         "Edite um por vez clicando em 'Editar'."),
        ("O custo do produto ficou errado, o que verificar?",
         "Se você usa Ficha Técnica, verifique se o preço dos insumos está correto na aba Insumos. "
         "Se não usa Ficha Técnica, o custo precisa ser atualizado manualmente no produto."),
        ("Posso excluir um produto?",
         "Sim, mas atenção: excluir um produto não apaga o histórico de pedidos que já tinham ele. "
         "Prefira desativar o produto se ele pode voltar futuramente."),
    ])

    build(d, el)


# ═══════════════════════════════════════════════════════════════════════════════
# APOSTILA 03 — INSUMOS
# ═══════════════════════════════════════════════════════════════════════════════
def apostila_insumos():
    el = []
    d = doc("03-insumos.pdf", "Módulo 03 — Insumos")

    capa(el, 3, "INSUMOS",
        "Matérias-primas e cálculo automático de CMV",
        "Insumos são os ingredientes e materiais usados para produzir seus produtos. "
        "Ao cadastrar os insumos com seus preços, o sistema calcula automaticamente "
        "o custo de cada produto (CMV) com base na Ficha Técnica configurada. "
        "Quando o preço de um insumo muda, todos os produtos afetados são recalculados na hora.")

    h1(el, "O que são Insumos e por que cadastrá-los")
    p(el, "Um insumo é qualquer matéria-prima usada na produção dos seus produtos. "
        "Exemplos comuns para uma lanchonete:")
    li(el, [
        "Pão de hambúrguer (unidade)",
        "Carne bovina (grama ou kg)",
        "Queijo cheddar (grama)",
        "Alface (grama)",
        "Óleo de soja (ml)",
        "Embalagem descartável (unidade)",
    ])
    p(el, "Ao associar esses insumos aos produtos via Ficha Técnica, o sistema sabe exatamente "
        "quanto custa produzir cada item e calcula automaticamente a margem de lucro.")

    h1(el, "Unidades de medida disponíveis")
    tabela_status(el,
        [
            ["un", "Unidade inteira", "Pão, embalagem, limão"],
            ["kg", "Quilograma", "Carne, batata"],
            ["g", "Grama", "Queijo, tempero"],
            ["L", "Litro", "Refrigerante, suco"],
            ["mL", "Mililitro", "Molho, óleo"],
            ["caixa", "Caixa", "Luvas, guardanapos"],
            ["pct", "Pacote", "Farinha, sal"],
            ["dz", "Dúzia", "Ovos"],
        ],
        cabecalho=["Unidade", "Significado", "Exemplos de uso"]
    )

    h1(el, "Passo a Passo — Cadastrar um Insumo")

    passo(el, 1, "Acesse a aba Insumos",
        "No menu superior do painel, clique em 'Insumos'.")
    passo(el, 2, "Clique em '+ Novo Insumo'",
        "O formulário de cadastro abre na tela.")
    passo(el, 3, "Digite o nome do insumo",
        "Use um nome claro que identifique o ingrediente.",
        ["Exemplos: 'Pão brioche', 'Carne 80/20', 'Queijo mussarela fatiado'"])
    passo(el, 4, "Selecione a unidade de medida",
        "Escolha a unidade que você usa para medir esse ingrediente na cozinha.",
        ["Importante: use a mesma unidade que vai usar na Ficha Técnica do produto"])
    passo(el, 5, "Informe o preço unitário",
        "Digite o preço por unidade de medida. Se compra em quantidade maior, faça a conversão.",
        ["Exemplo: Carne a R$ 28,00/kg → preço por grama = R$ 0,028",
         "Exemplo: Pão a R$ 12,00 a dúzia → preço por unidade = R$ 1,00"])
    passo(el, 6, "Salve o insumo",
        "Clique em 'Salvar'. O insumo fica disponível para uso nas Fichas Técnicas dos produtos.")

    dica(el, "Cadastre os insumos com o preço da unidade mínima (grama, ml, unidade). "
        "Assim fica mais fácil calcular as quantidades na Ficha Técnica.")

    h1(el, "Passo a Passo — Atualizar o Preço de um Insumo")
    p(el, "Quando o preço de compra de um ingrediente muda, atualize aqui "
        "para que o CMV dos produtos seja recalculado automaticamente.")

    passo(el, 1, "Encontre o insumo na lista",
        "Use a barra de busca para localizar o ingrediente pelo nome.")
    passo(el, 2, "Clique em 'Editar'",
        "O formulário abre com os dados atuais.")
    passo(el, 3, "Altere o preço unitário",
        "Digite o novo preço por unidade de medida.")
    passo(el, 4, "Salve",
        "Ao salvar, o sistema recalcula automaticamente o custo de TODOS os produtos "
        "que usam esse insumo. O DRE e os indicadores financeiros são atualizados na hora.")

    atencao(el, "Não esqueça de atualizar os preços dos insumos sempre que fizer uma compra "
        "com preço diferente. Isso garante que o CMV e o lucro calculados sejam precisos.")

    h1(el, "Como o Insumo afeta o Financeiro")
    p(el, "A cadeia de cálculo funciona assim:")

    dados_chain = [
        ["Você atualiza o preço do insumo"],
        ["↓"],
        ["O sistema recalcula o custo dos produtos com Ficha Técnica"],
        ["↓"],
        ["Quando um pedido é entregue, o CMV é calculado com base nesses custos"],
        ["↓"],
        ["O DRE mostra: Receita − CMV = Lucro Bruto"],
    ]
    for item in dados_chain:
        if item[0] == "↓":
            el.append(Paragraph("    ↓", ParagraphStyle('seta', fontName='Helvetica-Bold',
                fontSize=14, textColor=VERDE, spaceAfter=2)))
        else:
            t = Table([[Paragraph(item[0], ST['body_left'])]], colWidths=[16.6*cm])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), VERDE_CL),
                ('BOX', (0,0), (-1,-1), 1, VERDE_BD),
                ('LEFTPADDING', (0,0), (-1,-1), 12),
                ('TOPPADDING', (0,0), (-1,-1), 6),
                ('BOTTOMPADDING', (0,0), (-1,-1), 6),
                ('ROUNDEDCORNERS', [4]),
            ]))
            el.append(t)
    el.append(Spacer(1, 0.3*cm))

    faq(el, [
        ("Preciso cadastrar todos os ingredientes?",
         "Não é obrigatório, mas é altamente recomendado. Sem a Ficha Técnica, "
         "o sistema não consegue calcular o custo real dos produtos e o CMV fica impreciso."),
        ("Como converto o preço de compra para preço por grama?",
         "Divida o valor pago pela quantidade total. Exemplo: R$ 25,00 por 1 kg de queijo = "
         "R$ 25,00 ÷ 1000 = R$ 0,025 por grama. Digite 0.025 no campo de preço unitário."),
        ("Posso excluir um insumo?",
         "Sim, mas se o insumo estiver associado à Ficha Técnica de algum produto, "
         "ele será removido da composição. O custo do produto pode ficar incorreto após a exclusão."),
        ("O que acontece com os pedidos antigos se eu mudar o preço de um insumo?",
         "Os pedidos já entregues não são afetados. O novo preço vale apenas para pedidos futuros."),
    ])

    build(d, el)


# ═══════════════════════════════════════════════════════════════════════════════
# APOSTILA 04 — ESTOQUE
# ═══════════════════════════════════════════════════════════════════════════════
def apostila_estoque():
    el = []
    d = doc("04-estoque.pdf", "Módulo 04 — Estoque")

    capa(el, 4, "ESTOQUE",
        "Controle completo de estoque e movimentações",
        "O módulo de Estoque permite controlar a quantidade de cada item em estoque, "
        "registrar entradas de compras (individual ou em lote), registrar saídas, "
        "fazer ajustes de inventário e gerenciar fornecedores. "
        "O sistema calcula o custo médio ponderado automaticamente a cada entrada.")

    h1(el, "Visão Geral das Abas")
    tabela_status(el, [
        ["Dashboard", "Resumo visual: valor total em estoque, itens baixos, últimas movimentações"],
        ["Itens", "Cadastro e gerenciamento de todos os itens de estoque"],
        ["Entrada Rápida", "Registrar uma entrada de forma rápida pelo celular (3 campos)"],
        ["Entrada em Lote", "Registrar uma compra com vários itens de uma vez"],
        ["Saídas", "Registrar consumo, perdas ou devoluções de estoque"],
        ["Ajustes", "Corrigir diferenças encontradas na contagem física"],
        ["Fornecedores", "Cadastro e gestão de fornecedores"],
        ["Categorias", "Organizar os itens de estoque por categoria"],
    ], cabecalho=["Aba", "Função"])

    h1(el, "Passo a Passo — Cadastrar um Item de Estoque")

    passo(el, 1, "Acesse a aba 'Itens'",
        "No módulo Estoque, clique na aba 'Itens'.")
    passo(el, 2, "Clique em '+ Novo Item'",
        "O formulário de cadastro abre em uma janela.")
    passo(el, 3, "Preencha o Código",
        "Crie um código curto para identificar o item. Pode ser letras e números.",
        ["Exemplos: PAO001, CARNE01, QUEIJ01, EMBAL01"])
    passo(el, 4, "Digite o Nome",
        "Nome completo e descritivo do item.",
        ["Exemplos: 'Pão brioche grande', 'Carne moída 80/20', 'Cheddar fatiado'"])
    passo(el, 5, "Selecione a Unidade",
        "Escolha a unidade de medida: un, kg, g, L, mL, caixa, pct, dz.")
    passo(el, 6, "Preencha os campos opcionais",
        "Categoria, Fornecedor padrão, Estoque mínimo e máximo são opcionais mas muito úteis.",
        ["Estoque mínimo: quando o saldo cair abaixo desse valor, aparece alerta no Dashboard"])
    passo(el, 7, "Salve",
        "Clique em 'Salvar'. O item aparece na lista com saldo zero — "
        "registre uma entrada para adicionar o saldo inicial.")

    h1(el, "Passo a Passo — Entrada Rápida (pelo celular)")
    p(el, "Use esta opção para registrar uma entrada de forma rápida, com apenas 3 campos obrigatórios. "
        "Ideal para registrar quando chega um produto no balcão.")

    passo(el, 1, "Acesse 'Entrada Rápida'",
        "Clique na aba 'Entrada Rápida' no módulo Estoque.")
    passo(el, 2, "Busque o item",
        "Digite o código ou nome do item no campo de busca. Uma lista aparece — clique no item correto.",
        ["O saldo atual do item é exibido para conferência"])
    passo(el, 3, "Digite a quantidade que entrou",
        "Informe o número de unidades recebidas.",
        ["Exemplo: se recebeu 10 pães, digite 10"])
    passo(el, 4, "Informe o custo unitário",
        "O custo médio atual já aparece como sugestão. Confirme ou altere para o custo da nota.",
        ["O sistema calculará automaticamente o novo custo médio ponderado"])
    passo(el, 5, "Confirme a entrada",
        "Clique em 'Confirmar Entrada'. O saldo é atualizado imediatamente.",
        ["Campos opcionais (fornecedor, data, NF) podem ser preenchidos expandindo o formulário"])

    dica(el, "A Entrada Rápida foi feita para o celular. Os 3 campos principais (item, "
        "quantidade, custo) são grandes e fáceis de digitar. Use ela no momento do recebimento.")

    h1(el, "Passo a Passo — Entrada em Lote (compra com vários itens)")
    p(el, "Quando você faz uma compra grande com vários produtos diferentes, "
        "use a Entrada em Lote para registrar tudo de uma vez.")

    passo(el, 1, "Acesse 'Entrada em Lote'",
        "Clique na aba 'Entrada em Lote'.")
    passo(el, 2, "Preencha as informações da compra",
        "Na parte superior, informe: Data da compra, Fornecedor e número da NF (opcional).",
        ["Esses dados valem para todos os itens desta compra"])
    passo(el, 3, "Encontre os itens na tabela",
        "A tabela mostra todos os itens cadastrados. Use o filtro no topo para encontrar rápido.")
    passo(el, 4, "Preencha a quantidade e custo de cada item recebido",
        "Para cada produto que chegou na compra, preencha a quantidade na coluna 'Quantidade Entrada' "
        "e o custo unitário na coluna ao lado. Deixe em branco os itens que não vieram.")
    passo(el, 5, "Confira o total",
        "Na parte inferior da tabela aparece o total geral da compra. Confira com a nota fiscal.")
    passo(el, 6, "Clique em 'Registrar'",
        "Todas as entradas são salvas de uma vez. O saldo de cada item é atualizado automaticamente.")

    atencao(el, "Revise bem antes de clicar em Registrar. Uma entrada lote registrada incorretamente "
        "precisará ser corrigida com um Ajuste de Inventário.")

    h1(el, "Passo a Passo — Registrar uma Saída")
    p(el, "Registre saídas para perdas, vencimentos, consumo interno ou devoluções.")

    passo(el, 1, "Acesse a aba 'Saídas'",
        "Clique em 'Saídas' no módulo Estoque.")
    passo(el, 2, "Selecione o item",
        "Escolha o item no menu suspenso. Apenas itens com saldo disponível aparecem.")
    passo(el, 3, "Informe a quantidade",
        "Digite quantas unidades estão saindo.")
    passo(el, 4, "Selecione o motivo",
        "Escolha: consumo, vencimento, perda, devolução ou outros.")
    passo(el, 5, "Confirme",
        "Clique em 'Registrar'. O saldo é deduzido imediatamente.")

    h1(el, "Passo a Passo — Ajuste de Inventário")
    p(el, "Use quando a contagem física (o que está fisicamente no estoque) "
        "não bate com o que o sistema mostra.")

    passo(el, 1, "Faça a contagem física",
        "Conte fisicamente todos os itens no estoque antes de fazer o ajuste.")
    passo(el, 2, "Acesse a aba 'Ajustes'",
        "Clique em 'Ajustes' no módulo Estoque.")
    passo(el, 3, "Selecione o item",
        "O sistema mostra o saldo atual. Compare com o que você contou.")
    passo(el, 4, "Digite o novo saldo",
        "Informe a quantidade REAL que você contou fisicamente.",
        ["O sistema calcula automaticamente a diferença (positiva ou negativa)"])
    passo(el, 5, "Informe o motivo",
        "Descreva brevemente o motivo do ajuste: 'Contagem mensal', 'Divergência após inventário', etc.")
    passo(el, 6, "Confirme o ajuste",
        "O saldo é corrigido. O histórico de ajustes fica registrado.")

    h1(el, "O que é Custo Médio Ponderado")
    p(el, "Sempre que você registra uma nova entrada de um item com custo diferente do custo atual, "
        "o sistema recalcula o custo médio usando a seguinte fórmula:")

    formula_data = [[
        Paragraph("Novo Custo Médio  =  (Saldo Anterior × Custo Anterior)  +  (Qtd Nova × Custo Novo)",
            ParagraphStyle('formula', fontName='Helvetica-Bold', fontSize=11,
                textColor=VERDE_ESC, alignment=TA_CENTER, leading=18)),
    ], [
        Paragraph("÷  (Saldo Anterior + Quantidade Nova)",
            ParagraphStyle('formula2', fontName='Helvetica-Bold', fontSize=11,
                textColor=VERDE_ESC, alignment=TA_CENTER, leading=18)),
    ]]
    ft = Table(formula_data, colWidths=[16.6*cm])
    ft.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), VERDE_CL),
        ('BOX', (0,0), (-1,-1), 2, VERDE),
        ('LEFTPADDING', (0,0), (-1,-1), 14),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('ROUNDEDCORNERS', [8]),
    ]))
    el.append(ft)
    el.append(Spacer(1, 0.3*cm))

    info(el, "Você não precisa fazer esse cálculo manualmente. O sistema faz tudo automaticamente "
        "a cada entrada registrada.")

    faq(el, [
        ("O saldo do item está negativo. O que fazer?",
         "Saldo negativo indica que houve mais saídas registradas do que entradas. "
         "Faça um ajuste de inventário com o saldo correto."),
        ("Preciso registrar as saídas para uso diário dos ingredientes?",
         "Para um controle preciso, sim. Mas se preferir, você pode fazer o controle apenas "
         "nas entradas e ajustar mensalmente via inventário físico."),
        ("Qual a diferença entre Entrada Rápida e Entrada em Lote?",
         "Entrada Rápida é para registrar um item por vez, de forma ágil. "
         "Entrada em Lote é para registrar uma compra completa com vários itens ao mesmo tempo."),
        ("O estoque do produto está zerado mas ainda aparece no cardápio?",
         "O Estoque e o Cardápio são sistemas separados. Você precisa desativar o produto "
         "manualmente na aba Produtos se não quiser que apareça no cardápio."),
    ])

    build(d, el)


# ═══════════════════════════════════════════════════════════════════════════════
# APOSTILA 05 — FINANCEIRO: VISÃO GERAL
# ═══════════════════════════════════════════════════════════════════════════════
def apostila_fin_visao():
    el = []
    d = doc("05-financeiro-visao-geral.pdf", "Módulo 05 — Financeiro: Visão Geral")

    capa(el, 5, "FINANCEIRO",
        "Visão Geral — Fluxo de Caixa",
        "A Visão Geral é o painel principal do financeiro. Ela mostra um resumo "
        "completo do fluxo de caixa do mês selecionado: quanto entrou, quanto saiu, "
        "qual o saldo atual e como foi a evolução ao longo dos dias.")

    h1(el, "O que você encontra nesta tela")
    li(el, [
        "Saldo atual (dinheiro em caixa)",
        "Total de entradas e saídas do mês",
        "Cartão de saldo com edição do valor inicial",
        "Gráfico de barras comparando receitas e despesas dos últimos meses",
        "Gráfico de linha mostrando a evolução do saldo dia a dia",
        "Seletor de mês para navegar pelo histórico",
    ])

    h1(el, "Como ler os Cartões de Resumo")

    tabela_status(el, [
        ["Saldo Atual", "O valor disponível em caixa hoje (entradas realizadas − saídas realizadas + saldo inicial)"],
        ["Entradas do Mês", "Soma de todas as receitas do mês (realizadas e previstas)"],
        ["Saídas do Mês", "Soma de todas as despesas do mês (realizadas e previstas)"],
        ["Resultado", "Diferença entre entradas e saídas. Verde = lucro, Vermelho = prejuízo"],
    ], cabecalho=["Cartão", "O que significa"])

    h1(el, "Como Navegar pelo Histórico")

    passo(el, 1, "Localize o seletor de mês",
        "No topo da tela do Financeiro, há um campo de data no formato 'AAAA-MM'.")
    passo(el, 2, "Selecione o mês desejado",
        "Clique no campo e escolha o mês e ano que deseja visualizar.",
        ["Todos os dados (lançamentos, DRE, gráficos) mudam para o mês selecionado"])

    dica(el, "Navegue pelos meses anteriores para comparar o desempenho financeiro "
        "e identificar tendências de crescimento ou queda nas receitas.")

    h1(el, "Como Configurar o Saldo Inicial")
    p(el, "O saldo inicial é o valor que você tinha em caixa no começo do controle financeiro. "
        "Ele é somado às entradas para calcular o saldo atual.")

    passo(el, 1, "No cartão verde de Saldo, clique em 'Editar'",
        "Um pequeno botão aparece no canto do cartão de saldo.")
    passo(el, 2, "Digite o valor inicial",
        "Informe o valor que havia em caixa quando você começou a usar o sistema.",
        ["Este valor é configurado uma vez. Não precisa ser alterado mensalmente."])
    passo(el, 3, "Salve",
        "Clique em Salvar. O saldo atual é recalculado automaticamente.")

    atencao(el, "O saldo inicial deve ser configurado apenas uma vez, no início. "
        "Não o altere mensalmente — o saldo vai evoluindo naturalmente com as movimentações.")

    h1(el, "Entendendo os Gráficos")

    h2(el, "Gráfico de Barras — Receitas vs Despesas")
    p(el, "Mostra a comparação entre entradas (verde) e saídas (vermelho) nos últimos meses. "
        "É uma forma visual rápida de ver se o negócio está crescendo, estável ou retraindo.")

    h2(el, "Gráfico de Linha — Evolução do Saldo")
    p(el, "Mostra como o saldo foi variando ao longo dos dias do mês. "
        "Uma linha subindo é sinal de que as entradas estão superando as saídas.")

    faq(el, [
        ("O saldo mostrado é o dinheiro na conta bancária?",
         "Não necessariamente. O saldo é calculado com base nos lançamentos registrados no sistema. "
         "Para que reflita a conta bancária, você precisa registrar todos os lançamentos fielmente."),
        ("Por que o saldo está negativo?",
         "Isso acontece quando as saídas registradas superam as entradas + saldo inicial. "
         "Verifique se todos os lançamentos de receita foram registrados corretamente."),
        ("Posso ver dados de anos anteriores?",
         "Sim. Use o seletor de mês para navegar para qualquer período registrado no sistema."),
        ("A receita dos pedidos entra automaticamente aqui?",
         "Sim. Quando um pedido é marcado como 'Entregue', a receita é lançada automaticamente "
         "como entrada no fluxo de caixa do dia."),
    ])

    build(d, el)


# ═══════════════════════════════════════════════════════════════════════════════
# APOSTILA 06 — FINANCEIRO: DRE
# ═══════════════════════════════════════════════════════════════════════════════
def apostila_fin_dre():
    el = []
    d = doc("06-financeiro-dre.pdf", "Módulo 06 — Financeiro: DRE")

    capa(el, 6, "FINANCEIRO — DRE",
        "Demonstrativo de Resultado do Exercício",
        "O DRE é o relatório financeiro mais importante do negócio. "
        "Ele mostra de forma clara e automática: quanto você faturou, "
        "quanto custou produzir, qual foi o lucro bruto, o impacto dos "
        "custos fixos e o lucro líquido real do mês.")

    h1(el, "O que é o DRE e por que ele é importante")
    p(el, "O DRE (Demonstrativo de Resultado do Exercício) é como uma radiografia financeira do mês. "
        "Ele responde a pergunta mais importante de qualquer negócio: "
        "<b>No final do mês, sobrou ou faltou dinheiro?</b>")
    p(el, "No sistema, o DRE é calculado <b>automaticamente</b> a partir dos pedidos entregues "
        "e dos custos fixos configurados. Você não precisa digitar nada manualmente.")

    h1(el, "A Estrutura do DRE")

    dados_dre = [
        ["(+) Receita Total", "Soma de todos os pedidos entregues no mês"],
        ["(−) CMV", "Custo da Mercadoria Vendida (custo de produção dos pedidos)"],
        ["(=) Lucro Bruto", "Receita menos CMV"],
        ["(−) Custos Fixos", "Aluguel, salários, energia, internet e outros custos mensais fixos"],
        ["(=) Lucro Líquido", "O que sobrou de verdade depois de pagar tudo"],
    ]
    tabela_status(el, dados_dre, cabecalho=["Linha", "O que representa"])

    h1(el, "Como ler cada linha do DRE")

    h2(el, "(+) Receita Total")
    p(el, "É o faturamento bruto do mês — a soma de todos os pedidos marcados como 'Entregue'. "
        "Este valor é puxado automaticamente da aba Pedidos.")
    dica(el, "Se a Receita parecer menor do que deveria, verifique se todos os pedidos "
        "foram marcados como 'Entregue'. Pedidos em outros status não são contabilizados.")

    h2(el, "(−) CMV — Custo da Mercadoria Vendida")
    p(el, "É o custo total de produção de todos os pedidos entregues. Calculado automaticamente "
        "com base no custo de cada produto (que vem da Ficha Técnica dos Insumos).")
    info(el, "Quanto menor o CMV em relação à Receita, maior é a sua margem bruta. "
        "Um CMV acima de 40% da receita merece atenção.")

    h2(el, "(=) Lucro Bruto e Margem Bruta")
    p(el, "O Lucro Bruto é a diferença entre o que você vendeu e o que custou produzir. "
        "A Margem Bruta (%) mostra esse resultado em percentual da receita.")
    p(el, "Exemplo: Receita R$ 10.000, CMV R$ 3.500 → Lucro Bruto R$ 6.500 → Margem Bruta 65%")

    h2(el, "(−) Custos Fixos")
    p(el, "São todas as despesas que acontecem todo mês independente do volume de vendas: "
        "aluguel, energia elétrica, salários, internet, etc. "
        "Cadastre esses custos na aba 'Custos Fixos' para que apareçam aqui automaticamente.")

    h2(el, "(=) Lucro Líquido e Margem Líquida")
    p(el, "O resultado final. É o que realmente sobrou depois de pagar produção E custos fixos. "
        "Se positivo: o negócio lucrou. Se negativo: o negócio teve prejuízo.")

    atencao(el, "Lucro Líquido negativo não significa falência imediata, mas é um sinal de alerta. "
        "Analise quais custos podem ser reduzidos ou como aumentar o faturamento.")

    h1(el, "O Diagnóstico Automático")
    p(el, "Abaixo do DRE, o sistema exibe um diagnóstico automático com indicadores visuais "
        "(✓ verde, ⚠ amarelo, ✕ vermelho) para:")
    li(el, [
        "Margem Bruta: saudável acima de 50%",
        "Margem Líquida: saudável acima de 10%",
        "CMV: ideal abaixo de 35% da receita",
        "Resultado do mês: lucro ou prejuízo",
    ])

    h1(el, "Detalhamento por Categoria de Custo Fixo")
    p(el, "Logo abaixo da tabela principal, o DRE mostra o detalhamento dos custos fixos "
        "agrupados por categoria (ex: Infraestrutura, Folha de Pagamento, Marketing). "
        "Isso permite identificar onde está concentrado o maior gasto fixo do negócio.")

    faq(el, [
        ("O DRE do mês está zerado. Por quê?",
         "O DRE usa os pedidos entregues como base de receita. Se não há pedidos marcados como "
         "'Entregue' no mês selecionado, o DRE não terá dados de receita."),
        ("O CMV está zerado mas tive pedidos. O que verificar?",
         "Verifique se os produtos dos pedidos têm custo configurado (via Ficha Técnica de Insumos "
         "ou custo manual). Produto com custo zero não gera CMV."),
        ("Posso imprimir o DRE?",
         "Use a função de impressão do navegador (Ctrl+P ou Cmd+P). O sistema está sendo "
         "atualizado para suportar exportação em PDF em breve."),
        ("Os custos fixos não aparecem no DRE. O que fazer?",
         "Verifique na aba 'Custos Fixos' se eles estão cadastrados e ativos. "
         "O sistema gera os lançamentos automaticamente ao mudar de mês."),
    ])

    build(d, el)


# ═══════════════════════════════════════════════════════════════════════════════
# APOSTILA 07 — FINANCEIRO: PONTO DE EQUILÍBRIO
# ═══════════════════════════════════════════════════════════════════════════════
def apostila_fin_equilibrio():
    el = []
    d = doc("07-financeiro-ponto-equilibrio.pdf", "Módulo 07 — Ponto de Equilíbrio")

    capa(el, 7, "FINANCEIRO — PONTO DE EQUILÍBRIO",
        "Saiba o dia em que o negócio começa a lucrar",
        "O Ponto de Equilíbrio (PE) é o valor mínimo de faturamento que o negócio precisa "
        "atingir no mês para cobrir todos os seus custos. Abaixo desse ponto, há prejuízo. "
        "Acima dele, começa o lucro. O sistema calcula e mostra visualmente quando você "
        "atingiu esse ponto durante o mês.")

    h1(el, "O que é o Ponto de Equilíbrio")
    p(el, "Imagine que no mês você tem R$ 5.000 de custos fixos e cada R$ 1,00 vendido "
        "gera R$ 0,60 de lucro bruto (margem de contribuição de 60%). Você precisa vender "
        "R$ 8.333 só para empatar. Qualquer venda acima disso é lucro líquido.")
    p(el, "O Ponto de Equilíbrio responde: <b>quanto preciso vender este mês para não ter prejuízo?</b>")

    h1(el, "A Fórmula")

    formula = Table([[
        Paragraph("Ponto de Equilíbrio  =  Custos Fixos Totais  ÷  Margem de Contribuição (%)",
            ParagraphStyle('formula', fontName='Helvetica-Bold', fontSize=12,
                textColor=VERDE_ESC, alignment=TA_CENTER, leading=20))
    ]], colWidths=[16.6*cm])
    formula.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), VERDE_CL),
        ('BOX', (0,0), (-1,-1), 2, VERDE),
        ('TOPPADDING', (0,0), (-1,-1), 14),
        ('BOTTOMPADDING', (0,0), (-1,-1), 14),
        ('ROUNDEDCORNERS', [8]),
    ]))
    el.append(formula)
    el.append(Spacer(1, 0.4*cm))

    p(el, "Onde a <b>Margem de Contribuição</b> é: <b>(Receita − CMV) ÷ Receita × 100</b>")
    info(el, "Todos esses cálculos são feitos automaticamente pelo sistema. "
        "Você só precisa olhar os resultados.")

    h1(el, "Os 4 Indicadores do Painel")

    tabela_status(el, [
        ["Ponto de Equilíbrio", "O valor que você precisa faturar para cobrir todos os custos"],
        ["Faturamento Real", "O que você já faturou no mês (pedidos entregues)"],
        ["Folga / Déficit", "Quanto já passou (ou ainda falta) para atingir o equilíbrio"],
        ["Margem de Segurança", "Percentual do faturamento que está 'a salvo' dos custos fixos"],
    ], cabecalho=["Indicador", "Significado"])

    h1(el, "Como ler o Gráfico")
    p(el, "O gráfico mostra a evolução do faturamento acumulado dia a dia ao longo do mês:")
    li(el, [
        "Linha azul: faturamento acumulado (sobe a cada dia com vendas)",
        "Linha laranja tracejada: o Ponto de Equilíbrio (linha horizontal fixa)",
        "Ponto verde: o dia em que a linha azul cruzou a linha laranja (atingiu o equilíbrio)",
    ])

    dica(el, "O ideal é que o ponto verde (dia do equilíbrio) apareça o mais cedo possível "
        "no mês — quanto antes atingir o equilíbrio, mais dias restam para gerar lucro líquido.")

    h1(el, "Como usar essa informação para tomar decisões")

    h2(el, "Se você está abaixo do Ponto de Equilíbrio:")
    li(el, [
        "Analise se os custos fixos estão muito altos em relação ao faturamento",
        "Considere ações de marketing para aumentar as vendas",
        "Verifique se algum custo fixo pode ser reduzido",
        "Avalie se o preço dos produtos cobre bem os custos variáveis",
    ])

    h2(el, "Se você está acima do Ponto de Equilíbrio:")
    li(el, [
        "Ótimo! Cada real faturado agora é lucro líquido",
        "Considere reinvestir uma parte no negócio",
        "Acompanhe a Margem de Segurança — quanto maior, mais saudável",
    ])

    h1(el, "Margem de Segurança")
    p(el, "A Margem de Segurança mostra o percentual do faturamento que está além do ponto de equilíbrio. "
        "Exemplo: se o PE é R$ 6.000 e você faturou R$ 10.000, a margem de segurança é 40%. "
        "Isso significa que o faturamento poderia cair 40% antes de você ter prejuízo.")

    tabela_status(el, [
        ["Acima de 30%", "Excelente — negócio bem saudável"],
        ["Entre 15% e 30%", "Bom — mas fique de olho"],
        ["Entre 5% e 15%", "Atenção — pouca margem de segurança"],
        ["Abaixo de 5%", "Alerta — qualquer queda nas vendas gera prejuízo"],
    ], cabecalho=["Margem de Segurança", "Situação"])

    faq(el, [
        ("O Ponto de Equilíbrio não aparece no gráfico. Por quê?",
         "O gráfico precisa de pelo menos 2 dias de vendas e de custos fixos cadastrados. "
         "Verifique se há custos fixos ativos na aba 'Custos Fixos'."),
        ("O dia do equilíbrio não aparece. O que significa?",
         "Significa que o faturamento do mês ainda não atingiu o Ponto de Equilíbrio. "
         "A linha azul ainda não cruzou a linha laranja."),
        ("A Margem de Contribuição está em 0%. O que verificar?",
         "Isso ocorre quando não há receita registrada ou quando o CMV é igual à receita. "
         "Verifique se os pedidos foram marcados como 'Entregue'."),
    ])

    build(d, el)


# ═══════════════════════════════════════════════════════════════════════════════
# APOSTILA 08 — FINANCEIRO: LANÇAMENTOS
# ═══════════════════════════════════════════════════════════════════════════════
def apostila_fin_lancamentos():
    el = []
    d = doc("08-financeiro-lancamentos.pdf", "Módulo 08 — Lançamentos")

    capa(el, 8, "FINANCEIRO — LANÇAMENTOS",
        "Registro manual de receitas e despesas",
        "Os Lançamentos são registros manuais de entradas e saídas financeiras. "
        "Enquanto as receitas dos pedidos entram automaticamente, qualquer outro "
        "movimento financeiro (contas pagas, receitas extras, despesas) deve ser "
        "registrado manualmente como um lançamento.")

    h1(el, "Quando usar os Lançamentos")
    p(el, "Use lançamentos para registrar qualquer movimentação financeira que "
        "<b>não venha automaticamente dos pedidos</b>:")

    tabela_status(el, [
        ["Entrada", "Receita extra (aluguel de espaço, venda de equipamento, investimento)"],
        ["Entrada", "Empréstimo recebido, aporte de sócio"],
        ["Saída", "Pagamento de aluguel, energia, água, internet"],
        ["Saída", "Compra de equipamento, material de limpeza"],
        ["Saída", "Pagamento de funcionários (folha de pagamento)"],
        ["Saída", "Impostos e taxas"],
        ["Saída", "Marketing e publicidade"],
    ], cabecalho=["Tipo", "Exemplo"])

    dica(el, "As vendas dos pedidos entram automaticamente como 'Entrada — Vendas'. "
        "Você não precisa registrá-las manualmente.")

    h1(el, "Passo a Passo — Criar um Lançamento")

    passo(el, 1, "Clique em '+ Novo Lançamento'",
        "O botão fica no canto superior direito na aba Lançamentos.")

    passo(el, 2, "Escolha o tipo",
        "Selecione 'Entrada' (dinheiro que entrou) ou 'Saída' (dinheiro que saiu).")

    passo(el, 3, "Preencha a descrição",
        "Descreva o lançamento de forma clara.",
        ["Exemplos: 'Aluguel de março', 'Conta de energia elétrica', 'Venda de equipamento usado'"])

    passo(el, 4, "Informe o valor",
        "Digite o valor em reais. Use ponto como separador decimal.",
        ["Exemplo: 1500.00 para R$ 1.500,00"])

    passo(el, 5, "Selecione a data",
        "A data em que o pagamento foi ou será realizado.")

    passo(el, 6, "Escolha a categoria",
        "Selecione a categoria que melhor classifica o lançamento.",
        ["Entradas: Vendas, Serviços, Investimento, Empréstimo, Outros",
         "Saídas: Fornecedores, Folha de Pagamento, Aluguel, Impostos, Marketing, CMV, etc."])

    passo(el, 7, "Defina o status",
        "Realizado: o pagamento já aconteceu. Previsto: o pagamento ainda vai acontecer.",
        ["Lançamentos Previstos aparecem nos totais mas não afetam o Saldo Atual"])

    passo(el, 8, "Observação (opcional)",
        "Adicione qualquer nota extra que ajude a identificar o lançamento no futuro.")

    passo(el, 9, "Salve",
        "Clique em 'Registrar lançamento'. O lançamento aparece na lista imediatamente.")

    h1(el, "Realizados vs Previstos")
    p(el, "O status de um lançamento define como ele afeta o saldo:")

    tabela_status(el, [
        ["Realizado", "Aparece nos totais do mês", "Afeta o Saldo Atual", "Aparece nos gráficos"],
        ["Previsto", "Aparece nos totais do mês", "NÃO afeta o Saldo Atual", "Aparece nos gráficos"],
    ], cabecalho=["Status", "Totalização", "Saldo Atual", "Gráficos"])

    info(el, "Use 'Previsto' para planejar gastos futuros sem afetar o saldo real. "
        "Quando o pagamento for efetuado, edite o lançamento e mude para 'Realizado'.")

    h1(el, "Passo a Passo — Editar um Lançamento")
    passo(el, 1, "Encontre o lançamento",
        "Use os filtros (tipo, status, categoria) ou a busca por descrição.")
    passo(el, 2, "Clique no ícone de edição (✏)",
        "O mesmo formulário de criação abre com os dados do lançamento.")
    passo(el, 3, "Faça as alterações",
        "Modifique o que precisar: valor, data, status, categoria ou observação.")
    passo(el, 4, "Salve",
        "Clique em 'Salvar alterações'.")

    h1(el, "Passo a Passo — Excluir um Lançamento")
    passo(el, 1, "Encontre o lançamento na lista",
        "Use os filtros para localizar.")
    passo(el, 2, "Clique no ícone de exclusão (🗑)",
        "Uma confirmação é pedida.")
    passo(el, 3, "Confirme",
        "O lançamento é removido permanentemente.")

    atencao(el, "Lançamentos excluídos não podem ser recuperados. "
        "Se quiser apenas ocultar temporariamente, considere desmarcar no filtro em vez de excluir.")

    h1(el, "Usando os Filtros")
    p(el, "Na aba Lançamentos, você pode filtrar por:")
    li(el, [
        "Tipo: Todos / Entradas / Saídas",
        "Status: Todos / Realizados / Previstos",
        "Categoria: filtrar por uma categoria específica",
        "Busca por texto: filtra pela descrição do lançamento",
        "Mês: selecione no topo do Financeiro",
    ])

    faq(el, [
        ("Os lançamentos automáticos dos pedidos aparecem aqui?",
         "Sim. Quando um pedido é entregue, dois lançamentos são criados automaticamente: "
         "um de Receita (entrada) e um de CMV (saída). Você pode vê-los filtrando por categoria."),
        ("Posso registrar parcelamentos?",
         "Sim. Crie um lançamento para cada parcela com a data de cada vencimento, "
         "usando status 'Previsto' para as parcelas futuras."),
        ("Como registrar um pagamento feito no banco?",
         "Crie um lançamento de Saída com a data do débito bancário, "
         "a descrição do pagamento e o status 'Realizado'."),
    ])

    build(d, el)


# ═══════════════════════════════════════════════════════════════════════════════
# APOSTILA 09 — FINANCEIRO: CUSTOS FIXOS
# ═══════════════════════════════════════════════════════════════════════════════
def apostila_fin_custos():
    el = []
    d = doc("09-financeiro-custos-fixos.pdf", "Módulo 09 — Custos Fixos")

    capa(el, 9, "FINANCEIRO — CUSTOS FIXOS",
        "Automatize o registro das despesas mensais",
        "Custos Fixos são as despesas que acontecem todo mês com o mesmo valor: "
        "aluguel, salários, energia, internet, etc. "
        "Ao cadastrá-los aqui, o sistema lança automaticamente esses valores "
        "no início de cada mês e os inclui no cálculo do DRE.")

    h1(el, "O que são Custos Fixos")
    p(el, "São despesas mensais recorrentes que não variam com o volume de vendas. "
        "Mesmo que você não venda nada no mês, esses custos existem.")

    tabela_status(el, [
        ["Aluguel do espaço", "Infraestrutura"],
        ["Energia elétrica (estimativa)", "Infraestrutura"],
        ["Internet e telefone", "Tecnologia"],
        ["Salário de funcionários", "Folha de Pagamento"],
        ["Contador/escritório contábil", "Administrativo"],
        ["Plataforma de gestão", "Tecnologia"],
        ["Material de limpeza (estimativa)", "Outros"],
        ["Marketing e redes sociais", "Marketing"],
    ], cabecalho=["Exemplo de Custo Fixo", "Categoria Sugerida"])

    h1(el, "Passo a Passo — Cadastrar um Custo Fixo")

    passo(el, 1, "Acesse 'Custos Fixos'",
        "No módulo Financeiro, clique na aba 'Custos Fixos' no menu interno.")
    passo(el, 2, "Preencha o nome",
        "Digite um nome claro para identificar o custo.",
        ["Exemplos: 'Aluguel — Loja Centro', 'Energia Elétrica', 'Salário João'"])
    passo(el, 3, "Informe o valor mensal",
        "Digite o valor que é pago todo mês.",
        ["Use o valor médio para custos que variam levemente (como energia)"])
    passo(el, 4, "Selecione a categoria",
        "Escolha entre: Infraestrutura, Tecnologia, Folha de Pagamento, "
        "Marketing, Administrativo, Impostos ou Outros.")
    passo(el, 5, "Ative o custo fixo",
        "Certifique-se de que está marcado como 'Ativo'.")
    passo(el, 6, "Salve",
        "Clique em 'Salvar'. O custo fixo é cadastrado e passará a ser lançado automaticamente.")

    h1(el, "Como funciona o lançamento automático")
    p(el, "Todo mês, quando você acessa o Financeiro e seleciona um mês, o sistema verifica "
        "se já existem lançamentos dos custos fixos ativos para aquele mês. "
        "Se não existirem, ele os cria automaticamente como lançamentos 'Previstos'.")
    p(el, "Um toast (mensagem) aparece na tela confirmando quantos custos fixos foram lançados.")

    info(el, "Os custos fixos são lançados como 'Previsto'. Quando o pagamento for realizado, "
        "vá em Lançamentos, encontre o lançamento e mude o status para 'Realizado'.")

    h1(el, "Ativar e Desativar Custos Fixos")
    p(el, "Se um custo fixo foi encerrado temporariamente (ex: contrato de aluguel encerrado), "
        "você pode desativá-lo sem excluir. Ele deixará de ser lançado nos próximos meses.")

    passo(el, 1, "Encontre o custo fixo na lista",
        "A lista mostra todos os custos fixos cadastrados.")
    passo(el, 2, "Clique no ícone para ativar/desativar",
        "O custo fixo muda de status. Desativado aparece com a tag 'Inativo'.")

    h1(el, "Como os Custos Fixos afetam o DRE")
    p(el, "No DRE do mês, a soma de todos os custos fixos <b>ativos</b> é deduzida do Lucro Bruto "
        "para chegar ao Lucro Líquido. Eles também aparecem no Ponto de Equilíbrio:")
    li(el, [
        "DRE: Lucro Bruto − Custos Fixos = Lucro Líquido",
        "Ponto de Equilíbrio: Custos Fixos ÷ Margem de Contribuição",
        "Quanto maiores os custos fixos, maior precisa ser o faturamento para cobri-los",
    ])

    atencao(el, "Mantenha os custos fixos sempre atualizados. Se o aluguel aumentou, "
        "atualize o valor no sistema para que o DRE e o Ponto de Equilíbrio reflitam a realidade.")

    faq(el, [
        ("Cadastrei o custo fixo mas ele não apareceu no Lançamentos. Por quê?",
         "O lançamento automático é gerado quando você acessa o Financeiro com o mês selecionado. "
         "Tente navegar para o mês atual — o sistema irá gerar os lançamentos que estão faltando."),
        ("O sistema lançou o mesmo custo fixo duas vezes. O que fazer?",
         "Isso não deve acontecer — o sistema verifica duplicatas. "
         "Se ocorreu, exclua o lançamento duplicado manualmente na aba Lançamentos."),
        ("Posso ter custos fixos com valores diferentes em meses específicos?",
         "Por enquanto, o custo fixo tem um valor fixo mensal. Para meses com valor diferente, "
         "ajuste manualmente o lançamento gerado automaticamente na aba Lançamentos."),
        ("Como vejo o total de custos fixos do mês?",
         "O total aparece automaticamente no DRE, na linha 'Custos Fixos', "
         "e também nos cards do Ponto de Equilíbrio."),
    ])

    build(d, el)


# ═══════════════════════════════════════════════════════════════════════════════
# APOSTILA 10 — CONFIGURAÇÕES
# ═══════════════════════════════════════════════════════════════════════════════
def apostila_configuracoes():
    el = []
    d = doc("10-configuracoes.pdf", "Módulo 10 — Configurações")

    capa(el, 10, "CONFIGURAÇÕES",
        "Personalize a plataforma para o seu negócio",
        "Na seção de Configurações você define as categorias do cardápio, "
        "os adicionais disponíveis (ingredientes extras que o cliente pode escolher), "
        "convida outros administradores e configura a chave PIX para recebimento. "
        "Essas configurações afetam diretamente o cardápio do cliente.")

    h1(el, "O que você encontra nesta tela")
    li(el, [
        "Categorias de Produtos: como os itens do cardápio são agrupados",
        "Adicionais: itens extras que o cliente adiciona ao pedido (ex: cheddar, bacon, ovo)",
        "Convite de Administradores: gerenciar quem tem acesso ao painel",
        "PIX: configurar a chave para recebimento via PIX",
    ])

    h1(el, "1. Categorias de Produtos")
    p(el, "As categorias organizam o cardápio para o cliente. "
        "Exemplos: Lanches, Bebidas, Sobremesas, Porções.")

    passo(el, 1, "Crie uma nova categoria",
        "No campo 'Nova categoria', digite o nome e clique em '+ Criar'.")
    passo(el, 2, "Defina se permite adicionais",
        "Marque a caixa 'Adicionais' se produtos desta categoria podem ter ingredientes extras. "
        "Recomendado para categorias como 'Lanches'.",
        ["Exemplo: Hambúrguer pode ter cheddar e bacon adicionados; Bebida não"])
    passo(el, 3, "Remover uma categoria",
        "Clique em 'Remover' ao lado da categoria. "
        "Produtos vinculados a ela ficam sem categoria.")

    dica(el, "Crie todas as categorias antes de começar a cadastrar produtos. "
        "Assim o cardápio fica organizado desde o início.")

    h1(el, "2. Adicionais (Ingredientes Extras)")
    p(el, "Adicionais são itens que o cliente pode adicionar ao pedido mediante um valor extra. "
        "Aparecem apenas em produtos de categorias com 'Permite Adicionais' ativado.")

    passo(el, 1, "Preencha o nome do adicional",
        "Digite o nome como vai aparecer para o cliente.",
        ["Exemplos: 'Cheddar', 'Bacon', 'Ovo frito', 'Maionese verde'"])
    passo(el, 2, "Informe o preço de venda",
        "O valor cobrado do cliente por este adicional.")
    passo(el, 3, "Informe o custo (CMV)",
        "O custo real desse ingrediente. Usado no cálculo de margem.",
        ["Deixe em 0 se não quiser controlar o CMV deste adicional"])
    passo(el, 4, "Salve",
        "Clique em '+ Criar'. O adicional aparece imediatamente no cardápio.")

    h2(el, "Ativar e Desativar Adicionais")
    p(el, "Se um adicional está temporariamente indisponível (falta de ingrediente), "
        "clique em 'Desativar'. Ele some do cardápio mas fica salvo no sistema. "
        "Clique em 'Ativar' quando estiver disponível novamente.")

    h1(el, "3. Convite de Administradores")
    p(el, "Você pode convidar outras pessoas para acessar o painel administrativo. "
        "Por questões de segurança, apenas emails pré-autorizados podem entrar como administradores.")

    passo(el, 1, "Digite o email da pessoa",
        "Informe o endereço de email completo da pessoa que vai ter acesso ao painel.")
    passo(el, 2, "Clique em '+ Convidar'",
        "O email é adicionado à lista de administradores autorizados.")
    passo(el, 3, "A pessoa cria a conta",
        "Com o email cadastrado aqui, a pessoa acessa o cardápio do cliente, "
        "clica em 'Criar conta' e usa o email cadastrado. O sistema reconhece e dá acesso de admin.")

    atencao(el, "Remova imediatamente o email de qualquer pessoa que não deve mais ter acesso ao painel. "
        "Clique em 'Remover' ao lado do email na lista.")

    h1(el, "4. Configuração do PIX")
    p(el, "O PIX é uma das formas de pagamento disponíveis no checkout do cardápio. "
        "O cliente vê a chave e o nome para fazer a transferência.")

    passo(el, 1, "Acesse as Configurações PIX",
        "No menu superior, clique em 'Configurações' e localize a seção PIX.")
    passo(el, 2, "Informe a chave PIX",
        "Pode ser CPF, CNPJ, email, telefone ou chave aleatória.",
        ["Exemplo de chave aleatória: 123e4567-e89b-12d3-a456-426614174000"])
    passo(el, 3, "Informe o nome do beneficiário",
        "O nome que vai aparecer para o cliente na tela de pagamento.",
        ["Use o nome como está cadastrado no banco para evitar confusão"])
    passo(el, 4, "Salve",
        "Clique em Salvar. A chave aparece imediatamente no checkout dos novos pedidos.")

    dica(el, "Teste o PIX fazendo um pedido pelo cardápio público e verificando se "
        "a chave exibida está correta antes de divulgar para os clientes.")

    h1(el, "Resumo das Configurações Iniciais")
    p(el, "Para colocar a plataforma em funcionamento pela primeira vez, "
        "faça as configurações nesta ordem:")

    dados_ordem = [
        ["1º", "Configurações → PIX", "Cadastre a chave PIX"],
        ["2º", "Configurações → Categorias", "Crie as categorias do cardápio"],
        ["3º", "Configurações → Adicionais", "Cadastre os adicionais (se houver)"],
        ["4º", "Insumos", "Cadastre os ingredientes com preço"],
        ["5º", "Produtos", "Cadastre os produtos com ficha técnica"],
        ["6º", "Financeiro → Custos Fixos", "Cadastre as despesas mensais fixas"],
        ["7º", "Estoque → Itens", "Cadastre os itens de estoque"],
        ["8º", "Divulgue o link do cardápio", "Compartilhe com os clientes"],
    ]
    tabela_status(el, dados_ordem, cabecalho=["Ordem", "Onde", "O que fazer"])

    faq(el, [
        ("Posso ter mais de um administrador ao mesmo tempo?",
         "Sim. Você pode convidar quantas pessoas quiser. Todas terão acesso completo ao painel."),
        ("A chave PIX não está aparecendo no cardápio. O que verificar?",
         "Acesse as Configurações e confirme se a chave PIX foi salva corretamente. "
         "Verifique também se o cliente está selecionando PIX como forma de pagamento no checkout."),
        ("Posso mudar a chave PIX a qualquer momento?",
         "Sim. Acesse Configurações, altere a chave e salve. "
         "A mudança vale para os próximos pedidos."),
        ("Como faço para remover meu próprio acesso de administrador?",
         "Por segurança, você não pode remover seu próprio email da lista. "
         "Peça para outro administrador fazer a remoção se necessário."),
    ])

    build(d, el)


# ═══════════════════════════════════════════════════════════════════════════════
# EXECUTAR TUDO
# ═══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"\n📄 Gerando apostilas em: {OUTPUT_DIR}\n")

    apostila_pedidos()
    apostila_produtos()
    apostila_insumos()
    apostila_estoque()
    apostila_fin_visao()
    apostila_fin_dre()
    apostila_fin_equilibrio()
    apostila_fin_lancamentos()
    apostila_fin_custos()
    apostila_configuracoes()

    print(f"\n✅ Todas as apostilas geradas com sucesso!")
    print(f"📁 Acesse em: https://neuzalanches.com.br/apostilas/")
