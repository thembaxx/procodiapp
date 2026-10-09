#!/usr/bin/env bash
set -euo pipefail

# Fixed releases and checksums: do not execute an unverified downloaded scanner.
case "${1:-}" in
  secrets)
    security_tool=gitleaks
    security_archive=gitleaks_8.30.1_linux_x64.tar.gz
    security_url="https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/${security_archive}"
    security_sha=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
    ;;
  workflows)
    security_tool=actionlint
    security_archive=actionlint_1.7.12_linux_amd64.tar.gz
    security_url="https://github.com/rhysd/actionlint/releases/download/v1.7.12/${security_archive}"
    security_sha=8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8
    ;;
  *) echo "Usage: bash scripts/check-security.sh secrets|workflows" >&2; exit 2 ;;
esac
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo "This pinned CI installer supports Linux x86_64. Use your platform's scanner locally." >&2
  exit 2
fi
security_temp=$(mktemp -d)
trap 'rm -rf "$security_temp"' EXIT
curl --fail --silent --show-error --location --retry 3 --connect-timeout 10 --max-time 90 \
  "$security_url" --output "$security_temp/$security_archive"
echo "$security_sha  $security_temp/$security_archive" | sha256sum --check --status
tar -xzf "$security_temp/$security_archive" -C "$security_temp" "$security_tool"
if [[ "$security_tool" == gitleaks ]]; then
  "$security_temp/gitleaks" git --redact --no-banner .
else
  "$security_temp/actionlint" -color
fi
