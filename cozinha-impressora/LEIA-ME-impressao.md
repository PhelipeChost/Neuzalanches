# Impressão automática de pedidos na Cozinha (XP-80)

A tela **Cozinha** imprime um cupom 80mm na impressora térmica **XP-80** automaticamente
sempre que um pedido novo chega. Funciona pelo próprio navegador — não precisa de
servidor nem programa extra.

## Configuração (uma vez só)

1. **Impressora padrão**: Painel de Controle → Dispositivos e Impressoras → clique com o
   botão direito na **XP-80** → *Definir como impressora padrão*.
2. **Tamanho do papel**: nas Preferências de Impressão da XP-80, escolha o papel de
   **80mm** (recibo). O cupom é desenhado para ~72mm de área imprimível.
3. **Impressão silenciosa (sem caixa de diálogo)**: use o atalho
   **`abrir-cozinha-impressao.bat`** (nesta mesma pasta). Ele abre o Chrome com a opção
   `--kiosk-printing`, que envia o cupom direto para a impressora padrão.
   - Dica: copie o `.bat` para a Área de Trabalho da máquina da cozinha.

## No dia a dia

1. Dê um duplo-clique em **`abrir-cozinha-impressao.bat`**.
2. Faça login e entre no setor **Cozinha**.
3. Confira que o botão **🖨️ Impressão ON** (no topo) está ativado.
4. Pronto: a cada pedido novo, o cupom sai sozinho.

## Recursos

- **🖨️ Impressão ON/OFF** (topo da tela): liga/desliga a impressão automática. A
  preferência fica salva naquele computador.
- **🖨️ Imprimir** (dentro de cada pedido expandido): reimprime o cupom daquele pedido
  quando precisar de uma 2ª via.
- Ao **abrir/recarregar** a Cozinha, os pedidos que já estavam na tela **não** são
  reimpressos — só os que chegam depois.

## Observações

- Se você usar o Chrome normal (sem o `.bat`), a impressão ainda funciona, mas o
  navegador abre a janela de impressão a cada pedido (não é silenciosa).
- O cupom mostra: nº do pedido, horário, tipo (Delivery/Retirada/No local), cliente,
  itens com quantidade e adicionais, observação destacada, endereço (delivery),
  forma de pagamento e total.
