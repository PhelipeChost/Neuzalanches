# ─── Cria a regra de firewall do Nexus PDV (auto-elevação via UAC) ──────────
# Criar/alterar regra de firewall exige admin. Este script se relança sozinho
# com elevação (Start-Process -Verb RunAs) se ainda não estiver elevado — o
# Windows mostra o prompt de UAC padrão para o usuário aprovar uma vez.
# Códigos de saída: 0 = ok, 1 = erro ao criar, 1223 = usuário cancelou o UAC.
param([int]$port = 41730)

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    try {
        $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"", "-port", $port)
        $proc = Start-Process -FilePath "powershell" -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList $args
        exit $proc.ExitCode
    } catch {
        # Usuário clicou "Não" no prompt do UAC, ou a elevação falhou.
        exit 1223
    }
}

try {
    $existente = Get-NetFirewallRule -DisplayName "Nexus PDV Rede Local" -ErrorAction SilentlyContinue
    if ($existente) { exit 0 }

    New-NetFirewallRule -DisplayName "Nexus PDV Rede Local" -Direction Inbound -Protocol TCP `
        -LocalPort $port -Action Allow -Profile Private,Domain `
        -Description "Permite acesso ao Nexus PDV na rede local (multi-maquina)" -ErrorAction Stop | Out-Null
    exit 0
} catch {
    exit 1
}
