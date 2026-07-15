; ─── Personalização do wizard NSIS (Nexus PDV) ────────────────────────────────
; Roda ANTES do LangString final; personaliza os textos de boas-vindas e final.
; Como o language está fixo em 1046 (Portugues Brasileiro) no package.json,
; só reescrevemos essa localização.

!macro customWelcomePage
  ; nada a fazer aqui — a page de boas-vindas já usa o sidebar/header customizado
!macroend

!macro customUnWelcomePage
!macroend

!macro customHeader
  ; alias para o arquivo do header/sidebar
!macroend

; Textos em pt-BR mostrados nas telas do wizard
!macro customInit
  ; hook antes da instalação — nada a fazer
!macroend

!macro customInstall
  ; Libera as portas do PDV no Firewall do Windows (redes privada/domínio) —
  ; necessário pro modo multi-máquina (servidor/cliente na mesma rede local).
  ; Não libera em rede "Pública" por segurança — a rede da loja precisa estar
  ; classificada como Privada no Windows para as máquinas se enxergarem.
  DetailPrint "Configurando Firewall do Windows para o Nexus PDV..."
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Nexus PDV"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Nexus PDV" dir=in action=allow protocol=TCP localport=41730,41731 profile=private,domain'
!macroend

!macro customUnInstall
  DetailPrint "Removendo regra de Firewall do Nexus PDV..."
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Nexus PDV"'
!macroend

; Reescreve textos da página de boas-vindas do wizard (LangString exige o
; ID em runtime; usamos !define para MUI_TEXT_WELCOME_INFO_TEXT antes do include)
!define MUI_WELCOMEPAGE_TITLE "Bem-vindo à instalação do Nexus PDV"
!define MUI_WELCOMEPAGE_TEXT "Este assistente vai instalar o Nexus PDV — o sistema de frente de caixa da Nexus — no seu computador.$\r$\n$\r$\nO Nexus PDV funciona online quando há internet e continua rodando offline se a conexão cair, garantindo que o seu caixa nunca pare.$\r$\n$\r$\nClique em Avançar para começar."

!define MUI_FINISHPAGE_TITLE "Instalação concluída"
!define MUI_FINISHPAGE_TEXT "O Nexus PDV foi instalado com sucesso.$\r$\n$\r$\nQuando abrir pela primeira vez, você verá a tela de ativação de licença — informe o código da sua máquina para a Nexus receber a sua licença."
!define MUI_FINISHPAGE_RUN_TEXT "Executar o Nexus PDV agora"
