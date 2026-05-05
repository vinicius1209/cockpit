#!/usr/bin/env bash
# Cockpit CLI installer — symlinka o `cockpit` em ~/.local/bin/

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_ENTRY="$REPO_ROOT/cli/src/index.ts"
INSTALL_DIR="$HOME/.local/bin"
INSTALL_PATH="$INSTALL_DIR/cockpit"

# ── Cores ──
green='\033[0;32m'
yellow='\033[0;33m'
red='\033[0;31m'
dim='\033[2m'
bold='\033[1m'
reset='\033[0m'

echo -e "${bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}"
echo -e "${bold}  Cockpit CLI — installer${reset}"
echo -e "${bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}"
echo ""

# ── 1. bun? ──
if ! command -v bun >/dev/null 2>&1; then
  echo -e "${red}✕ bun não encontrado${reset}"
  echo -e "${dim}  instale: curl -fsSL https://bun.sh/install | bash${reset}"
  exit 1
fi
echo -e "${green}✓${reset} bun $(bun --version)"

# ── 2. Verifica entry point ──
if [ ! -f "$CLI_ENTRY" ]; then
  echo -e "${red}✕ entry point não encontrado em $CLI_ENTRY${reset}"
  exit 1
fi
echo -e "${green}✓${reset} CLI source ${dim}$CLI_ENTRY${reset}"

# ── 3. Instala dependências ──
echo -e "${dim}  instalando dependências do CLI…${reset}"
(cd "$REPO_ROOT/cli" && bun install --silent)
echo -e "${green}✓${reset} cli/node_modules"

# ── 4. Symlink ──
mkdir -p "$INSTALL_DIR"
chmod +x "$CLI_ENTRY"
ln -sf "$CLI_ENTRY" "$INSTALL_PATH"
echo -e "${green}✓${reset} symlink em ${dim}$INSTALL_PATH${reset}"

# Atalho `ck`
ln -sf "$CLI_ENTRY" "$INSTALL_DIR/ck"
echo -e "${green}✓${reset} atalho ${dim}~/.local/bin/ck${reset}"

# ── 5. Verifica PATH ──
case ":$PATH:" in
  *":$INSTALL_DIR:"*) PATH_OK=1 ;;
  *) PATH_OK=0 ;;
esac

echo ""
echo -e "${bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}"
if [ "$PATH_OK" = "1" ]; then
  echo -e "${green}  ✓ instalação completa${reset}"
  echo -e "${dim}  rode: ${bold}cockpit${reset}${dim} (ou ${bold}ck${reset}${dim})${reset}"
else
  echo -e "${yellow}  ⚠ ~/.local/bin NÃO está no PATH${reset}"
  echo -e "${dim}  adicione no seu shell rc:${reset}"
  echo -e "    ${bold}export PATH=\"\$HOME/.local/bin:\$PATH\"${reset}"
  echo ""
  echo -e "${dim}  ou rode usando o caminho completo:${reset}"
  echo -e "    ${bold}$INSTALL_PATH doctor${reset}"
fi
echo ""

# ── 6. Aliases sugeridos ──
echo -e "${dim}  aliases sugeridos pro seu .zshrc/.bashrc:${reset}"
echo -e "${dim}    alias ck='cockpit'${reset}"
echo -e "${dim}    alias ckb='cockpit board'${reset}"
echo -e "${dim}    alias ckc='cockpit card list'${reset}"
echo -e "${dim}    alias cki='cockpit implement'${reset}"
echo -e "${dim}    alias ckw='cockpit watch'${reset}"
echo ""
