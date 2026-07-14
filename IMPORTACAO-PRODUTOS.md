# Importar produtos no Nexus PDV

**Como acessar:** Sidebar → **Produtos e Promoções** → aba **Produtos** → botão **⬆ Importar produtos**.

O importador aceita dois formatos: **JSON** (recomendado — mais fácil de gerar via IA/planilha) ou **CSV** (Excel/Google Sheets exportado como .csv). Você cola o conteúdo no modal ou carrega o arquivo, vê a prévia em tabela, e confirma. Os produtos vão pro cardápio que estiver selecionado no topo da tela.

---

## Regras que o importador aplica sozinho

- **Idempotência por `codigo` ou `codigo_barras`:** se o produto já existir com o mesmo código, ele é **atualizado** em vez de duplicado. Rodar a mesma lista duas vezes não bagunça nada.
- **Categorias novas são criadas automaticamente** e vinculadas ao cardápio ativo. Se a lista tem "Peixes" e "Frutos do mar" e essas categorias não existem, elas viram categorias novas do cardápio (não precisa criar antes).
- **Campos vazios são aceitos.** Se o produto não tem código de barras, deixa em branco. Se não tem NCM, deixa em branco. Só `nome` e `preco` são obrigatórios.
- **Espelho no estoque:** se `pertence_estoque = true` **ou** você mandar um `estoque_inicial`, o produto entra automaticamente no **Estoque** como item de **Revenda** (mesmo código), com o saldo inicial. A partir daí, cada venda desconta 1 unidade.
- **Foto do produto NÃO vem no import** — você adiciona depois clicando em "Editar" no card do produto.

---

## Campos suportados

| Campo               | Obrigatório | Descrição                                                                 |
|---------------------|-------------|---------------------------------------------------------------------------|
| `nome`              | **sim**     | Nome do produto (aparece no cardápio e cupom fiscal).                     |
| `preco`             | **sim**     | Preço de venda em reais. Aceita `12.50` ou `"12,50"`.                     |
| `codigo`            | não         | Código interno curto (ex: "PX001"). Usado pela busca F2 do PDV.           |
| `codigo_barras`     | não         | EAN-13/GTIN do leitor. A busca F2 e o leitor de código de barras usam.    |
| `ncm`               | não         | 8 dígitos. Se vazio, usa o NCM padrão configurado em Suporte → Fiscal.    |
| `cest`              | não         | 7 dígitos. Só produtos com substituição tributária.                       |
| `um`                | não         | Unidade de medida: `un`, `kg`, `g`, `l`, `ml`, `cx`, `pct`, `dz`, `m`.    |
| `categoria`         | não         | Nome da categoria. Criada se não existir.                                 |
| `descricao`         | não         | Descrição curta que aparece no cardápio.                                  |
| `custo`             | não         | CMV/custo unitário em reais.                                              |
| `estoque_inicial`   | não         | Saldo inicial no estoque. Presença desse campo já ativa `pertence_estoque`.|
| `estoque_minimo`    | não         | Alerta de estoque baixo.                                                  |
| `pertence_estoque`  | não         | `true` ou `false`. Se `true`, cria/atualiza item de revenda no estoque.   |
| `disponivel`        | não         | `true` (padrão) ou `false`. Produto indisponível não aparece no cardápio. |

---

## Formato JSON (recomendado)

Cole no modal ou salve como `.json` e carregue:

```json
[
  {
    "codigo": "PX001",
    "codigo_barras": "7891234567890",
    "nome": "Filé de Tilápia",
    "categoria": "Peixes",
    "preco": 45.00,
    "custo": 28.00,
    "um": "kg",
    "ncm": "03038900",
    "cest": "",
    "estoque_inicial": 15,
    "estoque_minimo": 3,
    "pertence_estoque": true,
    "descricao": "Peça inteira congelada"
  },
  {
    "codigo": "PX002",
    "nome": "Camarão VG",
    "categoria": "Frutos do mar",
    "preco": 89.90,
    "um": "kg",
    "estoque_inicial": 3.5,
    "pertence_estoque": true
  },
  {
    "nome": "Refrigerante Lata 350ml",
    "categoria": "Bebidas",
    "preco": 6,
    "um": "un"
  }
]
```

---

## Formato CSV (Excel / Google Sheets)

Salve como CSV UTF-8, separador vírgula ou ponto-e-vírgula. A primeira linha é o cabeçalho — o importador reconhece variações (`nome`, `produto`, `descricao`; `preco`, `valor`, `preco_venda`; `codigo_barras`, `ean`, `gtin`, etc.), mas se puder usar exatamente os nomes abaixo, é mais seguro:

```
codigo,codigo_barras,nome,categoria,preco,custo,um,ncm,cest,estoque_inicial,estoque_minimo,pertence_estoque
PX001,7891234567890,Filé de Tilápia,Peixes,45.00,28,kg,03038900,,15,3,sim
PX002,,Camarão VG,Frutos do mar,89.90,,kg,,,3.5,,sim
,,Refrigerante Lata 350ml,Bebidas,6,,un,,,,,não
```

**Regras CSV específicas:**
- Se o valor contém vírgula (ex: nome com vírgula), coloque entre aspas: `"Salmão, corte especial"`.
- `pertence_estoque` aceita: `sim`/`não`, `1`/`0`, `true`/`false`, `s`/`n`.
- Preços com vírgula ou ponto funcionam: `45,00` ou `45.00`.

---

## Prompt sugerido pra converter os prints da lista do cliente

> Vou te enviar prints de uma lista de produtos. Converta cada linha em um objeto JSON com os campos: `codigo`, `codigo_barras`, `nome`, `categoria`, `preco`, `custo` (se aparecer), `um` (un/kg/g/l/ml), `ncm`, `cest`, `estoque_inicial`, `pertence_estoque` (true se tiver estoque, false caso contrário). Se um campo não estiver na lista, **omita** (não coloque `null`, não coloque string vazia — só não bote o campo). Devolva um único array JSON com todos os produtos, formatado para eu copiar e colar. Use ponto (não vírgula) nos números. Preserve a categoria exatamente como está na lista original.

---

## Depois de importar

1. Confira o **relatório** que aparece no próprio modal (criados/atualizados/erros/categorias novas).
2. Se algum produto ficou com informação errada, edite pelo botão **✎ Editar** no card.
3. Adicione as **fotos** clicando em Editar → seção "Fotos do produto".
4. Se marcou `pertence_estoque=true`, os itens já estão em **Estoque → Revenda** com o saldo inicial. Ajuste o `estoque_mínimo` lá se quiser alertas de reposição.
