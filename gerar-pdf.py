from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    HRFlowable, KeepTogether
)

OUT = r"C:\Users\Felipe\Desktop\Neuzalanches\Neuzalanches.pdf"

# ── Cores da marca (laranja/vermelho calorosos) ──
LARANJA = colors.HexColor("#E85D2C")
VERMELHO = colors.HexColor("#B83217")
AMARELO = colors.HexColor("#F5A623")
ESCURO = colors.HexColor("#2B1810")
CREME = colors.HexColor("#FFF8F0")
CINZA = colors.HexColor("#5C5048")

# ── Estilos ──
styles = getSampleStyleSheet()

titulo = ParagraphStyle(
    "Titulo", parent=styles["Title"],
    fontName="Helvetica-Bold", fontSize=32, leading=36,
    textColor=LARANJA, alignment=TA_CENTER, spaceAfter=6
)
subtitulo = ParagraphStyle(
    "Subtitulo", parent=styles["Normal"],
    fontName="Helvetica-Oblique", fontSize=14, leading=18,
    textColor=ESCURO, alignment=TA_CENTER, spaceAfter=20
)
h1 = ParagraphStyle(
    "H1", parent=styles["Heading1"],
    fontName="Helvetica-Bold", fontSize=18, leading=22,
    textColor=VERMELHO, spaceBefore=18, spaceAfter=10
)
h2 = ParagraphStyle(
    "H2", parent=styles["Heading2"],
    fontName="Helvetica-Bold", fontSize=13, leading=16,
    textColor=ESCURO, spaceBefore=10, spaceAfter=6
)
corpo = ParagraphStyle(
    "Corpo", parent=styles["Normal"],
    fontName="Helvetica", fontSize=11, leading=16,
    textColor=ESCURO, alignment=TA_JUSTIFY, spaceAfter=8
)
bullet = ParagraphStyle(
    "Bullet", parent=corpo,
    leftIndent=18, bulletIndent=4, spaceAfter=4
)
nota = ParagraphStyle(
    "Nota", parent=styles["Normal"],
    fontName="Helvetica-Bold", fontSize=11, leading=15,
    textColor=ESCURO, alignment=TA_CENTER
)
nota_link = ParagraphStyle(
    "NotaLink", parent=styles["Normal"],
    fontName="Helvetica-Bold", fontSize=14, leading=18,
    textColor=LARANJA, alignment=TA_CENTER, spaceBefore=4
)

# ── Documento ──
doc = SimpleDocTemplate(
    OUT, pagesize=A4,
    leftMargin=2*cm, rightMargin=2*cm,
    topMargin=2*cm, bottomMargin=2*cm,
    title="Neuzalanches — A melhor lanchonete de Pereira Barreto",
    author="Neuzalanches"
)

story = []

# ── Capa / Cabeçalho ──
story.append(Spacer(1, 1.5*cm))
story.append(Paragraph("NEUZALANCHES", titulo))
story.append(Paragraph("Sabor de casa, atendimento de família — Pereira Barreto/SP", subtitulo))
story.append(HRFlowable(width="60%", thickness=2, color=LARANJA, hAlign="CENTER"))
story.append(Spacer(1, 0.5*cm))

# Banner com bordas
banner_data = [[Paragraph(
    '<para alignment="center"><font color="white" size="13"><b>'
    'Lanches artesanais &nbsp;•&nbsp; Entrega rápida &nbsp;•&nbsp; Atendimento que vira amizade'
    '</b></font></para>',
    styles["Normal"])]]
banner = Table(banner_data, colWidths=[16*cm], rowHeights=[1.4*cm])
banner.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), LARANJA),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("LEFTPADDING", (0,0), (-1,-1), 12),
    ("RIGHTPADDING", (0,0), (-1,-1), 12),
    ("ROUNDEDCORNERS", [8,8,8,8]),
]))
story.append(banner)
story.append(Spacer(1, 0.6*cm))

# ── 1. Sobre o estabelecimento ──
story.append(Paragraph("1. Sobre o Neuzalanches", h1))
story.append(Paragraph(
    "O <b>Neuzalanches</b> é uma lanchonete de Pereira Barreto-SP que nasceu da paixão por servir comida "
    "feita na hora, com ingredientes selecionados e o cuidado de quem cozinha como se fosse para a própria "
    "família. Cada hambúrguer é montado no momento do pedido, cada batata frita sai crocante da fritadeira "
    "e cada cliente é tratado pelo nome — porque aqui ninguém é número de pedido, é gente.",
    corpo
))
story.append(Paragraph(
    "Mais que uma lanchonete, o Neuzalanches é um ponto de encontro. Funciona de <b>terça a domingo, "
    "das 19h às 01h</b>, oferecendo opções de <b>retirada no local</b> ou <b>entrega rápida</b> em toda "
    "Pereira Barreto. O cardápio combina os clássicos que todo mundo ama com criações próprias da casa, "
    "tudo com preço justo e porções generosas.",
    corpo
))

story.append(Paragraph("O que oferecemos", h2))
ofertas = [
    "<b>Hambúrgueres artesanais</b> — pão macio, carne suculenta grelhada na chapa, queijos derretidos e molhos da casa.",
    "<b>Combos completos</b> — lanche + acompanhamento + bebida com preço fechado, perfeitos para a família.",
    "<b>Adicionais à vontade</b> — bacon, ovo, cheddar, catupiry, cebola caramelizada — você monta do seu jeito.",
    "<b>Porções e acompanhamentos</b> — batatas fritas crocantes, onion rings e clássicos para compartilhar.",
    "<b>Bebidas geladas</b> — refrigerantes, sucos, água e opções que combinam com cada lanche.",
    "<b>Pedidos online</b> — site próprio em <b>neuzalanches.com.br</b> com cardápio digital, acompanhamento de pedido e notificações pelo WhatsApp.",
]
for o in ofertas:
    story.append(Paragraph(o, bullet, bulletText="•"))

story.append(Paragraph("Por que somos uma das melhores lanchonetes de Pereira Barreto", h2))
story.append(Paragraph(
    "Em uma cidade onde todo mundo se conhece, reputação se constrói prato por prato. O Neuzalanches "
    "ganhou o carinho da clientela porque entrega <b>consistência</b>: o lanche de hoje tem o mesmo sabor "
    "do lanche da semana passada. Entrega <b>velocidade</b>: previsão honesta de 30 a 45 minutos, e o "
    "cliente acompanha o status em tempo real. E entrega <b>atenção</b>: cada observação no pedido é "
    "lida, cada troco é certinho, cada entrega chega quente.",
    corpo
))

story.append(PageBreak())

# ── 2. Pontos fortes — visão do cliente ──
story.append(Paragraph("2. Pontos fortes na visão do cliente", h1))
story.append(Paragraph(
    "Quem pede no Neuzalanches volta. E volta porque a experiência inteira — do toque no celular até a "
    "última mordida — foi pensada para ser simples, rápida e gostosa.",
    corpo
))

# Tabela de benefícios cliente
cliente_pontos = [
    ["🍔", "<b>Comida feita na hora</b>",
     "Nada de lanche pronto esperando — montagem só começa quando o pedido entra."],
    ["📱", "<b>Pedido em 1 minuto</b>",
     "Site rápido, cardápio com fotos, carrinho intuitivo. Sem app pra baixar."],
    ["🛵", "<b>Acompanhamento em tempo real</b>",
     "Notificações pelo WhatsApp: pedido recebido, na chapa, saindo pra entrega, entregue."],
    ["💳", "<b>Pagamento flexível</b>",
     "PIX, dinheiro com troco calculado, cartão de crédito ou débito na entrega."],
    ["🏠", "<b>Endereço salvo</b>",
     "Cliente cadastra o endereço uma vez e nas próximas é só confirmar."],
    ["📋", "<b>Histórico de pedidos</b>",
     "Aba 'Meus Pedidos' mostra tudo que já foi pedido, com status e total."],
    ["🎯", "<b>Personalização total</b>",
     "Adicionais por item, observações livres ('sem cebola, ponto da carne ao ponto')."],
    ["⏱️", "<b>Previsão honesta</b>",
     "30 a 45 minutos. Se atrasar, o cliente é avisado."],
]

tbl_data = [[p[0], Paragraph(p[1] + "<br/>" + p[2], corpo)] for p in cliente_pontos]
tbl = Table(tbl_data, colWidths=[1.2*cm, 14.8*cm])
tbl.setStyle(TableStyle([
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("FONTSIZE", (0,0), (0,-1), 18),
    ("ALIGN", (0,0), (0,-1), "CENTER"),
    ("TOPPADDING", (0,0), (-1,-1), 8),
    ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ("LEFTPADDING", (0,0), (-1,-1), 6),
    ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("ROWBACKGROUNDS", (0,0), (-1,-1), [CREME, colors.white]),
    ("LINEBELOW", (0,0), (-1,-2), 0.3, colors.HexColor("#E5DCD0")),
]))
story.append(tbl)

story.append(Spacer(1, 0.4*cm))
story.append(Paragraph(
    "<i>O cliente não precisa decorar telefone, salvar contato no WhatsApp ou ligar e ditar pedido. "
    "Ele abre o site, escolhe, paga e acompanha. Tudo em menos de dois minutos.</i>",
    ParagraphStyle("italic", parent=corpo, fontName="Helvetica-Oblique", textColor=CINZA)
))

story.append(PageBreak())

# ── 3. Pontos fortes — visão de quem cuida ──
story.append(Paragraph("3. Pontos fortes na visão da operação", h1))
story.append(Paragraph(
    "Por trás de cada lanche entregue, existe uma operação afinada. O Neuzalanches investiu em um sistema "
    "próprio que automatiza o que pode ser automatizado e libera a equipe para focar no que realmente "
    "importa: <b>fazer comida boa e atender bem</b>.",
    corpo
))

operacao_pontos = [
    ["🔔", "<b>Painel de pedidos com som</b>",
     "Toca um alerta sonoro quando entra pedido novo. Ninguém perde pedido por estar de costas para a tela."],
    ["📅", "<b>Pedidos agrupados por dia</b>",
     "Visão por dia, com horário de cada pedido, total do dia e contador. Fechamento é instantâneo."],
    ["🍳", "<b>Status em um clique</b>",
     "Pendente → Confirmado → Preparando → Pronto → Entregue. Cada clique notifica o cliente automaticamente."],
    ["📦", "<b>Controle de estoque integrado</b>",
     "Insumos, fornecedores, entradas, saídas e ajustes — saber o que tem e o que falta em tempo real."],
    ["💰", "<b>Fluxo de caixa</b>",
     "Lançamentos, custos fixos, receita por dia. Painel financeiro completo, sem planilha solta."],
    ["⚙️", "<b>Cardápio editável</b>",
     "Adicionar produto, mudar preço, esgotar item, reordenar categorias — tudo pelo painel admin."],
    ["🕐", "<b>Horário de funcionamento automático</b>",
     "Site fecha sozinho fora do horário. Modo manual disponível para feriados e folgas."],
    ["💬", "<b>Bot WhatsApp inteligente</b>",
     "Saudação automática para quem manda mensagem, com cooldown para não atrapalhar atendimento humano."],
    ["🧾", "<b>PIX configurável</b>",
     "Chave PIX e nome do recebedor cadastrados — cliente paga direto, sem intermediário."],
    ["📊", "<b>Relatórios de venda</b>",
     "Quanto vendeu hoje, quais produtos saíram mais, ticket médio. Decisão baseada em dado, não em achismo."],
]

op_data = [[p[0], Paragraph(p[1] + "<br/>" + p[2], corpo)] for p in operacao_pontos]
op_tbl = Table(op_data, colWidths=[1.2*cm, 14.8*cm])
op_tbl.setStyle(TableStyle([
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("FONTSIZE", (0,0), (0,-1), 18),
    ("ALIGN", (0,0), (0,-1), "CENTER"),
    ("TOPPADDING", (0,0), (-1,-1), 8),
    ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ("LEFTPADDING", (0,0), (-1,-1), 6),
    ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("ROWBACKGROUNDS", (0,0), (-1,-1), [CREME, colors.white]),
    ("LINEBELOW", (0,0), (-1,-2), 0.3, colors.HexColor("#E5DCD0")),
]))
story.append(op_tbl)

story.append(Spacer(1, 0.4*cm))
story.append(Paragraph(
    "<i>O sistema do Neuzalanches não foi comprado pronto — foi feito sob medida, e isso aparece em cada "
    "detalhe: do som de pedido novo ao formato do troco, tudo é exatamente como a operação precisa.</i>",
    ParagraphStyle("italic2", parent=corpo, fontName="Helvetica-Oblique", textColor=CINZA)
))

story.append(Spacer(1, 0.8*cm))

# ── 4. Nota Reino Nexus Ideal ──
story.append(HRFlowable(width="100%", thickness=1, color=LARANJA))
story.append(Spacer(1, 0.4*cm))

nota_data = [[
    Paragraph(
        '<para alignment="center"><font size="11" color="#2B1810">'
        'Plataforma desenvolvida e mantida por:'
        '</font></para>', styles["Normal"]),
]]
story.append(Table(nota_data, colWidths=[16*cm]))

story.append(Paragraph(
    '<a href="http://reinonexusideal.com.br" color="#E85D2C">reinonexusideal.com.br</a>',
    nota_link
))
story.append(Spacer(1, 0.3*cm))
story.append(Paragraph(
    "<i>O Neuzalanches é cliente da Reino Nexus Ideal — desenvolvedora responsável pelo site, "
    "painel administrativo, integração com WhatsApp e toda a infraestrutura digital que mantém "
    "a lanchonete rodando 24/7 com a velocidade e a confiabilidade que o cliente percebe.</i>",
    ParagraphStyle("notarodape", parent=corpo, fontSize=10, textColor=CINZA, alignment=TA_CENTER)
))

story.append(Spacer(1, 0.4*cm))
story.append(HRFlowable(width="100%", thickness=1, color=LARANJA))

# Rodapé final
story.append(Spacer(1, 0.6*cm))
story.append(Paragraph(
    '<para alignment="center"><font size="10" color="#5C5048">'
    '<b>Neuzalanches</b> &nbsp;•&nbsp; Pereira Barreto/SP &nbsp;•&nbsp; '
    'Terça a Domingo, 19h às 01h &nbsp;•&nbsp; '
    '<font color="#E85D2C"><b>neuzalanches.com.br</b></font>'
    '</font></para>',
    styles["Normal"]
))

doc.build(story)
print(f"PDF gerado: {OUT}")
