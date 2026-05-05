#!/usr/bin/env bash
# Cockpit MCP installer — registra Cockpit como MCP server no Claude Code
# (e em qualquer cliente compatível) editando ~/.claude.json (ou .codex/settings.json).

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_ENTRY="$REPO_ROOT/mcp/src/index.ts"
CLAUDE_CONFIG="$HOME/.claude.json"

green='\033[0;32m'
yellow='\033[0;33m'
red='\033[0;31m'
dim='\033[2m'
bold='\033[1m'
reset='\033[0m'

echo -e "${bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}"
echo -e "${bold}  Cockpit MCP — installer${reset}"
echo -e "${bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}"
echo ""

# ── 1. bun ──
if ! command -v bun >/dev/null 2>&1; then
  echo -e "${red}✕ bun não encontrado${reset}"
  echo -e "${dim}  instale: curl -fsSL https://bun.sh/install | bash${reset}"
  exit 1
fi
echo -e "${green}✓${reset} bun $(bun --version)"

# ── 2. Entry point ──
if [ ! -f "$MCP_ENTRY" ]; then
  echo -e "${red}✕ entry point não encontrado: $MCP_ENTRY${reset}"
  exit 1
fi
echo -e "${green}✓${reset} MCP source ${dim}$MCP_ENTRY${reset}"

# ── 3. Deps do MCP ──
echo -e "${dim}  instalando dependências do MCP…${reset}"
(cd "$REPO_ROOT/mcp" && bun install --silent)
echo -e "${green}✓${reset} mcp/node_modules"

# ── 4. Edita ~/.claude.json ──
BUN_BIN="$(command -v bun)"

if [ ! -f "$CLAUDE_CONFIG" ]; then
  echo -e "${yellow}⚠ ~/.claude.json não existe${reset}"
  echo -e "${dim}  rode 'claude' uma vez antes (ele cria o arquivo)${reset}"
  echo ""
  echo -e "${dim}  ou crie manualmente:${reset}"
  cat <<EOF

  {
    "mcpServers": {
      "cockpit": {
        "command": "$BUN_BIN",
        "args": ["run", "$MCP_ENTRY"]
      }
    }
  }

EOF
  exit 1
fi

# Backup
cp "$CLAUDE_CONFIG" "$CLAUDE_CONFIG.backup.$(date +%s)"

# Patch via bun -e (preserva resto do config)
PATCH_SCRIPT=$(cat <<JS
const fs = require('node:fs');
const path = '$CLAUDE_CONFIG';
const config = JSON.parse(fs.readFileSync(path, 'utf-8'));
if (!config.mcpServers) config.mcpServers = {};
config.mcpServers.cockpit = {
  command: '$BUN_BIN',
  args: ['run', '$MCP_ENTRY'],
};
fs.writeFileSync(path, JSON.stringify(config, null, 2));
console.log('OK');
JS
)
RESULT=$(bun -e "$PATCH_SCRIPT" 2>&1)
if [ "$RESULT" = "OK" ]; then
  echo -e "  ${green}✓${reset} ${dim}registrado em ~/.claude.json${reset}"
else
  echo -e "  ${red}✕ falha ao patchear ~/.claude.json:${reset}"
  echo "$RESULT"
  exit 1
fi

echo ""
echo -e "${bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}"
echo -e "${green}  ✓ instalação completa${reset}"
echo ""
echo -e "${dim}  reinicie sessões abertas do Claude Code para detectar o servidor${reset}"
echo -e "${dim}  no Claude Code, rode:${reset} ${bold}/mcp${reset} ${dim}para listar servers${reset}"
echo ""
echo -e "${dim}  exemplos de uso:${reset}"
echo -e "${dim}    > 'liste meus workspaces'                  → cockpit_list_workspaces${reset}"
echo -e "${dim}    > 'mostre o card SW78'                     → cockpit_show_card${reset}"
echo -e "${dim}    > 'crie um card para refatorar auth'       → cockpit_create_card${reset}"
echo -e "${dim}    > 'busque cards sobre login'               → cockpit_search${reset}"
echo -e "${dim}    > 'quais bugs criticos estao em ready?'    → cockpit_list_cards (filtros)${reset}"
echo ""
