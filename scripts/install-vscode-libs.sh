#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ! -r /etc/os-release ]]; then
  echo "Erro: não foi possível identificar a distribuição Linux." >&2
  exit 1
fi

# shellcheck disable=SC1091
source /etc/os-release

run_as_root() {
  if (( ${EUID:-$(id -u)} == 0 )); then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "Erro: execute como root ou instale o sudo." >&2
    exit 1
  fi
}

is_deb_installed() {
  dpkg-query -W -f='${db:Status-Abbrev}' "$1" 2>/dev/null | grep -q '^ii '
}

is_rpm_installed() {
  rpm -q --quiet "$1"
}

install_ubuntu() {
  echo "Ubuntu detectado: ${PRETTY_NAME:-$ID}"

  local alsa_pkg='libasound2'
  local cups_pkg='libcups2'

  # Ubuntu 24.04+ usa os nomes com sufixo t64.
  if dpkg --compare-versions "${VERSION_ID:-0}" ge '24.04'; then
    alsa_pkg='libasound2t64'
    cups_pkg='libcups2t64'
  fi

  local packages=(
    ca-certificates
    file
    "$alsa_pkg"
    libatk-bridge2.0-0
    libatk1.0-0
    libatspi2.0-0
    libcairo2
    libcurl4
    "$cups_pkg"
    libdbus-1-3
    libdrm2
    libexpat1
    libgbm1
    libglib2.0-0
    libgtk-3-0
    libnspr4
    libnss3
    libpango-1.0-0
    libudev1
    libvulkan1
    libx11-6
    libx11-xcb1
    libxcb1
    libxcomposite1
    libxcursor1
    libxdamage1
    libxext6
    libxfixes3
    libxi6
    libxkbcommon0
    libxkbfile1
    libxrandr2
    libxrender1
    libxshmfence1
    libxtst6
    xdg-utils
    xvfb
  )

  local missing=()
  local package
  for package in "${packages[@]}"; do
    is_deb_installed "$package" || missing+=("$package")
  done

  if (( ${#missing[@]} == 0 )); then
    echo "Dependências já instaladas; pulando apt-get update/install."
    return
  fi

  echo "Instalando ${#missing[@]} pacote(s) ausente(s)..."
  run_as_root env DEBIAN_FRONTEND=noninteractive \
    apt-get update -o Acquire::Languages=none

  run_as_root env DEBIAN_FRONTEND=noninteractive \
    apt-get install -y --no-install-recommends \
      -o Dpkg::Use-Pty=0 \
      "${missing[@]}"
}

install_fedora() {
  echo "Fedora detectado: ${PRETTY_NAME:-$ID}"

  local packages=(
    alsa-lib
    at-spi2-atk
    atk
    ca-certificates
    cairo
    cups-libs
    dbus-libs
    expat
    file
    glib2
    gtk3
    libdrm
    libX11
    libX11-xcb
    libxcb
    libXcomposite
    libXcursor
    libXdamage
    libXext
    libXfixes
    libXi
    libxkbcommon
    libxkbcommon-x11
    libxkbfile
    libXrandr
    libXrender
    libXtst
    mesa-libgbm
    nspr
    nss
    pango
    systemd-libs
    vulkan-loader
    xdg-utils
    xorg-x11-server-Xvfb
  )

  local missing=()
  local package
  for package in "${packages[@]}"; do
    is_rpm_installed "$package" || missing+=("$package")
  done

  # Fedora pode usar libcurl ou libcurl-minimal; qualquer uma fornece libcurl.so.4.
  if ! is_rpm_installed libcurl && ! is_rpm_installed libcurl-minimal; then
    missing+=(libcurl-minimal)
  fi

  if (( ${#missing[@]} == 0 )); then
    echo "Dependências já instaladas; pulando dnf install."
    return
  fi

  echo "Instalando ${#missing[@]} pacote(s) ausente(s)..."
  run_as_root dnf install -y \
    --setopt=install_weak_deps=False \
    "${missing[@]}"
}

case "${ID,,}" in
  ubuntu)
    install_ubuntu
    ;;
  fedora)
    install_fedora
    ;;
  *)
    echo "Distribuição não suportada: ${PRETTY_NAME:-$ID}" >&2
    echo "Este script suporta Ubuntu e Fedora." >&2
    exit 1
    ;;
esac

echo
echo "Dependências do VS Code/Electron instaladas."

VSCODE_DIR="${VSCODE_DIR:-${PWD}/.vscode-test}"

if [[ -d "$VSCODE_DIR" ]]; then
  echo
  echo "Verificando bibliotecas ainda ausentes..."

  jobs="${JOBS:-$(nproc 2>/dev/null || echo 2)}"
  (( jobs > 8 )) && jobs=8
  (( jobs < 1 )) && jobs=1

  missing="$({
    find "$VSCODE_DIR" -type f \
      \( -perm /111 -o -name '*.so' -o -name '*.so.*' -o -name '*.node' \) \
      -print0 2>/dev/null |
      xargs -0 -r -n 32 -P "$jobs" bash -c '
        for executable do
          if LC_ALL=C file -Lb -- "$executable" 2>/dev/null | grep -q "^ELF "; then
            while IFS= read -r line; do
              printf "%s: %s\n" "$executable" "$line"
            done < <(LC_ALL=C ldd "$executable" 2>/dev/null | grep -F "not found" || true)
          fi
        done
      ' _
  } | sort -u)"

  if [[ -n "$missing" ]]; then
    echo "Ainda existem bibliotecas ausentes:"
    printf '%s\n' "$missing"
    exit 2
  fi

  echo "Nenhuma biblioteca ausente foi encontrada."
fi
