@echo off
REM ============================================================
REM  COZINHA - Impressao automatica de pedidos na XP-80
REM ------------------------------------------------------------
REM  ANTES DE USAR (uma vez so):
REM   1. Painel de Controle > Dispositivos e Impressoras
REM   2. Clique com o botao direito na XP-80 > "Definir como
REM      impressora padrao"
REM   3. (recomendado) Nas preferencias da XP-80, defina o
REM      tamanho de papel como 80mm x recibo / 72mm.
REM
REM  COMO USAR NO DIA A DIA:
REM   - De um duplo-clique neste arquivo.
REM   - O Chrome abre ja em modo de impressao silenciosa.
REM   - Faca login e entre no setor "Cozinha".
REM   - Deixe o botao "Impressao ON" ativado no topo da tela.
REM   - A cada pedido novo, o cupom sai automaticamente.
REM ============================================================

set URL=https://reinonexusideal.com.br/prototipocompleto/admin

set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

if not exist %CHROME% (
  echo Google Chrome nao encontrado. Instale o Chrome ou ajuste o caminho neste arquivo.
  pause
  exit /b 1
)

REM --kiosk-printing imprime direto na impressora PADRAO, sem caixa de dialogo.
start "" %CHROME% --kiosk-printing --new-window %URL%
