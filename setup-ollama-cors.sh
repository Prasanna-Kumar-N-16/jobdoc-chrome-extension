#!/bin/bash
# setup-ollama-cors.sh
# Permanently configures Ollama to accept Chrome extension requests
# Run once: bash setup-ollama-cors.sh

set -e

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AI Job Applicant — Ollama CORS Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Detect OS ────────────────────────────────────────────────────────────────
OS="$(uname -s)"

if [[ "$OS" == "Darwin" ]]; then
  echo "✓ Detected: macOS"
  echo ""

  # macOS: Ollama runs as a launchd service — use launchctl setenv
  echo "► Setting OLLAMA_ORIGINS via launchctl (persists across reboots)..."
  launchctl setenv OLLAMA_ORIGINS "*"
  echo "✓ Done"
  echo ""

  # Also write to shell profiles so 'ollama serve' in terminal works too
  for PROFILE in ~/.zshrc ~/.bash_profile ~/.bashrc; do
    if [[ -f "$PROFILE" ]]; then
      if ! grep -q "OLLAMA_ORIGINS" "$PROFILE"; then
        echo 'export OLLAMA_ORIGINS="*"' >> "$PROFILE"
        echo "✓ Added to $PROFILE"
      else
        echo "✓ Already in $PROFILE (skipped)"
      fi
    fi
  done

  echo ""
  echo "► Restarting Ollama..."
  # Kill existing Ollama processes
  pkill -x "Ollama" 2>/dev/null || true
  pkill -f "ollama serve" 2>/dev/null || true
  sleep 2

  # Reopen the Ollama app if it exists
  if [[ -d "/Applications/Ollama.app" ]]; then
    open /Applications/Ollama.app
    echo "✓ Ollama app restarted"
  else
    # Start ollama serve in background
    OLLAMA_ORIGINS="*" ollama serve &>/tmp/ollama.log &
    echo "✓ ollama serve started in background (logs: /tmp/ollama.log)"
  fi

elif [[ "$OS" == "Linux" ]]; then
  echo "✓ Detected: Linux"
  echo ""

  # Check if running as systemd service
  if systemctl is-active --quiet ollama 2>/dev/null; then
    echo "► Ollama is running as a systemd service. Updating service config..."
    SERVICE_FILE="/etc/systemd/system/ollama.service"
    OVERRIDE_DIR="/etc/systemd/system/ollama.service.d"
    OVERRIDE_FILE="$OVERRIDE_DIR/cors.conf"

    if [[ -f "$SERVICE_FILE" ]] || systemctl cat ollama &>/dev/null; then
      sudo mkdir -p "$OVERRIDE_DIR"
      sudo tee "$OVERRIDE_FILE" > /dev/null << 'SYSTEMD'
[Service]
Environment="OLLAMA_ORIGINS=*"
SYSTEMD
      echo "✓ Created systemd override at $OVERRIDE_FILE"
      sudo systemctl daemon-reload
      sudo systemctl restart ollama
      echo "✓ Ollama service restarted"
    fi
  else
    echo "► Ollama not running as systemd service. Adding to shell profile..."
    for PROFILE in ~/.bashrc ~/.zshrc ~/.profile; do
      if [[ -f "$PROFILE" ]]; then
        if ! grep -q "OLLAMA_ORIGINS" "$PROFILE"; then
          echo 'export OLLAMA_ORIGINS="*"' >> "$PROFILE"
          echo "✓ Added to $PROFILE"
        else
          echo "✓ Already in $PROFILE (skipped)"
        fi
      fi
    done

    echo ""
    echo "► Starting Ollama with CORS enabled..."
    pkill -f "ollama serve" 2>/dev/null || true
    sleep 1
    OLLAMA_ORIGINS="*" ollama serve &>/tmp/ollama.log &
    echo "✓ ollama serve started (logs: /tmp/ollama.log)"
  fi

else
  echo "✗ Unsupported OS: $OS"
  echo "  Manually set: export OLLAMA_ORIGINS=\"*\""
  exit 1
fi

# ── Verify ───────────────────────────────────────────────────────────────────
echo ""
echo "► Verifying Ollama is up..."
sleep 3

MAX_RETRIES=10
for i in $(seq 1 $MAX_RETRIES); do
  if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✓ Ollama is running!"
    break
  fi
  if [[ $i -eq $MAX_RETRIES ]]; then
    echo "⚠ Ollama not responding yet — it may still be starting up."
    echo "  Wait a few seconds and try the extension again."
  else
    printf "  Waiting... (%d/%d)\r" $i $MAX_RETRIES
    sleep 1
  fi
done

# ── Test CORS ────────────────────────────────────────────────────────────────
echo ""
echo "► Testing CORS with Chrome extension origin..."
CORS_TEST=$(curl -s -o /dev/null -w "%{http_code}" \
  -X OPTIONS http://localhost:11434/api/tags \
  -H "Origin: chrome-extension://test" \
  -H "Access-Control-Request-Method: POST" 2>/dev/null)

if [[ "$CORS_TEST" == "204" ]] || [[ "$CORS_TEST" == "200" ]]; then
  echo "✓ CORS is working! Chrome extension requests are now allowed."
else
  echo "⚠ CORS test returned HTTP $CORS_TEST"
  echo "  If the extension still fails, restart Ollama manually:"
  echo "  OLLAMA_ORIGINS=\"*\" ollama serve"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup complete! Go back to Chrome and"
echo "  reload the extension, then try again."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
